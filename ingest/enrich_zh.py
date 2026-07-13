"""Add Chinese names (`zh`) to China + HK symbols in manifest.json.

China: name_zh from the macro china_search store (local parquet — instant + reliable).
HK:    名称 from akshare stock_hk_spot_em (East Money) — SLOW + FLAKY: the East Money
       endpoint intermittently drops the VPS connection (RemoteDisconnected). To stay
       robust, HK names are cached to ingest/zh_cache.json; a live akshare result is
       MERGED into the cache (union — names are never dropped), and the cache is the
       fallback whenever akshare is unreachable.

China and HK are independent: an HK outage must never cost the (network-free) China
names. The prior bug zeroed every Chinese name in the manifest because a single akshare
ConnectionError aborted main() before ANY `zh` was written — see the nightly
terminal-data cron. Each source is now isolated and the manifest is always written.

Additive: only sets `zh`, never changes `name`. Run, then rebuild + redeploy.
  MACRO_REPO=<macro> python ingest/enrich_zh.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "terminal" / "public" / "data"
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))
MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
HK_CACHE = Path(os.environ.get("ZH_HK_CACHE") or (ROOT / "ingest" / "zh_cache.json"))


def china_zh() -> dict[str, str]:
    """China A-share names from the macro store (local parquet — no network)."""
    try:
        df = pd.read_parquet(MACRO / "data" / "china_search" / "members.parquet")
    except Exception as e:  # noqa: BLE001
        print(f"  china_zh: FAILED to read parquet ({e}) — no China names this run")
        return {}
    out: dict[str, str] = {}
    for tk, z in df["name_zh"].items():
        if isinstance(z, str) and z.strip():
            out[str(tk)] = z.strip()
    return out


def hk_zh_live() -> dict[str, str]:
    """HK names from akshare East Money. Raises on any failure (caller falls back)."""
    import akshare as ak

    df = ak.stock_hk_spot_em()
    code_c = next((c for c in ("代码", "symbol", "code") if c in df.columns), df.columns[1])
    name_c = next((c for c in ("名称", "name") if c in df.columns), df.columns[2])
    out: dict[str, str] = {}
    for _, row in df.iterrows():
        digits = "".join(ch for ch in str(row[code_c]) if ch.isdigit())
        nm = str(row[name_c]).strip()
        if digits and nm:
            out[f"{int(digits):04d}.HK"] = nm
    return out


def load_hk_cache() -> dict[str, str]:
    try:
        data = json.loads(HK_CACHE.read_text())
        return {str(k): str(v) for k, v in data.items() if isinstance(v, str) and v.strip()}
    except Exception:  # noqa: BLE001
        return {}


def hk_zh() -> dict[str, str]:
    """HK names: cache ∪ live akshare. Cache makes us resilient to the flaky endpoint."""
    hk = load_hk_cache()
    try:
        live = hk_zh_live()
        print(f"  hk_zh: akshare live {len(live)} names (cache had {len(hk)})")
        hk.update(live)  # union — never drop a previously-known name
        try:
            HK_CACHE.write_text(json.dumps(hk, ensure_ascii=False, separators=(",", ":")))
        except Exception as e:  # noqa: BLE001
            print(f"  hk_zh: cache write FAILED ({e})")
    except Exception as e:  # noqa: BLE001
        print(f"  hk_zh: akshare unreachable ({type(e).__name__}) — using cache only ({len(hk)} names)")
    return hk


def main() -> None:
    man = json.loads(MANIFEST.read_text())
    syms = man["symbols"]

    cz = china_zh()
    print(f"  china_zh: {len(cz)} names (parquet)")
    hz = hk_zh()

    n_cn = n_hk = 0
    for s, r in syms.items():
        mk = r.get("mkt")
        if mk in ("SSE", "SZSE") and s in cz:
            r["zh"] = cz[s]; n_cn += 1
        elif mk == "HKEX" and s in hz:
            r["zh"] = hz[s]; n_hk += 1

    MANIFEST.write_text(json.dumps(man, separators=(",", ":")))
    total = sum(1 for r in syms.values() if r.get("mkt") in ("SSE", "SZSE", "HKEX"))
    print(f"zh added: {n_cn} China, {n_hk} HK (of {total} CN/HK symbols)")


if __name__ == "__main__":
    main()
