"""Brain/Macro intel bridge (HANDOFF §7.6).

For each equity symbol in the Mastermind Terminal universe, reads the Macro Dashboard's
per-stock JSON (site/stockdata/<SYM>.json) and writes a trimmed, versioned
terminal/public/data/<SYM>.intel.json in the ``intel/v1`` shape.

v1 forwarded a thin `tape` + 5 summary `cards`. v1 now ALSO carries a rich, bilingual
`analysis` block (decision / conviction / entry timing / factors / technicals / valuation /
financials / business profile / smart money / analysts+earnings / options-GEX / macro
sensitivity) that powers the Terminal's mobile scroll panel + desktop intelligence rail +
expanded analysis modal. `tape`/`cards` are kept for backward-compatibility.

Crypto symbols (BTC-USD, ETH-USD, SOL-USD, XRP-USD) and any symbol missing a source
file are silently skipped.

Usage:
    python ingest/pull_macro_intel.py [SYM ...]   # default universe (or named symbols)
    python ingest/pull_macro_intel.py --all       # every US ticker with a stockdata file
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

MACRO_STOCKDATA = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard/site/stockdata")
OUT = ROOT / "terminal" / "public" / "data"


def _r(v, nd: int = 4):
    """Round a float or return None if not numeric/finite."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return round(f, nd)


def _str(v):
    return None if v is None else str(v)


def _list(v):
    return v if isinstance(v, list) else None


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


def _en_list(raw):
    """Normalize a list of strings-or-{en,text} dicts to a list of English strings."""
    out = []
    for c in raw or []:
        if isinstance(c, str):
            out.append(c)
        elif isinstance(c, dict):
            en = c.get("en") or c.get("text")
            if en:
                out.append(str(en))
    return out or None


def _build_analysis(src: dict) -> dict:
    """The rich, bilingual analysis payload consumed by the Terminal UI."""
    view = src.get("view") or {}
    decision = g(view, "decision") or {}
    action = g(decision, "action") or {}
    trust = g(decision, "trust") or {}
    conviction = src.get("conviction") or {}
    size = conviction.get("size") or {}
    entry = src.get("entry_signal") or {}
    composite = src.get("composite") or {}
    tech = src.get("tech") or {}
    valuation = src.get("valuation") or {}
    fin = src.get("financials") or {}
    profile = src.get("profile") or {}
    sm = src.get("smart_money") or {}
    analyst = src.get("analyst") or {}
    earnings = src.get("earnings") or {}
    gex = src.get("gex") or {}
    vh = gex.get("vol_hole") or {}
    macro = src.get("macro_sensitivity") or {}

    # --- decision (buy / wait / sell engine) ---
    d_out = {
        "verb": _str(action.get("verb")),
        "verb_zh": _str(action.get("verb_zh")),
        "tone": _str(action.get("tone")),
        "headline": _str(decision.get("headline")),
        "headline_zh": _str(decision.get("headline_zh")),
        "gloss": _str(decision.get("gloss")),
        "gloss_zh": _str(decision.get("gloss_zh")),
        "band": _str(decision.get("band")),
        "band_label": _str(decision.get("band_en")),
        "band_label_zh": _str(decision.get("band_zh")),
        "name_label": _str(decision.get("name_label")),
        "name_label_zh": _str(decision.get("name_label_zh")),
        "score": _r(decision.get("score"), 0),
        "trust_tier": _str(trust.get("tier")),
        "trust_en": _str(trust.get("en")),
        "trust_zh": _str(trust.get("zh")),
    }

    # --- conviction (the score + drivers + cautions + sizing) ---
    c_out = {
        "score": _r(conviction.get("score"), 0),
        "band": _str(conviction.get("band_en") or conviction.get("band")),
        "band_zh": _str(conviction.get("band_zh")),
        "drivers": _list(conviction.get("drivers")),
        "cautions": _en_list(conviction.get("cautions")),
        "cautions_zh": _list(conviction.get("cautions_zh")),
        "size_bucket": _str(size.get("bucket")),
        "size_pct": _r(size.get("pct"), 1),
        "size_note": _str(size.get("note")),
        "rank_pctile": _r(conviction.get("rank_pctile"), 0),
        "potential": _r(conviction.get("potential"), 0),
    }

    # --- entry timing ---
    horizon = entry.get("horizon") or {}
    cyc = entry.get("cycle_pos") or {}
    timing = entry.get("timing") or {}
    e_out = {
        "status": _str(entry.get("status")),
        "urgency": _str(entry.get("urgency")),
        "headline": _str(entry.get("headline")),
        "headline_zh": _str(entry.get("headline_zh")),
        "action": _str(entry.get("action")),
        "action_zh": _str(entry.get("action_zh")),
        "grade": _str(entry.get("entry_grade")),
        "confidence": _r(entry.get("confidence"), 1),
        "horizon": {"d3": _r(horizon.get("d3"), 2), "d21": _r(horizon.get("d21"), 2), "d63": _r(horizon.get("d63"), 2)},
        "buy_zone": entry.get("buy_zone"),
        "chase_above": _r(entry.get("chase_above"), 2),
        "stop": _r(entry.get("stop"), 2),
        "spot": _r(entry.get("spot"), 2),
        "atr_pct": _r(entry.get("atr_pct"), 2),
        "cycle": {
            "dc_day": _r(cyc.get("dc_day"), 0),
            "dc_band": _list(cyc.get("dc_band")),
            "pct_through": _r(cyc.get("pct_through"), 0),
            "phase": _str(cyc.get("phase")),
        },
        "opens_lo": _r(timing.get("opens_in_days_lo"), 0),
        "opens_hi": _r(timing.get("opens_in_days_hi"), 0),
        "next_trigger": _str(timing.get("next_trigger")),
    }

    # --- factor profile ---
    legs = composite.get("legs") or {}
    f_out = {
        "z": _r(composite.get("z"), 2),
        "legs": {k: _r(v, 2) for k, v in legs.items()} or None,
    }

    # --- technicals (curated) ---
    t_keys = ["price", "above50", "above200", "pct_vs_50dma", "pct_vs_200dma", "pct_vs_20dma",
              "rsi14", "rsi2", "macd_pos", "adx14", "adx_trend", "di_plus", "di_minus",
              "atr_pct", "off_52w_high_pct", "rel_volume", "hv20", "hv_pctile", "bbwp",
              "ret_1m", "ret_3m", "ret_6m", "ret_12m", "mom_12_1", "golden", "sma50_slope_up",
              "squeeze_on", "donchian_pos", "chop14"]
    tech_out = {}
    for k in t_keys:
        v = tech.get(k)
        if isinstance(v, (bool, str)):
            tech_out[k] = v
        else:
            r = _r(v, 2)
            if r is not None:
                tech_out[k] = r

    # --- valuation ---
    def ratio(key, label):
        o = valuation.get(key) or {}
        if not isinstance(o, dict):
            return None
        return {"label": label, "v": _r(o.get("v"), 2), "med": _r(o.get("med"), 2), "cheap": _r(o.get("cheap"), 0)}
    ratios = [r for r in [
        ratio("trailing_pe", "Trailing P/E"),
        ratio("price_to_book", "Price / Book"),
        ratio("price_to_sales", "Price / Sales"),
        ratio("earnings_yield", "Earnings yield"),
        ratio("fcf_proxy_yield", "FCF yield"),
        ratio("shareholder_yield", "Shareholder yield"),
    ] if r]
    fwd_pe_v = valuation.get("forward_pe")
    if isinstance(fwd_pe_v, dict):
        fwd_pe_v = fwd_pe_v.get("v")
    v_out = {
        "ratios": ratios or None,
        "value_z": _r(valuation.get("value_z"), 2),
        "forward_pe": _r(fwd_pe_v, 2) or _r(analyst.get("forward_pe"), 2),
        "forward_tier": _str(valuation.get("forward_tier")),
    }

    # --- financials ---
    my = fin.get("multiyear") or {}

    def tail(key, n=6):
        v = my.get(key)
        return [_r(x, 2) for x in v[-n:]] if isinstance(v, list) else None
    fin_out = {
        "gross_margin": _r(fin.get("gross_margin"), 1),
        "net_margin": _r(fin.get("net_margin"), 1),
        "fcf_margin": _r(fin.get("fcf_margin"), 1),
        "rev_growth": _r(fin.get("rev_growth"), 1),
        "ni_growth": _r(fin.get("ni_growth"), 1),
        "roe": _r(fin.get("roe"), 1),
        "roa": _r(fin.get("roa"), 1),
        "debt_to_assets": _r(fin.get("debt_to_assets"), 1),
        "multiyear": {
            "years": (my.get("years") or [])[-6:] or None,
            "revenue": tail("revenue"),
            "net_margin": tail("net_margin"),
            "eps": tail("eps"),
            "fcf": tail("fcf"),
            "rev_cagr": _r(my.get("rev_cagr"), 1),
            "eps_cagr": _r(my.get("eps_cagr"), 1),
            "piotroski": _r(my.get("piotroski"), 0),
            "altman": _r(my.get("altman"), 1),
        } if my else None,
    }

    # --- business profile ---
    mtier = profile.get("mktcap_tier") or {}
    arch = profile.get("archetype") or {}
    p_out = {
        "sector": _str(profile.get("sector")),
        "mktcap_bn": _r(profile.get("mktcap_bn"), 1),
        "mktcap_tier": _str(mtier.get("label")),
        "mktcap_tier_zh": _str(mtier.get("label_zh")),
        "archetype": _str(arch.get("label")),
        "archetype_zh": _str(arch.get("label_zh")),
        "archetype_why": _str(arch.get("why")),
        "archetype_why_zh": _str(arch.get("why_zh")),
        "description": _str(profile.get("description")),
        "description_zh": _str(profile.get("description_zh")),
    }

    # --- smart money ---
    holders = []
    for h in (sm.get("holders") or [])[:6]:
        if not isinstance(h, dict):
            continue
        holders.append({
            "fund": _str(h.get("fund_name") or h.get("fund")),
            "action": _str(h.get("action")),
            "pct_portfolio": _r(h.get("pct_portfolio"), 2),
            "value_usd": _r(h.get("value_usd"), 0),
            "grade": _str(h.get("fund_grade")),
        })
    sm_trend = sm.get("trend")
    sm_out = {
        "holders": holders or None,
        "n_holders": _r(sm.get("n_holders"), 0),
        "n_buying": _r(sm.get("n_buying"), 0),
        "n_selling": _r(sm.get("n_selling"), 0),
        "is_vip": bool(sm.get("is_vip")) if sm.get("is_vip") is not None else None,
        "trend": _str(sm_trend.get("direction")) if isinstance(sm_trend, dict) else _str(sm_trend),
    }

    # --- analysts + earnings ---
    summ = earnings.get("summary") or {}
    surprises = []
    for s in (earnings.get("surprises") or [])[:4]:
        if isinstance(s, dict):
            surprises.append({"qtr": _str(s.get("qtr")), "eps": _r(s.get("eps"), 2),
                              "consensus": _r(s.get("consensus"), 2), "surprise_pct": _r(s.get("surprise_pct"), 1)})
    ae_out = {
        "forward_pe": _r(analyst.get("forward_pe"), 2),
        "profit_margin": _r(analyst.get("profit_margin"), 1),
        "roe": _r(analyst.get("roe"), 1),
        "div_yield": _r(analyst.get("div_yield"), 2),
        "rating": _str(analyst.get("rating")),
        "target": _r(analyst.get("target"), 2),
        "next_date": _str(earnings.get("next_date")),
        "eps_forecast": _r(earnings.get("eps_forecast"), 2),
        "beats": _r(summ.get("beats"), 0),
        "total": _r(summ.get("total"), 0),
        "avg_surprise": _r(summ.get("avg_surprise"), 1),
        "streak": _r(summ.get("streak"), 0),
        "sue_z": _r(earnings.get("sue_z"), 2),
        "surprises": surprises or None,
    }

    # --- options / dealer gamma ---
    gex_out = {
        "gamma_regime": _str(gex.get("gamma_regime") or gex.get("regime")),
        "net_gex_bn": _r(gex.get("net_gex_bn"), 2),
        "gamma_flip": _r(gex.get("gamma_flip"), 2),
        "dist_to_flip_pct": _r(gex.get("dist_to_flip_pct"), 2),
        "call_wall": _r(gex.get("call_wall"), 2),
        "put_wall": _r(gex.get("put_wall"), 2),
        "iv30": _r(gex.get("iv30"), 4),
        "spot": _r(gex.get("spot"), 2),
        "vol_hole": {
            "state": _str(vh.get("state")),
            "band_width_pct": _r(vh.get("band_width_pct"), 2),
            "to_upper_pct": _r(vh.get("to_upper_pct"), 2),
            "to_lower_pct": _r(vh.get("to_lower_pct"), 2),
            "pos": _r(vh.get("pos"), 2),
            "compression": _str(vh.get("compression")),
        } if vh else None,
    } if gex else None

    # --- macro / rate sensitivity ---
    macro_out = {
        "rate_beta": _r(macro.get("rate_beta"), 3),
        "tier": _str(macro.get("tier")),
        "tier_en": _str(g(macro, "tier_label", "en")),
        "tier_zh": _str(g(macro, "tier_label", "zh")),
        "duration": _str(macro.get("duration")),
        "duration_en": _str(g(macro, "duration_label", "en")),
        "regime": _str(macro.get("regime")),
        "regime_en": _str(g(macro, "regime_label", "en")),
        "inflation": _str(macro.get("inflation")),
        "inflation_en": _str(g(macro, "inflation_label", "en")),
        "headline_en": _str(g(macro, "headline", "en")),
        "headline_zh": _str(g(macro, "headline", "zh")),
    } if macro else None

    return {
        "decision": d_out,
        "conviction": c_out,
        "entry": e_out,
        "factors": f_out,
        "tech": tech_out or None,
        "valuation": v_out,
        "financials": fin_out,
        "profile": p_out,
        "smart_money": sm_out,
        "analyst": ae_out,
        "gex": gex_out,
        "macro": macro_out,
    }


def build_intel(sym: str, src: dict) -> dict:
    """Map a Macro Dashboard stockdata dict → intel/v1 contract (tape + cards + analysis)."""
    asof = _str(src.get("asof"))

    view = src.get("view") or {}
    decision = g(view, "decision") or {}
    conviction = src.get("conviction") or {}
    ladder = src.get("ladder") or {}
    gex = src.get("gex") or {}
    positioning = src.get("positioning") or {}

    # Derive BULL/BEAR/WAIT from view.decision tone first (most authoritative), then ladder/regime.
    tone = _str(g(decision, "action", "tone"))
    verb = _str(g(decision, "action", "verb"))
    ladder_dir = _str(ladder.get("dir"))
    if verb in ("BUY", "REBUY", "ADD") or tone == "go":
        ai_dir = "BULL"
    elif verb in ("SELL", "TRIM", "CUT", "AVOID") or tone in ("stop", "sell"):
        ai_dir = "BEAR"
    elif ladder_dir == "up":
        ai_dir = "BULL"
    elif ladder_dir == "down":
        ai_dir = "BEAR"
    else:
        regime_state = _str(g(conviction, "regime", "state"))
        ai_dir = "BULL" if regime_state in ("bull", "bullish") else "BEAR" if regime_state in ("bear", "bearish") else "WAIT"

    headline = _str(g(decision, "headline"))

    tape = {
        "ai_lean": {"dir": ai_dir, "score": _r(conviction.get("score"), 1)},
        "conviction": _r(conviction.get("score"), 1),
        "regime": _str(ladder.get("regime_label")),
        "gex_flip": _r(gex.get("gamma_flip"), 2),
        "call_wall": _r(gex.get("call_wall"), 2),
        "put_wall": _r(gex.get("put_wall"), 2),
        "short_pct": _r(g(positioning, "short", "pct_float"), 2),
    }

    size = conviction.get("size") or {}
    ai_judgment = {"verdict": headline, "gloss": _str(g(decision, "gloss")), "size_pct": _r(size.get("pct"), 1)}

    conviction_card = {
        "score": _r(conviction.get("score"), 1),
        "band": _str(conviction.get("band_en")),
        "drivers": _list(conviction.get("drivers")),
        "cautions": _en_list(conviction.get("cautions")),
    }

    levels = [
        {"label": "Call wall", "price": _r(gex.get("call_wall"), 2), "kind": "resistance"},
        {"label": "Gamma flip", "price": _r(gex.get("gamma_flip"), 2), "kind": "pivot"},
        {"label": "Put wall", "price": _r(gex.get("put_wall"), 2), "kind": "support"},
    ]

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

    sm = src.get("smart_money") or {}
    sm_trend = sm.get("trend") or {}
    smart_money_card = {
        "trend": _str(sm_trend.get("direction")) if isinstance(sm_trend, dict) else _str(sm_trend),
        "n_holders": _r(sm.get("n_holders"), 0),
        "value_change_pct": _r(sm_trend.get("value_change_pct"), 2) if isinstance(sm_trend, dict) else None,
    }

    return {
        "schema": "intel/v1",
        "ticker": sym,
        "asof": asof,
        "name": _str(src.get("name")),
        "sector": _str(src.get("sector")),
        "tape": tape,
        "cards": {
            "ai_judgment": ai_judgment,
            "conviction": conviction_card,
            "levels": levels,
            "analyst": analyst_card,
            "smart_money": smart_money_card,
        },
        "analysis": _build_analysis(src),
    }


def _resolve_syms(args: list[str]) -> list[str]:
    rest = [a for a in args if not a.startswith("--")]
    if "--all" in args:
        return sorted(p.stem for p in MACRO_STOCKDATA.glob("*.json"))
    if rest:
        return rest
    from ingest.build_polygon_universe import DEFAULT, META  # noqa: E402
    return [s for s in DEFAULT if META.get(s, ("", "Equities", ""))[1] == "Equities"]


def main(args: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    syms = _resolve_syms(args)

    ok, skipped, failed = [], [], []
    for sym in syms:
        src_path = MACRO_STOCKDATA / f"{sym}.json"
        if not src_path.exists():
            skipped.append(sym)
            continue
        try:
            with open(src_path) as f:
                src = json.load(f)
            intel = build_intel(sym, src)
            (OUT / f"{sym}.intel.json").write_text(json.dumps(intel, separators=(",", ":")))
            ok.append(sym)
        except Exception as exc:
            print(f"  ERROR {sym}: {exc}")
            failed.append(sym)

    print(f"\nDone: {len(ok)} written, {len(skipped)} skipped (no src), {len(failed)} failed")
    if failed:
        print(f"  Failed:  {failed[:20]}")


if __name__ == "__main__":
    main(sys.argv[1:])
