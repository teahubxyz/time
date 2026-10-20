"""The shared inference Worker: Venice behind a key the pages never see (cloudflare/inference.js).

    python3 .github/time/inference.py deploy        # script time-inference at inference.<TIME_VENTURE_DOMAIN>
    python3 .github/time/inference.py check         # /health of the deployed worker

Needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, TIME_VENTURE_DOMAIN and VENICE_API_KEY (bound as a Worker secret).
Settings (all optional, TIME_INFERENCE_*): APPS, ORIGINS, CHAT_MODELS, AUDIO_MODELS, IMAGE_MODELS, AUDIO_SECONDS,
MAX_TOKENS, CHAT_DAILY, CHAT_TOTAL, RENDER_DAILY, RENDER_TOTAL. Idempotent: deploying again updates in place.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cloudflare import COMPAT, account, attach, cf, env, multipart  # noqa: E402

HERE = Path(__file__).resolve().parent
WORKER = HERE / "cloudflare" / "inference.js"
NAME = "time-inference"
DEFAULTS = {
    "APPS": "gandora,havre",
    "ORIGINS": "*.yolopreneur.lol",
    "CHAT_MODELS": "claude-haiku-5-5,google-gemma-4-26b-a4b-it,mistral-small-3-2-24b-instruct,deepseek-v4-flash,qwen3-235b-a22b-instruct-2507",
    "AUDIO_MODELS": "ace-step-15",
    "IMAGE_MODELS": "z-image-turbo",
    "AUDIO_SECONDS": "60",
    "MAX_TOKENS": "2000",
    "CHAT_DAILY": "60", "CHAT_TOTAL": "2000",
    "RENDER_DAILY": "20", "RENDER_TOTAL": "400",
}


def settings() -> dict:
    return {k: env("TIME_INFERENCE_" + k, v) for k, v in DEFAULTS.items()}


def hostname() -> str:
    zone = env("TIME_VENTURE_DOMAIN").lower().strip(".")
    if not zone:
        raise SystemExit("set TIME_VENTURE_DOMAIN (the zone the worker lives under)")
    return f"inference.{zone}"


def database() -> str:
    for d in cf("GET", f"{account()}/d1/database?name={NAME}") or []:
        if d.get("name") == NAME:
            return d["uuid"]
    return cf("POST", f"{account()}/d1/database", {"name": NAME})["uuid"]


def deploy() -> dict:
    key = env("VENICE_API_KEY")
    if not key:
        raise SystemExit("set VENICE_API_KEY: it becomes the worker's secret")
    vars_ = settings()
    h = hashlib.sha256(WORKER.read_bytes())
    h.update(json.dumps({**vars_, "host": hostname(), "compat": COMPAT}, sort_keys=True).encode())
    vars_["REV"] = rev = h.hexdigest()[:12]
    db = database()
    meta = {"main_module": "inference.js", "compatibility_date": COMPAT,
            "bindings": [{"type": "d1", "name": "DB", "id": db}, {"type": "secret_text", "name": "VENICE_API_KEY", "text": key}]
            + [{"type": "plain_text", "name": k, "text": str(v)} for k, v in vars_.items()]}
    data, ctype = multipart([("metadata", "application/json", json.dumps(meta).encode()),
                             ("inference.js", "application/javascript+module", WORKER.read_bytes())])
    cf("PUT", f"{account()}/workers/scripts/{NAME}", data=data, ctype=ctype)
    url = attach(NAME, hostname())
    return {"url": url, "worker": NAME, "db": db, "rev": rev}


def check() -> dict:
    with urllib.request.urlopen(f"https://{hostname()}/health", timeout=20) as r:
        return json.loads(r.read())


if __name__ == "__main__":
    if sys.argv[1:2] == ["deploy"]:
        print(json.dumps(deploy(), indent=1))
    elif sys.argv[1:2] == ["check"]:
        print(json.dumps(check(), indent=1))
    else:
        sys.exit(__doc__)
