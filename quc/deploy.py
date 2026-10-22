"""Deploy quc to quc.<TIME_VENTURE_DOMAIN> (default yolopreneur.lol) as the Worker `time-quc`, then wait for /api/health.

    CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python3 quc/deploy.py

Reuses .github/time/cloudflare.py. Idempotent: the script is replaced in place, the custom domain re-attached.
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
SRC = HERE / "src" / "worker.js"


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


def deploy() -> dict:
    if not cf.enabled():
        sys.exit("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are needed")
    os.environ.setdefault("TIME_VENTURE_DOMAIN", "yolopreneur.lol")
    code = SRC.read_bytes()
    rev = hashlib.sha256(code).hexdigest()[:12]
    meta = {"main_module": "worker.js", "compatibility_date": cf.COMPAT,
            "bindings": [{"type": "plain_text", "name": "REV", "text": rev}]}
    data, ctype = cf.multipart([("metadata", "application/json", json.dumps(meta).encode()),
                                ("worker.js", "application/javascript+module", code)])
    cf.cf("PUT", f"{cf.account()}/workers/scripts/{NAME}", data=data, ctype=ctype)
    return {"url": cf.attach(NAME, cf.host("quc")), "worker": NAME, "rev": rev}


if __name__ == "__main__":
    out = deploy()
    print(json.dumps(out, indent=1))
    sys.exit(0 if healthy(out["url"]) else "deployed, but /api/health never answered ok")
