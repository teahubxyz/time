#!/bin/sh
# tools/open.sh: build openvenice (https://github.com/nikshepsvn/openvenice, MIT) into open/, served at /open/.
# Pinned to one commit; bump OV_REF to take a newer one. Run by tools/build.sh. Needs git, node 20+ and npm.
set -eu
cd "$(dirname "$0")/.."
OV_REF=d983874a79810edaffb85721911630af29d09d95
src=$(mktemp -d)
git clone -q https://github.com/nikshepsvn/openvenice "$src"
git -C "$src" checkout -q "$OV_REF"
# Phone fixes: a labeled "New chat" button, and no ⌘ shortcut hints below md width
f="$src/src/components/layout/sidebar.tsx"
perl -0pi -e 's/aria-label="New chat"\n(\s*)className="/aria-label="New chat"\n$1className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] border border-white\/[0.12] /' "$f"
perl -0pi -e 's/(<line x1="5" y1="12" x2="19" y2="12" \/><\/svg>)(\n\s*<\/button>\n\s*<\/div>\n\s*\{conversations\.length > 5)/$1<span>New chat<\/span>$2/' "$f"
perl -0pi -e 's/title="New chat \(⌘N\)"/title="New chat"/' "$f"
perl -0pi -e 's/<div className="px-3 py-2\.5 border-t border-white\/\[0\.04\]">(\n\s*<div className="text-\[11px\] text-white\/35 space-y-0\.5">)/<div className="hidden md:block px-3 py-2.5 border-t border-white\/[0.04]">$1/' "$f"
grep -q "<span>New chat</span>" "$f" && grep -q "hidden md:block px-3 py-2.5" "$f"
(cd "$src" && npm ci --silent --no-audit --no-fund >/dev/null && npx vite build --base=/open/ >/dev/null)
rm -rf open
cp -R "$src/dist" open
# Havre's key, handed to openvenice: same origin, so it's only a copy between two storage slots in this browser
cat > open/havre-key.js <<'EOF'
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
EOF
sed -i.bak 's|<head>|<head><script src="/open/havre-key.js"></script>|' open/index.html && rm -f open/index.html.bak
grep -q havre-key.js open/index.html
cat > open/LICENSE.txt <<EOF
openvenice by nikshepsvn, MIT License: https://github.com/nikshepsvn/openvenice
Built into Havre at /open/ from commit $OV_REF, with two small phone fixes (see tools/open.sh).
EOF
rm -rf "$src"
echo "open/: openvenice @ $OV_REF ($(find open -type f | wc -l | tr -d ' ') files)"
