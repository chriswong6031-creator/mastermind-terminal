"""Blocked-entry washout override — the LIVE entry gate, the display stamp, the ledger.

Ratified rule (Macro Dashboard ``research/BLOCKED_ENTRY_RATIFICATION_PACKET_2026-08-10.md``
§2/§4, prereg §5 ratification log, threshold **25%**): a ``regime_blocked`` (⊘) fire whose
name's thematic-basket peers sit ≥25% below their 252d highs is a **washout override
candidate**. Held-out 2019+, repaired aggregate at 25%: cell +1.134R, diff-vs-complement
+1.068R [0.937, 1.204], ex-COVID +0.725R, 8 episodes; production-feed re-grade (gate B)
reproduced it at +1.113 / +1.008 [0.88, 1.14] over 9 episodes.

WHAT THIS MODULE DOES — AND DOES NOT — DO
-----------------------------------------
DOES, since the ``gc_v2_wo1`` era fence:
  1. **the live entry gate** (``qualifies`` / ``WashoutStamper.override_for``) — the ONE
     authority ``confluence_v2`` asks whether a ``bear_block``-vetoed raw buy is TAKEN.
     A granted fire is emitted as its own entry class, ``quality="override_take"``;
  2. the DISPLAY stamp — ``override_candidate``/``override_ctx`` on blocked fires that
     qualify but are NOT entries (pre-fence history — see the era rule below);
  3. the forward ledger — one row per stamped or taken fire, carrying the era it was
     minted under, so the shipped rule grades itself from night one.

DOES, additionally, since the ``gc_v2_wo2`` fence (Arm T of the reclaim-veto conditional,
Macro Dashboard research/RECLAIM_VETO_CONDITIONAL_PREREG.md §4/§5, RATIFIED at 25%):
  4. **the keeper's reclaim waiver** (``WashoutStamper.reclaim_override_for``) — the same
     yes/no question, asked by ``confluence_v2.keeper_quality_map`` about a RELIEVABLE
     keeper block: one whose next-bar HOLD leg PASSED and whose 200-reclaim leg failed.
     A granted fire becomes ``quality="reclaim_override_take"``. The two gates share the
     artifact, the notch, the PIT rule and the ledger, and differ only in which cohort
     asks — which is why they live in one module. HOLD-leg failures are NOT relievable and
     never reach this gate (the adjudicated boundary; HL 2026-06-16 stays blocked);
  5. **the retro projection** (``mark_retro``) — a DISPLAY-ONLY re-mark of PRE-FENCE
     refusals that today's rule would have entered. It is a labelled counterfactual, not a
     call: it never enters the scored stream, never alerts, and never touches the ledger
     (structurally — ``mark_retro`` has no ledger parameter to touch).

DOES NOT: compute a score, a tier, or a keeper verdict; re-type an event; or reach a fire
whose basket did not qualify on the day it fired. The gate answers one yes/no question and
returns the context behind it; every other property of the emission is unchanged.

THE ERA RULE (why a qualifying ⊘ from last month is still a ⊘)
--------------------------------------------------------------
The override changes the traded rule, so it must not act backwards. Only a fire the gate
grants **in the ``gc_v2_wo1`` era** is an entry; a ledger row minted by the pre-fence
display build (no ``era``/``taken``) replays as the amber-ringed ⊘ it always was. Under the
PIT rule below a historical fire can never be granted in the first place, and the era check
is the belt to that braces — a fence that fails closed on any row it does not recognise.

COHORT (load-bearing, corrected 2026-08-10): the *washout-override* class keys on
``quality == "regime_blocked"`` — the ``bear_block`` regime veto — and on nothing else. A
keeper ``block`` ("counter-trend, no 200-reclaim/hold", e.g. HL's 2026-06-16/06-25 fires) is
a DIFFERENT refusal, outside that cohort, and must never be stamped with it even when its
basket qualifies. ``contracts.BLOCKED_QUALITY`` is the single source of that string.

The keeper block is the RECLAIM-WAIVER cohort instead, and only in part: Arm T's gauntlet
ran on the RELIEVABLE subset — held passed, reclaim failed — which is 12.6% of the literal
``"counter-trend, no 200-reclaim/hold"`` reason-set, because that one string collapses BOTH
legs' failures (prereg §5: the charting-app copy never received the macro engine's #4583
string split, and the collapsed literal mis-specified the frozen cohort). NEVER select this
cohort by reason string. ``confluence_v2`` selects it on BRANCH LOGIC and hands this module
an already-relievable fire; HL 06-16 (hold-leg failure) is not one and never arrives here.

THE PIT RULE (why stamping is not a backfill)
---------------------------------------------
The artifact carries ONE day's peer-drawdown state (``as_of``). Painting today's basket
state onto a fire from 2021 would be a lookahead lie, so a fire is only ever stamped from
state that was current when it fired:

  1. ``known_ts >= state.as_of``  → stamp from the artifact, and record the stamp in the
     forward ledger. This is "accrual starts now": on the first night only that night's
     fires qualify, and history stays plain ⊘.
  2. ``(ticker, ts)`` already in the ledger → REPLAY the recorded context verbatim. The
     ledger — not today's artifact — is what keeps a stamp stable across the nightly full
     slice regen (and across the 5-minute flagship refresh), so a marker cannot flicker
     amber→slate the day after it fires. Replay reads history's own numbers, never today's.
  3. otherwise → no stamp. Plain ⊘, byte-identical to a pre-override slice.

``WASHOUT_PIT_GRACE_DAYS`` (default **0** = the strict rule above) widens step 1 by N
calendar days; it exists so a missed nightly does not silently drop a fire, and is an
operator lever, not a default.

FALLBACK: artifact absent, unparseable, wrong-schema, or stale past
``WASHOUT_MAX_STALE_SESSIONS`` trading sessions → no stamping, no ledger rows, one log line,
and every ⊘ renders exactly as it does today. Never a user-facing error.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Iterable, Sequence

from . import (ERAS_WITH_ENTER_MASK, ERAS_WITH_RECLAIM_WAIVER, SIGNAL_ERA,
               SIGNAL_ERA_PRE)

ROOT = Path(__file__).resolve().parents[1]

log = logging.getLogger(__name__)

# The macro-side artifact contract this module consumes (schema ``basket_washout_state.v1``,
# bridged to ``terminal/public/data/washout_state.json`` by ``ingest/pull_macro_washout.py``).
SCHEMA_IN = "basket_washout_state.v1"
SCHEMA_BRIDGE = "washout_state/v1"

STATE_PATH = ROOT / "terminal" / "public" / "data" / "washout_state.json"

# ── THE NOTCH: the one number that decides who gets taken ───────────────────────
# Ratified 2026-08-10 at 25%; moved to **20%** by the operator in the same breath as the
# gc_v2_wo2 build (prereg §5 records 20/25/30 as gauntleted-and-passing at both arms, with
# 15% failing everywhere — the notch is an aggressiveness dial inside the passing band, not
# a statistical claim, so moving inside that band needs no new gauntlet).
#
# CHANGING THIS POST-FENCE IS AN ERA EVENT, NOT A CONFIG EDIT — and this change honoured
# that: 25 → 20 ships WITH the ``gc_v2_wo1`` → ``gc_v2_wo2`` bump (signal_layer/__init__.py),
# never on its own, so the forward ledger stays gradeable. wo2 therefore fences TWO changes
# at once: the keeper's reclaim waiver AND this notch move. Rows either side are two
# different rules and pooling them measures neither.
WASHOUT_OVERRIDE_NOTCH = 20

# The notch the PUBLISHED per-trade evidence was measured at (blocked-entry ratification
# packet §2/§3.5, held-out 2019+: cell +26.5% vs complement +3.45%). It is deliberately NOT
# tied to the live notch: the numbers are a measurement at a setting, and a dial move does
# not re-measure them. Every surface that prints those figures gates on the two being equal
# (terminal/lib/signalVerdict.ts ``washoutOverrideCopy``) so the product can never attach a
# 25%-notch result to a 20%-notch rule. Publish notch-20 figures to re-enable that line.
WASHOUT_MEASURED_NOTCH = 25

# The single place the notch is written; the artifact-facing threshold derives from it so
# the DISPLAY class and the ENTRY gate can never drift to different numbers (a name wearing
# the amber ring is exactly a name the mask would take). ``WASHOUT_THRESHOLD`` in the
# environment moves both together — an operator lever, never a per-surface setting.
DEFAULT_THRESHOLD = str(WASHOUT_OVERRIDE_NOTCH)

# The quality string a TAKEN override fire carries. Mirrors ``contracts.OVERRIDE_TAKE_QUALITY``
# (that module imports this one; the mirror is here so this module stays pandas-free), and
# ``tests/test_washout_entry_mask.py`` pins the two together.
OVERRIDE_TAKE_QUALITY = "override_take"

# The quality string a fire carries when the KEEPER's counter-trend reclaim leg was waived
# (era gc_v2_wo2, Arm T). A SIBLING of the class above, never the same string: the two
# waivers relieve different refusals on disjoint cohorts, so pooling their forward rows
# would measure neither. Both are take-class — a real scored entry in every downstream
# sense — which is why the client's SOFT_Q set holds neither.
RECLAIM_OVERRIDE_TAKE_QUALITY = "reclaim_override_take"

# ── ledger row classes ──────────────────────────────────────────────────────────
# One ledger, two waivers, so a row must say which rule minted it or the replay authority
# could grant a wo1 washout override off a wo2 reclaim row (and vice versa). The cohorts
# are disjoint by construction (override ⊂ bear_block, keeper ⊂ ~bear_block), so a
# ``(ticker, ts)`` key still cannot collide — the class makes the REPLAY fail closed
# anyway. A row with no class predates the split and can only be the washout override.
LEDGER_CLASS_WASHOUT = "washout_override"
LEDGER_CLASS_RECLAIM = "reclaim_override"

# Trading sessions, not calendar days: the artifact is a nightly product, so 5 sessions is
# one clean trading week of tolerance. Approximated as weekdays (no exchange holiday
# calendar in this repo); a holiday week therefore ages ~1 session fast, which errs toward
# refusing to stamp — the safe direction.
DEFAULT_MAX_STALE_SESSIONS = 5

LEDGER_PATH = ROOT / "data" / "blocked_override_ledger.jsonl"

# The ONE quality string in the studied cohort (mirrors contracts.BLOCKED_QUALITY; imported
# lazily in _is_regime_blocked so this module stays importable without pandas).
BLOCKED_QUALITY = "regime_blocked"


# ─────────────────────────────────────────────────────────────── small helpers ──
def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except (TypeError, ValueError):
        return default


def _iso(v: Any) -> str | None:
    """Normalize anything date-ish to a bare ``YYYY-MM-DD`` string (None on failure)."""
    if not v:
        return None
    s = str(v)[:10]
    try:
        date.fromisoformat(s)
    except (ValueError, TypeError):
        return None
    return s


def sessions_between(start: str, end: str) -> int:
    """Weekday count in ``(start, end]`` — the stand-in for trading sessions."""
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    if b <= a:
        return 0
    n, cur = 0, a
    while cur < b:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            n += 1
    return n


def as_drawdown_fraction(v: Any) -> float | None:
    """Normalize a peer drawdown to a NEGATIVE fraction (−0.388 = 38.8% off the 252d high).

    The macro artifact may publish ``peer_median_dd_252`` as a fraction (0.388 / −0.388) or
    as percent (38.8 / −38.8); this is the single place that decides, so the stamp, the
    ledger, and the UI never disagree. Magnitudes at or below 1.5 are read as fractions —
    a peer-median drawdown of 150% is not a thing, and 1.5% would not qualify at any notch.
    """
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    mag = abs(f)
    frac = mag if mag <= 1.5 else mag / 100.0
    return -round(frac, 6)


def _is_regime_blocked(ev: dict) -> bool:
    """The cohort gate. ``quality == "regime_blocked"`` ONLY.

    NOT ``ev.get("blocked")``: that flag is the render key and a keeper ``block`` event
    (a different refusal, outside the studied cohort) could grow it without becoming
    eligible for this class. Reading the quality string keeps the cohort exactly the one
    the packet measured.
    """
    return str(ev.get("quality") or "").lower() == BLOCKED_QUALITY


def _is_override_take(ev: dict) -> bool:
    """The TAKEN class — a fire the live gate let through (``confluence_v2`` emitted it)."""
    return str(ev.get("quality") or "").lower() == OVERRIDE_TAKE_QUALITY


def _is_reclaim_override_take(ev: dict) -> bool:
    """The TAKEN keeper class — a relievable block whose reclaim leg the waiver dropped."""
    return str(ev.get("quality") or "").lower() == RECLAIM_OVERRIDE_TAKE_QUALITY


def reclaim_override_quality_reason(ctx: dict | None) -> str:
    """The one-line WHY behind a waived reclaim leg, stamped on the event.

    ``reclaim waived: washout <group_id> <peer_dd> (era gc_v2_wo2)`` — the group whose peers
    were washed out, how far below their 252d highs the peer median sat, and the era the
    decision was made under. Sibling of ``contracts.override_quality_reason`` and degrades
    the same way: an artifact shipping no group, or no number, yields a shorter line, never
    an empty slot. Lives here rather than in ``contracts`` because ``confluence_v2`` stamps
    it at the keeper branch and must not import the emitter.
    """
    ctx = ctx or {}
    bits = []
    group = ctx.get("group_id")
    if group:
        bits.append(str(group))
    dd = ctx.get("peer_dd")
    if isinstance(dd, (int, float)) and not isinstance(dd, bool) and dd == dd:
        bits.append(f"−{abs(float(dd)) * 100:.1f}%")
    washout = " ".join(["washout", *bits])
    return f"reclaim waived: {washout} (era {SIGNAL_ERA})"


# ────────────────────────────────────────────────────────────────── the state ──
@dataclass(frozen=True)
class WashoutState:
    """A usable ``basket_washout_state.v1`` snapshot. Absent/stale → callers get ``None``."""

    as_of: str
    threshold: str
    names: dict[str, dict]
    baskets: dict[str, dict]
    source: str

    def context_for(self, ticker: str, notch: int | None = None) -> dict | None:
        """The ``override_ctx`` for ``ticker``, or None when it does not qualify.

        ``qualifies[threshold]`` from the artifact is the authority. Only when that map is
        absent entirely does this fall back to comparing the artifact's own ``peer_dd``
        against the threshold — arithmetic on the publisher's number, never an invention.

        The ``names`` map is the LOO (leave-one-out) peer-median basis by artifact contract
        (fidelity ruling, prereg §5 2026-08-10): the fired name is excluded from its own
        peer median, matching the gauntleted ``r3_axes.py`` construction. This reads the
        publisher's number; it never re-derives one.

        ``notch`` overrides the state's own threshold for a single question — used only by
        tests and by an explicit caller. Production leaves it None so the DISPLAY class and
        the ENTRY gate ask at the same number.
        """
        row = self.names.get(ticker) or self.names.get(ticker.upper())
        if not isinstance(row, dict):
            return None
        peer_dd = as_drawdown_fraction(row.get("peer_dd"))
        hits = _thresholds_hit(row, peer_dd)
        try:
            thr_i = int(self.threshold if notch is None else notch)
        except (TypeError, ValueError):
            return None
        if thr_i not in hits:
            return None

        group_id = row.get("group_id")
        basket = self.baskets.get(str(group_id)) if group_id is not None else None
        basket = basket if isinstance(basket, dict) else {}
        ctx = {
            "group_id": str(group_id) if group_id is not None else None,
            "peer_dd": peer_dd,
            "basis": str(row.get("basis") or "basket"),
            "thresholds_hit": hits,
            "as_of": self.as_of,
        }
        # Display names ride WITH the stamp so the rail card needs no second fetch and an
        # archived slice stays self-describing (the house slice law: a slice explains
        # itself). Additive to the {group_id, peer_dd} contract minimum above.
        name = basket.get("name")
        name_zh = basket.get("name_zh")
        if name:
            ctx["name"] = str(name)
        if name_zh:
            ctx["name_zh"] = str(name_zh)
        return ctx


def _thresholds_hit(row: dict, peer_dd: float | None) -> list[int]:
    """Sorted int thresholds this name qualifies at."""
    q = row.get("qualifies")
    if isinstance(q, dict):
        out = []
        for k, v in q.items():
            try:
                k_i = int(str(k))
            except (TypeError, ValueError):
                continue
            if v is True:
                out.append(k_i)
        return sorted(out)
    if peer_dd is None:
        return []
    # No qualifies map — derive from the publisher's own peer_dd against the standard grid.
    return sorted(t for t in (20, 25, 30) if abs(peer_dd) * 100.0 >= t)


def load_state(
    path: str | Path | None = None,
    *,
    today: date | None = None,
    threshold: str | None = None,
    max_stale_sessions: int | None = None,
) -> WashoutState | None:
    """Read the bridged artifact. Returns None (with ONE log line) on every failure mode.

    Local file read only — no network. ``ingest/pull_macro_washout.py`` owns the fetch.
    """
    p = Path(path) if path is not None else Path(os.environ.get("WASHOUT_STATE_PATH") or STATE_PATH)
    if not p.exists():
        log.info("washout override: no artifact at %s — blocked fires stay plain", p)
        return None
    try:
        raw = json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001 — a bad artifact must never break slice generation
        log.warning("washout override: unreadable artifact %s (%s) — stamping off", p, e)
        return None
    return state_from_dict(raw, today=today, threshold=threshold,
                           max_stale_sessions=max_stale_sessions, source=str(p))


def state_from_dict(
    raw: Any,
    *,
    today: date | None = None,
    threshold: str | None = None,
    max_stale_sessions: int | None = None,
    source: str = "<dict>",
) -> WashoutState | None:
    """Validate + freshness-gate a raw artifact dict. The pure half of ``load_state``."""
    if not isinstance(raw, dict):
        log.warning("washout override: artifact is not an object (%s) — stamping off", source)
        return None
    schema = str(raw.get("schema") or "")
    if not (schema.startswith(SCHEMA_IN.split(".v")[0]) or schema.startswith(SCHEMA_BRIDGE.split("/")[0])):
        log.warning("washout override: unexpected schema %r in %s — stamping off", schema, source)
        return None
    as_of = _iso(raw.get("as_of"))
    if as_of is None:
        log.warning("washout override: artifact %s carries no usable as_of — stamping off", source)
        return None

    today = today or date.today()
    max_sessions = (max_stale_sessions if max_stale_sessions is not None
                    else _env_int("WASHOUT_MAX_STALE_SESSIONS", DEFAULT_MAX_STALE_SESSIONS))
    stale_by = sessions_between(as_of, today.isoformat())
    if stale_by > max_sessions:
        log.warning("washout override: artifact as_of=%s is %d sessions stale (> %d) — stamping off",
                    as_of, stale_by, max_sessions)
        return None

    names = raw.get("names")
    baskets = raw.get("baskets")
    if not isinstance(names, dict):
        log.warning("washout override: artifact %s has no names map — stamping off", source)
        return None
    thr = str(threshold or os.environ.get("WASHOUT_THRESHOLD") or DEFAULT_THRESHOLD)
    return WashoutState(
        as_of=as_of,
        threshold=thr,
        names={str(k): v for k, v in names.items() if isinstance(v, dict)},
        baskets={str(k): v for k, v in (baskets or {}).items() if isinstance(v, dict)},
        source=source,
    )


# ──────────────────────────────────────────────────────────── THE ENTRY GATE ──
def qualifies(
    ticker: str,
    known_ts: str,
    *,
    state: WashoutState | None,
    notch: int | None = None,
    grace_days: int = 0,
) -> dict | None:
    """Does this ``bear_block``-vetoed fire get TAKEN? The whole live rule, in one call.

    Returns the override context (``group_id``/``peer_dd``/``basis``/``thresholds_hit``/
    ``as_of`` + display names) when the name qualifies, and ``None`` — a plain refusal —
    otherwise. ``None`` is the answer to every failure mode; there is no error path.

    The four conditions, all of which must hold (ratification packet §2 / §4.2):

      * **notch** — the name's thematic-basket peer median sits at or below the ratified
        notch (``WASHOUT_OVERRIDE_NOTCH``, 25%). Read off the artifact's ``qualifies`` map,
        which is the LOO peer-median basis.
      * **basis** — the artifact's ``names`` map, i.e. the name's own primary basket (GICS
        sector where it has none), never an index or a composite.
      * **PIT** — ``state.as_of <= known_ts``: the state must have been CURRENT when the
        fire became knowable. This is what makes the gate incapable of reaching backwards;
        today's washout can never take a fire from 2021.
      * **staleness** — ``<= WASHOUT_MAX_STALE_SESSIONS`` (5 sessions) since ``as_of``,
        enforced upstream in ``load_state``/``state_from_dict``: a stale artifact yields
        ``state=None`` and every answer here is None.

    ``grace_days`` widens the PIT window by N calendar days (the ``WASHOUT_PIT_GRACE_DAYS``
    operator lever, default 0 = the strict rule) so a missed nightly does not silently drop
    a fire. It is the same lever the display stamp honours — one PIT rule, not two.
    """
    if state is None:
        return None
    known = _iso(known_ts)
    if known is None or not _pit_ok(known, state.as_of, grace_days):
        return None
    return state.context_for(ticker, notch=notch)


# ══════════════════════════════════════════════ THE RETRO PROJECTION (display) ══
# A LABELLED COUNTERFACTUAL, AND NOTHING ELSE.
#
# The live gate above cannot reach backwards (the PIT rule) and must not: an entry the
# engine did not make is not a trade. But the refusals it left behind are still on the
# chart, and a user reading them has no way to see that today's rule would treat that bar
# differently. The retro projection answers exactly that question, on the display tier:
# a PRE-FENCE ``regime_blocked`` (or relievable keeper-block) fire whose date sits inside a
# qualifying interval for its name gets ``retro_override``/``retro_ctx``.
#
# THE FOUR HARD BOUNDARIES (each has its own test; the first is structural):
#   1. it never touches the forward ledger — ``mark_retro`` takes NO ledger parameter, so
#      there is no code path through which it could, not merely none that does;
#   2. it never changes ``quality``, so it can never become an entry class, can never walk
#      ``position_hint``/``last_scored``, and can never enter the scored stream;
#   3. it never alerts (``ingest/alerts_engine`` keys on the entry qualities, and these
#      fires keep their refusal quality);
#   4. artifact absent/unparseable/wrong-notch → nothing is marked and the emission is
#      byte-identical to one built without this module.
#
# WHY "PRE-FENCE" IS THE CUT: a fire the LIVE mask judged already has its answer, and
# re-answering it here would let a display artifact contradict a traded decision. So the
# projection only reaches fires the live gate could not have judged — ``known_ts`` strictly
# before the live state's ``as_of``. Post-fence fires are the mask's, always.
HISTORY_SCHEMA_IN = "basket_washout_history.v1"
HISTORY_SCHEMA_BRIDGE = "washout_history/v1"

HISTORY_PATH = ROOT / "terminal" / "public" / "data" / "washout_history.json"

# The keeper's refusal string (confluence_v2.keeper_verdict). Held here so the retro cohort
# can be selected without importing the pandas-bearing emitter.
KEEPER_BLOCK_QUALITY = "block"


def _parse_interval(v: Any) -> tuple[str, str | None] | None:
    """One qualifying window → ``(start, end|None)``. None end = still open."""
    start = end = None
    if isinstance(v, dict):
        start = v.get("start") or v.get("from") or v.get("begin")
        end = v.get("end") or v.get("to") or v.get("until")
    elif isinstance(v, (list, tuple)) and len(v) >= 1:
        start = v[0]
        end = v[1] if len(v) >= 2 else None
    start = _iso(start)
    if start is None:
        return None
    return (start, _iso(end))


def _intervals_at(row: dict, notch: int) -> list[tuple[str, str | None]]:
    """The name's qualifying windows AT ``notch``.

    The artifact publishes windows per notch (``{"20": [...], "25": [...]}``) so one file
    serves the whole grid; a flat list is accepted as the single-notch shape and is only
    ever read when the artifact declares that same notch (checked by the caller).
    """
    raw = row.get("intervals")
    if raw is None:
        raw = row.get("qualifying_intervals")
    if isinstance(raw, dict):
        raw = raw.get(str(notch))
    if not isinstance(raw, (list, tuple)):
        return []
    out = []
    for item in raw:
        iv = _parse_interval(item)
        if iv is not None:
            out.append(iv)
    return out


@dataclass(frozen=True)
class WashoutHistory:
    """Per-name qualifying date INTERVALS — the backward-looking sibling of ``WashoutState``.

    Deliberately NOT freshness-gated. The state artifact is gated because a stale one would
    let yesterday's basket take today's fire; this one only ever describes days that are
    already over, so age costs coverage at the recent edge (the safe direction) and nothing
    else. It IS notch-gated: windows cut at 25% must never paint a 20%-notch claim.

    INTEGRATION REQUIREMENT — SAME BASIS AS THE LIVE STATE. The windows must be cut on the
    same LOO peer-median construction and the same ``qualifies`` rule as
    ``basket_washout_state.v1``. Not a style preference: a fire the live mask refuses TODAY
    (post-fence, so no retro mark) becomes PRE-FENCE tomorrow, when ``as_of`` advances past
    it. If the two artifacts agree, that fire is absent from the windows too and nothing
    happens — the flicker case is empty by construction. If they disagree, the product
    refuses a fire on Monday and paints "would have entered" on the same bar on Tuesday.
    Both artifacts come off the macro side's ``r3_axes.py``, which is what makes them agree;
    a future history publisher that re-derives the basis independently breaks it silently.
    """

    as_of: str | None
    notch: int
    names: dict[str, dict]
    source: str

    def retro_ctx_for(self, ticker: str, ts: str) -> dict | None:
        """``retro_ctx`` when ``ts`` sits inside a qualifying window for this name."""
        row = self.names.get(ticker) or self.names.get(ticker.upper())
        if not isinstance(row, dict):
            return None
        day = _iso(ts)
        if day is None:
            return None
        hit = any(start <= day and (end is None or day <= end)
                  for start, end in _intervals_at(row, self.notch))
        if not hit:
            return None
        group_id = row.get("group_id")
        ctx: dict[str, Any] = {"group_id": str(group_id) if group_id is not None else None}
        # Display names ride WITH the mark for the same reason they ride with the live
        # stamp: the card needs no second fetch and an archived slice stays self-describing.
        for src, key in (("name", "name"), ("name_zh", "name_zh")):
            val = row.get(src)
            if val:
                ctx[key] = str(val)
        return ctx


def load_history(path: str | Path | None = None, *, notch: int | None = None) -> WashoutHistory | None:
    """Read the bridged history artifact. None (with ONE log line) on every failure mode."""
    p = Path(path) if path is not None else Path(
        os.environ.get("WASHOUT_HISTORY_PATH") or HISTORY_PATH)
    if not p.exists():
        log.info("washout retro: no history artifact at %s — no retro marks", p)
        return None
    try:
        raw = json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001 — a bad artifact must never break slice generation
        log.warning("washout retro: unreadable history %s (%s) — retro marking off", p, e)
        return None
    return history_from_dict(raw, notch=notch, source=str(p))


def history_from_dict(raw: Any, *, notch: int | None = None,
                      source: str = "<dict>") -> WashoutHistory | None:
    """Validate a raw history artifact dict. The pure half of ``load_history``."""
    want = int(notch if notch is not None else WASHOUT_OVERRIDE_NOTCH)
    if not isinstance(raw, dict):
        log.warning("washout retro: history is not an object (%s) — retro marking off", source)
        return None
    schema = str(raw.get("schema") or "")
    if not (schema.startswith(HISTORY_SCHEMA_IN.split(".v")[0])
            or schema.startswith(HISTORY_SCHEMA_BRIDGE.split("/")[0])):
        log.warning("washout retro: unexpected history schema %r in %s — retro marking off",
                    schema, source)
        return None
    names = raw.get("names")
    if not isinstance(names, dict):
        log.warning("washout retro: history %s has no names map — retro marking off", source)
        return None

    # NOTCH GATE. A per-notch artifact serves every notch and needs no declaration; a
    # single-notch artifact must declare OUR notch or its windows are somebody else's cut.
    declared = raw.get("notch") if raw.get("notch") is not None else raw.get("threshold")
    per_notch = any(isinstance(v, dict) and isinstance(v.get("intervals"), dict)
                    for v in names.values() if isinstance(v, dict))
    if not per_notch:
        try:
            if declared is None or int(str(declared)) != want:
                log.warning("washout retro: history %s is cut at notch %r, live notch is %d "
                            "— retro marking off", source, declared, want)
                return None
        except (TypeError, ValueError):
            log.warning("washout retro: history %s carries an unreadable notch %r — off",
                        source, declared)
            return None
    return WashoutHistory(
        as_of=_iso(raw.get("as_of")),
        notch=want,
        names={str(k): v for k, v in names.items() if isinstance(v, dict)},
        source=source,
    )


def mark_retro(
    symbol: str,
    signals: Iterable[dict] | None,
    *,
    history: WashoutHistory | None,
    live_as_of: str | None = None,
    grace_days: int = 0,
    relievable_ts: Iterable[str] | None = None,
) -> int:
    """Mark PRE-FENCE refusals today's rule would have entered. Display fields ONLY.

    Sets ``retro_override=True`` + ``retro_ctx`` in place and returns how many were marked.
    Writes NOTHING else — not ``quality``, not ``tier``, not ``blocked`` — which is what
    keeps the class out of the scored stream, the alert lane, and the ledger.

    ``relievable_ts`` are the 3D bar-open dates of keeper blocks that failed ONLY the
    200-reclaim leg (``confluence_v2.build_v2``'s ``keeper_relievable``). They are passed in
    rather than read off the events for two reasons: the emitted event deliberately carries
    no such field, so an artifact-free emission stays byte-identical to the pre-fence one;
    and the branch fact cannot be recovered from the keeper's reason string, which collapses
    both legs' failures into one literal (prereg §5).

    Note the signature: there is no ledger parameter, by design. "It must never accrue" is
    a property of the code's shape here, not of its branches.
    """
    if not signals or history is None:
        return 0
    relievable = {str(t) for t in (relievable_ts or ())}
    n = 0
    for ev in signals:
        if not isinstance(ev, dict):
            continue
        q = str(ev.get("quality") or "").lower()
        # 1. cohort: a regime veto, or a keeper block the reclaim waiver could have
        #    relieved. Never a hold-leg failure, and never a bearish-divergence block.
        if q == BLOCKED_QUALITY:
            pass
        elif q == KEEPER_BLOCK_QUALITY and str(ev.get("ts") or "") in relievable:
            pass
        else:
            continue
        # 2. a point-in-time stamp already answered this fire from its own day's state —
        #    history's own numbers outrank a projection built from an interval file.
        if ev.get("override_candidate") is True:
            continue
        ts = _iso(ev.get("ts"))
        if ts is None:
            continue
        known = _iso(ev.get("known_ts")) or ts
        # 3. THE FENCE CUT: anything the live mask could have judged belongs to the mask.
        if live_as_of is not None and _pit_ok(known, live_as_of, grace_days):
            continue
        ctx = history.retro_ctx_for(symbol, ts)
        if ctx is None:
            continue
        ev["retro_override"] = True
        ev["retro_ctx"] = ctx
        n += 1
    return n


# ─────────────────────────────────────────────────────────── the stop reference ──
def atr14(high: Sequence[float], low: Sequence[float], close: Sequence[float],
          length: int = 14) -> list[float | None]:
    """Wilder ATR over daily bars. ``None`` until ``length`` true ranges exist."""
    n = len(close)
    if n == 0 or len(high) != n or len(low) != n:
        return [None] * n
    out: list[float | None] = [None] * n
    trs: list[float] = []
    prev: float | None = None
    for i in range(n):
        h, l, c = high[i], low[i], close[i]
        if h is None or l is None or c is None:
            trs.append(float("nan"))
            continue
        tr = h - l if i == 0 else max(h - l, abs(h - close[i - 1]), abs(l - close[i - 1]))
        trs.append(float(tr))
        if prev is None:
            if len(trs) >= length and all(t == t for t in trs[-length:]):
                prev = sum(trs[-length:]) / length
                out[i] = prev
        else:
            prev = (prev * (length - 1) + float(tr)) / length
            out[i] = prev
    return out


def stop_reference(
    fire_ts: str,
    bar_opens: Sequence[str],
    dates: Sequence[str],
    high: Sequence[float],
    low: Sequence[float],
    close: Sequence[float],
    *,
    mult: float = 0.5,
    atr_len: int = 14,
) -> float | None:
    """The prereg §1 stop: ``min(low over the fire 3D bar + the 2 prior) − mult×ATR14(daily)``.

    ``bar_opens`` are the 3D bar OPEN dates (the ``ts`` coordinate a signal carries);
    ``dates``/``high``/``low``/``close`` are the DAILY series. The window runs from the open
    of the bar two prior through the last daily session the fire's own bar covers. Returns
    None whenever the inputs cannot support the number — the ledger row still accrues with
    ``stop_ref: null`` rather than a guessed level.
    """
    if not dates or not bar_opens:
        return None
    try:
        j = list(bar_opens).index(fire_ts)
    except ValueError:
        return None
    win_start = bar_opens[max(0, j - 2)]
    win_end_excl = bar_opens[j + 1] if j + 1 < len(bar_opens) else None

    idx = [i for i, d in enumerate(dates)
           if d >= win_start and (win_end_excl is None or d < win_end_excl)]
    if not idx:
        return None
    lows = [low[i] for i in idx if low[i] is not None]
    if not lows:
        return None
    atr = atr14(high, low, close, atr_len)
    a = atr[idx[-1]]
    if a is None:
        return None
    return round(min(lows) - mult * float(a), 6)


# ────────────────────────────────────────────────────────────────── the ledger ──
@dataclass
class OverrideLedger:
    """Append-only forward ledger, idempotent per ``(ticker, ts)``.

    Doubles as the PIT stamp memory: a row recorded on the night a fire qualified is what
    re-stamps that fire on every later regeneration, so no later artifact state ever
    reaches a historical marker. Grading comes later — accrual starts now.
    """

    path: Path
    rows: dict[tuple[str, str], dict] = field(default_factory=dict)
    pending: list[dict] = field(default_factory=list)

    @classmethod
    def open(cls, path: str | Path | None = None) -> "OverrideLedger":
        p = Path(path) if path is not None else Path(os.environ.get("BLOCKED_OVERRIDE_LEDGER") or LEDGER_PATH)
        led = cls(path=p)
        if p.exists():
            try:
                for line in p.read_text().splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        r = json.loads(line)
                    except json.JSONDecodeError:
                        continue  # a torn tail line must not poison the whole ledger
                    t, ts = r.get("ticker"), r.get("ts")
                    if t and ts:
                        led.rows.setdefault((str(t), str(ts)), r)
            except OSError as e:
                log.warning("washout override: could not read ledger %s (%s)", p, e)
        return led

    def get(self, ticker: str, ts: str) -> dict | None:
        return self.rows.get((ticker, ts))

    def record(self, row: dict) -> bool:
        """Queue a row. False when ``(ticker, ts)`` is already known (the idempotency key)."""
        key = (str(row.get("ticker")), str(row.get("ts")))
        if key in self.rows:
            return False
        self.rows[key] = row
        self.pending.append(row)
        return True

    def flush(self) -> int:
        """Append queued rows. Returns the number written."""
        if not self.pending:
            return 0
        n = len(self.pending)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as fh:
                for r in self.pending:
                    fh.write(json.dumps(r, separators=(",", ":"), ensure_ascii=False) + "\n")
        except OSError as e:
            log.warning("washout override: could not append %d ledger rows to %s (%s)",
                        n, self.path, e)
            return 0
        self.pending.clear()
        return n


# ───────────────────────────────────────────────────────────────── the stamper ──
@dataclass
class DailyBars:
    """The daily OHLC the stop reference needs, plus the 3D bar-open grid."""

    bar_opens: Sequence[str]
    dates: Sequence[str]
    high: Sequence[float]
    low: Sequence[float]
    close: Sequence[float]


@dataclass
class WashoutStamper:
    """The run's washout authority: the live ENTRY gate and the display stamp, one object.

    Created ONCE per ingest run (``create()``). Two jobs, in the order the pipeline runs:

      1. ``override_for`` — asked by ``confluence_v2.build_v2`` (via ``override_entries``)
         for every ``bear_block``-vetoed raw buy: TAKE it, or leave it refused. This is the
         live enter-mask conditional; the answer decides what the emitter emits.
      2. ``stamp`` — applied per symbol right after ``contracts.indicator_contract`` builds
         the doc: paints the display class on qualifying-but-refused fires, and accrues the
         forward-ledger row for both classes.

    Both jobs share ONE artifact load and ONE ledger, which is why they live together: the
    ledger is the point-in-time memory that keeps an answer stable across the nightly regen
    and the 5-minute flagship refresh. A ``create()`` that finds no usable artifact returns
    an object whose gate is always None and whose ``stamp()`` is a no-op, so every caller is
    a two-line change with no conditional of its own.
    """

    state: WashoutState | None
    ledger: OverrideLedger | None
    history: WashoutHistory | None = None
    stamped: int = 0
    accrued: int = 0
    replayed: int = 0
    taken: int = 0
    retro_marked: int = 0

    @classmethod
    def create(cls, *, state_path: str | Path | None = None,
               ledger_path: str | Path | None = None,
               history_path: str | Path | None = None,
               today: date | None = None) -> "WashoutStamper":
        state = load_state(state_path, today=today)
        # The ledger opens even without a live artifact: replaying already-recorded stamps is
        # what stops a marker from flickering back to slate on a night the macro feed is down.
        ledger = OverrideLedger.open(ledger_path)
        history = load_history(history_path)
        if state is not None:
            log.info("washout override: state as_of=%s thr=%s%% names=%d baskets=%d ledger=%d rows",
                     state.as_of, state.threshold, len(state.names), len(state.baskets),
                     len(ledger.rows))
        if history is not None:
            log.info("washout retro: history names=%d notch=%d%% (display-only)",
                     len(history.names), history.notch)
        return cls(state=state, ledger=ledger, history=history)

    @property
    def active(self) -> bool:
        return self.state is not None or bool(self.ledger and self.ledger.rows)

    # ────────────────────────────────────────────────────── 1. the entry gate ──
    def override_for(self, ticker: str, ts: str, known_ts: str) -> dict | None:
        """TAKE this ``bear_block``-vetoed fire, or leave it refused? Context, or None.

        ``ts`` is the fire's 3D bar-open date (the ledger's idempotency coordinate);
        ``known_ts`` is the session it became observable (the PIT coordinate).

        Answered in one of two ways, and the order is load-bearing:

          * a LEDGER ROW for ``(ticker, ts)`` wins outright — the answer recorded on the
            night this fire was judged, replayed verbatim. That is what stops an entry from
            appearing and disappearing as the artifact moves under it, and it is why a
            granted entry survives a night when the macro feed is down. Only a row from
            THIS era that was actually ``taken`` replays as an entry; a pre-fence display
            row (no ``era``/``taken``) is a refusal, and so is anything unrecognised.
          * otherwise the live gate (``qualifies``) judges it fresh.
        """
        return self._granted(ticker, ts, known_ts,
                             eras=ERAS_WITH_ENTER_MASK,
                             klass=LEDGER_CLASS_WASHOUT,
                             class_required=False)

    def reclaim_override_for(self, ticker: str, ts: str, known_ts: str) -> dict | None:
        """WAIVE the keeper's 200-reclaim leg for this RELIEVABLE block? Context, or None.

        The gc_v2_wo2 sibling of ``override_for``, asked by ``confluence_v2.
        keeper_quality_map``. Same artifact, same notch, same PIT rule, same ledger, same
        replay-wins ordering — only the cohort differs, and the caller has already
        established that: a fire only reaches here when its HOLD leg passed and its reclaim
        leg failed. This method does not re-derive that and must never try; the branch fact
        does not survive the trip through a reason string, which is the whole lesson of the
        prereg §5 correction.

        The ledger replay is CLASS-STRICT here. A row must say it was a reclaim waiver to
        replay as one — the class did not exist before wo2, so a row that does not name it
        is some other rule's row and this gate refuses it.
        """
        return self._granted(ticker, ts, known_ts,
                             eras=ERAS_WITH_RECLAIM_WAIVER,
                             klass=LEDGER_CLASS_RECLAIM,
                             class_required=True)

    def _granted(self, ticker: str, ts: str, known_ts: str, *,
                 eras: frozenset[str], klass: str, class_required: bool) -> dict | None:
        """The shared body of the two gates: replay if recorded, else judge fresh.

        THE ERA SET, NOT THE CURRENT ERA (changed with the wo2 bump): a row minted under an
        earlier era in which this rule was ALREADY LIVE recorded a real entry, and a later
        era does not retract it — the fence forbids POOLING two eras' results, not honouring
        what a past era did. Pinning the replay to ``== SIGNAL_ERA`` would have un-taken
        every wo1 entry the night wo2 shipped: the marker would revert to a plain ⊘ while
        the forward ledger still carried the position. Each row keeps its own ``era``, which
        is what a grader reads; ``eras`` only decides whether the row still means "entered".
        A pre-fence display row carries no era at all and still fails closed.
        """
        if self.ledger is not None:
            prior = self.ledger.get(ticker, ts)
            if prior is not None:
                ctx = prior.get("override_ctx")
                row_class = prior.get("class")
                class_ok = (row_class == klass) if class_required else (
                    row_class in (None, klass))
                if (prior.get("taken") is True
                        and str(prior.get("era") or SIGNAL_ERA_PRE) in eras
                        and class_ok
                        and isinstance(ctx, dict)):
                    return dict(ctx)
                return None
        return qualifies(ticker, known_ts, state=self.state,
                         grace_days=_env_int("WASHOUT_PIT_GRACE_DAYS", 0))

    # ─────────────────────────────────────────────── 2. the display stamp ──
    def stamp(self, symbol: str, signals: Iterable[dict] | None, *,
              daily: DailyBars | None = None, accrue: bool = True,
              today: date | None = None) -> int:
        """Stamp in place. Returns how many events were stamped.

        ``accrue=False`` = replay-only: apply stamps already in the ledger but never mint new
        rows. The intraday flagship refresh uses it so a 5-minute loop cannot fill the forward
        ledger with partial-session rows; the nightly is the sole advancer.

        A TAKEN fire (``quality="override_take"``) needs no stamp — the emitter already
        carries its context — but it is the row the forward ledger most needs, so it accrues
        here, where the daily bars for the stop reference are in hand.
        """
        if not signals or not self.active:
            return 0
        grace = _env_int("WASHOUT_PIT_GRACE_DAYS", 0)
        n = 0
        for ev in signals:
            if not isinstance(ev, dict):
                continue
            # Both TAKEN classes accrue, each under its own ledger class so the two waivers'
            # forward rows can be graded apart (they are two rules and two gauntlets).
            taken_class = (LEDGER_CLASS_WASHOUT if _is_override_take(ev)
                           else LEDGER_CLASS_RECLAIM if _is_reclaim_override_take(ev)
                           else None)
            if taken_class is not None:
                ctx = ev.get("override_ctx")
                if accrue and self.ledger is not None and isinstance(ctx, dict):
                    row = _ledger_row(symbol, ev, ctx, daily, today=today, taken=True,
                                      klass=taken_class)
                    if self.ledger.record(row):
                        self.accrued += 1
                        self.taken += 1
                continue
            if not _is_regime_blocked(ev):
                continue
            ts = _iso(ev.get("ts"))
            if ts is None:
                continue
            known = _iso(ev.get("known_ts")) or ts

            prior = self.ledger.get(symbol, ts) if self.ledger else None
            if prior is not None:
                ctx = prior.get("override_ctx")
                if isinstance(ctx, dict):
                    ev["override_candidate"] = True
                    ev["override_ctx"] = dict(ctx)
                    self.replayed += 1
                    n += 1
                continue

            if self.state is None:
                continue
            if not _pit_ok(known, self.state.as_of, grace):
                continue
            ctx = self.state.context_for(symbol)
            if ctx is None:
                continue
            ev["override_candidate"] = True
            ev["override_ctx"] = ctx
            self.stamped += 1
            n += 1
            if accrue and self.ledger is not None:
                row = _ledger_row(symbol, ev, ctx, daily, today=today)
                if self.ledger.record(row):
                    self.accrued += 1
        return n

    # ──────────────────────────────────────────── 3. the retro projection ──
    def retro(self, symbol: str, signals: Iterable[dict] | None, *,
              relievable_ts: Iterable[str] | None = None) -> int:
        """Apply the display-only retro marks for this symbol. See ``mark_retro``.

        A thin bind of the run's history + the live state's ``as_of`` onto the free
        function — which is where the marking actually happens, and which cannot reach the
        ledger because it is never handed one.
        """
        n = mark_retro(symbol, signals, history=self.history,
                       live_as_of=self.state.as_of if self.state is not None else None,
                       grace_days=_env_int("WASHOUT_PIT_GRACE_DAYS", 0),
                       relievable_ts=relievable_ts)
        self.retro_marked += n
        return n

    def flush(self) -> int:
        written = self.ledger.flush() if self.ledger else 0
        if self.stamped or self.replayed or self.taken or self.retro_marked or written:
            log.info("washout override: %d taken (era %s), %d stamped, %d replayed, "
                     "%d retro-marked (display only), %d new ledger rows",
                     self.taken, SIGNAL_ERA, self.stamped, self.replayed,
                     self.retro_marked, written)
        return written


def _pit_ok(known_ts: str, as_of: str, grace_days: int) -> bool:
    """The PIT gate: the fire must not predate the state we are stamping it with."""
    if grace_days <= 0:
        return known_ts >= as_of
    floor = (date.fromisoformat(as_of) - timedelta(days=grace_days)).isoformat()
    return known_ts >= floor


def _ledger_row(symbol: str, ev: dict, ctx: dict, daily: DailyBars | None,
                *, today: date | None = None, taken: bool = False,
                klass: str = LEDGER_CLASS_WASHOUT) -> dict:
    ts = _iso(ev.get("ts")) or ""
    stop_ref = None
    if daily is not None:
        try:
            stop_ref = stop_reference(ts, daily.bar_opens, daily.dates,
                                      daily.high, daily.low, daily.close)
        except Exception as e:  # noqa: BLE001 — a stop we cannot compute is null, never a crash
            log.warning("washout override: stop_ref failed for %s %s (%s)", symbol, ts, e)
    return {
        "ts": ts,
        "known_ts": _iso(ev.get("known_ts")) or ts,
        "ticker": symbol,
        "price": ev.get("price"),
        "stop_ref": stop_ref,
        "group_id": ctx.get("group_id"),
        "peer_dd": ctx.get("peer_dd"),
        "thresholds_hit": ctx.get("thresholds_hit"),
        # provenance — a forward ledger that cannot say which artifact minted a row cannot
        # be graded against the era it was minted in
        "basis": ctx.get("basis"),
        "state_as_of": ctx.get("as_of"),
        "logged_at": (today or date.today()).isoformat(),
        # ── the fence, on every row ──────────────────────────────────────────────
        # ``era`` = the rule this row was minted under; ``taken`` = whether that rule
        # ENTERED it. Together they make the ledger gradeable without a second source and
        # make the replay authority fail closed: a pre-fence row carries neither, so it can
        # only ever replay as the display class it was. Rows from the two eras are never
        # pooled — that is the whole point of the fence (prereg §4).
        "era": SIGNAL_ERA,
        "taken": bool(taken),
        # WHICH WAIVER minted this row — the regime-veto override or the keeper's reclaim
        # waiver. Two rules, two gauntlets, two forward track records: a grader that pooled
        # them would measure neither, and the replay authority reads it to fail closed.
        "class": klass,
        "override_ctx": ctx,
    }
