#!/bin/sh
# tools/build.sh: test Havre and take its screenshots, in place. ventures/havre/ on the gh-pages branch of
# teahubxyz/time is both the source and the site, so this runs on the factory: Actions -> refresh, slug havre (with
# `from` set to a branch to land a rework whole). Locally: sh tools/build.sh, from anywhere.
#
# Needs node 20+, and Chrome or Chromium for the browser check (CHROME, with CHROME_FLAGS such as --no-sandbox when
# running as root; else Playwright's own). Playwright itself: PW_MODULE if set, else the copy the refresh workflow's
# Chromium install left in npx's cache, else playwright-core from npm.
set -eu
cd "$(dirname "$0")/.."

# files from earlier versions of the site that this one doesn't serve: a commit can add files but never remove them,
# so the build does. (c/ is this version's: the pages of the harbor's own, which tools/pages.mjs writes. Keep it off
# this list.)
rm -rf art fonts tools/paint.py tools/draw.py tools/vendor tests/smoke.py

# what agents look for stays: .well-known/ (the skills index) and robots.txt are served as they are, so the build
# never clears them, and fails if they're gone
for f in .well-known/skills/index.json robots.txt; do
  [ -f "$f" ] || { echo "tools/build.sh: $f is missing: agents look for it" >&2; exit 1; }
done

node tools/cast.mjs          # cast/index.js, the harbor's own as the module the page imports, from cast/*.havre.json
node tools/pages.mjs         # c/ (a page and a V3 card for each of them, and the list) and sitemap.txt, from the same cards
node --test tests/*.test.mjs
sh tools/open.sh            # open/, openvenice at /open/ for testing

if [ -z "${PW_MODULE:-}" ]; then
  PW_MODULE=$(find "${HOME:-/root}/.npm/_npx" -path '*/node_modules/playwright-core/index.mjs' 2>/dev/null | head -1 || true)
fi
if [ -z "$PW_MODULE" ]; then
  pw=$(mktemp -d)
  npm install --silent --no-save --no-package-lock --no-audit --no-fund --prefix "$pw" playwright-core@1.55.0 >/dev/null
  PW_MODULE=$pw/node_modules/playwright-core/index.mjs
fi
export PW_MODULE
echo "playwright: $PW_MODULE"

shots=$(mktemp -d)
node tests/smoke.mjs --shots "$shots"
mkdir -p shots
cp "$shots/desktop.png" "$shots/og.png" shots/      # the two the site serves: the ledger's picture and the share card
rm -rf "$shots"
ls -l shots
