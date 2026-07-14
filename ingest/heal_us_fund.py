"""Heal pass for the us_fund cache: re-fetch only broken/missing names, field-MERGE into the
existing per-symbol cache so a good field is never regressed by a rate-limited retry.

Companion to collect_us_fund.py (same venv, same cache dir). Born from the 2026-07-14 --foreign
backfill where Yahoo throttled the run from minute one: 385/1218 names ended with no cache file
and 652 more were "ok (partial — info:YFRateLimitError,...)". collect_us_fund's write path is a
full overwrite, so re-running it with --force on a still-throttled IP can clobber statements that
DID land. This script instead:

    target set = universe names with no cache file, plus caches whose _errors is non-empty
    for each: fetch_one() again, then per-field merge — take the new value when truthy,
    keep the old when the retry failed; _errors keeps only fields that are still falsy.

Converges monotonically over repeated passes; a pass on a fully-throttled IP is a no-op.

Run with the macro venv:
    "<Macro Dashboard>/.venv/bin/python" ingest/heal_us_fund.py \
        [--foreign] [--only 9984.T,ABBN.SW] [--limit N] [--workers 2] [--probe]

--probe just tests one symbol's info endpoint and exits 0 (clean) / 1 (throttled) — cheap
rate-limit canary for a cooldown wait loop.
"""
from __future__ import annotations

import json
import sys
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collect_us_fund as c  # noqa: E402  (fetch_one, atomic_write, OUT, universes)

DATA_KEYS = list(c.DF_FIELDS) + list(c.SERIES_FIELDS) + list(c.DICT_FIELDS)


def probe(sym: str = "RY.TO") -> bool:
    """True when Yahoo serves the info endpoint clean (not rate-limited)."""
    import yfinance as yf
    try:
        info = yf.Ticker(sym).info
        return bool(info and info.get("currency"))
    except Exception as exc:  # noqa: BLE001
        print(f"probe {sym}: {type(exc).__name__} {exc}", flush=True)
        return False


def needs_heal(path: Path) -> bool:
    if not path.exists():
        return True
    try:
        return bool(json.loads(path.read_text()).get("_errors"))
    except Exception:  # noqa: BLE001  (truncated/corrupt cache → re-fetch)
        return True


def merge(old: dict | None, new: dict) -> dict:
    if not old:
        return new
    out = dict(old)
    out["fetched_at"] = new.get("fetched_at") or old.get("fetched_at")
    if new.get("info"):
        out["info"] = new["info"]
    for k in DATA_KEYS:
        if new.get(k):
            out[k] = new[k]
    # keep only errors for fields that are STILL empty after the merge
    still = {e.split(":", 1)[0] for e in (old.get("_errors") or []) + (new.get("_errors") or [])}
    out["_errors"] = sorted(
        e for e in {*(old.get("_errors") or []), *(new.get("_errors") or [])}
        if e.split(":", 1)[0] in still and not out.get(e.split(":", 1)[0])
    )
    return out


def main(argv: list[str]) -> None:
    if "--probe" in argv:
        sys.exit(0 if probe() else 1)

    only = None
    limit = 0
    workers = 2
    for i, a in enumerate(argv):
        if a == "--only":
            only = [s.strip() for s in argv[i + 1].split(",") if s.strip()]
        elif a == "--limit":
            limit = int(argv[i + 1])
        elif a == "--workers":
            workers = int(argv[i + 1])

    universe = only or (c.foreign_universe() if "--foreign" in argv else c.us_universe())
    todo = [s for s in universe if needs_heal(c.OUT / f"{s}.json")]
    if limit:
        todo = todo[:limit]
    print(f"heal: {len(todo)}/{len(universe)} names need healing (workers={workers})", flush=True)

    def worker(sym: str):
        time.sleep(random.uniform(0.4, 1.4))
        return sym, c.fetch_one(sym)

    done = healed = clean = dead = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(worker, s): s for s in todo}
        for fut in as_completed(futs):
            sym = futs[fut]
            done += 1
            try:
                _, new = fut.result()
            except Exception as exc:  # noqa: BLE001
                new = None
                print(f"  ERR {sym}: {type(exc).__name__} {exc}", flush=True)
            path = c.OUT / f"{sym}.json"
            if new is None:
                dead += 1  # total failure → leave the existing cache (if any) untouched
                print(f"  {sym}: still empty", flush=True)
            else:
                old = None
                if path.exists():
                    try:
                        old = json.loads(path.read_text())
                    except Exception:  # noqa: BLE001
                        old = None
                merged = merge(old, new)
                c.atomic_write(path, json.dumps(merged, ensure_ascii=False))
                healed += 1
                if merged.get("_errors"):
                    print(f"  {sym}: healed partial ({','.join(merged['_errors'][:4])})", flush=True)
                else:
                    clean += 1
            if done % 25 == 0 or done == len(todo):
                print(f"  progress {done}/{len(todo)} — {healed} healed ({clean} now clean), {dead} still empty", flush=True)

    remaining = [s for s in universe if needs_heal(c.OUT / f"{s}.json")]
    print(f"done: {healed} written, {dead} still empty; {len(remaining)} names still need healing", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
