"""contracts._state — the scored-lane position walk.

Reproduces the 2026-07-15 META incident: a ``quality='regime_blocked'`` BUY (a display
marker the v2 entry logic explicitly refused) flipped ``position_hint`` to long and the
manifest verdict to BUY. The walk must skip blocked markers so the scored fields keep
telling the truth, while ``last_signal`` still echoes the raw stream tail.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer.contracts import _state  # noqa: E402


def _sig_frame(*, strong_bull=True, w_bull=True, above200=True, rsi14=55.0, k=50.0):
    return pd.DataFrame(
        {
            "close": [100.0, 101.0, 102.0],
            "rsi14": [50.0, 52.0, rsi14],
            "k": [40.0, 45.0, k],
            "strong_bull": [False, False, strong_bull],
            "w_bull": [False, True, w_bull],
            "above200": [True, True, above200],
        },
        index=pd.to_datetime(["2026-07-01", "2026-07-06", "2026-07-09"]),
    )


def _ev(ts, kind, bar_index, quality=None, known_ts=None):
    e = {"ts": ts, "type": kind, "bar_index": bar_index, "price": 100.0}
    if quality is not None:
        e["quality"] = quality
    if known_ts is not None:
        e["known_ts"] = known_ts
    return e


def test_regime_blocked_buy_does_not_flip_position():
    # META live shape: SELL, then a bear-blocked REBUY and a bear-blocked BUY.
    signals = [
        _ev("2026-05-04", "SELL", 0),
        _ev("2026-05-26", "REBUY", 1, quality="regime_blocked"),
        _ev("2026-07-06", "BUY", 2, quality="regime_blocked"),
    ]
    st = _state(_sig_frame(), signals)
    assert st["position_hint"] == "flat"
    assert st["last_scored_signal"] == "SELL"
    assert st["last_scored_ts"] == "2026-05-04"
    # the raw stream tail still echoes the blocked marker (display continuity)
    assert st["last_signal"] == "BUY"


def test_keeper_graded_buy_still_flips_position():
    # keeper verdicts (take/block/pending) grade quality but stay in the scored stream —
    # only the bear_block regime veto is excluded (it never traded in v2_streams).
    signals = [
        _ev("2026-06-08", "SELL", 0),
        _ev("2026-07-06", "BUY", 2, quality="take"),
    ]
    st = _state(_sig_frame(), signals)
    assert st["position_hint"] == "long"
    assert st["last_scored_signal"] == "BUY"
    assert st["last_scored_ts"] == "2026-07-06"


def test_last_scored_ts_prefers_signal_availability_date():
    signals = [
        _ev(
            "2026-07-24",
            "BUY",
            2,
            quality="take",
            known_ts="2026-07-28",
        ),
    ]
    st = _state(_sig_frame(), signals)
    assert st["last_scored_ts"] == "2026-07-28"


def test_all_blocked_stream_has_no_scored_state():
    signals = [_ev("2026-07-06", "BUY", 2, quality="regime_blocked")]
    st = _state(_sig_frame(), signals)
    assert st["position_hint"] is None
    assert st["last_scored_signal"] is None
    assert st["last_scored_ts"] is None
    assert st["last_signal"] == "BUY"


def test_state_field_names_are_honest():
    st = _state(_sig_frame(strong_bull=True, rsi14=72.0, k=85.0), [])
    # strong_bull is the honest name; extended stays as the deprecated alias (same value)
    assert st["strong_bull"] is True and st["extended"] is True
    # overbought is the true Pine extendedNow (RSI>=70 or %K>=80)
    assert st["overbought"] is True
    calm = _state(_sig_frame(strong_bull=False, rsi14=55.0, k=50.0), [])
    assert calm["strong_bull"] is False and calm["overbought"] is False


def test_overbought_triggers_on_either_leg():
    assert _state(_sig_frame(rsi14=70.0, k=10.0), [])["overbought"] is True
    assert _state(_sig_frame(rsi14=40.0, k=80.0), [])["overbought"] is True
    assert _state(_sig_frame(rsi14=69.9, k=79.9), [])["overbought"] is False
