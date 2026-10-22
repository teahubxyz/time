"""Deploy quc to quc.<TIME_VENTURE_DOMAIN> (default yolopreneur.lol) as the Worker `time-quc`, then wait for /api/health.

    CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... VENICE_API_KEY=... python3 quc/deploy.py

Reuses .github/time/cloudflare.py. Idempotent: the KV namespace `time-quc` is created once and reused, the script is replaced
in place, the custom domain re-attached. VENICE_API_KEY is bound as a Worker secret (without it the agent answers offline).
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / ".github" / "time"))
import cloudflare as cf  # noqa: E402

NAME = "time-quc"
MODULES = ["worker.js", "page.js", "runs.js", "engine.js", "agent.js", "diff.js", "validate.js"]


def healthy(url: str, tries: int = 18) -> bool:
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url + "api/health", timeout=10) as r:
                if json.load(r).get("ok") is True:
                    return True
        except Exception:  # noqa: BLE001  not up yet (DNS, cert, cold start): keep polling
            pass
        time.sleep(10)
    return False


def kv_namespace(title: str) -> str:
    for ns in cf.cf("GET", f"{cf.account()}/storage/kv/namespaces?per_page=100") or []:
        if ns.get("title") == title:
            return ns["id"]
    return cf.cf("POST", f"{cf.account()}/storage/kv/namespaces", {"title": title})["id"]


def deploy() -> dict:
    if not cf.enabled():
        sys.exit("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are needed")
    os.environ.setdefault("TIME_VENTURE_DOMAIN", "yolopreneur.lol")
    code = {m: (HERE / "src" / m).read_bytes() for m in MODULES}
    rev = hashlib.sha256(b"".join(code[m] for m in MODULES)).hexdigest()[:12]
    bindings = [{"type": "kv_namespace", "name": "KV", "namespace_id": kv_namespace(NAME)},
                {"type": "plain_text", "name": "REV", "text": rev}]
    for k in ("CODER_MODEL", "PERSONA_MODEL", "RUNS_PER_DAY", "RUNS_PER_DAY_ALL"):
        if os.environ.get(k):
            bindings.append({"type": "plain_text", "name": k, "text": os.environ[k]})
    if os.environ.get("VENICE_API_KEY"):
        bindings.append({"type": "secret_text", "name": "VENICE_API_KEY", "text": os.environ["VENICE_API_KEY"]})
    else:
        print("warning: no VENICE_API_KEY, so the agent gives offline answers", file=sys.stderr)
    meta = {"main_module": "worker.js", "compatibility_date": cf.COMPAT, "bindings": bindings}
    data, ctype = cf.multipart([("metadata", "application/json", json.dumps(meta).encode())]
                               + [(m, "application/javascript+module", code[m]) for m in MODULES])
    cf.cf("PUT", f"{cf.account()}/workers/scripts/{NAME}", data=data, ctype=ctype)
    return {"url": cf.attach(NAME, cf.host("quc")), "worker": NAME, "rev": rev}


if __name__ == "__main__":
    out = deploy()
    print(json.dumps(out, indent=1))
    sys.exit(0 if healthy(out["url"]) else "deployed, but /api/health never answered ok")
