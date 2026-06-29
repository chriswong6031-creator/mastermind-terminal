"""Golden-reference parity gate — the trust layer Opus needs (research doc §4).

Neither PineTS nor PyneCore guarantees byte-for-byte TradingView parity, so before
ANY indicator engine is trusted to emit a contract, it is run alongside the Python
oracle (``confluence.compute_signals``) on the SAME OHLC and asserted to agree:
  * every numeric series within ``ATOL`` (max abs diff), and
  * the discrete cross/signal events (CB/CS/revBuy/revSell) match exactly.

CRITICAL (research doc P0-3): run this on a REAL-OHLC symbol, not the reconstructed
deep store (whose ``open`` is synthesised). A Pine port that references open/high/low
will silently diverge on exactly the bars a deep-store gate runs against — certifying
the engine against fiction. ``check()`` records the gate symbol's ``bar_quality``.

In Phase 0b the "candidate engine" is the oracle itself, so the gate trivially
passes (diff 0) — that is intentional: it proves the harness end-to-end. When the
PineTS Node sidecar is wired (Phase 1), pass its compute fn as ``engine_fn``.
"""
from __future__ import annotations

from typing import Callable

import numpy as np
import pandas as pd

from . import confluence as oracle

ATOL = 1e-6
SERIES_COLS = ("macd", "sig", "k", "d", "rsi14")
EVENT_COLS = ("CB", "CS", "revBuy", "revSell")


def check(
    close: pd.Series,
    engine_fn: Callable[[pd.Series], pd.DataFrame] | None = None,
    *,
    bar_quality: str = "unknown",
    bar_anchor: int = 0,
) -> dict:
    """Diff a candidate indicator engine against the oracle.

    ``engine_fn`` maps a close Series → a frame with the same columns the oracle
    produces. Defaults to the oracle itself (the Phase 0b self-check).

    ``bar_anchor`` phases the 3D session grid to the symbol's IPO (see
    ``confluence.compute_signals``). For a truncated feed pass
    ``oracle.ipo_bar_anchor(close, sym)`` so the gate certifies the engine on the SAME
    bar grid TradingView (and the live terminal) use, not a feed-anchored one.
    """
    engine_fn = engine_fn or (lambda c: oracle.compute_signals(c, bar_anchor=bar_anchor))
    truth = oracle.compute_signals(close.dropna(), bar_anchor=bar_anchor)
    cand = engine_fn(close.dropna())
    if truth.empty or cand.empty:
        return {"pass": False, "reason": "insufficient_data", "bar_quality": bar_quality}

    idx = truth.index.intersection(cand.index)
    max_diff = 0.0
    worst_col = None
    for c in SERIES_COLS:
        if c not in truth or c not in cand:
            continue
        a = truth.loc[idx, c].to_numpy(dtype=float)
        b = cand.loc[idx, c].to_numpy(dtype=float)
        mask = np.isfinite(a) & np.isfinite(b)
        if mask.any():
            d = float(np.max(np.abs(a[mask] - b[mask])))
            if d > max_diff:
                max_diff, worst_col = d, c

    event_match = True
    mismatched = []
    for c in EVENT_COLS:
        if c not in truth or c not in cand:
            continue
        if not truth.loc[idx, c].fillna(False).equals(cand.loc[idx, c].fillna(False)):
            event_match = False
            mismatched.append(c)

    ok = (max_diff < ATOL) and event_match
    return {
        "pass": bool(ok),
        "max_series_abs_diff": max_diff,
        "worst_series": worst_col,
        "event_match": event_match,
        "mismatched_events": mismatched,
        "bars_compared": int(len(idx)),
        "bar_quality": bar_quality,
        "atol": ATOL,
        "gate_valid": bar_quality == "real_ohlc",   # a deep-store gate is advisory only
    }
