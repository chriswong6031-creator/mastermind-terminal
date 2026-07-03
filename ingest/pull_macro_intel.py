"""Brain/Macro intel bridge (HANDOFF §7.6).

For each equity symbol in the Mastermind Terminal universe, reads the Macro Dashboard's
per-stock JSON (site/stockdata/<SYM>.json) and writes a trimmed, versioned
terminal/public/data/<SYM>.intel.json in the ``intel/v1`` shape.

Crypto symbols (BTC-USD, ETH-USD, SOL-USD, XRP-USD) and any symbol missing a source
file are silently skipped.

Usage:
    python ingest/pull_macro_intel.py [SYM ...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.build_polygon_universe import DEFAULT, META  # noqa: E402

MACRO_STOCKDATA = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard/site/stockdata")
OUT = ROOT / "terminal" / "public" / "data"


def _r(v, nd: int = 4):
    """Round a float or return None if not numeric."""
    if v is None:
        return None
    try:
        return round(float(v), nd)
    except (TypeError, ValueError):
        return None


def _str(v):
    """Return str or None."""
    if v is None:
        return None
    return str(v)


def _list(v):
    """Return list or None."""
    if isinstance(v, list):
        return v
    return None


def build_intel(sym: str, src: dict) -> dict:
    """Map a Macro Dashboard stockdata dict → intel/v1 contract."""
    # --- helpers to navigate nested dicts safely ---
    def g(obj, *keys, default=None):
        """Nested .get() — returns default on any missing key or wrong type."""
        cur = obj
        for k in keys:
            if not isinstance(cur, dict):
                return default
            cur = cur.get(k)
            if cur is None:
                return default
        return cur

    asof = _str(src.get("asof"))

    # ── tape ──
    view = src.get("view") or {}
    decision = g(view, "decision") or {}
    conviction = src.get("conviction") or {}
    ladder = src.get("ladder") or {}
    gex = src.get("gex") or {}
    positioning = src.get("positioning") or {}

    # Derive BULL/BEAR/WAIT from view.decision.band or conviction state
    decision_score = g(decision, "score")
    decision_band = _str(g(decision, "band"))
    headline = _str(g(decision, "headline"))
    ladder_dir = _str(ladder.get("dir"))
    # Simple mapping: look at ladder.dir first, fall back to conviction verdict
    if ladder_dir == "up":
        ai_dir = "BULL"
    elif ladder_dir == "down":
        ai_dir = "BEAR"
    else:
        # Try conviction regime state
        regime_state = _str(g(conviction, "regime", "state"))
        if regime_state in ("bull", "bullish"):
            ai_dir = "BULL"
        elif regime_state in ("bear", "bearish"):
            ai_dir = "BEAR"
        else:
            ai_dir = "WAIT"

    tape = {
        "ai_lean": {
            "dir": ai_dir,
            "score": _r(conviction.get("score"), 1),
        },
        "conviction": _r(conviction.get("score"), 1),
        "regime": _str(ladder.get("regime_label")),
        "gex_flip": _r(gex.get("gamma_flip"), 2),
        "call_wall": _r(gex.get("call_wall"), 2),
        "put_wall": _r(gex.get("put_wall"), 2),
        "short_pct": _r(g(positioning, "short", "pct_float"), 2),
    }

    # ── cards.ai_judgment ──
    size = conviction.get("size") or {}
    ai_judgment = {
        "verdict": headline,
        "gloss": _str(g(decision, "gloss")),
        "size_pct": _r(size.get("pct"), 1),
    }

    # ── cards.conviction ──
    cautions_raw = conviction.get("cautions") or []
    # cautions may be strings or dicts; keep English strings
    cautions_en = []
    for c in cautions_raw:
        if isinstance(c, str):
            cautions_en.append(c)
        elif isinstance(c, dict):
            en = c.get("en") or c.get("text")
            if en:
                cautions_en.append(str(en))

    conviction_card = {
        "score": _r(conviction.get("score"), 1),
        "band": _str(conviction.get("band_en")),
        "drivers": _list(conviction.get("drivers")),
        "cautions": cautions_en or None,
    }

    # ── cards.levels ──
    levels = [
        {"label": "Call wall", "price": _r(gex.get("call_wall"), 2), "kind": "resistance"},
        {"label": "Gamma flip", "price": _r(gex.get("gamma_flip"), 2), "kind": "pivot"},
        {"label": "Put wall", "price": _r(gex.get("put_wall"), 2), "kind": "support"},
    ]

    # ── cards.analyst ──
    revisions = src.get("revisions") or {}
    valuation = src.get("valuation") or {}
    analyst = src.get("analyst") or {}
    fwd_pe = _r(valuation.get("forward_pe") or analyst.get("forward_pe"), 2)
    analyst_card = {
        "revision_breadth": _r(revisions.get("breadth"), 3),
        "est_chg_30d": _r(revisions.get("est_chg_30d"), 2),
        "est_chg_90d": _r(revisions.get("est_chg_90d"), 2),
        "fwd_pe": fwd_pe,
        "n_analysts": _r(revisions.get("n_analysts"), 0),
    }

    # ── cards.smart_money ──
    sm = src.get("smart_money") or {}
    sm_trend = sm.get("trend") or {}
    smart_money_card = {
        "trend": _str(sm_trend.get("direction")),
        "n_holders": _r(sm.get("n_holders"), 0),
        "value_change_pct": _r(sm_trend.get("value_change_pct"), 2),
    }

    return {
        "schema": "intel/v1",
        "ticker": sym,
        "asof": asof,
        "tape": tape,
        "cards": {
            "ai_judgment": ai_judgment,
            "conviction": conviction_card,
            "levels": levels,
            "analyst": analyst_card,
            "smart_money": smart_money_card,
        },
    }


def main(syms: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Equity-only symbols (skip crypto)
    equity_syms = [s for s in syms if META.get(s, ("", "Equities", ""))[1] == "Equities"]

    ok, skipped, failed = [], [], []
    for sym in equity_syms:
        src_path = MACRO_STOCKDATA / f"{sym}.json"
        if not src_path.exists():
            print(f"  skip {sym}: no source file at {src_path}")
            skipped.append(sym)
            continue
        try:
            with open(src_path) as f:
                src = json.load(f)
            intel = build_intel(sym, src)
            out_path = OUT / f"{sym}.intel.json"
            out_path.write_text(json.dumps(intel, separators=(",", ":")))
            print(f"  {sym}: wrote {out_path.name} "
                  f"(regime={intel['tape'].get('regime')} dir={intel['tape']['ai_lean']['dir']})")
            ok.append(sym)
        except Exception as exc:
            print(f"  ERROR {sym}: {exc}")
            failed.append(sym)

    print(f"\nDone: {len(ok)} written, {len(skipped)} skipped (no src), {len(failed)} failed")
    if skipped:
        print(f"  Skipped: {skipped}")
    if failed:
        print(f"  Failed:  {failed}")


if __name__ == "__main__":
    main(sys.argv[1:] or DEFAULT)
