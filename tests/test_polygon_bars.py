"""Tests for the ticker-reuse history guard (ingest.polygon_bars).

Polygon aggs are keyed by ticker string, so a reused ticker returns the previous
holder's bars (META pre-2022-06-09 = Roundhill Ball Metaverse ETF). The guard must
drop the stale segment without touching legitimate series — including single-day
crashes (META 2022-10-27 −24.6%) and ordinary weekend/holiday gaps.
"""
from __future__ import annotations

from ingest.polygon_bars import drop_stale_ticker_history


def bar(date: str, close: float) -> list:
    return [date, close, close, close, close, 1000]


def test_meta_curated_cutoff_drops_etf_segment():
    bars = [
        bar("2021-07-12", 14.94),
        bar("2022-01-28", 12.31),
        bar("2022-06-09", 184.0),
        bar("2022-06-10", 175.57),
    ]
    out = drop_stale_ticker_history("META", bars)
    assert [b[0] for b in out] == ["2022-06-09", "2022-06-10"]


def test_generic_gap_jump_guard_keeps_newest_segment():
    # not in HISTORY_START — the generic guard must catch the same shape
    bars = [
        bar("2021-07-12", 15.0),
        bar("2022-01-28", 12.31),
        bar("2022-06-09", 184.0),  # 132-day gap, ~15x jump
        bar("2022-06-10", 175.57),
    ]
    out = drop_stale_ticker_history("XXXX", bars)
    assert [b[0] for b in out] == ["2022-06-09", "2022-06-10"]


def test_single_day_crash_untouched():
    # META's real 2022-10-27 earnings crash: −24.6% with NO gap → keep everything
    bars = [
        bar("2022-10-25", 137.51),
        bar("2022-10-26", 129.82),
        bar("2022-10-27", 97.94),
        bar("2022-10-28", 99.2),
    ]
    out = drop_stale_ticker_history("XXXX", bars)
    assert len(out) == 4


def test_long_gap_without_jump_untouched():
    # months-long halt that resumes near the old price is kept (same security)
    bars = [
        bar("2022-01-03", 50.0),
        bar("2022-06-01", 60.0),
        bar("2022-06-02", 61.0),
    ]
    out = drop_stale_ticker_history("XXXX", bars)
    assert len(out) == 3


def test_benign_series_untouched():
    bars = [bar(f"2024-01-{d:02d}", 100 + d) for d in range(2, 30)]
    out = drop_stale_ticker_history("AAPL", bars)
    assert out == bars


def test_empty_and_single_bar():
    assert drop_stale_ticker_history("AAPL", []) == []
    one = [bar("2024-01-02", 100.0)]
    assert drop_stale_ticker_history("AAPL", one) == one
