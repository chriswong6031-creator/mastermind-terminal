"""Panel evaluation for the WASHOUT-REVERSAL lane (docs/PREREG_WASHOUT_REVERSAL.md).

Prices the pre-registered candidate variants (E-A raw / E-B hold / E-C divergence /
E-D 2W-turn; E-E cohort requires the sector-cohort store and reports NOT-RUN when it
is unavailable on the lab host) against the production scored stream
(``run_backtest(use_reclaim_entry=True)``), exits byte-identical in both arms.

Protocol (all thresholds fixed in the prereg BEFORE this file ran):
  - Tuning panel: macro US full-history parquets, Half-A/Half-B split by md5(sym) parity.
  - Variant selection on Half-A only; the single best Half-A variant confirms on Half-B.
  - CN panel (china_stocks) is confirm-only OOS — never used to pick a variant.
  - Gates G1-G6 per the prereg §4 (G6 = the ADDED washout trades alone satisfy G1).

Usage:
  python3 -m signal_layer.washout_lab --panel us   [--limit N] [--out PATH]
  python3 -m signal_layer.washout_lab --panel cn --variant E-B [--limit N]
"""
from __future__ import annotations

import hashlib
import json
import statistics
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from . import confluence as oracle
from .backtest import run_backtest
from .confluence_v2 import (DD_LOOKBACK_3D, DD_MIN, MO_DWELL_MIN, OS_WINDOW,
                            washout_context)

US_DIR = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard/data/stocks")
CN_DIR = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard/data/china_stocks")

VARIANTS = ("E-A", "E-B", "E-C", "E-D")   # E-E: cohort store required (NOT-RUN here)

# frozen detection constants (prereg §2 — do not tune). W1-W3 now live beside the shipped
# lane in confluence_v2 and are imported above; only the UNPROMOTED variants' constants are
# still lab-local, because nothing in production may fire on them.
DIV_LOOK = 12              # E-C: swing-low lookback (3D bars), keeper's look mirrored
W2_TURN_WINDOW = 4         # E-D: 2W turn availability within last N 3D bars


def _swing_lows(s: pd.Series, w: int = 2) -> list[int]:
    v = s.to_numpy()
    return [i for i in range(w, len(v) - w) if v[i] == v[i - w:i + w + 1].min()]


def washout_masks(daily_close: pd.Series, *, bar_anchor: int = 0, week_parity: int = 0) -> dict | None:
    """Per-variant bool masks aligned to the non-NaN signal rows of ``compute_signals``.

    Returns {"rows": n, "E-A": mask, ...} or None on insufficient data. All context
    series follow the production leak conventions: monthly/2W legs are the PRIOR CLOSED
    bar (shift(1) + ffill, mirroring ``mo_bull``/``w2_bull``)."""
    dc = daily_close.dropna()
    sig = oracle.compute_signals(dc, bar_anchor=bar_anchor, week_parity=week_parity)
    if sig.empty:
        return None
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    if len(rows) < 20:
        return None

    # W1-W3 + E-A/E-B come from the PRODUCTION definition (confluence_v2.washout_context) —
    # the same code the promoted lane emits from, so the panel can never measure a grammar
    # that differs from the one that ships. E-C/E-D stay here: they were never promoted, so
    # production has no business carrying them.
    ctx = washout_context(sig, dc)
    if ctx is None:
        return None
    trig, n = ctx["trig"], len(rows)
    close3 = rows["close"].astype(float)

    masks: dict = {"rows": n, "n_trig": int(trig.sum())}
    masks["E-A"] = trig
    masks["E-B"] = ctx["eb"]
    idx = np.flatnonzero(trig)

    # E-C: bull divergence at the trigger bar (price LL vs 3D RSI-MACD HL, look=12)
    lows = _swing_lows(close3)
    cv, mv = close3.to_numpy(), rows["macd"].to_numpy()
    ec = np.zeros(n, dtype=bool)
    for i in idx:
        rl = [l for l in lows if i - DIV_LOOK < l <= i]
        if len(rl) >= 2 and cv[rl[-1]] < cv[rl[-2]] and mv[rl[-1]] > mv[rl[-2]]:
            ec[i] = True
    masks["E-C"] = ec

    # E-D: 2W StochRSI K↑D cross from K<20, knowable within the last 4 3D bars
    w2s = oracle._resample_2w(dc, week_parity)
    k2, d2 = oracle.stoch_rsi_kd(w2s)
    cross_up = oracle.crossover(k2, d2) & (k2.shift(1) < 20)
    cu3 = cross_up.shift(1).reindex(rows.index, method="ffill").fillna(False).astype(bool)
    event3 = cu3 & ~cu3.shift(1, fill_value=False)          # first 3D bar the turn is knowable
    recent_turn = event3.rolling(W2_TURN_WINDOW, min_periods=1).max().astype(bool).to_numpy()
    masks["E-D"] = trig & recent_turn

    return masks


def _close_from_parquet(p: Path) -> pd.Series | None:
    try:
        s = pd.read_parquet(p, columns=["close"])["close"].dropna()
        return s if len(s) >= 300 else None
    except Exception:
        return None


def _half(sym: str) -> str:
    return "A" if int(hashlib.md5(sym.encode()).hexdigest(), 16) % 2 == 0 else "B"


def run_panel(panel: str = "us", limit: int = 0, variants=VARIANTS) -> dict:
    d = US_DIR if panel == "us" else CN_DIR
    files = sorted(d.glob("*.parquet"))
    if limit:
        files = files[:limit]

    per_variant: dict[str, dict] = {v: {"rows": [], "pooled": [], "y2022": []} for v in variants}
    n_names = 0
    for fi, p in enumerate(files):
        sym = p.stem
        close = _close_from_parquet(p)
        if close is None:
            continue
        masks = washout_masks(close)
        if masks is None:
            continue
        try:
            base = run_backtest(close, use_reclaim_entry=True)
        except Exception as e:  # noqa: BLE001 — a lab must survive one bad name
            print(f"  {sym}: base FAILED {e}", flush=True)
            continue
        mb = base.get("metrics")
        if not mb:
            continue
        n_names += 1
        for v in variants:
            mask = masks[v]
            if not mask.any():
                per_variant[v]["rows"].append({
                    "sym": sym, "half": _half(sym), "n_wo": 0, "wo_exp": None,
                    "base_total": mb["strat_total_return"], "var_total": mb["strat_total_return"],
                    "base_dd": mb["max_dd"], "var_dd": mb["max_dd"],
                })
                continue
            try:
                var = run_backtest(close, use_reclaim_entry=True, extra_entries=mask)
            except Exception as e:  # noqa: BLE001
                print(f"  {sym}/{v}: FAILED {e}", flush=True)
                continue
            mv = var.get("metrics")
            if not mv:
                continue
            wo = [t for t in var.get("trades", []) if t.get("entry_kind") == "washout"]
            per_variant[v]["pooled"] += [(sym, t["ret"], t["entry_date"]) for t in wo]
            per_variant[v]["y2022"] += [t["ret"] for t in wo if str(t["entry_date"]).startswith("2022")]
            per_variant[v]["rows"].append({
                "sym": sym, "half": _half(sym), "n_wo": len(wo),
                "wo_exp": (sum(t["ret"] for t in wo) / len(wo)) if wo else None,
                "base_total": mb["strat_total_return"], "var_total": mv["strat_total_return"],
                "base_dd": mb["max_dd"], "var_dd": mv["max_dd"],
            })
        if (fi + 1) % 50 == 0:
            print(f"  …{fi + 1}/{len(files)} files", flush=True)

    med = lambda xs: statistics.median(xs) if xs else None  # noqa: E731
    out: dict = {"panel": panel, "n_names": n_names, "variants": {}}
    for v in variants:
        rows = per_variant[v]["rows"]
        out["variants"][v] = {"all": _gates(rows, per_variant[v]["pooled"], per_variant[v]["y2022"], med)}
        for half in ("A", "B"):
            hrows = [r for r in rows if r["half"] == half]
            hsyms = {r["sym"] for r in hrows}
            hpool = [t for t in per_variant[v]["pooled"] if t[0] in hsyms]
            h2022 = [t[1] for t in hpool if str(t[2]).startswith("2022")]
            out["variants"][v][f"half_{half}"] = _gates(hrows, hpool, h2022, med)
    return out


def _gates(rows: list[dict], pooled: list, y2022: list, med) -> dict:
    traded = [r for r in rows if r["n_wo"]]
    n_wo = len(pooled)
    pooled_rets = [t[1] for t in pooled]
    pooled_exp = (sum(pooled_rets) / n_wo) if n_wo else None
    per_name = [r["wo_exp"] for r in traded if r["wo_exp"] is not None]
    ratio = [(r["var_total"] + 1) / (r["base_total"] + 1) for r in traded if r["base_total"] > -1]
    breadth = (sum(1 for r in traded if r["var_total"] >= r["base_total"]) / len(traded)) if traded else None
    dd_delta = med([r["var_dd"] - r["base_dd"] for r in traded])
    exp_2022 = (sum(y2022) / len(y2022)) if y2022 else None
    gates = {
        "G1_expectancy": bool(pooled_exp is not None and pooled_exp > 0 and (med(per_name) or -1) >= 0),
        "G2_noninferior": bool((med(ratio) or 0) >= 0.95),
        "G3_2022_falsifier": bool(exp_2022 is None or exp_2022 > -0.02),
        "G4_breadth_dd": bool((breadth or 0) >= 0.55 and (dd_delta or 0) <= 0.02),
        "G5_n": n_wo >= 150,
        # G6 added-fires: in this harness every washout trade IS an added fire (the mask
        # only marks bars the scored stream refused), so G6 ≡ G1 measured on the washout
        # cohort alone — which is exactly what pooled/per-name above already are.
        "G6_added_fires": bool(pooled_exp is not None and pooled_exp > 0),
    }
    return {
        "n_names_traded": len(traded), "n_washout_trades": n_wo,
        "pooled_expectancy": pooled_exp, "median_per_name_expectancy": med(per_name),
        "expectancy_2022": exp_2022, "n_2022": len(y2022),
        "median_total_ratio": med(ratio), "breadth": breadth, "median_dd_delta": dd_delta,
        "gates": gates, "all_pass": all(gates.values()),
    }


def main() -> int:
    argv = sys.argv[1:]
    panel = argv[argv.index("--panel") + 1] if "--panel" in argv else "us"
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 0
    variants = ((argv[argv.index("--variant") + 1],) if "--variant" in argv else VARIANTS)
    out_path = argv[argv.index("--out") + 1] if "--out" in argv else f"/tmp/washout_lab_{panel}.json"
    res = run_panel(panel, limit, variants)
    Path(out_path).write_text(json.dumps(res, indent=1, default=str))
    slim = {p: {v: {h: {k: r[h][k] for k in ("n_washout_trades", "pooled_expectancy",
                                             "median_per_name_expectancy", "expectancy_2022",
                                             "median_total_ratio", "breadth", "median_dd_delta",
                                             "gates", "all_pass")}
                 for h in r}
             for v, r in res["variants"].items()}
            for p in (res["panel"],)}
    print(json.dumps({"panel": res["panel"], "n_names": res["n_names"], "summary": slim}, indent=1))
    print(f"full rows -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
