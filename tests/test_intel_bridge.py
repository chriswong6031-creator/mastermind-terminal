"""Tests for the intel bridge contract fix (#18).

Two main fixture groups:
  1. No-BULL-on-neutral: the A.json live case — ladder.dir='up' while
     decision.band='neutral', score=50, entry_signal.status='hold' must NOT
     produce ai_lean.dir='BULL'.
  2. Stale-file abstention: a record with asof older than MAX_STALE_DAYS must
     produce ai_lean={'abstain': True, ...} and NOT expose a dir field.

Additional table-driven cases cover the full mapping table.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.pull_macro_intel import _map_ai_dir, build_intel, _is_stale  # noqa: E402


# ── helpers ────────────────────────────────────────────────────────────────────

def _src(
    *,
    asof: str = "2026-07-01",
    band: str = "neutral",
    entry_status: str = "hold",
    score: float = 50.0,
    verdict: str = "Neutral — no clear edge",
    ladder_dir: str = "up",
    ladder_regime: str = "MIXED",
) -> dict:
    """Build a minimal stockdata dict for testing."""
    return {
        "asof": asof,
        "view": {
            "decision": {
                "band": band,
                "score": score,
                "headline": verdict,
                "gloss": None,
            }
        },
        "conviction": {
            "verdict": verdict,
            "score": score,
            "band_en": band.capitalize(),
            "drivers": None,
            "cautions": [],
        },
        "ladder": {
            "dir": ladder_dir,
            "regime_label": ladder_regime,
        },
        "entry_signal": {
            "status": entry_status,
        },
        "gex": {},
        "positioning": {},
        "revisions": {},
        "valuation": {},
        "analyst": {},
        "smart_money": {},
    }


TODAY = date(2026, 7, 1)  # deterministic for all tests


# ── fixture 1: no BULL on neutral (the A.json live case) ──────────────────────

class TestNoBullOnNeutral:
    """The exact field values from A.json (asof 2026-06-26, verified 2026-07-01)."""

    def _build(self, **overrides):
        src = _src(
            asof="2026-07-01",  # fresh so freshness gate doesn't fire
            band="neutral",
            entry_status="hold",
            score=50.0,
            verdict="Neutral — no clear edge",
            ladder_dir="up",   # ← the old bug: this alone used to produce BULL
            ladder_regime="MIXED",
            **overrides,
        )
        return build_intel("A", src, today=TODAY)

    def test_no_bull_direction(self):
        intel = self._build()
        lean = intel["tape"]["ai_lean"]
        assert "abstain" not in lean, "should not abstain on fresh data"
        assert lean["dir"] != "BULL", (
            f"BULL emitted on neutral band + hold entry — got dir={lean['dir']!r}\n"
            f"band={lean.get('band')!r}, entry={lean.get('entry')!r}, score={lean.get('score')}"
        )

    def test_neutral_direction(self):
        intel = self._build()
        lean = intel["tape"]["ai_lean"]
        assert lean["dir"] == "NEUTRAL", f"expected NEUTRAL, got {lean['dir']!r}"

    def test_score_passthrough(self):
        intel = self._build()
        assert intel["tape"]["ai_lean"]["score"] == 50.0

    def test_band_and_entry_in_lean(self):
        """Lean must expose band + entry so the panel can display the rationale."""
        lean = self._build()["tape"]["ai_lean"]
        assert lean["band"] == "neutral"
        assert lean["entry"] == "hold"

    def test_not_stale(self):
        assert self._build()["tape"]["stale"] is False


# ── fixture 2: stale file abstention ──────────────────────────────────────────

class TestStalenessAbstention:
    """Files with asof older than MAX_STALE_DAYS must cause abstention."""

    def test_5_day_old_abstains(self):
        src = _src(asof="2026-06-25", band="high", entry_status="buy_now", score=90.0)
        intel = build_intel("X", src, today=TODAY)
        lean = intel["tape"]["ai_lean"]
        assert lean.get("abstain") is True, (
            f"stale file (asof=2026-06-25) should abstain; got lean={lean}"
        )
        assert "dir" not in lean, "stale lean must not expose dir"
        assert intel["tape"]["stale"] is True

    def test_6_day_old_abstains(self):
        src = _src(asof="2026-06-24", band="high", entry_status="buy_now", score=95.0)
        intel = build_intel("X", src, today=TODAY)
        assert intel["tape"]["ai_lean"].get("abstain") is True

    def test_same_day_does_not_abstain(self):
        src = _src(asof="2026-07-01", band="high", entry_status="buy_now", score=90.0)
        intel = build_intel("X", src, today=TODAY)
        lean = intel["tape"]["ai_lean"]
        assert "abstain" not in lean
        assert lean["dir"] == "BULL"

    def test_missing_asof_abstains(self):
        src = _src(asof="2026-07-01")
        src.pop("asof")
        intel = build_intel("X", src, today=TODAY)
        assert intel["tape"]["ai_lean"].get("abstain") is True

    def test_4_day_old_does_not_abstain(self):
        """4 calendar days is within the 5-day window — should NOT abstain."""
        src = _src(asof="2026-06-27", band="high", entry_status="buy_now", score=90.0)
        intel = build_intel("X", src, today=TODAY)
        lean = intel["tape"]["ai_lean"]
        assert "abstain" not in lean
        assert lean["dir"] == "BULL"


# ── mapping table: full value-set coverage ────────────────────────────────────

@pytest.mark.parametrize("band,entry,expected_dir", [
    # Bullish: high band + buy entry
    ("high",         "buy_now",       "BULL"),
    ("high",         "buy_soon",      "BULL"),
    ("high",         "partial",       "BULL"),
    ("constructive", "buy_now",       "BULL"),
    ("constructive", "buy_soon",      "BULL"),
    ("constructive", "partial",       "BULL"),
    # High band but no confirmed entry → NEUTRAL
    ("high",         "hold",          "NEUTRAL"),
    ("high",         "blocked",       "NEUTRAL"),
    ("high",         "extended",      "NEUTRAL"),
    ("high",         "watch",         "NEUTRAL"),
    ("high",         "wait_pullback", "NEUTRAL"),
    # Constructive band but no confirmed entry → NEUTRAL
    ("constructive", "hold",          "NEUTRAL"),
    ("constructive", "blocked",       "NEUTRAL"),
    ("constructive", "watch",         "NEUTRAL"),
    ("constructive", "wait_pullback", "NEUTRAL"),
    # Neutral band → always NEUTRAL regardless of entry
    ("neutral",      "buy_now",       "NEUTRAL"),
    ("neutral",      "buy_soon",      "NEUTRAL"),
    ("neutral",      "hold",          "NEUTRAL"),
    ("neutral",      "blocked",       "NEUTRAL"),
    # Low band → BEAR regardless of entry
    ("low",          "hold",          "BEAR"),
    ("low",          "extended",      "BEAR"),
    ("low",          "caution",       "BEAR"),
    ("low",          "buy_now",       "BEAR"),  # low band overrides buy entry
    # Exit/topping entry → BEAR regardless of band
    ("high",         "exit",          "BEAR"),
    ("constructive", "topping",       "BEAR"),
    ("neutral",      "exit",          "BEAR"),
    # Missing / empty band → NEUTRAL
    ("",             "buy_now",       "NEUTRAL"),
    (None,           "buy_now",       "NEUTRAL"),
    ("high",         "",              "NEUTRAL"),
    ("high",         None,            "NEUTRAL"),
])
def test_mapping_table(band, entry, expected_dir):
    result = _map_ai_dir(band, entry)
    assert result == expected_dir, (
        f"_map_ai_dir({band!r}, {entry!r}) = {result!r}, expected {expected_dir!r}"
    )


# ── consistency guard: BULL must not have score < 55 ─────────────────────────

class TestConsistencyGuard:
    def test_bull_with_low_score_demoted(self):
        """If band=high+entry=buy_now but score=45, demote to NEUTRAL."""
        src = _src(
            asof="2026-07-01",
            band="high",
            entry_status="buy_now",
            score=45.0,
            ladder_dir="up",
        )
        intel = build_intel("X", src, today=TODAY)
        lean = intel["tape"]["ai_lean"]
        assert lean["dir"] == "NEUTRAL", (
            f"BULL with score=45 must be demoted; got dir={lean['dir']!r}"
        )

    def test_bear_with_high_score_demoted(self):
        """If band=low+entry=hold but score=70, demote to NEUTRAL."""
        src = _src(
            asof="2026-07-01",
            band="low",
            entry_status="hold",
            score=70.0,
        )
        intel = build_intel("X", src, today=TODAY)
        lean = intel["tape"]["ai_lean"]
        assert lean["dir"] == "NEUTRAL", (
            f"BEAR with score=70 must be demoted; got dir={lean['dir']!r}"
        )

    def test_bull_with_adequate_score_not_demoted(self):
        src = _src(
            asof="2026-07-01",
            band="high",
            entry_status="buy_now",
            score=87.0,
        )
        intel = build_intel("X", src, today=TODAY)
        assert intel["tape"]["ai_lean"]["dir"] == "BULL"


# ── _is_stale unit tests ──────────────────────────────────────────────────────

@pytest.mark.parametrize("asof,max_days,expected", [
    ("2026-07-01", 5, False),   # same day
    ("2026-06-30", 5, False),   # 1 day old
    ("2026-06-27", 5, False),   # 4 days old
    ("2026-06-26", 5, True),    # 5 days old (exactly at boundary → stale)
    ("2026-06-25", 5, True),    # 6 days old
    (None,         5, True),    # missing
    ("",           5, True),    # empty
    ("invalid",    5, True),    # unparseable
])
def test_is_stale(asof, max_days, expected):
    from ingest.pull_macro_intel import _is_stale
    result = _is_stale(asof, date(2026, 7, 1), max_days)
    assert result == expected, f"_is_stale({asof!r}, ..., {max_days}) = {result}, expected {expected}"
