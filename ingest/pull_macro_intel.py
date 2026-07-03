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

import glob
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.build_polygon_universe import DEFAULT, META  # noqa: E402

MACRO = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard")
MACRO_STOCKDATA = MACRO / "site" / "stockdata"
OUT = ROOT / "terminal" / "public" / "data"


def g(obj, *keys, default=None):
    """Nested .get() — returns default on any missing key / non-dict along the path."""
    cur = obj
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


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


# ═════════════════════════ analysis/v1 section builders (US) ═════════════════════════
# These map the US site/stockdata blocks onto the SAME intel/v1 `analysis` contract that
# pull_cn_hk_intel.py emits and StockAnalysis.tsx renders (see ticker-pane-code.md §2). The US
# per-stock JSON already carries deep, multi-year fundamentals (financials.multiyear, valuation
# with peer-median + cheapness percentile, earnings surprises, 13F smart_money, macro_sensitivity);
# the one genuine gap is analyst price-targets + rating distribution, filled from us_deep.parquet
# (collect_us_deep.py). Every field is null-safe — a missing block just doesn't render.


def build_decision_us(src: dict) -> dict:
    """view.decision → analysis.decision (same nested action/trust/band shape as CN/HK build_decision)."""
    v = src.get("view") or {}
    d = v.get("decision") or {}
    conv = src.get("conviction") or {}
    act = d.get("action") or {}
    trust = d.get("trust") or {}
    ctrust = conv.get("trust_tier") if isinstance(conv.get("trust_tier"), dict) else {}
    band_en = d.get("band_en")
    if band_en in (None, "—", "-"):
        band_en = conv.get("band_en")
    band_zh = d.get("band_zh")
    if band_zh in (None, "—", "-"):
        band_zh = conv.get("band_zh")
    return {
        "verb": act.get("verb"), "verb_zh": act.get("verb_zh"), "tone": act.get("tone"),
        "headline": d.get("headline"), "headline_zh": d.get("headline_zh"),
        "gloss": d.get("gloss") or None, "gloss_zh": d.get("gloss_zh") or None,
        "band": d.get("band"), "band_label": band_en, "band_label_zh": band_zh,
        "name_label": d.get("name_label"), "name_label_zh": d.get("name_label_zh"),
        "score": d.get("score") if d.get("score") is not None else conv.get("score"),
        "trust_tier": trust.get("tier") or ctrust.get("tier"),
        "trust_en": trust.get("en") or ctrust.get("en"),
        "trust_zh": trust.get("zh") or ctrust.get("zh"),
    }


def build_conviction_us(src: dict) -> dict:
    """conviction → analysis.conviction (drivers/cautions/size + board-rank percentile)."""
    c = src.get("conviction") or {}
    size = c.get("size") or {}
    spot = c.get("spotlight") if isinstance(c.get("spotlight"), dict) else {}
    return {
        "score": c.get("score"),
        "band": c.get("band_en") or c.get("band"),
        "band_zh": c.get("band_zh"),
        "drivers": c.get("drivers") or [],
        "cautions": c.get("cautions") or [],
        "cautions_zh": c.get("cautions_zh") or [],
        "size_bucket": size.get("bucket"), "size_pct": size.get("pct"), "size_note": size.get("note"),
        "rank_pctile": spot.get("rank_pctile") or spot.get("pctile"), "potential": None,
    }


def build_entry_us(src: dict):
    """entry_signal → analysis.entry (status/levels/horizon/cycle)."""
    e = src.get("entry_signal") or {}
    if not e:
        return None
    tim = e.get("timing") or {}
    cyc = e.get("cycle_pos") or {}
    hz = e.get("horizon") or {}
    return {
        "status": e.get("status"), "urgency": e.get("urgency"),
        "headline": e.get("headline"), "headline_zh": e.get("headline_zh"),
        "action": e.get("action"), "action_zh": e.get("action_zh"),
        "grade": e.get("entry_grade"), "confidence": e.get("confidence"),
        # horizon is a dict {d3,d21,d63} on US names — the panel reads a.entry.horizon.d3/.d21/.d63
        "horizon": ({"d3": hz.get("d3"), "d21": hz.get("d21"), "d63": hz.get("d63")} if hz else None),
        "buy_zone": e.get("buy_zone"), "chase_above": e.get("chase_above"),
        "stop": e.get("stop"), "spot": e.get("spot"), "atr_pct": e.get("atr_pct"),
        "cycle": ({"dc_day": cyc.get("dc_day"), "dc_band": cyc.get("dc_band"),
                   "pct_through": cyc.get("pct_through"), "phase": cyc.get("phase")} if cyc else None),
        "opens_lo": tim.get("opens_in_days_lo"), "opens_hi": tim.get("opens_in_days_hi"),
        "next_trigger": tim.get("next_trigger"),
    }


def build_factors_us(src: dict):
    """factors → analysis.factors (leg z-scores; panel guards on a.factors.legs)."""
    f = src.get("factors") or {}
    legs = f.get("legs") if isinstance(f.get("legs"), dict) else None
    if not legs:
        return None
    return {"z": f.get("z") if f.get("z") is not None else f.get("composite_z"), "legs": legs}


def build_valuation_us(src: dict):
    """valuation → analysis.valuation.ratios ({label, v, med, cheap}) + forward_pe/value_z/tier."""
    val = src.get("valuation") or {}
    LABELS = [
        ("trailing_pe", "Trailing P/E"), ("price_to_book", "Price / Book"),
        ("price_to_sales", "Price / Sales"), ("earnings_yield", "Earnings yield"),
        ("fcf_proxy_yield", "FCF yield"), ("shareholder_yield", "Shareholder yield"),
    ]
    ratios = []
    for key, label in LABELS:
        r = val.get(key)
        if isinstance(r, dict) and r.get("v") is not None:
            ratios.append({"label": label, "v": _r(r.get("v"), 2),
                           "med": _r(r.get("med"), 2), "cheap": _r(r.get("cheap"), 0)})
    if not ratios:
        return None
    return {"ratios": ratios, "forward_pe": _r(val.get("forward_pe"), 2),
            "value_z": _r(val.get("value_z"), 2), "forward_tier": val.get("forward_tier")}


def build_financials_us(src: dict):
    """financials (+ multiyear + Piotroski/Altman) → analysis.financials."""
    fin = src.get("financials") or {}
    if not fin:
        return None
    my = fin.get("multiyear") or {}
    multiyear = ({
        "years": my.get("years"), "revenue": my.get("revenue"),
        "net_margin": my.get("net_margin"), "eps": my.get("eps"), "fcf": my.get("fcf"),
        "rev_cagr": my.get("rev_cagr"), "eps_cagr": my.get("eps_cagr"),
        "piotroski": g(my, "piotroski", "score"), "altman": g(my, "altman", "z"),
    } if my else None)
    out = {
        "gross_margin": _r(fin.get("gross_margin"), 1), "net_margin": _r(fin.get("net_margin"), 1),
        "fcf_margin": _r(fin.get("fcf_margin"), 1), "roe": _r(fin.get("roe"), 1),
        "roa": _r(fin.get("roa"), 1),
        "rev_growth": _r(fin.get("rev_growth"), 1), "ni_growth": _r(fin.get("ni_growth"), 1),
        "debt_to_assets": _r(fin.get("debt_to_assets"), 1), "multiyear": multiyear,
    }
    if out["net_margin"] is not None or multiyear:
        return out
    return None


def build_profile_us(src: dict):
    """profile → analysis.profile (sector/mktcap tier/archetype/description bilingual)."""
    p = src.get("profile") or {}
    if not p:
        return None
    tier = p.get("mktcap_tier") if isinstance(p.get("mktcap_tier"), dict) else {}
    arch = p.get("archetype") if isinstance(p.get("archetype"), dict) else {}
    return {
        "sector": p.get("sector") or src.get("sector"),
        "mktcap_bn": _r(p.get("mktcap_bn"), 2),
        "mktcap_tier": tier.get("label"), "mktcap_tier_zh": tier.get("label_zh"),
        "archetype": arch.get("label"), "archetype_zh": arch.get("label_zh"),
        "archetype_why": arch.get("why"), "archetype_why_zh": arch.get("why_zh"),
        "description": p.get("description"), "description_zh": p.get("description_zh") or p.get("description"),
    }


def build_smart_money_us(src: dict):
    """smart_money (13F holders) → analysis.smart_money (holders + accumulation trend)."""
    sm = src.get("smart_money") or {}
    holders_raw = sm.get("holders") or []
    if not holders_raw:
        return None
    holders = []
    for h in holders_raw:
        holders.append({
            "fund": h.get("fund_name") or h.get("fund"),
            "action": h.get("action"), "grade": h.get("fund_grade"),
            "pct_portfolio": _r(h.get("pct_portfolio"), 2),
            "value_usd": _r(h.get("value_usd"), 0),
        })
    trend = sm.get("trend") or {}
    return {
        "holders": holders, "n_holders": _r(sm.get("n_holders"), 0),
        "is_vip": bool(sm.get("is_vip")),
        "n_buying": _r(sm.get("n_buying"), 0), "n_selling": _r(sm.get("n_selling"), 0),
        "trend": trend.get("direction"),
        "value_change_pct": _r(trend.get("value_change_pct"), 1),
    }


def build_analyst_us(src: dict, ud: dict | None = None):
    """earnings(surprises/beats/sue_z/next_date) + revisions + us_deep targets/rating → analysis.analyst.
    Fills target/target_low/target_high/upside_pct/rating + buy/hold/sell from us_deep when present;
    upside computed vs the site's last price (tech.price). Never crashes on a missing block."""
    earn = src.get("earnings") or {}
    rev = src.get("revisions") or {}
    val = src.get("valuation") or {}
    an = src.get("analyst") or {}
    summ = earn.get("summary") or {}
    surprises_raw = earn.get("surprises") or []

    # us_deep join (analyst.target=null in the site JSON — this is the one real US gap)
    targets = recs = None
    if ud:
        try:
            targets = json.loads(ud.get("targets_json")) if ud.get("targets_json") else None
        except Exception:
            targets = None
        try:
            recs = json.loads(ud.get("recs_json")) if ud.get("recs_json") else None
        except Exception:
            recs = None

    # rating distribution → buy/hold/sell + a rating label
    buy = hold = sell = None
    rating = rating_zh = None
    if recs:
        buy = (recs.get("strongBuy") or 0) + (recs.get("buy") or 0)
        hold = recs.get("hold") or 0
        sell = (recs.get("sell") or 0) + (recs.get("strongSell") or 0)
        if buy + hold + sell > 0:
            if (recs.get("strongBuy") or 0) >= buy * 0.5 and buy >= hold and buy >= sell:
                rating, rating_zh = "Strong buy", "强力买入"
            elif buy >= hold and buy > sell:
                rating, rating_zh = "Buy", "买入"
            elif sell > buy and sell >= hold:
                rating, rating_zh = "Sell", "卖出"
            else:
                rating, rating_zh = "Hold", "持有"

    # price targets + upside vs last price (site tech.price)
    tgt = tgt_low = tgt_high = upside = None
    if targets:
        tgt = _r(targets.get("mean") or targets.get("median"), 2)
        tgt_low = _r(targets.get("low"), 2)
        tgt_high = _r(targets.get("high"), 2)
        last = _r(g(src, "tech", "price")) or _r(targets.get("current"))
        if tgt is not None and last:
            upside = round((tgt - last) / last * 100, 1)

    # normalize earnings surprises to the {qtr, surprise_pct} shape the panel mini-grid reads
    surprises = None
    if surprises_raw:
        surprises = [{"qtr": s.get("qtr"), "eps": _r(s.get("eps"), 2),
                      "consensus": _r(s.get("consensus"), 2), "surprise_pct": _r(s.get("surprise_pct"), 1)}
                     for s in surprises_raw]

    have_any = bool(earn or rev or targets or recs or an)
    if not have_any:
        return None
    return {
        "next_date": earn.get("next_date"), "last_date": None,
        "rating": rating, "rating_zh": rating_zh,
        "n_analysts": _r(rev.get("n_analysts"), 0),
        "buy": buy, "hold": hold, "sell": sell,
        "eps_forecast": _r(earn.get("eps_forecast"), 2),
        "forward_pe": _r(val.get("forward_pe") or an.get("forward_pe"), 2),
        "target": tgt, "target_low": tgt_low, "target_high": tgt_high, "upside_pct": upside,
        "div_yield": _r(an.get("div_yield"), 2),
        # earnings-surprise / PEAD context (the CN/HK contract declares these fields, unused there)
        "beats": summ.get("beats"), "total": summ.get("total"),
        "avg_surprise": _r(summ.get("avg_surprise"), 1), "sue_z": _r(earn.get("sue_z"), 2),
        "surprises": surprises,
        # estimate-revision breadth (US-only extra context; panel guards each field)
        "revision_breadth": _r(rev.get("breadth"), 3),
        "est_chg_30d": _r(rev.get("est_chg_30d"), 2), "est_chg_90d": _r(rev.get("est_chg_90d"), 2),
    }


def build_flows_us(src: dict):
    """positioning.short → analysis.flows (US short-interest context; panel guards on flows fields)."""
    pos = src.get("positioning") or {}
    short = pos.get("short") if isinstance(pos.get("short"), dict) else {}
    sp = short.get("pct_float")
    if sp is None:
        return None
    return {"kind": "short", "short_pct": _r(sp, 2),
            "days_to_cover": _r(short.get("days_to_cover"), 1)}


def build_gex_us(src: dict):
    """gex → analysis.gex (dealer-gamma; deep-only section, panel guards on deep && a.gex)."""
    gx = src.get("gex") or {}
    if not gx or gx.get("gamma_flip") is None:
        return None
    vh = gx.get("vol_hole") if isinstance(gx.get("vol_hole"), dict) else {}
    return {
        "gamma_flip": _r(gx.get("gamma_flip"), 2), "dist_to_flip_pct": _r(gx.get("dist_to_flip_pct"), 2),
        "call_wall": _r(gx.get("call_wall"), 2), "put_wall": _r(gx.get("put_wall"), 2),
        "net_gex_bn": _r(gx.get("net_gex_bn"), 3), "iv30": _r(gx.get("iv30"), 4),
        "gamma_regime": gx.get("gamma_regime"),
        "vol_hole": ({"state": vh.get("state"), "band_width_pct": _r(vh.get("band_width_pct"), 1)} if vh else None),
    }


def build_macro_us(src: dict):
    """macro_sensitivity → analysis.macro (rate/duration/regime/inflation tiers; deep-only section)."""
    m = src.get("macro_sensitivity") or {}
    if not m:
        return None
    tier = m.get("tier_label") if isinstance(m.get("tier_label"), dict) else {}
    dur = m.get("duration_label") if isinstance(m.get("duration_label"), dict) else {}
    reg = m.get("regime_label") if isinstance(m.get("regime_label"), dict) else {}
    infl = m.get("inflation_label") if isinstance(m.get("inflation_label"), dict) else {}
    hl = m.get("headline") if isinstance(m.get("headline"), dict) else {}
    if not (tier.get("en") or hl.get("en")):
        return None
    return {
        "tier_en": tier.get("en"), "tier_zh": tier.get("zh"),
        "duration_en": dur.get("en"), "duration_zh": dur.get("zh"),
        "regime_en": reg.get("en"), "regime_zh": reg.get("zh"),
        "inflation_en": infl.get("en"), "inflation_zh": infl.get("zh"),
        "headline_en": hl.get("en"), "headline_zh": hl.get("zh"),
    }


def build_analysis(sym: str, src: dict, ud: dict | None = None) -> dict:
    """Assemble the full intel/v1 `analysis` block from a US site/stockdata dict + us_deep row.
    Each section is independently null-safe; a missing block yields None and simply doesn't render."""
    return {
        "decision": build_decision_us(src),
        "conviction": build_conviction_us(src),
        "entry": build_entry_us(src),
        "factors": build_factors_us(src),
        "tech": src.get("tech"),
        "valuation": build_valuation_us(src),
        "financials": build_financials_us(src),
        "profile": build_profile_us(src),
        "smart_money": build_smart_money_us(src),
        "analyst": build_analyst_us(src, ud),
        "flows": build_flows_us(src),
        "gex": build_gex_us(src),
        "macro": build_macro_us(src),
    }


def load_us_deep_map() -> dict:
    """ticker -> {targets_json, recs_json, asof} from us_deep.parquet (collect_us_deep.py output).
    {} if the parquet or pandas is unavailable — the bridge then emits analyst without targets."""
    try:
        import pandas as pd  # noqa: PLC0415
    except Exception:
        return {}
    p = MACRO / "data" / "tushare" / "us_deep.parquet"
    if not p.exists():
        return {}
    try:
        df = pd.read_parquet(p)
    except Exception:
        return {}
    out: dict = {}
    for r in df.to_dict("records"):
        t = str(r.get("ticker") or "")
        if t:
            out[t] = {k: (None if (v is None or (isinstance(v, float) and v != v)) else v)
                      for k, v in r.items()}
    return out


def build_intel(sym: str, src: dict, ud: dict | None = None) -> dict:
    """Map a Macro Dashboard stockdata dict → intel/v1 contract (tape + cards + analysis).

    The tape + cards output below is PRESERVED VERBATIM from the original bridge; the `analysis`
    block (build_analysis) is the new addition that lights up StockAnalysis.tsx for US names."""
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
        "name": src.get("name"),
        "sector": src.get("sector"),
        "market": "US",
        "tape": tape,
        "cards": {
            "ai_judgment": ai_judgment,
            "conviction": conviction_card,
            "levels": levels,
            "analyst": analyst_card,
            "smart_money": smart_money_card,
        },
        # NEW: the full analysis block StockAnalysis.tsx renders (was dark for US names before this).
        "analysis": build_analysis(sym, src, ud),
    }


def us_site_universe() -> list[str]:
    """Every US site/stockdata symbol (excludes CN/HK/TO which live in sibling stockdata dirs)."""
    out = []
    for f in glob.glob(str(MACRO_STOCKDATA / "*.json")):
        s = os.path.basename(f)[:-5]
        if s.endswith((".SS", ".SZ", ".HK", ".TO")):
            continue
        out.append(s)
    return sorted(out)


def _parse_args(argv: list[str]):
    """--all (every US site JSON), --only A,B,C, --limit N. Default = flagship DEFAULT set (back-compat)."""
    all_flag = "--all" in argv
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 0
    only = None
    if "--only" in argv:
        only = [s.strip() for s in argv[argv.index("--only") + 1].split(",") if s.strip()]
    # bare positional symbols (original CLI: `pull_macro_intel.py AAPL NVDA`)
    positional = []
    skip_next = False
    for i, a in enumerate(argv):
        if skip_next:
            skip_next = False
            continue
        if a in ("--only", "--limit"):
            skip_next = True
            continue
        if a.startswith("--"):
            continue
        positional.append(a)
    return all_flag, only, positional, limit


def main(argv: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    all_flag, only, positional, limit = _parse_args(argv)

    if only:
        syms = only
    elif positional:
        syms = positional
    elif all_flag:
        syms = us_site_universe()
    else:
        # back-compat: the original default iterated the 37 flagship DEFAULT/META equities
        syms = [s for s in DEFAULT if META.get(s, ("", "Equities", ""))[1] == "Equities"]
    if limit:
        syms = syms[:limit]

    ud_map = load_us_deep_map()
    print(f"pull_macro_intel: {len(syms)} US symbols "
          f"({'--all' if all_flag else '--only' if only else 'flagship'}), us_deep join={len(ud_map)}", flush=True)

    ok, skipped, failed = [], [], []
    n_analysis = n_targets = 0
    for sym in syms:
        src_path = MACRO_STOCKDATA / f"{sym}.json"
        if not src_path.exists():
            # graceful skip (e.g. crypto, or a manifest name with no site JSON)
            skipped.append(sym)
            continue
        try:
            with open(src_path) as f:
                src = json.load(f)
            intel = build_intel(sym, src, ud_map.get(sym))
            out_path = OUT / f"{sym}.intel.json"
            out_path.write_text(json.dumps(intel, separators=(",", ":"), ensure_ascii=False))
            a = intel.get("analysis") or {}
            if any(a.get(k) for k in a):
                n_analysis += 1
            if g(a, "analyst", "target") is not None:
                n_targets += 1
            ok.append(sym)
        except Exception as exc:
            print(f"  ERROR {sym}: {exc}", flush=True)
            failed.append(sym)
        if len(ok) % 200 == 0 and ok:
            print(f"  … {len(ok)} written", flush=True)

    print(f"\nDone: {len(ok)} written ({n_analysis} with analysis, {n_targets} with analyst targets), "
          f"{len(skipped)} skipped (no site JSON), {len(failed)} failed", flush=True)
    if skipped and len(skipped) <= 30:
        print(f"  Skipped: {skipped}")
    if failed:
        print(f"  Failed:  {failed}")


if __name__ == "__main__":
    main(sys.argv[1:])
