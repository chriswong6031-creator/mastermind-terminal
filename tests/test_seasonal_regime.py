"""Tests for the regime-aware seasonal-outlook engine (signal_layer.seasonal_regime).

All synthetic / offline (no yfinance). Asserts the analog exception-filter, regime weighting,
leave-one-year-out validation plumbing, degraded modes, look-ahead safety, determinism, and
that the emitted contract validates against contracts/seasonal_outlook.v1.schema.json.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from signal_layer import regime_calendar as rc
from signal_layer import seasonal_regime as sr

ROOT = Path(__file__).resolve().parents[1]


# ── synthetic price generator (deterministic) ─────────────────────────────────
def synth(y0: int, y1: int, seed: int = 7, nov_dec: float = 0.0) -> pd.Series:
    idx = pd.bdate_range(f"{y0}-01-02", f"{y1}-12-31")
    months = pd.DatetimeIndex(idx).month
    rng = np.random.default_rng(seed)
    r = 0.0004 + np.where(np.isin(months, [11, 12]), nov_dec, 0.0) + rng.normal(0, 0.008, len(idx))
    return pd.Series(100.0 * np.exp(np.cumsum(r)), index=idx)


# ── regime calendar facts ─────────────────────────────────────────────────────
def test_recession_set_and_cycle():
    assert rc.RECESSION_YEARS == frozenset(
        {1970, 1973, 1974, 1975, 1980, 1981, 1982, 1990, 1991, 2001, 2007, 2008, 2009, 2020})
    assert rc.cycle_pos(2026) == "midterm"
    assert rc.cycle_pos(2024) == "election"
    assert rc.cycle_pos(2025) == "post_election"
    assert rc.cycle_pos(2027) == "pre_election"
    assert rc.is_midterm(2026) and rc.is_midterm(2018) and rc.is_midterm(2014)


def test_pivot_years_are_whipsaw():
    # red-team fix: every genuine mid-year Fed pivot carries whipsaw
    for y in (1980, 1981, 1989, 1995, 2019, 2024):
        assert rc.regime(y).whipsaw, f"{y} should be whipsaw"


def test_rate_affinity_monotone():
    assert rc.rate_affinity("hiking", "hiking") == 1.0
    assert rc.rate_affinity("hiking", "cutting") == 0.0
    assert rc.rate_affinity("holding", "hiking") == 0.5
    # closer directions score higher than farther ones
    assert rc.rate_affinity("holding", "hiking") > rc.rate_affinity("cutting", "hiking")


# ── analog selection ──────────────────────────────────────────────────────────
def test_analog_filter_excludes_anomalies_and_weights_by_rate():
    # 2026 = midterm, holding, no anomaly flags → anomalous years must be dropped
    cands = [2018, 2014, 2020, 2008, 1994, 2010]
    a = sr.select_analogs(2026, cands)
    assert 2020 not in a.years and 2008 not in a.years   # covid/crisis+recession dropped
    assert set(a.years) == {2018, 2014, 1994, 2010}
    assert not a.relaxed
    w = dict(zip(a.years, a.weights))
    # 2014 & 2010 (midterm+holding, exact rate match) outweigh 2018/1994 (midterm+hiking)
    assert w[2014] > w[2018] and w[2010] > w[1994]
    assert abs(sum(a.weights) - 1.0) < 1e-9
    assert a.n_eff > 0


def test_analog_relaxation_when_floor_not_met():
    # only anomalous candidates → the filter must relax (reverse severity) to reach the floor
    a = sr.select_analogs(2026, [2020, 2008, 2022])   # covid/crisis/high_inflation
    assert a.years                      # something survived after relaxation
    assert a.relaxed                    # and it recorded what it re-admitted


def test_recession_year_keeps_recession_analogs():
    # if the CURRENT year is itself a recession, recession analogs are NOT excluded for that reason
    a = sr.select_analogs(2020, [2008, 2001, 2014])
    assert 2008 in a.years or 2001 in a.years


# ── bucket math ───────────────────────────────────────────────────────────────
def test_bucket_returns_shape_and_finiteness():
    close = synth(2000, 2010)
    rets = sr.year_bucket_returns(close)
    assert all(len(v) == sr.N_BUCKETS for v in rets.values())
    # a full interior year should be (nearly) fully finite
    assert int(np.isfinite(rets[2005]).sum()) >= sr.COMPLETE_MIN


# ── full outlook: structure, schema, signal ──────────────────────────────────
def _schema():
    return json.loads((ROOT / "contracts" / "seasonal_outlook.v1.schema.json").read_text())


def test_build_outlook_structure_and_schema():
    jsonschema = pytest.importorskip("jsonschema")
    close = synth(1994, 2025, nov_dec=0.0)
    out = sr.build_outlook("SYNTH", close, as_of=pd.Timestamp("2026-07-08"))
    jsonschema.validate(out, _schema())   # contract holds
    assert out["mode"] in ("regime_weighted", "baseline_fallback")
    assert out["current_year"]["cycle_pos"] == "midterm"
    assert out["forward_buckets"] and all("baseline" in b and "regime" in b for b in out["forward_buckets"])
    assert "intervals_baseline" in out and "intervals_regime" in out
    assert out["validation"]["verdict"] in ("edge", "no_edge", "anti", "untested")


def test_seasonal_signal_is_detected():
    # inject a strong Nov–Dec drift; those buckets must read bullish in the baseline view
    close = synth(1994, 2025, nov_dec=0.004)
    out = sr.build_outlook("SEAS", close, as_of=pd.Timestamp("2026-07-08"))
    by_label = {b["label"]: b["baseline"] for b in out["forward_buckets"]}
    strong = [by_label[l] for l in ("Nov H1", "Nov H2", "Dec H1") if l in by_label]
    assert strong, "expected Nov/Dec forward buckets"
    assert sum(1 for s in strong if s["dir"] == "bull") >= 2
    assert all((s["mean"] or 0) > 0 for s in strong)


def test_no_lookahead_forward_only():
    close = synth(1994, 2025)
    as_of = pd.Timestamp("2026-07-08")
    out = sr.build_outlook("FWD", close, as_of=as_of)
    for b in out["forward_buckets"]:
        assert pd.Timestamp(b["end"]) > as_of          # never a past bucket
    for a in out["analogs"]:
        assert a["year"] < 2026                          # analogs are completed prior years only


# ── degraded modes ────────────────────────────────────────────────────────────
def test_insufficient_history():
    close = synth(2024, 2025)
    out = sr.build_outlook("SHORT", close, as_of=pd.Timestamp("2026-07-08"))
    assert out["mode"] == "insufficient"


def test_unavailable_on_adjustment_gap():
    close = synth(2000, 2020)
    close.iloc[len(close) // 2] *= 2.5                   # an unadjusted-split-sized jump
    out = sr.build_outlook("GAP", close, as_of=pd.Timestamp("2026-07-08"))
    assert out["mode"] == "unavailable"


def test_determinism():
    close = synth(1994, 2025, seed=11)
    a = sr.build_outlook("DET", close, as_of=pd.Timestamp("2026-07-08"))
    b = sr.build_outlook("DET", close, as_of=pd.Timestamp("2026-07-08"))
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_direction_stable_under_threshold_perturbation(monkeypatch):
    # red-team #6: a ±50% nudge to the direction dead-zone must not flip any bucket bull<->bear
    # (only directional<->neutral at the margins). The underlying means are knob-free.
    close = synth(1994, 2025, nov_dec=0.003)
    base = sr.build_outlook("S", close, as_of=pd.Timestamp("2026-07-08"))
    monkeypatch.setattr(sr, "DELTA", sr.DELTA * 1.5)
    pert = sr.build_outlook("S", close, as_of=pd.Timestamp("2026-07-08"))
    for b0, b1 in zip(base["forward_buckets"], pert["forward_buckets"]):
        assert {b0["baseline"]["dir"], b1["baseline"]["dir"]} != {"bull", "bear"}
