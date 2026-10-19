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
# Havre's key, handed to openvenice: same origin, so it's only a copy between two storage slots in this browser
cat > open/havre-key.js <<'EOF'
(function () {
  try {
    if (sessionStorage.getItem("venice-auth")) return;
    var raw = sessionStorage.getItem("havre.key") || localStorage.getItem("havre.key");
    var key = raw ? JSON.parse(raw) : "";
    if (typeof key === "string" && key) sessionStorage.setItem("venice-auth", key);
  } catch (e) { /* no key then */ }
})();
EOF
sed -i.bak 's|<head>|<head><script src="/open/havre-key.js"></script>|' open/index.html && rm -f open/index.html.bak
grep -q havre-key.js open/index.html
cat > open/LICENSE.txt <<EOF
openvenice by nikshepsvn, MIT License: https://github.com/nikshepsvn/openvenice
Built into Havre at /open/ from commit $OV_REF, unchanged.
EOF
rm -rf "$src"
echo "open/: openvenice @ $OV_REF ($(find open -type f | wc -l | tr -d ' ') files)"
