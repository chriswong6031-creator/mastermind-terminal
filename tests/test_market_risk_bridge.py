"""Tests for the market-risk bridge (ingest/pull_macro_risk.py).

Covers the pure ``build_market_risk`` trim against BOTH source schemas
(risk_state.v1 — the web-served display file; market_state.v1 — the richer nightly
file with component legs) and the stale-abstain gate.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.pull_macro_risk import build_market_risk, _is_stale  # noqa: E402

TODAY = date(2026, 7, 1)


# ── fixtures ─────────────────────────────────────────────────────────────────

def _risk_state(*, asof="2026-07-01", verdict="RISK_OFF", score=40):
    """A minimal risk_state.v1 (web-served) source dict."""
    return {
        "schema": "risk_state.v1",
        "stale": False, "realtime": False, "live_active": False,
        "nightly_asof": asof,
        "display": {"verdict": verdict, "score": score, "color": "red",
                    "label_en": "Risk-off", "label_zh": "避险"},
        "live": {"verdict": verdict, "score": score,
                 "headline_en": "Risk-off — defend capital.", "headline_zh": "避险 — 保住本金。",
                 "radar": {"state": "caution", "state_ungated": "risk-off", "top_score": 84,
                           "label_en": "Growth scare / defensive rotation", "label_zh": "增长恐慌/防御轮动"}},
        "nightly": {"verdict": verdict, "score": score, "headline_en": "Risk-off — defend capital.",
                    "radar": {"state": "caution", "top_score": 84}},
    }


def _market_state(*, asof="2026-07-01", verdict="MIXED", score=55):
    """A minimal market_state.v1 (richer nightly) source dict."""
    return {
        "schema": "market_state.v1", "asof": asof, "verdict": verdict, "score": score,
        "color": "amber", "label_en": "Mixed", "label_zh": "中性",
        "headline_en": "Mixed tape.", "headline_zh": "混合行情。",
        "radar": {"state": "watch", "label_en": "Neutral", "top_score": 30},
        "components": [
            {"key": "liquidity", "label_en": "Liquidity & credit", "score": 75, "tone": "good", "weight": 0.14},
            {"key": "trend", "label_en": "Trend & technicals", "score": 90, "tone": "good", "weight": 0.24},
        ],
        "is_display_only": True,
    }


# ── risk_state.v1 (the deploy source) ────────────────────────────────────────

class TestRiskStateSource:
    def test_schema_and_verdict(self):
        out = build_market_risk(_risk_state(), today=TODAY)
        assert out["schema"] == "market_risk/v1"
        assert out["verdict"] == "RISK_OFF"
        assert out["score"] == 40 and isinstance(out["score"], int)

    def test_display_only_always_true(self):
        assert build_market_risk(_risk_state(), today=TODAY)["is_display_only"] is True

    def test_radar_trimmed(self):
        r = build_market_risk(_risk_state(), today=TODAY)["radar"]
        assert r["state"] == "caution" and r["top_score"] == 84
        assert r["label_en"].startswith("Growth scare")

    def test_bilingual_carried(self):
        out = build_market_risk(_risk_state(), today=TODAY)
        assert out["label_zh"] == "避险"
        assert out["headline_zh"] == "避险 — 保住本金。"
        assert out["radar"]["label_zh"] == "增长恐慌/防御轮动"

    def test_fresh_not_stale(self):
        assert build_market_risk(_risk_state(asof="2026-07-01"), today=TODAY)["stale"] is False

    def test_no_components_from_web_source(self):
        # risk_state.v1 carries no component legs — the key must be absent, not null.
        assert "components" not in build_market_risk(_risk_state(), today=TODAY)


# ── market_state.v1 (the richer fallback) ────────────────────────────────────

class TestMarketStateSource:
    def test_verdict_and_components(self):
        out = build_market_risk(_market_state(), today=TODAY)
        assert out["verdict"] == "MIXED"
        assert out["radar"]["state"] == "watch"
        assert isinstance(out["components"], list) and len(out["components"]) == 2
        leg = out["components"][0]
        assert set(leg) == {"key", "label_en", "score", "tone"}
        assert leg["key"] == "liquidity" and leg["score"] == 75


# ── stale-abstain gate ───────────────────────────────────────────────────────

class TestStaleGate:
    def test_old_asof_is_stale(self):
        assert build_market_risk(_risk_state(asof="2026-06-20"), today=TODAY)["stale"] is True

    def test_missing_asof_is_stale(self):
        src = _risk_state()
        src.pop("nightly_asof")
        assert build_market_risk(src, today=TODAY)["stale"] is True

    def test_empty_source_does_not_crash(self):
        out = build_market_risk({}, today=TODAY)
        assert out["schema"] == "market_risk/v1"
        assert out["verdict"] is None
        assert out["stale"] is True                # no asof → stale
        assert out["is_display_only"] is True


@pytest.mark.parametrize("asof,max_days,expected", [
    ("2026-07-01", 5, False),
    ("2026-06-27", 5, False),
    ("2026-06-26", 5, True),
    ("2026-06-25", 5, True),
    (None, 5, True),
    ("", 5, True),
    ("invalid", 5, True),
])
def test_is_stale(asof, max_days, expected):
    assert _is_stale(asof, date(2026, 7, 1), max_days) is expected
