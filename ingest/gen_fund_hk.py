"""Emit <SYM>.fund.json (mastermind.fund/v1, BUILD-SPEC §1.1) for Hong Kong names.

Reads the per-ticker caches collect_cn_hk_fund.py writes to data/hk_fund/<SYM>.json:
    financials.{income,balance,cashflow}   akshare stock_financial_hk_report_em long-format
                                           (rows per REPORT_DATE, items keyed by STD_ITEM_CODE)
    yf                                      yfinance HK: financialCurrency, targets, rec-dist,
                                           estimates, stats, profile

JUDGE FIXES honoured:
  - quote_currency = "HKD" (trading currency); stmt_currency = yf.financialCurrency (often "CNY" for
    mainland-parented names like 0700.HK — NEVER assume HKD for the statements).
  - analyst / estimates from yfinance HK (not the unaudited hk_deep collector).
  - HK dividend: per-share dividend from the income-statement 每股股息 (004027004 / 004027001) row;
    the amount is stated per share in the statement currency.

akshare HK taxonomy (STD_ITEM_CODE → contract field), verified against 00700:
  income:   revenue=004001999(营运收入)|004001001(营业额); gross_profit=004007999(毛利);
            op_income=004010999(经营溢利); pretax=004011999; taxes=004012001; net=004025002(股东应占);
            eps_basic=004027002; eps_diluted=004027003; dps=004027004|004027001
  balance:  assets=004009999; assets_st=004002999; assets_lt=004001999; liab=004025999;
            liab_st=004011999; liab_lt=004020999; equity=004036999; cash=004002010;
            debt = 004011010(短期贷款)+004020001(长期贷款)
  cashflow: cfo=003999; cfi=005999; cff=007999; capex=005005(购建固定资产)

Merge-mode (default ON, --no-merge to disable): when the output <SYM>.fund.json already exists,
populated blocks in it survive a fresh run that would null them (statements when akshare returned
nothing, estimates/analyst/profile/stats fields when yfinance was rate-limited, dividend events).
Fresh non-null values always win. Mirrors gen_fund_cn.py's merge-mode (CN backfill pattern).

Usage:
    "<Macro Dashboard>/.venv/bin/python" ingest/gen_fund_hk.py [--only 0700.HK,0005.HK] [--limit N] \
        [--out <dir>] [--no-merge]        # default out = terminal/public/data
"""
from __future__ import annotations

import datetime as _dt
import json
import math
import os
import sys
from numbers import Integral, Real
from pathlib import Path

CA_ROOT = Path(__file__).resolve().parents[1]
MACRO = Path(os.environ.get("MACRO_REPO") or "/Users/chriswong/Documents/Cluade/Macro Dashboard")
HK_FUND = MACRO / "data" / "hk_fund"
DEFAULT_OUT = CA_ROOT / "terminal" / "public" / "data"

ASOF = __import__("datetime").date.today().strftime("%Y-%m-%d")

# akshare STD_ITEM_CODE taxonomy
INC = {"revenue": ("004001999", "004001001"), "gross_profit": ("004007999",),
       "op_income": ("004010999",), "pretax": ("004011999",), "taxes": ("004012001",),
       "net": ("004025002", "004012999"), "eps_basic": ("004027002",), "eps_diluted": ("004027003",),
       "dps": ("004027004", "004027001"), "opex": ("004005001",)}
BAL = {"assets": ("004009999",), "assets_st": ("004002999",), "assets_lt": ("004001999",),
       "liab": ("004025999",), "liab_st": ("004011999",), "liab_lt": ("004020999",),
       "equity": ("004036999", "004030999"), "cash": ("004002010",),
       "st_debt": ("004011010",), "lt_debt": ("004020001",)}
CF = {"cfo": ("003999",), "cfi": ("005999",), "cff": ("007999",), "capex": ("005005",)}

# 001=annual(Dec) 002=H1(Jun) 003=Q1(Mar) 004=Q3(Sep) — akshare DATE_TYPE_CODE
_ANNUAL_TYPE = "001"


def _f(v):
    if v is None:
        return None
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def _json_safe(value):
    """Recursively normalize numpy/Python numerics and replace non-finite values with null."""
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, Integral):
        return int(value)
    if isinstance(value, Real):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def strict_json_dumps(value) -> str:
    """Emit browser-valid JSON and fail closed if a non-finite value escapes normalization."""
    return json.dumps(
        _json_safe(value),
        separators=(",", ":"),
        ensure_ascii=False,
        sort_keys=False,
        allow_nan=False,
    )


def _pick(items: dict, codes) -> float | None:
    for c in codes:
        v = items.get(c)
        if v is not None:
            return _f(v)
    return None


def _div_yield_frac(yf: dict):
    """UNIT RULING: yfinance 1.4.1 reports dividendYield in PERCENT form (3.92 == 3.92%). The
    fund.json contract stores div_yield/yield_ttm as a 0..1 FRACTION → divide the percent-form by 100."""
    v = _f((yf or {}).get("div_yield"))
    return v / 100.0 if v is not None else None


def _q_label(end: str) -> str:
    q = {"03": 1, "06": 2, "09": 3, "12": 4}.get(end[5:7])
    return f"Q{q} {end[:4]}" if q else end[:4]


# ─────────────────────────────── statement assembly ───────────────────────────────
def _income_block(rows: list[dict]) -> dict:
    def col(field):
        return [_pick(r["inc"], INC[field]) for r in rows]
    revenue = col("revenue")
    gross = col("gross_profit")
    # opex is not cleanly separable in the HK long-format taxonomy → null; cogs derived as revenue−gross
    return {
        "revenue": revenue,
        "cogs": [(rv - gp) if (rv is not None and gp is not None) else None for rv, gp in zip(revenue, gross)],
        "gross_profit": gross,
        "opex": [None] * len(rows),
        "op_income": col("op_income"),
        "nonop_income": [None] * len(rows),
        "pretax_income": col("pretax"),
        "taxes": col("taxes"),
        "net_income": col("net"),
        "eps_basic": col("eps_basic"),
        "eps_diluted": col("eps_diluted"),
        "ebitda": [None] * len(rows),
    }


def _balance_block(rows: list[dict]) -> dict:
    def col(field):
        return [_pick(r["bal"], BAL[field]) for r in rows]
    cash = col("cash")
    st = col("st_debt")
    lt = col("lt_debt")
    debt = []
    for s, l in zip(st, lt):
        parts = [x for x in (s, l) if x is not None]
        debt.append(sum(parts) if parts else None)
    net_debt = [(d - c) if (d is not None and c is not None) else None for d, c in zip(debt, cash)]
    return {
        "assets": col("assets"), "assets_st": col("assets_st"), "assets_lt": col("assets_lt"),
        "liabilities": col("liab"), "liab_st": col("liab_st"), "liab_lt": col("liab_lt"),
        "equity": col("equity"), "debt": debt, "cash": cash, "net_debt": net_debt,
    }


def _cashflow_block(rows: list[dict]) -> dict:
    def col(field):
        return [_pick(r["cf"], CF[field]) for r in rows]
    cfo = col("cfo")
    capex = col("capex")
    fcf = [(o + c) if (o is not None and c is not None) else None for o, c in zip(cfo, capex)]
    # capex in HK cashflow is stated as a negative outflow already; FCF = CFO + capex
    return {"cfo": cfo, "cfi": col("cfi"), "cff": col("cff"), "capex": capex, "fcf": fcf}


def _assemble(rows: list[dict], labeler) -> dict | None:
    if not rows:
        return None
    rows = sorted(rows, key=lambda r: r["end"])
    return {
        "periods": [labeler(r["end"]) for r in rows],
        "period_end": [r["end"] for r in rows],
        "income": _income_block(rows),
        "balance": _balance_block(rows),
        "cashflow": _cashflow_block(rows),
    }


def _merge_rows(fin: dict) -> dict:
    """Group income/balance/cashflow by REPORT_DATE. STD_ITEM_CODE is NOT unique across statements
    (e.g. 004001999 = 营运收入 in income but 非流动资产合计 in balance), so the three statements'
    item dicts are kept in separate namespaces (inc/bal/cf) — never merged into one dict."""
    merged: dict[str, dict] = {}
    slot = {"income": "inc", "balance": "bal", "cashflow": "cf"}
    for kind, key in slot.items():
        for r in fin.get(kind) or []:
            end = r.get("end")
            if not end:
                continue
            rec = merged.setdefault(end, {"end": end, "date_type": None, "inc": {}, "bal": {}, "cf": {}})
            rec[key] = r.get("items") or {}
            # prefer the income statement's date_type (the canonical annual/quarterly flag)
            if rec["date_type"] is None or kind == "income":
                rec["date_type"] = r.get("date_type")
    return merged


def build_statements(fin: dict) -> dict:
    merged = _merge_rows(fin)
    rows = sorted(merged.values(), key=lambda r: r["end"])
    annual = [r for r in rows if r.get("date_type") == _ANNUAL_TYPE][-6:]
    quarterly = rows[-12:]
    return {
        "annual": _assemble(annual, lambda e: e[:4]),
        "quarterly": _assemble(quarterly, _q_label),
    }


# ─────────────────────────────── yfinance-derived sections ───────────────────────────────
_REC_LABEL = {"strong_buy": "Strong buy", "buy": "Buy", "hold": "Hold", "sell": "Sell",
              "strong_sell": "Strong sell", "underperform": "Sell", "outperform": "Buy"}


def build_analyst(yf: dict) -> dict | None:
    if not yf:
        return None
    dist = yf.get("rec_dist") or {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0}
    tm = yf.get("target_mean")
    if not any(dist.values()) and tm is None:
        return None
    return {
        "dist": dist,
        "rating_label": _REC_LABEL.get(str(yf.get("rec_key") or "").lower()),
        "target": {"mean": tm, "high": yf.get("target_high"), "low": yf.get("target_low"),
                   "n": yf.get("n_analysts")},
    }


def _latest_annual_year(fin: dict) -> int | None:
    """Newest completed fiscal-year (Dec-31 / DATE_TYPE 001) from the income statement, as an int."""
    best = None
    for r in (fin or {}).get("income") or []:
        if r.get("date_type") == _ANNUAL_TYPE:
            end = str(r.get("end") or "")
            if len(end) >= 4 and end[:4].isdigit():
                y = int(end[:4])
                if best is None or y > best:
                    best = y
    return best


def _fy_periods(fin: dict, yf: dict) -> list[str]:
    """Real fiscal-year labels for estimates [0y, +1y]. HK filers are Dec-end: 0y = the fiscal year
    currently in progress = latest completed FY + 1; +1y = the year after. Derive the base from the
    newest annual statement, falling back to next_earnings' calendar year."""
    base = _latest_annual_year(fin)
    if base is None:
        ne = str((yf or {}).get("next_earnings") or "")
        if len(ne) >= 4 and ne[:4].isdigit():
            base = int(ne[:4]) - 1
    if base is None:
        return ["0y", "+1y"]   # last resort: keep placeholders rather than emit wrong years
    fy0 = base + 1
    return [str(fy0), str(fy0 + 1)]


def _q_periods(fin: dict, yf: dict) -> list[str]:
    """Real quarter labels for eps_q [0q, +1q]. The next earnings date reports the quarter that
    closed ~35 days earlier (Dec-end filer → calendar quarter); +1q is the following quarter."""
    ne = str((yf or {}).get("next_earnings") or "")
    try:
        d = _dt.date.fromisoformat(ne[:10])
    except Exception:
        return ["0q", "+1q"]
    reported = d - _dt.timedelta(days=35)     # snap back to the reported quarter-end
    m0 = reported.month
    q0 = (m0 - 1) // 3 + 1
    y0 = reported.year
    q1 = q0 + 1
    y1 = y0
    if q1 > 4:
        q1, y1 = 1, y0 + 1
    return [f"Q{q0} '{y0 % 100:02d}", f"Q{q1} '{y1 % 100:02d}"]


def build_estimates(yf: dict, fin: dict | None = None) -> dict | None:
    if not yf:
        return None
    fin = fin or {}
    ee = yf.get("eps_est") or {}
    re_ = yf.get("rev_est") or {}
    # yfinance index labels: 0q,+1q,0y,+1y
    def row(src, keys):
        avg, high, low, n = [], [], [], []
        for k in keys:
            d = src.get(k) or {}
            avg.append(_f(d.get("avg")))
            high.append(_f(d.get("high")))
            low.append(_f(d.get("low")))
            n.append(_f(d.get("numberOfAnalysts")))
        return {"avg": avg, "high": high, "low": low, "n": n}
    eps_fy = row(ee, ["0y", "+1y"])
    rev_fy = row(re_, ["0y", "+1y"])
    eps_q = row(ee, ["0q", "+1q"])
    if not (any(eps_fy["avg"]) or any(rev_fy["avg"]) or any(eps_q["avg"])):
        return None
    fy_periods = _fy_periods(fin, yf)
    q_periods = _q_periods(fin, yf)
    return {
        "eps_fy": {"periods": list(fy_periods), **eps_fy},
        "rev_fy": {"periods": list(fy_periods), **rev_fy},
        "eps_q": {"periods": list(q_periods), **eps_q},
        "growth": {"rev_yoy": _f(yf.get("rev_growth")), "eps_yoy": _f(yf.get("eps_growth"))},
    }


def build_stats(yf: dict) -> dict:
    return {"mktcap": yf.get("mktcap"), "shares_out": yf.get("shares_out"),
            "float_shares": yf.get("float_shares"),
            "inst_pct": yf.get("held_inst_pct"), "insider_pct": yf.get("held_insider_pct"),
            "beta": yf.get("beta"), "num_holders": None}


def build_ratios(yf: dict, annual) -> dict:
    cur = {"pe_ttm": yf.get("trailing_pe"), "pe_fwd": yf.get("forward_pe"), "ps": yf.get("ps"),
           "pb": yf.get("pb"), "ev_ebitda": None, "div_yield": _div_yield_frac(yf),
           "payout": yf.get("payout_ratio"),
           "gross_margin": _pctize(yf.get("gross_margin")), "net_margin": _pctize(yf.get("net_margin")),
           "roe": _pctize(yf.get("roe")), "roa": _pctize(yf.get("roa")),
           "debt_to_equity": None, "current_ratio": None}
    if annual and annual.get("balance"):
        b = annual["balance"]

        def last(k):
            v = b.get(k)
            return v[-1] if isinstance(v, list) and v and v[-1] is not None else None
        ast, lst = last("assets_st"), last("liab_st")
        if ast and lst:
            cur["current_ratio"] = round(ast / lst, 2)
        debt, eq = last("debt"), last("equity")
        if debt is not None and eq:
            cur["debt_to_equity"] = round(debt / eq, 2)
    periods = (annual or {}).get("periods") or []
    empty = [None] * len(periods)   # null-pad per-period series to len(periods) (contract §1.1)
    return {"periods": periods, "pe": list(empty), "ps": list(empty), "pb": list(empty),
            "pcf": list(empty), "ev": list(empty), "ev_ebitda": list(empty), "current": cur}


def _pctize(v):
    """yfinance margins/roe are decimals (0.31); contract wants percent (31.0)."""
    return round(v * 100, 2) if isinstance(v, (int, float)) else None


def _hk_never_paid(fin: dict, yf: dict, events: list) -> bool:
    """A HK name is a dividend payer if it has ANY of: DPS events from the statement, a positive
    yfinance dividend yield, or a yfinance dividends history. The income-statement 每股股息 row is
    often empty for financials (e.g. 0005.HK/HSBC) even though they pay — so don't rely on it alone."""
    if events:
        return False
    dy = _f((yf or {}).get("div_yield"))
    if dy is not None and dy > 0:
        return False
    hist = (yf or {}).get("dividends") or (yf or {}).get("div_history")
    if isinstance(hist, (list, dict)) and len(hist) > 0:
        return False
    return True


def build_dividends(fin: dict, yf: dict) -> dict:
    """Per-share dividend from the income-statement 每股股息 row, oldest→newest."""
    events = []
    for r in sorted(fin.get("income") or [], key=lambda x: x.get("end") or ""):
        dps = _pick(r.get("items") or {}, INC["dps"])
        if dps and dps > 0 and r.get("date_type") == _ANNUAL_TYPE:
            events.append({"ex": r["end"], "amount": round(dps, 6), "pay": None, "type": "regular"})
    return {"never_paid": _hk_never_paid(fin, yf, events), "yield_ttm": _div_yield_frac(yf),
            "payout_ratio": yf.get("payout_ratio"), "events": events, "splits": []}


def build_profile(yf: dict) -> dict:
    return {"website": yf.get("website"), "employees": yf.get("employees"),
            "sector": yf.get("sector"), "industry": yf.get("industry"),
            "description": yf.get("description"), "founded": None, "hq": None}


def build_earnings(yf: dict, annual: dict | None = None) -> dict:
    """fy actuals from the akshare annual statements (last 5 FY eps_basic/revenue — same shape as
    gen_fund_cn). q stays empty: HK filers report semi-annually, so quarterly differencing would
    mislabel H1/H2 as quarters."""
    fy = []
    if annual:
        periods = annual.get("periods") or []
        inc = annual.get("income") or {}
        eps_l = inc.get("eps_basic") or []
        rev_l = inc.get("revenue") or []
        n = len(periods)
        eps_l = (eps_l + [None] * n)[:n]
        rev_l = (rev_l + [None] * n)[:n]
        for i in range(max(0, n - 5), n):
            eps_v, rev_v = _f(eps_l[i]), _f(rev_l[i])
            if eps_v is None and rev_v is None:
                continue
            fy.append({"period": periods[i],
                       "eps_a": round(eps_v, 4) if eps_v is not None else None,
                       "rev_a": round(rev_v) if rev_v is not None else None,
                       "eps_e": None, "rev_e": None, "surp_pct": None})
    return {"next_date": yf.get("next_earnings"), "next_period": None,
            "next_eps_est": yf.get("eps_next_avg"), "next_rev_est": yf.get("rev_next_avg"),
            "q": [], "fy": fy}


def build_ownership(yf: dict) -> dict:
    """free_float_pct = floatShares/sharesOutstanding as a 0..1 fraction (same derivation and
    units as gen_fund_us.build_ownership); closely_held_pct = yf heldPercentInsiders (already a
    fraction). No HK 13F-equivalent → top_inst stays an honest empty list."""
    fs = _f(yf.get("float_shares"))
    so = _f(yf.get("shares_out"))
    free_float = round(fs / so, 4) if (fs and so) else None
    return {"free_float_pct": free_float, "closely_held_pct": _f(yf.get("held_insider_pct")),
            "top_inst": []}


# ─────────────────────────────── emitter ───────────────────────────────
def build_fund(sym: str, rec: dict) -> dict:
    fin = rec.get("financials") or {}
    yf = rec.get("yf") or {}
    statements = build_statements(fin)
    annual = statements.get("annual")
    stmt_ccy = yf.get("financial_currency") or "HKD"   # judge: often CNY for mainland-parented HK names
    return {
        "schema": "mastermind.fund/v1",
        "ticker": sym, "asof": ASOF,
        "quote_currency": yf.get("currency") or "HKD",
        "stmt_currency": stmt_ccy,
        "src": {"statements": "akshare",
                "estimates": "yfinance" if (yf.get("eps_est") or yf.get("rev_est")) else None,
                "dividends": "akshare"},
        "profile": build_profile(yf),
        "stats": build_stats(yf),
        "statements": {"annual": annual, "quarterly": statements.get("quarterly")},
        "ratios": build_ratios(yf, annual),
        "earnings": build_earnings(yf, annual),
        "estimates": build_estimates(yf, fin),
        "analyst": build_analyst(yf),
        "dividends": build_dividends(fin, yf),
        "ownership": build_ownership(yf),
        "guidance": None,
        "segments": None,
    }


# ─────────────────────────────── merge-mode (mirrors gen_fund_cn.py) ───────────────────────────────
def _nonempty(v) -> bool:
    """True when a JSON value is meaningfully non-null/non-empty."""
    if v is None:
        return False
    if isinstance(v, (list, dict)):
        return len(v) > 0
    return True


def _merge_fund(fresh: dict, existing: dict) -> dict:
    """Preserve populated blocks from the existing fund.json when the fresh run nulls them
    (akshare returned nothing → keep statements; yfinance rate-limited → keep estimates/analyst
    and per-field profile/stats/ratios.current/earnings/ownership). Fresh non-null always wins;
    asof is always today."""
    merged = dict(fresh)
    merged["asof"] = ASOF

    fresh_stmts = fresh.get("statements") or {}
    if not _nonempty(fresh_stmts.get("annual")) and not _nonempty(fresh_stmts.get("quarterly")):
        if _nonempty(existing.get("statements")):
            merged["statements"] = existing["statements"]

    # whole-block: fresh wins when present, else preserve existing
    for key in ("estimates", "analyst", "guidance", "segments"):
        if merged.get(key) is None and existing.get(key) is not None:
            merged[key] = existing[key]

    # field-level: fresh non-null overrides, existing fills the nulls
    for blk in ("profile", "stats", "earnings", "ownership"):
        f = fresh.get(blk) or {}
        e = existing.get(blk) or {}
        m = dict(e)
        for k, v in f.items():
            if _nonempty(v):
                m[k] = v
        merged[blk] = m or (fresh.get(blk) if fresh.get(blk) is not None else existing.get(blk))

    # ratios: preserve period series when fresh has none; merge the current snapshot per-field
    fr = fresh.get("ratios") or {}
    er = existing.get("ratios") or {}
    mr = dict(fr)
    if not _nonempty(fr.get("periods")):
        for k in ("periods", "pe", "ps", "pb", "pcf", "ev", "ev_ebitda"):
            if _nonempty(er.get(k)):
                mr[k] = er[k]
    mc = dict(er.get("current") or {})
    for k, v in (fr.get("current") or {}).items():
        if v is not None:
            mc[k] = v
    mr["current"] = mc
    merged["ratios"] = mr

    # dividends: preserve existing when it has events and fresh does not
    fresh_div = fresh.get("dividends") or {}
    if not _nonempty(fresh_div.get("events")) and _nonempty((existing.get("dividends") or {}).get("events")):
        merged["dividends"] = existing["dividends"]

    src = dict(existing.get("src") or {})
    src.update({k: v for k, v in (fresh.get("src") or {}).items() if v is not None})
    merged["src"] = src
    return merged


def hk_universe() -> list[str]:
    return sorted(p.name[:-5] for p in HK_FUND.glob("*.json"))


def _arg(argv, flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


def atomic_write(dest: Path, text: str) -> None:
    """Write via tmp+rename so a kill mid-write never leaves a truncated fund.json."""
    tmp = dest.with_name(dest.name + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, dest)


def normalize_existing_artifacts(out_dir: Path, skip: set[Path] | None = None) -> tuple[int, int]:
    """Repair strict JSON in output-only HK artifacts without discarding their production data."""
    normalized = errors = 0
    skipped = skip or set()
    for dest in sorted(out_dir.glob("*.HK.fund.json")):
        if dest in skipped:
            continue
        try:
            atomic_write(dest, strict_json_dumps(json.loads(dest.read_text())))
            normalized += 1
        except Exception as exc:  # noqa: BLE001
            errors += 1
            if errors <= 20:
                print(f"  ERR normalize {dest.name}: {exc}", flush=True)
    return normalized, errors


def main(argv: list[str]) -> None:
    only = _arg(argv, "--only")
    limit = int(_arg(argv, "--limit", 0) or 0)
    out_dir = Path(_arg(argv, "--out", str(DEFAULT_OUT)))
    no_merge = "--no-merge" in argv
    out_dir.mkdir(parents=True, exist_ok=True)

    syms = ([s.strip() for s in only.split(",")] if only else hk_universe())
    syms = [s if s.endswith(".HK") else s + ".HK" for s in syms]
    if limit:
        syms = syms[:limit]

    ok = err = miss = merged_n = 0
    written: set[Path] = set()
    for sym in syms:
        cache = HK_FUND / f"{sym}.json"
        if not cache.exists():
            miss += 1
            continue
        try:
            rec = json.loads(cache.read_text())
            fund = build_fund(sym, rec)
            dest = out_dir / f"{sym}.fund.json"
            if not no_merge and dest.exists():
                try:
                    fund = _merge_fund(fund, json.loads(dest.read_text()))
                    merged_n += 1
                except Exception:
                    pass   # unreadable existing → plain fresh write
            atomic_write(dest, strict_json_dumps(fund))
            written.add(dest)
            ok += 1
        except Exception as exc:   # noqa: BLE001
            err += 1
            if err <= 20:
                print(f"  ERR {sym}: {exc}", flush=True)
    normalized_n, normalize_errors = normalize_existing_artifacts(out_dir, written)
    err += normalize_errors
    print(f"gen_fund_hk: {ok} written ({merged_n} merge-mode), "
          f"{normalized_n} output-only normalized, {err} errors, {miss} missing cache → {out_dir}",
          flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
