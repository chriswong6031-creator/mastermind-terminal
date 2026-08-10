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


ORACLE_DASH = ROOT / "terminal" / "components" / "fin" / "OracleDash.tsx"
CHART_PANEL = ROOT / "terminal" / "components" / "ChartPanel.tsx"


def test_the_retro_legend_is_wired_and_stays_the_disclosure_of_record():
    """The retro marker is drawn identically to a live entry, so the legend is the ONLY
    surface separating a counterfactual from a call the product made.

    Two ways it could silently stop doing that job: someone narrows the condition that
    renders it, or someone inlines a literal in place of the shared copy and lets the two
    drift. A grep in the lane every reviewer already runs catches both. This guard is not
    about style — it is the compensating control for a deliberate display trade
    (operator order 2026-08-10), and it costs one regex.
    """
    src = ORACLE_DASH.read_text()
    assert "sd-sig-legend" in src, "the retro legend element is gone"
    # rendered on ANY re-marked fire in the visible list — not on the newest, not on a subset
    assert re.search(r"sigs\.some\(isRetroOverride\)\s*&&", src), \
        "the legend must render whenever ANY visible signal is re-marked"
    # text comes from the shared bilingual copy, never an inlined literal
    assert re.search(r"sd-sig-legend[^>]*>\s*\{retroLegendCopy\(zh\)\}", src), \
        "the legend must render retroLegendCopy(zh), so copy and test cannot drift"


def test_the_retro_marker_carries_no_marker_level_tag():
    """The other half of that trade, pinned so it cannot be half-reverted.

    If a tag comes back to the marker, the legend stops being the only disclosure and the
    reasoning in both places goes stale. Re-adding one is fine — but it is a decision, and
    it should have to come through this test rather than past it.
    """
    src = CHART_PANEL.read_text()
    assert 'tag.textContent = "RETRO"' not in src
    assert not re.search(r'textContent\s*=\s*["\']RETRO["\']', src)


def test_both_retro_cohorts_are_drawn_as_entries_not_as_soft_refusals():
    """The retro class has TWO halves and they must render as one thing.

    A re-marked fire keeps its refusal ``quality`` on purpose — that is what keeps it out of
    the scored lane — and BOTH refusal strings (``regime_blocked`` and the keeper's ``block``)
    are in the client's SOFT_Q set. So the marker's soft-quality read has to exclude retro
    explicitly, or the halves diverge: the regime-veto half comes out solid (SOFT_Q's
    regime_blocked branch changes no fill) while the keeper half hits ``hollow = q === "block"``
    and renders as an unfilled outline — the subordinate treatment a re-mark must not wear.

    Caught only because the keeper half had no crop; the visual receipt covered the other one.
    """
    src = CHART_PANEL.read_text()
    assert re.search(r"const q = !m\.retro && m\.quality != null && SOFT_Q\.has\(m\.quality\)", src), \
        "retro must be excluded from the marker's soft-quality read, or its two halves diverge"
