#!/usr/bin/env python
"""Resilient chunked driver for the HK deep-data backfill.

Reuses collect_hk_deep.fetch_full / uncovered / OUT verbatim (so the parquet payload
shape is IDENTICAL to a normal collect_hk_deep run) but adds two robustness properties
the stock script lacks for a 2.2k-name flaky run:

  * per-BATCH deadline  — a stalled akshare/East-Money socket can't wedge the whole run
    (stock script's ThreadPoolExecutor blocks on shutdown forever on a hung call).
  * atomic checkpoint after every batch — a mid-run death loses at most one batch, not
    the whole run (stock script writes the parquet only once, at the very end).

Resumable: loads the existing hk_deep.parquet and only fetches uncovered-and-not-cached
names. The original cached names are always carried through, never dropped.
"""
import argparse
import concurrent.futures as cf
import json
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, "/Users/chriswong/Documents/Cluade/charting-app/ingest")
import collect_hk_deep as C  # noqa: E402  (also puts Macro Dashboard on sys.path + imports akshare)

OUT = C.OUT


def load_cache() -> dict:
    cache: dict[str, str] = {}
    if OUT.exists():
        try:
            for r in pd.read_parquet(OUT).to_dict("records"):
                cache[r["ticker"]] = r["payload"]
        except Exception as e:  # noqa: BLE001
            print("cache read warn:", e, flush=True)
    return cache


def save(cache: dict) -> int:
    df = pd.DataFrame([{"ticker": k, "payload": v} for k, v in sorted(cache.items())])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.parent / (OUT.name + ".tmp")
    df.to_parquet(tmp, index=False)
    tmp.replace(OUT)  # atomic swap — never leaves a half-written parquet
    return len(df)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)      # process only first N of todo (testing)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--batch", type=int, default=120)    # checkpoint cadence
    ap.add_argument("--deadline", type=float, default=600)  # seconds a batch may run before abandoning stragglers
    args = ap.parse_args()

    cache = load_cache()
    want = C.uncovered()
    todo = [t for t in want if t not in cache]
    if args.limit:
        todo = todo[: args.limit]
    nbatch = (len(todo) + args.batch - 1) // args.batch
    print(f"uncovered={len(want)} cached={len(cache)} todo={len(todo)} "
          f"workers={args.workers} batch={args.batch} deadline={args.deadline:.0f}s nbatch={nbatch}",
          flush=True)

    got = 0
    t0 = time.time()
    for i in range(0, len(todo), args.batch):
        batch = todo[i : i + args.batch]
        ex = cf.ThreadPoolExecutor(max_workers=args.workers)
        futs = {ex.submit(C.fetch_full, t): t for t in batch}
        bgot = 0
        try:
            for fut in cf.as_completed(futs, timeout=args.deadline):
                t = futs[fut]
                try:
                    rec = fut.result()
                except Exception:  # noqa: BLE001
                    rec = None
                if rec:
                    cache[t] = json.dumps(rec, ensure_ascii=False, default=str)
                    got += 1
                    bgot += 1
        except cf.TimeoutError:
            hung = sum(1 for f in futs if not f.done())
            print(f"  batch {i // args.batch + 1}: deadline hit, {hung} straggler(s) abandoned", flush=True)
        ex.shutdown(wait=False, cancel_futures=True)
        n = save(cache)
        print(f"  batch {i // args.batch + 1}/{nbatch}: +{bgot} (run +{got}), "
              f"parquet={n}, {time.time() - t0:.0f}s", flush=True)

    print(f"DONE parquet={save(cache)} (+{got} this run) in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
