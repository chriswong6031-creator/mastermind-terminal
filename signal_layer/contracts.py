"""The data contracts — the centerpiece of the whole system (research doc §7).

Every series, signal, and backtest result the charting container produces is a
versioned JSON artifact in ONE of these two shapes, so the Mastermind Opus brain
and the Macro Dashboard stock-picker consume them with no bespoke parser.

Two schemas (see ``contracts/*.schema.json`` for the formal JSON Schema):
  * ``mastermind.indicator/v1``  — one doc per {indicator, symbol, timeframe}
  * ``backtest_result/v1``       — one doc per {strategy, symbol}

THE GUARDRAIL (research doc §4 P0-4 / D9): the ``series``/``gates``/``bars`` arrays
are FOR THE CHART ONLY and must NEVER be sent to the model. ``model_slice()`` is the
projection that strips them, leaving only ``signals[]`` + ``state{}`` + the honest
read — the small surface Opus reasons over within its token budget. Enforce the
slice at the read boundary; do not rely on convention.
"""
from __future__ import annotations

import hashlib
import json

import numpy as np
import pandas as pd

SCHEMA_INDICATOR = "mastermind.indicator/v1"
SCHEMA_BACKTEST = "backtest_result/v1"

# The flagship's faithful Pine params (mirrors confluence.py module constants).
# macd_kind alone is insufficient — two rsi_based MACDs of different lengths still
# disagree (research doc §4 / D6), so the lengths live in params and are hashed.
#
# ``no_cut_exits: True`` is the GC v2 marker (memory: gc-v2-signal-program): revSell is
# demoted from a scored EXIT to a display caution, so the traded stream is no-cut. It
# lives in the hashed params so the v2 emission gets a NEW ``source_hash`` — v1 and v2
# indicator docs are distinct identities even off the same script text.
#
# ``reclaim_lane: True`` is the 2026-07-16 scored promotion of the RE-ENTRY repair
# grammar (confluence_v2.reclaim_events): TREND-RECLAIM + BLOCK-REPAIR entries join the
# scored stream (position walk, manifest verdict, wr/pf via use_reclaim_entry=True),
# gated by the reclaim_eligible symbol-class rule. Panel evidence (post-exclusion,
# docs/RECLAIM_LANE_EVIDENCE.md): n=84 names / 1,169 trades, all five gates pass —
# pooled expectancy +10.5%, portfolio ratio 1.33x, WR 56.2→58.8, 2022 falsifier −1.1%.
# In the hashed params so the promoted emission is a NEW source_hash/spec_hash identity.
FLAGSHIP_PARAMS = {
    "confW": 8, "rsiLen": 14, "useMTF": True, "confirmTF": "1W",
    "macd_on": "rsi", "macd_fast": 14, "macd_slow": 60, "macd_signal": 5,
    "buy_rsi_max": 65, "ext_rsi": 70, "rev_bars": 3,
    "no_cut_exits": True,
    "reclaim_lane": True,
}


# ── HK-O1 truth-in-labeling: the emitted ``basis`` vocabulary ────────────────────
# ``basis`` names the MACHINE that produced an event, so no consumer can read a
# trailing structure stop as an oracle-momentum exit. Forensic receipt:
# Macro Dashboard research/prophet_us_audit/HK_ORACLE_FORENSIC_2026-08-08.md §1.
#
# Every user-facing SELL comes from ``v2["sell_confirms"]`` — the ARM→CONFIRM
# structure break (confluence_v2.warn_events): the daily close prints below the last
# CONFIRMED radius-3 swing low while armed. That is a TRAILING STOP on price
# structure. It is NOT the MACD-RSI cross-down (``CS``), which has not been emitted
# to the user stream since the GC v2 unification — 0700.HK printed a red
# "GOLDEN ORACLE · SELL" on 2026-07-24 while its own 3D RSI-MACD read bull
# (CS=False every bar 05-21→08-05, macd>sig rising at the fire).
BASIS_STRUCTURE_STOP = "structure_stop"

# Set on a marker the v2 entry logic REFUSED (bear_block regime veto). Kept alongside
# the legacy ``quality='regime_blocked'`` string — the flag is the render key, the
# string stays for every existing reader (HK-O1 item 2 is additive-only).
BLOCKED_QUALITY = "regime_blocked"


def source_hash(source_text: str, params: dict) -> str:
    """Hash the script source AND the full params block (so a param change is a new
    identity). Matches the loop's spec_hash discipline."""
    blob = source_text + "\x00" + json.dumps(params, sort_keys=True, default=str)
    return "sha256:" + hashlib.sha256(blob.encode()).hexdigest()


def strategy_spec_hash(strategy_id: str = "rsimacd_stochrsi_mtf", params: dict | None = None) -> str:
    """The backtest contract's strategy identity — {id, params} hashed, 8 hex chars.
    Exposed so ingest can detect a LANE-STALE artifact (e.g. a pre-reclaim-promotion
    backtest under current params) without re-deriving the formula."""
    return hashlib.sha256(
        json.dumps({"id": strategy_id, "params": params or FLAGSHIP_PARAMS},
                   sort_keys=True).encode()
    ).hexdigest()[:8]


# ---------------------------------------------------------------- indicator --
def indicator_contract(
    symbol: str,
    timeframe: str,
    sig: pd.DataFrame,
    *,
    indicator_id: str = "confluence_rsimacd_stochrsi_mtf",
    title: str = "RSI-MACD × StochRSI MTF Confluence",
    engine: str = "python:signal_layer.confluence_v2@v2",
    source_lang: str = "python",
    params: dict | None = None,
    macd_kind: str = "rsi_based",
    bar_quality: str = "synthetic_open_deepstore",
    as_of: str | None = None,
    src_text: str = "",
    validation: dict | None = None,
    honest_read: str = "",
    v2: dict | None = None,
) -> dict:
    """Build a ``mastermind.indicator/v1`` doc from ``confluence.compute_signals`` output.

    ``v2`` is the GC v2 emission from ``confluence_v2.build_v2`` (keeper quality + recipe
    tier per BUY/REBUY, early_dots[], warnings[], score_basis). When present, BUY/REBUY
    signals gain ``quality``/``tier``, CUT signals get ``scored:false``, and the two side
    channels ``early_dots``/``warnings`` are attached at the top level (capped to the last
    40 each). ``v2=None`` yields the plain oracle doc (back-compat for any caller that has
    not wired the v2 emitter yet)."""
    params = params or FLAGSHIP_PARAMS
    bars = [d.strftime("%Y-%m-%d") for d in sig.index]

    def col(name):
        return [_num(v) for v in sig[name].to_list()]

    series = {k: col(k) for k in ("macd", "sig", "k", "d", "rsi14") if k in sig}
    gates = {k: [bool(v) for v in sig[k].to_list()]
             for k in ("w_bull", "above200", "mo_bull", "w2_bull") if k in sig}

    v2 = v2 or {}
    signals = _extract_signals(sig, v2)
    state = _state(sig, signals)
    early = (v2.get("early_dots") or [])[-40:]
    warns = (v2.get("warnings") or [])[-40:]

    return {
        "schema": SCHEMA_INDICATOR,
        "indicator": {
            "id": indicator_id, "title": title, "engine": engine,
            "source_lang": source_lang, "source_hash": source_hash(src_text, params),
            "macd_kind": macd_kind, "params": params,
        },
        "symbol": symbol,
        "timeframe": timeframe,
        "as_of": as_of or (bars[-1] + "T00:00:00Z" if bars else None),
        "bar_quality": bar_quality,
        # ── CHART-ONLY ARRAYS — never projected to the model (model_slice strips) ──
        "bars": bars,
        "series": series,
        "gates": gates,
        # ── MODEL-FACING SLICE ──
        "signals": signals,
        "state": state,
        # ── v2 side channels (display; small — kept in the slice) ──
        "early_dots": early,
        "warnings": warns,
        "meta": {
            "leakfree": True, "scored": False,
            "score_basis": v2.get("score_basis", "full"),
            "validated_against": "signal_layer/confluence.py",
            "validation": validation or {},
            "honest_read": honest_read,
            "warnings": [],
        },
    }


def _extract_signals(sig: pd.DataFrame, v2: dict | None = None) -> list[dict]:
    """Discrete events → the Opus-facing surface: the ONE UNIFIED signal stream.

    The stream is ``BUY`` + ``REBUY`` + ``SELL`` only, ordered by ``bar_index``:
      * BUY   — from CB, exactly as before (keeper ``quality``/``tier``/``score`` stamped).
      * REBUY — from revBuy, exactly as before.
      * SELL  — from the v2 warn stream's CONFIRM events (``v2["sell_confirms"]``, the
                armed-momentum + structure-break event). This REPLACES the old CS-based SELL,
                so it is a TRAILING STRUCTURE STOP and says so: every SELL carries
                ``basis="structure_stop"`` + ``stop_level`` (the swing low its daily close
                broke). Nothing in this stream is a momentum exit — do not label one as one.

    NOT in this stream anymore (display priority = tops/bottoms readability, not sim purity):
      * CS-based SELL entries — dropped; CS stays internal to the no-cut sim only.
      * CUT (revSell) entries — dropped; revSell stays internal to the no-cut sim only.
    Both remain live inside ``backtest``/``confluence.simulate``; they are simply no longer
    emitted as user-facing markers. The chart's classic red sell pill renders ``type:"SELL"``
    with zero frontend work.

    GC v2 (``v2`` = confluence_v2.build_v2 output):
      * BUY / REBUY gain ``quality`` (keeper take/block/pending) + ``tier`` (recipe
        aplus/quality/base) + ``score`` (0..100) at their positional ``bar_index`` (the
        index into the non-NaN signal rows, which is what ``keeper``/``recipe`` key on)."""
    v2 = v2 or {}
    keeper = v2.get("keeper", {})       # {positional_bar_index: {verdict, reason, shift}}
    recipe = v2.get("recipe", {})       # {positional_bar_index: {score, tier}}
    # bar_index here counts POSITIONAL non-NaN rows (keeper/recipe key on the same index).
    # Guard the empty/columnless frame (dropna(subset=...) would KeyError otherwise).
    if len(sig) and {"macd", "sig", "k", "d", "rsi14"}.issubset(sig.columns):
        valid = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
        pos_of = {ts: p for p, ts in enumerate(valid.index)}
    else:
        pos_of = {}

    out = []
    for i, (ts, row) in enumerate(sig.iterrows()):
        kind = None
        if row.get("revBuy"):
            kind, reasons = "REBUY", ["fast_reversal_up", "sell_failed"]
        elif row.get("CB"):
            kind, reasons = "BUY", ["macd_bull_cross", "recent_b1", "confirm_bull", "rsi<65"]
        # CS / revSell are NO LONGER emitted here (unified stream: SELL comes from the v2
        # CONFIRM events below; CS+revSell remain internal to the sim only).
        if not kind:
            continue
        ev = {
            "ts": ts.strftime("%Y-%m-%d"),
            # ``ts`` is the 3D bar OPEN and remains the chart/replay coordinate.
            # ``known_ts`` is the session when this row's value became observable.
            "known_ts": _iso_date(row.get("known_ts"), ts.strftime("%Y-%m-%d")),
            "bar_index": i,
            "type": kind,
            "strength": _strength(row),
            "price": _num(row.get("close")),
            "reasons": reasons,
            "regime": {"weeklyBull": bool(row.get("w_bull")),
                       "above200": bool(row.get("above200")),
                       "monthlyBull": bool(row.get("mo_bull"))},
        }
        p = pos_of.get(ts)
        if p is not None and p in keeper:
            ev["quality"] = keeper[p]["verdict"]           # take / block / pending
            ev["quality_reason"] = keeper[p]["reason"]
            r = recipe.get(p)
            if r is not None:
                ev["tier"] = r["tier"]                     # aplus / quality / base
                ev["score"] = r["score"]
        else:
            # A raw CB/revBuy the v2 entry logic does NOT take: bear_block regime veto
            # (keeper only grades ``(CB|revBuy) & ~bear_block``). Keep the display marker
            # but flag it so the model/chart never treats it as an entry. tier=None.
            #
            # ``blocked`` is the HK-O1 render key: ``type`` stays "BUY"/"REBUY" verbatim so
            # every existing reader keeps working, but a blocked setup must never be DRAWN
            # with buy geometry (9988.HK's 2026-07-09 entry was regime-vetoed and still
            # printed a solid BUY star on the price series — forensic §2). Consumers gate
            # on ``blocked``/``quality``, never on ``type`` alone.
            ev["quality"] = BLOCKED_QUALITY
            ev["quality_reason"] = "bear_block: monthly-bear & below-200 & 2W-not-bull"
            ev["tier"] = None
            ev["score"] = None
            ev["blocked"] = True
        out.append(ev)

    # ── SELL from the v2 CONFIRM events (distribution armed + structure break) ──
    # Each confirm event is a DAILY-grid date; map it onto the containing / nearest-preceding
    # 3D row (open_date <= confirm_ts) so it renders on the 3D chart grid. strength/regime
    # come from that 3D row (its OPEN precedes the confirm, so both are point-in-time safe).
    # Multiple confirms can fall in one 3D bar's 3-session window — each stays a distinct
    # SELL at its own confirm date.
    #
    # PRICE IS THE EXCEPTION (HK-O1 item 3 / forensic B2). The 3D row's ``close`` is the
    # close of a bar that OPENED on/before the confirm and CLOSES up to 2 sessions AFTER it,
    # so stamping it on the marker published a price the market had not printed yet —
    # 9988.HK's 2026-05-27 SELL carried the close of the bar that opened 05-26. The honest
    # stamp is the confirm session's own DAILY close (``px``), which is also the exact number
    # the rule tested when it broke ``level``. ``price`` falls back to the 3D close only for
    # a legacy v2 payload emitted before ``px`` existed.
    sell_confirms = v2.get("sell_confirms") or []
    if sell_confirms and len(sig):
        sidx = sig.index                                   # 3D open dates, ascending
        for w in sell_confirms:
            cts = pd.Timestamp(w["ts"])
            j = int(sidx.searchsorted(cts, side="right")) - 1
            if j < 0:                                       # confirm before the first 3D bar
                continue
            row = sig.iloc[j]
            px = _num(w.get("px"))
            out.append({
                "ts": w["ts"],                              # the confirm event's date
                "known_ts": _iso_date(w.get("known_ts"), w["ts"]),
                "bar_index": j,                             # nearest-preceding 3D row
                "type": "SELL",
                # A trailing stop on price STRUCTURE — never a momentum/oracle exit.
                "basis": BASIS_STRUCTURE_STOP,
                "strength": _strength(row),                 # of the nearest 3D row
                "price": px if px is not None else _num(row.get("close")),
                "stop_level": _num(w.get("level")),         # the swing low the close broke
                "reasons": ["distribution_confirmed", "structure_break"],
                "regime": {"weeklyBull": bool(row.get("w_bull")),
                           "above200": bool(row.get("above200")),
                           "monthlyBull": bool(row.get("mo_bull"))},
            })
    # ── RECLAIM from the v2 repair lane (scored re-entry since reclaim_lane promotion) ──
    # Two kinds ride the same marker type: "reclaim" (post-SELL trend reclaim) and
    # "block_repair" (a bear-blocked entry whose block legs cleared). ``scored`` mirrors
    # FLAGSHIP_PARAMS["reclaim_lane"]: True since the 2026-07-16 promotion (panel gates
    # G1–G5 passed post-exclusion), so these flip the position walk / manifest verdict and
    # the sim prices them (backtest.use_reclaim_entry). Pre-promotion slices in the wild
    # carry scored:false — every consumer treats those as display-only.
    reclaims = v2.get("reclaims") or []
    if reclaims and len(sig):
        sidx = sig.index
        for r in reclaims:
            j = int(sidx.searchsorted(pd.Timestamp(r["ts"]), side="right")) - 1
            if j < 0:
                continue
            row = sig.iloc[j]
            kind = r.get("kind", "reclaim")
            out.append({
                "ts": r["ts"],
                "known_ts": _iso_date(r.get("known_ts"), r["ts"]),
                "bar_index": j,
                "type": "RECLAIM",
                "strength": _strength(row),
                "price": _num(row.get("close")),
                "scored": bool(FLAGSHIP_PARAMS.get("reclaim_lane")),
                "quality": kind,                        # reclaim | block_repair
                "quality_reason": (
                    f"trend reclaimed the {r.get('anchor_ts')} sell level"
                    if kind == "reclaim"
                    else f"bear-block legs repaired after the {r.get('anchor_ts')} blocked entry"
                ),
                "reasons": (["close>sell_price", "weekly_bull", "above200", "debounced"]
                            if kind == "reclaim"
                            else ["bear_block_cleared", "macd_cross_still_live"]),
                "regime": {"weeklyBull": bool(row.get("w_bull")),
                           "above200": bool(row.get("above200")),
                           "monthlyBull": bool(row.get("mo_bull"))},
            })

    # keep the unified stream ordered by bar_index (BUY/REBUY were already in order;
    # SELLs/RECLAIMs are appended out of order). Stable sort preserves same-bar ordering.
    out.sort(key=lambda e: e["bar_index"])
    return out


def _strength(row) -> float:
    """Crude 0..1 conviction from how many regime gates agree on the signal bar."""
    gates = [bool(row.get("w_bull")), bool(row.get("above200")),
             bool(row.get("mo_bull")), bool(row.get("w2_bull"))]
    return round(0.45 + 0.55 * (sum(gates) / len(gates)), 3)


def _state(sig: pd.DataFrame, signals: list[dict]) -> dict:
    """Model-facing position state, derived from the UNIFIED signal stream.

    The stream is BUY/REBUY/SELL only (CUT + CS-SELL are no longer emitted — see
    ``_extract_signals``). ``last_signal`` / ``bars_since_signal`` echo the raw stream tail.
    ``position_hint`` / ``last_scored_signal`` / ``last_scored_ts`` walk the SCORED lane
    only: markers stamped ``quality='regime_blocked'`` are display artifacts the v2 entry
    logic refused ("never treat as an entry") and must not flip the position — a blocked
    BUY after a SELL leaves the hint flat and the scored verdict SELL. ``last_scored_ts``
    is the signal's availability date (``known_ts``), with a legacy fallback to its chart
    coordinate (``ts``). The scored fields diverge from ``last_signal`` exactly when the
    stream tail is a blocked marker.

    ``last_scored_basis`` mirrors the anchoring signal's ``basis`` so the demotion to flat
    is READABLE (HK-O1 item 1): a SELL here flips ``position_hint`` to flat off a trailing
    structure stop, never off an oracle-momentum exit, and a consumer that reads only the
    state block can now tell which. None on every non-SELL anchor (basis is SELL-only)."""
    last = sig.iloc[-1] if len(sig) else None
    last_sig = signals[-1] if signals else None
    bars_since = (len(sig) - 1 - last_sig["bar_index"]) if last_sig else None

    # position hint from the last SCORED position event (blocked markers don't trade;
    # RECLAIM counts only when its emission was scored — pre-promotion display-tier
    # markers carry scored:false and stay out of the walk).
    pos = None
    last_scored = None
    for s in reversed(signals):
        if s["type"] == "RECLAIM" and not s.get("scored"):
            continue
        # a refused entry never walks the position — gate on the explicit ``blocked`` flag
        # AND the legacy quality string, so neither alone can re-open the 2026-07-15 hole.
        if s.get("blocked") is True or s.get("quality") == BLOCKED_QUALITY:
            continue
        if s["type"] in ("BUY", "REBUY", "SELL", "RECLAIM"):
            last_scored = s
            pos = "long" if s["type"] in ("BUY", "REBUY", "RECLAIM") else "flat"
            break
    strong_bull = bool(last is not None and last.get("strong_bull"))
    return {
        "position_hint": pos,
        "last_signal": last_sig["type"] if last_sig else None,
        "last_scored_signal": last_scored["type"] if last_scored else None,
        "last_scored_ts": (
            last_scored.get("known_ts") or last_scored["ts"]
            if last_scored else None
        ),
        # why the scored lane sits where it sits — "structure_stop" on a stopped-out flat.
        "last_scored_basis": (last_scored.get("basis") if last_scored else None),
        "bars_since_signal": bars_since,
        # ── the two ``extended``s (HK-O1 item 4 / forensic §2) ──────────────────────────
        # DEPRECATED ALIAS. This field carries ``strong_bull`` (weekly+monthly bull & above
        # 200d) — a STRENGTH read. It does NOT mean the Pine ``extended`` (overbought), and
        # it is NOT the Macro Dashboard cycles pipeline's "Extended — don't chase", which is
        # an entirely different engine (engine/cycles.py) whose caution rides ``overbought``
        # on this contract. Two meanings of one word landed on one stock card. Every reader
        # should take ``strong_bull`` or ``overbought`` by name; the alias survives only so
        # pre-2026-07-15 consumers keep parsing. Do not add new readers of ``extended``.
        "extended": strong_bull,
        "strong_bull": strong_bull,
        # the true Pine extendedNow — overbought on the last 3D row (RSI>=70 or %K>=80)
        "overbought": bool(
            last is not None
            and ((last.get("rsi14") or 0) >= FLAGSHIP_PARAMS["ext_rsi"]
                 or (last.get("k") or 0) >= 80)
        ),
        "weeklyBull": bool(last is not None and last.get("w_bull")),
        "above200": bool(last is not None and last.get("above200")),
    }


# ---------------------------------------------------------------- backtest ---
def backtest_contract(
    symbol: str,
    timeframe: str,
    bt: dict,
    *,
    strategy_id: str = "rsimacd_stochrsi_mtf",
    name: str = "RSI-MACD × StochRSI MTF confluence",
    params: dict | None = None,
    fill: str = "next_close",
    series_ref: str | None = None,
    honest_read: str = "",
) -> dict:
    """Build a ``backtest_result/v1`` doc from ``backtest.run_backtest`` output."""
    params = params or FLAGSHIP_PARAMS
    spec_hash = strategy_spec_hash(strategy_id, params)
    m = bt.get("metrics", {})
    return {
        "schema": SCHEMA_BACKTEST,
        "as_of": bt.get("last"),
        "status": bt.get("status", "ok"),
        "bar_quality": bt.get("bar_quality"),
        "strategy": {
            "id": strategy_id, "name": name, "source": "signal_layer/confluence.py",
            "spec_hash": spec_hash, "params": params, "fill": fill,
            "cost_bps": bt.get("cost_bps"), "slippage_bps": bt.get("slippage_bps"),
        },
        "universe": {"ticker": symbol, "timeframe": timeframe,
                     "start": bt.get("first"), "end": bt.get("last"), "bars": bt.get("bars")},
        "metrics": m,
        "trades": bt.get("trades", []),
        "series_ref": series_ref,    # loop.harness consumes the parquet at this path
        "validation": None,          # null until loop/harness is invoked (keeps per-chart runs cheap)
        "honest_read": honest_read,
    }


# ---------------------------------------------------------------- the slice --
def model_slice(contract: dict) -> dict:
    """Project a contract down to the MODEL-FACING surface only.

    Strips ``bars``/``series``/``gates`` (indicator) and ``trades``/``_returns``
    (backtest) so the brain never ingests raw float arrays. This is the cost/context
    guardrail (research doc §4 P0-4 / D9) — enforce it at the read boundary.
    """
    s = contract.get("schema")
    if s == SCHEMA_INDICATOR:
        return {
            "schema": s, "indicator_id": contract["indicator"]["id"],
            "symbol": contract["symbol"], "timeframe": contract["timeframe"],
            "as_of": contract.get("as_of"), "bar_quality": contract.get("bar_quality"),
            "macd_kind": contract["indicator"].get("macd_kind"),
            "signals": contract.get("signals", [])[-12:],   # cap the history sent to the model
            "state": contract.get("state", {}),
            # v2 side channels (small; safe to send) — cap to the recent window.
            "early_dots": contract.get("early_dots", [])[-12:],
            "warnings": contract.get("warnings", [])[-12:],
            "score_basis": contract.get("meta", {}).get("score_basis", "full"),
            "honest_read": contract.get("meta", {}).get("honest_read", ""),
        }
    if s == SCHEMA_BACKTEST:
        return {
            "schema": s, "strategy_id": contract["strategy"]["id"],
            "symbol": contract["universe"]["ticker"], "as_of": contract.get("as_of"),
            "bar_quality": contract.get("bar_quality"),
            "metrics": contract.get("metrics", {}),       # scalars only — safe to send
            "n_trades": contract.get("metrics", {}).get("n_trades"),
            "validation": contract.get("validation"),
            "honest_read": contract.get("honest_read", ""),
        }
    raise ValueError(f"unknown contract schema: {s!r}")


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(f):
        return None
    return round(f, 6)


def _iso_date(value, fallback: str) -> str:
    """Return an ISO availability date, falling back for legacy/synthetic frames."""
    try:
        if value is None or pd.isna(value):
            return fallback
        return pd.Timestamp(value).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return fallback
