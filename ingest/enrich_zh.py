"""Add Chinese names (`zh`) to China + HK symbols in manifest.json.

China: name_zh from the macro china_search store (instant).
HK:    名称 from akshare stock_hk_spot_em (East Money) — slow (~5 min, paginates).

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
MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))


def china_zh() -> dict[str, str]:
    df = pd.read_parquet(MACRO / "data" / "china_search" / "members.parquet")
    out: dict[str, str] = {}
    for tk, z in df["name_zh"].items():
        if isinstance(z, str) and z.strip():
            out[str(tk)] = z.strip()
    return out


def hk_zh() -> dict[str, str]:
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


def main() -> None:
    man = json.loads((OUT / "manifest.json").read_text())
    syms = man["symbols"]
    cz = china_zh()
    print(f"  china_zh: {len(cz)} names")
    hz = hk_zh()
    print(f"  hk_zh: {len(hz)} names")

    n_cn = n_hk = 0
    for s, r in syms.items():
        mk = r.get("mkt")
        if mk in ("SSE", "SZSE") and s in cz:
            r["zh"] = cz[s]; n_cn += 1
        elif mk == "HKEX" and s in hz:
            r["zh"] = hz[s]; n_hk += 1

    (OUT / "manifest.json").write_text(json.dumps(man, separators=(",", ":")))
    print(f"zh added: {n_cn} China, {n_hk} HK (of {sum(1 for r in syms.values() if r.get('mkt') in ('SSE','SZSE','HKEX'))} CN/HK symbols)")


if __name__ == "__main__":
    main()
