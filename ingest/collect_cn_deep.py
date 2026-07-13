"""Collect deep A-share data the Macro Dashboard doesn't yet assemble per-stock, into parquets the
CN/HK intel bridge (pull_cn_hk_intel.py) joins. Closes the Phase-2 gaps: full financial statements
for the ~50% of names without an inline fundamentals block, and 龙虎榜/大宗交易/top-holder smart-money.

All endpoints are ENTITLED on the current Tushare token (verified 2026-07-02) — $0. Whole-market _vip
calls make financials cheap (~2 calls/fiscal-year); dragon-tiger/block are whole-market by trade date;
top-holders is per-ticker (thread-pooled, resumable).

Writes into  <Macro Dashboard>/data/tushare/ :
    financials.parquet   one row per ts_code — margins/roe/growth + multiyear revenue/eps/net-margin series
    lhb.parquet          one row per ts_code — 龙虎榜 count + net-amount, 大宗交易 count + amount (last N sessions)
    holders.parquet      one row per ts_code — top float holders [{name, ratio, change, type}]

Run with the macro venv (pandas + the token in <Macro Dashboard>/.env):
    "<Macro Dashboard>/.venv/bin/python" ingest/collect_cn_deep.py [--stages financials,lhb,holders] \
        [--lhb-days 60] [--workers 8] [--limit N]
"""
from __future__ import annotations

import json
import os
import sys
import time
import datetime as dt
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd

CA_ROOT = Path(__file__).resolve().parents[1]
MACRO = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard")
OUT = MACRO / "data" / "tushare"
MANIFEST = CA_ROOT / "terminal" / "public" / "data" / "manifest.json"

FISCAL_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025]


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
            with urllib.request.urlopen(req, timeout=60) as resp:
                r = json.loads(resp.read())
        except Exception:
            time.sleep(1.2 * (attempt + 1))
            continue
        if r.get("code") == 0:
            d = r.get("data") or {}
            return d.get("fields") or [], d.get("items") or []
        msg = str(r.get("msg") or "")
        if "频率" in msg or "超限" in msg:      # rate-limited — back off and retry
            time.sleep(2.0 * (attempt + 1))
            continue
        return [], []   # permission / param error — give up on this call
    return [], []


def _f(v):
    try:
        x = float(v)
        return None if x != x else x
    except (TypeError, ValueError):
        return None


CN_SITE = MACRO / "site" / "chinastockdata"


def cn_universe() -> list[str]:
    """CN names we build intel for (site/chinastockdata/*.SS|SZ.json) → Tushare codes (.SS→.SH)."""
    out = []
    for p in CN_SITE.glob("*.json"):
        n = p.name[:-5]
        if n.endswith(".SS"):
            out.append(n[:-3] + ".SH")
        elif n.endswith(".SZ"):
            out.append(n)
    return sorted(set(out))


# ─────────────────────────────── financials (whole-market _vip) ───────────────────────────────
FINA_FIELDS = "ts_code,end_date,eps,roe,netprofit_margin,grossprofit_margin,gross_margin,debt_to_assets,or_yoy,netprofit_yoy"


def collect_financials() -> None:
    # per (ts_code, year) accumulate the annual metrics + revenue
    fina: dict[tuple, dict] = {}
    rev: dict[tuple, float] = {}
    for y in FISCAL_YEARS:
        period = f"{y}1231"
        ff, fitems = ts_call("fina_indicator_vip", {"period": period}, FINA_FIELDS)
        idx = {name: i for i, name in enumerate(ff)}
        for it in fitems:
            code = it[idx["ts_code"]]
            fina[(code, y)] = {
                "eps": _f(it[idx.get("eps", -1)]) if "eps" in idx else None,
                "roe": _f(it[idx["roe"]]) if "roe" in idx else None,
                "net_margin": _f(it[idx["netprofit_margin"]]) if "netprofit_margin" in idx else None,
                "gross_margin": (_f(it[idx["grossprofit_margin"]]) if "grossprofit_margin" in idx and _f(it[idx["grossprofit_margin"]]) is not None
                                 else (_f(it[idx["gross_margin"]]) if "gross_margin" in idx else None)),
                "debt_to_assets": _f(it[idx["debt_to_assets"]]) if "debt_to_assets" in idx else None,
                "or_yoy": _f(it[idx["or_yoy"]]) if "or_yoy" in idx else None,
                "netprofit_yoy": _f(it[idx["netprofit_yoy"]]) if "netprofit_yoy" in idx else None,
            }
        rf, ritems = ts_call("income_vip", {"period": period}, "ts_code,end_date,revenue,total_revenue")
        ridx = {name: i for i, name in enumerate(rf)}
        for it in ritems:
            code = it[ridx["ts_code"]]
            r = _f(it[ridx["revenue"]]) if "revenue" in ridx else None
            if r is None and "total_revenue" in ridx:
                r = _f(it[ridx["total_revenue"]])
            if r is not None:
                rev[(code, y)] = r
        print(f"  financials {y}: fina {len(fitems)} rows, income {len(ritems)} rows", flush=True)
        time.sleep(0.3)

    codes = sorted({c for (c, _) in fina} | {c for (c, _) in rev})
    rows = []
    for code in codes:
        yrs, revenue, eps, nm, gm = [], [], [], [], []
        for y in FISCAL_YEARS:
            fi = fina.get((code, y))
            rv = rev.get((code, y))
            if fi is None and rv is None:
                continue
            yrs.append(y)
            revenue.append(rv)
            eps.append(fi.get("eps") if fi else None)
            nm.append(fi.get("net_margin") if fi else None)
            gm.append(fi.get("gross_margin") if fi else None)
        if not yrs:
            continue
        latest = fina.get((code, yrs[-1])) or {}

        def cagr(series):
            vals = [(i, v) for i, v in enumerate(series) if v is not None and v > 0]
            if len(vals) < 2:
                return None
            (i0, v0), (i1, v1) = vals[0], vals[-1]
            n = i1 - i0
            return round(((v1 / v0) ** (1 / n) - 1) * 100, 1) if n > 0 else None

        rows.append({
            "ts_code": code, "years": yrs, "revenue": revenue, "eps": eps,
            "net_margin_series": nm, "gross_margin_series": gm,
            "roe": latest.get("roe"), "net_margin": latest.get("net_margin"),
            "gross_margin": latest.get("gross_margin"), "debt_to_assets": latest.get("debt_to_assets"),
            "rev_growth": latest.get("or_yoy"), "ni_growth": latest.get("netprofit_yoy"),
            "rev_cagr": cagr(revenue), "eps_cagr": cagr(eps),
        })
    df = pd.DataFrame(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT / "financials.parquet")
    print(f"financials.parquet: {len(df)} tickers", flush=True)


# ─────────────────────────────── 龙虎榜 + 大宗交易 (whole-market by date) ───────────────────────────────
def collect_lhb(days: int) -> None:
    lhb: dict[str, dict] = {}
    today = dt.date.today()
    scanned = 0
    d = today
    # walk back over calendar days; skip weekends; stop after we've seen `days` sessions with data
    while scanned < days and (today - d).days < days * 2 + 20:
        if d.weekday() < 5:
            td = d.strftime("%Y%m%d")
            tff, ti = ts_call("top_list", {"trade_date": td})
            bff, bi = ts_call("block_trade", {"trade_date": td})
            if ti or bi:
                scanned += 1
            if ti:
                idx = {n: i for i, n in enumerate(tff)}
                for it in ti:
                    code = it[idx["ts_code"]]
                    rec = lhb.setdefault(code, {"lhb_count": 0, "lhb_net": 0.0, "block_count": 0, "block_amount": 0.0})
                    rec["lhb_count"] += 1
                    na = _f(it[idx["net_amount"]]) if "net_amount" in idx else None
                    if na is not None:
                        rec["lhb_net"] += na
            if bi:
                bidx = {n: i for i, n in enumerate(bff)}
                seen_codes = set()
                for it in bi:
                    code = it[bidx["ts_code"]]
                    rec = lhb.setdefault(code, {"lhb_count": 0, "lhb_net": 0.0, "block_count": 0, "block_amount": 0.0})
                    if code not in seen_codes:
                        rec["block_count"] += 1
                        seen_codes.add(code)
                    am = _f(it[bidx["amount"]]) if "amount" in bidx else None
                    if am is not None:
                        rec["block_amount"] += am
            if scanned % 10 == 0 and (ti or bi):
                print(f"  lhb: {scanned}/{days} sessions, {len(lhb)} tickers", flush=True)
        d -= dt.timedelta(days=1)
    rows = [{"ts_code": c, **v} for c, v in lhb.items()]
    df = pd.DataFrame(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT / "lhb.parquet")
    print(f"lhb.parquet: {len(df)} tickers (龙虎榜/大宗交易, {days} sessions)", flush=True)


# ─────────────────────────────── top float holders (per-ticker, threaded) ───────────────────────────────
HOLD_FIELDS = "ts_code,end_date,holder_name,hold_ratio,hold_change,holder_type"


def _one_holders(code: str):
    hf, hi = ts_call("top10_floatholders", {"ts_code": code}, HOLD_FIELDS)
    if not hi:
        return code, None, None
    idx = {n: i for i, n in enumerate(hf)}
    # keep only the most recent end_date
    latest = max(it[idx["end_date"]] for it in hi)
    hl = []
    for it in hi:
        if it[idx["end_date"]] != latest:
            continue
        hl.append({
            "name": it[idx["holder_name"]],
            "ratio": _f(it[idx.get("hold_ratio", -1)]) if "hold_ratio" in idx else None,
            "change": _f(it[idx.get("hold_change", -1)]) if "hold_change" in idx else None,
            "type": it[idx.get("holder_type", -1)] if "holder_type" in idx else None,
        })
    hl.sort(key=lambda h: (h["ratio"] is None, -(h["ratio"] or 0)))
    return code, latest, hl[:8]


def collect_holders(workers: int, limit: int) -> None:
    codes = cn_universe()
    if limit:
        codes = codes[:limit]
    rows = []
    done = ok = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_one_holders, c) for c in codes]
        for fut in as_completed(futs):
            code, period, hl = fut.result()
            done += 1
            if hl:
                ok += 1
                # store as a JSON string — robust across parquet engines (avoids list<struct> quirks)
                rows.append({"ts_code": code, "period": period, "holders_json": json.dumps(hl, ensure_ascii=False)})
            if done % 200 == 0 or done == len(codes):
                print(f"  holders: {done}/{len(codes)} done, {ok} with data", flush=True)
    df = pd.DataFrame(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT / "holders.parquet")
    print(f"holders.parquet: {len(df)} tickers", flush=True)


def main(argv: list[str]) -> None:
    stages = "financials,lhb,holders"
    lhb_days = 60
    workers = 8
    limit = 0
    if "--stages" in argv:
        stages = argv[argv.index("--stages") + 1]
    if "--lhb-days" in argv:
        lhb_days = int(argv[argv.index("--lhb-days") + 1])
    if "--workers" in argv:
        workers = int(argv[argv.index("--workers") + 1])
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    st = set(s.strip() for s in stages.split(","))
    t0 = time.time()
    if "financials" in st:
        print("=== financials (fina_indicator_vip + income_vip) ===", flush=True)
        collect_financials()
    if "lhb" in st:
        print("=== 龙虎榜 + 大宗交易 (top_list + block_trade) ===", flush=True)
        collect_lhb(lhb_days)
    if "holders" in st:
        print("=== top float holders (top10_floatholders) ===", flush=True)
        collect_holders(workers, limit)
    print(f"done in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
