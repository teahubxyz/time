#!/usr/bin/env python3
"""preview-sidecar: detect a newly bound local dev-server port, open a preview
pane for it, and capture a timestamped screenshot receipt on demand.

Standalone, stdlib-only. No agent/Claude Code modification, no network calls
beyond probing 127.0.0.1, no remote tunneling.
"""
import argparse
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_PORTS = [3000, 3001, 3333, 4000, 4200, 5000, 5173, 5174, 5500,
                 6006, 8000, 8080, 8081, 8888, 9000]
MAX_PORTS = 200
CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
    "microsoft-edge",
]


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_stamp():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def parse_ports(ports_arg, range_arg):
    """Build a bounded, deduped, sorted candidate port list from CLI args."""
    ports = set()
    if ports_arg:
        for chunk in ports_arg.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            port = int(chunk)
            if not (1 <= port <= 65535):
                raise ValueError(f"port out of range: {port}")
            ports.add(port)
    if range_arg:
        lo, _, hi = range_arg.partition("-")
        lo, hi = int(lo), int(hi)
        if not (1 <= lo <= hi <= 65535):
            raise ValueError(f"bad port range: {range_arg}")
        if hi - lo + 1 > MAX_PORTS:
            raise ValueError(f"port range too wide (max {MAX_PORTS} ports)")
        ports.update(range(lo, hi + 1))
    if not ports_arg and not range_arg:
        ports.update(DEFAULT_PORTS)
    if len(ports) > MAX_PORTS:
        raise ValueError(f"too many candidate ports (max {MAX_PORTS})")
    return sorted(ports)


def probe_port(host, port, timeout=0.3):
    """True if a TCP connect to host:port succeeds right now."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        return sock.connect_ex((host, port)) == 0
    except OSError:
        return False
    finally:
        sock.close()


def scan_open_ports(host, ports, timeout=0.3):
    return {port for port in ports if probe_port(host, port, timeout)}


def diff_new(previous, current):
    return current - previous


def render_preview_html(host, port, detected_at):
    url = f"http://{host}:{port}"
    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<title>preview-sidecar: {host}:{port}</title>
<style>
html,body{{margin:0;height:100%;font-family:ui-monospace,Menlo,monospace}}
.bar{{display:flex;gap:12px;align-items:center;padding:8px 12px;background:#111;color:#eee;font-size:13px}}
.bar a{{color:#9fd;text-decoration:none}}
iframe{{display:block;width:100%;height:calc(100% - 37px);border:0}}
</style></head>
<body>
<div class="bar">
  <strong>preview-sidecar</strong>
  <span>detected {host}:{port} at {detected_at}</span>
  <a href="{url}" target="_blank" rel="noopener">open in new tab</a>
  <span>(if the frame below is blank, the dev server set X-Frame-Options/CSP — use the link)</span>
</div>
<iframe src="{url}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
</body></html>
"""


def write_preview(out_dir, host, port):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    detected_at = now_iso()
    path = out_dir / f"preview-{port}-{now_stamp()}.html"
    path.write_text(render_preview_html(host, port, detected_at))
    return path, detected_at


def append_event(out_dir, event):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "events.jsonl").open("a") as f:
        f.write(json.dumps(event) + "\n")


def find_chrome(explicit=None):
    if explicit:
        return explicit if shutil.which(explicit) or os.path.exists(explicit) else None
    env = os.environ.get("CHROME_PATH")
    if env and (os.path.exists(env) or shutil.which(env)):
        return env
    for candidate in CHROME_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    return None


def cmd_watch(args):
    host = args.host
    ports = parse_ports(args.ports, args.port_range)
    out_dir = Path(args.out)
    print(f"[preview-sidecar] watching {len(ports)} candidate ports on {host} "
          f"every {args.interval}s: {ports}")
    seen = set()
    cycles = 0
    try:
        while args.max_cycles is None or cycles < args.max_cycles:
            current = scan_open_ports(host, ports, args.timeout)
            for port in sorted(diff_new(seen, current)):
                path, detected_at = write_preview(out_dir, host, port)
                append_event(out_dir, {"event": "detected", "host": host,
                                        "port": port, "at": detected_at,
                                        "preview": str(path)})
                print(f"[preview-sidecar] detected {host}:{port} at {detected_at} "
                      f"-> {path}")
                if not args.no_open:
                    webbrowser.open(f"file://{path.resolve()}")
            for port in sorted(seen - current):
                print(f"[preview-sidecar] {host}:{port} no longer responding")
            seen = current
            cycles += 1
            if args.max_cycles is None or cycles < args.max_cycles:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("[preview-sidecar] stopped")
    return 0


def cmd_preview(args):
    if not probe_port(args.host, args.port, args.timeout):
        print(f"[preview-sidecar] nothing answered {args.host}:{args.port}", file=sys.stderr)
        return 1
    path, detected_at = write_preview(args.out, args.host, args.port)
    print(f"[preview-sidecar] preview for {args.host}:{args.port} -> {path}")
    if not args.no_open:
        webbrowser.open(f"file://{path.resolve()}")
    return 0


def make_receipt(host, port, out_dir, chrome_path, timeout):
    if not probe_port(host, port, 0.5):
        raise RuntimeError(f"nothing answered {host}:{port}")
    chrome = find_chrome(chrome_path)
    if not chrome:
        raise RuntimeError(
            "no Chromium-family browser found; pass --chrome or set CHROME_PATH")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = now_stamp()
    png_path = out_dir / f"receipt-{port}-{stamp}.png"
    url = f"http://{host}:{port}"
    argv = [chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--window-size=1280,900", f"--screenshot={png_path}", url]
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0 or not png_path.exists():
        raise RuntimeError(
            f"screenshot failed (exit {result.returncode}): {result.stderr.strip()[:400]}")
    data = png_path.read_bytes()
    if len(data) == 0:
        raise RuntimeError("screenshot produced an empty file")
    receipt = {
        "url": url,
        "host": host,
        "port": port,
        "captured_at": now_iso(),
        "chrome": chrome,
        "png": str(png_path),
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
    }
    json_path = out_dir / f"receipt-{port}-{stamp}.json"
    json_path.write_text(json.dumps(receipt, indent=2) + "\n")
    receipt["json"] = str(json_path)
    return receipt


def cmd_screenshot(args):
    try:
        receipt = make_receipt(args.host, args.port, args.out, args.chrome, args.timeout)
    except RuntimeError as exc:
        print(f"[preview-sidecar] {exc}", file=sys.stderr)
        return 1
    print(json.dumps(receipt, indent=2))
    return 0


def build_parser():
    p = argparse.ArgumentParser(prog="sidecar.py", description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    watch = sub.add_parser("watch", help="poll for newly bound local ports and auto-preview them")
    watch.add_argument("--host", default="127.0.0.1")
    watch.add_argument("--ports", default=None, help="comma-separated port list")
    watch.add_argument("--port-range", default=None, help="e.g. 3000-3010")
    watch.add_argument("--interval", type=float, default=2.0)
    watch.add_argument("--timeout", type=float, default=0.3)
    watch.add_argument("--max-cycles", type=int, default=None, help="stop after N poll cycles (default: run until Ctrl+C)")
    watch.add_argument("--out", default=str(Path(tempfile.gettempdir()) / "preview-sidecar"))
    watch.add_argument("--no-open", action="store_true", help="don't launch a browser tab")
    watch.set_defaults(func=cmd_watch)

    preview = sub.add_parser("preview", help="manually open a preview pane for one port right now")
    preview.add_argument("--host", default="127.0.0.1")
    preview.add_argument("--port", type=int, required=True)
    preview.add_argument("--timeout", type=float, default=0.3)
    preview.add_argument("--out", default=str(Path(tempfile.gettempdir()) / "preview-sidecar"))
    preview.add_argument("--no-open", action="store_true")
    preview.set_defaults(func=cmd_preview)

    screenshot = sub.add_parser("screenshot", help="capture a timestamped screenshot receipt of one port")
    screenshot.add_argument("--host", default="127.0.0.1")
    screenshot.add_argument("--port", type=int, required=True)
    screenshot.add_argument("--out", default=str(Path(tempfile.gettempdir()) / "preview-sidecar"))
    screenshot.add_argument("--chrome", default=None, help="path to a Chromium-family browser binary")
    screenshot.add_argument("--timeout", type=float, default=20.0)
    screenshot.set_defaults(func=cmd_screenshot)

    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except ValueError as exc:
        print(f"[preview-sidecar] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
