"""CN/HK intel tape parity (the 600547.SS "hard Bearish on a washout bottom" fix).

The CN/HK bridge historically shipped ai_lean as {dir, score} only — no band, no
entry, no asof — so the Terminal's deskVerdict could never soften a band=low read
to "No setup" or render an entry posture ("Bounce unconfirmed — wait") for CN/HK
names the way it does for US names. These tests pin:

  1. table parity — the inlined _map_ai_dir agrees with the canonical
     pull_macro_intel._map_ai_dir on every band×entry combination (when band is
     present; the tone argument is the CN-only no-band legacy fallback);
  2. the shipped tape now carries band/entry/asof;
  3. the 600547.SS regression case: band=low + entry=bounce_wait must ship both
     fields so the desk renders "No setup" instead of a hard directional Bearish;
  4. the consistency guard demotions match the US bridge.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.pull_cn_hk_intel import _map_ai_dir as cn_map, build_tape  # noqa: E402
from ingest.pull_macro_intel import _map_ai_dir as us_map  # noqa: E402

BANDS = ["high", "constructive", "neutral", "low", "", None, "High", " low "]
ENTRIES = [
    "buy_now", "buy_soon", "partial", "watch", "wait_pullback", "hold",
    "extended", "blocked", "topping", "exit", "await_confluence", "bounce_wait",
    "", None,
]


@pytest.mark.parametrize("band", [b for b in BANDS if (b or "").strip()])
@pytest.mark.parametrize("entry", ENTRIES)
def test_table_parity_with_us_bridge(band, entry):
    """With a band present, the CN table must equal the canonical US table
    regardless of tone (tone is only the no-band fallback)."""
    for tone in ("go", "avoid", "wait", ""):
        assert cn_map(band, entry, tone) == us_map(band, entry)


@pytest.mark.parametrize(
    ("tone", "expected"),
    [("go", "BULL"), ("avoid", "BEAR"), ("stop", "BEAR"), ("sell", "BEAR"),
     ("wait", "NEUTRAL"), ("", "NEUTRAL")],
)
def test_no_band_falls_back_to_tone(tone, expected):
    assert cn_map(None, None, tone) == expected
    assert cn_map("", "extended", tone) == expected


def _src(*, band="low", entry="bounce_wait", score=12, asof="2026-07-31", tone="avoid"):
    return (
        {
            "asof": asof,
            "entry_signal": {"status": entry},
            "conviction": {"score": score},
            "ladder": {"regime_label": "BEARISH"},
        },
        {"tone": tone, "band": band},
    )


def test_shandong_gold_regression_ships_band_and_entry():
    """600547.SS live case 2026-08-02: washout bottom, band=low, entry=bounce_wait.
    The tape must carry band/entry so deskVerdict's "No setup" branch (band=low,
    entry not exit/topping) is reachable — a hard red "Bearish" was the bug."""
    src, dec = _src()
    tape = build_tape(src, dec)
    lean = tape["ai_lean"]
    assert lean["dir"] == "BEAR"          # band=low → BEAR (desk softens, not us)
    assert lean["band"] == "low"
    assert lean["entry"] == "bounce_wait"
    assert lean["score"] == 12
    assert tape["asof"] == "2026-07-31"


def test_exit_entry_stays_hard_bear():
    src, dec = _src(entry="topping", score=40)
    assert build_tape(src, dec)["ai_lean"]["dir"] == "BEAR"


def test_consistency_guard_demotions_match_us_bridge():
    # BULL with a sub-55 score demotes to NEUTRAL…
    src, dec = _src(band="high", entry="buy_now", score=40, tone="go")
    assert build_tape(src, dec)["ai_lean"]["dir"] == "NEUTRAL"
    # …a BEAR with a >65 score demotes to NEUTRAL…
    src, dec = _src(band="low", entry="watch", score=80)
    assert build_tape(src, dec)["ai_lean"]["dir"] == "NEUTRAL"
    # …and an in-range score keeps the mapped lean.
    src, dec = _src(band="high", entry="buy_now", score=70, tone="go")
    assert build_tape(src, dec)["ai_lean"]["dir"] == "BULL"


def test_lite_path_shape():
    """The HK lite fallback calls build_tape({}, decision) — must not crash and
    must ship null-honest fields (no fake asof/entry)."""
    tape = build_tape({}, {"tone": "wait"})
    assert tape["ai_lean"] == {"dir": "NEUTRAL", "score": None, "band": None, "entry": None}
    assert tape["asof"] is None


def test_wait_dir_retired():
    """The legacy 'WAIT' dir (which the Terminal can't map to a posture) must
    never be emitted again."""
    for band in BANDS:
        for entry in ENTRIES:
            for tone in ("go", "avoid", "wait", "stop", "sell", ""):
                assert cn_map(band, entry, tone) != "WAIT"
