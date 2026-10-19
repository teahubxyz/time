#!/bin/sh
# tools/open.sh: build Havre's fork of openvenice into open/, served at /open/.
# The fork is upstream openvenice (https://github.com/nikshepsvn/openvenice, MIT) at one pinned commit, plus
# Havre's changes, made by openvenice/havre.py (see openvenice/README.md for how to change them).
# Run by tools/build.sh. Needs git, python3, node 20+ and npm.
set -eu
cd "$(dirname "$0")/.."
OV_REF=d983874a79810edaffb85721911630af29d09d95
src=$(mktemp -d)
git clone -q https://github.com/nikshepsvn/openvenice "$src"
git -C "$src" checkout -q "$OV_REF"
here=$PWD
(cd "$src" && python3 "$here/openvenice/havre.py")
(cd "$src" && npm ci --silent --no-audit --no-fund >/dev/null && npx vite build --base=/open/ >/dev/null)
rm -rf open
cp -R "$src/dist" open
# Havre's key, handed to openvenice: same origin, so it's only a copy between two storage slots in this browser
cat > open/havre-key.js <<'JS'
(function () {
  try {
    var h = localStorage.getItem("havre.handoff"), handed = "";
    if (h) {
      localStorage.removeItem("havre.handoff");
      h = JSON.parse(h);
      if (h && typeof h.key === "string" && Date.now() - h.at < 60000) handed = h.key;
    }
    if (handed) { sessionStorage.setItem("venice-auth", handed); return; }
    if (sessionStorage.getItem("venice-auth")) return;
    var raw = sessionStorage.getItem("havre.key") || localStorage.getItem("havre.key");
    var key = raw ? JSON.parse(raw) : "";
    if (typeof key === "string" && key) sessionStorage.setItem("venice-auth", key);
  } catch (e) { /* no key then */ }
})();
JS
sed -i.bak 's|<head>|<head><script src="/open/havre-key.js"></script>|' open/index.html && rm -f open/index.html.bak
grep -q havre-key.js open/index.html
grep -q theme-boot.js open/index.html
cp openvenice/LICENSE open/LICENSE.txt
cat >> open/LICENSE.txt <<TXT

Built into Havre at /open/ from openvenice commit $OV_REF, with Havre's changes (openvenice/havre.py).
TXT
rm -rf "$src"
echo "open/: openvenice @ $OV_REF + havre.py ($(find open -type f | wc -l | tr -d ' ') files)"
