#!/usr/bin/env python3
"""SLYNG in Chromium (Playwright), desktop and phone.

Demo: a mouse sling, a touch sling, a keyboard sling, a note on its own, and a link an agent made.
Live, against tools/devnet.mjs (a local relay with AUTH, a lightning address server and a wallet): alice slings
bob 210 sats and a note; bob catches both; alice sees the zap receipt come back as caught.

    python3 tests/smoke.py [--shots DIR] [--extra DIR]   DIR gets desktop.png and phone.png; --extra the live ones

Needs node 20+ and the playwright package with Chromium.
"""
import argparse, functools, http.server, json, os, socketserver, subprocess, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT

DRAG_POINTS = """(a) => {
  const svg = document.getElementById('sling');
  const r = svg.getBoundingClientRect();
  const s = r.width / 420;
  const R = { x: r.left + 210 * s, y: r.top + (300 - 34) * s };
  const t = [...svg.querySelectorAll('.target')].find((g) => g.querySelector('.target-name').textContent === a.name);
  if (!t) return null;
  const m = /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(t.getAttribute('transform'));
  const dx = Number(m[1]) - 210, dy = Number(m[2]) - 300, d = Math.hypot(dx, dy);
  const rr = (22 + (96 * a.detent) / 8 + 1) * s;
  return { sx: R.x, sy: R.y, ex: R.x - (dx / d) * rr, ey: R.y - (dy / d) * rr };
}"""

WEBLN = """(ln) => {
  window.paid = [];
  window.webln = {
    enable: async () => {},
    getInfo: async () => ({ node: { alias: 'Test wallet' } }),
    sendPayment: async (pr) => {
      const r = await fetch(ln + '/settle?pr=' + encodeURIComponent(pr));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'payment failed');
      window.paid.push(pr);
      return { preimage: j.preimage };
    },
  };
}"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(Quiet, directory=str(directory))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


def drag(page, name, detent, touch=False):
    pts = page.evaluate(DRAG_POINTS, {"name": name, "detent": detent})
    assert pts, f"{name} is not on the fence"
    if touch:
        cdp = page.context.new_cdp_session(page)
        def ev(kind, x, y):
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [] if kind == "touchEnd" else [{"x": x, "y": y}]})
        ev("touchStart", pts["sx"], pts["sy"])
        for i in range(1, 11):
            ev("touchMove", pts["sx"] + (pts["ex"] - pts["sx"]) * i / 10, pts["sy"] + (pts["ey"] - pts["sy"]) * i / 10)
            page.wait_for_timeout(16)
        ev("touchEnd", 0, 0)
    else:
        page.mouse.move(pts["sx"], pts["sy"])
        page.mouse.down()
        page.mouse.move(pts["ex"], pts["ey"], steps=10)
        page.wait_for_timeout(60)
        page.mouse.up()


def watch(page, errors, label):
    page.on("pageerror", lambda e: errors.append(f"[{label}] {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"[{label}] console: {m.text}"))


def ready(page):
    page.wait_for_selector("html[data-ready=true]", timeout=15000)
    page.evaluate("document.fonts.ready")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default=None, help="a folder for desktop.png and phone.png (default: none)")
    ap.add_argument("--extra", default=None, help="a folder for the live screenshots (bob catching, alice slinging)")
    args = ap.parse_args()
    shots = Path(args.shots) if args.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)

    devnet = subprocess.Popen(["node", str(ROOT / "tools" / "devnet.mjs"), "--auth"], stdout=subprocess.PIPE, text=True)
    net = json.loads(devnet.stdout.readline())
    httpd, base = serve(SITE)
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-sandbox"])

            # ---- demo, desktop
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            watch(page, errors, "desktop")
            page.goto(base + "/")
            ready(page)
            page.wait_for_timeout(250)
            if shots:
                page.screenshot(path=str(shots / "desktop.png"))
            expect(page.locator("#amt")).to_have_text("Pull back to sling")
            drag(page, "ben", 5)
            expect(page.locator("#amt")).to_have_text("Slung", timeout=4000)
            expect(page.locator("#sub")).to_contain_text("2,100 sats to ben")
            expect(page.locator("#wallet")).to_have_text("18,900 demo sats")
            expect(page.locator("#caught .entry")).to_have_count(1, timeout=4000)
            expect(page.locator("#caught .entry").first).to_contain_text("ben slung you a note")
            # a note on its own, to dev, who has no lightning address
            page.fill("#note", "see you at the market")
            drag(page, "dev", 3)
            expect(page.locator("#amt")).to_have_text("Notes only")
            page.wait_for_timeout(400)
            drag(page, "dev", 0)
            expect(page.locator("#amt")).to_have_text("Slung", timeout=4000)
            page.click("#t-slung")
            expect(page.locator("#slung .entry")).to_have_count(2)
            expect(page.locator("#slung .entry").first).to_contain_text("see you at the market")
            # keyboard: aim at ana with the arrows, pull back three rings, let go
            page.focus("#sling")
            for _ in range(4):
                page.keyboard.press("ArrowDown")
            expect(page.locator("#amt")).to_have_text("210 sats")
            expect(page.locator("#sub")).to_have_text("to ana")
            page.keyboard.press("Enter")
            expect(page.locator("#amt")).to_have_text("Slung", timeout=4000)
            # catch it back
            page.focus("#sling")
            page.keyboard.press("ArrowRight")
            for _ in range(2):
                page.keyboard.press("ArrowDown")
            page.keyboard.press("Enter")
            page.click("#catchback")
            expect(page.locator("#amt")).to_have_text("Caught it back", timeout=3000)
            expect(page.locator("#slung .entry")).to_have_count(3)
            ctx.close()

            # ---- demo, phone, with a touch sling and a link an agent made
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            watch(page, errors, "phone")
            page.goto(base + "/")
            ready(page)
            page.wait_for_timeout(250)
            if shots:
                page.screenshot(path=str(shots / "phone.png"))
            drag(page, "cass", 4, touch=True)
            expect(page.locator("#amt")).to_have_text("Slung", timeout=4000)
            expect(page.locator("#sub")).to_contain_text("1,000 sats to cass")
            page.goto(base + f"/#to={net['people']['bob']['npub']}&sats=2500&note=for%20the%20records")
            page.reload()
            ready(page)
            expect(page.locator("#aimed")).to_contain_text("2,100 sats")
            expect(page.locator("#note")).to_have_value("for the records")
            assert page.locator(".target-name").first.text_content().startswith("npub1"), "the linked person stands first on the fence"
            assert page.locator("#sling.suggesting").count() == 1
            ctx.close()

            # ---- live: alice slings bob 210 sats and a note; bob catches both
            live = f"{base}/?relays={net['relay']}&flight=500"
            bob_ctx = browser.new_context(viewport={"width": 1280, "height": 860})
            bob_ctx.add_init_script(f"sessionStorage.setItem('slyng.account', JSON.stringify({{type: 'local', sk: '{net['people']['bob']['sk']}'}}))")
            bob = bob_ctx.new_page()
            watch(bob, errors, "bob")
            bob.goto(live)
            ready(bob)
            expect(bob.locator("#account")).to_have_text("bob", timeout=10000)

            ctx = browser.new_context(viewport={"width": 1280, "height": 860})
            ctx.add_init_script(f"sessionStorage.setItem('slyng.account', JSON.stringify({{type: 'local', sk: '{net['people']['alice']['sk']}'}}))")
            ctx.add_init_script(f"({WEBLN})('{net['ln']}')")
            alice = ctx.new_page()
            watch(alice, errors, "alice")
            alice.goto(live)
            ready(alice)
            expect(alice.locator("#account")).to_have_text("alice", timeout=10000)
            expect(alice.locator(".target-name", has_text="bob")).to_have_count(1, timeout=10000)
            expect(alice.locator(".target-name", has_text="carol")).to_have_count(1)
            alice.click("#wallet")
            alice.click("#wal-webln")
            expect(alice.locator("#wallet")).to_have_text("Test wallet", timeout=5000)
            alice.fill("#note", "for the records")
            drag(alice, "bob", 3)
            expect(alice.locator("#amt")).to_have_text("Slung", timeout=10000)
            expect(alice.locator("#sub")).to_have_text("210 sats and a note to bob.")
            assert alice.evaluate("window.paid.length") == 1
            alice.click("#t-slung")
            expect(alice.locator("#slung .entry").first).to_contain_text("Caught", timeout=10000)

            expect(bob.locator("#caught .entry")).to_have_count(2, timeout=10000)
            expect(bob.locator("#caught")).to_contain_text("alice slung you 210 sats")
            expect(bob.locator("#caught")).to_contain_text("for the records")
            # carol has no lightning address: sats are refused before anything flies
            drag(alice, "carol", 4)
            expect(alice.locator("#amt")).to_have_text("Notes only")
            if args.extra:
                Path(args.extra).mkdir(parents=True, exist_ok=True)
                bob.screenshot(path=str(Path(args.extra) / "bob.png"))
                alice.screenshot(path=str(Path(args.extra) / "alice.png"))
            ctx.close()
            bob_ctx.close()
            browser.close()
    finally:
        httpd.shutdown()
        devnet.terminate()
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print("smoke: demo (mouse, touch, keyboard, note, catch back, agent link) and live (zap + note via devnet) all landed")


if __name__ == "__main__":
    main()
