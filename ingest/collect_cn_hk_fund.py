"""Collect the full-statement fundamentals the fund.json emitter (gen_fund_cn.py / gen_fund_hk.py)
needs for CN A-shares and HK names — BUILD-SPEC §2 D2.

CN (Tushare, all endpoints entitled/$0):
    income_vip / balancesheet_vip / cashflow_vip whole-market per quarter-end period (28 periods back
    → ~84 whole-market calls, ≤2/s). Each statement cached as one parquet keyed (ts_code, end_date),
    resumable by period (a period already in the cache is skipped). income_vip carries the 营业成本
    (oper_cost) row the judge's gross-margin ruling depends on.
    pro.dividend per-ticker over the CN universe → dividends.parquet (resumable per-ticker).

HK (akshare + yfinance):
    stock_financial_hk_report_em per ticker for 利润表 / 资产负债表 / 现金流量表, indicator="报告期"
    (annual AND quarterly — 95 report dates for 00700, judge-verified). Long-format rows keyed by
    STD_ITEM_CODE; the emitter maps the taxonomy. HK dividend comes from the income-statement 每股股息
    row + a regex over any note text. yfinance HK supplies estimates / targets / recommendation dist /
    financialCurrency (often CNY while the quote is HKD — the judge's flagged 0700.HK case).
    Serial akshare with 0.5-1s sleep, resumable per-ticker cache data/hk_fund/<SYM>.json.

Universe:
    CN = site/chinastockdata/*.{SS,SZ}.json  (→ Tushare .SH/.SZ codes; .SS→.SH mapping handled)
    HK = site/hkstockdata/*.HK.json ∪ data/tushare/hk_deep.parquet tickers  (~500 covered names)

Writes into  <Macro Dashboard>/data/ :
    tushare/stmt_income.parquet    (ts_code, end_date, <income fields>)      resumable by period
    tushare/stmt_balance.parquet   (ts_code, end_date, <balance fields>)
    tushare/stmt_cashflow.parquet  (ts_code, end_date, <cashflow fields>)
    tushare/dividends.parquet      (ts_code, events_json)                    resumable per-ticker
    tushare/daily_basic.parquet    (ts_code, close, total_share, ...)        stats snapshot (one call)
    hk_fund/<SYM>.json             {financials{income,balance,cashflow}, yf{...}}  resumable per-ticker

Run with the macro venv (pandas + TUSHARE_TOKEN in <Macro Dashboard>/.env):
    "<Macro Dashboard>/.venv/bin/python" ingest/collect_cn_hk_fund.py \
        [--market cn|hk|all] [--only 600519.SH,0700.HK] [--limit N] \
        [--periods 28] [--skip-stmt] [--skip-div] [--force]
"""
from __future__ import annotations

import glob
import json
import os
import sys
import time
import datetime as dt
import urllib.request
from pathlib import Path

import pandas as pd

MACRO = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard")
OUT = MACRO / "data" / "tushare"
HK_OUT = MACRO / "data" / "hk_fund"
CN_SITE = MACRO / "site" / "chinastockdata"
HK_SITE = MACRO / "site" / "hkstockdata"
HK_DEEP = OUT / "hk_deep.parquet"


# ─────────────────────────────── Tushare REST ───────────────────────────────
def _token() -> str:
    t = (os.environ.get("TUSHARE_TOKEN") or "").strip()
    if not t:
        env = MACRO / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("TUSHARE_TOKEN="):
                    t = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not t:
        sys.exit("no TUSHARE_TOKEN (env or Macro Dashboard/.env)")
    return t


TOKEN = _token()


def ts_call(api: str, params: dict, fields: str = "", retries: int = 4):
    """Tushare REST → (fields, items). Retries on rate-limit (频率超限). Returns ([],[]) on hard error."""
    body = json.dumps({"api_name": api, "token": TOKEN, "params": params, "fields": fields}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request("http://api.tushare.pro", data=body,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                r = json.loads(resp.read())
        except Exception:
            time.sleep(1.2 * (attempt + 1))
            continue
        if r.get("code") == 0:
            d = r.get("data") or {}
            return d.get("fields") or [], d.get("items") or []
        msg = str(r.get("msg") or "")
        if "频率" in msg or "超限" in msg:
            time.sleep(2.0 * (attempt + 1))
            continue
        return [], []
    return [], []


def _f(v):
    try:
        x = float(v)
        return None if x != x else x
    except (TypeError, ValueError):
        return None


# ─────────────────────────────── universes ───────────────────────────────
def cn_universe() -> list[str]:
    """CN names (site/chinastockdata/*.SS|SZ.json) → Tushare codes (.SS→.SH)."""
    out = []
    for p in CN_SITE.glob("*.json"):
        n = p.name[:-5]
        if n.endswith(".SS"):
            out.append(n[:-3] + ".SH")
        elif n.endswith(".SZ"):
            out.append(n)
    return sorted(set(out))


def hk_universe() -> list[str]:
    """HK names (site/hkstockdata ∪ hk_deep.parquet) as terminal 4-digit .HK symbols."""
    out: set[str] = set()
    for f in glob.glob(str(HK_SITE / "*.HK.json")):
        n = os.path.basename(f)[:-5]
        if not n.startswith("_"):   # skip _HSI / _HSCE index files
            out.add(n)
    if HK_DEEP.exists():
        try:
            for t in pd.read_parquet(HK_DEEP)["ticker"].tolist():
                out.add(str(t))
        except Exception:
            pass
    return sorted(out)


# ─────────────────────────────── CN statement periods ───────────────────────────────
def quarter_periods(n: int) -> list[str]:
    """The last n fiscal quarter-ends (YYYYMMDD), newest→oldest, as of today."""
    today = dt.date.today()
    ends = [(3, 31), (6, 30), (9, 30), (12, 31)]
    out = []
    y = today.year
    # start from the most recent quarter-end strictly on/before today
    while len(out) < n:
        for m, d in reversed(ends):
            qe = dt.date(y, m, d)
            if qe <= today:
                out.append(qe.strftime("%Y%m%d"))
                if len(out) >= n:
                    break
        y -= 1
    return out


INCOME_FIELDS = ("ts_code,end_date,total_revenue,revenue,oper_cost,total_cogs,operate_profit,"
                 "total_profit,income_tax,n_income,n_income_attr_p,basic_eps,diluted_eps,ebit,ebitda,"
                 "sell_exp,admin_exp,fin_exp")
BALANCE_FIELDS = ("ts_code,end_date,total_assets,total_cur_assets,total_nca,total_liab,total_cur_liab,"
                  "total_ncl,total_hldr_eqy_inc_min_int,money_cap,st_borr,lt_borr,bond_payable")
CASHFLOW_FIELDS = ("ts_code,end_date,n_cashflow_act,n_cashflow_inv_act,n_cash_flows_fnc_act,"
                   "c_pay_acq_const_fiolta,free_cashflow")

_STMT = {
    "income":   ("income_vip",       INCOME_FIELDS,   OUT / "stmt_income.parquet"),
    "balance":  ("balancesheet_vip", BALANCE_FIELDS,  OUT / "stmt_balance.parquet"),
    "cashflow": ("cashflow_vip",     CASHFLOW_FIELDS, OUT / "stmt_cashflow.parquet"),
}


def collect_cn_statements(periods: list[str], force: bool) -> None:
    """Whole-market _vip statement pulls, one parquet per statement, resumable by period.
    Each parquet holds one row per (ts_code, end_date); a period already present is skipped."""
    OUT.mkdir(parents=True, exist_ok=True)
    for kind, (api, fields, path) in _STMT.items():
        have: set[str] = set()
        existing = None
        if path.exists() and not force:
            try:
                existing = pd.read_parquet(path)
                have = set(str(x) for x in existing["end_date"].unique())
            except Exception:
                existing = None
        want = [p for p in periods if p not in have]
        if not want:
            print(f"  {kind}: all {len(periods)} periods cached — skip", flush=True)
            continue
        frames = [existing] if existing is not None else []
        for p in want:
            f, items = ts_call(api, {"period": p}, fields)
            if not items:
                print(f"  {kind} {p}: 0 rows (skip)", flush=True)
                time.sleep(0.55)
                continue
            idx = {n: i for i, n in enumerate(f)}
            rows = []
            for it in items:
                row = {c: (_f(it[idx[c]]) if c not in ("ts_code", "end_date") else it[idx[c]])
                       for c in f}
                rows.append(row)
            frames.append(pd.DataFrame(rows))
            print(f"  {kind} {p}: {len(rows)} rows", flush=True)
            time.sleep(0.55)   # ≤2/s
        df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        if not df.empty:
            df = df.drop_duplicates(subset=["ts_code", "end_date"], keep="last")
            df.to_parquet(path, index=False)
        print(f"{path.name}: {len(df)} rows ({df['ts_code'].nunique() if not df.empty else 0} tickers)",
              flush=True)


def collect_daily_basic() -> None:
    """One whole-market daily_basic snapshot → stats (shares/mktcap/beta-proxy) for the emitter."""
    # newest trade date with data: walk back from today, skip weekends
    d = dt.date.today()
    for _ in range(10):
        if d.weekday() < 5:
            f, items = ts_call("daily_basic", {"trade_date": d.strftime("%Y%m%d")},
                               "ts_code,close,total_share,float_share,free_share,total_mv,circ_mv,"
                               "pe,pe_ttm,pb,ps_ttm,dv_ttm")
            if items:
                idx = {n: i for i, n in enumerate(f)}
                rows = [{c: (_f(it[idx[c]]) if c != "ts_code" else it[idx[c]]) for c in f} for it in items]
                df = pd.DataFrame(rows)
                OUT.mkdir(parents=True, exist_ok=True)
                df.to_parquet(OUT / "daily_basic.parquet", index=False)
                print(f"daily_basic.parquet: {len(df)} rows ({d})", flush=True)
                return
        d -= dt.timedelta(days=1)
    print("daily_basic: no data found in last 10 days", flush=True)


# ─────────────────────────────── CN dividends (per-ticker) ───────────────────────────────
DIV_FIELDS = "ts_code,end_date,ann_date,div_proc,stk_div,cash_div,cash_div_tax,record_date,ex_date,pay_date"


def _one_div(code: str):
    f, items = ts_call("dividend", {"ts_code": code}, DIV_FIELDS)
    if not items:
        return []
    idx = {n: i for i, n in enumerate(f)}
    events = []
    for it in items:
        proc = it[idx.get("div_proc", -1)] if "div_proc" in idx else None
        ex = it[idx.get("ex_date", -1)] if "ex_date" in idx else None
        # only implemented cash dividends with an ex-date (drop 预案/股东大会通过 proposals)
        amt = _f(it[idx["cash_div_tax"]]) if "cash_div_tax" in idx else None
        if amt is None or amt <= 0 or not ex:
            continue
        if proc and proc not in ("实施", "分红"):
            continue
        stk = _f(it[idx["stk_div"]]) if "stk_div" in idx else None
        events.append({
            "ex": _ymd(ex), "amount": round(amt, 6),
            "pay": _ymd(it[idx.get("pay_date", -1)] if "pay_date" in idx else None),
            "record": _ymd(it[idx.get("record_date", -1)] if "record_date" in idx else None),
            "type": "regular",
            "stk_div": stk if stk else None,
        })
    events.sort(key=lambda e: e["ex"] or "")
    return events


def _ymd(s):
    if not s:
        return None
    s = str(s)
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else s


def collect_cn_dividends(codes: list[str], force: bool) -> None:
    have: dict[str, str] = {}
    path = OUT / "dividends.parquet"
    if path.exists() and not force:
        try:
            for r in pd.read_parquet(path).to_dict("records"):
                have[str(r["ts_code"])] = r["events_json"]
        except Exception:
            pass
    todo = [c for c in codes if c not in have]
    print(f"CN dividends: {len(codes)} names, {len(todo)} to fetch", flush=True)
    done = ok = 0
    try:
        for c in todo:
            events = _one_div(c)
            have[c] = json.dumps(events, ensure_ascii=False)
            done += 1
            if events:
                ok += 1
            if done % 100 == 0 or done == len(todo):
                print(f"  dividends: {done}/{len(todo)} done, {ok} with data", flush=True)
                _flush_div(path, have)   # periodic checkpoint (Ctrl-C-safe)
            time.sleep(0.32)   # ≤2/s buffer alongside statement calls
    except KeyboardInterrupt:
        print("  interrupted — flushing dividends checkpoint", flush=True)
    _flush_div(path, have)
    print(f"dividends.parquet: {len(have)} tickers", flush=True)


def _flush_div(path: Path, have: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame([{"ts_code": k, "events_json": v} for k, v in sorted(have.items())])
    df.to_parquet(path, index=False)


# ─────────────────────────────── HK (akshare + yfinance, per-ticker) ───────────────────────────────
HK_STMTS = {"income": "利润表", "balance": "资产负债表", "cashflow": "现金流量表"}


def _ak_stock(sym: str) -> str:
    """terminal '0700.HK' → akshare stock code '00700' (akshare wants a 5-digit code)."""
    n = sym.split(".")[0]
    return n.zfill(5)


def _hk_report(sym: str, cn_label: str) -> list[dict]:
    """akshare long-format HK report → [{end, date_type, items:{code:amount}}], newest→oldest."""
    import akshare as ak
    code = _ak_stock(sym)
    df = ak.stock_financial_hk_report_em(stock=code, symbol=cn_label, indicator="报告期")
    if df is None or df.empty:
        return []
    out: dict[str, dict] = {}
    for r in df.to_dict("records"):
        rd = str(r.get("REPORT_DATE") or "")[:10]
        if not rd:
            continue
        rec = out.setdefault(rd, {"end": rd, "date_type": r.get("DATE_TYPE_CODE"), "items": {}})
        code_i = str(r.get("STD_ITEM_CODE") or "")
        amt = _f(r.get("AMOUNT"))
        if code_i:
            rec["items"][code_i] = amt
    rows = sorted(out.values(), key=lambda x: x["end"])
    return rows


def _hk_yf(sym: str) -> dict:
    """yfinance HK: financialCurrency + estimates/targets/recommendation distribution."""
    import yfinance as yf
    yf_sym = sym if sym.endswith(".HK") else sym + ".HK"
    try:
        t = yf.Ticker(yf_sym)
        info = t.info or {}
    except Exception:
        return {}
    out = {
        "financial_currency": info.get("financialCurrency"),
        "currency": info.get("currency"),
        "target_mean": _f(info.get("targetMeanPrice")), "target_high": _f(info.get("targetHighPrice")),
        "target_low": _f(info.get("targetLowPrice")), "target_median": _f(info.get("targetMedianPrice")),
        "rec_key": info.get("recommendationKey"), "n_analysts": info.get("numberOfAnalystOpinions"),
        "beta": _f(info.get("beta")), "mktcap": _f(info.get("marketCap")),
        "shares_out": _f(info.get("sharesOutstanding")), "float_shares": _f(info.get("floatShares")),
        "held_inst_pct": _f(info.get("heldPercentInstitutions")), "held_insider_pct": _f(info.get("heldPercentInsiders")),
        "sector": info.get("sector"), "industry": info.get("industry"),
        "website": info.get("website"), "employees": info.get("fullTimeEmployees"),
        "description": info.get("longBusinessSummary"),
        "trailing_eps_fwd": _f(info.get("forwardEps")), "trailing_pe": _f(info.get("trailingPE")),
        "forward_pe": _f(info.get("forwardPE")), "ps": _f(info.get("priceToSalesTrailing12Months")),
        "pb": _f(info.get("priceToBook")), "div_yield": _f(info.get("dividendYield")),
        "payout_ratio": _f(info.get("payoutRatio")), "rev_growth": _f(info.get("revenueGrowth")),
        "eps_growth": _f(info.get("earningsGrowth")), "gross_margin": _f(info.get("grossMargins")),
        "net_margin": _f(info.get("profitMargins")), "roe": _f(info.get("returnOnEquity")),
        "roa": _f(info.get("returnOnAssets")), "next_earnings": None,
    }
    # recommendation distribution (strongBuy/buy/hold/sell/strongSell), newest window
    try:
        rec = t.recommendations
        if rec is not None and not rec.empty:
            row = rec.iloc[0].to_dict()
            out["rec_dist"] = {k: int(row.get(k) or 0)
                               for k in ("strongBuy", "buy", "hold", "sell", "strongSell")}
    except Exception:
        pass
    # analyst estimates (eps/rev forward) + next earnings date from calendar
    try:
        cal = t.calendar or {}
        eds = cal.get("Earnings Date")
        if eds:
            out["next_earnings"] = str(eds[0])[:10] if isinstance(eds, (list, tuple)) else str(eds)[:10]
        out["eps_next_avg"] = _f(cal.get("Earnings Average"))
        out["rev_next_avg"] = _f(cal.get("Revenue Average"))
    except Exception:
        pass
    try:
        et = t.earnings_estimate
        if et is not None and not et.empty:
            out["eps_est"] = {str(k): et.loc[k].to_dict() for k in et.index}
    except Exception:
        pass
    try:
        rt = t.revenue_estimate
        if rt is not None and not rt.empty:
            out["rev_est"] = {str(k): {kk: _f(vv) for kk, vv in rt.loc[k].to_dict().items()} for k in rt.index}
    except Exception:
        pass
    return out


def _fetch_hk(sym: str) -> dict | None:
    fin: dict[str, list] = {}
    for kind, label in HK_STMTS.items():
        try:
            fin[kind] = _hk_report(sym, label)
        except Exception:
            fin[kind] = []
        time.sleep(0.6)   # serial akshare etiquette
    yf = _hk_yf(sym)
    if not any(fin.values()) and not yf:
        return None
    return {"ticker": sym, "financials": fin, "yf": yf}


def collect_hk_fund(syms: list[str], force: bool) -> None:
    HK_OUT.mkdir(parents=True, exist_ok=True)
    done = ok = 0
    try:
        for sym in syms:
            cache = HK_OUT / f"{sym}.json"
            if cache.exists() and not force:
                done += 1
                continue
            rec = _fetch_hk(sym)
            done += 1
            if rec:
                cache.write_text(json.dumps(rec, ensure_ascii=False, default=str))
                ok += 1
            if done % 25 == 0 or done == len(syms):
                print(f"  hk_fund: {done}/{len(syms)} done, {ok} newly cached", flush=True)
    except KeyboardInterrupt:
        print("  interrupted — per-ticker caches already on disk (resumable)", flush=True)
    print(f"hk_fund: {ok} names newly cached into {HK_OUT}", flush=True)


# ─────────────────────────────── driver ───────────────────────────────
def _arg(argv, flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


def main(argv: list[str]) -> None:
    market = (_arg(argv, "--market", "all") or "all").lower()
    only = _arg(argv, "--only")
    limit = int(_arg(argv, "--limit", 0) or 0)
    periods_n = int(_arg(argv, "--periods", 28) or 28)
    skip_stmt = "--skip-stmt" in argv
    skip_div = "--skip-div" in argv
    force = "--force" in argv

    only_set = set(s.strip() for s in only.split(",")) if only else None
    t0 = time.time()

    if market in ("cn", "all"):
        cn = cn_universe()
        # accept both terminal (.SS) and tushare (.SH) in --only
        if only_set:
            def _match(code):
                return code in only_set or (code[:-3] + ".SS") in only_set
            cn = [c for c in cn if _match(c)]
        if limit:
            cn = cn[:limit]
        print(f"=== CN ({len(cn)} names) ===", flush=True)
        if not skip_stmt and not only_set:
            # whole-market statement pulls are period-scoped, not name-scoped; only on a full run
            periods = quarter_periods(periods_n)
            print(f"CN statements: {len(periods)} periods {periods[-1]}..{periods[0]}", flush=True)
            collect_cn_statements(periods, force)
            collect_daily_basic()
        elif not skip_stmt:
            print("  --only set: statements are whole-market — skipping the period pulls "
                  "(run without --only to refresh stmt parquets)", flush=True)
        if not skip_div:
            collect_cn_dividends(cn, force)

    if market in ("hk", "all"):
        hk = hk_universe()
        if only_set:
            hk = [s for s in hk if s in only_set or s.split(".")[0].zfill(5) in
                  {x.split(".")[0].zfill(5) for x in only_set}]
        if limit:
            hk = hk[:limit]
        print(f"=== HK ({len(hk)} names) ===", flush=True)
        collect_hk_fund(hk, force)

    print(f"done in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
