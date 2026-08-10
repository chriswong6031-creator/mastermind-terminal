"""Blocked-entry washout override — the PIT stamping rule, the cohort gate, the ledger.

Receipts for the ratified rule: Macro Dashboard
``research/BLOCKED_ENTRY_RATIFICATION_PACKET_2026-08-10.md`` (§2 rule, §4 what ships) and
``research/BLOCKED_ENTRY_CONDITIONAL_PREREG.md`` §5 (operator ratification, threshold 25%) /
§7 (the A1b construction). Production-feed re-grade (gate B) reproduced the premium.

What is pinned here, in order of how badly it would hurt to regress:
  1. the COHORT — only ``quality == "regime_blocked"`` is stampable; a keeper ``block`` is a
     different refusal and must stay plain even inside a qualifying basket;
  2. the PIT rule — today's basket state never lands on a historical fire, and a stamp that
     WAS earned survives the nightly full regen by ledger replay;
  3. the fallback — absent/stale/garbage artifact leaves every event byte-identical;
  4. ledger idempotency across a double nightly run.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from signal_layer import contracts
from signal_layer.washout_override import (
    DEFAULT_THRESHOLD,
    DailyBars,
    OverrideLedger,
    WashoutStamper,
    as_drawdown_fraction,
    atr14,
    sessions_between,
    state_from_dict,
    stop_reference,
)

AS_OF = "2026-08-10"
TODAY = date(2026, 8, 10)


def artifact(as_of: str = AS_OF, **over) -> dict:
    """A minimal ``basket_washout_state.v1`` carrying the live exemplar (UEC/uranium_miners).

    UEC 2026-08-03 (peer-dd −38.8%) is the ONE live in-cohort exemplar from the packet — it
    admits at every threshold. HL's 2026-06-16/06-25 fires are deliberately NOT modelled as
    admissions: they are keeper ``block`` events on both feeds, outside this cohort.
    """
    doc = {
        "schema": "basket_washout_state.v1",
        "as_of": as_of,
        "thresholds": [20, 25, 30],
        "baskets": {
            "uranium_miners": {
                "name": "Uranium miners", "name_zh": "铀矿商",
                "peer_median_dd_252": -0.388, "n_members": 14,
                "qualifies": {"20": True, "25": True, "30": True},
            },
            "software_infra": {
                "name": "Software infrastructure", "name_zh": "软件基础设施",
                "peer_median_dd_252": -0.11, "n_members": 41,
                "qualifies": {"20": False, "25": False, "30": False},
            },
        },
        "names": {
            "UEC": {"basis": "basket", "group_id": "uranium_miners", "peer_dd": -0.388,
                    "qualifies": {"20": True, "25": True, "30": True}},
            # shallower than the live 20% notch — the "qualified at some notch, but not
            # ours" case. At notch 20 (the grid's floor) that means qualifying nowhere.
            "SHALLOW": {"basis": "basket", "group_id": "uranium_miners", "peer_dd": -0.15,
                        "qualifies": {"20": False, "25": False, "30": False}},
            # qualifies at the live 20% notch and nowhere deeper — the name that proves the
            # dial moved: pre-wo2 (notch 25) it was refused, and it is taken now.
            "MID": {"basis": "basket", "group_id": "uranium_miners", "peer_dd": -0.22,
                    "qualifies": {"20": True, "25": False, "30": False}},
            "CALM": {"basis": "sector", "group_id": "software_infra", "peer_dd": -0.11,
                     "qualifies": {"20": False, "25": False, "30": False}},
        },
    }
    doc.update(over)
    return doc


def blocked_ev(ts: str, **over) -> dict:
    """A ``regime_blocked`` event exactly as ``contracts._extract_signals`` emits one."""
    ev = {
        "ts": ts, "known_ts": ts, "bar_index": 424, "type": "BUY", "strength": 2,
        "price": 10.5, "reasons": ["macd_bull_cross", "recent_b1", "confirm_bull", "rsi<65"],
        "regime": {"weeklyBull": False, "above200": False, "monthlyBull": False},
        "quality": contracts.BLOCKED_QUALITY,
        "quality_reason": "bear_block: monthly-bear & below-200 & 2W-not-bull",
        "tier": None, "score": None, "blocked": True,
    }
    ev.update(over)
    return ev


def keeper_block_ev(ts: str) -> dict:
    """A keeper ``block`` — a DIFFERENT refusal, outside the studied cohort (HL's shape)."""
    return {
        "ts": ts, "known_ts": ts, "bar_index": 400, "type": "BUY", "strength": 2,
        "price": 6.1, "reasons": ["macd_bull_cross"],
        "regime": {"weeklyBull": False, "above200": False, "monthlyBull": True},
        "quality": "block", "quality_reason": "counter-trend, no 200-reclaim/hold",
        "tier": None, "score": None,
    }


def stamper(tmp_path: Path, doc: dict | None = None, *, today: date = TODAY,
            ledger_name: str = "ledger.jsonl") -> WashoutStamper:
    sp = tmp_path / "washout_state.json"
    if doc is not None:
        sp.write_text(json.dumps(doc))
    return WashoutStamper.create(state_path=sp, ledger_path=tmp_path / ledger_name, today=today)


# ─────────────────────────────────────────────────── 1. the cohort gate ──
def test_regime_blocked_fire_in_a_qualifying_basket_is_stamped(tmp_path):
    st = stamper(tmp_path, artifact())
    ev = blocked_ev(AS_OF)
    assert st.stamp("UEC", [ev]) == 1
    assert ev["override_candidate"] is True
    assert ev["override_ctx"]["group_id"] == "uranium_miners"
    assert ev["override_ctx"]["peer_dd"] == pytest.approx(-0.388)
    assert ev["override_ctx"]["thresholds_hit"] == [20, 25, 30]
    assert ev["override_ctx"]["name"] == "Uranium miners"
    assert ev["override_ctx"]["name_zh"] == "铀矿商"
    # the refusal itself is untouched — this is a display class, not a promotion
    assert ev["quality"] == "regime_blocked" and ev["blocked"] is True
    assert ev["tier"] is None and ev["score"] is None and ev["type"] == "BUY"


def test_keeper_block_is_never_stamped_even_inside_a_qualifying_basket(tmp_path):
    """LOAD-BEARING (2026-08-10 correction): keeper ``block`` != ``bear_block``.

    HL's 2026-06-16/06-25 fires are keeper ``block`` ("counter-trend, no 200-reclaim/hold")
    on BOTH feeds, so they are outside the measured cohort and must never wear the override
    class — even though ``silver_miners`` qualifies at every threshold. The gate reads the
    quality string, not the ``blocked`` render flag, precisely so this stays true.
    """
    st = stamper(tmp_path, artifact())
    ev = keeper_block_ev(AS_OF)
    before = dict(ev)
    assert st.stamp("UEC", [ev]) == 0
    assert ev == before
    assert "override_candidate" not in ev
    assert st.ledger.pending == []


def test_below_threshold_and_unlisted_names_stay_plain(tmp_path):
    st = stamper(tmp_path, artifact())
    shallow, calm, absent = blocked_ev(AS_OF), blocked_ev(AS_OF), blocked_ev(AS_OF)
    baseline = dict(blocked_ev(AS_OF))
    assert st.stamp("SHALLOW", [shallow]) == 0   # qualifies at nothing; live notch is 20
    assert st.stamp("CALM", [calm]) == 0
    assert st.stamp("NOTINARTIFACT", [absent]) == 0
    for ev in (shallow, calm, absent):
        assert ev == baseline          # byte-identical to a pre-override event
    # …and the dial's own witness: MID clears 20 and nothing deeper, so it is exactly the
    # name the 25 → 20 move added. It stamps.
    mid = blocked_ev(AS_OF)
    assert st.stamp("MID", [mid]) == 1
    assert mid["override_ctx"]["thresholds_hit"] == [20]


def test_threshold_is_a_config_dial_not_a_code_change(tmp_path, monkeypatch):
    """20/25/30 all passed every frozen gate — the notch is an operator aggressiveness dial.

    Live setting is 20 since gc_v2_wo2; the env lever must still move it, and moving it must
    still move DISPLAY and ENTRY together (they read the same number or the amber ring and
    the mask disagree about who qualifies).
    """
    assert DEFAULT_THRESHOLD == "20"
    monkeypatch.setenv("WASHOUT_THRESHOLD", "30")
    st = stamper(tmp_path, artifact())
    ev = blocked_ev(AS_OF)
    assert st.stamp("UEC", [ev]) == 1
    assert ev["override_ctx"]["thresholds_hit"] == [20, 25, 30]


# ────────────────────────────────────────────────────── 2. the PIT rule ──
def test_historical_fire_is_never_backfilled_with_todays_state(tmp_path):
    """The whole point: a 2021 ⊘ does not turn amber because a basket is washed out today."""
    st = stamper(tmp_path, artifact())
    old = blocked_ev("2021-03-04")
    assert st.stamp("UEC", [old]) == 0
    assert "override_candidate" not in old and "override_ctx" not in old


def test_fire_on_the_artifact_date_stamps_and_a_fire_one_day_earlier_does_not(tmp_path):
    st = stamper(tmp_path, artifact())
    same, prior = blocked_ev(AS_OF), blocked_ev("2026-08-07")
    assert st.stamp("UEC", [same]) == 1
    assert st.stamp("UEC", [prior]) == 0


def test_known_ts_not_ts_is_the_pit_coordinate(tmp_path):
    """``ts`` is the 3D bar OPEN; ``known_ts`` is when the row became observable."""
    st = stamper(tmp_path, artifact())
    ev = blocked_ev("2026-08-06", known_ts=AS_OF)   # bar opened 4 sessions before it was known
    assert st.stamp("UEC", [ev]) == 1


def test_grace_days_is_opt_in_and_defaults_to_strict(tmp_path, monkeypatch):
    monkeypatch.setenv("WASHOUT_PIT_GRACE_DAYS", "5")
    st = stamper(tmp_path, artifact())
    ev = blocked_ev("2026-08-07")
    assert st.stamp("UEC", [ev]) == 1               # inside the operator-opened window
    monkeypatch.setenv("WASHOUT_PIT_GRACE_DAYS", "0")
    st2 = stamper(tmp_path, artifact(), ledger_name="l2.jsonl")
    assert st2.stamp("UEC", [blocked_ev("2026-08-07")]) == 0


def test_ledger_replay_survives_the_nightly_regen_without_reading_todays_state(tmp_path):
    """Night 1 stamps a fire; night 4 regenerates the same slice with a MOVED artifact.

    Without replay the marker would flicker amber→slate the day after it fired. Replay reads
    the row minted on the fire's own night, so history keeps history's numbers.
    """
    n1 = stamper(tmp_path, artifact())
    ev1 = blocked_ev(AS_OF)
    assert n1.stamp("UEC", [ev1]) == 1
    assert n1.flush() == 1

    later = artifact(as_of="2026-08-13")
    later["names"]["UEC"]["peer_dd"] = -0.12          # basket has since recovered
    later["names"]["UEC"]["qualifies"] = {"20": False, "25": False, "30": False}
    n4 = stamper(tmp_path, later, today=date(2026, 8, 13))
    ev2 = blocked_ev(AS_OF)
    assert n4.stamp("UEC", [ev2]) == 1
    assert ev2["override_candidate"] is True
    assert ev2["override_ctx"]["peer_dd"] == pytest.approx(-0.388)   # the FIRE's number
    assert ev2["override_ctx"]["as_of"] == AS_OF
    assert n4.replayed == 1 and n4.stamped == 0
    assert n4.flush() == 0                            # replay never re-accrues


# ───────────────────────────────────────────────────── 3. the fallback ──
@pytest.mark.parametrize("doc", [
    None,                                                    # artifact absent
    {"schema": "basket_washout_state.v1", "as_of": "2026-07-20",
     "names": {"UEC": {"group_id": "uranium_miners", "peer_dd": -0.388,
                       "qualifies": {"25": True}}}},         # stale past 5 sessions
    {"schema": "something_else.v3", "as_of": AS_OF, "names": {}},   # wrong schema
    {"schema": "basket_washout_state.v1", "names": {}},      # no as_of
    {"schema": "basket_washout_state.v1", "as_of": AS_OF},   # no names map
])
def test_absent_stale_or_malformed_artifact_leaves_every_event_untouched(tmp_path, doc):
    st = stamper(tmp_path, doc)
    ev = blocked_ev(AS_OF)
    baseline = dict(ev)
    assert st.stamp("UEC", [ev]) == 0
    assert ev == baseline
    assert st.flush() == 0
    assert not (tmp_path / "ledger.jsonl").exists()


def test_unparseable_artifact_is_a_log_line_not_an_exception(tmp_path, caplog):
    """Gate (5): a single log line, never a user-facing error and never a crashed nightly."""
    sp = tmp_path / "washout_state.json"
    sp.write_text("{not json at all")
    with caplog.at_level("WARNING", logger="signal_layer.washout_override"):
        st = WashoutStamper.create(state_path=sp, ledger_path=tmp_path / "l.jsonl", today=TODAY)
        ev = blocked_ev(AS_OF)
        assert st.stamp("UEC", [ev]) == 0
    assert "override_candidate" not in ev
    msgs = [r.getMessage() for r in caplog.records]
    assert sum("washout override" in m for m in msgs) == 1


def test_staleness_boundary_is_five_sessions(tmp_path):
    # 2026-08-03 (Mon) → 2026-08-10 (Mon) = 5 weekdays: the last usable day.
    assert sessions_between("2026-08-03", "2026-08-10") == 5
    ok = state_from_dict(artifact(as_of="2026-08-03"), today=TODAY)
    assert ok is not None
    assert state_from_dict(artifact(as_of="2026-07-31"), today=TODAY) is None


# ───────────────────────────────────────────────────────── 4. the ledger ──
def test_ledger_row_carries_the_forward_grading_fields(tmp_path):
    st = stamper(tmp_path, artifact())
    ev = blocked_ev(AS_OF, price=10.5)
    daily = DailyBars(
        bar_opens=["2026-08-04", "2026-08-06", AS_OF],
        dates=["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", AS_OF],
        high=[11.0] * 5, low=[10.0, 9.5, 9.2, 9.4, 9.8], close=[10.5] * 5)
    assert st.stamp("UEC", [ev], daily=daily) == 1
    assert st.flush() == 1
    rows = [json.loads(l) for l in (tmp_path / "ledger.jsonl").read_text().splitlines()]
    assert len(rows) == 1
    r = rows[0]
    assert set(("ts", "known_ts", "ticker", "price", "stop_ref",
                "group_id", "peer_dd", "thresholds_hit")) <= set(r)
    assert r["ticker"] == "UEC" and r["ts"] == AS_OF and r["price"] == 10.5
    assert r["group_id"] == "uranium_miners" and r["thresholds_hit"] == [20, 25, 30]
    assert r["stop_ref"] is None or r["stop_ref"] < 9.2   # below the 3-bar low by the ATR buffer


def test_double_nightly_run_appends_the_row_exactly_once(tmp_path):
    """Acceptance gate (c): the append is idempotent per (ticker, ts)."""
    led = tmp_path / "ledger.jsonl"
    for _ in range(2):
        st = stamper(tmp_path, artifact())
        st.stamp("UEC", [blocked_ev(AS_OF)])
        st.flush()
    rows = [json.loads(l) for l in led.read_text().splitlines()]
    assert len(rows) == 1
    # and a third run in the SAME process, re-stamping the same fire twice
    st = stamper(tmp_path, artifact())
    st.stamp("UEC", [blocked_ev(AS_OF)])
    st.stamp("UEC", [blocked_ev(AS_OF)])
    assert st.flush() == 0
    assert len(led.read_text().splitlines()) == 1


def test_two_fires_on_one_name_are_two_rows(tmp_path):
    st = stamper(tmp_path, artifact())
    st.stamp("UEC", [blocked_ev(AS_OF), blocked_ev("2026-08-11")])
    assert st.flush() == 2


def test_replay_only_lane_never_accrues(tmp_path):
    """The intraday flagship refresh must not fill the forward ledger from a partial session."""
    st = stamper(tmp_path, artifact())
    ev = blocked_ev(AS_OF)
    assert st.stamp("UEC", [ev], accrue=False) == 1
    assert ev["override_candidate"] is True
    assert st.flush() == 0
    assert not (tmp_path / "ledger.jsonl").exists()


def test_torn_ledger_line_does_not_poison_the_rest(tmp_path):
    led = tmp_path / "ledger.jsonl"
    led.write_text(json.dumps({"ticker": "UEC", "ts": AS_OF,
                               "override_ctx": {"group_id": "uranium_miners", "peer_dd": -0.4}})
                   + "\n{ half written\n")
    lg = OverrideLedger.open(led)
    assert lg.get("UEC", AS_OF) is not None
    assert len(lg.rows) == 1


# ──────────────────────────────────────────── 5. the stop reference math ──
def test_stop_reference_is_the_three_bar_low_minus_half_an_atr():
    dates = [f"2026-06-{d:02d}" for d in range(1, 28)]
    high = [10.0 + i * 0.1 for i in range(27)]
    low = [9.0 + i * 0.1 for i in range(27)]
    close = [9.5 + i * 0.1 for i in range(27)]
    low[22] = 5.0                                    # the washout print inside the fire window
    bar_opens = [dates[i] for i in range(0, 27, 3)]
    fire = bar_opens[-1]                             # opens at dates[24]
    ref = stop_reference(fire, bar_opens, dates, high, low, close)
    assert ref is not None
    window_low = min(low[18:27])                     # fire bar + 2 prior = 9 daily sessions
    atr = atr14(high, low, close)[26]
    assert ref == pytest.approx(window_low - 0.5 * atr)
    assert ref < window_low


def test_stop_reference_is_none_rather_than_a_guess_when_inputs_are_short():
    assert stop_reference("2026-08-10", [], [], [], [], []) is None
    assert stop_reference("2026-08-10", ["2026-08-10"], ["2026-08-10"],
                          [1.0], [1.0], [1.0]) is None   # no ATR yet


# ───────────────────────────────────────── 6. artifact unit normalization ──
@pytest.mark.parametrize("raw,expect", [
    (-0.388, -0.388), (0.388, -0.388), (-38.8, -0.388), (38.8, -0.388),
    (0, -0.0), (None, None), ("x", None), (True, None),
])
def test_peer_dd_is_normalized_to_one_negative_fraction(raw, expect):
    got = as_drawdown_fraction(raw)
    if expect is None:
        assert got is None
    else:
        assert got == pytest.approx(expect)


def test_qualifies_map_is_the_authority_over_derived_peer_dd(tmp_path):
    """A publisher that says 'no' at the live notch is obeyed even when peer_dd looks deep."""
    doc = artifact()
    doc["names"]["UEC"]["qualifies"] = {"20": False, "25": True, "30": False}
    st = stamper(tmp_path, doc)
    assert st.stamp("UEC", [blocked_ev(AS_OF)]) == 0


def test_missing_qualifies_map_falls_back_to_the_publishers_own_peer_dd(tmp_path):
    doc = artifact()
    doc["names"]["UEC"].pop("qualifies")
    st = stamper(tmp_path, doc)
    ev = blocked_ev(AS_OF)
    assert st.stamp("UEC", [ev]) == 1
    assert ev["override_ctx"]["thresholds_hit"] == [20, 25, 30]


# ─────────────────────────────────── 7. the emission path is not disturbed ──
def test_the_bridge_trims_to_qualifying_names_and_flags_staleness():
    """``ingest/pull_macro_washout`` maps basket_washout_state.v1 → the served bridge shape."""
    from ingest.pull_macro_washout import build_washout_state

    out = build_washout_state(artifact(), today=TODAY)
    assert out["schema"] == "washout_state/v1"
    assert out["as_of"] == AS_OF and out["stale"] is False
    assert out["is_display_only"] is True
    assert out["threshold"] == DEFAULT_THRESHOLD
    # only names qualifying at SOME notch are served (CALM/SHALLOW qualify nowhere)
    assert set(out["names"]) == {"UEC", "MID"}
    assert out["names"]["UEC"]["peer_dd"] == pytest.approx(-0.388)
    assert out["baskets"]["uranium_miners"]["name_zh"] == "铀矿商"

    stale = build_washout_state(artifact(as_of="2026-07-20"), today=TODAY)
    assert stale["stale"] is True

    # a percent-quoted publisher lands on the same fraction as a fraction-quoted one
    pct = artifact()
    pct["names"]["UEC"]["peer_dd"] = -38.8
    assert build_washout_state(pct, today=TODAY)["names"]["UEC"]["peer_dd"] == pytest.approx(-0.388)


def test_the_bridge_output_is_loadable_by_the_stamper(tmp_path):
    """The two halves are one contract: whatever the bridge writes, the stamper must read."""
    from ingest.pull_macro_washout import build_washout_state

    sp = tmp_path / "washout_state.json"
    sp.write_text(json.dumps(build_washout_state(artifact(), today=TODAY)))
    st = WashoutStamper.create(state_path=sp, ledger_path=tmp_path / "l.jsonl", today=TODAY)
    ev = blocked_ev(AS_OF)
    assert st.stamp("UEC", [ev]) == 1
    assert ev["override_ctx"]["name"] == "Uranium miners"


def test_the_ingest_glue_produces_a_real_stop_ref_on_real_bars(tmp_path):
    """Pins the plumbing the unit tests above cannot see.

    ``gen_slices_all``/``regen_flagship_slices`` hand the stamper a ``DailyBars`` built from
    TWO different grids — ``sig.index`` (3D bar opens) and ``idx`` (daily) — and a mismatch
    there produces a silent ``stop_ref: null`` on every row rather than an error. This runs
    the real confluence path over committed OHLC and asserts a finite stop below the window.
    """
    import pandas as pd

    from signal_layer import confluence

    ohlc = Path(__file__).resolve().parents[1] / "terminal" / "public" / "data" / "NVDA.json"
    if not ohlc.exists():                                    # sample data is optional in a lean checkout
        pytest.skip("no committed NVDA.json in this checkout")
    bars = json.loads(ohlc.read_text())["bars"]
    idx = pd.to_datetime([b[0] for b in bars])
    close = pd.Series([float(b[4]) for b in bars], index=idx)
    high = pd.Series([float(b[2]) for b in bars], index=idx)
    low = pd.Series([float(b[3]) for b in bars], index=idx)
    sig = confluence.compute_signals(
        close, bar_anchor=confluence.ipo_bar_anchor(close, "NVDA"),
        week_parity=confluence.ipo_week_parity(close, "NVDA"))
    assert not sig.empty

    daily = DailyBars(
        bar_opens=[d.strftime("%Y-%m-%d") for d in sig.index],
        dates=[d.strftime("%Y-%m-%d") for d in idx],
        high=high.to_list(), low=low.to_list(), close=close.to_list())

    fire_ts = daily.bar_opens[-40]                            # a real 3D bar open, well inside history
    ref = stop_reference(fire_ts, daily.bar_opens, daily.dates,
                         daily.high, daily.low, daily.close)
    assert ref is not None and ref == ref                     # finite, not NaN
    j = daily.bar_opens.index(fire_ts)
    window = [daily.low[i] for i, d in enumerate(daily.dates)
              if daily.bar_opens[j - 2] <= d < daily.bar_opens[j + 1]]
    assert ref < min(window)                                  # the ATR buffer sits BELOW the low


def test_a_slice_with_no_blocked_fires_is_untouched(tmp_path):
    st = stamper(tmp_path, artifact())
    sigs = [
        {"ts": AS_OF, "type": "BUY", "quality": "take", "tier": "aplus", "score": 81},
        {"ts": AS_OF, "type": "SELL", "basis": "structure_stop", "stop_level": 9.1},
        {"ts": AS_OF, "type": "RECLAIM", "quality": "reclaim", "scored": True},
    ]
    baseline = json.dumps(sigs, sort_keys=True)
    assert st.stamp("UEC", sigs) == 0
    assert json.dumps(sigs, sort_keys=True) == baseline
