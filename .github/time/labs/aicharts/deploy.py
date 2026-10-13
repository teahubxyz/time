"""Deploy the AICharts demo: one Worker (`time-aicharts`), one D1 database, Workers AI.

    python3 .github/time/labs/aicharts/deploy.py           # prints {url, worker, db, rev}

Reuses cloudflare.py. Lives where ventures live: aicharts.<TIME_VENTURE_DOMAIN> when that is set (a Workers custom
domain; Cloudflare adds the record and the cert), the account's workers.dev otherwise. Idempotent: the same database is
reused and the script is replaced in place.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
import cloudflare as cf  # noqa: E402

NAME = "time-aicharts"
MAIN = b'import src from "./aicharts.txt";\nimport { make } from "./worker.js";\nexport default make(src);\n'


def parts() -> list[tuple[str, str, bytes]]:
    lib = (HERE / "aicharts.js").read_bytes()
    return [("main.js", "application/javascript+module", MAIN),
            ("worker.js", "application/javascript+module", (HERE / "worker.js").read_bytes()),
            ("aicharts.js", "application/javascript+module", lib),
            ("aicharts.txt", "text/plain", lib)]


def deploy() -> dict:
    if not cf.enabled():
        sys.exit("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are needed")
    code = parts()
    rev = hashlib.sha256(b"".join(d for _, _, d in code)).hexdigest()[:12]
    vars_ = {"REV": rev, "AI_MODEL": cf.env("AICHARTS_AI_MODEL", cf.AI_MODEL), "AI_DAILY": cf.env("AICHARTS_AI_DAILY", "300"),
             "SAVE_DAILY": cf.env("AICHARTS_SAVE_DAILY", "1000")}
    db = cf.database("aicharts")  # named time-aicharts, like the script
    meta = {"main_module": "main.js", "compatibility_date": cf.COMPAT,
            "bindings": [{"type": "d1", "name": "DB", "id": db}, {"type": "ai", "name": "AI"}]
            + [{"type": "plain_text", "name": k, "text": str(v)} for k, v in vars_.items()]}
    data, ctype = cf.multipart([("metadata", "application/json", json.dumps(meta).encode()), *code])
    cf.cf("PUT", f"{cf.account()}/workers/scripts/{NAME}", data=data, ctype=ctype)
    hostname = cf.host("aicharts")
    return {"url": cf.attach(NAME, hostname) if hostname else cf.workers_dev(NAME), "worker": NAME, "db": db, "rev": rev}


if __name__ == "__main__":
    print(json.dumps(deploy(), indent=1))
