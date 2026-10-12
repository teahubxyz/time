"""Cloudflare backing for ventures: each venture gets a domain, a Worker, a D1 database and Workers AI.

    python3 .github/time/cloudflare.py check               # what the token can do (doctor)
    python3 .github/time/cloudflare.py deploy <slug> <pages-folder-url>

Off unless CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set. The page stays on GitHub Pages; the Worker
(cloudflare/worker.js, one script `time-<slug>` per venture) serves it under the venture's own domain and adds the API
the page's time.js client calls: share links stored in D1, and a rate-limited small model. With TIME_VENTURE_DOMAIN set
(a zone on the same Cloudflare account) a venture lives at <slug>.<domain>; without it, at the script's workers.dev URL.

Everything here is idempotent: deploying again updates the script in place and reuses the database and the domain.
The deployed revision (REV) is a hash of the worker code and its settings, so the venture loop can redeploy every
venture when Time's update brings a new worker, and leave them alone otherwise.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "https://api.cloudflare.com/client/v4"
HERE = Path(__file__).resolve().parent
WORKER = HERE / "cloudflare" / "worker.js"
CLIENT = HERE / "cloudflare" / "time.js"
COMPAT = "2026-09-01"
AI_MODEL = "@cf/meta/llama-3.1-8b-instruct"


def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def enabled() -> bool:
    return bool(env("CLOUDFLARE_API_TOKEN") and env("CLOUDFLARE_ACCOUNT_ID"))


def account() -> str:
    return f"/accounts/{env('CLOUDFLARE_ACCOUNT_ID')}"


def cf(method: str, path: str, body=None, *, data: bytes | None = None, ctype: str = "application/json"):
    """One Cloudflare API call; returns `result`. Errors name the call and Cloudflare's own messages, never the token."""
    raw = data if data is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(API + path, method=method, data=raw,
                                 headers={"Authorization": f"Bearer {env('CLOUDFLARE_API_TOKEN')}", "Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        try:
            msgs = "; ".join(f"{x.get('code')} {x.get('message')}" for x in json.loads(text).get("errors", []))
        except ValueError:
            msgs = text[:200]
        raise RuntimeError(f"cloudflare {method} {path.split('?')[0].replace(env('CLOUDFLARE_ACCOUNT_ID'), '<account>')} "
                           f"-> {e.code}: {msgs}") from None
    return out.get("result")


def script_name(slug: str) -> str:
    return re.sub(r"[^a-z0-9-]", "-", f"time-{slug}".lower())[:63].strip("-")


def host(slug: str) -> str | None:
    zone = env("TIME_VENTURE_DOMAIN").lower().strip(".")
    return f"{slug}.{zone}" if zone else None


def settings(slug: str, origin: str, pages_origin: str) -> dict:
    return {"SLUG": slug, "ORIGIN": origin.rstrip("/"), "PAGES_ORIGIN": pages_origin,
            "AI_MODEL": env("TIME_VENTURE_AI_MODEL", AI_MODEL), "AI_DAILY": env("TIME_VENTURE_AI_DAILY", "200"),
            "SAVE_DAILY": env("TIME_VENTURE_SAVE_DAILY", "2000")}


def rev(vars_: dict) -> str:
    """The revision a deploy would make: worker code + settings + domain. Equal revs mean nothing to do."""
    h = hashlib.sha256(WORKER.read_bytes())
    h.update(json.dumps({**vars_, "host": host(vars_["SLUG"]), "compat": COMPAT}, sort_keys=True).encode())
    return h.hexdigest()[:12]


def database(slug: str) -> str:
    """The venture's own D1 database (created once). Returns its id."""
    name = script_name(slug)
    for d in cf("GET", f"{account()}/d1/database?name={name}") or []:
        if d.get("name") == name:
            return d["uuid"]
    return cf("POST", f"{account()}/d1/database", {"name": name})["uuid"]


def multipart(parts: list[tuple[str, str, bytes]]) -> tuple[bytes, str]:
    b = uuid.uuid4().hex
    out = b"".join(f'--{b}\r\nContent-Disposition: form-data; name="{n}"; filename="{n}"\r\nContent-Type: {t}\r\n\r\n'.encode()
                   + data + b"\r\n" for n, t, data in parts) + f"--{b}--\r\n".encode()
    return out, f"multipart/form-data; boundary={b}"


def upload(name: str, db: str, vars_: dict) -> None:
    meta = {"main_module": "worker.js", "compatibility_date": COMPAT,
            "bindings": [{"type": "d1", "name": "DB", "id": db}, {"type": "ai", "name": "AI"}]
            + [{"type": "plain_text", "name": k, "text": str(v)} for k, v in vars_.items()]}
    data, ctype = multipart([("metadata", "application/json", json.dumps(meta).encode()),
                             ("worker.js", "application/javascript+module", WORKER.read_bytes())])
    cf("PUT", f"{account()}/workers/scripts/{name}", data=data, ctype=ctype)


def attach(name: str, hostname: str) -> str:
    """Point <slug>.<domain> at the script as a Workers custom domain (Cloudflare adds the DNS record and the cert)."""
    zone = hostname.split(".", 1)[1]
    zones = cf("GET", f"/zones?name={zone}") or []
    if not zones:
        raise RuntimeError(f"TIME_VENTURE_DOMAIN {zone} is not a zone this Cloudflare token can see")
    cf("PUT", f"{account()}/workers/domains",
       {"hostname": hostname, "service": name, "zone_id": zones[0]["id"], "environment": "production"})
    return f"https://{hostname}/"


def workers_dev(name: str) -> str:
    cf("POST", f"{account()}/workers/scripts/{name}/subdomain", {"enabled": True, "previews_enabled": False})
    sub = (cf("GET", f"{account()}/workers/subdomain") or {}).get("subdomain")
    if not sub:
        raise RuntimeError("this Cloudflare account has no workers.dev subdomain yet: set TIME_VENTURE_DOMAIN instead")
    return f"https://{name}.{sub}.workers.dev/"


def pages_origin_of(url: str) -> str:
    m = re.match(r"(https?://[^/]+)", url)
    return m.group(1) if m else ""


def deploy(slug: str, origin: str) -> dict:
    """Database, script and address for one venture. Returns {url, worker, db, rev, api}."""
    vars_ = settings(slug, origin, pages_origin_of(origin))
    vars_["REV"] = r = rev(vars_)
    name = script_name(slug)
    db = database(slug)
    upload(name, db, vars_)
    hostname = host(slug)
    url = attach(name, hostname) if hostname else workers_dev(name)
    return {"url": url, "worker": name, "db": db, "rev": r, "api": url + "api/"}


def client(api: str) -> str:
    """The time.js a venture page loads, pointed at its backend."""
    return CLIENT.read_text().replace("__TIME_API__", api)


def check() -> tuple[bool, str]:
    """Can this token do what a venture needs? For the doctor: (ok, detail), with nothing secret in the detail."""
    if not enabled():
        return False, "not set (optional): CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID give ventures domains, a database and AI"
    try:
        cf("GET", f"{account()}/workers/scripts")
        cf("GET", f"{account()}/d1/database?per_page=1")
        zone = env("TIME_VENTURE_DOMAIN")
        if zone and not cf("GET", f"/zones?name={zone}"):
            return False, f"works, but TIME_VENTURE_DOMAIN {zone} is not a zone this token can see"
        return True, f"works: Workers and D1; ventures live at {'<slug>.' + zone if zone else 'workers.dev'}"
    except Exception as e:  # noqa: BLE001
        return False, f"set but failing: {str(e)[:160]}"


if __name__ == "__main__":
    if sys.argv[1:2] == ["check"]:
        ok, detail = check()
        print(detail)
        sys.exit(0 if ok else 1)
    if sys.argv[1:2] == ["deploy"] and len(sys.argv) == 4:
        print(json.dumps(deploy(sys.argv[2], sys.argv[3]), indent=1))
        sys.exit(0)
    sys.exit(__doc__)
