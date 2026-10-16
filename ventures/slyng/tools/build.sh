#!/bin/sh
# tools/build.sh: SLYNG's made files, made in place: the tests, branding/img/ (brought back from the live site and
# checked against its MANIFEST, see tools/brand/restore.sh), then shots/desktop.png and shots/og.png.
#
# Time's refresh workflow runs this on the runner (teahubxyz/time, Actions -> refresh, slug slyng); it runs anywhere
# else too. Needs node 22+, curl, and Chrome or Chromium: set CHROME=/path/to/chrome if it isn't found, and
# CHROME_FLAGS=--no-sandbox when running as root. The fuller check is tests/smoke.py (Playwright), run by hand.
set -eu
cd "$(dirname "$0")/.."

node --test tests/*.test.js
sh tools/brand/restore.sh

CHROME=${CHROME:-}
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$(command -v chromium || true)" \
         "$(command -v chromium-browser || true)" "$(command -v google-chrome || true)" "$(command -v google-chrome-stable || true)"; do
  if [ -z "$CHROME" ] && [ -n "$c" ] && [ -x "$c" ]; then CHROME=$c; fi
done
[ -n "$CHROME" ] || { echo "no Chrome or Chromium found; set CHROME" >&2; exit 1; }

PORT=${PORT:-8793}
node tools/serve.mjs "$PORT" . >/dev/null 2>&1 </dev/null &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT INT TERM
n=0
until curl -fs -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; do
  n=$((n + 1)); [ "$n" -lt 40 ] || { echo "the local server on port $PORT never answered" >&2; exit 1; }; sleep 0.5
done

shot() {   # shot OUT.png [chrome args] URL
  out=$1; shift
  prof=$(mktemp -d)
  rm -f "$out"
  # shellcheck disable=SC2086
  "$CHROME" --headless=new --hide-scrollbars --no-first-run --no-default-browser-check --disable-background-networking \
    --disable-component-update --user-data-dir="$prof" --virtual-time-budget=6000 --screenshot="$out" \
    ${CHROME_FLAGS:-} "$@" >"$prof.log" 2>&1 &
  pid=$!
  n=0
  while kill -0 "$pid" 2>/dev/null && [ ! -s "$out" ]; do   # some Chromes write the shot and never exit
    n=$((n + 1)); [ "$n" -lt 120 ] || break; sleep 0.5
  done
  sleep 1
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  [ -s "$out" ] || { echo "Chrome made no screenshot for $out:" >&2; tail -5 "$prof.log" >&2; exit 1; }
  rm -rf "$prof" "$prof.log"
}
mkdir -p shots
shot "$PWD/shots/desktop.png" --window-size=1440,900 "http://127.0.0.1:$PORT/"
shot "$PWD/shots/og.png" --window-size=1200,630 "http://127.0.0.1:$PORT/tools/og.html"
echo "built: tests passed, branding/img restored, shots/desktop.png and shots/og.png"
