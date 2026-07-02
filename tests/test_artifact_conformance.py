"""Tests for the artifact freshness conformance gate (audit #9).

Covers the trading-calendar age math (weekend/holiday lag is NOT stale), per-artifact
cadence stale detection, the regime-timeline as_of extraction (last `dates` entry), the
fail-closed missing-file case, and the no-manifest fallback (ok=None, never silent True).
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest import artifact_conformance as ac  # noqa: E402


# ── trading-day math ──────────────────────────────────────────────────────────
def test_friday_file_read_monday_is_one_trading_day():
    # 2026-06-26 is a Friday; 2026-06-29 the Monday.
    assert ac.trading_days_between(date(2026, 6, 26), date(2026, 6, 29)) == 1


def test_weekend_lag_is_zero_trading_days():
    # Sat -> Sun: no trading days elapse (benign lag must not read as stale)
    assert ac.trading_days_between(date(2026, 6, 27), date(2026, 6, 28)) == 0


def test_holiday_is_not_a_trading_day():
    # 2026-07-03 is the observed Independence Day holiday in the fixed set.
    assert not ac._is_trading_day(date(2026, 7, 3))
    # a file dated Jul 2 read Jul 6 (Mon) crosses Jul3(hol)+Jul4/5(weekend) = 1 td
    assert ac.trading_days_between(date(2026, 7, 2), date(2026, 7, 6)) == 1


# ── stale detection ───────────────────────────────────────────────────────────
def _manifest(tmp: Path, asof: str, max_td: int = 2) -> Path:
    root = tmp
    (root / "site" / "factordata" / "contracts").mkdir(parents=True, exist_ok=True)
    (root / "site" / "factordata").mkdir(parents=True, exist_ok=True)
    (root / "site" / "factordata" / "us_standouts.json").write_text(
        json.dumps({"as_of": asof, "buy": []}))
    manifest = {
        "schema": "artifact_manifest/v1", "cadence_basis": "trading_calendar",
        "artifacts": [
            {"artifact": "site/factordata/us_standouts.json", "kind": "board",
             "expected_max_age_td": max_td, "as_of_field": "as_of",
             "consumers": ["bot:lenses"]}]}
    (root / ac.MANIFEST_REL).write_text(json.dumps(manifest))
    return root


def test_fresh_artifact_passes(tmp_path):
    root = _manifest(tmp_path, "2026-06-26", max_td=2)
    r = ac.check_all(root, today=date(2026, 6, 29))   # Fri file, Mon read = 1 td ≤ 2
    assert r["ok"] is True and r["n_stale"] == 0


def test_stale_artifact_flagged(tmp_path):
    root = _manifest(tmp_path, "2026-06-26", max_td=2)
    r = ac.check_all(root, today=date(2026, 7, 8))    # ~7 td later > 2
    assert r["ok"] is False
    assert "site/factordata/us_standouts.json" in r["stale_artifacts"]


def test_missing_file_is_fail_closed(tmp_path):
    """A declared artifact that doesn't exist is STALE (abstain), not silently fresh."""
    root = tmp_path
    (root / ac.MANIFEST_REL).parent.mkdir(parents=True, exist_ok=True)
    (root / ac.MANIFEST_REL).write_text(json.dumps({
        "cadence_basis": "trading_calendar",
        "artifacts": [{"artifact": "site/factordata/nope.json", "kind": "board",
                       "expected_max_age_td": 2, "as_of_field": "as_of"}]}))
    r = ac.check_all(root, today=date(2026, 7, 1))
    assert r["ok"] is False and r["n_stale"] == 1


def test_regime_timeline_asof_from_dates_array(tmp_path):
    root = tmp_path
    (root / "site").mkdir(parents=True, exist_ok=True)
    (root / ac.MANIFEST_REL).parent.mkdir(parents=True, exist_ok=True)
    (root / "site" / "regime_timeline.json").write_text(
        json.dumps({"dates": ["2026-06-01", "2026-06-26"], "quad": [1, 2]}))
    (root / ac.MANIFEST_REL).write_text(json.dumps({
        "cadence_basis": "trading_calendar",
        "artifacts": [{"artifact": "site/regime_timeline.json", "kind": "regime",
                       "expected_max_age_td": 2, "as_of_field": None}]}))
    r = ac.check_all(root, today=date(2026, 6, 29))
    assert r["ok"] is True   # last date 2026-06-26, 1 td to Mon


def test_no_manifest_returns_none_never_true(tmp_path):
    r = ac.check_all(tmp_path)
    assert r["ok"] is None
    assert r["reason"] == "no_manifest"


def test_per_symbol_template_is_directory_check(tmp_path):
    root = tmp_path
    (root / "site" / "stockdata").mkdir(parents=True, exist_ok=True)
    (root / ac.MANIFEST_REL).parent.mkdir(parents=True, exist_ok=True)
    (root / ac.MANIFEST_REL).write_text(json.dumps({
        "cadence_basis": "trading_calendar",
        "artifacts": [{"artifact": "site/stockdata/<SYM>.json", "kind": "per_stock_intel",
                       "expected_max_age_td": 2, "as_of_field": "asof"}]}))
    r = ac.check_all(root, today=date(2026, 7, 1))
    # a <SYM> template reports stale=None (dir-level), so it does not fail the gate
    assert r["ok"] is True
    assert r["results"][0]["stale"] is None
    assert r["results"][0]["dir_exists"] is True
