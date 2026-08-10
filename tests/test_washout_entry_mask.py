"""The LIVE washout-override enter mask — the ratified rule, in the code that runs it.

Ratification trail: Macro Dashboard ``research/BLOCKED_ENTRY_CONDITIONAL_PREREG.md``
§5 (RATIFIED at the 25% notch, GATE B PASSED on the production feed) and
``research/BLOCKED_ENTRY_RATIFICATION_PACKET_2026-08-10.md`` §2 (the surviving A1b rule) /
§4 (what ratification ships: the enter-mask conditional + the signal-era fence).

THE RULE: a raw CB/revBuy vetoed by ``bear_block``, whose name qualifies at the notch in the
washout state (point-in-time at the fire's known date), is TAKEN as a live entry.

What is pinned here, in order of how badly it would hurt to regress:

  1. **THE SPINE (``test_the_spine_*``)** — the fidelity ruling. The gauntleted construction
     enters on the fire ITSELF. ``bear_block`` requires below-200, so every override fire is
     counter-trend, and the keeper's ``reclaim_and_hold`` counter-trend leg would re-refuse
     nearly all of them. If an override fire ever reaches the keeper, this repo ships a much
     stricter rule than the one three rounds of gates cleared — silently, with every other
     test still green. The spine constructs exactly that fire (bear_blocked AND failing
     reclaim-and-hold, in a qualifying basket) and demands ``override_take``.
  2. the ERA FENCE — the constant, the slice field, the ledger field. Pre/post events must
     never pool; a track record that mixed them would measure neither rule.
  3. the MASK is one logical condition wide, and with no artifact the emission is
     byte-identical to the pre-fence era (golden diff vs origin/master @ 397700aa).
  4. an override entry is a REAL entry everywhere downstream — position walk, alerts.
  5. PIT — today's washout can never reach a historical fire, and a pre-fence display
     ledger row replays as the refusal it was, never as an entry.
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
from signal_layer import SIGNAL_ERA, SIGNAL_ERA_PRE, confluence, confluence_v2, contracts  # noqa: E402
from signal_layer.washout_override import (  # noqa: E402
    DEFAULT_THRESHOLD,
    OVERRIDE_TAKE_QUALITY,
    WASHOUT_OVERRIDE_NOTCH,
    WashoutStamper,
    qualifies,
    state_from_dict,
)
from tests import _synthetic_tape as tape  # noqa: E402

GROUP = "uranium_miners"


# ────────────────────────────────────────────────────────────────── fixtures ──
def artifact(as_of: str, *, peer_dd: float = -0.388, ticker: str = "SYNTH",
             hits: dict | None = None) -> dict:
    """A ``basket_washout_state.v1`` shaped like the live UEC/uranium exemplar.

    UEC 2026-08-03 (``uranium_miners`` peer-dd −38.8%) is the ONE live in-cohort exemplar in
    the packet — a ``bear_block`` ⊘ admitted at every threshold (packet §2, corrected
    post-Gate-B). HL's fires are keeper ``block`` on both feeds and are modelled as the
    NEGATIVE case below, not as admissions.
    """
    return {
        "schema": "basket_washout_state.v1",
        "as_of": as_of,
        "thresholds": [20, 25, 30],
        "baskets": {GROUP: {"name": "Uranium miners", "name_zh": "铀矿商",
                            "peer_median_dd_252": peer_dd, "n_members": 14}},
        "names": {ticker: {"group_id": GROUP, "peer_dd": peer_dd, "basis": "basket",
                           "qualifies": hits or {"20": True, "25": True, "30": True}}},
    }


def blocked_fires(sig: pd.DataFrame) -> list[int]:
    """Positional indices (non-NaN grid) of every ``bear_block``-vetoed raw buy."""
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    cand = ((rows["CB"] | rows["revBuy"]) & rows["bear_block"]).to_numpy(dtype=bool)
    return [int(p) for p in np.flatnonzero(cand)]


@pytest.fixture(scope="module")
def tape_frame():
    """The synthetic tape and its oracle frame — built once, read many."""
    close = tape.synthetic_close()
    return close, confluence.compute_signals(close)


@pytest.fixture(scope="module")
def last_fire(tape_frame):
    """The NEWEST bear_block-vetoed fire: (positional index, ts, known_ts)."""
    _close, sig = tape_frame
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    pos = blocked_fires(sig)[-1]
    ts = rows.index[pos].strftime("%Y-%m-%d")
    known = pd.Timestamp(rows["known_ts"].iloc[pos]).strftime("%Y-%m-%d")
    return pos, ts, known


def gate(tmp_path: Path, doc: dict | None, *, today: str, ledger: str = "l.jsonl",
         seed_rows: list[dict] | None = None) -> WashoutStamper:
    sp = tmp_path / "washout_state.json"
    if doc is not None:
        sp.write_text(json.dumps(doc))
    lp = tmp_path / ledger
    if seed_rows:
        lp.write_text("".join(json.dumps(r) + "\n" for r in seed_rows))
    return WashoutStamper.create(state_path=sp, ledger_path=lp, today=date.fromisoformat(today))


def emit(sig, close, *, symbol="SYNTH", gate_=None) -> dict:
    v2 = confluence_v2.build_v2(sig, close, symbol=symbol, override_gate=gate_)
    ind = contracts.indicator_contract(symbol, "3D", sig, bar_quality="real_ohlc",
                                       src_text="", honest_read="", v2=v2)
    return {"v2": v2, "ind": ind}


# ═══════════════════════════════════════════════════ 1. THE SPINE ═══════════
def test_the_spine_a_bear_blocked_fire_that_fails_reclaim_and_hold_is_TAKEN(tape_frame, last_fire, tmp_path):
    """The build's whole reason for existing, in one assertion.

    This fire is BOTH ``bear_block``-vetoed AND a fire the keeper's counter-trend leg
    refuses (asserted first, so the trap is proven present rather than assumed). With a
    qualifying washout state current at its known date, the emission must be
    ``override_take`` — an entry — and NOT a keeper verdict of any kind.
    """
    close, sig = tape_frame
    pos, ts, known = last_fire
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"]).reset_index(drop=True)

    # (a) the trap is real: routed through the keeper, this fire is refused a SECOND time,
    #     by the OTHER veto family — the one A1b never governed.
    verdict, reason = confluence_v2.keeper_verdict(
        pos, rows, confluence_v2._swing_highs(rows["close"]))
    assert (verdict, reason) == ("block", "counter-trend, no 200-reclaim/hold")

    # (b) the mask takes it anyway — that is the ratified rule.
    out = emit(sig, close, gate_=gate(tmp_path, artifact(known), today=known))
    takes = [s for s in out["ind"]["signals"] if s.get("quality") == OVERRIDE_TAKE_QUALITY]
    assert len(takes) == 1, "the qualifying bear_blocked fire must emit as an override entry"
    ev = takes[0]
    assert ev["ts"] == ts and ev["type"] in ("BUY", "REBUY")

    # (c) it is an ENTRY, not a decorated refusal
    assert "blocked" not in ev
    assert ev["quality"] != contracts.BLOCKED_QUALITY
    assert ev["quality"] not in ("take", "block", "pending"), "never a keeper verdict"
    assert "override_candidate" not in ev, "the display class is for refusals only"

    # (d) it says WHY, in the shape the ratification packet's receipts are cited in
    assert ev["quality_reason"] == (
        f"washout override: {GROUP} −38.8% ≤ −{WASHOUT_OVERRIDE_NOTCH}% (era {SIGNAL_ERA})")
    assert ev["override_ctx"]["group_id"] == GROUP
    assert ev["override_ctx"]["peer_dd"] == pytest.approx(-0.388)
    assert ev["override_ctx"]["as_of"] == known


def test_the_spine_tier_comes_from_the_standard_non_counter_trend_scoring(tape_frame, last_fire, tmp_path):
    """The tier is the recipe's, and the recipe has no counter-trend leg.

    An override entry must carry the same grade an unvetoed fire on that bar would have
    carried — not a downgrade, and not a null. A null tier here would be the tell that the
    fire took the ``regime_blocked`` path after all.
    """
    close, sig = tape_frame
    pos, _ts, known = last_fire
    out = emit(sig, close, gate_=gate(tmp_path, artifact(known), today=known))
    (ev,) = [s for s in out["ind"]["signals"] if s.get("quality") == OVERRIDE_TAKE_QUALITY]
    assert ev["tier"] in ("aplus", "quality", "base")
    assert isinstance(ev["score"], int)
    # identical to what the recipe computed for that bar, untouched by the override
    assert out["v2"]["recipe"][pos] == {"score": ev["score"], "tier": ev["tier"]}


def test_a_keeper_block_is_never_taken_even_in_a_qualifying_basket(tape_frame, tmp_path):
    """HL's shape: a keeper ``block`` is the RECLAIM-VETO family, outside the A1b cohort.

    The gate is only ever asked about ``bear_block``-vetoed fires, so a keeper-blocked fire
    in the same qualifying basket keeps its verdict verbatim. The packet's "3 of 3 exemplars"
    framing was withdrawn on exactly this distinction (prereg §5, Gate B correction).
    """
    close, sig = tape_frame
    known = pd.Timestamp(
        sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])["known_ts"].iloc[-1]
    ).strftime("%Y-%m-%d")
    out = emit(sig, close, gate_=gate(tmp_path, artifact(known), today=known))
    keeper_blocks = [s for s in out["ind"]["signals"] if s.get("quality") == "block"]
    assert keeper_blocks, "fixture must contain keeper blocks for this to mean anything"
    for s in keeper_blocks:
        assert s["quality"] == "block"
        assert "override_ctx" not in s


# ═══════════════════════════════════════════════ 2. THE ERA FENCE ═══════════
def test_the_era_constant_is_pinned():
    """A module-level constant, asserted — the hk_prophet_v2 BOARD_DEFINITION pattern.

    Changing either string is an era event with a forward ledger behind it, never a tidy-up.
    """
    assert SIGNAL_ERA == "gc_v2_wo1"
    assert SIGNAL_ERA_PRE == "gc_v2"
    assert SIGNAL_ERA != SIGNAL_ERA_PRE
    assert contracts.SIGNAL_ERA is SIGNAL_ERA


def test_the_notch_is_written_in_exactly_one_place():
    """25%, ratified. The artifact-facing threshold DERIVES from it, so display and entry
    can never be asked at different numbers."""
    assert WASHOUT_OVERRIDE_NOTCH == 25
    assert DEFAULT_THRESHOLD == str(WASHOUT_OVERRIDE_NOTCH)
    src = (ROOT / "signal_layer" / "washout_override.py").read_text()
    assert src.count("WASHOUT_OVERRIDE_NOTCH = ") == 1


def test_every_slice_emission_carries_the_era(tape_frame):
    """Stamped unconditionally — including on emissions that grant nothing. An artifact that
    only declared its era when the new behaviour fired would leave the quiet majority
    unattributable, which is the pooling the fence exists to stop."""
    close, sig = tape_frame
    ind = emit(sig, close)["ind"]                       # no gate at all
    assert ind["signal_era"] == SIGNAL_ERA
    assert contracts.model_slice(ind)["signal_era"] == SIGNAL_ERA
    # a slice from before the fence carries no field, and must read as the OLD era
    legacy = dict(ind)
    legacy.pop("signal_era")
    assert contracts.model_slice(legacy)["signal_era"] == SIGNAL_ERA_PRE


def test_the_ledger_row_carries_the_era_and_whether_the_rule_took_it(tape_frame, last_fire, tmp_path):
    """The forward ledger grades the AS-SHIPPED rule from night one — so each row has to say
    which rule minted it and what that rule did."""
    close, sig = tape_frame
    _pos, ts, known = last_fire
    g = gate(tmp_path, artifact(known), today=known)
    ind = emit(sig, close, gate_=g)["ind"]
    g.stamp("SYNTH", ind["signals"], today=date.fromisoformat(known))
    assert g.taken == 1 and g.accrued == 1
    g.flush()
    rows = [json.loads(x) for x in (tmp_path / "l.jsonl").read_text().splitlines() if x.strip()]
    assert len(rows) == 1
    row = rows[0]
    assert row["era"] == SIGNAL_ERA
    assert row["taken"] is True
    assert row["ticker"] == "SYNTH" and row["ts"] == ts and row["known_ts"] == known
    assert row["peer_dd"] == pytest.approx(-0.388)


def test_a_display_stamp_row_is_recorded_as_not_taken(tmp_path):
    """The other half of the ledger's vocabulary: a qualifying fire that stayed refused."""
    g = gate(tmp_path, artifact("2026-08-10"), today="2026-08-10")
    ev = {"ts": "2026-08-10", "known_ts": "2026-08-10", "type": "BUY", "price": 6.1,
          "quality": contracts.BLOCKED_QUALITY, "blocked": True}
    assert g.stamp("SYNTH", [ev]) == 1
    g.flush()
    (row,) = [json.loads(x) for x in (tmp_path / "l.jsonl").read_text().splitlines() if x.strip()]
    assert row["era"] == SIGNAL_ERA and row["taken"] is False


# ═════════════════════════════════════════ 3. THE MASK + THE FALLBACK ═══════
def test_the_enter_mask_is_exactly_one_logical_condition_wide(tape_frame, last_fire, tmp_path):
    """``(CB|revBuy) & ~bear_block``  →  ``(CB|revBuy) & (~bear_block | override_ok)``.

    With no grant the mask is bit-identical to the pre-fence one; with a grant it differs by
    exactly the granted rows and nothing else.
    """
    close, sig = tape_frame
    _pos, _ts, known = last_fire
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    pre = ((rows["CB"] | rows["revBuy"]) & ~rows["bear_block"]).astype(bool)

    assert confluence_v2.v2_streams(sig)["enter"].equals(pre)
    assert confluence_v2.v2_streams(sig, override_ok={})["enter"].equals(pre)

    ovr = confluence_v2.override_entries(sig, "SYNTH", gate(tmp_path, artifact(known), today=known))
    assert ovr, "fixture must grant at least one override for this to mean anything"
    post = confluence_v2.v2_streams(sig, override_ok=ovr)["enter"]
    changed = [int(i) for i in np.flatnonzero((post != pre).to_numpy())]
    assert changed == sorted(int(p) for p in ovr)


def test_the_documented_mask_and_the_emitted_stream_agree(tape_frame, last_fire, tmp_path):
    """``v2_streams`` states the mask; ``keeper``+``override`` are what the emitter acts on.
    They are two expressions of one rule, so they are pinned to each other here — otherwise
    the documented contract could drift away from the code that runs."""
    close, sig = tape_frame
    _pos, _ts, known = last_fire
    g = gate(tmp_path, artifact(known), today=known)
    v2 = emit(sig, close, gate_=g)["v2"]
    entered = set(v2["keeper"]) | set(v2["override"])
    assert not (set(v2["keeper"]) & set(v2["override"])), "the two cohorts must stay disjoint"
    mask = confluence_v2.v2_streams(sig, override_ok=v2["override"])["enter"]
    assert {int(i) for i in np.flatnonzero(mask.to_numpy())} == entered


def test_no_artifact_emits_exactly_what_the_pre_fence_engine_emitted(tmp_path):
    """THE FALLBACK, proved by golden diff.

    ``tests/golden/no_state_slice.json`` was generated by the emitter at origin/master
    @ 397700aa — before this change existed. With the gate wired but no state file, the
    signals and state must still equal it, entry for entry, field for field. An empty diff
    is the only honest form of "byte-identical behaviour to master".
    """
    golden = json.loads((ROOT / "tests" / "golden" / "no_state_slice.json").read_text())
    missing = tmp_path / "does_not_exist.json"
    g = WashoutStamper.create(state_path=missing, ledger_path=tmp_path / "empty.jsonl")
    assert g.state is None
    assert tape.emit(symbol="SYNTH", override_gate=g) == golden
    # and with no gate at all (any caller that has not wired one)
    assert tape.emit() == golden


def test_a_stale_artifact_grants_nothing(tape_frame, last_fire, tmp_path):
    """Staleness is enforced where the artifact is loaded, so the gate simply has no state.
    Six sessions past a 5-session tolerance: refuse, quietly, and render as ever."""
    close, sig = tape_frame
    _pos, _ts, known = last_fire
    stale_today = (pd.Timestamp(known) + pd.tseries.offsets.BDay(6)).strftime("%Y-%m-%d")
    g = gate(tmp_path, artifact(known), today=stale_today)
    assert g.state is None
    assert confluence_v2.override_entries(sig, "SYNTH", g) == {}
    ind = emit(sig, close, gate_=g)["ind"]
    assert not [s for s in ind["signals"] if s.get("quality") == OVERRIDE_TAKE_QUALITY]


def test_a_name_below_the_notch_is_not_taken(tape_frame, last_fire, tmp_path):
    close, sig = tape_frame
    _pos, _ts, known = last_fire
    doc = artifact(known, peer_dd=-0.21, hits={"20": True, "25": False, "30": False})
    assert confluence_v2.override_entries(sig, "SYNTH", gate(tmp_path, doc, today=known)) == {}


def test_a_name_absent_from_the_state_is_not_taken(tape_frame, last_fire, tmp_path):
    close, sig = tape_frame
    _pos, _ts, known = last_fire
    doc = artifact(known, ticker="SOMEONE_ELSE")
    assert confluence_v2.override_entries(sig, "SYNTH", gate(tmp_path, doc, today=known)) == {}


# ══════════════════════════════════════════════ 4. POINT IN TIME ════════════
def test_todays_washout_never_reaches_a_historical_fire(tape_frame, tmp_path):
    """The PIT rule, which is what makes this incapable of rewriting history. Only fires
    whose known date is at or after the state's ``as_of`` can be taken — on the first night
    that is one fire at most, and every older ⊘ stays a ⊘."""
    close, sig = tape_frame
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    pos = blocked_fires(sig)
    assert len(pos) >= 2, "fixture must carry history for this to mean anything"
    newest_known = pd.Timestamp(rows["known_ts"].iloc[pos[-1]]).strftime("%Y-%m-%d")
    granted = confluence_v2.override_entries(
        sig, "SYNTH", gate(tmp_path, artifact(newest_known), today=newest_known))
    assert set(granted) == {pos[-1]}, "every earlier fire must stay refused"


def test_qualifies_refuses_a_fire_that_predates_the_state():
    st = state_from_dict(artifact("2026-08-10"), today=date(2026, 8, 10))
    assert qualifies("SYNTH", "2026-08-09", state=st) is None      # fire before as_of
    assert qualifies("SYNTH", "2026-08-10", state=st) is not None  # fire on as_of
    assert qualifies("SYNTH", "2026-08-11", state=st) is not None  # fire after as_of
    assert qualifies("SYNTH", "2026-08-10", state=None) is None    # no artifact
    assert qualifies("SYNTH", "not-a-date", state=st) is None
    # the notch is a real gate, not decoration
    assert qualifies("SYNTH", "2026-08-10", state=st, notch=99) is None


def test_a_pre_fence_ledger_row_replays_as_a_refusal_not_an_entry(tape_frame, last_fire, tmp_path):
    """The era fence's belt-and-braces.

    The display build (#375) minted rows carrying no ``era``/``taken``. Those fires were
    refusals when they happened and must stay refusals forever — replaying one as an entry
    would retroactively add a trade to a track record that never took it.
    """
    close, sig = tape_frame
    _pos, ts, known = last_fire
    legacy_row = {"ts": ts, "known_ts": known, "ticker": "SYNTH", "price": 1.0,
                  "group_id": GROUP, "peer_dd": -0.388,
                  "override_ctx": {"group_id": GROUP, "peer_dd": -0.388,
                                   "thresholds_hit": [20, 25, 30], "as_of": known}}
    g = gate(tmp_path, artifact(known), today=known, seed_rows=[legacy_row])
    assert confluence_v2.override_entries(sig, "SYNTH", g) == {}
    ind = emit(sig, close, gate_=g)["ind"]
    assert not [s for s in ind["signals"] if s.get("quality") == OVERRIDE_TAKE_QUALITY]
    # …and the display class still replays onto it, exactly as it did before this build
    g.stamp("SYNTH", ind["signals"])
    (ev,) = [s for s in ind["signals"] if s.get("override_candidate")]
    assert ev["ts"] == ts and ev["quality"] == contracts.BLOCKED_QUALITY


def test_a_granted_entry_survives_a_night_with_no_artifact(tape_frame, last_fire, tmp_path):
    """Ledger replay is what makes an entry stable. The macro feed going down must not
    retract a trade the engine already took and published."""
    close, sig = tape_frame
    _pos, ts, known = last_fire
    g1 = gate(tmp_path, artifact(known), today=known)
    ind1 = emit(sig, close, gate_=g1)["ind"]
    g1.stamp("SYNTH", ind1["signals"], today=date.fromisoformat(known))
    g1.flush()

    # next run: artifact gone, ledger intact
    g2 = WashoutStamper.create(state_path=tmp_path / "gone.json",
                               ledger_path=tmp_path / "l.jsonl",
                               today=date.fromisoformat(known))
    assert g2.state is None
    ind2 = emit(sig, close, gate_=g2)["ind"]
    (ev,) = [s for s in ind2["signals"] if s.get("quality") == OVERRIDE_TAKE_QUALITY]
    assert ev["ts"] == ts
    assert ev["override_ctx"]["peer_dd"] == pytest.approx(-0.388)   # the FIRE's own number
    # replay must not double-write the forward ledger
    g2.stamp("SYNTH", ind2["signals"], today=date.fromisoformat(known))
    assert g2.accrued == 0


# ════════════════════════════════ 5. AN ENTRY EVERYWHERE DOWNSTREAM ═════════
def test_an_override_entry_walks_the_position(tape_frame, last_fire, tmp_path):
    """It IS an entry now, so ``position_hint``/``last_scored_signal`` must say so. The
    2026-07-15 META exclusion is written against ``blocked``/``regime_blocked`` BY NAME
    precisely so a new entry class is not swept up in it."""
    close, sig = tape_frame
    _pos, ts, known = last_fire
    ind = emit(sig, close, gate_=gate(tmp_path, artifact(known), today=known))["ind"]
    (ev,) = [s for s in ind["signals"] if s.get("quality") == OVERRIDE_TAKE_QUALITY]
    assert ev["bar_index"] == max(s["bar_index"] for s in ind["signals"]), "fixture: it is the tail"
    st = ind["state"]
    assert st["position_hint"] == "long"
    assert st["last_scored_signal"] == ev["type"]
    assert st["last_scored_ts"] == known


def test_an_override_entry_fires_a_buy_alert(tmp_path):
    """ingest/alerts_engine skips refused entries (7e49bade) by keying on
    ``blocked``/``regime_blocked``. An override entry carries neither, so it must reach the
    user as the BUY it is — this is the one place a marker becomes an instruction."""
    (tmp_path / "manifest.json").write_text(json.dumps({"symbols": {"SYNTH": {}}}))
    ev = {"ts": "2026-08-10", "known_ts": "2026-08-10", "bar_index": 3, "type": "BUY",
          "price": 6.1, "strength": 0.45, "quality": OVERRIDE_TAKE_QUALITY,
          "quality_reason": f"washout override: {GROUP} −38.8% ≤ −25% (era {SIGNAL_ERA})",
          "tier": "quality", "score": 71}
    (tmp_path / "SYNTH.slice.json").write_text(json.dumps({"indicator": {"signals": [ev]}}))
    data = ae.Data(str(tmp_path), None)
    alert = {"symbol": "SYNTH", "created_at": "2026-08-01T00:00:00Z",
             "condition": {"type": "signal", "target": "BUY"}}
    fired, value, note, _ = ae.evaluate(alert, data)
    assert fired is True
    assert value == 6.1
    assert "BUY signal on 2026-08-10" in note

    # …and the refused class it grew out of still does NOT fire
    blocked = dict(ev, quality=contracts.BLOCKED_QUALITY, blocked=True)
    (tmp_path / "SYNTH.slice.json").write_text(json.dumps({"indicator": {"signals": [blocked]}}))
    assert ae.evaluate(alert, ae.Data(str(tmp_path), None))[0] is False


def test_the_quality_string_is_one_string(tape_frame):
    """Two modules name this class; a drift between them would split the cohort in half."""
    assert contracts.OVERRIDE_TAKE_QUALITY == OVERRIDE_TAKE_QUALITY == "override_take"
    assert OVERRIDE_TAKE_QUALITY != contracts.BLOCKED_QUALITY


def test_the_reason_degrades_without_inventing(tape_frame):
    """A partial artifact yields a shorter line, never a wrong number or an empty slot."""
    assert contracts.override_quality_reason({"group_id": GROUP, "peer_dd": -0.312}) == (
        f"washout override: {GROUP} −31.2% ≤ −25% (era {SIGNAL_ERA})")
    assert contracts.override_quality_reason({"group_id": GROUP}) == (
        f"washout override: {GROUP} ≤ −25% (era {SIGNAL_ERA})")
    assert contracts.override_quality_reason({}) == f"washout override: ≤ −25% (era {SIGNAL_ERA})"
    assert contracts.override_quality_reason(None) == f"washout override: ≤ −25% (era {SIGNAL_ERA})"


def test_the_gate_is_wired_into_every_lane_that_writes_a_slice():
    """Three ingest lanes emit slices. A lane that builds v2 without the gate would publish
    a pre-fence emission next to post-fence ones — the exact pooling the fence forbids."""
    for lane in ("gen_slices_all.py", "regen_flagship_slices.py", "fast_flagship.py"):
        src = (ROOT / "ingest" / lane).read_text()
        assert "override_gate=" in src, f"{lane} builds v2 without the washout gate"
        assert "symbol=sym" in src, f"{lane} passes no symbol to the gate"
