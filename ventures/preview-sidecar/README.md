# preview-sidecar

A dependency-free localhost port watcher: it notices when you start a dev
server, opens a preview pane pointed at it, and can stamp a timestamped
screenshot receipt of what was actually on screen.

Inspired by [anthropics/claude-code#53997](https://github.com/anthropics/claude-code/issues/53997)
("Bring back local preview for agent-built apps"), closed as not planned.
This does not modify Claude Code or any agent CLI. It is a standalone
sidecar: a Python script you run next to whatever started the dev server.

## Problem

An agent (or you) runs `npm run dev`, it binds `localhost:5173`, and nothing
shows you that it's there. You tab-hunt for the port, open it by hand, and if
you want proof of what rendered, you take a screenshot yourself. This watches
a bounded list of common dev ports, opens a preview the moment one answers,
and gives you a one-command way to capture dated evidence of what it showed.

## Install

Requires Python 3.9+. No dependencies, no install step — copy `sidecar.py`
anywhere. The `screenshot` command additionally needs a Chromium-family
browser (Chrome, Chromium, or Edge) already installed on the machine; it is
not bundled.

```sh
# From the notplanned checkout:
python3 ventures/preview-sidecar/demo.py
python3 -m unittest discover -s ventures/preview-sidecar -p 'test_*.py' -v
```

For your own project, copy `sidecar.py` to a trusted location and run it
from there, e.g. alongside `npm run dev`.

## Usage

```sh
# Watch the default common dev ports (3000, 5173, 8080, ...) and auto-open a
# preview pane the moment one starts answering.
python3 sidecar.py watch

# Watch specific ports or a range instead.
python3 sidecar.py watch --ports 3000,5173
python3 sidecar.py watch --port-range 3000-3010

# One-click screenshot receipt of whatever is on a port right now: a dated
# PNG plus a JSON sidecar (url, timestamp, sha256, browser used).
python3 sidecar.py screenshot --port 3000

# Manually open a preview pane for a port without waiting for detection.
python3 sidecar.py preview --port 3000
```

`watch` polls candidate ports with a plain TCP connect (no `lsof`/`netstat`
dependency). The first time a port starts answering, it writes a small local
HTML file with an iframe pointed at `http://127.0.0.1:<port>` and opens it in
your default browser (`--no-open` to just log the event instead), plus
appends a JSON line to `events.jsonl` in `--out` so detections are
inspectable after the fact.

`screenshot` launches the browser headless, saves `receipt-<port>-<time>.png`
and a matching `.json` receipt, and prints the receipt. See
[`demo-receipt.png`](demo-receipt.png) / [`demo-receipt.json`](demo-receipt.json)
for a real example produced by `demo.py`.

## Recorded dogfood

`demo.py` starts a throwaway one-page site, runs `sidecar.py watch` against
it (no browser opened, so it's safe to run unattended), confirms the
detection event and preview file, then runs `sidecar.py screenshot` with a
real headless Chrome and verifies the PNG and its sha256. No mocks.
[Recorded output](demo.txt).

The demo's throwaway server runs as an in-process thread rather than a
`python -m http.server` subprocess. This repo is itself built and tested
inside Claude Code's own sandboxed Bash tool, which puts a freshly spawned
subprocess's listening socket in a network namespace its own parent can't
reach back into — a property of *this* build environment, not of normal
terminals. A thread-based listener sidesteps that quirk so the demo can still
exercise the real detect → preview → screenshot path end to end, including a
real TCP probe from a separate process and a real headless-Chrome screenshot.
On an ordinary dev machine, `npm run dev` / `vite` / etc. are plain reachable
subprocesses and this workaround doesn't apply.

## Limits and trust

- Detection is TCP-connect probing of a bounded candidate port list (default
  15 common dev ports, or an explicit `--ports`/`--port-range` up to 200
  ports), not a system-wide socket enumeration. It cannot see which process
  owns a port — "something answered a connect" is the whole signal. A
  non-HTTP service on a watched port will still trigger a preview attempt.
- Polling has a detection delay (`--interval`, default 2s) and will miss a
  port that opens and closes between polls.
- The preview iframe can be blocked by a dev server's own
  `X-Frame-Options`/CSP; the generated preview page always includes a plain
  "open in new tab" link as a fallback.
- `screenshot` requires a Chromium-family browser found via `--chrome`,
  `CHROME_PATH`, or a short list of common install paths. No browser means a
  clear error, not a silent skip.
- Loopback (`127.0.0.1`) only by default. No remote tunneling, no ngrok-style
  exposure, no orchestration of multiple dev servers — one detected port
  gets one preview and, on request, one screenshot.
- `watch` is a foreground poll loop; background it yourself (`&`, tmux,
  `nohup`, a launchd/systemd unit) if you want it to persist. There is no
  daemon manager here.
- Nothing is uploaded anywhere. Screenshots and events stay in `--out`
  (default a `preview-sidecar` directory under the OS temp dir) until you
  move or delete them.
