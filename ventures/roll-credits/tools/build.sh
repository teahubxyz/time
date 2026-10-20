#!/bin/sh
# tools/build.sh: shots/desktop.png, the first screen at 1440x900, rendered from this folder by headless Chrome.
# Time's refresh workflow runs this (Actions -> refresh, slug roll-credits). Needs python3 (for a local server) and
# Chrome or Chromium: set CHROME=/path/to/chrome if it isn't found, and CHROME_FLAGS=--no-sandbox when running as root.
set -eu
cd "$(dirname "$0")/.."

CHROME=${CHROME:-}
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$(command -v chromium || true)" \
         "$(command -v chromium-browser || true)" "$(command -v google-chrome || true)" "$(command -v google-chrome-stable || true)"; do
  if [ -z "$CHROME" ] && [ -n "$c" ] && [ -x "$c" ]; then CHROME=$c; fi
done
[ -n "$CHROME" ] || { echo "no Chrome or Chromium found; set CHROME" >&2; exit 1; }

PORT=${PORT:-8795}
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 </dev/null &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT INT TERM
n=0
until curl -fs -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; do
  n=$((n + 1)); [ "$n" -lt 40 ] || { echo "the local server on port $PORT never answered" >&2; exit 1; }; sleep 0.5
done

mkdir -p shots
out=$PWD/shots/desktop.png
prof=$(mktemp -d)
rm -f "$out"
# shellcheck disable=SC2086
"$CHROME" --headless=new --hide-scrollbars --no-first-run --no-default-browser-check --disable-background-networking \
  --disable-component-update --user-data-dir="$prof" --virtual-time-budget=6000 --window-size=1440,900 \
  --screenshot="$out" ${CHROME_FLAGS:-} "http://127.0.0.1:$PORT/" >"$prof.log" 2>&1 &
pid=$!
n=0
while kill -0 "$pid" 2>/dev/null && [ ! -s "$out" ]; do n=$((n + 1)); [ "$n" -lt 120 ] || break; sleep 0.5; done
sleep 1
kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true
[ -s "$out" ] || { echo "Chrome made no screenshot:" >&2; tail -5 "$prof.log" >&2; exit 1; }
rm -rf "$prof" "$prof.log"
echo "built: shots/desktop.png"
