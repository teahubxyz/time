#!/bin/sh
# Checks the Whop build: builds it, verifies the checksum, unzips it, serves it the way a static host does
# (real files and a directory's index.html first, 404.html for anything else) and requests the view paths.
#
#   sh ventures/mdecks/tools/whop-check.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

sh "$here/whop-build.sh" "$work/out"
(cd "$work/out" && sha256sum -c mdeck-whop.zip.sha256)
python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$work/out/mdeck-whop.zip" "$work/site"

SITE="$work/site" python3 - <<'PY'
import http.server, os, threading, urllib.request, urllib.error

site = os.environ["SITE"]

class Static(http.server.SimpleHTTPRequestHandler):
    """A static host: a real file, or a directory's index.html; anything else gets 404.html with a 404."""
    def __init__(self, *a, **k):
        super().__init__(*a, directory=site, **k)
    def do_GET(self):
        bare = self.path.split("?")[0]
        path = self.translate_path(bare)
        if os.path.isdir(path) and not bare.endswith("/"):
            return super().do_GET()  # redirect to the slash form
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if os.path.isfile(path):
            return super().do_GET()
        with open(os.path.join(site, "404.html"), "rb") as f:
            body = f.read()
        self.send_response(404)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Static)
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = "http://127.0.0.1:%d" % srv.server_port

def get(path):
    try:
        r = urllib.request.urlopen(base + path)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

failed = 0
for path in ["/experiences/abc", "/experiences/abc/", "/experiences/a/b/c", "/dashboard/xyz", "/dashboard/xyz/",
             "/experiences/", "/dashboard/", "/experiences", "/dashboard"]:
    status, body = get(path)
    ok = 'id="src"' in body and 'src="/app.js"' in body and 'src="/whop.js"' in body
    print("%-22s %s serves the app: %s" % (path, status, "yes" if ok else "NO"))
    failed += not ok

for path, needle in [("/app.js", 'fetch("/SKILL.md")'), ("/whop.js", "data-view"), ("/SKILL.md", "mdeck")]:
    status, body = get(path)
    ok = status == 200 and needle in body
    print("%-22s %s asset ok: %s" % (path, status, "yes" if ok else "NO"))
    failed += not ok

status, body = get("/experiences/abc")
for gone in ("Get early access", "Opens a public GitHub issue", "Pricing", "How it works"):
    if gone in body:
        print("public-page content left in the app: " + gone)
        failed += 1
if 'id="agent"' not in body:
    print("agent button missing")
    failed += 1

raise SystemExit(1 if failed else 0)
PY
echo "whop build ok"
