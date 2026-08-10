"""The KEEPER's reclaim waiver — Arm T of the reclaim-veto conditional (era gc_v2_wo2).

RATIFIED 2026-08-10 (Macro Dashboard research/RECLAIM_VETO_CONDITIONAL_PREREG.md §4/§5,
operator: "okay ship it"), notch subsequently set to 20 inside the gauntleted 20/25/30 band.
The keeper waives its counter-trend **200-reclaim** leg for a fire whose name qualifies in
the washout state — and ONLY for a RELIEVABLE fire: one whose next-bar HOLD leg PASSED.

WHAT THIS FILE PINS, AND WHY EACH ONE IS HERE
---------------------------------------------
1. the spine — held passed + reclaim failed + qualifying ⇒ ``reclaim_override_take``;
2. THE BOUNDARY — held FAILED + qualifying ⇒ still blocked. The HL 2026-06-16 shape. §5
   adjudicated this explicitly: hold-leg relaxation is a DIFFERENT construction needing its
   own prereg, and 67.5% of the literal reason-set is exactly this shape. A waiver written
   against the reason string would have shipped it by accident — which is why the
   implementation reads the BRANCH and why this test exists to prove it;
3. bearish-divergence blocks are untouched (a different veto, outside the family);
4. a relievable fire in a NON-qualifying name is blocked exactly as it is today;
5. ``regime_blocked`` ⊘ fires are unaffected — they never enter the keeper's cohort at all;
6. the era fence, the ledger class, and the downstream behaviour of the new entry class
   (position walk, alerts) — a take-class entry must behave like one everywhere.

Every branch test is MUTATION-CHECKED: each has a sibling in the mutation receipt (see the
PR body) proving it goes red when the implementation is broken in the obvious way.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import ingest.alerts_engine as ae  # noqa: E402
from signal_layer import SIGNAL_ERA, confluence_v2, contracts  # noqa: E402
from signal_layer.washout_override import (  # noqa: E402
    LEDGER_CLASS_RECLAIM,
    LEDGER_CLASS_WASHOUT,
    RECLAIM_OVERRIDE_TAKE_QUALITY,
    WASHOUT_OVERRIDE_NOTCH,
    DailyBars,
    WashoutStamper,
)

GROUP = "uranium_miners"
SYM = "SYNTH"


# ═══════════════════════════════════════════════════════ the controlled frame ══
# The keeper's legs are four booleans on three adjacent bars. A synthetic TAPE cannot put
# them where a test needs them; a hand-built frame can, and every branch below is one
# explicit array away from its neighbour. Everything the keeper and the emitter read is
# present, so the same frame drives both the unit-level branch tests and the end-to-end
# emission tests — no second fixture that could drift from the first.
def frame(n: int = 60, fire: int = 40, *, held: bool = True, reclaim: bool = False,
          bear_block: bool = False, above200: bool = False, w_bull: bool = False,
          divergence: bool = False) -> pd.DataFrame:
    idx = pd.bdate_range("2026-01-01", periods=n)
    close = np.linspace(100.0, 90.0, n)                    # a slow bleed: nothing pivots
    macd = np.full(n, -0.5)

    if divergence:
        # two confirmed swing highs inside the 12-bar lookback: price makes the higher high,
        # MACD does not. Radius-2 local maxima, so ±2 neighbours must sit below.
        for peak, bump, mv in ((fire - 8, 3.0, 1.0), (fire - 3, 4.0, 0.2)):
            close[peak] += bump
            macd[peak] = mv

    # the three bars the keeper reads: the fire, and the two that confirm it
    if fire + 1 < n:
        close[fire + 1] = close[fire] + (1.0 if held else -1.0)

    a200 = np.full(n, bool(above200))
    a200[fire] = bool(above200)                            # counter-trend needs below-200
    for leg in (fire + 1, fire + 2):                       # the reclaim leg, bar +1 or +2
        if leg < n:                                        # (short frame ⇒ pending, by design)
            a200[leg] = bool(reclaim)

    cb = np.zeros(n, dtype=bool)
    cb[fire] = True
    bb = np.zeros(n, dtype=bool)
    bb[fire] = bool(bear_block)

    return pd.DataFrame({
        "close": close, "macd": macd, "sig": macd - 0.1,
        "k": np.full(n, 40.0), "d": np.full(n, 40.0), "rsi14": np.full(n, 45.0),
        "above200": a200, "w_bull": np.full(n, bool(w_bull)),
        "mo_bull": np.zeros(n, dtype=bool), "w2_bull": np.zeros(n, dtype=bool),
        "strong_bull": np.zeros(n, dtype=bool),
        "CB": cb, "revBuy": np.zeros(n, dtype=bool),
        "CS": np.zeros(n, dtype=bool), "revSell": np.zeros(n, dtype=bool),
        "bear_block": bb,
        "known_ts": idx,
    }, index=idx)


def artifact(as_of: str, *, qualifies=None, ticker: str = SYM) -> dict:
    return {
        "schema": "basket_washout_state.v1",
        "as_of": as_of,
        "thresholds": [20, 25, 30],
        "baskets": {GROUP: {"name": "Uranium miners", "name_zh": "铀矿商",
                            "peer_median_dd_252": -0.388, "n_members": 14}},
        "names": {ticker: {"basis": "basket", "group_id": GROUP, "peer_dd": -0.388,
                           "qualifies": qualifies or {"20": True, "25": True, "30": True}}},
    }


def gate(tmp_path, doc, *, today: str, ledger: str = "l.jsonl") -> WashoutStamper:
    if doc is not None:
        (tmp_path / "washout_state.json").write_text(json.dumps(doc))
    return WashoutStamper.create(
        state_path=tmp_path / "washout_state.json",
        ledger_path=tmp_path / ledger,
        history_path=tmp_path / "no_history.json",
        today=date.fromisoformat(today),
    )


def fire_ts(sig: pd.DataFrame, fire: int = 40) -> str:
    return sig.index[fire].strftime("%Y-%m-%d")


def keeper_at(sig, pos, **kw):
    return confluence_v2.keeper_quality_map(sig, **kw).get(pos)


# ════════════════════════════════════════════════════════════ 1. THE SPINE ═════
def test_the_spine_a_relievable_block_in_a_qualifying_name_is_TAKEN(tmp_path):
    """held PASSED, reclaim FAILED, name qualifies ⇒ reclaim_override_take.

    The two halves are asserted together on purpose: the same bar must read as a keeper
    BLOCK with no gate, and as the waived entry with one. A test that only checked the
    second half would pass against an implementation that took everything.
    """
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)

    plain = keeper_at(sig, 40)
    assert plain["verdict"] == "block"
    assert plain["reason"] == "counter-trend, no 200-reclaim/hold"
    assert plain["relievable"] is True

    waived = keeper_at(sig, 40, symbol=SYM, gate=gate(tmp_path, artifact(ts), today=ts))
    assert waived["verdict"] == RECLAIM_OVERRIDE_TAKE_QUALITY
    assert waived["reason"] == (
        f"reclaim waived: washout {GROUP} −38.8% (era {SIGNAL_ERA})")
    assert waived["override_ctx"]["group_id"] == GROUP
    assert waived["override_ctx"]["peer_dd"] == pytest.approx(-0.388)


def test_the_waived_entry_scores_off_the_ordinary_recipe(tmp_path):
    """tier/score are the standard non-counter-trend numbers — the waiver moves no score."""
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    v2 = confluence_v2.build_v2(sig, sig["close"], symbol=SYM,
                                override_gate=gate(tmp_path, artifact(ts), today=ts))
    ind = contracts.indicator_contract(SYM, "3D", sig, v2=v2)
    ev = [e for e in ind["signals"] if e["ts"] == ts][0]
    assert ev["quality"] == RECLAIM_OVERRIDE_TAKE_QUALITY
    assert ev["tier"] == v2["recipe"][40]["tier"]
    assert ev["score"] == v2["recipe"][40]["score"]
    assert "blocked" not in ev              # it is an entry, not a decorated refusal
    assert ev["override_ctx"]["group_id"] == GROUP


# ═════════════════════════════════════════ 2. THE ADJUDICATED BOUNDARY ════════
def test_a_HOLD_leg_failure_is_never_waived_even_in_a_qualifying_name(tmp_path):
    """The HL 2026-06-16 shape. §5: this construction cannot relieve it, and does not.

    Note what makes this test non-vacuous: the reason string here is IDENTICAL to the
    spine's ("counter-trend, no 200-reclaim/hold"), and the name is the same qualifying
    name. Only the branch differs. An implementation that selected the cohort by reason
    string — the mis-specification §5 had to correct — passes every other test in this file
    and fails this one.
    """
    sig = frame(held=False, reclaim=False)
    ts = fire_ts(sig)

    plain = keeper_at(sig, 40)
    assert plain["reason"] == "counter-trend, no 200-reclaim/hold"   # same literal
    assert plain["relievable"] is False                              # different branch

    blocked = keeper_at(sig, 40, symbol=SYM, gate=gate(tmp_path, artifact(ts), today=ts))
    assert blocked["verdict"] == "block"
    assert blocked["reason"] == "counter-trend, no 200-reclaim/hold"
    assert "override_ctx" not in blocked


def test_a_bearish_divergence_block_is_untouched_by_the_waiver(tmp_path):
    """A different veto, outside this family (prereg §4). It returns before the legs run."""
    sig = frame(held=True, reclaim=False, divergence=True)
    ts = fire_ts(sig)

    plain = keeper_at(sig, 40)
    assert plain == {"verdict": "block", "reason": "veto: bearish divergence",
                     "relievable": False}

    with_gate = keeper_at(sig, 40, symbol=SYM, gate=gate(tmp_path, artifact(ts), today=ts))
    assert with_gate == plain


def test_a_relievable_block_in_a_NON_qualifying_name_is_blocked_exactly_as_today(tmp_path):
    """The gate said no. The verdict, the reason and the payload are byte-identical."""
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    doc = artifact(ts, qualifies={"20": False, "25": False, "30": False})
    assert (keeper_at(sig, 40, symbol=SYM, gate=gate(tmp_path, doc, today=ts))
            == keeper_at(sig, 40))


def test_a_name_absent_from_the_state_is_blocked_exactly_as_today(tmp_path):
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    doc = artifact(ts, ticker="SOMEONE_ELSE")
    assert (keeper_at(sig, 40, symbol=SYM, gate=gate(tmp_path, doc, today=ts))
            == keeper_at(sig, 40))


def test_the_waiver_cannot_reach_a_fire_that_predates_the_state(tmp_path):
    """The PIT rule, inherited whole from the enter mask: no waiver acts backwards."""
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    later = (date.fromisoformat(ts) + pd.Timedelta(days=3)).isoformat()
    doc = artifact(later)          # state minted AFTER the fire became knowable
    assert (keeper_at(sig, 40, symbol=SYM, gate=gate(tmp_path, doc, today=later))
            == keeper_at(sig, 40))


# ══════════════════════════════════════════════ 3. THE OTHER COHORT'S FIRES ═══
def test_a_regime_blocked_fire_never_enters_the_keepers_cohort(tmp_path):
    """⊘ fires are graded by the enter mask, not the keeper — the waiver never sees them.

    ``keeper_quality_map`` grades ``(CB|revBuy) & ~bear_block``; this fire is bear_block, so
    it has no keeper entry at all, with or without a gate. It is the WASHOUT override's
    cohort and is emitted as ``override_take`` by that path instead.
    """
    sig = frame(held=True, reclaim=False, bear_block=True)
    ts = fire_ts(sig)
    g = gate(tmp_path, artifact(ts), today=ts)
    assert confluence_v2.keeper_quality_map(sig) == {}
    assert confluence_v2.keeper_quality_map(sig, symbol=SYM, gate=g) == {}

    v2 = confluence_v2.build_v2(sig, sig["close"], symbol=SYM, override_gate=g)
    ev = [e for e in contracts.indicator_contract(SYM, "3D", sig, v2=v2)["signals"]
          if e["ts"] == ts][0]
    assert ev["quality"] == contracts.OVERRIDE_TAKE_QUALITY      # the OTHER class
    assert ev["quality"] != RECLAIM_OVERRIDE_TAKE_QUALITY


def test_the_two_waived_classes_never_collide_on_one_bar(tmp_path):
    """Disjoint by construction: override ⊂ bear_block, keeper ⊂ ~bear_block."""
    ts = fire_ts(frame())
    g = gate(tmp_path, artifact(ts), today=ts)
    for bb in (True, False):
        sig = frame(held=True, reclaim=False, bear_block=bb)
        v2 = confluence_v2.build_v2(sig, sig["close"], symbol=SYM, override_gate=g)
        assert not (set(v2["keeper"]) & set(v2["override"]))


# ═══════════════════════════════════════════════════════ 4. THE ERA FENCE ═════
def test_the_era_names_this_build(tmp_path):
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    assert SIGNAL_ERA == "gc_v2_wo2"
    v2 = confluence_v2.build_v2(sig, sig["close"], symbol=SYM,
                                override_gate=gate(tmp_path, artifact(ts), today=ts))
    assert contracts.indicator_contract(SYM, "3D", sig, v2=v2)["signal_era"] == SIGNAL_ERA


def test_the_ledger_row_carries_the_era_and_its_own_waiver_class(tmp_path):
    """Accrual from night one, and gradeable apart from the washout override's rows."""
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    g = gate(tmp_path, artifact(ts), today=ts)
    v2 = confluence_v2.build_v2(sig, sig["close"], symbol=SYM, override_gate=g)
    ind = contracts.indicator_contract(SYM, "3D", sig, v2=v2)
    g.stamp(SYM, ind["signals"], daily=DailyBars(
        bar_opens=[d.strftime("%Y-%m-%d") for d in sig.index],
        dates=[d.strftime("%Y-%m-%d") for d in sig.index],
        high=sig["close"].to_list(), low=sig["close"].to_list(),
        close=sig["close"].to_list()), today=date.fromisoformat(ts))
    assert g.flush() == 1
    row = json.loads((tmp_path / "l.jsonl").read_text().strip())
    assert row["era"] == SIGNAL_ERA
    assert row["taken"] is True
    assert row["class"] == LEDGER_CLASS_RECLAIM
    assert row["ticker"] == SYM and row["ts"] == ts
    assert row["peer_dd"] == pytest.approx(-0.388)


def test_a_washout_override_row_can_never_replay_as_a_reclaim_waiver(tmp_path):
    """Class-strict replay. Two rules share one ledger; neither may grant the other's."""
    ts = fire_ts(frame())
    seeded = {"ticker": SYM, "ts": ts, "taken": True, "era": SIGNAL_ERA,
              "class": LEDGER_CLASS_WASHOUT, "override_ctx": {"group_id": GROUP}}
    (tmp_path / "l.jsonl").write_text(json.dumps(seeded) + "\n")
    g = gate(tmp_path, None, today=ts)                 # no live state: replay is the only path
    assert g.reclaim_override_for(SYM, ts, ts) is None
    assert g.override_for(SYM, ts, ts) == {"group_id": GROUP}


def test_a_wo1_entry_keeps_replaying_as_the_entry_it_was(tmp_path):
    """The fence forbids POOLING eras, not honouring what a past era entered.

    A wo1 row is a real position. Pinning the replay to the CURRENT era would have reverted
    every live wo1 marker to a plain ⊘ the night wo2 shipped, while the forward ledger still
    carried the trade.
    """
    ts = fire_ts(frame())
    seeded = {"ticker": SYM, "ts": ts, "taken": True, "era": "gc_v2_wo1",
              "override_ctx": {"group_id": GROUP}}
    (tmp_path / "l.jsonl").write_text(json.dumps(seeded) + "\n")
    g = gate(tmp_path, None, today=ts)
    assert g.override_for(SYM, ts, ts) == {"group_id": GROUP}
    # …but it is not a reclaim waiver: that class did not exist in wo1.
    assert g.reclaim_override_for(SYM, ts, ts) is None


def test_a_pre_fence_display_row_still_replays_as_a_refusal(tmp_path):
    ts = fire_ts(frame())
    seeded = {"ticker": SYM, "ts": ts, "override_ctx": {"group_id": GROUP}}   # no era/taken
    (tmp_path / "l.jsonl").write_text(json.dumps(seeded) + "\n")
    g = gate(tmp_path, None, today=ts)
    assert g.override_for(SYM, ts, ts) is None
    assert g.reclaim_override_for(SYM, ts, ts) is None


# ══════════════════════════════════════ 5. IT IS A REAL ENTRY DOWNSTREAM ══════
def test_a_waived_entry_walks_the_position(tmp_path):
    """position_hint / last_scored are the scored lane. A take-class entry walks it."""
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    v2 = confluence_v2.build_v2(sig, sig["close"], symbol=SYM,
                                override_gate=gate(tmp_path, artifact(ts), today=ts))
    st = contracts.indicator_contract(SYM, "3D", sig, v2=v2)["state"]
    assert st["position_hint"] == "long"
    assert st["last_scored_signal"] in ("BUY", "REBUY")
    assert st["last_scored_ts"] == ts


def test_a_waived_entry_fires_a_buy_alert_and_a_block_still_does_not(tmp_path):
    """The alert lane skips on ``blocked``/``regime_blocked``; this class carries neither."""
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    v2 = confluence_v2.build_v2(sig, sig["close"], symbol=SYM,
                                override_gate=gate(tmp_path, artifact(ts), today=ts))
    taken = [e for e in contracts.indicator_contract(SYM, "3D", sig, v2=v2)["signals"]
             if e["ts"] == ts][0]

    alert = {"symbol": SYM, "created_at": "2026-01-01T00:00:00Z",
             "condition": {"type": "signal", "target": "BUY"}}

    class _Data:
        def __init__(self, evs):
            self._evs = evs

        def signals(self, _sym):
            return self._evs

    fired, value, _note, _extra = ae.evaluate(alert, _Data([taken]))
    assert fired is True and value == taken["price"]

    refused = dict(taken, quality=contracts.BLOCKED_QUALITY, blocked=True)
    refused.pop("override_ctx", None)
    fired_blocked, *_ = ae.evaluate(alert, _Data([refused]))
    assert fired_blocked is False


# ══════════════════════════════════════════════════════ 6. THE FALLBACK ═══════
@pytest.mark.parametrize("doc_kw", [
    pytest.param({"doc": None}, id="artifact-absent"),
    pytest.param({"doc": "stale"}, id="artifact-stale"),
])
def test_no_usable_state_leaves_the_keeper_byte_identical(tmp_path, doc_kw):
    """No artifact, or one past the 5-session tolerance ⇒ the pre-waiver keeper, exactly."""
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    baseline = confluence_v2.keeper_quality_map(sig)
    if doc_kw["doc"] is None:
        g = gate(tmp_path, None, today=ts)
    else:
        # as_of six weekdays behind "today" — one session past DEFAULT_MAX_STALE_SESSIONS
        stale_today = (pd.Timestamp(ts) + pd.tseries.offsets.BDay(6)).strftime("%Y-%m-%d")
        g = gate(tmp_path, artifact(ts), today=stale_today)
        assert g.state is None
    assert confluence_v2.keeper_quality_map(sig, symbol=SYM, gate=g) == baseline


def test_a_gate_with_no_reclaim_method_is_refused_not_crashed():
    """Duck-typed and fail-closed: a legacy gate object grants no waiver and raises nothing."""
    sig = frame(held=True, reclaim=False)

    class LegacyGate:
        def override_for(self, *_a):        # the wo1 surface only
            return {"group_id": GROUP}

    assert (confluence_v2.keeper_quality_map(sig, symbol=SYM, gate=LegacyGate())
            == confluence_v2.keeper_quality_map(sig))


def test_a_faulting_gate_leaves_the_block_standing():
    """A gate exception refuses the fire; it never breaks a slice (the house fault rule)."""
    sig = frame(held=True, reclaim=False)

    class Exploding:
        def reclaim_override_for(self, *_a):
            raise RuntimeError("artifact on fire")

    assert (confluence_v2.keeper_quality_map(sig, symbol=SYM, gate=Exploding())
            == confluence_v2.keeper_quality_map(sig))


def test_the_waiver_needs_BOTH_a_symbol_and_a_gate(tmp_path):
    sig = frame(held=True, reclaim=False)
    ts = fire_ts(sig)
    g = gate(tmp_path, artifact(ts), today=ts)
    baseline = confluence_v2.keeper_quality_map(sig)
    assert confluence_v2.keeper_quality_map(sig, symbol=None, gate=g) == baseline
    assert confluence_v2.keeper_quality_map(sig, symbol=SYM, gate=None) == baseline


# ═════════════════════════════════════════════ 7. THE UNWAIVED BRANCHES ═══════
def test_every_other_keeper_branch_is_byte_identical_with_the_gate_wired(tmp_path):
    """The waiver is exactly one branch wide.

    Sweeps the keeper's whole verdict space — take, hold-failure block, bear-div block,
    pending — with a maximally permissive gate wired in, and demands the same map as with
    no gate at all. Only the relievable branch may move, and it is excluded here because it
    is the subject of the spine test above.
    """
    ts = fire_ts(frame())
    g = gate(tmp_path, artifact(ts), today=ts)
    cases = {
        "take": dict(held=True, reclaim=True),
        "hold-failure": dict(held=False, reclaim=False),
        "hold-failure-with-reclaim": dict(held=False, reclaim=True),
        "bear-div": dict(held=True, reclaim=False, divergence=True),
        "with-trend-hold": dict(held=True, reclaim=False, above200=True, w_bull=True),
        "with-trend-fail": dict(held=False, reclaim=False, above200=True, w_bull=True),
        "pending": dict(held=True, reclaim=False),
    }
    for name, kw in cases.items():
        sig = frame(**kw) if name != "pending" else frame(n=42, fire=40, **kw)
        assert (confluence_v2.keeper_quality_map(sig, symbol=SYM, gate=g)
                == confluence_v2.keeper_quality_map(sig)), name


def test_keeper_verdict_the_parity_surface_is_never_waived(tmp_path):
    """``keeper_verdict`` is what every engine diff is taken against. It stays pre-waiver."""
    sig = frame(held=True, reclaim=False).reset_index(drop=True)
    hi = confluence_v2._swing_highs(sig["close"])
    assert confluence_v2.keeper_verdict(40, sig, hi) == (
        "block", "counter-trend, no 200-reclaim/hold")
