#!/usr/bin/env python3
"""Mirror one public-R2 site-data directory to a local dir (manifest + ETag stamp).

The Macro Dashboard's per-stock site data (stockdata/, chinastockdata/, hkstockdata/)
is no longer git-tracked — CI publishes it to the public R2 bucket. This is the
generic counterpart of pull_macro_intel.py's built-in stockdata sync leg, used by
the launchd CN/HK lane (ops/nightly_cnhk.sh) to keep MACRO_REPO/site/* fresh from
a surface macOS TCC lets launchd read (i.e. outside ~/Documents).

Usage:
    r2_mirror.py <r2_dir> <dest_dir> [--base URL] [--force]

Exit codes: 0 = synced or already fresh (ETag match); 1 = manifest unreachable or
more than 20% of files failed (partial writes are kept — the next run retries).
"""

from __future__ import annotations

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DEFAULT_BASE = "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev"
UA = "mastermind-feed/1.0"
TIMEOUT = 30
WORKERS = 16
META = ".r2_sync.json"  # local stamp: {"etag": "...", "count": N}


def _fetch(url: str) -> tuple[bytes, str] | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.read(), (r.headers.get("ETag") or "")
    except Exception:
        return None


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 2
    r2_dir, dest = args[0], Path(args[1])
    base = DEFAULT_BASE
    if "--base" in argv:
        base = argv[argv.index("--base") + 1]
    force = "--force" in argv

    got = _fetch(f"{base}/{r2_dir}/_manifest.json")
    if not got:
        print(f"r2_mirror: manifest unreachable for {r2_dir}", flush=True)
        return 1
    manifest, etag = json.loads(got[0]), got[1]
    files = manifest.get("files") or []
    dest.mkdir(parents=True, exist_ok=True)
    meta_path = dest / META

    if etag and not force and meta_path.exists():
        try:
            if json.loads(meta_path.read_text()).get("etag") == etag:
                print(f"r2_mirror: {r2_dir} fresh (ETag match, {len(files)} files)", flush=True)
                return 0
        except Exception:
            pass

    failed = 0

    def pull(name: str) -> bool:
        result = _fetch(f"{base}/{r2_dir}/{name}")
        if result is None:
            return False
        (dest / name).write_bytes(result[0])
        return True

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(pull, n): n for n in files}
        for fut in as_completed(futs):
            if not fut.result():
                failed += 1

    if files and failed > len(files) * 0.2:
        print(f"r2_mirror: {r2_dir} FAILED — {failed}/{len(files)} files unreachable", flush=True)
        return 1
    meta_path.write_text(json.dumps({"etag": etag, "count": len(files) - failed}))
    print(f"r2_mirror: {r2_dir} synced — {len(files) - failed}/{len(files)} files → {dest}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
