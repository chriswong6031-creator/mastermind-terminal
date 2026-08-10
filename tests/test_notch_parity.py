"""The notch, the era and the quality strings must read the same on BOTH sides of the wire.

Python decides what the engine ENTERS; TypeScript decides what the user is TOLD about it.
They are separate codebases with no shared constant, so nothing but a test stops them from
drifting — and a drift here is the worst kind: the amber ring says one thing, the mask does
another, and the product looks calibrated while it disagrees with itself.

Guarded properties:
  * the live notch is written ONCE per language, and the two agree;
  * the MEASURED notch (what the published per-trade figures were cut at) is tracked
    separately from the live dial, because a dial move does not re-measure a result;
  * the quality strings the emitter writes are exactly the strings the client reads;
  * the era constant appears in the client's own documentation of the class.

These are cheap greps on purpose. A parity test that imported a TS bundle would be a build
dependency; a grep that fails loudly the moment a literal moves is enough, and it fails in
the python lane every reviewer already runs.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer import SIGNAL_ERA  # noqa: E402
from signal_layer.washout_override import (  # noqa: E402
    OVERRIDE_TAKE_QUALITY,
    RECLAIM_OVERRIDE_TAKE_QUALITY,
    WASHOUT_MEASURED_NOTCH,
    WASHOUT_OVERRIDE_NOTCH,
)

VERDICT_TS = ROOT / "terminal" / "lib" / "signalVerdict.ts"


def ts_const(name: str) -> str:
    """The single declaration of ``name`` in signalVerdict.ts — and it must be single."""
    src = VERDICT_TS.read_text()
    hits = re.findall(rf"^export const {name}(?::\s*\w+)?\s*=\s*(.+?);\s*$", src, re.M)
    assert len(hits) == 1, f"{name} declared {len(hits)}× in signalVerdict.ts (want exactly 1)"
    return hits[0].strip()


def test_the_live_notch_agrees_across_the_wire():
    assert int(ts_const("WASHOUT_NOTCH")) == WASHOUT_OVERRIDE_NOTCH == 20


def test_the_measured_notch_is_tracked_apart_from_the_live_dial():
    """A dial move does not re-measure a result — so the two constants stay separate.

    They are EQUAL today (both 20): the 20% row was re-graded and published for this build,
    so the copy prints it. Keeping them as two constants is what lets the copy go quiet on
    the next dial move instead of attaching one notch's result to another notch's rule.
    """
    assert int(ts_const("WASHOUT_MEASURED_NOTCH")) == WASHOUT_MEASURED_NOTCH == 20


def test_both_entry_quality_strings_agree_across_the_wire():
    assert ts_const("OVERRIDE_TAKE_QUALITY").strip('"') == OVERRIDE_TAKE_QUALITY
    assert (ts_const("RECLAIM_OVERRIDE_TAKE_QUALITY").strip('"')
            == RECLAIM_OVERRIDE_TAKE_QUALITY)
    assert OVERRIDE_TAKE_QUALITY != RECLAIM_OVERRIDE_TAKE_QUALITY


def test_the_client_names_the_era_it_was_written_for():
    """A client doc that still names a superseded era is a reader pointed at the wrong rule."""
    assert SIGNAL_ERA in VERDICT_TS.read_text()


def test_neither_entry_class_is_in_the_clients_softening_set():
    """SOFT_Q softens REFUSALS. A waived entry is not one, and softening it would subordinate
    a marker the engine stands behind — the same mistake in both waivers at once."""
    src = VERDICT_TS.read_text()
    soft = re.search(r"export const SOFT_Q[^=]*=\s*new Set\(\[(.*?)\]\)", src, re.S)
    assert soft is not None
    members = {m.strip().strip('"\'') for m in soft.group(1).split(",") if m.strip()}
    assert members == {"pending", "block", "regime_blocked"}
    assert OVERRIDE_TAKE_QUALITY not in members
    assert RECLAIM_OVERRIDE_TAKE_QUALITY not in members
