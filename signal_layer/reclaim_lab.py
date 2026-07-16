"""Panel evaluation for the RE-ENTRY repair lane (2026-07-15 directive).

Prices the ``use_reclaim_entry`` sim variant against the GC-v2 no-cut baseline over the
flagship panel, per-lane attributed, so scored promotion is an evidenced decision — the
lane ships display-tier regardless; THIS run decides whether it may ever touch the
scored stream (manifest verdict / wr / pf).

The variant arm is the PROMOTED config: ``use_reclaim_entry=True`` everywhere EXCEPT
decay-class instruments (``confluence_v2.reclaim_excluded`` — leveraged/inverse/futures-
roll funds), whose variant is the baseline. Excluded names stay in the panel denominators.

Gates (fixed before the run; the RC-R9 precedent):
  G1  reclaim-lane trade expectancy > 0 pooled AND median per-name >= 0
  G2  portfolio non-inferiority: variant total return >= 0.95x baseline on the panel median
  G3  2022 bull-trap falsifier: reclaim-lane trades ENTERED in 2022 have expectancy > -2%
  G4  breadth: variant total return >= baseline on >= 55% of names; median max_dd
      deepens by <= 2pp
  G5  n(reclaim trades) >= 150 pooled, else verdict is ACCRUE (not enough evidence)

Usage:  python3 -m signal_layer.reclaim_lab [--limit N] [--out PATH]
Bars come from the prod data plane (https://app.mastermind-x.com/data/<SYM>.json) or a
local dir via TERMINAL_DATA_DIR. Universe = manifest rich rows (verdict-carrying set).
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import urllib.request
from pathlib import Path

import pandas as pd

from .backtest import run_backtest
from .confluence_v2 import reclaim_excluded

BASE = os.environ.get("RECLAIM_LAB_BASE", "https://app.mastermind-x.com/data")
LOCAL = os.environ.get("TERMINAL_DATA_DIR")


def _fetch(name: str):
    if LOCAL:
        p = Path(LOCAL) / name
        return json.loads(p.read_text()) if p.exists() else None
    try:
        with urllib.request.urlopen(f"{BASE}/{name}", timeout=30) as r:
            return json.loads(r.read())
    except Exception:
        return None


def _close_series(doc) -> pd.Series | None:
    bars = doc.get("bars") if isinstance(doc, dict) else doc
    if not bars:
        return None
    try:
        return pd.Series([b[4] for b in bars],
                         index=pd.to_datetime([b[0] for b in bars]), name="close")
    except Exception:
        return None


def run_panel(limit: int = 0) -> dict:
    man = _fetch("manifest.json") or {}
    meta = {s: r for s, r in (man.get("symbols") or {}).items() if isinstance(r, dict)}
    syms = [s for s, r in meta.items() if r.get("verdict") is not None]
    syms.sort()
    if limit:
        syms = syms[:limit]

    rows, pooled_reclaim, pooled_2022 = [], [], []
    for i, sym in enumerate(syms):
        doc = _fetch(f"{sym}.json")
        close = _close_series(doc) if doc else None
        if close is None or len(close) < 300:
            continue
        # decay-class exclusion (scored-promotion precondition): the variant arm for an
        # excluded name IS the baseline — the promoted config takes no reclaim entries
        # there, and the name still counts in the panel denominators (breadth/ratio).
        # Class from the manifest row's cls field when stamped, else the shared rule.
        r = meta.get(sym) or {}
        excl = (r.get("cls") == "decay") or reclaim_excluded(sym, r.get("name"), r.get("sec"))
        try:
            base = run_backtest(close)
            var = base if excl else run_backtest(close, use_reclaim_entry=True)
        except Exception as e:  # noqa: BLE001 — a lab must survive one bad name
            print(f"  {sym}: FAILED {e}", flush=True)
            continue
        mb, mv = base.get("metrics"), var.get("metrics")
        if not mb or not mv:
            continue
        rtr = [t for t in var.get("trades", []) if t.get("entry_kind") in ("reclaim", "block_repair")]
        pooled_reclaim += [t["ret"] for t in rtr]
        pooled_2022 += [t["ret"] for t in rtr if str(t["entry_date"]).startswith("2022")]
        rows.append({
            "sym": sym,
            "excluded": excl,
            "base_total": mb["strat_total_return"], "var_total": mv["strat_total_return"],
            "base_dd": mb["max_dd"], "var_dd": mv["max_dd"],
            "base_wr": mb["win_rate"], "var_wr": mv["win_rate"],
            "n_reclaim": len(rtr),
            "reclaim_exp": (sum(t["ret"] for t in rtr) / len(rtr)) if rtr else None,
        })
        if (i + 1) % 25 == 0:
            print(f"  …{i + 1}/{len(syms)} done", flush=True)

    n = len(rows)
    med = lambda xs: statistics.median(xs) if xs else None  # noqa: E731
    per_name_exp = [r["reclaim_exp"] for r in rows if r["reclaim_exp"] is not None]
    ratio = [(r["var_total"] + 1) / (r["base_total"] + 1) for r in rows if r["base_total"] > -1]
    breadth = sum(1 for r in rows if r["var_total"] >= r["base_total"]) / n if n else 0.0
    dd_delta = med([r["var_dd"] - r["base_dd"] for r in rows])
    pooled_exp = (sum(pooled_reclaim) / len(pooled_reclaim)) if pooled_reclaim else None
    exp_2022 = (sum(pooled_2022) / len(pooled_2022)) if pooled_2022 else None

    gates = {
        "G1_expectancy": bool(pooled_exp is not None and pooled_exp > 0
                              and (med(per_name_exp) or -1) >= 0),
        "G2_noninferior": bool((med(ratio) or 0) >= 0.95),
        "G3_2022_falsifier": bool(exp_2022 is None or exp_2022 > -0.02),
        "G4_breadth_dd": bool(breadth >= 0.55 and (dd_delta or 0) <= 0.02),
        "G5_n": len(pooled_reclaim) >= 150,
    }
    verdict = ("ACCRUE" if not gates["G5_n"]
               else "PROMOTE-CANDIDATE" if all(gates.values())
               else "DISPLAY-ONLY")
    excluded = [r["sym"] for r in rows if r["excluded"]]
    return {
        "panel_n": n,
        "n_excluded": len(excluded),
        "excluded_syms": excluded,
        "n_reclaim_trades": len(pooled_reclaim),
        "pooled_reclaim_expectancy": pooled_exp,
        "median_per_name_expectancy": med(per_name_exp),
        "reclaim_2022_expectancy": exp_2022,
        "n_2022": len(pooled_2022),
        "median_total_ratio_var_over_base": med(ratio),
        "breadth_var_ge_base": breadth,
        "median_dd_delta": dd_delta,
        "median_wr": {"base": med([r["base_wr"] for r in rows]),
                      "var": med([r["var_wr"] for r in rows])},
        "gates": gates,
        "verdict": verdict,
        "rows": rows,
    }


def main() -> int:
    limit = 0
    out = "/tmp/reclaim_lab_result.json"
    argv = sys.argv[1:]
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    if "--out" in argv:
        out = argv[argv.index("--out") + 1]
    res = run_panel(limit)
    Path(out).write_text(json.dumps(res, indent=1))
    summary = {k: v for k, v in res.items() if k != "rows"}
    print(json.dumps(summary, indent=1))
    print(f"full rows -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
