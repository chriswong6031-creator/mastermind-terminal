"""HK-O1 — truth in labeling + point-in-time prices on the Golden Oracle stream.

Receipt: Macro Dashboard ``research/prophet_us_audit/HK_ORACLE_FORENSIC_2026-08-08.md``.

Four defects, all of them a LABEL lying about the machine underneath:

1. §1 — every user-facing SELL is the ARM→CONFIRM **structure break**: a trailing stop on
   a swing-low break. The MACD-RSI cross-down has not been emitted since the GC v2
   unification, so 0700.HK printed "GOLDEN ORACLE · SELL" on 2026-07-24 while its own 3D
   RSI-MACD read bull. The event now says ``basis="structure_stop"``.
2. §2 — 9988.HK's 2026-07-09 entry was ``regime_blocked`` (the v2 gate refused it) and was
   still drawn with BUY geometry. The event now carries ``blocked=True`` as the render key.
3. B2 — the marker price stamped the close of a 3D bar that OPENS on/before the confirm and
   CLOSES up to 2 sessions after it (9988.HK's 05-27 SELL carried the 05-26-open bar's
   close). The price is now the confirm session's own daily close.
4. §2 — ``state.extended`` carries ``strong_bull``, not overbought, and is unrelated to the
   Macro Dashboard cycles "Extended — don't chase" caution on the same card.

Every change is ADDITIVE: no field is removed, renamed, or re-valued (test_additive_only).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer.confluence_v2 import warn_events  # noqa: E402
from signal_layer.contracts import (  # noqa: E402
    BASIS_STRUCTURE_STOP,
    _extract_signals,
    _state,
    indicator_contract,
)

# The pre-HK-O1 key set of each emitted event, transcribed from the emitter at
# origin/master. A field leaving this set is a BREAKING change for the consumers
# enumerated in the PR body — the snapshot test below is what makes that loud.
LEGACY_ENTRY_KEYS = {
    "ts", "known_ts", "bar_index", "type", "strength", "price", "reasons", "regime",
    "quality", "quality_reason", "tier", "score",
}
LEGACY_SELL_KEYS = {
    "ts", "known_ts", "bar_index", "type", "strength", "price", "reasons", "regime",
}
LEGACY_STATE_KEYS = {
    "position_hint", "last_signal", "last_scored_signal", "last_scored_ts",
    "bars_since_signal", "extended", "strong_bull", "overbought", "weeklyBull", "above200",
}


def _frame(index, closes, *, cb=None, rev=None, bear=False):
    """A minimal 3D oracle frame with every column ``_extract_signals``/``_state`` read."""
    n = len(index)
    cb = cb or [False] * n
    rev = rev or [False] * n
    return pd.DataFrame(
        {
            "close": [float(c) for c in closes],
            "macd": np.linspace(0.5, 1.5, n),
            "sig": np.linspace(0.4, 1.4, n),
            "k": np.linspace(40.0, 60.0, n),
            "d": np.linspace(38.0, 58.0, n),
            "rsi14": np.linspace(45.0, 55.0, n),
            "CB": cb,
            "revBuy": rev,
            "w_bull": [not bear] * n,
            "above200": [not bear] * n,
            "mo_bull": [not bear] * n,
            "w2_bull": [not bear] * n,
            "strong_bull": [not bear] * n,
        },
        index=pd.to_datetime(index),
    )


# ── 1. structure-stop sells say so ──────────────────────────────────────────────
def test_sell_carries_the_structure_stop_basis():
    sig = _frame(["2026-07-15", "2026-07-20", "2026-07-24"], [470.0, 455.0, 440.6])
    v2 = {"sell_confirms": [{"ts": "2026-07-22", "kind": "confirm",
                             "px": 440.60, "level": 456.20}]}
    (sell,) = [s for s in _extract_signals(sig, v2) if s["type"] == "SELL"]
    # the label the Terminal renders off — a trailing stop, never a momentum exit
    assert sell["basis"] == BASIS_STRUCTURE_STOP == "structure_stop"
    assert sell["stop_level"] == 456.20      # the swing low the daily close broke
    assert sell["reasons"] == ["distribution_confirmed", "structure_break"]


def test_position_hint_demotion_carries_the_same_basis():
    """The flat is a STOP-OUT. A consumer reading only ``state`` must be able to see that —
    the whole 0700.HK complaint was a flat that read as an oracle-momentum exit."""
    sig = _frame(["2026-07-15", "2026-07-20", "2026-07-24"], [470.0, 455.0, 440.6],
                 cb=[True, False, False])
    v2 = {"sell_confirms": [{"ts": "2026-07-22", "kind": "confirm",
                             "px": 440.60, "level": 456.20}],
          "keeper": {0: {"verdict": "take", "reason": "ok", "shift": 1}},
          "recipe": {0: {"score": 71, "tier": "quality"}}}
    st = _state(sig, _extract_signals(sig, v2))
    assert st["position_hint"] == "flat"                     # unchanged behaviour
    assert st["last_scored_signal"] == "SELL"
    assert st["last_scored_basis"] == BASIS_STRUCTURE_STOP   # …and now it is readable


def test_entry_anchors_publish_no_basis():
    """``basis`` is SELL-only: absent (None) everywhere else, never a misleading default."""
    sig = _frame(["2026-07-15", "2026-07-20"], [100.0, 105.0], cb=[True, False])
    v2 = {"keeper": {0: {"verdict": "take", "reason": "ok", "shift": 1}},
          "recipe": {0: {"score": 80, "tier": "aplus"}}}
    sigs = _extract_signals(sig, v2)
    assert [s["type"] for s in sigs] == ["BUY"]
    assert "basis" not in sigs[0]
    assert _state(sig, sigs)["last_scored_basis"] is None


# ── 2. a refused entry is flagged, and its type is preserved for old readers ─────
def test_regime_blocked_entry_is_flagged_blocked_without_changing_type():
    sig = _frame(["2026-06-30", "2026-07-09"], [94.10, 110.70],
                 cb=[False, True], bear=True)
    (buy,) = _extract_signals(sig, {"keeper": {}, "recipe": {}})
    assert buy["blocked"] is True                    # the NEW render/scoring key
    assert buy["type"] == "BUY"                      # every existing reader still parses
    assert buy["quality"] == "regime_blocked"        # legacy key untouched
    assert buy["tier"] is None and buy["score"] is None


def test_blocked_flag_alone_keeps_a_marker_out_of_the_scored_walk():
    """Belt-and-braces: neither key alone can re-open the 2026-07-15 META hole."""
    walked = _state(
        _frame(["2026-07-01", "2026-07-06", "2026-07-09"], [100.0, 101.0, 102.0]),
        [
            {"ts": "2026-05-04", "type": "SELL", "bar_index": 0, "price": 90.0,
             "basis": BASIS_STRUCTURE_STOP},
            # flagged blocked but WITHOUT the legacy quality string
            {"ts": "2026-07-06", "type": "BUY", "bar_index": 2, "price": 102.0,
             "blocked": True},
        ],
    )
    assert walked["position_hint"] == "flat"
    assert walked["last_scored_signal"] == "SELL"
    assert walked["last_signal"] == "BUY"            # raw tail still echoes the display


def test_unblocked_entry_still_flips_the_position():
    sig = _frame(["2026-07-01", "2026-07-06"], [100.0, 101.0], cb=[False, True])
    v2 = {"keeper": {1: {"verdict": "take", "reason": "ok", "shift": 1}},
          "recipe": {1: {"score": 77, "tier": "quality"}}}
    sigs = _extract_signals(sig, v2)
    assert "blocked" not in sigs[0]
    assert _state(sig, sigs)["position_hint"] == "long"


# ── 3. point-in-time price — the 9988.HK 2026-05-27 regression ──────────────────
def test_sell_price_is_the_confirm_session_close_not_a_later_bar():
    """Forensic B2, reconstructed exactly.

    The 3D bar OPENS 2026-05-26; its close is printed on 2026-05-28 — two sessions AFTER
    the 05-27 confirm. ``searchsorted(..., 'right') - 1`` maps the confirm onto that row,
    and the old emitter stamped the row's close: a price the market had not yet made.
    """
    sig = _frame(["2026-05-20", "2026-05-26", "2026-06-01"], [96.00, 88.00, 90.00])
    confirm_day_close = 92.50            # the 2026-05-27 DAILY close (the event's session)
    bar_close_two_sessions_later = 88.00  # the 05-26-open 3D bar's close, printed 05-28

    (sell,) = [s for s in _extract_signals(
        sig, {"sell_confirms": [{"ts": "2026-05-27", "kind": "confirm",
                                 "px": confirm_day_close, "level": 94.10}]},
    ) if s["type"] == "SELL"]

    assert sell["ts"] == "2026-05-27"
    assert sell["price"] == confirm_day_close
    assert sell["price"] != bar_close_two_sessions_later     # the lookahead is gone
    # the chart coordinate is unchanged — only the PRICE stopped looking ahead
    assert sell["bar_index"] == 1
    assert sell["regime"]["weeklyBull"] is True             # still read off the 3D row


def test_legacy_confirm_without_px_falls_back_to_the_bar_close():
    """A v2 payload emitted before ``px`` existed must keep producing a marker."""
    sig = _frame(["2026-05-20", "2026-05-26"], [96.00, 88.00])
    (sell,) = [s for s in _extract_signals(
        sig, {"sell_confirms": [{"ts": "2026-05-27", "kind": "confirm"}]},
    ) if s["type"] == "SELL"]
    assert sell["price"] == 88.00
    assert sell["stop_level"] is None


def test_warn_events_stamps_each_events_own_daily_close():
    """End-to-end at the source: ``px`` is the close on the event's OWN session, and the
    confirm's ``level`` is the swing low that close broke."""
    idx = pd.bdate_range("2025-01-01", periods=260)
    t = np.arange(len(idx))
    close = pd.Series(100 + 40 * np.sin(t / 26.0) + t * 0.12, index=idx)
    brk = idx.get_loc(pd.Timestamp("2025-09-26"))
    close.iloc[brk:brk + 8] = close.iloc[brk - 1] - np.array(
        [10, 35, 60, 80, 95, 105, 110, 112], dtype=float)
    close.iloc[brk + 8:] = close.iloc[brk + 7] + np.linspace(0, 6, len(idx) - brk - 8)

    events = warn_events(close)
    confirms = [e for e in events if e["kind"] == "confirm"]
    assert confirms, "fixture must actually fire a confirm or the assertion below is vacuous"
    for e in events:
        assert e["px"] == pytest.approx(float(close.loc[pd.Timestamp(e["ts"])]))
    for e in confirms:
        assert e["px"] < e["level"]          # a confirm IS a close below the swing low


# ── 4. the two ``extended``s ─────────────────────────────────────────────────────
def test_extended_is_a_deprecated_alias_of_strong_bull_not_of_overbought():
    """The card's "Extended — don't chase" is the cycles pipeline's OVERBOUGHT caution.
    This contract's ``extended`` is the strength read. Pin the divergence so a future
    reader cannot quietly re-conflate them."""
    calm_but_strong = _frame(["2026-07-01", "2026-07-06"], [100.0, 101.0])
    st = _state(calm_but_strong, [])
    assert st["strong_bull"] is True
    assert st["extended"] == st["strong_bull"]   # alias, exactly
    assert st["overbought"] is False             # …and NOT the overbought read
    assert st["extended"] != st["overbought"]    # the two words are not the same word


def test_indicator_contract_publishes_both_honest_names():
    sig = _frame(["2026-07-01", "2026-07-06"], [100.0, 101.0])
    state = indicator_contract("9988.HK", "3D", sig, v2={})["state"]
    for key in ("strong_bull", "overbought", "extended"):
        assert key in state, f"{key} must stay published for its readers"


# ── additive-only guarantee ─────────────────────────────────────────────────────
def test_additive_only_no_field_removed_or_re_valued():
    """The schema snapshot. Every pre-HK-O1 key still ships, with its pre-HK-O1 meaning;
    the only diff is NEW keys. This is what lets the consumer census in the PR body stand."""
    sig = _frame(["2026-05-20", "2026-05-26", "2026-06-01"], [96.0, 88.0, 90.0],
                 cb=[True, False, False], bear=True)
    v2 = {"sell_confirms": [{"ts": "2026-05-27", "kind": "confirm",
                             "px": 92.5, "level": 94.1}]}
    doc = indicator_contract("9988.HK", "3D", sig, v2=v2)

    entry = next(s for s in doc["signals"] if s["type"] == "BUY")
    sell = next(s for s in doc["signals"] if s["type"] == "SELL")
    assert LEGACY_ENTRY_KEYS <= set(entry), LEGACY_ENTRY_KEYS - set(entry)
    assert LEGACY_SELL_KEYS <= set(sell), LEGACY_SELL_KEYS - set(sell)
    assert LEGACY_STATE_KEYS <= set(doc["state"]), LEGACY_STATE_KEYS - set(doc["state"])

    # the added keys, and only those
    assert set(entry) - LEGACY_ENTRY_KEYS == {"blocked"}
    assert set(sell) - LEGACY_SELL_KEYS == {"basis", "stop_level"}
    assert set(doc["state"]) - LEGACY_STATE_KEYS == {"last_scored_basis"}

    # pre-existing values keep their pre-existing meaning
    assert entry["type"] == "BUY" and entry["quality"] == "regime_blocked"
    assert sell["type"] == "SELL"
    assert doc["state"]["last_signal"] == "SELL"

    # and the top-level document shape is untouched
    assert {"schema", "indicator", "symbol", "timeframe", "as_of", "bar_quality",
            "bars", "series", "gates", "signals", "state", "early_dots", "warnings",
            "meta"} <= set(doc)


# ── the one place a blocked marker reached a user as an instruction ─────────────
class _StubData:
    """The minimal ``alerts_engine.Data`` surface the signal branch touches."""

    def __init__(self, signals):
        self._signals = signals

    def signals(self, sym):            # noqa: D102 - stub
        return self._signals


def _signal_alert(target="BUY"):
    return {"symbol": "9988.HK", "created_at": "2026-07-01T00:00:00Z",
            "condition": {"type": "signal", "target": target}}


def test_blocked_entry_never_fires_a_buy_alert():
    """A regime-vetoed setup still types BUY for back-compat, and the alert engine matched on
    type alone — so the engine pushed a live "BUY" for an entry it had explicitly refused."""
    import ingest.alerts_engine as ae

    fired, _value, _note, _extra = ae.evaluate(
        _signal_alert("BUY"),
        _StubData([{"ts": "2026-07-09", "type": "BUY", "price": 110.70, "strength": 0.7,
                    "quality": "regime_blocked", "blocked": True}]),
    )
    assert fired is False


def test_a_taken_entry_still_fires_a_buy_alert():
    import ingest.alerts_engine as ae

    fired, value, _note, _extra = ae.evaluate(
        _signal_alert("BUY"),
        _StubData([{"ts": "2026-07-09", "type": "BUY", "price": 110.70, "strength": 0.7,
                    "quality": "take"}]),
    )
    assert fired is True and value == 110.70


def test_sell_alert_note_names_the_structure_stop():
    """The note is stored verbatim and rendered to the user — it must not say a bare SELL."""
    import ingest.alerts_engine as ae

    fired, _value, note, _extra = ae.evaluate(
        _signal_alert("SELL"),
        _StubData([{"ts": "2026-07-22", "type": "SELL", "price": 440.60, "strength": 0.6,
                    "basis": "structure_stop"}]),
    )
    assert fired is True
    assert note.startswith("STRUCTURE STOP signal on 2026-07-22")
