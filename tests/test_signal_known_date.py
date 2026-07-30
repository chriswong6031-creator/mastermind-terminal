"""Signal availability-date contract.

The 3D engine labels a bar by its opening session for TradingView placement. A cross
that becomes true later in that bar must carry that later session as ``known_ts``.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer.confluence import _3d_groups, compute_signals  # noqa: E402
from signal_layer.contracts import _extract_signals  # noqa: E402


def test_compute_signals_retains_each_3d_bars_availability_session():
    dates = pd.bdate_range("2025-01-02", periods=300)
    close = pd.Series(range(300), index=dates, dtype="float64")

    opens, closes, _ = _3d_groups(close)
    sig = compute_signals(close)

    assert sig.index.equals(opens)
    assert pd.DatetimeIndex(sig["known_ts"]).equals(pd.DatetimeIndex(closes))
    assert sig.index[-1] <= sig["known_ts"].iloc[-1]


def test_costco_shape_emits_chart_date_and_later_known_date():
    sig = pd.DataFrame(
        {
            "known_ts": [pd.Timestamp("2026-07-28")],
            "close": [966.58],
            "macd": [-4.238399],
            "sig": [-4.278006],
            "k": [48.0],
            "d": [44.0],
            "rsi14": [54.0],
            "CB": [True],
            "revBuy": [False],
            "w_bull": [True],
            "above200": [True],
            "mo_bull": [True],
            "w2_bull": [True],
        },
        index=pd.to_datetime(["2026-07-24"]),
    )

    events = _extract_signals(sig)

    assert events[0]["ts"] == "2026-07-24"
    assert events[0]["known_ts"] == "2026-07-28"
    assert events[0]["price"] == 966.58


def test_legacy_signal_frame_falls_back_to_chart_date():
    sig = pd.DataFrame(
        {
            "close": [100.0],
            "macd": [1.0],
            "sig": [0.5],
            "k": [50.0],
            "d": [40.0],
            "rsi14": [55.0],
            "CB": [True],
            "revBuy": [False],
        },
        index=pd.to_datetime(["2026-07-24"]),
    )

    event = _extract_signals(sig)[0]
    assert event["known_ts"] == event["ts"] == "2026-07-24"
