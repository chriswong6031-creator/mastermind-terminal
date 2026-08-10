from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from research.master_indicator_fusion_lab import (
    Event,
    _decision_positions,
    _trend_atr,
    comparable_event,
    golden_early_causal_events,
    golden_events,
    lead_conversion,
    pulse_events,
    session_bars,
    simulate_oracle_policy,
    summarize_observations,
    trend_state,
    validate_execution_alignment,
)
from signal_layer.confluence import _3d_groups


def _daily(values: list[float]) -> pd.DataFrame:
    index = pd.bdate_range("2024-01-02", periods=len(values))
    close = np.asarray(values, dtype=float)
    return pd.DataFrame(
        {
            "o": close - 0.1,
            "h": close + 1,
            "l": close - 1,
            "c": close,
            "v": np.ones(len(close)),
        },
        index=index,
    )


def test_session_bars_match_golden_confirmed_3d_groups() -> None:
    daily = _daily(list(range(100, 114)))
    bars = session_bars(daily, 3, 0)
    _opens, close_dates, close_values = _3d_groups(daily["c"], 0)
    expected = pd.Series(close_values, index=pd.DatetimeIndex(close_dates))

    # Golden includes its final currently-forming group; the lab deliberately keeps only
    # groups whose scheduled final constituent session is present.
    expected = expected.reindex(bars.index)
    assert bars.index.tolist() == [
        daily.index[0],
        daily.index[3],
        daily.index[6],
        daily.index[9],
        daily.index[12],
    ]
    np.testing.assert_allclose(bars["c"], expected)


def test_session_bars_preserve_phase_across_missing_execution_rows() -> None:
    full = _daily(list(range(100, 115)))
    keep = np.array([2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    truncated = full.iloc[keep]
    bars = session_bars(
        truncated,
        3,
        int(keep[0]),
        global_positions=keep,
    )

    # Global group 2 (positions 4..6) is incomplete and must be dropped, not allowed to
    # shift every subsequent 3D bar by one session.
    assert full.index[6] not in bars.index
    assert bars.index.tolist() == [full.index[9], full.index[12]]


def test_trend_sensitivity_uses_javascript_half_up_rounding() -> None:
    bars = _daily([100 + np.sin(i / 3) * 2 + i * 0.1 for i in range(80)])
    state = trend_state(bars, 5)
    np.testing.assert_allclose(state["atr"], _trend_atr(bars, 15))


def test_pulse_event_is_known_one_bar_after_its_visual_marker() -> None:
    bars = session_bars(_daily(list(range(100, 116))), 3, 0)
    fake_wave = np.array([np.nan, -40, -70, -80, -60, -50], dtype=float)
    assert len(bars) == len(fake_wave)
    with patch("research.master_indicator_fusion_lab.pulse_wave", return_value=fake_wave):
        events = pulse_events("TEST", bars, "day", "3D")

    buy = next(event for event in events if event.direction == 1)
    assert buy.marker_at == bars.index[3]
    assert buy.known_at == bars.index[4]
    assert buy.known_at > buy.marker_at


def test_prewindow_events_do_not_collapse_onto_first_execution_bar() -> None:
    daily = _daily([100, 101, 102])
    events = [
        Event("TEST", "golden_buy", 1, daily.index[0] - pd.Timedelta(days=10), daily.index[0], "3D"),
        Event("TEST", "golden_buy", 1, daily.index[0], daily.index[0], "3D"),
    ]
    assert _decision_positions(events, daily, 1) == {1}


def test_pulse_comparison_waits_for_200_finite_normalization_samples() -> None:
    start = pd.Timestamp("2024-01-01")
    too_early = Event("TEST", "pulse_3D_day", 1, start, start, "3D", source_bar_index=234)
    ready = Event("TEST", "pulse_3D_day", 1, start, start, "3D", source_bar_index=235)
    assert not comparable_event(too_early, start)
    assert comparable_event(ready, start)


def test_alignment_rejects_a_different_historical_security() -> None:
    daily = _daily(list(range(100, 500)))
    full = daily["c"].copy()
    bad = daily.copy()
    bad.loc[bad.index[:200], "c"] /= 20

    valid, detail = validate_execution_alignment(bad, full)
    assert not valid
    assert detail["price_scale_p95_p05"] > 10


def test_signal_summary_separates_direction_and_embargoes_train_outcomes() -> None:
    known = pd.Timestamp("2023-12-20")
    base = {
        "symbol": "TEST",
        "family": "pulse_3D_day",
        "known_at": known,
        "marker_lead_calendar_days": 3,
        "common_ready_at": pd.Timestamp("2023-01-01"),
    }
    rows = []
    for direction in (1, -1):
        row = {**base, "direction": direction}
        for horizon in (10, 21, 42):
            row[f"ret_{horizon}"] = 0.1
            row[f"mfe_{horizon}"] = 0.2
            row[f"mae_{horizon}"] = -0.1
            row[f"outcome_at_{horizon}"] = pd.Timestamp("2024-01-15")
        rows.append(row)

    summary = summarize_observations(pd.DataFrame(rows), pd.Timestamp("2024-01-01"))
    train = [row for row in summary if row["period"] == "train"]
    assert {row["direction"] for row in train} == {-1, 1}
    assert all(row["samples_42"] == 0 for row in train)


def test_opening_gap_targets_fill_before_later_intraday_stop() -> None:
    daily = _daily([99, 100, 116])
    daily.loc[daily.index[1], ["o", "h", "l", "c"]] = [100, 101, 99, 100]
    daily.loc[daily.index[2], ["o", "h", "l", "c"]] = [116, 117, 80, 90]
    buy = Event("TEST", "golden_buy", 1, daily.index[0], daily.index[0], "3D")
    atr = pd.Series([10.0], index=[daily.index[0]])

    result = simulate_oracle_policy(
        daily,
        [buy],
        atr,
        targets=(1.5, 2.5, 3.5),
        risk_stop_atr=1.5,
        commission_bps=0,
        slippage_bps=0,
    )
    assert result["tp1_rate"] == 1.0
    assert result["exit_counts"]["stop"] == 1


def test_signal_exit_does_not_reenter_on_the_same_open() -> None:
    daily = _daily([99, 100, 101, 102])
    events = [
        Event("TEST", "golden_buy", 1, daily.index[0], daily.index[0], "3D"),
        Event("TEST", "golden_sell_internal", -1, daily.index[1], daily.index[1], "3D"),
        Event("TEST", "golden_buy", 1, daily.index[1], daily.index[1], "3D"),
    ]
    atr = pd.Series([1.0, 1.0], index=daily.index[:2])

    result = simulate_oracle_policy(
        daily,
        events,
        atr,
        commission_bps=0,
        slippage_bps=0,
    )
    assert result["trades"] == 1
    assert result["tp1_rate"] is None


def test_lead_conversion_uses_common_window_one_to_one_and_invalidation() -> None:
    dates = pd.bdate_range("2024-01-01", periods=12)
    events = [
        Event("TEST", "pulse_3D_day", 1, dates[1], dates[1], "3D"),
        Event("TEST", "pulse_3D_day", -1, dates[3], dates[3], "3D"),
        Event("TEST", "golden_buy", 1, dates[4], dates[4], "3D"),
        Event("TEST", "pulse_3D_day", 1, dates[6], dates[6], "3D"),
        Event("TEST", "golden_buy", 1, dates[8], dates[8], "3D"),
        Event("TEST", "golden_buy", 1, dates[10], dates[10], "3D"),
    ]
    result = lead_conversion(
        events,
        "pulse_3D_day",
        {("TEST", "pulse_3D_day"): (dates[0], dates[-1])},
    )
    assert result["oracle_buys"] == 3
    assert result["early_signals"] == 2
    assert result["matched_one_to_one"] == 1


def test_golden_core_and_early_events_exclude_forming_3d_group() -> None:
    index = pd.bdate_range("2015-01-02", periods=1802)
    x = np.arange(len(index))
    close = pd.Series(
        100 + 0.02 * x + 18 * np.sin(x / 45) + 5 * np.sin(x / 8),
        index=index,
    )
    events, sig = golden_events("TEST", close)
    early = golden_early_causal_events("TEST", close, sig)
    core = [event for event in events if event.source_tf == "3D"] + early
    assert core

    positions = close.index.get_indexer(
        pd.DatetimeIndex([event.known_at for event in core])
    )
    assert set((positions % 3).tolist()) == {0}
