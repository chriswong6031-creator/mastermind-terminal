"""Tests for the ticker-reuse history guard (ingest.polygon_bars).

Polygon aggs are keyed by ticker string, so a reused ticker returns the previous
holder's bars (META pre-2022-06-09 = Roundhill Ball Metaverse ETF). The guard must
drop the stale segment without touching legitimate series — including single-day
crashes (META 2022-10-27 −24.6%) and ordinary weekend/holiday gaps.
"""
from __future__ import annotations

from ingest.polygon_bars import append_recent_bars, drop_stale_ticker_history


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


def test_spcx_curated_cutoff_drops_etf_segment():
    # SPAC and New Issue ETF until 2026-04; SpaceX Class A from the 2026-06-12 listing
    bars = [
        bar("2026-04-02", 21.95),
        bar("2026-04-06", 21.98),
        bar("2026-06-12", 160.95),
        bar("2026-06-15", 192.5),
    ]
    out = drop_stale_ticker_history("SPCX", bars)
    assert [b[0] for b in out] == ["2026-06-12", "2026-06-15"]


def test_0300_hk_curated_cutoff_drops_prior_holder_bar():
    # HKEX reissued code 0300 to Midea Group (listed 2024-09-17); one stray prior-holder bar
    bars = [
        bar("2024-07-05", 2.49),
        bar("2024-10-02", 93.3),
        bar("2024-10-03", 85.0),
    ]
    out = drop_stale_ticker_history("0300.HK", bars)
    assert [b[0] for b in out] == ["2024-10-02", "2024-10-03"]


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


def test_append_recent_bars_appends_only_newer():
    bars = [bar("2026-07-01", 100.0), bar("2026-07-02", 101.0)]
    new = [bar("2026-07-02", 101.5), bar("2026-07-06", 103.0), bar("2026-07-03", 102.0)]
    out, n = append_recent_bars("AAPL", bars, new)
    assert n == 2
    assert [b[0] for b in out] == ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-06"]
    assert out[1][4] == 101.0  # existing bar wins over a duplicate date


def test_append_recent_bars_noop_when_nothing_new():
    bars = [bar("2026-07-02", 101.0)]
    out, n = append_recent_bars("AAPL", bars, [bar("2026-07-01", 100.0)])
    assert n == 0
    assert out == bars


def test_append_recent_bars_trims_reused_ticker_stitch():
    # the refresh failure shape: the new holder's debut bars stitched onto the old
    # holder's file by a grouped-daily / yfinance append (SPCX 2026-06)
    bars = [bar("2026-01-05", 22.1), bar("2026-04-06", 21.98)]
    new = [bar("2026-06-12", 160.95), bar("2026-06-15", 192.5)]
    out, n = append_recent_bars("XXXX", bars, new)
    assert n == 2
    assert [b[0] for b in out] == ["2026-06-12", "2026-06-15"]


def test_append_recent_bars_benign_append_keeps_history():
    bars = [bar("2026-07-01", 100.0), bar("2026-07-02", 101.0)]
    out, n = append_recent_bars("AAPL", bars, [bar("2026-07-03", 102.0)])
    assert n == 1
    assert len(out) == 3
