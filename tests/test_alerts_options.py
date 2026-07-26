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
    assert abs(s["se"] - (0.5 * M) / math.sqrt(3)) < 1e-6
    assert abs(s["z"] - 29.444864) < 1e-5
    assert s["why"] == ""


def test_slope_stats_sqrt_w_correction():
    base = _rep([1, 2], 20)  # 40 calm deltas, baseStd 0.5
    s1 = ae._session_slope_stats(_series(_tide(base + [9])), 1)
    s4 = ae._session_slope_stats(_series(_tide(base + [9, 9, 9, 9])), 4)
    assert s1["winMean"] == s4["winMean"] == 9
    assert abs(s4["z"] / s1["z"] - 2) < 1e-9  # sqrt(4)/sqrt(1)


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
    assert abs(val - 29.44) < 0.01
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
    assert abs(val - 441.64) < 0.1
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
    flow = ae.Flow(str(DATA))
    frame = flow.surface("SPY")
    assert frame is not None
    assert len(frame["time_steps"]) == 78  # idx latest "1556" → full realized session
    fired, val, _, _ = _eval({"type": "opt_surface_pocket", "root": "SPY"}, StubFlow(surface=frame))
    assert fired is not None  # 41 strikes × 78 intervals → scoreable
    assert isinstance(val, float)


def test_real_surface_unknown_root_null():
    """Only SPY is materialized — an unmaterialized root must be an honest null."""
    flow = ae.Flow(str(DATA))
    assert flow.surface("QQQ") is None
    fired, _, note, _ = _eval({"type": "opt_surface_pocket", "root": "QQQ"}, StubFlow(surface=None))
    assert fired is None
    assert "no surface for this root yet" in note


def test_real_dte_fixture_0dte_evaluable_not_null():
    dte = _fixture("dte_fixture.json")
    fired, val, _, _ = _eval({"type": "opt_0dte_spike", "root": "SPY"}, StubFlow(dte=dte))
    assert fired is not None  # 0d bucket IS present → NOT null (honest: real ~8% share)
    assert isinstance(val, (int, float))
