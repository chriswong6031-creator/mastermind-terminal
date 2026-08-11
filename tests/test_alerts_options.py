"""Parity + truth-table guard for the Python options-alert evaluators.

Feeds ingest.alerts_engine.evaluate() synthetic conditions + a fake Flow and asserts the
fire / re-arm / hysteresis / missing-payload truth table matches terminal/lib/optionsAlerts.ts
(and its vitest). This is the drift guard: the two implementations MUST agree. Real fixtures under
terminal/public/data are used for one smoke assertion per type.

No network, no Supabase — evaluate() is pure given (alert, data=None, flow).
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import ingest.alerts_engine as ae  # noqa: E402

DATA = ROOT / "terminal" / "public" / "data"


class StubFlow:
    """A hand-fed Flow: each accessor returns whatever was stashed for it (or None)."""

    def __init__(self, gexstate=None, gex=None, tide=None, dte=None, surface=None):
        self._gexstate = gexstate
        self._gex = gex
        self._tide = tide
        self._dte = dte
        self._surface = surface

    def gexstate(self, root):  # noqa: ARG002 — single-root fixture ignores root, like prod dev
        return self._gexstate

    def gamma_state(self, root):  # noqa: ARG002 — normalized production accessor
        return self._gexstate

    def gex(self, root):  # noqa: ARG002
        return self._gex

    def tide(self):
        return self._tide

    def dte(self):
        return self._dte

    def surface(self, root):  # noqa: ARG002 — single-root stub, like the fixture in dev
        return self._surface


def _alert(cond):
    return {"symbol": cond.get("root", "SPY"), "condition": cond, "created_at": "2026-07-01"}


def _eval(cond, flow):
    """evaluate() → (fired, value, note, nextState)."""
    return ae.evaluate(_alert(cond), None, flow)


# ─── (a) gamma-flip cross ─────────────────────────────────────────────────────
GS = lambda spot, flip=748.25: {"root": "SPY", "spot": spot, "gamma_flip": flip, "asof": "2026-07-10T06:21Z"}  # noqa: E731


def test_gamma_flip_first_obs_arms_no_fire():
    fired, val, note, nxt = _eval({"type": "opt_gamma_flip", "root": "SPY"}, StubFlow(gexstate=GS(751.71)))
    assert fired is False
    assert nxt == {"side": "above"}
    assert val == 751.71


def test_gamma_flip_below_to_above_fires_once():
    cond = {"type": "opt_gamma_flip", "root": "SPY", "band_pct": 0.05, "_fs": {"side": "below"}}
    fired, val, note, nxt = _eval(cond, StubFlow(gexstate=GS(752)))
    assert fired is True
    assert "crossed above" in note
    assert "748.25" in note
    assert "long-gamma" in note
    assert "as of" in note
    assert nxt == {"side": "above"}


def test_gamma_flip_above_to_below_fires():
    cond = {"type": "opt_gamma_flip", "root": "SPY", "_fs": {"side": "above"}}
    fired, val, note, nxt = _eval(cond, StubFlow(gexstate=GS(744)))
    assert fired is True
    assert "crossed below" in note
    assert "short-gamma" in note
    assert nxt == {"side": "below"}


def test_gamma_flip_hysteresis_deadband_holds_side():
    # 748.0 is 0.033% below flip → inside the 0.05% band → hold prior "above", no fire.
    cond = {"type": "opt_gamma_flip", "root": "SPY", "band_pct": 0.05, "_fs": {"side": "above"}}
    fired, val, note, nxt = _eval(cond, StubFlow(gexstate=GS(748.0)))
    assert fired is False
    assert nxt == {"side": "above"}


def test_gamma_flip_no_refire_same_side():
    cond = {"type": "opt_gamma_flip", "root": "SPY", "_fs": {"side": "above"}}
    fired, _, _, nxt = _eval(cond, StubFlow(gexstate=GS(753)))
    assert fired is False
    assert nxt == {"side": "above"}


def test_gamma_flip_missing_payload_null():
    for gs in [{"root": "SPY", "gamma_flip": 748.25}, {"root": "SPY", "spot": 752}, {}, None]:
        fired, val, note, nxt = _eval({"type": "opt_gamma_flip", "root": "SPY", "_fs": {"side": "below"}}, StubFlow(gexstate=gs))
        assert fired is None, gs
        assert "unavailable" in note
        assert nxt == {"side": "below"}  # state preserved on skip


# ─── (b) wall proximity ───────────────────────────────────────────────────────
GX = lambda spot: {"root": "NVDA", "spot_ref": spot, "call_wall": 150, "put_wall": 120, "asof": "2026-07-05T16:05:00Z"}  # noqa: E731


def test_wall_first_obs_outside_arms():
    fired, _, _, nxt = _eval({"type": "opt_wall_touch", "root": "NVDA", "wall": "call"}, StubFlow(gex=GX(135.7)))
    assert fired is False
    assert nxt == {"inside": False}


def test_wall_first_obs_inside_arms_no_fire():
    fired, _, _, nxt = _eval({"type": "opt_wall_touch", "root": "NVDA", "wall": "call"}, StubFlow(gex=GX(149.9)))
    assert fired is False
    assert nxt == {"inside": True}


def test_wall_enter_fires_once_note_eod():
    cond = {"type": "opt_wall_touch", "root": "NVDA", "wall": "call", "within_pct": 0.25, "_wp": {"inside": False}}
    fired, val, note, nxt = _eval(cond, StubFlow(gex=GX(149.8)))
    assert fired is True
    assert "EOD" in note
    assert "call wall" in note
    assert "150" in note
    assert val == 149.8
    assert nxt == {"inside": True}


def test_wall_stay_inside_no_refire():
    cond = {"type": "opt_wall_touch", "root": "NVDA", "wall": "call", "_wp": {"inside": True}}
    fired, _, _, nxt = _eval(cond, StubFlow(gex=GX(149.85)))
    assert fired is False
    assert nxt == {"inside": True}


def test_wall_leave_then_reenter_fires_again():
    c = lambda inside: {"type": "opt_wall_touch", "root": "NVDA", "wall": "call", "_wp": {"inside": inside}}  # noqa: E731
    assert _eval(c(False), StubFlow(gex=GX(149.8)))[0] is True   # enter
    assert _eval(c(True), StubFlow(gex=GX(145)))[0] is False     # leave
    assert _eval(c(False), StubFlow(gex=GX(149.8)))[0] is True   # re-enter


def test_wall_put_reads_put_wall():
    cond = {"type": "opt_wall_touch", "root": "NVDA", "wall": "put", "_wp": {"inside": False}}
    fired, _, note, _ = _eval(cond, StubFlow(gex=GX(120.2)))
    assert fired is True
    assert "put wall" in note and "120" in note


def test_wall_missing_null():
    cond = {"type": "opt_wall_touch", "root": "NVDA", "wall": "call", "_wp": {"inside": False}}
    fired, _, note, _ = _eval(cond, StubFlow(gex={"root": "NVDA", "spot_ref": 149.8, "put_wall": 120}))
    assert fired is None
    assert "unavailable" in note


# ─── (c) premium burst ────────────────────────────────────────────────────────
# These fixtures mirror terminal/lib/__tests__/optionsAlerts.test.ts VERBATIM (same deltas,
# same window, same expected z) — that identity IS the parity guard.
M = 1_000_000  # z is scale-invariant; realistic premium magnitudes


def _tide(deltas):
    """Tide payload from per-minute DELTAS. Both legs ride the same cumulative path, so `leg`
    selection is orthogonal to the math (mirrors tideFromDeltas in the vitest)."""
    def stamp(i):
        m = 30 + i
        return f"{9 + m // 60:02d}:{m % 60:02d}"

    minutes, v = [{"t": stamp(0), "ncp": 0, "npp": 0}], 0
    for i, d in enumerate(deltas):
        v += d
        minutes.append({"t": stamp(i + 1), "ncp": v, "npp": v})
    return {"minutes": minutes, "asof": "2026-07-05T15:42:00Z", "session_date": "2026-07-05"}


def _rep(pair, times):
    return list(pair) * times


HOT = [x * M for x in _rep([1, 2], 10) + [10, 10, 10]]        # calm, then a 3-min burst
SLOW = [x * M for x in _rep([10, 11], 10) + [0, 0, 0]]        # fast, then a dead stop
CONTAM = [x * M for x in _rep([1, 2], 7) + [1] + [100] * 5]   # calm, then a ~67x burst
CALM = [x * M for x in _rep([1, 2], 10) + [1, 2, 1]]          # control


def _old_z(series, window):
    """The OLD (pre-fix) formula, kept ONLY so the regression tests can prove what changed."""
    d = [series[i] - series[i - 1] for i in range(1, len(series))]
    n = len(d)
    mean = sum(d) / n
    std = math.sqrt(sum((x - mean) ** 2 for x in d) / n)
    w = max(1, min(window, n))
    return (sum(d[n - w:]) / w - mean) / std


def _series(tide):
    return [m["ncp"] for m in tide["minutes"]]


def test_slope_stats_baseline_excludes_the_window():
    s = ae._session_slope_stats(_series(_tide(HOT)), 3)
    assert s["n"] == 23
    assert s["w"] == 3
    assert s["baseN"] == 20  # the 3 burst deltas are NOT in the baseline
    assert abs(s["baseMean"] - 1.5 * M) < 1e-6
    assert abs(s["baseStd"] - 0.5 * M) < 1e-6
    assert s["winMean"] == 10 * M
    # Two-sample SE of the mean DIFFERENCE — baseStd*sqrt(1/w + 1/baseN), not baseStd/sqrt(w).
    se = 0.5 * M * math.sqrt(1 / 3 + 1 / 20)
    assert abs(s["se"] - se) < 1e-6
    assert abs(s["z"] - (10 * M - 1.5 * M) / se) < 1e-6
    assert abs(s["z"] - 27.457477) < 1e-5  # vitest: optionsAlerts.test.ts
    assert s["why"] == ""


def test_slope_stats_one_sample_se_inflated_z_regression():
    """At the minimum baseline the guard admits (baseN = 2w), the OLD one-sample SE
    (baseStd/sqrt(w)) inflated z by exactly sqrt(1.5) — a '2 sigma' alert fired at 1.63."""
    base = _rep([1, 2], 5)  # 10 calm deltas, baseStd 0.5
    at_min = ae._session_slope_stats(_series(_tide(base + [9] * 5)), 5)
    assert at_min["baseN"] == 2 * at_min["w"]
    old_se = at_min["baseStd"] / math.sqrt(at_min["w"])
    z_old = (at_min["winMean"] - at_min["baseMean"]) / old_se
    assert abs(at_min["z"] / z_old - 1 / math.sqrt(1.5)) < 1e-9
    assert abs(z_old / at_min["z"] - math.sqrt(1.5)) < 1e-9


def test_slope_stats_two_sample_se_scaling():
    """The old baseStd/sqrt(w) form made z scale by EXACTLY sqrt(w2/w1) between two windows;
    the two-sample SE does not, because each window carries its own baseline size."""
    base = _rep([1, 2], 20)  # 40 calm deltas, baseStd 0.5
    s1 = ae._session_slope_stats(_series(_tide(base + [9])), 1)
    s4 = ae._session_slope_stats(_series(_tide(base + [9, 9, 9, 9])), 4)
    assert s1["winMean"] == s4["winMean"] == 9
    se1 = 0.5 * math.sqrt(1 / 1 + 1 / 40)
    se4 = 0.5 * math.sqrt(1 / 4 + 1 / 40)
    assert abs(s1["se"] - se1) < 1e-9
    assert abs(s4["se"] - se4) < 1e-9
    assert abs(s4["z"] / s1["z"] - se1 / se4) < 1e-9
    assert abs(s4["z"] / s1["z"] - 2) > 0.01  # NOT the old sqrt(4)/sqrt(1)


def test_slope_stats_converges_to_one_sample_on_a_huge_baseline():
    """Sanity: baseN -> infinity is where the one-sample form is right, and the two agree."""
    s = ae._session_slope_stats(_series(_tide(_rep([1, 2], 5000) + [9, 9, 9])), 3)
    assert abs(s["se"] - 0.5 / math.sqrt(3)) < 1e-3


def test_slope_stats_min_sample_guard_null():
    s = ae._session_slope_stats(_series(_tide(_rep([1, 2], 7))), 10)
    assert s["baseN"] == 4
    assert s["z"] is None
    assert "not enough baseline" in s["why"]


def test_slope_stats_flat_baseline_null():
    s = ae._session_slope_stats(_series(_tide([5] * 20 + [9, 9, 9])), 3)
    assert s["baseStd"] == 0
    assert s["z"] is None
    assert "flat baseline" in s["why"]


def test_slope_stats_empty_series_null():
    assert ae._session_slope_stats([], 3)["z"] is None
    assert ae._session_slope_stats([1], 3)["z"] is None


def _burst_cond(**over):
    return {"type": "opt_premium_burst", "root": "SPY", "leg": "ncp", "window_min": 3, "z": 2, **over}


def test_premium_burst_hot_fires():
    fired, val, note, nxt = _eval(_burst_cond(), StubFlow(tide=_tide(HOT)))
    assert fired is True
    assert "unusual pace" in note
    assert "net-call premium" in note
    assert "intraday tape" in note
    assert abs(val - 27.46) < 0.01  # vitest parity
    assert "vs the 20m before it" in note


def test_premium_burst_npp_labels_put():
    fired, _, note, _ = _eval(_burst_cond(leg="npp"), StubFlow(tide=_tide(HOT)))
    assert fired is True
    assert "net-put premium" in note


def test_premium_burst_slow_tape_does_not_fire_regression():
    """One-sided: a dead-SLOW tape must NOT fire. The old two-sided abs(z) did."""
    tide = _tide(SLOW)
    fired, val, _, _ = _eval(_burst_cond(), StubFlow(tide=tide))
    assert fired is False
    assert val < 0  # pace collapsed, not burst
    assert abs(_old_z(_series(tide), 3)) >= 2  # proof: the old formula cleared the gate


def test_premium_burst_contaminated_baseline_regression():
    """A ~67x burst fires. The old math MISSED it: including the burst in its own baseline
    bounds the old z ABOVE by sqrt((n-w)/w) = sqrt(15/5) = sqrt(3) ~ 1.7321 no matter how
    violent the burst (approached, not reached, when the baseline has variance of its own),
    so the 2-sigma gate was unreachable."""
    tide = _tide(CONTAM)
    fired, val, _, _ = _eval(_burst_cond(window_min=5), StubFlow(tide=tide))
    assert fired is True
    assert abs(val - 382.47) < 0.1  # vitest parity
    ceiling = math.sqrt((20 - 5) / 5)
    z_old = _old_z(_series(tide), 5)
    assert z_old < ceiling
    assert abs(z_old - 1.732) < 5e-4
    assert abs(z_old) < 2


def test_premium_burst_calm_control_no_fire():
    fired, val, _, _ = _eval(_burst_cond(), StubFlow(tide=_tide(CALM)))
    assert fired is False
    assert abs(val) < 2


def test_premium_burst_idempotent_per_stamp():
    tide = _tide(HOT)
    first = _eval(_burst_cond(), StubFlow(tide=tide))
    assert first[0] is True
    again = _eval(_burst_cond(_pb=first[3]), StubFlow(tide=tide))
    assert again[0] is False  # same latest stamp


def test_premium_burst_short_history_null_regression():
    """15 samples with window 10: the OLD guard (len < window+2) let this through and scored
    a z off a 4-delta baseline. The new guard needs (1+2)*10+1 = 31 samples."""
    tide = _tide(_rep([1, 2], 7))
    assert len(tide["minutes"]) == 15
    fired, _, note, _ = _eval(_burst_cond(window_min=10), StubFlow(tide=tide))
    assert fired is None
    assert "not enough tape" in note
    assert math.isfinite(_old_z(_series(tide), 10))  # old code scored it anyway


def test_premium_burst_flat_tape_null():
    minutes = [{"t": f"09:{30 + i:02d}", "ncp": 5 * M, "npp": 5 * M} for i in range(40)]
    fired, _, note, _ = _eval(_burst_cond(), StubFlow(tide={"minutes": minutes, "asof": "x"}))
    assert fired is None
    assert "flat baseline" in note


# ─── (d) 0DTE share ───────────────────────────────────────────────────────────
def _big_share():
    return {
        "asof": "2026-07-05T15:42:00Z",
        "buckets": {
            "0d": [{"t": "09:30", "ncp": 100, "npp": 50}, {"t": "09:40", "ncp": 8_000_000, "npp": -1_000_000}],
            "1_7d": [{"t": "09:30", "ncp": 200, "npp": 100}, {"t": "09:40", "ncp": 500_000, "npp": -300_000}],
        },
    }


def test_0dte_big_share_fires():
    cond = {"type": "opt_0dte_spike", "root": "SPY", "share_pct": 55}
    fired, val, note, nxt = _eval(cond, StubFlow(dte=_big_share()))
    assert fired is True
    assert "0DTE share" in note
    assert "10-min DTE tape" in note
    assert val >= 55
    assert nxt["lastFiredT"] == "09:40"


def test_0dte_small_share_no_fire():
    small = {"asof": "x", "buckets": {"0d": [{"t": "09:40", "ncp": 100_000, "npp": 0}], "1_7d": [{"t": "09:40", "ncp": 9_000_000, "npp": 0}]}}
    fired, val, _, _ = _eval({"type": "opt_0dte_spike", "root": "SPY"}, StubFlow(dte=small))
    assert fired is False
    assert val < 55


def test_0dte_absent_0d_bucket_null_honest_disable():
    no0d = {"asof": "x", "buckets": {"1_7d": [{"t": "09:40", "ncp": 1, "npp": 1}]}}
    fired, _, note, _ = _eval({"type": "opt_0dte_spike", "root": "SPY"}, StubFlow(dte=no0d))
    assert fired is None
    assert "0DTE split unavailable" in note


def test_0dte_no_buckets_null():
    assert _eval({"type": "opt_0dte_spike", "root": "SPY"}, StubFlow(dte={}))[0] is None
    assert _eval({"type": "opt_0dte_spike", "root": "SPY"}, StubFlow(dte={"buckets": {}}))[0] is None


def test_0dte_idempotent_per_stamp():
    cond = {"type": "opt_0dte_spike", "root": "SPY", "share_pct": 55}
    big = _big_share()
    first = _eval(cond, StubFlow(dte=big))
    assert first[0] is True
    again = _eval({**cond, "_zd": first[3]}, StubFlow(dte=big))
    assert again[0] is False


# ─── (e) surface hot pocket ───────────────────────────────────────────────────
# Mirrors the vitest describe block VERBATIM (same grid, same expected ratios).
STEPS = ["09:31", "09:36", "09:41", "09:46", "09:51"]
LEVELS = [90, 95, 100, 105, 110]  # spot 100 → ±5% keeps 95/100/105 only


def _frame(newest, **over):
    """5 strikes × 5 intervals; the four trailing intervals are a flat 1M, newest per-row."""
    f = {
        "spot": 100,
        "price_levels": LEVELS,
        "time_steps": STEPS,
        "grids": {"netprem": [[1e6, 1e6, 1e6, 1e6, v] for v in newest]},
        "asof": "2026-07-06T09:51:00-04:00",
        "root": "SPY",
    }
    f.update(over)
    return f


def _pocket_cond(**over):
    return {"type": "opt_surface_pocket", "root": "SPY", "k": 4, "near_pct": 5, **over}


def test_pocket_hot_cell_fires():
    fired, val, note, nxt = _eval(_pocket_cond(), StubFlow(surface=_frame([0, 0, 8e6, 0, 0])))
    assert fired is True
    assert abs(val - 8) < 1e-6  # 8M / 1M scale
    assert "100 strike lit up 8.0×" in note
    assert "call-side" in note
    assert "09:51" in note
    assert nxt["lastFiredT"] == "09:51"
    assert nxt["lastStrike"] == 100


def test_pocket_negative_reads_put_side():
    fired, _, note, _ = _eval(_pocket_cond(), StubFlow(surface=_frame([0, 0, -8e6, 0, 0])))
    assert fired is True
    assert "put-side" in note


def test_pocket_below_k_does_not_fire():
    fired, val, _, _ = _eval(_pocket_cond(), StubFlow(surface=_frame([0, 0, 2e6, 0, 0])))
    assert fired is False
    assert abs(val - 2) < 1e-6


def test_pocket_outside_band_ignored():
    # 90 is 10% from spot → excluded from both the scale and the hunt.
    fired, val, _, _ = _eval(_pocket_cond(), StubFlow(surface=_frame([50e6, 0, 0, 0, 0])))
    assert fired is False
    assert val == 0


def test_pocket_newest_interval_excluded_from_its_own_scale():
    # If the 8M newest cell were in the scale the ratio would fall to ~5.5. Must stay 8.
    _, val, _, _ = _eval(_pocket_cond(), StubFlow(surface=_frame([0, 0, 8e6, 0, 0])))
    assert abs(val - 8) < 1e-6


def test_pocket_idempotent_per_interval():
    f = _frame([0, 0, 8e6, 0, 0])
    first = _eval(_pocket_cond(), StubFlow(surface=f))
    assert first[0] is True
    assert _eval(_pocket_cond(_sp=first[3]), StubFlow(surface=f))[0] is False


def test_pocket_too_few_intervals_null():
    f = _frame([0, 0, 8e6, 0, 0], time_steps=["09:31", "09:36", "09:41"],
               grids={"netprem": [[1e6, 1e6, v] for v in [0, 0, 8e6, 0, 0]]})
    fired, _, note, _ = _eval(_pocket_cond(), StubFlow(surface=f))
    assert fired is None
    assert "not enough surface history" in note


def test_pocket_zero_scale_null():
    f = _frame([0, 0, 8e6, 0, 0], grids={"netprem": [[0, 0, 0, 0, v] for v in [0, 0, 8e6, 0, 0]]})
    fired, _, note, _ = _eval(_pocket_cond(), StubFlow(surface=f))
    assert fired is None
    assert "too sparse to scale" in note


def test_pocket_no_strike_in_band_null():
    fired, _, note, _ = _eval(_pocket_cond(), StubFlow(surface=_frame([0, 0, 8e6, 0, 0], spot=500)))
    assert fired is None
    assert "no strikes near spot" in note


def test_pocket_missing_payload_null():
    assert _eval(_pocket_cond(), StubFlow(surface=None))[0] is None
    assert _eval(_pocket_cond(), StubFlow(surface=_frame([0, 0, 8e6, 0, 0], grids={})))[0] is None
    assert _eval(_pocket_cond(), StubFlow(surface=_frame([0, 0, 8e6, 0, 0], spot=None)))[0] is None


# ─── flow feed unavailable → SKIP (never disarm) ──────────────────────────────
def test_options_type_without_flow_is_skip():
    fired, _, note, nxt = ae.evaluate(_alert({"type": "opt_gamma_flip", "root": "SPY"}), None, None)
    assert fired is None
    assert "unavailable" in note
    assert nxt is None


# ─── real fixtures: each type parses the committed shape (smoke) ───────────────
def _fixture(name):
    return json.loads((DATA / name).read_text())


def test_real_gexstate_fixture_gamma_flip_arms():
    gs = _fixture("gexstate_fixture.json")
    flow = StubFlow(gexstate=gs)
    fired, _, _, nxt = _eval({"type": "opt_gamma_flip", "root": gs.get("root")}, flow)
    assert fired is False  # first obs
    assert nxt["side"] == "above"  # spot 751.71 >= flip 748.25


def test_real_gex_fixture_wall_evaluable():
    gx = _fixture("gex_fixture.json")["NVDA"]
    fired, val, _, _ = _eval({"type": "opt_wall_touch", "root": "NVDA", "wall": "call"}, StubFlow(gex=gx))
    assert fired is False  # far outside — but evaluable, not null
    assert val == gx["spot_ref"]


def test_real_tide_fixture_premium_burst_evaluable():
    tide = _fixture("tide_fixture.json")
    fired, _, _, _ = _eval({"type": "opt_premium_burst", "root": "SPY", "leg": "ncp"}, StubFlow(tide=tide))
    assert fired is not None  # 390 cumulative minutes → z computable


def test_real_surface_fixture_pocket_evaluable():
    """The REAL Flow accessor chain (surface_idx → latest → frame), not a stub."""
    flow = ae.Flow(str(DATA), fixture_mode=True)
    frame = flow.surface("SPY")
    assert frame is not None
    assert len(frame["time_steps"]) == 78  # idx latest "1556" → full realized session
    fired, val, _, _ = _eval({"type": "opt_surface_pocket", "root": "SPY"}, StubFlow(surface=frame))
    assert fired is not None  # 41 strikes × 78 intervals → scoreable
    assert isinstance(val, float)


def test_real_surface_unknown_root_null():
    """Only SPY is materialized — an unmaterialized root must be an honest null."""
    flow = ae.Flow(str(DATA), fixture_mode=True)
    assert flow.surface("QQQ") is None
    fired, _, note, _ = _eval({"type": "opt_surface_pocket", "root": "QQQ"}, StubFlow(surface=None))
    assert fired is None
    assert "no surface for this root yet" in note


def test_real_dte_fixture_0dte_evaluable_not_null():
    dte = _fixture("dte_fixture.json")
    fired, val, _, _ = _eval({"type": "opt_0dte_spike", "root": "SPY"}, StubFlow(dte=dte))
    assert fired is not None  # 0d bucket IS present → NOT null (honest: real ~8% share)
    assert isinstance(val, (int, float))


# ─── production Flow resolver: backend → R2, never fixture fallback ──────────


REMOTE_NOW = datetime(2026, 8, 11, 15, 0, tzinfo=timezone.utc)  # 11:00 ET, inside RTH
REMOTE_QUOTE = {"spot": 701.25, "asof": "2026-08-11T14:59:00Z", "basis": "DELAYED_15M"}


def _remote_flow(tmp_path, fetch, *, now=REMOTE_NOW):
    return ae.Flow(
        str(tmp_path),
        backend_base="http://flow.test",
        r2_base="https://r2.test",
        fetch_json=fetch,
        now_fn=lambda: now,
        spot_getter=lambda _root: REMOTE_QUOTE,
    )


def test_remote_gexstate_backend_first_uses_exact_path_and_cache(tmp_path):
    calls = []
    payload = {
        "schema": "options_structure.gex_state/v1", "root": "SPY", "spot": 1,
        "asof": "2026-08-11T14:30:00Z", "session_date": "2026-08-11",
    }

    def fetch(url, **kwargs):
        calls.append((url, kwargs))
        return payload

    flow = _remote_flow(tmp_path, fetch)
    assert flow.gexstate("spy") == payload
    assert flow.gexstate("SPY") == payload
    assert [c[0] for c in calls] == ["http://flow.test/api/hub/gexstate/SPY"]
    assert calls[0][1]["headers"]["User-Agent"] == ae.FLOW_USER_AGENT


def test_remote_gex_rejects_wrong_root_then_falls_back_to_r2(tmp_path):
    calls = []
    wrong = {"schema": "options_hub.gex/v1", "root": "QQQ", "asof": "2026-08-10"}
    right = {"schema": "options_hub.gex/v1", "root": "SPY", "spot_ref": 700, "asof": "2026-08-10"}

    def fetch(url, **_kwargs):
        calls.append(url)
        return wrong if url.startswith("http://") else right

    expected = {
        **right,
        "live_spot": 701.25,
        "live_spot_asof": REMOTE_QUOTE["asof"],
        "live_spot_basis": "DELAYED_15M",
    }
    assert _remote_flow(tmp_path, fetch).gex("SPY") == expected
    assert calls == [
        "http://flow.test/api/hub/gex/SPY",
        "https://r2.test/options_hub/gex/SPY.json",
    ]


def test_remote_gamma_state_uses_live_quote_and_eod_flip(tmp_path):
    gx = {
        "schema": "options_hub.gex/v1", "root": "SPY", "asof": "2026-08-10",
        "spot_ref": 680, "gamma_flip": 700,
    }
    state = _remote_flow(tmp_path, lambda _url, **_kwargs: gx).gamma_state("SPY")
    assert state == {
        "root": "SPY", "spot": 701.25, "gamma_flip": 700, "asof": "2026-08-10",
        "spot_asof": REMOTE_QUOTE["asof"], "spot_basis": "DELAYED_15M",
    }
    fired, _value, note, _next = ae._eval_gamma_flip(
        {"type": "opt_gamma_flip", "root": "SPY"}, state, {"side": "below"},
    )
    assert fired is True
    assert "15-minute-delayed quote" in note
    assert REMOTE_QUOTE["asof"] in note


def test_remote_cross_and_touch_withhold_when_live_quote_is_missing(tmp_path):
    gx = {
        "schema": "options_hub.gex/v1", "root": "SPY", "asof": "2026-08-10",
        "spot_ref": 700, "gamma_flip": 699, "call_wall": 701,
    }
    flow = ae.Flow(
        str(tmp_path), backend_base="http://flow.test", r2_base="https://r2.test",
        fetch_json=lambda _url, **_kwargs: gx, now_fn=lambda: REMOTE_NOW,
    )
    assert flow.gamma_state("SPY")["spot"] is None
    assert flow.gex("SPY")["spot_ref"] == 700
    assert flow.gex("SPY")["live_spot"] is None
    assert _eval({"type": "opt_gamma_flip", "root": "SPY"}, flow)[0] is None
    assert _eval({"type": "opt_wall_touch", "root": "SPY", "wall": "call"}, flow)[0] is None
    # Structural EOD alerts retain the publisher-bound denominator. Only a claim that
    # spot crossed/touched a level requires the separate current-session quote receipt.
    assert _eval({"type": "opt_wall_migration", "root": "SPY", "wall": "call"}, flow)[0] is False


def test_remote_wall_touch_discloses_delayed_quote_basis(tmp_path):
    gx = {
        "schema": "options_hub.gex/v1", "root": "SPY", "asof": "2026-08-10",
        "spot_ref": 680, "call_wall": 701.5,
    }
    flow = _remote_flow(tmp_path, lambda _url, **_kwargs: gx)
    fired, _value, note, _next = _eval(
        {"type": "opt_wall_touch", "root": "SPY", "wall": "call", "_wp": {"inside": False}},
        flow,
    )
    assert fired is True
    assert "15-minute-delayed quote" in note
    assert REMOTE_QUOTE["asof"] in note


def test_quote_hub_spot_requires_current_rth_receipt(tmp_path):
    (tmp_path / "manifest.json").write_text('{"symbols":{}}')
    data = ae.Data(str(tmp_path), None, now_fn=lambda: REMOTE_NOW)
    data.quotes = {
        "SPY": {"last": 701.25, "ts": REMOTE_NOW.timestamp() - 15 * 60,
                "basis": "DELAYED_15M", "live": False},
    }
    assert data.live_spot("SPY") == 701.25
    assert data.live_quote("SPY")["basis"] == "DELAYED_15M"
    data.quotes["SPY"]["ts"] = REMOTE_NOW.timestamp() - 31 * 60
    assert data.live_spot("SPY") is None
    data.quotes["SPY"] = {"last": 701.25, "ts": REMOTE_NOW.timestamp(), "basis": "EOD"}
    assert data.live_spot("SPY") is None
    data.quotes["SPY"] = {"last": 701.25, "ts": REMOTE_NOW.timestamp(), "basis": "UNKNOWN"}
    assert data.live_spot("SPY") is None


def test_remote_unavailable_never_reads_a_fixture(tmp_path):
    (tmp_path / "gexstate_fixture.json").write_text(json.dumps({
        "schema": "options_structure.gex_state/v1", "root": "SPY", "spot": 999,
    }))
    calls = []

    def fail(url, **_kwargs):
        calls.append(url)
        raise OSError("offline")

    flow = _remote_flow(tmp_path, fail)
    assert flow.gexstate("SPY") is None
    assert flow.gexstate("SPY") is None  # cached fail-closed result; no retry storm in one run
    assert len(calls) == 2


def test_remote_tide_and_dte_require_exact_live_schemas(tmp_path):
    docs = {
        "https://r2.test/live_flow/tide_current.json": {
            "schema": "live_flow.tide/v1", "minutes": [],
            "asof": "2026-08-11T14:30:00Z", "session_date": "2026-08-11",
        },
        "https://r2.test/live_flow/dte_tide_current.json": {
            "schema": "live_flow.dte_tide/v1", "buckets": {},
            "asof": "2026-08-11T14:30:00Z",
        },
    }

    def fetch(url, **_kwargs):
        if url.startswith("http://"):
            return {"schema": "foreign/v1"}
        return docs[url]

    flow = _remote_flow(tmp_path, fetch)
    assert flow.tide() == docs["https://r2.test/live_flow/tide_current.json"]
    assert flow.dte() == docs["https://r2.test/live_flow/dte_tide_current.json"]


def test_remote_intraday_payload_is_withheld_when_stale_or_outside_rth(tmp_path):
    stale = {
        "schema": "live_flow.tide/v1", "minutes": [],
        "asof": "2026-08-10T20:00:00Z", "session_date": "2026-08-10",
    }

    def fetch(_url, **_kwargs):
        return stale

    assert _remote_flow(tmp_path, fetch).tide() is None
    preopen = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)  # 08:00 ET
    current = {**stale, "asof": "2026-08-11T11:59:00Z", "session_date": "2026-08-11"}
    assert _remote_flow(tmp_path, lambda _url, **_kwargs: current, now=preopen).tide() is None


def test_remote_eod_gex_rejects_expired_snapshot(tmp_path):
    stale = {"schema": "options_hub.gex/v1", "root": "SPY", "asof": "2026-08-07"}
    assert _remote_flow(tmp_path, lambda _url, **_kwargs: stale).gex("SPY") is None


def test_remote_eod_gex_allows_friday_snapshot_on_monday(tmp_path):
    monday = datetime(2026, 8, 10, 15, 0, tzinfo=timezone.utc)
    friday = {"schema": "options_hub.gex/v1", "root": "SPY", "asof": "2026-08-07"}
    assert _remote_flow(tmp_path, lambda _url, **_kwargs: friday, now=monday).gex("SPY") is not None


def test_remote_surface_resolves_exact_latest_frame(tmp_path):
    calls = []
    idx = {
        "root": "SPY", "latest": "1045", "stamps": ["1030", "1045"],
        "asof": "2026-08-11T14:45:00Z",
    }
    frame = {
        "root": "SPY", "time_steps": ["10:30", "10:45"], "price_levels": [700],
        "grids": {"netprem": [[1, 2]]},
        "asof": "2026-08-11T14:45:00Z", "session_date": "2026-08-11",
    }

    def fetch(url, **_kwargs):
        calls.append(url)
        if url.endswith("/idx"):
            return idx
        if url.endswith("/1045"):
            return frame
        raise AssertionError(f"unexpected fetch {url}")

    assert _remote_flow(tmp_path, fetch).surface("SPY") == frame
    assert calls == [
        "http://flow.test/api/flow/surface/SPY/idx",
        "http://flow.test/api/flow/surface/SPY/1045",
    ]


def test_remote_root_and_surface_stamp_cannot_escape_paths(tmp_path):
    calls = []

    def fetch(url, **_kwargs):
        calls.append(url)
        return {
            "root": "SPY", "latest": "../../admin", "stamps": ["../../admin"],
            "asof": "2026-08-11T14:45:00Z",
        }

    flow = _remote_flow(tmp_path, fetch)
    assert flow.gex("../../admin") is None
    assert flow.gex("ABCDEFGHIJ.KLMN") is None  # grammar match but over Terminal's 12-char cap
    assert flow.surface("SPY") is None
    assert calls == [
        "http://flow.test/api/flow/surface/SPY/idx",
        "https://r2.test/live_flow/surface/SPY/idx.json",
    ]


# ─── (b2) wall migration — parity with evalWallMigration ─────────────────────


def _gx_mig(call_wall, spot=745.0):
    return {"root": "SPY", "spot_ref": spot, "call_wall": call_wall, "put_wall": 700.0,
            "asof": "2026-07-31"}


class TestWallMigration:
    COND = {"type": "opt_wall_migration", "root": "SPY", "wall": "call"}

    def test_first_observation_arms_without_firing(self):
        fired, value, note, nxt = _eval(self.COND, StubFlow(gex=_gx_mig(760.0)))
        assert fired is False
        assert nxt == {"level": 760.0}

    def test_fires_on_restrike_at_or_above_min_move(self):
        cond = {**self.COND, "_wm": {"level": 760.0}}
        fired, value, note, nxt = _eval(cond, StubFlow(gex=_gx_mig(765.0)))
        assert fired is True
        assert value == 765.0
        assert "760.0 → 765.0" in note or "760 → 765" in note
        assert "EOD build" in note
        assert nxt == {"level": 765.0}

    def test_subthreshold_jitter_updates_anchor_without_firing(self):
        cond = {**self.COND, "_wm": {"level": 760.0}}
        fired, _v, _n, nxt = _eval(cond, StubFlow(gex=_gx_mig(761.0)))  # 0.13% < 0.4%
        assert fired is False
        assert nxt == {"level": 761.0}

    def test_custom_min_move_pct(self):
        cond = {**self.COND, "min_move_pct": 0.1, "_wm": {"level": 760.0}}
        fired, *_ = _eval(cond, StubFlow(gex=_gx_mig(761.0)))
        assert fired is True

    def test_put_wall_watched_when_asked(self):
        cond = {"type": "opt_wall_migration", "root": "SPY", "wall": "put", "_wm": {"level": 700.0}}
        gx = {"root": "SPY", "spot_ref": 745.0, "call_wall": 760.0, "put_wall": 706.0,
              "asof": "2026-07-31"}
        fired, _v, note, _n = _eval(cond, StubFlow(gex=gx))
        assert fired is True
        assert "put wall" in note

    def test_missing_wall_is_honest_null_and_preserves_state(self):
        cond = {**self.COND, "_wm": {"level": 760.0}}
        fired, _v, _n, nxt = _eval(cond, StubFlow(gex={"root": "SPY", "spot_ref": 745.0}))
        assert fired is None
        assert nxt == {"level": 760.0}


# ─── (b3) sign fragility — parity with evalSignFragile ───────────────────────


def _gx_tilt(call_abs, put_abs):
    return {"root": "SPY", "spot_ref": 745.0, "asof": "2026-07-31",
            "by_strike": [
                {"gamma_call": call_abs * 0.6, "gamma_put": -put_abs * 0.5},
                {"gamma_call": call_abs * 0.4, "gamma_put": -put_abs * 0.5},
            ]}


class TestSignFragile:
    COND = {"type": "opt_sign_fragile", "root": "SPY"}

    def test_first_observation_arms_even_when_already_fragile(self):
        fired, _v, _n, nxt = _eval(self.COND, StubFlow(gex=_gx_tilt(100.0, 95.0)))
        assert fired is False
        assert nxt == {"fragile": True}

    def test_fires_on_robust_to_fragile_transition(self):
        cond = {**self.COND, "_sf": {"fragile": False}}
        fired, value, note, _n = _eval(cond, StubFlow(gex=_gx_tilt(100.0, 95.0)))
        assert fired is True
        assert abs(value - 2.6) < 0.1
        assert "dealer-sign assumption" in note

    def test_no_refire_while_fragile(self):
        cond = {**self.COND, "_sf": {"fragile": True}}
        fired, *_ = _eval(cond, StubFlow(gex=_gx_tilt(100.0, 95.0)))
        assert fired is False

    def test_robust_book_never_fires(self):
        cond = {**self.COND, "_sf": {"fragile": False}}
        fired, _v, _n, nxt = _eval(cond, StubFlow(gex=_gx_tilt(100.0, 50.0)))  # tilt 33%
        assert fired is False
        assert nxt == {"fragile": False}

    def test_custom_tilt_threshold(self):
        cond = {**self.COND, "tilt_pct": 40, "_sf": {"fragile": False}}
        fired, *_ = _eval(cond, StubFlow(gex=_gx_tilt(100.0, 50.0)))
        assert fired is True

    def test_empty_ladder_is_honest_null(self):
        assert _eval(self.COND, StubFlow(gex={"root": "SPY", "by_strike": []}))[0] is None
        assert _eval(self.COND, StubFlow(gex={"root": "SPY"}))[0] is None


# ─── (b4) OPEX concentration — parity with evalOpexConcentration ─────────────


def _gx_opex(front_mn, rest):
    # deliberately out of order: the evaluator must sort by exp, not trust row order
    return {"root": "SPY", "spot_ref": 745.0, "asof": "2026-07-31",
            "by_expiry": [
                {"exp": "2026-09-18", "gamma_net": rest[0] if rest else 0.0},
                {"exp": "2026-08-03", "gamma_net": front_mn},
                {"exp": "2026-08-21", "gamma_net": rest[1] if len(rest) > 1 else 0.0},
            ]}


class TestOpexConcentration:
    COND = {"type": "opt_opex_concentration", "root": "SPY"}

    def test_first_observation_arms_without_firing(self):
        fired, _v, _n, nxt = _eval(self.COND, StubFlow(gex=_gx_opex(80.0, [10.0, 10.0])))
        assert fired is False
        assert nxt == {"above": True}

    def test_fires_on_enter_with_front_exp_named(self):
        cond = {**self.COND, "_oc": {"above": False}}
        fired, value, note, _n = _eval(cond, StubFlow(gex=_gx_opex(50.0, [30.0, 20.0])))
        assert fired is True
        assert value == 50.0
        assert "2026-08-03" in note
        assert "OPEX" in note

    def test_absolute_gamma_per_expiry(self):
        cond = {**self.COND, "_oc": {"above": False}}
        fired, value, *_ = _eval(cond, StubFlow(gex=_gx_opex(-50.0, [30.0, 20.0])))
        assert fired is True
        assert value == 50.0

    def test_below_threshold_records_state_without_firing(self):
        cond = {**self.COND, "_oc": {"above": False}}
        fired, _v, _n, nxt = _eval(cond, StubFlow(gex=_gx_opex(20.0, [50.0, 30.0])))
        assert fired is False
        assert nxt == {"above": False}

    def test_no_refire_while_concentrated(self):
        cond = {**self.COND, "_oc": {"above": True}}
        fired, *_ = _eval(cond, StubFlow(gex=_gx_opex(50.0, [30.0, 20.0])))
        assert fired is False

    def test_missing_breakdown_is_honest_null(self):
        assert _eval(self.COND, StubFlow(gex={"root": "SPY"}))[0] is None
        assert _eval(self.COND, StubFlow(gex={"root": "SPY", "by_expiry": []}))[0] is None


def test_new_types_registered_with_expected_state_keys():
    """The registry rows are the wiring the API allow-list + UI rely on."""
    assert ae._OPT_EVALUATORS["opt_wall_migration"][0] == "_wm"
    assert ae._OPT_EVALUATORS["opt_sign_fragile"][0] == "_sf"
    assert ae._OPT_EVALUATORS["opt_opex_concentration"][0] == "_oc"


def test_new_types_fire_on_the_real_gex_fixture_shape():
    """Smoke against the SAME fixture the terminal ships — field names must line up."""
    import json
    gx = json.loads((DATA / "gex_fixture.json").read_text())["SPY"]
    # sign_fragile: real ladder computes a tilt without erroring
    fired, value, _note, nxt = _eval({"type": "opt_sign_fragile", "root": "SPY"}, StubFlow(gex=gx))
    assert fired is False and isinstance(value, float) and isinstance(nxt.get("fragile"), bool)
    # opex: real by_expiry computes a share
    fired2, value2, _n2, nxt2 = _eval({"type": "opt_opex_concentration", "root": "SPY"}, StubFlow(gex=gx))
    assert fired2 is False and isinstance(value2, float) and isinstance(nxt2.get("above"), bool)
    # wall migration arms off the real call wall
    fired3, value3, _n3, nxt3 = _eval({"type": "opt_wall_migration", "root": "SPY"}, StubFlow(gex=gx))
    assert fired3 is False and nxt3 == {"level": gx["call_wall"]}
