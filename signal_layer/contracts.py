"""The data contracts — the centerpiece of the whole system (research doc §7).

Every series, signal, and backtest result the charting container produces is a
versioned JSON artifact in ONE of these two shapes, so the Mastermind Opus brain
and the Macro Dashboard stock-picker consume them with no bespoke parser.

Two schemas (see ``contracts/*.schema.json`` for the formal JSON Schema):
  * ``mastermind.indicator/v1``  — one doc per {indicator, symbol, timeframe}
  * ``backtest_result/v1``       — one doc per {strategy, symbol}

THE GUARDRAIL (research doc §4 P0-4 / D9): the ``series``/``gates``/``bars`` arrays
are FOR THE CHART ONLY and must NEVER be sent to the model. ``model_slice()`` is the
projection that strips them, leaving only ``signals[]`` + ``state{}`` + the honest
read — the small surface Opus reasons over within its token budget. Enforce the
slice at the read boundary; do not rely on convention.
"""
from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd

SCHEMA_INDICATOR = "mastermind.indicator/v1"
SCHEMA_BACKTEST = "backtest_result/v1"

# The flagship's faithful Pine params (mirrors confluence.py module constants).
# macd_kind alone is insufficient — two rsi_based MACDs of different lengths still
# disagree (research doc §4 / D6), so the lengths live in params and are hashed.
FLAGSHIP_PARAMS = {
    "confW": 8, "rsiLen": 14, "useMTF": True, "confirmTF": "1W",
    "macd_on": "rsi", "macd_fast": 14, "macd_slow": 60, "macd_signal": 5,
    "buy_rsi_max": 65, "ext_rsi": 70, "rev_bars": 3,
}


def source_hash(source_text: str, params: dict) -> str:
    """Hash the script source AND the full params block (so a param change is a new
    identity). Matches the loop's spec_hash discipline."""
    blob = source_text + "\x00" + json.dumps(params, sort_keys=True, default=str)
    return "sha256:" + hashlib.sha256(blob.encode()).hexdigest()


# ---------------------------------------------------------------- indicator --
def indicator_contract(
    symbol: str,
    timeframe: str,
    sig: pd.DataFrame,
    *,
    indicator_id: str = "confluence_rsimacd_stochrsi_mtf",
    title: str = "RSI-MACD × StochRSI MTF Confluence",
    engine: str = "python:signal_layer.confluence@corrected",
    source_lang: str = "python",
    params: dict | None = None,
    macd_kind: str = "rsi_based",
    bar_quality: str = "synthetic_open_deepstore",
    as_of: str | None = None,
    src_text: str = "",
    validation: dict | None = None,
    honest_read: str = "",
) -> dict:
    """Build a ``mastermind.indicator/v1`` doc from ``confluence.compute_signals`` output."""
    params = params or FLAGSHIP_PARAMS
    bars = [d.strftime("%Y-%m-%d") for d in sig.index]

    def col(name):
        return [_num(v) for v in sig[name].to_list()]

    series = {k: col(k) for k in ("macd", "sig", "k", "d", "rsi14") if k in sig}
    gates = {k: [bool(v) for v in sig[k].to_list()]
             for k in ("w_bull", "above200", "mo_bull", "w2_bull") if k in sig}

    signals = _extract_signals(sig)
    state = _state(sig, signals)

    return {
        "schema": SCHEMA_INDICATOR,
        "indicator": {
            "id": indicator_id, "title": title, "engine": engine,
            "source_lang": source_lang, "source_hash": source_hash(src_text, params),
            "macd_kind": macd_kind, "params": params,
        },
        "symbol": symbol,
        "timeframe": timeframe,
        "as_of": as_of or (bars[-1] + "T00:00:00Z" if bars else None),
        "bar_quality": bar_quality,
        # ── CHART-ONLY ARRAYS — never projected to the model (model_slice strips) ──
        "bars": bars,
        "series": series,
        "gates": gates,
        # ── MODEL-FACING SLICE ──
        "signals": signals,
        "state": state,
        "meta": {
            "leakfree": True, "scored": False,
            "validated_against": "signal_layer/confluence.py",
            "validation": validation or {},
            "honest_read": honest_read,
            "warnings": [],
        },
    }


def _extract_signals(sig: pd.DataFrame) -> list[dict]:
    """Discrete events → the Opus-facing surface (mirrors CB/CS/revBuy/revSell)."""
    out = []
    for i, (ts, row) in enumerate(sig.iterrows()):
        kind = None
        if row.get("CB"):
            kind, reasons = "BUY", ["macd_bull_cross", "recent_b1", "confirm_bull", "rsi<65"]
        elif row.get("revBuy"):
            kind, reasons = "REBUY", ["fast_reversal_up", "sell_failed"]
        elif row.get("CS"):
            kind, reasons = "SELL", ["macd_bear_cross", "recent_s1", "extended"]
        elif row.get("revSell"):
            kind, reasons = "CUT", ["fast_reversal_down", "buy_failed"]
        if not kind:
            continue
        out.append({
            "ts": ts.strftime("%Y-%m-%d"),
            "bar_index": i,
            "type": kind,
            "strength": _strength(row),
            "price": _num(row.get("close")),
            "reasons": reasons,
            "regime": {"weeklyBull": bool(row.get("w_bull")),
                       "above200": bool(row.get("above200")),
                       "monthlyBull": bool(row.get("mo_bull"))},
        })
    return out


def _strength(row) -> float:
    """Crude 0..1 conviction from how many regime gates agree on the signal bar."""
    gates = [bool(row.get("w_bull")), bool(row.get("above200")),
             bool(row.get("mo_bull")), bool(row.get("w2_bull"))]
    return round(0.45 + 0.55 * (sum(gates) / len(gates)), 3)


def _state(sig: pd.DataFrame, signals: list[dict]) -> dict:
    last = sig.iloc[-1] if len(sig) else None
    last_sig = signals[-1] if signals else None
    bars_since = (len(sig) - 1 - last_sig["bar_index"]) if last_sig else None
    pos = None
    if last_sig:
        pos = "long" if last_sig["type"] in ("BUY", "REBUY") else "flat"
    return {
        "position_hint": pos,
        "last_signal": last_sig["type"] if last_sig else None,
        "bars_since_signal": bars_since,
        "extended": bool(last is not None and last.get("strong_bull")),
        "weeklyBull": bool(last is not None and last.get("w_bull")),
        "above200": bool(last is not None and last.get("above200")),
    }


# ---------------------------------------------------------------- backtest ---
def backtest_contract(
    symbol: str,
    timeframe: str,
    bt: dict,
    *,
    strategy_id: str = "rsimacd_stochrsi_mtf",
    name: str = "RSI-MACD × StochRSI MTF confluence",
    params: dict | None = None,
    fill: str = "next_close",
    series_ref: str | None = None,
    honest_read: str = "",
) -> dict:
    """Build a ``backtest_result/v1`` doc from ``backtest.run_backtest`` output."""
    params = params or FLAGSHIP_PARAMS
    spec_hash = hashlib.sha256(
        json.dumps({"id": strategy_id, "params": params}, sort_keys=True).encode()
    ).hexdigest()[:8]
    m = bt.get("metrics", {})
    return {
        "schema": SCHEMA_BACKTEST,
        "as_of": bt.get("last"),
        "status": bt.get("status", "ok"),
        "bar_quality": bt.get("bar_quality"),
        "strategy": {
            "id": strategy_id, "name": name, "source": "signal_layer/confluence.py",
            "spec_hash": spec_hash, "params": params, "fill": fill,
            "cost_bps": bt.get("cost_bps"), "slippage_bps": bt.get("slippage_bps"),
        },
        "universe": {"ticker": symbol, "timeframe": timeframe,
                     "start": bt.get("first"), "end": bt.get("last"), "bars": bt.get("bars")},
        "metrics": m,
        "trades": bt.get("trades", []),
        "series_ref": series_ref,    # loop.harness consumes the parquet at this path
        "validation": None,          # null until loop/harness is invoked (keeps per-chart runs cheap)
        "honest_read": honest_read,
    }


# ---------------------------------------------------------------- the slice --
def model_slice(contract: dict) -> dict:
    """Project a contract down to the MODEL-FACING surface only.

    Strips ``bars``/``series``/``gates`` (indicator) and ``trades``/``_returns``
    (backtest) so the brain never ingests raw float arrays. This is the cost/context
    guardrail (research doc §4 P0-4 / D9) — enforce it at the read boundary.
    """
    s = contract.get("schema")
    if s == SCHEMA_INDICATOR:
        return {
            "schema": s, "indicator_id": contract["indicator"]["id"],
            "symbol": contract["symbol"], "timeframe": contract["timeframe"],
            "as_of": contract.get("as_of"), "bar_quality": contract.get("bar_quality"),
            "macd_kind": contract["indicator"].get("macd_kind"),
            "signals": contract.get("signals", [])[-12:],   # cap the history sent to the model
            "state": contract.get("state", {}),
            "honest_read": contract.get("meta", {}).get("honest_read", ""),
        }
    if s == SCHEMA_BACKTEST:
        return {
            "schema": s, "strategy_id": contract["strategy"]["id"],
            "symbol": contract["universe"]["ticker"], "as_of": contract.get("as_of"),
            "bar_quality": contract.get("bar_quality"),
            "metrics": contract.get("metrics", {}),       # scalars only — safe to send
            "n_trades": contract.get("metrics", {}).get("n_trades"),
            "validation": contract.get("validation"),
            "honest_read": contract.get("honest_read", ""),
        }
    raise ValueError(f"unknown contract schema: {s!r}")


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return round(f, 6)
