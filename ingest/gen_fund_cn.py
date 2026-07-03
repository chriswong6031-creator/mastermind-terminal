"""Emit <SYM>.fund.json (mastermind.fund/v1, BUILD-SPEC §1.1) for CN A-shares.

Joins the parquets collect_cn_hk_fund.py + collect_cn_deep.py write:
    stmt_income/balance/cashflow.parquet   full whole-market statements, keyed (ts_code, end_date)
    valuation.parquet                      daily_basic snapshot (pe/pb/ps/dv + mktcap)
    daily_basic.parquet                    shares_out / float_shares / mktcap
    financials.parquet                     fina-indicator margins/roe/growth + multiyear series
    dividends.parquet                      per-ticker cash-dividend history
    forecast.parquet                       forecast_vip guidance (预增/预减 …) — §1.1 guidance field
    holders.parquet                        top10 float holders → ownership

CRITICAL judge rulings honoured:
  - gross_profit = total_revenue − oper_cost (营业成本), NOT total_cogs (营业总成本 bundles selling/
    admin/finance and differs by ~40B for Moutai). opex = total_cogs − oper_cost best-effort.
  - quote_currency = stmt_currency = "CNY".
  - analyst = null, estimates = null (no A-share street consensus — R5). guidance carries company
    forecast_vip guidance instead.
  - Annual periods come from Dec-31 (mmdd == 1231) statement rows; quarterly from the four quarter-ends.

Terminal ↔ Tushare symbol mapping: terminal uses .SS (Shanghai); Tushare uses .SH. Handled both ways.

Usage:
    "<Macro Dashboard>/.venv/bin/python" ingest/gen_fund_cn.py [--only 600519.SS,000001.SZ] [--limit N] \
        [--out <dir>]        # default out = terminal/public/data
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

CA_ROOT = Path(__file__).resolve().parents[1]
MACRO = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard")
TU = MACRO / "data" / "tushare"
CN_SITE = MACRO / "site" / "chinastockdata"
DEFAULT_OUT = CA_ROOT / "terminal" / "public" / "data"

ASOF = pd.Timestamp.today().strftime("%Y-%m-%d")


# ─────────────────────────────── symbol mapping ───────────────────────────────
def term_to_ts(sym: str) -> str:
    """terminal 600519.SS → tushare 600519.SH; .SZ unchanged."""
    return sym[:-3] + ".SH" if sym.endswith(".SS") else sym


def ts_to_term(code: str) -> str:
    return code[:-3] + ".SS" if code.endswith(".SH") else code


def _f(v):
    if v is None:
        return None
    try:
        x = float(v)
        return None if x != x else x
    except (TypeError, ValueError):
        return None


def _num(row, key):
    return _f(row.get(key)) if isinstance(row, dict) else None


# ─────────────────────────────── parquet loaders ───────────────────────────────
def _read(name: str):
    p = TU / name
    if not p.exists():
        return None
    try:
        return pd.read_parquet(p)
    except Exception:
        return None


def load_statements() -> dict:
    """{ts_code: {end_date: row}} per statement kind."""
    out = {}
    for kind in ("income", "balance", "cashflow"):
        df = _read(f"stmt_{kind}.parquet")
        d: dict = {}
        if df is not None:
            for r in df.to_dict("records"):
                code = str(r.get("ts_code") or "")
                end = str(r.get("end_date") or "")
                if code and end:
                    d.setdefault(code, {})[end] = r
        out[kind] = d
    return out


def load_map(name: str, key_col: str) -> dict:
    df = _read(name)
    out: dict = {}
    if df is None:
        return out
    for r in df.to_dict("records"):
        k = str(r.get(key_col) or "")
        if k:
            out[k] = r
    return out


def load_dividends() -> dict:
    df = _read("dividends.parquet")
    out: dict = {}
    if df is None:
        return out
    for r in df.to_dict("records"):
        code = str(r.get("ts_code") or "")
        if not code:
            continue
        try:
            out[code] = json.loads(r.get("events_json") or "[]")
        except Exception:
            out[code] = []
    return out


def load_forecast() -> dict:
    """ts_code(terminal .SS) → latest guidance row from forecast.parquet."""
    df = _read("forecast.parquet")
    out: dict = {}
    if df is None:
        return out
    for r in df.to_dict("records"):
        tk = str(r.get("ticker") or "")
        if not tk:
            continue
        cur = out.get(tk)
        if cur is None or str(r.get("ann_date") or "") > str(cur.get("ann_date") or ""):
            out[tk] = r
    return out


def load_holders() -> dict:
    df = _read("holders.parquet")
    out: dict = {}
    if df is None or "holders_json" not in getattr(df, "columns", []):
        return out
    for r in df.to_dict("records"):
        code = str(r.get("ts_code") or "")
        if not code:
            continue
        try:
            out[code] = json.loads(r.get("holders_json") or "[]")
        except Exception:
            out[code] = []
    return out


# ─────────────────────────────── statement assembly ───────────────────────────────
def _period_label_annual(end: str) -> str:
    return end[:4]


def _period_label_q(end: str) -> str:
    q = {"03": 1, "06": 2, "09": 3, "12": 4}.get(end[4:6])
    return f"Q{q} {end[:4]}" if q else end[:4]


def _income_block(rows: list[dict]) -> dict:
    """rows = list of income statement dicts oldest→newest. Judge cost-basis ruling applied."""
    def col(key):
        return [_num(r, key) for r in rows]

    total_rev = col("total_revenue")
    revenue = col("revenue")
    oper_cost = col("oper_cost")     # 营业成本 — the correct COGS for gross margin (judge ruling)
    total_cogs = col("total_cogs")   # 营业总成本 — bundles selling/admin/finance; NOT for gross margin

    gross_profit, opex = [], []
    for tr, oc, tc in zip(total_rev, oper_cost, total_cogs):
        gp = (tr - oc) if (tr is not None and oc is not None) else None
        gross_profit.append(gp)
        # opex best-effort: total operating cost minus pure cost of goods
        opex.append((tc - oc) if (tc is not None and oc is not None) else None)

    return {
        "revenue": [tr if tr is not None else rv for tr, rv in zip(total_rev, revenue)],
        "cogs": oper_cost,
        "gross_profit": gross_profit,
        "opex": opex,
        "op_income": col("operate_profit"),
        "nonop_income": [None] * len(rows),
        "pretax_income": col("total_profit"),
        "taxes": col("income_tax"),
        "net_income": col("n_income_attr_p"),
        "eps_basic": col("basic_eps"),
        "eps_diluted": col("diluted_eps"),
        "ebitda": col("ebitda"),
    }


def _balance_block(rows: list[dict]) -> dict:
    def col(key):
        return [_num(r, key) for r in rows]

    st_borr = col("st_borr")
    lt_borr = col("lt_borr")
    bond = col("bond_payable")
    cash = col("money_cap")
    debt = []
    for s, l, b in zip(st_borr, lt_borr, bond):
        parts = [x for x in (s, l, b) if x is not None]
        debt.append(sum(parts) if parts else None)
    net_debt = [(d - c) if (d is not None and c is not None) else None for d, c in zip(debt, cash)]
    return {
        "assets": col("total_assets"),
        "assets_st": col("total_cur_assets"),
        "assets_lt": col("total_nca"),
        "liabilities": col("total_liab"),
        "liab_st": col("total_cur_liab"),
        "liab_lt": col("total_ncl"),
        "equity": col("total_hldr_eqy_inc_min_int"),
        "debt": debt,
        "cash": cash,
        "net_debt": net_debt,
    }


def _cashflow_block(rows: list[dict]) -> dict:
    def col(key):
        return [_num(r, key) for r in rows]

    cfo = col("n_cashflow_act")
    capex = col("c_pay_acq_const_fiolta")
    fcf_col = col("free_cashflow")
    fcf = []
    for f, o, c in zip(fcf_col, cfo, capex):
        if f is not None:
            fcf.append(f)
        elif o is not None and c is not None:
            fcf.append(o - c)   # capex is a positive outflow figure
        else:
            fcf.append(None)
    return {
        "cfo": cfo,
        "cfi": col("n_cashflow_inv_act"),
        "cff": col("n_cash_flows_fnc_act"),
        "capex": [(-c if c is not None else None) for c in capex],   # sign as outflow
        "fcf": fcf,
    }


def _assemble_period(stmts: dict, code: str, ends: list[str], labeler) -> dict | None:
    """Build one {periods, period_end, income, balance, cashflow} block for the given end-dates."""
    inc = stmts["income"].get(code, {})
    bal = stmts["balance"].get(code, {})
    cf = stmts["cashflow"].get(code, {})
    ends = [e for e in ends if e in inc or e in bal or e in cf]
    if not ends:
        return None
    ends = sorted(ends)          # oldest→newest
    inc_rows = [inc.get(e, {}) for e in ends]
    bal_rows = [bal.get(e, {}) for e in ends]
    cf_rows = [cf.get(e, {}) for e in ends]
    return {
        "periods": [labeler(e) for e in ends],
        "period_end": [f"{e[:4]}-{e[4:6]}-{e[6:8]}" for e in ends],
        "income": _income_block(inc_rows),
        "balance": _balance_block(bal_rows),
        "cashflow": _cashflow_block(cf_rows),
    }


def build_statements(stmts: dict, code: str) -> dict:
    inc = stmts["income"].get(code, {})
    bal = stmts["balance"].get(code, {})
    cf = stmts["cashflow"].get(code, {})
    all_ends = sorted(set(inc) | set(bal) | set(cf))
    annual_ends = [e for e in all_ends if e[4:8] == "1231"][-6:]
    q_ends = all_ends[-12:]
    return {
        "annual": _assemble_period(stmts, code, annual_ends, _period_label_annual),
        "quarterly": _assemble_period(stmts, code, q_ends, _period_label_q),
    }


# ─────────────────────────────── other sections ───────────────────────────────
def build_ratios(vrow, frow, annual) -> dict:
    """current live ratios from daily_basic; annual pe/ps/pb series unavailable (single snapshot)."""
    cur = {"pe_ttm": None, "pe_fwd": None, "ps": None, "pb": None, "ev_ebitda": None,
           "div_yield": None, "payout": None, "gross_margin": None, "net_margin": None,
           "roe": None, "roa": None, "debt_to_equity": None, "current_ratio": None}
    if vrow:
        cur["pe_ttm"] = _num(vrow, "pe_ttm") if _num(vrow, "pe_ttm") is not None else _num(vrow, "pe")
        cur["ps"] = _num(vrow, "ps_ttm")
        cur["pb"] = _num(vrow, "pb")
        cur["div_yield"] = _num(vrow, "dv_ttm")
    if frow:
        gms = frow.get("gross_margin_series")
        cur["gross_margin"] = _f(frow.get("gross_margin")) if frow.get("gross_margin") is not None else (
            _f(gms[-1]) if isinstance(gms, (list, tuple)) and len(gms) else None)
        cur["net_margin"] = _f(frow.get("net_margin"))
        cur["roe"] = _f(frow.get("roe"))
    # derive current_ratio & debt/equity from latest annual balance
    if annual and annual.get("balance"):
        b = annual["balance"]

        def last(key):
            v = b.get(key)
            return v[-1] if isinstance(v, list) and v and v[-1] is not None else None
        ast, lst = last("assets_st"), last("liab_st")
        if ast and lst:
            cur["current_ratio"] = round(ast / lst, 2)
        debt, eq = last("debt"), last("equity")
        if debt is not None and eq:
            cur["debt_to_equity"] = round(debt / eq, 2)
    return {"periods": (annual or {}).get("periods") or [],
            "pe": [], "ps": [], "pb": [], "pcf": [], "ev": [], "ev_ebitda": [], "current": cur}


def build_stats(vrow, dbrow) -> dict:
    def yi_to_raw(v):   # valuation.parquet mktcap is in 亿元 (1e8)
        return round(v * 1e8) if v is not None else None
    mktcap = shares = flt = beta = None
    if dbrow:   # daily_basic: total_mv/circ_mv in 万元 (1e4); total_share/float_share in 万股 (1e4)
        mktcap = round(_num(dbrow, "total_mv") * 1e4) if _num(dbrow, "total_mv") else None
        shares = round(_num(dbrow, "total_share") * 1e4) if _num(dbrow, "total_share") else None
        flt = round(_num(dbrow, "float_share") * 1e4) if _num(dbrow, "float_share") else None
    if mktcap is None and vrow:
        mktcap = yi_to_raw(_num(vrow, "total_mv_yi"))
    return {"mktcap": mktcap, "shares_out": shares, "float_shares": flt, "inst_pct": None,
            "insider_pct": None, "beta": beta, "num_holders": None}


def build_dividends(events: list) -> dict:
    events = events or []
    yr = None
    if events:
        # trailing 12m sum of amounts
        last_ex = events[-1]["ex"]
        if last_ex:
            cutoff = f"{int(last_ex[:4]) - 1}{last_ex[4:]}"
            yr = round(sum(e["amount"] for e in events if e["ex"] and e["ex"] >= cutoff), 4)
    return {"never_paid": len(events) == 0, "yield_ttm": None, "payout_ratio": None,
            "events": [{"ex": e["ex"], "amount": e["amount"], "pay": e.get("pay"),
                        "type": e.get("type", "regular")} for e in events],
            "splits": [], "_ttm_amount": yr}


def build_guidance(frow) -> dict | None:
    if not frow:
        return None
    return {"type": frow.get("type"),
            "chg_min": _f(frow.get("p_change_min")), "chg_max": _f(frow.get("p_change_max")),
            "period": str(frow.get("end_date") or "")}


def build_ownership(holders: list) -> dict:
    top = []
    for h in (holders or [])[:10]:
        top.append({"name": h.get("name"), "pct": _f(h.get("ratio")), "value": None})
    return {"free_float_pct": None, "closely_held_pct": None, "top_inst": top}


def build_profile(src: dict) -> dict:
    fu = src.get("fundamentals") or {}
    d = fu.get("description")
    desc = d.get("main_business") if isinstance(d, dict) else d
    return {"website": None, "employees": None, "sector": src.get("sector"),
            "industry": None, "description": desc, "founded": None, "hq": None}


# ─────────────────────────────── emitter ───────────────────────────────
def build_fund(sym: str, src: dict, stmts, vmap, dbmap, fmap, divmap, fcmap, hmap) -> dict:
    code = term_to_ts(sym)          # tushare code (.SH/.SZ)
    statements = build_statements(stmts, code)
    annual = statements.get("annual")
    vrow = vmap.get(code) or vmap.get(sym)
    dbrow = dbmap.get(code)
    frow = fmap.get(code) or fmap.get(sym)
    events = divmap.get(code, [])
    fcrow = fcmap.get(sym) or fcmap.get(ts_to_term(code))
    holders = hmap.get(code, [])

    dividends = build_dividends(events)
    ttm = dividends.pop("_ttm_amount", None)

    fund = {
        "schema": "mastermind.fund/v1",
        "ticker": sym, "asof": src.get("asof") or ASOF,
        "quote_currency": "CNY", "stmt_currency": "CNY",
        "src": {"statements": "tushare",
                "estimates": None,
                "dividends": "tushare" if events else None},
        "profile": build_profile(src),
        "stats": build_stats(vrow, dbrow),
        "statements": {"annual": annual, "quarterly": statements.get("quarterly")},
        "ratios": build_ratios(vrow, frow, annual),
        "earnings": {"next_date": None, "next_period": None, "next_eps_est": None, "next_rev_est": None,
                     "q": [], "fy": []},
        "estimates": None,        # R5: no A-share street consensus
        "analyst": None,          # R5
        "dividends": dividends,
        "ownership": build_ownership(holders),
        "guidance": build_guidance(fcrow),
        "segments": None,
    }
    if ttm is not None:
        fund["dividends"]["yield_ttm"] = None   # need spot price to annualize; left null (raw events carry amounts)
    return fund


def cn_universe() -> list[str]:
    out = []
    for p in CN_SITE.glob("*.json"):
        n = p.name[:-5]
        if n.endswith((".SS", ".SZ")):
            out.append(n)
    return sorted(set(out))


def _arg(argv, flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


def main(argv: list[str]) -> None:
    only = _arg(argv, "--only")
    limit = int(_arg(argv, "--limit", 0) or 0)
    out_dir = Path(_arg(argv, "--out", str(DEFAULT_OUT)))
    out_dir.mkdir(parents=True, exist_ok=True)

    syms = ([s.strip() for s in only.split(",")] if only else cn_universe())
    # normalize .SH → .SS for terminal file naming
    syms = [ts_to_term(s) for s in syms]
    if limit:
        syms = syms[:limit]

    stmts = load_statements()
    vmap = load_map("valuation.parquet", "ticker")
    dbmap = load_map("daily_basic.parquet", "ts_code")
    fmap = load_map("financials.parquet", "ts_code")
    divmap = load_dividends()
    fcmap = load_forecast()
    hmap = load_holders()
    print(f"joins — stmt_income {len(stmts['income'])}, valuation {len(vmap)}, daily_basic {len(dbmap)}, "
          f"financials {len(fmap)}, dividends {len(divmap)}, forecast {len(fcmap)}, holders {len(hmap)}",
          flush=True)

    ok = err = 0
    for sym in syms:
        sp = CN_SITE / f"{sym}.json"
        src = {}
        if sp.exists():
            try:
                src = json.loads(sp.read_text())
            except Exception:
                src = {}
        try:
            fund = build_fund(sym, src, stmts, vmap, dbmap, fmap, divmap, fcmap, hmap)
            (out_dir / f"{sym}.fund.json").write_text(
                json.dumps(fund, separators=(",", ":"), ensure_ascii=False, sort_keys=False))
            ok += 1
        except Exception as exc:   # noqa: BLE001
            err += 1
            if err <= 20:
                print(f"  ERR {sym}: {exc}", flush=True)
    print(f"gen_fund_cn: {ok} written, {err} errors → {out_dir}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
