"""Blocked-entry washout override — the DISPLAY-TIER stamp and its forward ledger.

Ratified rule (Macro Dashboard ``research/BLOCKED_ENTRY_RATIFICATION_PACKET_2026-08-10.md``
§2/§4, prereg §5 ratification log, threshold **25%**): a ``regime_blocked`` (⊘) fire whose
name's thematic-basket peers sit ≥25% below their 252d highs is a **washout override
candidate**. Held-out 2019+, repaired aggregate at 25%: cell +1.134R, diff-vs-complement
+1.068R [0.937, 1.204], ex-COVID +0.725R, 8 episodes; production-feed re-grade (gate B)
reproduced it at +1.113 / +1.008 [0.88, 1.14] over 9 episodes.

WHAT THIS MODULE DOES — AND DOES NOT — DO
-----------------------------------------
DOES: add two OPTIONAL fields to an already-emitted blocked signal event so the chart and
the rail card can render a distinct class, and accrue one forward-ledger row per newly
stamped fire.

DOES NOT: touch the ``enter`` mask, the keeper verdict, the score, the tier, the backtest,
or any signal math. Nothing here can create, suppress, or re-type an event — every event
this module sees was already produced by ``confluence_v2``/``contracts``. The live
``enter``-mask conditional stays gated on the signal-era fence (packet §4.2); this build is
the display promotion only.

COHORT (load-bearing, corrected 2026-08-10): the override class keys on
``quality == "regime_blocked"`` — the ``bear_block`` regime veto — and on nothing else. A
keeper ``block`` ("counter-trend, no 200-reclaim/hold", e.g. HL's 2026-06-16/06-25 fires) is
a DIFFERENT refusal, outside the studied cohort, and must never be stamped even when its
basket qualifies. ``contracts.BLOCKED_QUALITY`` is the single source of that string.

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

ROOT = Path(__file__).resolve().parents[1]

log = logging.getLogger(__name__)

# The macro-side artifact contract this module consumes (schema ``basket_washout_state.v1``,
# bridged to ``terminal/public/data/washout_state.json`` by ``ingest/pull_macro_washout.py``).
SCHEMA_IN = "basket_washout_state.v1"
SCHEMA_BRIDGE = "washout_state/v1"

STATE_PATH = ROOT / "terminal" / "public" / "data" / "washout_state.json"

# Ratified threshold. 20/30 also passed every frozen gate — the notch is an operator
# aggressiveness dial (packet §2), so it is a config edit, not a code change.
DEFAULT_THRESHOLD = "25"

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


# ────────────────────────────────────────────────────────────────── the state ──
@dataclass(frozen=True)
class WashoutState:
    """A usable ``basket_washout_state.v1`` snapshot. Absent/stale → callers get ``None``."""

    as_of: str
    threshold: str
    names: dict[str, dict]
    baskets: dict[str, dict]
    source: str

    def context_for(self, ticker: str) -> dict | None:
        """The ``override_ctx`` for ``ticker``, or None when it does not qualify.

        ``qualifies[threshold]`` from the artifact is the authority. Only when that map is
        absent entirely does this fall back to comparing the artifact's own ``peer_dd``
        against the threshold — arithmetic on the publisher's number, never an invention.
        """
        row = self.names.get(ticker) or self.names.get(ticker.upper())
        if not isinstance(row, dict):
            return None
        peer_dd = as_drawdown_fraction(row.get("peer_dd"))
        hits = _thresholds_hit(row, peer_dd)
        try:
            thr_i = int(self.threshold)
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
    """Stamps ``override_candidate``/``override_ctx`` onto emitted blocked signal events.

    Created ONCE per ingest run (``create()``), applied per symbol right after
    ``contracts.indicator_contract`` builds the doc, flushed at the end. A ``create()`` that
    finds no usable artifact returns a stamper whose ``stamp()`` is a no-op, so every caller
    is a two-line change with no conditional of its own.
    """

    state: WashoutState | None
    ledger: OverrideLedger | None
    stamped: int = 0
    accrued: int = 0
    replayed: int = 0

    @classmethod
    def create(cls, *, state_path: str | Path | None = None,
               ledger_path: str | Path | None = None,
               today: date | None = None) -> "WashoutStamper":
        state = load_state(state_path, today=today)
        # The ledger opens even without a live artifact: replaying already-recorded stamps is
        # what stops a marker from flickering back to slate on a night the macro feed is down.
        ledger = OverrideLedger.open(ledger_path)
        if state is not None:
            log.info("washout override: state as_of=%s thr=%s%% names=%d baskets=%d ledger=%d rows",
                     state.as_of, state.threshold, len(state.names), len(state.baskets),
                     len(ledger.rows))
        return cls(state=state, ledger=ledger)

    @property
    def active(self) -> bool:
        return self.state is not None or bool(self.ledger and self.ledger.rows)

    def stamp(self, symbol: str, signals: Iterable[dict] | None, *,
              daily: DailyBars | None = None, accrue: bool = True,
              today: date | None = None) -> int:
        """Stamp in place. Returns how many events were stamped.

        ``accrue=False`` = replay-only: apply stamps already in the ledger but never mint new
        rows. The intraday flagship refresh uses it so a 5-minute loop cannot fill the forward
        ledger with partial-session rows; the nightly is the sole advancer.
        """
        if not signals or not self.active:
            return 0
        grace = _env_int("WASHOUT_PIT_GRACE_DAYS", 0)
        n = 0
        for ev in signals:
            if not isinstance(ev, dict) or not _is_regime_blocked(ev):
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

    def flush(self) -> int:
        written = self.ledger.flush() if self.ledger else 0
        if self.stamped or self.replayed or written:
            log.info("washout override: %d stamped, %d replayed, %d new ledger rows",
                     self.stamped, self.replayed, written)
        return written


def _pit_ok(known_ts: str, as_of: str, grace_days: int) -> bool:
    """The PIT gate: the fire must not predate the state we are stamping it with."""
    if grace_days <= 0:
        return known_ts >= as_of
    floor = (date.fromisoformat(as_of) - timedelta(days=grace_days)).isoformat()
    return known_ts >= floor


def _ledger_row(symbol: str, ev: dict, ctx: dict, daily: DailyBars | None,
                *, today: date | None = None) -> dict:
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
        "override_ctx": ctx,
    }
