#!/bin/sh
# tools/open.sh: build openvenice (https://github.com/nikshepsvn/openvenice, MIT) into open/, served at /open/.
# Pinned to one commit; bump OV_REF to take a newer one. Run by tools/build.sh. Needs git, node 20+ and npm.
set -eu
cd "$(dirname "$0")/.."
OV_REF=d983874a79810edaffb85721911630af29d09d95
src=$(mktemp -d)
git clone -q https://github.com/nikshepsvn/openvenice "$src"
git -C "$src" checkout -q "$OV_REF"
(cd "$src" && npm ci --silent --no-audit --no-fund >/dev/null && npx vite build --base=/open/ >/dev/null)
rm -rf open
cp -R "$src/dist" open
cat > open/LICENSE.txt <<EOF
openvenice by nikshepsvn, MIT License: https://github.com/nikshepsvn/openvenice
Built into Havre at /open/ from commit $OV_REF, unchanged.
EOF
rm -rf "$src"
echo "open/: openvenice @ $OV_REF ($(find open -type f | wc -l | tr -d ' ') files)"
