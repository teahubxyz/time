#!/bin/sh
# Builds the Whop upload for .mdeck: one zip of a static site, and its sha256 next to it.
#
#   ventures/mdecks/tools/whop-build.sh [outdir]      (outdir defaults to ventures/mdecks/dist)
#
# Writes <outdir>/mdeck-whop.zip and <outdir>/mdeck-whop.zip.sha256 (sha256sum format). Nothing is uploaded.
#
# The site is the editor and presenter only (no pricing or marketing sections), served at:
#   /experiences/<experienceId>   member view
#   /dashboard/<companyId>        creator's dashboard view
# A static host resolves a dynamic segment only with a real directory or a rewrite, so the zip ships
# experiences/index.html, dashboard/index.html and a 404.html that are all the same app, with absolute asset
# paths: any /experiences/<anything> or /dashboard/<anything> (however deep) lands on the app.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$here/dist}
mkdir -p "$out"
out=$(cd "$out" && pwd)
zip="$out/mdeck-whop.zip"

HERE="$here" ZIP="$zip" python3 - <<'PY'
import os, re, zipfile

here, target = os.environ["HERE"], os.environ["ZIP"]

def read(name):
    with open(os.path.join(here, name), encoding="utf-8") as f:
        return f.read()

def sub1(pattern, repl, text, flags=0):
    new, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit("whop-build: index.html no longer matches " + repr(pattern))
    return new

# The app page: index.html without the header's early-access note and button, and without everything after the
# editor (how it works, pricing, limits, footer): those belong to the public page.
page = read("index.html")
page = sub1(r'\s*<p class="early-note">.*?</p>', "", page)
page = sub1(r'\s*<a class="cta" href="https://teahub\.xyz[^>]*>Get early access</a>', "", page)
page = sub1(r'(</main>).*?(<script src="app\.js"></script>)', r"\1\n\n\2", page, re.S)
# Absolute paths, so the same file works at any depth; whop.js tells the two views apart.
page = sub1(r'<script src="app\.js"></script>',
            '<script src="/app.js"></script>', page)
page = sub1(r"</title>", "</title>\n<script src=\"/whop.js\"></script>", page)

app = read("app.js")
if 'fetch("SKILL.md")' not in app:
    raise SystemExit("whop-build: app.js no longer fetches SKILL.md")
app = app.replace('fetch("SKILL.md")', 'fetch("/SKILL.md")')

files = {
    "index.html": page,
    "experiences/index.html": page,
    "dashboard/index.html": page,
    "404.html": page,
    "app.js": app,
    "whop.js": read("whop.js"),
    "SKILL.md": read("SKILL.md"),
}

# Same bytes in, same zip out: fixed timestamps, sorted names.
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, files[name].encode("utf-8"))
PY

(cd "$out" && sha256sum mdeck-whop.zip > mdeck-whop.zip.sha256)
echo "built $zip"
cat "$out/mdeck-whop.zip.sha256"
