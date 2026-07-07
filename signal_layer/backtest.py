"""Tier-1 backtester — promotes ``confluence.simulate`` and ADDS the metrics the
``backtest_result/v1`` contract requires.

WHY THIS EXISTS (research doc §5)
---------------------------------
The oracle's ``simulate()`` returns 14 fields and bare ``(entry, exit, ret)``
trade tuples. The contract additionally wants Sharpe / Sortino / CAGR / Calmar /
exposure (which need a *per-bar* return series the oracle does not retain) and
structured per-trade records (entry_px / exit_px / side / bars_held / exit_reason,
and MAE/MFE which need intrabar high/low). This module re-runs the SAME entry/exit
logic as ``confluence.simulate`` but keeps the daily(3B-bar) equity curve and a
richer trade log, then derives the added metrics — without touching the oracle.

It also adds transaction costs (the oracle has none): ``cost_bps`` + ``slippage_bps``
are charged per side as a return drag and bled from the equity curve at each fill.

MAE/MFE are GATED on real OHLC (research doc P0-3). ``compute_signals`` runs on a
CLOSE series, so per-trade intrabar extremes are not available here and MAE/MFE are
emitted as ``None``. When the live feed provides true intrabar OHLC, populate them
and set ``bar_quality="real_ohlc"``.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from . import confluence as oracle


def run_backtest(
    close: pd.Series,
    *,
    fixed: bool = True,
    scored_cut: bool = True,
    cost_bps: float = 3.0,
    slippage_bps: float = 1.0,
    bar_quality: str = "synthetic_open_deepstore",
) -> dict:
    """Long/flat as the user trades it (enter CB/re-buy, exit CS/cut), fills at the
    next 3D bar's close. Returns the metrics + trade list that ``contracts`` serialises.

    ``fixed=True`` applies the two regime gates (bear-block + hold-through-strong-bull),
    matching ``confluence.simulate(fixed=True)``.

    ``scored_cut=False`` is "X1 no-cut": drop the fast-reversal ``revSell`` from the
    scored exit (validated +48% expectancy). Mirrors ``confluence.simulate`` — keep the
    two in sync. Default True preserves current live behavior; deploy = flip to False
    at the ingest/api call sites.
    """
    sig = oracle.compute_signals(close.dropna())
    if sig.empty:
        return {"status": "insufficient_data", "n_trades": 0}
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    if len(rows) < 20:
        return {"status": "insufficient_data", "n_trades": 0}

    dates = rows.index.to_list()
    px = rows["close"].astype(float)

    cut = rows["revSell"] if scored_cut else False
    if fixed:
        enter = ((rows["CB"] | rows["revBuy"]) & ~rows["bear_block"]).to_numpy()
        exit_ = ((rows["CS"] & ~rows["strong_bull"]) | cut).to_numpy()
    else:
        enter = (rows["CB"] | rows["revBuy"]).to_numpy()
        exit_ = (rows["CS"] | cut).to_numpy()
    cs_arr = rows["CS"].to_numpy()
    rev_arr = rows["revSell"].to_numpy()

    side_cost = (cost_bps + slippage_bps) / 1e4   # charged per side (entry, exit)

    pos = 0
    entry_close = entry_dt = None
    entry_i = -1
    trades: list[dict] = []
    equity = [1.0]
    eq = 1.0

    for i in range(len(rows) - 1):
        if pos == 1:                              # mark-to-market the open position
            eq *= float(px.iloc[i + 1]) / float(px.iloc[i])
        equity.append(eq)
        if pos == 0 and enter[i]:
            pos = 1
            entry_close = float(px.iloc[i + 1])
            entry_dt = dates[i + 1]
            entry_i = i + 1
            eq *= (1 - side_cost)                 # entry cost
        elif pos == 1 and exit_[i]:
            exit_close = float(px.iloc[i + 1])
            gross = exit_close / entry_close - 1
            net = gross - 2 * side_cost
            eq *= (1 - side_cost)                 # exit cost
            reason = "CS" if cs_arr[i] else ("rev_cut" if rev_arr[i] else "exit")
            trades.append(_trade(len(trades) + 1, entry_dt, dates[i + 1],
                                 entry_close, exit_close, net, gross,
                                 i + 1 - entry_i, reason, bar_quality))
            pos = 0

    if pos == 1:                                  # close any open trade at the last bar
        exit_close = float(px.iloc[-1])
        gross = exit_close / entry_close - 1
        net = gross - 2 * side_cost
        trades.append(_trade(len(trades) + 1, entry_dt, dates[-1],
                             entry_close, exit_close, net, gross,
                             len(rows) - 1 - entry_i, "eod", bar_quality))

    if not trades:
        return {"status": "ok", "n_trades": 0, "bar_quality": bar_quality,
                "first": dates[0].strftime("%Y-%m-%d"), "last": dates[-1].strftime("%Y-%m-%d"),
                "bars": len(rows)}

    rets = np.array([t["ret"] for t in trades])
    wins = rets[rets > 0]
    losses = rets[rets <= 0]
    eq_curve = np.asarray(equity, dtype=float)
    bar_rets = np.diff(eq_curve) / eq_curve[:-1]
    dd = float((eq_curve / np.maximum.accumulate(eq_curve) - 1).min())

    yrs = max((dates[-1] - dates[0]).days / 365.25, 1e-9)
    ppy = len(eq_curve) / yrs                     # 3B bars per year (~84)
    cagr = eq_curve[-1] ** (1 / yrs) - 1 if eq_curve[-1] > 0 else None

    mu = float(bar_rets.mean()) if bar_rets.size else 0.0
    sd = float(bar_rets.std(ddof=1)) if bar_rets.size > 1 else 0.0
    downside = bar_rets[bar_rets < 0]
    dsd = float(downside.std(ddof=1)) if downside.size > 1 else 0.0
    sharpe = (mu / sd * math.sqrt(ppy)) if sd > 0 else None
    sortino = (mu / dsd * math.sqrt(ppy)) if dsd > 0 else None
    calmar = (cagr / abs(dd)) if (cagr is not None and dd < 0) else None
    exposure = sum(t["bars_held"] for t in trades) / max(len(rows), 1)

    bh = float(px.iloc[-1]) / float(px.iloc[0]) - 1
    bh_curve = (px / float(px.iloc[0])).to_numpy()
    bh_dd = float((bh_curve / np.maximum.accumulate(bh_curve) - 1).min())

    return {
        "status": "ok",
        "bar_quality": bar_quality,
        "first": dates[0].strftime("%Y-%m-%d"),
        "last": dates[-1].strftime("%Y-%m-%d"),
        "bars": len(rows),
        "cost_bps": cost_bps,
        "slippage_bps": slippage_bps,
        "metrics": {
            # ---- exist in the oracle's simulate() today ----
            "n_trades": len(trades),
            "win_rate": round(float((rets > 0).mean()), 4),
            "avg_win": round(float(wins.mean()), 4) if wins.size else 0.0,
            "avg_loss": round(float(losses.mean()), 4) if losses.size else 0.0,
            "expectancy": round(float(rets.mean()), 4),
            "profit_factor": (round(float(wins.sum() / -losses.sum()), 2)
                              if losses.sum() < 0 else None),
            "max_dd": round(dd, 4),
            "best": round(float(rets.max()), 4),
            "worst": round(float(rets.min()), 4),
            "strat_total_return": round(float(eq_curve[-1] - 1), 4),
            # ---- NET-NEW (this module adds them; need the per-bar return series) ----
            "cagr": _r(cagr), "sharpe": _r(sharpe), "sortino": _r(sortino),
            "calmar": _r(calmar), "exposure": round(exposure, 4),
            "vs_buy_hold": {
                "bh_total_return": round(bh, 4), "bh_max_dd": round(bh_dd, 4),
                "beats_return": bool(eq_curve[-1] - 1 > bh),
                "shallower_dd": bool(dd > bh_dd),       # less negative = shallower
            },
        },
        "trades": trades,
        "_returns": bar_rets.tolist(),   # the daily series loop/harness consumes (→ sidecar parquet)
        "_returns_index": [d.strftime("%Y-%m-%d") for d in dates[1:]],
    }


def _trade(tid, entry_dt, exit_dt, entry_px, exit_px, net, gross, bars_held, reason, bq) -> dict:
    return {
        "id": tid,
        "entry_date": entry_dt.strftime("%Y-%m-%d"),
        "exit_date": exit_dt.strftime("%Y-%m-%d"),
        "entry_px": round(entry_px, 4),
        "exit_px": round(exit_px, 4),
        "side": "long",
        "ret": round(net, 4),
        "gross_ret": round(gross, 4),
        "bars_held": int(bars_held),
        "exit_reason": reason,
        # MAE/MFE require intrabar high/low — null until the feed supplies real OHLC.
        "mae": None if bq != "real_ohlc" else None,
        "mfe": None if bq != "real_ohlc" else None,
    }


def _r(x, nd: int = 4):
    return round(float(x), nd) if x is not None and math.isfinite(x) else None
