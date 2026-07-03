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

from ingest.pull_macro_intel import (  # noqa: E402
    _map_ai_dir, build_intel, _is_stale, _build_sector_pulse,
)


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


# ── sector_pulse pass-through tests ──────────────────────────────────────────

_FULL_PULSE = {
    "theme_id": "AIINFRA",
    "theme_name": "AI Infrastructure",
    "theme_name_zh": "人工智能基础设施",
    "heat": "heating",
    "label": "Accelerating",
    "reco": "overweight",
    "rank": 3,
    "n_themes": 46,
    "rank_delta_5d": -2.0,
    "theme_ids": ["AIINFRA", "SEMIS"],
    "as_of": "2026-07-01",
}


class TestSectorPulseHelper:
    """Unit tests for _build_sector_pulse helper."""

    def test_full_valid_pulse_passes_through(self):
        out = _build_sector_pulse(_FULL_PULSE)
        assert out is not None
        assert out["heat"] == "heating"
        assert out["theme_id"] == "AIINFRA"
        assert out["theme_name"] == "AI Infrastructure"
        assert out["rank"] == 3
        assert out["n_themes"] == 46
        assert out["rank_delta_5d"] == -2.0
        assert out["as_of"] == "2026-07-01"

    def test_internal_fields_omitted(self):
        """theme_name_zh and theme_ids must NOT leak into terminal output."""
        out = _build_sector_pulse(_FULL_PULSE)
        assert out is not None
        assert "theme_name_zh" not in out
        assert "theme_ids" not in out

    def test_all_valid_heat_values_accepted(self):
        for heat in ("heating", "hot", "cooling", "broken", "idle"):
            pulse = {**_FULL_PULSE, "heat": heat}
            out = _build_sector_pulse(pulse)
            assert out is not None and out["heat"] == heat, f"heat={heat!r} was rejected"

    def test_unknown_heat_rejected(self):
        pulse = {**_FULL_PULSE, "heat": "unknown_future_value"}
        assert _build_sector_pulse(pulse) is None

    def test_missing_heat_returns_none(self):
        pulse = {k: v for k, v in _FULL_PULSE.items() if k != "heat"}
        assert _build_sector_pulse(pulse) is None

    def test_none_input_returns_none(self):
        assert _build_sector_pulse(None) is None

    def test_non_dict_input_returns_none(self):
        assert _build_sector_pulse("heating") is None
        assert _build_sector_pulse([]) is None

    def test_optional_fields_omitted_gracefully(self):
        """Sparse pulse with only required fields must not raise."""
        minimal = {"heat": "hot"}
        out = _build_sector_pulse(minimal)
        assert out is not None
        assert out["heat"] == "hot"
        assert "rank" not in out
        assert "n_themes" not in out


class TestSectorPulseBuildIntel:
    """Integration tests: sector_pulse in build_intel output."""

    def _src_with_pulse(self, pulse, asof="2026-07-01", **kwargs):
        src = _src(asof=asof, **kwargs)
        src["sector_pulse"] = pulse
        return src

    def test_fresh_with_pulse_emits_sector_pulse(self):
        src = self._src_with_pulse(_FULL_PULSE)
        intel = build_intel("NVDA", src, today=TODAY)
        assert "sector_pulse" in intel["tape"], "sector_pulse must be present when fresh"
        assert intel["tape"]["sector_pulse"]["heat"] == "heating"

    def test_fresh_without_pulse_omits_field(self):
        """No sector_pulse in source → field absent (not null) in output."""
        intel = build_intel("NVDA", _src(), today=TODAY)
        assert "sector_pulse" not in intel["tape"], (
            "sector_pulse must be absent (not null) when not in source"
        )

    def test_fresh_with_null_pulse_omits_field(self):
        src = _src()
        src["sector_pulse"] = None
        intel = build_intel("NVDA", src, today=TODAY)
        assert "sector_pulse" not in intel["tape"]

    def test_stale_with_pulse_drops_sector_pulse(self):
        """When the record is stale, sector_pulse must NOT appear even if present."""
        src = self._src_with_pulse(_FULL_PULSE, asof="2026-06-25")  # 6 days old → stale
        intel = build_intel("NVDA", src, today=TODAY)
        assert intel["tape"]["stale"] is True
        assert "sector_pulse" not in intel["tape"], (
            "sector_pulse must be dropped when tape is stale"
        )

    def test_fresh_with_unknown_heat_omits_field(self):
        """Unknown heat values must not reach the terminal."""
        pulse = {**_FULL_PULSE, "heat": "mystery"}
        src = self._src_with_pulse(pulse)
        intel = build_intel("NVDA", src, today=TODAY)
        assert "sector_pulse" not in intel["tape"]

    def test_rank_and_n_themes_are_ints(self):
        intel = build_intel("NVDA", self._src_with_pulse(_FULL_PULSE), today=TODAY)
        sp = intel["tape"]["sector_pulse"]
        assert isinstance(sp["rank"], int)
        assert isinstance(sp["n_themes"], int)
