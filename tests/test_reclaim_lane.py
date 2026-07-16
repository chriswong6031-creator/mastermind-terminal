"""The RE-ENTRY repair lane (confluence_v2.reclaim_events + contracts RECLAIM markers).

Synthetic fixtures replay the two 2026-07-15 incident shapes:
  * AAPL-V-recovery — SELL, drawdown, V back above the sell level: the reclaim must
    respect the debounce (the naive rule re-fires one bar after the SELL and rides the
    whole drawdown) and must NOT fire without weekly-bull + above-200 support.
  * META-block-lift — a bear-blocked BUY whose block legs repair days later while the
    MACD cross is still live: block_repair fires once, inside the window only.
Plus the contract layer: RECLAIM markers are scored:false and NEVER move the scored
state (position_hint / last_scored_signal / manifest verdict).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer.confluence_v2 import (  # noqa: E402
    RECLAIM_DEBOUNCE_BARS, RECLAIM_EXCLUDE_CLASS, REPAIR_WINDOW_BARS,
    build_v2, reclaim_events, reclaim_excluded,
)
from signal_layer.contracts import (  # noqa: E402
    FLAGSHIP_PARAMS, _extract_signals, _state, strategy_spec_hash,
)


def _frame(n=30, **cols):
    """Minimal oracle-shaped 3D frame: every gate defaults benign, overridable per test."""
    idx = pd.date_range("2026-01-05", periods=n, freq="3B")
    base = {
        "close": np.linspace(100, 110, n),
        "macd": np.ones(n), "sig": np.zeros(n),          # macd above signal (cross live)
        "k": np.full(n, 50.0), "d": np.full(n, 50.0), "rsi14": np.full(n, 55.0),
        "CB": np.zeros(n, bool), "revBuy": np.zeros(n, bool),
        "CS": np.zeros(n, bool), "revSell": np.zeros(n, bool),
        "w_bull": np.ones(n, bool), "above200": np.ones(n, bool),
        "mo_bull": np.ones(n, bool), "w2_bull": np.ones(n, bool),
        "bear_block": np.zeros(n, bool), "strong_bull": np.ones(n, bool),
    }
    base.update(cols)
    return pd.DataFrame(base, index=idx)


def _sell_at(sig, pos):
    return [{"ts": sig.index[pos].strftime("%Y-%m-%d"), "kind": "confirm"}]


def test_reclaim_fires_after_debounce_with_regime_support():
    n = 30
    close = np.full(n, 90.0)
    close[10] = 100.0                       # the SELL row's close = the reclaim level
    close[11:18] = 92.0                     # drawdown: below the level through the debounce
    close[18:] = 104.0                      # V-recovery above the level
    sig = _frame(n, close=close)
    ev = reclaim_events(sig, _sell_at(sig, 10))
    assert [e["kind"] for e in ev] == ["reclaim"]
    fired = pd.Timestamp(ev[0]["ts"])
    assert fired == sig.index[18]           # first qualifying bar past the debounce
    assert ev[0]["price"] == 104.0
    assert ev[0]["anchor_ts"] == sig.index[10].strftime("%Y-%m-%d")


def test_debounce_blocks_the_one_bar_whipsaw():
    # AAPL 2026-06-10 shape: close pops back above the sell level IMMEDIATELY, then dumps.
    n = 30
    close = np.full(n, 120.0)
    close[10] = 100.0
    close[11] = 101.0                       # naive rule fires here — must NOT
    close[12:] = 80.0                       # ...into the real drawdown, never recovering
    sig = _frame(n, close=close)
    assert reclaim_events(sig, _sell_at(sig, 10)) == []


def test_reclaim_requires_weekly_bull_and_above200():
    n = 30
    close = np.full(n, 90.0)
    close[10] = 100.0
    close[18:] = 104.0
    for gate in ("w_bull", "above200"):
        cols = {gate: np.zeros(n, bool)}
        sig = _frame(n, close=close, **cols)
        assert reclaim_events(sig, _sell_at(sig, 10)) == [], gate


def test_one_reclaim_per_sell_and_reset_on_new_sell():
    n = 40
    close = np.full(n, 90.0)
    close[10] = 100.0
    close[15:20] = 104.0                    # reclaim #1 window
    close[20] = 95.0                        # second SELL row (lower level)
    close[21:24] = 90.0
    close[26:] = 104.0                      # reclaim #2 (vs the NEW 95 level)
    sig = _frame(n, close=close)
    sells = _sell_at(sig, 10) + _sell_at(sig, 20)
    ev = reclaim_events(sig, sells)
    assert [e["kind"] for e in ev] == ["reclaim", "reclaim"]
    assert ev[0]["ts"] == sig.index[15].strftime("%Y-%m-%d")   # 10+debounce(4) with support -> 15? no: first bar >=14 with close>100 is 15
    assert ev[1]["anchor_ts"] == sig.index[20].strftime("%Y-%m-%d")


def test_scored_entry_clears_the_reclaim_anchor():
    n = 30
    close = np.full(n, 90.0)
    close[10] = 100.0
    close[18:] = 104.0
    cb = np.zeros(n, bool); cb[16] = True   # a real scored BUY before the reclaim window hits
    sig = _frame(n, close=close, CB=cb)
    assert reclaim_events(sig, _sell_at(sig, 10)) == []


def test_block_repair_fires_when_legs_clear_within_window():
    n = 30
    cb = np.zeros(n, bool); cb[12] = True
    bblk = np.zeros(n, bool); bblk[12] = True   # blocked on its own bar...
    sig = _frame(n, CB=cb, bear_block=bblk)     # ...cleared from the next bar on
    ev = reclaim_events(sig, [])
    assert [e["kind"] for e in ev] == ["block_repair"]
    assert ev[0]["ts"] == sig.index[13].strftime("%Y-%m-%d")
    assert ev[0]["anchor_ts"] == sig.index[12].strftime("%Y-%m-%d")


def test_block_repair_needs_live_macd_cross_and_window():
    n = 30
    cb = np.zeros(n, bool); cb[5] = True
    # legs stay blocked past the window
    bblk = np.zeros(n, bool); bblk[5:5 + REPAIR_WINDOW_BARS + 1] = True
    sig = _frame(n, CB=cb, bear_block=bblk)
    assert reclaim_events(sig, []) == []
    # legs clear next bar but the MACD cross has died -> no repair
    bblk2 = np.zeros(n, bool); bblk2[5] = True
    macd = np.ones(n); macd[6:] = -1.0          # below signal from bar 6 on
    sig2 = _frame(n, CB=cb, bear_block=bblk2, macd=macd)
    assert reclaim_events(sig2, []) == []


def test_decay_class_exclusion_rule():
    # curated flagship truth: leveraged + inverse + futures-roll, long AND short alike
    for s in ("TQQQ", "SQQQ", "SPXL", "SOXL", "SOXS", "BITO", "VXX", "USO"):
        assert reclaim_excluded(s), s
    # spot assets / plain funds stay in the lane
    for s in ("AAPL", "SPY", "QQQ", "GLD", "IBIT", "BTC-USD"):
        assert not reclaim_excluded(s), s
    # name rule classifies future additions (fund names only)
    assert reclaim_excluded("XXXX", "Direxion Daily Semiconductor Bear 2x", "Funds")
    assert reclaim_excluded("UVXY", "ProShares Ultra VIX Short-Term Futures", "Funds")
    # "Short-Term" bond funds and directional-but-unleveraged names must NOT trip it
    assert not reclaim_excluded("VGSH", "Vanguard Short-Term Treasury", "Funds")
    assert not reclaim_excluded("UUP", "Invesco DB US Dollar Bullish", "Funds")
    # the name rule never applies to equities (an unlucky company name is not a class)
    assert not reclaim_excluded("BRCM", "Bear Creek Mining", "Equities")


def test_build_v2_suppresses_reclaims_for_decay_class():
    # block_repair fixture (needs no sell confirms): blocked on its own bar, clear after.
    n = 30
    cb = np.zeros(n, bool); cb[12] = True
    bblk = np.zeros(n, bool); bblk[12] = True
    sig = _frame(n, CB=cb, bear_block=bblk)
    close = pd.Series(np.asarray(sig["close"], dtype=float), index=sig.index)
    included = build_v2(sig, close, symbol="AAPL")
    excluded = build_v2(sig, close, symbol="SQQQ")
    assert [e["kind"] for e in included["reclaims"]] == ["block_repair"]
    assert excluded["reclaims"] == []
    # everything OUTSIDE the reclaim lane is untouched by the exclusion
    for k in ("keeper", "recipe", "sell_confirms", "early_dots", "warnings"):
        assert included[k] == excluded[k], k


def test_promotion_minted_new_strategy_identity():
    lane = FLAGSHIP_PARAMS.get("reclaim_lane")
    assert lane is not None, "scored promotion requires the reclaim_lane params key"
    assert lane["debounce_bars"] == RECLAIM_DEBOUNCE_BARS
    assert lane["repair_window_bars"] == REPAIR_WINDOW_BARS
    assert lane["exclude_class"] == RECLAIM_EXCLUDE_CLASS
    pre = {k: v for k, v in FLAGSHIP_PARAMS.items() if k != "reclaim_lane"}
    assert strategy_spec_hash() != strategy_spec_hash(params=pre), \
        "reclaim_lane must mint a NEW spec_hash (wr/pf lanes must never mix)"


def test_contract_reclaim_markers_never_move_scored_state():
    n = 30
    close = np.full(n, 90.0)
    close[10] = 100.0
    close[18:] = 104.0
    sig = _frame(n, close=close)
    sells = _sell_at(sig, 10)
    v2 = {"keeper": {}, "recipe": {}, "sell_confirms": sells,
          "reclaims": reclaim_events(sig, sells)}
    signals = _extract_signals(sig, v2)
    tail = signals[-1]
    assert tail["type"] == "RECLAIM" and tail["scored"] is False
    assert tail["quality"] == "reclaim"
    st = _state(sig, signals)
    assert st["last_signal"] == "RECLAIM"          # raw tail: the card may render it
    assert st["last_scored_signal"] == "SELL"      # scored lane: untouched
    assert st["position_hint"] == "flat"
    assert st["last_scored_ts"] == sells[0]["ts"]
