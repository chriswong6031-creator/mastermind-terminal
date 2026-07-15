"""Tests for the publish-integrity gate (step 2 guard of the ORACLE_DESK_DIAGNOSIS fix program).

verify_publish.check_manifest() is the post-condition check on reconcile_flagship_verdicts: after a
nightly, every rich manifest row's verdict/wr/pf must still agree with its v2 slice. These tests pin
the mismatch detection and the warn/strict exit policy (warn must NEVER return nonzero).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest import verify_publish as vp  # noqa: E402


def _slice(tmp: Path, sym: str, last_signal, *, wr=0.75, pf=100.0) -> None:
    (tmp / f"{sym}.slice.json").write_text(json.dumps({
        "indicator": {"state": {"last_signal": last_signal}},
        "backtest": {"metrics": {"win_rate": wr, "profit_factor": pf}},
    }))


def _rich(verdict, wr=0.75, pf=100.0) -> dict:
    return {"name": "x", "sec": "Equities", "col": "#888", "mkt": "NASDAQ",
            "verdict": verdict, "wr": wr, "pf": pf, "cagr": 0.5, "regimeBull": False}


def test_consistent_manifest_has_no_mismatches(tmp_path):
    _slice(tmp_path, "NVDA", "SELL")
    _slice(tmp_path, "AAPL", "BUY")
    symbols = {"NVDA": _rich("SELL"), "AAPL": _rich("BUY"),
               "SEARCH": {"name": "s", "sec": "Equities", "col": "#888", "mkt": "SSE"}}
    assert vp.check_manifest(symbols, tmp_path) == []


def test_verdict_disagreement_is_flagged(tmp_path):
    # The bug this whole program exists to catch: manifest verdict != slice state.last_signal.
    _slice(tmp_path, "NVDA", "SELL")
    symbols = {"NVDA": _rich("REBUY")}
    ms = vp.check_manifest(symbols, tmp_path)
    assert len(ms) == 1
    assert ms[0]["sym"] == "NVDA" and ms[0]["kind"] == "verdict"
    assert ms[0]["manifest"] == "REBUY" and ms[0]["slice"] == "SELL"


def test_metric_disagreement_is_flagged(tmp_path):
    _slice(tmp_path, "NVDA", "SELL", wr=0.75, pf=100.0)
    symbols = {"NVDA": _rich("SELL", wr=0.60, pf=8.74)}  # stale inherited wr/pf under a fresh verdict
    kinds = {m["kind"] for m in vp.check_manifest(symbols, tmp_path)}
    assert kinds == {"wr", "pf"}


def test_row_with_verdict_but_no_slice_is_flagged(tmp_path):
    symbols = {"DEAD": _rich("SELL")}  # reconcile should have demoted this; if it's still here, flag it
    ms = vp.check_manifest(symbols, tmp_path)
    assert len(ms) == 1 and ms[0]["kind"] == "no_slice"


def test_search_rows_and_null_verdicts_are_not_checked(tmp_path):
    symbols = {
        "SEARCH": {"name": "s", "sec": "Equities", "col": "#888", "mkt": "SSE"},
        "SHORT": _rich(None, wr=None, pf=None),
    }
    assert vp.check_manifest(symbols, tmp_path) == []


def test_none_metrics_match_but_one_sided_none_is_flagged(tmp_path):
    _slice(tmp_path, "A", "BUY", wr=None, pf=None)
    _slice(tmp_path, "B", "BUY", wr=0.5, pf=2.0)
    symbols = {
        "A": _rich("BUY", wr=None, pf=None),   # both None -> ok
        "B": _rich("BUY", wr=None, pf=2.0),    # manifest wr None vs slice 0.5 -> wr mismatch
    }
    ms = vp.check_manifest(symbols, tmp_path)
    assert [m["kind"] for m in ms] == ["wr"] and ms[0]["sym"] == "B"


def test_float_tolerance_does_not_false_flag(tmp_path):
    _slice(tmp_path, "NVDA", "SELL", wr=0.66670001, pf=4.7700001)
    symbols = {"NVDA": _rich("SELL", wr=0.6667, pf=4.77)}
    assert vp.check_manifest(symbols, tmp_path) == []


def test_corrupt_slice_is_flagged_not_crash(tmp_path):
    (tmp_path / "NVDA.slice.json").write_text("{not json")
    symbols = {"NVDA": _rich("SELL")}
    ms = vp.check_manifest(symbols, tmp_path)
    assert len(ms) == 1 and ms[0]["kind"] == "slice_unreadable"


# ── exit-policy: warn must never return nonzero; strict returns 2 on mismatch ──────────────────
def _write_manifest(tmp: Path, symbols: dict) -> None:
    (tmp / "manifest.json").write_text(json.dumps({"symbols": symbols}))


def test_main_warn_mode_never_blocks(tmp_path, monkeypatch):
    _slice(tmp_path, "NVDA", "SELL")
    _write_manifest(tmp_path, {"NVDA": _rich("REBUY")})  # a real mismatch present
    monkeypatch.setattr(vp, "MANIFEST", tmp_path / "manifest.json")
    monkeypatch.setattr(vp, "OUT", tmp_path)
    monkeypatch.delenv("TERMINAL_VERIFY_STRICT", raising=False)
    assert vp.main() == 0  # warn-only: mismatch does NOT block the swap


def test_main_strict_mode_blocks_on_mismatch(tmp_path, monkeypatch):
    _slice(tmp_path, "NVDA", "SELL")
    _write_manifest(tmp_path, {"NVDA": _rich("REBUY")})
    monkeypatch.setattr(vp, "MANIFEST", tmp_path / "manifest.json")
    monkeypatch.setattr(vp, "OUT", tmp_path)
    monkeypatch.setenv("TERMINAL_VERIFY_STRICT", "1")
    assert vp.main() == 2  # strict: mismatch blocks


def test_main_clean_manifest_returns_zero_in_both_modes(tmp_path, monkeypatch):
    _slice(tmp_path, "NVDA", "SELL")
    _write_manifest(tmp_path, {"NVDA": _rich("SELL")})
    monkeypatch.setattr(vp, "MANIFEST", tmp_path / "manifest.json")
    monkeypatch.setattr(vp, "OUT", tmp_path)
    monkeypatch.setenv("TERMINAL_VERIFY_STRICT", "1")
    assert vp.main() == 0


def test_main_unreadable_manifest_is_nonfatal_in_warn(tmp_path, monkeypatch):
    monkeypatch.setattr(vp, "MANIFEST", tmp_path / "missing.json")
    monkeypatch.setattr(vp, "OUT", tmp_path)
    monkeypatch.delenv("TERMINAL_VERIFY_STRICT", raising=False)
    assert vp.main() == 0  # a guard that can't read the manifest must not freeze the nightly in warn mode
