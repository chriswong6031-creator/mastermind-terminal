"""Parity + truth-table guard for the Python options-alert evaluators.

Feeds ingest.alerts_engine.evaluate() synthetic conditions + a fake Flow and asserts the
fire / re-arm / hysteresis / missing-payload truth table matches terminal/lib/optionsAlerts.ts
(and its vitest). This is the drift guard: the two implementations MUST agree. Real fixtures under
terminal/public/data are used for one smoke assertion per type.

No network, no Supabase — evaluate() is pure given (alert, data=None, flow).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import ingest.alerts_engine as ae  # noqa: E402

DATA = ROOT / "terminal" / "public" / "data"


class StubFlow:
    """A hand-fed Flow: each accessor returns whatever was stashed for it (or None)."""

    def __init__(self, gexstate=None, gex=None, tide=None, dte=None):
        self._gexstate = gexstate
        self._gex = gex
        self._tide = tide
        self._dte = dte

    def gexstate(self, root):  # noqa: ARG002 — single-root fixture ignores root, like prod dev
        return self._gexstate

    def gex(self, root):  # noqa: ARG002
        return self._gex

    def tide(self):
        return self._tide

    def dte(self):
        return self._dte


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
def _steady(n=12, step=1_000_000):
    minutes, v = [], 0
    for i in range(n):
        minutes.append({"t": f"09:{30 + i:02d}", "ncp": v, "npp": -v})
        v += step
    return {"minutes": minutes, "asof": "2026-07-05T15:42:00Z", "session_date": "2026-07-05"}


def _with_spike(spike=15_000_000):
    base = _steady()
    last = base["minutes"][-1]
    base["minutes"].append({"t": "09:42", "ncp": last["ncp"] + spike, "npp": last["npp"] - spike})
    return base


def test_slope_stats_hand_case():
    s = ae._session_slope_stats([0, 1, 2, 3, 4, 5, 20], 1)
    assert s["n"] == 6
    assert abs(s["mean"] - 3.333333) < 1e-5
    assert abs(s["std"] - 5.217492) < 1e-5
    assert s["recentMean"] == 15
    assert abs(s["z"] - 2.236068) < 1e-5


def test_slope_stats_window3_below_gate():
    s = ae._session_slope_stats([0, 1, 2, 3, 4, 5, 20], 3)
    assert abs(s["z"] - 0.447214) < 1e-5


def test_slope_stats_flat_zero_std_z_none():
    s = ae._session_slope_stats([5, 5, 5, 5, 5], 2)
    assert s["std"] == 0
    assert s["z"] is None


def test_premium_burst_spike_fires():
    cond = {"type": "opt_premium_burst", "root": "SPY", "leg": "ncp", "window_min": 1, "z": 2}
    fired, val, note, nxt = _eval(cond, StubFlow(tide=_with_spike()))
    assert fired is True
    assert "unusual pace" in note
    assert "net-call premium" in note
    assert "intraday tape" in note
    assert abs(val) >= 2
    assert nxt["lastFiredT"] == "09:42"


def test_premium_burst_npp_labels_put():
    cond = {"type": "opt_premium_burst", "root": "SPY", "leg": "npp", "window_min": 1, "z": 2}
    fired, _, note, _ = _eval(cond, StubFlow(tide=_with_spike()))
    assert fired is True
    assert "net-put premium" in note


def test_premium_burst_noisy_no_spike_no_fire():
    # variance present, but the last minute is not anomalous → |z| < 2.
    steps = [1_050_000, 950_000, 1_100_000, 900_000, 1_000_000, 1_050_000, 980_000, 1_020_000, 960_000, 1_040_000, 990_000, 1_010_000, 1_000_000]
    minutes, v = [], 0
    for i, st in enumerate(steps):
        minutes.append({"t": f"09:{30 + i:02d}", "ncp": v, "npp": -v})
        v += st
    cond = {"type": "opt_premium_burst", "root": "SPY", "leg": "ncp", "window_min": 1, "z": 2}
    fired, val, _, _ = _eval(cond, StubFlow(tide={"minutes": minutes, "asof": "x"}))
    assert fired is False
    assert abs(val) < 2


def test_premium_burst_idempotent_per_stamp():
    cond = {"type": "opt_premium_burst", "root": "SPY", "leg": "ncp", "window_min": 1, "z": 2}
    spike = _with_spike()
    first = _eval(cond, StubFlow(tide=spike))
    assert first[0] is True
    cond2 = {**cond, "_pb": first[3]}
    again = _eval(cond2, StubFlow(tide=spike))
    assert again[0] is False  # same latest stamp


def test_premium_burst_too_few_points_null():
    short = {"minutes": [{"t": "09:30", "ncp": 1, "npp": -1}, {"t": "09:31", "ncp": 2, "npp": -2}], "asof": "x"}
    cond = {"type": "opt_premium_burst", "root": "SPY", "leg": "ncp", "window_min": 10, "z": 2}
    fired, _, note, _ = _eval(cond, StubFlow(tide=short))
    assert fired is None
    assert "not enough tape" in note


def test_premium_burst_flat_tape_null():
    minutes = [{"t": f"09:{30 + i:02d}", "ncp": 5_000_000, "npp": -5_000_000} for i in range(14)]
    cond = {"type": "opt_premium_burst", "root": "SPY", "leg": "ncp", "window_min": 10, "z": 2}
    fired, _, note, _ = _eval(cond, StubFlow(tide={"minutes": minutes, "asof": "x"}))
    assert fired is None
    assert "flat tape" in note


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


def test_real_dte_fixture_0dte_evaluable_not_null():
    dte = _fixture("dte_fixture.json")
    fired, val, _, _ = _eval({"type": "opt_0dte_spike", "root": "SPY"}, StubFlow(dte=dte))
    assert fired is not None  # 0d bucket IS present → NOT null (honest: real ~8% share)
    assert isinstance(val, (int, float))
