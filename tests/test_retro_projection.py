"""The RETRO PROJECTION — a labelled counterfactual on pre-fence refusals (display only).

The live gates cannot reach backwards and must not: an entry the engine did not make is not
a trade. But the refusals it left behind are still on the chart, and today's rule would
treat some of them differently. The retro projection says so — in words, on the display
tier, and nowhere else.

THE FOUR HARD BOUNDARIES, one section each below. A retro mark never:
  1. enters the forward ledger (structural: ``mark_retro`` is handed no ledger);
  2. changes ``quality`` — so it can never walk ``position_hint``/``last_scored``, never
     become ``override_take``/``reclaim_override_take``, and never enter the scored stream;
  3. fires an alert;
  4. appears at all when the history artifact is absent, unreadable, or cut at another
     notch — in which case the emission is byte-identical to one built without it.

Plus the fence cut: a fire the LIVE mask could have judged is the mask's, never the
projection's. Only fires whose ``known_ts`` predates the live state's ``as_of`` are eligible.
"""
from __future__ import annotations

import copy
import json
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import ingest.alerts_engine as ae  # noqa: E402
from signal_layer import contracts  # noqa: E402
from signal_layer.washout_override import (  # noqa: E402
    OVERRIDE_TAKE_QUALITY,
    RECLAIM_OVERRIDE_TAKE_QUALITY,
    WASHOUT_OVERRIDE_NOTCH,
    WashoutStamper,
    history_from_dict,
    load_history,
    mark_retro,
)

SYM = "UEC"
GROUP = "uranium_miners"
OLD_TS = "2026-05-04"          # inside the qualifying window, well before the live state
LIVE_AS_OF = "2026-08-10"


def history(*, intervals=None, notch_key: str = "20", **over) -> dict:
    doc = {
        "schema": "basket_washout_history.v1",
        "as_of": LIVE_AS_OF,
        "names": {
            SYM: {
                "group_id": GROUP, "name": "Uranium miners", "name_zh": "铀矿商",
                "intervals": {notch_key: intervals or [["2026-04-01", "2026-06-30"]]},
            },
            "CALM": {"group_id": "software_infra", "intervals": {notch_key: []}},
        },
    }
    doc.update(over)
    return doc


def hist(**kw):
    h = history_from_dict(history(**kw))
    assert h is not None
    return h


def blocked_ev(ts: str = OLD_TS, **over) -> dict:
    """A ``regime_blocked`` event exactly as ``contracts._extract_signals`` emits one."""
    ev = {
        "ts": ts, "known_ts": ts, "bar_index": 120, "type": "BUY", "strength": 0.45,
        "price": 7.31, "reasons": ["macd_bull_cross"],
        "regime": {"weeklyBull": False, "above200": False, "monthlyBull": False},
        "quality": contracts.BLOCKED_QUALITY,
        "quality_reason": "bear_block: monthly-bear & below-200 & 2W-not-bull",
        "tier": None, "score": None, "blocked": True,
    }
    ev.update(over)
    return ev


def keeper_block_ev(ts: str = OLD_TS, **over) -> dict:
    """A keeper ``block`` — the reclaim-waiver cohort's refused shape (no ``blocked`` flag)."""
    ev = blocked_ev(ts, quality="block",
                    quality_reason="counter-trend, no 200-reclaim/hold")
    ev.pop("blocked")
    ev.update(over)
    return ev


# ═══════════════════════════════════════════════════ 1. THE MARK ITSELF ═══════
def test_a_pre_fence_refusal_inside_a_qualifying_window_is_re_marked():
    ev = blocked_ev()
    assert mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF) == 1
    assert ev["retro_override"] is True
    assert ev["retro_ctx"] == {"group_id": GROUP, "name": "Uranium miners",
                               "name_zh": "铀矿商"}


def test_a_refusal_outside_every_window_is_left_alone():
    ev = blocked_ev("2026-02-02")            # before the window opens
    before = copy.deepcopy(ev)
    assert mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF) == 0
    assert ev == before


def test_the_window_is_inclusive_at_both_ends_and_may_be_open_ended():
    for ts in ("2026-04-01", "2026-06-30"):
        ev = blocked_ev(ts)
        assert mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF) == 1, ts
    ev = blocked_ev("2026-07-15")
    h = hist(intervals=[["2026-07-01", None]])
    assert mark_retro(SYM, [ev], history=h, live_as_of=LIVE_AS_OF) == 1


def test_a_name_with_no_windows_is_never_marked():
    ev = blocked_ev()
    assert mark_retro("CALM", [ev], history=hist(), live_as_of=LIVE_AS_OF) == 0
    assert mark_retro("NOTINARTIFACT", [ev], history=hist(), live_as_of=LIVE_AS_OF) == 0


def test_a_relievable_keeper_block_gets_the_same_treatment():
    """The reclaim waiver's own pre-fence cohort — identically labelled (operator order)."""
    ev = keeper_block_ev()
    assert mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF,
                      relievable_ts=[OLD_TS]) == 1
    assert ev["retro_override"] is True


def test_a_keeper_block_that_is_NOT_relievable_is_never_re_marked():
    """The HL 2026-06-16 boundary again, and for the same reason.

    Same quality, same collapsed reason string, same qualifying window — only the branch
    differs, and the branch says the HOLD leg failed. Today's rule would NOT have entered
    this fire, so claiming it would have is simply false.
    """
    ev = keeper_block_ev()
    before = copy.deepcopy(ev)
    assert mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF,
                      relievable_ts=[]) == 0
    assert ev == before


def test_a_point_in_time_display_stamp_outranks_the_projection():
    """A fire already answered from its own day's state keeps that answer."""
    ev = blocked_ev(override_candidate=True, override_ctx={"group_id": GROUP})
    assert mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF) == 0
    assert "retro_override" not in ev


# ═══════════════════════════════════════════════════ 2. THE FENCE CUT ═════════
def test_a_post_fence_fire_belongs_to_the_live_mask_and_is_never_re_marked():
    """``known_ts >= as_of`` ⇒ the live gate judged it. Its answer stands, whatever it was.

    Without this cut a display artifact could contradict a traded decision: the mask looked
    at this fire on its own day and refused it, and the projection would paint it as one
    today's rule takes.
    """
    ev = blocked_ev(LIVE_AS_OF, known_ts=LIVE_AS_OF)
    h = hist(intervals=[["2026-04-01", "2026-12-31"]])
    assert mark_retro(SYM, [ev], history=h, live_as_of=LIVE_AS_OF) == 0
    assert "retro_override" not in ev
    # …and the same fire one session earlier — outside the mask's reach — is marked.
    older = blocked_ev("2026-08-07", known_ts="2026-08-07")
    assert mark_retro(SYM, [older], history=h, live_as_of=LIVE_AS_OF) == 1


def test_known_ts_not_ts_decides_the_cut():
    """The availability date is the PIT coordinate everywhere else; it is here too."""
    ev = blocked_ev("2026-08-07", known_ts=LIVE_AS_OF)      # fired earlier, knowable today
    h = hist(intervals=[["2026-04-01", "2026-12-31"]])
    assert mark_retro(SYM, [ev], history=h, live_as_of=LIVE_AS_OF) == 0


# ══════════════════════════════════════ 3. IT IS NEVER AN ENTRY (boundaries) ══
def test_the_mark_touches_nothing_but_its_own_two_fields():
    ev = blocked_ev()
    before = copy.deepcopy(ev)
    mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF)
    assert set(ev) - set(before) == {"retro_override", "retro_ctx"}
    for k in before:
        assert ev[k] == before[k], k


@pytest.mark.parametrize("ev_factory", [blocked_ev, keeper_block_ev])
def test_a_retro_fire_never_carries_an_entry_quality(ev_factory):
    ev = ev_factory()
    mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF, relievable_ts=[OLD_TS])
    assert ev["quality"] not in (OVERRIDE_TAKE_QUALITY, RECLAIM_OVERRIDE_TAKE_QUALITY)
    assert ev["tier"] is None and ev["score"] is None


def test_a_retro_fire_never_flips_the_position_walk():
    """``_state`` is the scored lane. Marking must not move it by a single field."""
    sell = {"ts": "2026-03-02", "known_ts": "2026-03-02", "bar_index": 90, "type": "SELL",
            "price": 9.0, "basis": contracts.BASIS_STRUCTURE_STOP}
    plain = [sell, blocked_ev()]
    marked = copy.deepcopy(plain)
    mark_retro(SYM, marked, history=hist(), live_as_of=LIVE_AS_OF)
    assert marked[1]["retro_override"] is True            # the mark really was applied
    assert contracts._state(_empty_frame(), marked) == contracts._state(_empty_frame(), plain)
    assert contracts._state(_empty_frame(), marked)["position_hint"] == "flat"


def test_a_retro_fire_never_fires_an_alert():
    ev = blocked_ev()
    mark_retro(SYM, [ev], history=hist(), live_as_of=LIVE_AS_OF)
    alert = {"symbol": SYM, "created_at": "2026-01-01T00:00:00Z",
             "condition": {"type": "signal", "target": "BUY"}}

    class _Data:
        def signals(self, _sym):
            return [ev]

    fired, *_ = ae.evaluate(alert, _Data())
    assert fired is False


def test_marking_can_never_reach_the_forward_ledger(tmp_path):
    """Structural, not behavioural: ``mark_retro`` has no ledger parameter to reach one with.

    The signature check is the real assertion — a future edit that adds a ledger argument
    fails here before it can ever write a row.
    """
    import inspect
    assert "ledger" not in inspect.signature(mark_retro).parameters

    (tmp_path / "washout_history.json").write_text(json.dumps(history()))
    g = WashoutStamper.create(state_path=tmp_path / "none.json",
                              ledger_path=tmp_path / "l.jsonl",
                              history_path=tmp_path / "washout_history.json",
                              today=date.fromisoformat(LIVE_AS_OF))
    ev = blocked_ev()
    assert g.retro(SYM, [ev]) == 1
    assert g.accrued == 0 and g.taken == 0 and g.stamped == 0
    assert g.flush() == 0
    assert not (tmp_path / "l.jsonl").exists()


# ══════════════════════════════════════════════════════ 4. THE FALLBACK ═══════
@pytest.mark.parametrize("doc", [
    pytest.param(None, id="not-a-dict"),
    pytest.param({"schema": "something.else.v1", "names": {}}, id="wrong-schema"),
    pytest.param({"schema": "basket_washout_history.v1"}, id="no-names-map"),
    pytest.param({"schema": "basket_washout_history.v1", "names": []}, id="names-not-a-map"),
])
def test_a_malformed_history_marks_nothing(doc):
    assert history_from_dict(doc) is None
    ev = blocked_ev()
    before = copy.deepcopy(ev)
    assert mark_retro(SYM, [ev], history=None, live_as_of=LIVE_AS_OF) == 0
    assert ev == before


def test_an_absent_history_file_is_a_log_line_not_an_exception(tmp_path):
    assert load_history(tmp_path / "nope.json") is None


def test_an_unreadable_history_file_is_a_log_line_not_an_exception(tmp_path):
    p = tmp_path / "washout_history.json"
    p.write_text("{ this is not json")
    assert load_history(p) is None


def test_a_history_cut_at_another_notch_is_refused_outright():
    """Windows cut at 25% must never paint a 20%-notch claim.

    A per-notch artifact serves every notch and is read at ours; a FLAT artifact is one
    notch's cut and must declare which — an undeclared or mismatched one is refused whole,
    rather than silently read as if it were ours.
    """
    # per-notch artifact, but nothing filed under the live notch ⇒ no windows at our notch
    h = hist(notch_key=str(WASHOUT_OVERRIDE_NOTCH + 5))
    ev = blocked_ev()
    assert mark_retro(SYM, [ev], history=h, live_as_of=LIVE_AS_OF) == 0

    # flat (single-notch) artifact declaring somebody else's notch ⇒ refused at load
    flat = {"schema": "basket_washout_history.v1", "notch": WASHOUT_OVERRIDE_NOTCH + 5,
            "names": {SYM: {"group_id": GROUP,
                            "intervals": [["2026-04-01", "2026-06-30"]]}}}
    assert history_from_dict(flat) is None

    # …and the same flat artifact declaring OUR notch is read normally
    flat["notch"] = WASHOUT_OVERRIDE_NOTCH
    h2 = history_from_dict(flat)
    assert h2 is not None
    ev2 = blocked_ev()
    assert mark_retro(SYM, [ev2], history=h2, live_as_of=LIVE_AS_OF) == 1


def test_no_live_state_means_no_fire_has_been_judged_yet():
    """``live_as_of=None`` — the mask never ran, so nothing is post-fence."""
    ev = blocked_ev(LIVE_AS_OF, known_ts=LIVE_AS_OF)
    h = hist(intervals=[["2026-04-01", "2026-12-31"]])
    assert mark_retro(SYM, [ev], history=h, live_as_of=None) == 1


def _empty_frame():
    import pandas as pd
    return pd.DataFrame()


def test_the_projection_is_wired_into_every_lane_that_writes_a_slice():
    """A display class applied by only SOME lanes is a marker that flickers.

    The nightly universe lane, the flagship regen and the 5-minute intraday refresh all
    rewrite the same slice file. If one of them skipped the projection, a retro mark would
    appear at 02:00 and vanish at 09:35 — the exact flicker the ledger replay exists to stop
    for the live classes. Grep, not import: these modules pull the whole ingest stack.
    """
    for lane in ("gen_slices_all", "regen_flagship_slices", "fast_flagship"):
        src = (ROOT / "ingest" / f"{lane}.py").read_text()
        assert ".retro(" in src, lane
        assert "keeper_relievable" in src, lane
