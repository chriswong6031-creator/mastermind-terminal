"""The ticker-reuse guard on the non-Polygon ingest paths.

PR #92 guarded the Polygon fetch used by build_polygon_universe (flagships). The two
remaining contaminated series on the box (0300.HK via the yfinance/Tencent backfill,
SPCX via grouped-daily appends) arrived through backfill_ohlc.write_json and the
refresh_ohlc/refresh_ohlc_intl append loops — these tests pin the guard onto those.
"""
from __future__ import annotations

import datetime as dt
import json

import ingest.backfill_ohlc as backfill_ohlc
import ingest.refresh_ohlc  # noqa: F401  — import-safe: no polygon key at module level
import ingest.refresh_ohlc_intl  # noqa: F401  — import-safe: yfinance deferred to main()


def bar(date: str, close: float) -> list:
    return [date, close, close, close, close, 1000]


def seq(start: str, n: int, price: float) -> list:
    d0 = dt.date.fromisoformat(start)
    return [bar((d0 + dt.timedelta(days=i)).isoformat(), price + i * 0.1) for i in range(n)]


def test_write_json_drops_stale_segment(tmp_path, monkeypatch):
    # generic gap+jump rule (a symbol NOT in the curated map): one prior-holder bar,
    # then a 89-day gap into a 37x-higher continuous series → keep only the new segment
    monkeypatch.setattr(backfill_ohlc, "OUT", tmp_path)
    rows = [bar("2024-07-05", 2.49)] + seq("2024-10-02", 40, 90.0)
    n = backfill_ohlc.write_json("0301.HK", rows, "yahoo")
    assert n == 40
    doc = json.loads((tmp_path / "0301.HK.json").read_text())
    assert doc["bars"][0][0] == "2024-10-02"
    assert len(doc["bars"]) == 40


def test_write_json_skips_thin_remainder(tmp_path, monkeypatch):
    # SPCX shape: after trimming the old holder, the honest series is < 30 bars —
    # nothing is written yet (the symbol backfills once the new listing has history)
    monkeypatch.setattr(backfill_ohlc, "OUT", tmp_path)
    rows = seq("2021-06-29", 60, 22.0) + seq("2026-06-12", 17, 160.0)
    n = backfill_ohlc.write_json("SPCY", rows, "yahoo")
    assert n == 0
    assert not (tmp_path / "SPCY.json").exists()


def test_write_json_clean_series_unchanged(tmp_path, monkeypatch):
    monkeypatch.setattr(backfill_ohlc, "OUT", tmp_path)
    rows = seq("2024-01-01", 50, 100.0)
    n = backfill_ohlc.write_json("AAPL", rows, "yahoo")
    assert n == 50
    doc = json.loads((tmp_path / "AAPL.json").read_text())
    assert doc["bars"][0][0] == "2024-01-01"
    assert doc["src"] == "yahoo" and doc["bar_quality"] == "real_ohlc"
