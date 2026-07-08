"""Regime-aware forward seasonal-outlook engine.

Given a stock's daily adjusted-close history + today's date, produce a SPECULATIVE,
display-only outlook: which upcoming calendar intervals have historically shown bullish
vs bearish momentum — but computed only from historical years whose macro REGIME resembles
the current year's, with anomalous years exception-filtered out.

Design (deliberately lean + honest — see docs/design and the red-team that shaped it):

  * PRE-REGISTERED buckets. The year is split into 24 fixed semi-monthly buckets (1st–15th,
    16th–EOM). Stats are computed per bucket for ALL of them — never data-mined "best windows"
    — so per-bucket win-rates are not post-selection-inflated.

  * ANALOG SELECTION. Complete historical years are filtered (drop recession/crisis/war/mania/
    covid/high-inflation years UNLESS the current year shares that flag) then weighted by regime
    similarity to the current year: cycle-position match × Fed-rate-direction affinity. Two knobs.

  * VALIDATION IS THE POINT. Leave-one-year-out: for each past year, predict its buckets from the
    OTHER years' regime-weighted composite and score directional hit-rate vs an equal-weight
    baseline. If regime-weighting shows no out-of-sample edge for this name, we SAY SO and fall
    back to the baseline. The regime story is earned per-stock, not assumed.

  * SMALL-N HONESTY. Shrink the analog composite toward the all-years baseline by effective analog
    count; report N_eff as an "effective analog count" (never a fake binomial trial count); report
    the actual p20–p80 spread of what analog years did as a "plausible range" (not a CI); default
    confidence to LOW; cap confidence when the analog floor forces re-admitting filtered years.

Everything is deterministic (no RNG) and pure (close series in → dict out).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from signal_layer import regime_calendar as rc

ENGINE_VERSION = "0.1.0"
SCHEMA = "mastermind.seasonal_outlook/v1"

N_BUCKETS = 24
MIN_ANALOGS = 3          # floor before we relax the anomaly filter
COMPLETE_MIN = 22        # a "complete" year needs ≥ this many of 24 buckets finite
SHRINK_K = 4.0           # λ = N_eff/(N_eff+K): more analogs → trust the regime composite more
DELTA = 0.004            # ±0.4% dead-zone: smaller bucket means are treated as directionless noise
WIN_BULL, WIN_BEAR = 0.55, 0.45
CYCLE_EXACT, CYCLE_OTHER = 1.0, 0.30
WHIPSAW_SOFT = 0.6       # whipsaw years' annual rate label is lossy → soft-cap their rate affinity
# reverse-severity order for relaxation (least severe re-admitted first)
_RELAX_ORDER = ["high_inflation", "mania_bubble", "war_oil_shock", "crisis", "covid", "recession"]
_HALF_LABEL = {0: "H1", 1: "H2"}
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ── calendar buckets ──────────────────────────────────────────────────────────
def bucket_index(month: int, half: int) -> int:
    return (month - 1) * 2 + half


def bucket_label(idx: int) -> str:
    m, h = idx // 2, idx % 2
    return f"{_MONTHS[m]} {_HALF_LABEL[h]}"


def _bucket_end_dates(year: int) -> list[pd.Timestamp]:
    """24 ascending end-dates: the 15th and the month-end of each month."""
    out: list[pd.Timestamp] = []
    for m in range(1, 13):
        out.append(pd.Timestamp(year, m, 15))
        out.append(pd.Timestamp(year, m, 1) + pd.offsets.MonthEnd(0))
    return out


def _asof(close: pd.Series, d: pd.Timestamp) -> float:
    """Last close on/before d, or NaN if d precedes the series."""
    try:
        v = close.asof(d)
    except Exception:
        return float("nan")
    return float(v) if v is not None and np.isfinite(v) else float("nan")


def year_bucket_returns(close: pd.Series) -> dict[int, np.ndarray]:
    """Per year → array(24) of semi-monthly returns (end_i / end_{i-1} − 1).

    Bucket 0's base is the prior-year Dec-31 close (captures the turn of year); NaN where the
    prior year is unavailable or the stock had no trade in/before a bucket.
    """
    years = sorted({int(t.year) for t in close.index})
    out: dict[int, np.ndarray] = {}
    for y in years:
        ends = _bucket_end_dates(y)
        vals = np.array([_asof(close, d) for d in ends], dtype=float)
        prev_dec = _asof(close, pd.Timestamp(y - 1, 12, 31))
        rets = np.full(N_BUCKETS, np.nan)
        for i in range(N_BUCKETS):
            base = prev_dec if i == 0 else vals[i - 1]
            v = vals[i]
            if np.isfinite(base) and np.isfinite(v) and base != 0:
                rets[i] = v / base - 1.0
        out[y] = rets
    return out


def _complete_years(bucket_rets: dict[int, np.ndarray], upto_year: int) -> list[int]:
    """Historical years (< upto_year) with enough finite buckets to be a usable template."""
    return [y for y, r in bucket_rets.items()
            if y < upto_year and int(np.isfinite(r).sum()) >= COMPLETE_MIN]


# ── analog selection ──────────────────────────────────────────────────────────
def _cycle_weight(a: str, b: str) -> float:
    return CYCLE_EXACT if a == b else CYCLE_OTHER


def _pair_weight(cur: rc.RegimeYear, hist: rc.RegimeYear) -> float:
    w = _cycle_weight(cur.cycle_pos, hist.cycle_pos)
    ra = rc.rate_affinity(cur.rate_dir, hist.rate_dir)
    if hist.whipsaw:
        ra *= WHIPSAW_SOFT
    return w * ra


@dataclass
class AnalogSet:
    years: list[int]
    weights: np.ndarray            # normalized, aligned to `years`
    n_eff: float
    relaxed: list[str]             # anomaly buckets re-admitted to reach the floor
    kept_flags: frozenset          # anomaly flags the current year itself carries (so we keep them)


def select_analogs(cur_year: int, candidate_years: list[int]) -> AnalogSet:
    """Exception-filter then regime-weight. Relax the filter (reverse severity) only to reach the
    analog floor — and record what was relaxed so confidence can be capped."""
    cur = rc.regime(cur_year)
    cur_flags = rc.anomaly_flags(cur_year)

    def eligible(banned: set[str]) -> list[int]:
        out = []
        for y in candidate_years:
            yf = rc.anomaly_flags(y)
            # drop a year only for anomaly flags the current year does NOT share and that are banned
            if (yf - cur_flags) & banned:
                continue
            out.append(y)
        return out

    banned = set(_RELAX_ORDER)                       # start by banning every anomaly the cur year lacks
    banned -= cur_flags                              # …but never ban a flag the current year itself has
    kept = eligible(banned)
    relaxed: list[str] = []
    # relax least-severe first until we clear the floor (or run out)
    for flag in _RELAX_ORDER:
        if len(kept) >= MIN_ANALOGS:
            break
        if flag in banned:
            banned.discard(flag)
            relaxed.append(flag)
            kept = eligible(banned)

    if not kept:
        return AnalogSet([], np.array([]), 0.0, relaxed, frozenset(cur_flags))

    w = np.array([_pair_weight(cur, rc.regime(y)) for y in kept], dtype=float)
    if w.sum() <= 0:                                 # degenerate (e.g. all zero affinity) → uniform
        w = np.ones(len(kept))
    w = w / w.sum()
    n_eff = float(1.0 / np.sum(w ** 2)) if w.size else 0.0
    return AnalogSet(kept, w, n_eff, relaxed, frozenset(cur_flags))


# ── weighted stats ────────────────────────────────────────────────────────────
def _weighted_quantile(vals: np.ndarray, weights: np.ndarray, q: float) -> float:
    if vals.size == 0:
        return float("nan")
    order = np.argsort(vals)
    v, wq = vals[order], weights[order]
    cw = np.cumsum(wq) - 0.5 * wq
    cw /= wq.sum()
    return float(np.interp(q, cw, v))


def _bucket_stat(rets_by_year: dict[int, np.ndarray], years: list[int], weights: np.ndarray,
                 idx: int, baseline_years: list[int]) -> dict:
    """Composite one bucket across the (weighted) analog years, shrunk toward the equal-weight
    baseline over ALL complete years."""
    vals, wts = [], []
    for y, w in zip(years, weights):
        r = rets_by_year[y][idx]
        if np.isfinite(r):
            vals.append(r); wts.append(w)
    vals = np.array(vals); wts = np.array(wts)
    n = int(vals.size)
    base_vals = np.array([rets_by_year[y][idx] for y in baseline_years
                          if np.isfinite(rets_by_year[y][idx])])
    baseline_mean = float(base_vals.mean()) if base_vals.size else float("nan")
    if n == 0:
        return {"idx": idx, "n": 0, "mean": None, "median": None, "win_rate": None,
                "lo": None, "hi": None, "baseline": _r(baseline_mean), "dir": "neutral"}
    wts = wts / wts.sum()
    n_eff = float(1.0 / np.sum(wts ** 2))
    a_mean = float(np.sum(vals * wts))
    a_median = _weighted_quantile(vals, wts, 0.5)
    win_rate = float(np.sum(wts[vals > 0]))
    lo = _weighted_quantile(vals, wts, 0.20)
    hi = _weighted_quantile(vals, wts, 0.80)
    # shrink the mean toward the baseline by effective analog count
    if np.isfinite(baseline_mean):
        lam = n_eff / (n_eff + SHRINK_K)
        shown = baseline_mean + lam * (a_mean - baseline_mean)
    else:
        shown = a_mean
    direction = "bull" if (shown > DELTA and win_rate >= WIN_BULL) else \
                "bear" if (shown < -DELTA and win_rate <= WIN_BEAR) else "neutral"
    return {"idx": idx, "n": n, "mean": _r(shown), "median": _r(a_median),
            "win_rate": round(win_rate, 3), "lo": _r(lo), "hi": _r(hi),
            "baseline": _r(baseline_mean), "dir": direction}


def _r(x, nd=4):
    return None if x is None or not np.isfinite(x) else round(float(x) * 100, 2)  # store as %


# ── leave-one-year-out validation (the honest core) ──────────────────────────
def loyo_validation(rets_by_year: dict[int, np.ndarray], complete_years: list[int]) -> dict:
    """For each complete year, predict every bucket's sign from the OTHER years' regime-weighted
    composite; score directional hit-rate vs an equal-weight baseline. Skill = regime − baseline."""
    if len(complete_years) < 4:
        return {"loyo_years": len(complete_years), "regime_hit": None, "baseline_hit": None,
                "skill": None, "verdict": "untested"}
    reg_hits, base_hits, k = 0.0, 0.0, 0
    for target in complete_years:
        others = [y for y in complete_years if y != target]
        aset = select_analogs(target, others)
        if not aset.years:
            continue
        actual = rets_by_year[target]
        for idx in range(N_BUCKETS):
            a = actual[idx]
            if not np.isfinite(a) or abs(a) < DELTA:      # skip directionless actuals
                continue
            reg = _bucket_stat(rets_by_year, aset.years, aset.weights, idx, others)
            base = _bucket_stat(rets_by_year, others, np.ones(len(others)) / len(others), idx, others)
            if reg["mean"] is not None:
                reg_hits += 1.0 if math.copysign(1, reg["mean"]) == math.copysign(1, a) else 0.0
            if base["mean"] is not None:
                base_hits += 1.0 if math.copysign(1, base["mean"]) == math.copysign(1, a) else 0.0
            k += 1
    if k == 0:
        return {"loyo_years": len(complete_years), "regime_hit": None, "baseline_hit": None,
                "skill": None, "verdict": "untested"}
    reg_hit, base_hit = reg_hits / k, base_hits / k
    skill = reg_hit - base_hit
    verdict = "edge" if skill > 0.03 else "no_edge" if skill >= -0.03 else "anti"
    return {"loyo_years": len(complete_years), "n_predictions": k,
            "regime_hit": round(reg_hit, 3), "baseline_hit": round(base_hit, 3),
            "skill": round(skill, 3), "verdict": verdict}


# ── adjustment sanity (precondition, not open question) ──────────────────────
def _adjustment_ok(close: pd.Series) -> bool:
    """Reject a series with an unadjusted-split-sized single-day jump (would corrupt every return)."""
    if close.size < 5:
        return True
    step = close.pct_change(fill_method=None).abs()
    return bool(step.max(skipna=True) < 0.60)   # >60% one-day move ⇒ almost certainly an adjustment gap


# ── forward projection ────────────────────────────────────────────────────────
def _forward_buckets(as_of: pd.Timestamp, months_ahead: int = 18) -> list[dict]:
    """Concrete upcoming buckets (this year's remainder + into next), each mapped to its (month,half)
    seasonal slot. First included bucket is the one whose window is still open or upcoming."""
    out = []
    y, m = as_of.year, as_of.month
    for k in range(months_ahead + 1):
        mm = (m - 1 + k) % 12 + 1
        yy = y + (m - 1 + k) // 12
        for half in (0, 1):
            start = pd.Timestamp(yy, mm, 1) if half == 0 else pd.Timestamp(yy, mm, 16)
            end = pd.Timestamp(yy, mm, 15) if half == 0 else pd.Timestamp(yy, mm, 1) + pd.offsets.MonthEnd(0)
            if end <= as_of:
                continue
            out.append({"idx": bucket_index(mm, half), "year": yy,
                        "start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d")})
    # keep ~one forward year of buckets
    return out[:26]


def _merge_intervals(forward: list[dict], stats: dict[int, dict]) -> list[dict]:
    """Merge contiguous same-direction forward buckets into display intervals with pooled stats."""
    intervals = []
    cur = None
    for fb in forward:
        s = stats[fb["idx"]]
        d = s["dir"]
        if cur and cur["dir"] == d and d != "neutral":
            cur["end"] = fb["end"]; cur["_idxs"].append(fb["idx"])
        else:
            if cur and cur["dir"] != "neutral":
                intervals.append(cur)
            cur = {"dir": d, "start": fb["start"], "end": fb["end"], "_idxs": [fb["idx"]]}
    if cur and cur["dir"] != "neutral":
        intervals.append(cur)
    # pool: compounded shown mean, min win-rate, min n across the merged buckets
    out = []
    for iv in intervals:
        idxs = iv["_idxs"]
        comp = 1.0
        wins, ns = [], []
        for i in idxs:
            m = stats[i]["mean"]
            comp *= (1 + (m or 0) / 100)
            if stats[i]["win_rate"] is not None:
                wins.append(stats[i]["win_rate"])
            ns.append(stats[i]["n"])
        out.append({"dir": iv["dir"], "start": iv["start"], "end": iv["end"],
                    "expected_move": round((comp - 1) * 100, 2),
                    "win_rate": round(min(wins), 3) if wins else None,
                    "n": min(ns) if ns else 0,
                    "buckets": [bucket_label(i) for i in idxs]})
    return out


def _confidence(n: int, win_rate, verdict: str, relaxed: bool, mode: str) -> str:
    """Confidence in a single interval. Reflects the SAMPLE robustness (years × win-rate
    extremity); a regime-weighted interval can't claim HIGH unless regime-weighting is
    validated (verdict 'edge'); relaxed/tiny samples are floored to LOW."""
    if win_rate is None or n < MIN_ANALOGS or relaxed:
        return "low"
    ext = abs(win_rate - 0.5)
    if n >= 25 and ext >= 0.15:
        tier = "high"
    elif n >= 12 and ext >= 0.10:
        tier = "medium"
    else:
        tier = "low"
    if mode == "regime_weighted" and verdict != "edge" and tier == "high":
        tier = "medium"          # unvalidated regime tilt can't be "high"
    return tier


# ── orchestration ─────────────────────────────────────────────────────────────
def build_outlook(symbol: str, close: pd.Series, as_of: pd.Timestamp | None = None) -> dict:
    """Full regime-aware forward outlook dict for one symbol (the display contract)."""
    close = close.dropna().sort_index()
    if as_of is None:
        as_of = close.index[-1] if close.size else pd.Timestamp.utcnow().normalize()
    as_of = pd.Timestamp(as_of).normalize()
    cur_year = int(as_of.year)
    disclaimer = ("Speculative, display-only seasonal outlook. Built from a small number of "
                  "regime-analog years — not a forecast and not investment advice.")

    adj_ok = _adjustment_ok(close)
    rets = year_bucket_returns(close)
    complete = _complete_years(rets, cur_year)
    cur_reg = rc.regime(cur_year)

    base = {
        "schema": SCHEMA, "engine_version": ENGINE_VERSION,
        "regime_table_version": rc.REGIME_TABLE_VERSION,
        "symbol": symbol, "as_of": as_of.strftime("%Y-%m-%d"),
        "is_display_only": True,
        "current_year": {**cur_reg.as_dict(), "anomaly_flags": sorted(rc.anomaly_flags(cur_year))},
        "history": {
            "first_year": int(close.index[0].year) if close.size else None,
            "last_date": close.index[-1].strftime("%Y-%m-%d") if close.size else None,
            "complete_years": len(complete),
            "coverage": "deep" if len(complete) >= 20 else "medium" if len(complete) >= 10 else "thin",
        },
        "disclaimer": disclaimer,
    }

    if not adj_ok:
        return {**base, "mode": "unavailable",
                "honest_read": "Price history has an unadjusted split/dividend gap; outlook suppressed to avoid corrupt returns."}
    if len(complete) < 3:
        return {**base, "mode": "insufficient",
                "honest_read": f"Only {len(complete)} complete historical years — too short for a regime-analog seasonal read. Need ≥3."}

    aset = select_analogs(cur_year, complete)
    val = loyo_validation(rets, complete)

    # Two composites, ALWAYS computed: the equal-weight all-years BASELINE (the null) and the
    # regime-weighted TILT. The baseline is the null the tilt must beat out-of-sample (red-team F1).
    eq_w = np.ones(len(complete)) / len(complete)
    baseline_stats = {i: _bucket_stat(rets, complete, eq_w, i, complete) for i in range(N_BUCKETS)}
    regime_stats = ({i: _bucket_stat(rets, aset.years, aset.weights, i, complete) for i in range(N_BUCKETS)}
                    if aset.years else baseline_stats)

    # DEFAULT view = the regime tilt ONLY when leave-one-year-out earned it AND there is enough
    # history for that verdict to be credible (thin-history skill is unreliable). The regime view
    # is still always available as a toggle; this only gates which view LEADS.
    use_regime = val["verdict"] == "edge" and val.get("loyo_years", 0) >= 15 and bool(aset.years)
    default_view = "regime" if use_regime else "baseline"
    mode = "regime_weighted" if use_regime else "baseline_fallback"

    def view_bucket(s: dict, mode_for_conf: str) -> dict:
        return {"dir": s["dir"], "mean": s["mean"], "median": s["median"], "win_rate": s["win_rate"],
                "n": s["n"], "lo": s["lo"], "hi": s["hi"],
                "confidence": _confidence(s["n"], s["win_rate"], val["verdict"], bool(aset.relaxed), mode_for_conf)}

    forward = _forward_buckets(as_of)
    fb_out = []
    for fb in forward:
        i = fb["idx"]
        fb_out.append({"start": fb["start"], "end": fb["end"], "label": bucket_label(i),
                       "baseline": view_bucket(baseline_stats[i], "baseline_fallback"),
                       "regime": view_bucket(regime_stats[i], "regime_weighted")})
    intervals_baseline = _merge_intervals(forward, baseline_stats)
    intervals_regime = _merge_intervals(forward, regime_stats)

    # The analog set is ALWAYS surfaced — the regime analysis is the point, even when validation
    # says to trust the baseline. The display shows which years it leaned on + how much they tilt it.
    analog_out = [{"year": y, "weight": round(float(w), 3), **rc.regime(y).as_dict()}
                  for y, w in sorted(zip(aset.years, aset.weights), key=lambda t: -t[1])]

    honest = _honest_read(symbol, cur_reg, aset, val, mode, len(complete), intervals_baseline)
    return {
        **base,
        "mode": mode,
        "default_view": default_view,
        "n_eff": round(aset.n_eff, 2),      # effective analog COUNT (not a sample/trial size)
        "n_eff_note": "effective weighted analog COUNT — not an independent-sample size; cycle-spaced analogs are macro-correlated.",
        "relaxed_filters": aset.relaxed,
        "validation": val,
        "analogs": analog_out,
        "forward_buckets": fb_out,
        "intervals_baseline": intervals_baseline,
        "intervals_regime": intervals_regime,
        "honest_read": honest,
    }


def _honest_read(symbol, cur, aset, val, mode, n_complete, intervals) -> str:
    bits = [f"{symbol}: {cur.cycle_pos.replace('_', ' ')} year, rates {cur.rate_dir}"]
    if cur.provisional:
        bits.append("(current-year regime is a provisional as-of estimate; analog years carry full-year hindsight)")
    if mode == "baseline_fallback":
        v = val.get("skill")
        if val["verdict"] == "anti":
            bits.append(f"regime-weighting UNDER-performed an equal-weight baseline out-of-sample (skill {v}); showing the plain all-years seasonal baseline instead")
        elif val["verdict"] == "untested":
            bits.append("too little history to validate regime-weighting; showing the plain all-years seasonal baseline")
        else:
            bits.append(f"regime-weighting showed no measurable out-of-sample edge (skill {v}); showing the equal-weight baseline")
    else:
        bits.append(f"leaning on {len(aset.years)} regime-analog years (N_eff≈{aset.n_eff:.1f})")
        if val.get("skill") is not None:
            bits.append(f"regime-weighting beat baseline by {val['skill']:+.0%} directional hit-rate in leave-one-year-out over {n_complete} years")
    if aset.relaxed:
        bits.append(f"analog floor forced re-admitting {', '.join(aset.relaxed)} years — confidence capped low")
    nb = sum(1 for iv in intervals if iv["dir"] == "bull")
    nr = sum(1 for iv in intervals if iv["dir"] == "bear")
    bits.append(f"{nb} bullish / {nr} bearish upcoming window(s) flagged")
    return ". ".join(bits) + "."
