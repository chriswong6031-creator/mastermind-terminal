"""PIT own-name bottom watches and fast failed-breakdown rearms."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer import confluence as oracle  # noqa: E402
from signal_layer import confluence_v2 as v2mod  # noqa: E402
from signal_layer.confluence_v2 import (  # noqa: E402
    _early_dot_mask,
    bottom_watch_events,
    stop_sweep_reclaim_events,
    warn_events,
    washout_context,
)
from signal_layer.contracts import _extract_signals, _state, indicator_contract  # noqa: E402


def _frame(n: int = 25) -> pd.DataFrame:
    idx = pd.bdate_range("2026-01-02", periods=n)
    close = np.full(n, 100.0)
    if n > 20:
        close[20:] = np.linspace(64.0, 58.0, n - 20)
    return pd.DataFrame(
        {
            "known_ts": idx,
            "close": close,
            "macd": np.ones(n),
            "sig": np.zeros(n),
            "k": np.full(n, 10.0),
            "d": np.full(n, 10.0),
            "rsi14": np.full(n, 35.0),
            "CB": np.zeros(n, dtype=bool),
            "revBuy": np.zeros(n, dtype=bool),
            "bear_block": np.ones(n, dtype=bool),
            "w_bull": np.zeros(n, dtype=bool),
            "above200": np.zeros(n, dtype=bool),
            "mo_bull": np.zeros(n, dtype=bool),
            "w2_bull": np.zeros(n, dtype=bool),
            "strong_bull": np.zeros(n, dtype=bool),
        },
        index=idx,
    )


def test_2b_momentum_is_not_visible_before_its_actual_bucket_close(monkeypatch):
    """A 2B bucket labelled Jan-13 closes Jan-14; Jan-13 must not see its rising hist."""
    close_idx = pd.bdate_range("2026-01-01", periods=15)
    daily = pd.Series(np.linspace(100.0, 114.0, len(close_idx)), index=close_idx)
    sig = _frame(10)
    sig.index = pd.bdate_range("2025-12-30", periods=10)
    sig["known_ts"] = sig.index
    sig.loc[sig.index[-2], ["k", "d"]] = [5.0, 10.0]
    sig.loc[sig.index[-1], ["k", "d"]] = [15.0, 10.0]  # StochRSI bull cross
    sig.loc[sig.index[-1], "known_ts"] = pd.Timestamp("2026-01-13")

    def fake_rsi_macd(sm):
        hist = pd.Series(0.0, index=sm.index)
        hist.loc[pd.Timestamp("2026-01-13")] = 1.0  # label Jan-13, known Jan-14
        return hist, pd.Series(0.0, index=sm.index)

    monkeypatch.setattr(oracle, "rsi_macd", fake_rsi_macd)
    assert not bool(_early_dot_mask(sig, daily).iloc[-1])

    sig.loc[sig.index[-1], "known_ts"] = pd.Timestamp("2026-01-14")
    assert bool(_early_dot_mask(sig, daily).iloc[-1])


@pytest.mark.parametrize("source", ["CB", "revBuy"])
def test_blocked_raw_turn_emits_unscored_bottom_watch_with_pit_risk(monkeypatch, source):
    sig = _frame()
    sig.loc[sig.index[-1], source] = True
    # Distinguish the chart coordinate from the availability session.
    sig.loc[sig.index[-1], "known_ts"] = sig.index[-1] + pd.offsets.BDay(1)
    daily_idx = pd.bdate_range(sig.index[0], sig["known_ts"].iloc[-1])
    daily = pd.Series(np.linspace(105.0, 58.0, len(daily_idx)), index=daily_idx)
    high = daily + 1.0
    low = daily - 1.0
    monkeypatch.setattr(v2mod, "_early_dot_mask",
                        lambda frame, close: pd.Series(False, index=frame.index))

    ctx = washout_context(sig, daily)
    assert ctx is not None and bool(ctx["trig"][-1])
    (watch,) = bottom_watch_events(sig, daily, high=high, low=low)
    assert watch["kind"] == "blocked_trigger"
    assert watch["quality"] == "washout_trigger_watch"
    assert watch["scored"] is False
    assert watch["known_ts"] == sig["known_ts"].iloc[-1].strftime("%Y-%m-%d")
    assert watch["washout_ctx"]["drawdown_252"] <= -0.35
    assert watch["risk_basis"] == "daily_ohlc_atr14"
    assert watch["stop_level"] < watch["sweep_low"]

    events = _extract_signals(sig, {"bottom_watches": [watch]})
    bottom = next(e for e in events if e["type"] == "BOTTOM_WATCH")
    assert bottom["subtype"] == "blocked_trigger"
    assert bottom["trigger_known_ts"] == watch["known_ts"]
    assert bottom["scored"] is False
    # The ordinary blocked BUY remains a refusal, and neither watch moves scored state.
    state = _state(sig, events)
    assert state["position_hint"] is None
    assert state["last_scored_signal"] is None


def test_early_dot_inside_washout_gets_its_own_prominent_watch(monkeypatch):
    sig = _frame()
    daily = pd.Series(sig["close"].to_numpy(), index=sig.index)
    dots = pd.Series(False, index=sig.index)
    dots.iloc[-1] = True
    monkeypatch.setattr(v2mod, "_early_dot_mask", lambda frame, close: dots)
    (watch,) = bottom_watch_events(sig, daily)
    assert watch["kind"] == "early_dot"
    assert watch["quality"] == "washout_early_watch"
    assert watch["scored"] is False

    emitted = v2mod.build_v2(sig, daily)
    watch_day = sig.index[-1].strftime("%Y-%m-%d")
    assert any(w["ts"] == watch_day and w["kind"] == "early_dot"
               for w in emitted["bottom_watches"])
    assert watch_day not in emitted["early_dots"], (
        "a promoted amber BOTTOM_WATCH must suppress its duplicate gray early dot"
    )


def test_washout_context_is_prefix_invariant():
    sig = _frame(30)
    daily = pd.Series(sig["close"].to_numpy(), index=sig.index)
    before = washout_context(sig.iloc[:25], daily.iloc[:25])
    after = washout_context(sig, daily)
    assert before is not None and after is not None
    for key in ("drawdown", "monthly_dwell", "recent_oversold", "washed", "trig"):
        np.testing.assert_equal(before[key], after[key][:25])


def test_arm_close_cannot_confirm_the_same_session(monkeypatch):
    idx = pd.bdate_range("2026-01-02", periods=12)
    close = pd.Series(12.0, index=idx)
    close.iloc[3] = 10.0                     # confirmed pivot, knowable at position 6
    close.iloc[6] = 9.0                      # below pivot on the ARM session
    arm = np.zeros(len(close), dtype=bool)
    arm[6] = True
    monkeypatch.setattr(v2mod, "_arm_event_daily", lambda c, di: arm)
    monkeypatch.setattr(v2mod, "_confirmed_swing_lows_r3",
                        lambda c, radius=3: pd.DatetimeIndex([idx[3]]))

    events = warn_events(close)
    assert events == [{"ts": idx[6].strftime("%Y-%m-%d"), "kind": "arm", "px": 9.0}]


def test_same_day_rearm_can_confirm_from_an_already_active_prior_arm(monkeypatch):
    idx = pd.bdate_range("2026-01-02", periods=12)
    close = pd.Series(12.0, index=idx)
    close.iloc[2] = 10.0                     # pivot becomes knowable at position 5
    close.iloc[5] = 11.0                     # fresh ARM, still above structure
    close.iloc[6] = 9.0                      # re-ARM + valid break under the prior ARM
    arm = np.zeros(len(close), dtype=bool)
    arm[5:7] = True
    monkeypatch.setattr(v2mod, "_arm_event_daily", lambda c, di: arm)
    monkeypatch.setattr(v2mod, "_confirmed_swing_lows_r3",
                        lambda c, radius=3: pd.DatetimeIndex([idx[2]]))

    events = warn_events(close)
    assert events == [
        {"ts": idx[5].strftime("%Y-%m-%d"), "kind": "arm", "px": 11.0},
        {"ts": idx[6].strftime("%Y-%m-%d"), "kind": "confirm", "px": 9.0,
         "level": 10.0},
    ]


def test_hl_shaped_structure_stop_rearms_next_session_but_never_same_session():
    idx = pd.bdate_range("2026-07-06", "2026-08-05")
    close = pd.Series(np.linspace(16.2, 14.8, len(idx)), index=idx)
    close.loc[pd.to_datetime(["2026-07-29", "2026-07-30", "2026-07-31",
                              "2026-08-03", "2026-08-04", "2026-08-05"])] = [
        14.51, 14.42, 14.12, 14.43, 15.39, 16.54,
    ]
    high = close + 0.22
    low = close - 0.25
    sell = [{"ts": "2026-07-31", "kind": "confirm", "px": 14.12, "level": 14.29}]

    (rearm,) = stop_sweep_reclaim_events(close, sell, high=high, low=low)
    assert rearm["ts"] == "2026-08-03"
    assert rearm["ts"] != sell[0]["ts"]
    assert rearm["kind"] == "stop_sweep_reclaim"
    assert rearm["price"] == 14.43
    assert rearm["prior_stop_level"] == 14.29
    assert rearm["stop_level"] < rearm["sweep_low"]

    sig = _frame(len(idx))
    sig.index = idx
    sig["known_ts"] = idx
    sig["close"] = close.to_numpy()
    signals = _extract_signals(sig, {"sell_confirms": sell, "reclaims": [rearm]})
    event = next(e for e in signals if e.get("quality") == "stop_sweep_reclaim")
    assert event["type"] == "RECLAIM"
    assert event["scored"] is False
    assert event["price"] == 14.43             # own daily close, not later 3D close
    assert event["anchor_ts"] == "2026-07-31"
    state = _state(sig, signals)
    assert state["last_scored_signal"] == "SELL"
    assert state["position_hint"] == "flat"


def test_stop_sweep_rearm_requires_a_valid_break_and_expires_after_five_sessions():
    idx = pd.bdate_range("2026-06-01", periods=24)
    close = pd.Series(11.0, index=idx)
    close.iloc[15] = 9.5
    close.iloc[16:21] = 9.7
    close.iloc[21:] = 10.2                    # first reclaim is session six: too late
    late = [{"ts": idx[15].strftime("%Y-%m-%d"), "kind": "confirm",
             "px": 9.5, "level": 10.0}]
    assert stop_sweep_reclaim_events(close, late) == []

    not_a_break = [{"ts": idx[15].strftime("%Y-%m-%d"), "kind": "confirm",
                    "px": 10.1, "level": 10.0}]
    assert stop_sweep_reclaim_events(close, not_a_break) == []


def test_bottom_watch_and_stop_sweep_validate_against_indicator_schema(monkeypatch):
    jsonschema = pytest.importorskip("jsonschema")
    sig = _frame()
    sig.loc[sig.index[-1], "CB"] = True
    daily = pd.Series(sig["close"].to_numpy(), index=sig.index)
    monkeypatch.setattr(v2mod, "_early_dot_mask",
                        lambda frame, close: pd.Series(False, index=frame.index))
    watch = bottom_watch_events(sig, daily)
    doc = indicator_contract("HL", "3D", sig, v2={"bottom_watches": watch})
    schema = json.loads((ROOT / "contracts" / "indicator.v1.schema.json").read_text())
    jsonschema.validate(doc, schema)
