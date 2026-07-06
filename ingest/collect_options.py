"""Collect options IV data → <SYM>.opts.json per mastermind.opts/v1.

Sources:
  primary  — yfinance option_chain() (impliedVolatility, already BS-implied)
  fallback — CBOE delayed JSON (cdn.cboe.com/api/global/delayed_quotes/options/<SYM>.json)

ATM recipe (per BUILD-SPEC §1.2 + options-iv.md §7a):
  Per expiry: find nearest-to-spot strike, compute mid(call_iv, put_iv) dropping zero/absent.
  Term structure: variance-interpolate to tenors 1W/2W/1M/2M/3M/6M/9M/1Y; skip tenors where
    no expiry falls within ±40% of target DTE.
  Smile: expiry nearest 30 DTE, call chains, strikes within ±35% of spot, zero-IV rows dropped.

iv is ALWAYS a raw decimal (0.412 = 41.2%) in both term and smile (judge ruling §1.2).

Universe:
  Default = flagship equities/ADRs from build_polygon_universe META + DEFAULT
    (Crypto and ETFs without listed options are filtered out automatically on empty chains).
  --only  SYM,SYM,...  override the list
  --top N  include top-N US names by manifest dollar volume

Usage:
  python ingest/collect_options.py [--only AAPL,ZS] [--top 50] [--stale-days 1] [--limit N]
"""
from __future__ import annotations

import json
import math
import os
import random
import re
import sys
import time
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "terminal" / "public" / "data"
MANIFEST = OUT / "manifest.json"

MACRO_VENV_PY = "/Users/chriswong/Documents/Cluade/Macro Dashboard/.venv/bin/python"

# ── Universe ──────────────────────────────────────────────────────────────────

# Flagship equities + optionable ADRs (from build_polygon_universe META); crypto
# and most ETFs have no listed options so they'll be skipped gracefully via
# empty chain, but we exclude obvious non-equity tickers up front to save API calls.
_NO_OPTS = {"BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD"}

_FLAGSHIP_EQUITIES = [
    "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AMD", "AVGO",
    "NFLX", "CRM", "SMCI", "ARM", "PLTR", "MSTR", "MU", "INTC", "COIN",
    "JPM", "V", "XOM", "LLY", "COST", "SPY", "QQQ", "IWM", "DIA", "SOXL",
    "GLD", "TLT", "BABA", "JD", "PDD", "ZS",
]

DEFAULT_UNIVERSE = [s for s in _FLAGSHIP_EQUITIES if s not in _NO_OPTS]

# Standard tenor targets (label → target DTE)
TENORS = {
    "1W": 7, "2W": 14, "1M": 30, "2M": 60,
    "3M": 91, "6M": 182, "9M": 273, "1Y": 365,
}

SMILE_TARGET_DTE = 30
SMILE_STRIKE_PCT = 0.35   # ±35% of spot
TENOR_TOLERANCE  = 0.40   # ±40% of target DTE to find a matching expiry


# ── Helpers ───────────────────────────────────────────────────────────────────

def _nan_to_none(v):
    if v is None:
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _is_zero_or_absent(iv) -> bool:
    v = _nan_to_none(iv)
    return v is None or v <= 0


# ── yfinance term structure + smile ──────────────────────────────────────────

def _yf_atm_iv(sym: str) -> tuple[float | None, list[dict]]:
    """
    Returns (spot, raw_list) where raw_list = [{'dte': int, 'iv': float}, ...] sorted by DTE.
    iv is raw decimal. Returns (None, []) on failure or no optionable chains.
    """
    import yfinance as yf
    try:
        t = yf.Ticker(sym)
        spot = _nan_to_none(t.fast_info.last_price)
        if not spot:
            return None, []
        expiries = t.options
        if not expiries:
            return spot, []
        today = date.today()
        raw: list[dict] = []
        for exp in expiries:
            try:
                chain = t.option_chain(exp)
                exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
                dte = (exp_date - today).days
                if dte <= 0:
                    continue
                calls, puts = chain.calls, chain.puts
                if calls.empty and puts.empty:
                    continue

                call_iv, put_iv = None, None
                if not calls.empty:
                    ci = (calls["strike"] - spot).abs().idxmin()
                    v = _nan_to_none(calls.loc[ci, "impliedVolatility"])
                    if not _is_zero_or_absent(v):
                        call_iv = v
                if not puts.empty:
                    pi = (puts["strike"] - spot).abs().idxmin()
                    v = _nan_to_none(puts.loc[pi, "impliedVolatility"])
                    if not _is_zero_or_absent(v):
                        put_iv = v

                if call_iv is not None and put_iv is not None:
                    avg_iv = (call_iv + put_iv) / 2.0
                elif call_iv is not None:
                    avg_iv = call_iv
                elif put_iv is not None:
                    avg_iv = put_iv
                else:
                    continue

                raw.append({"dte": dte, "iv": avg_iv})
            except Exception:
                continue

        raw.sort(key=lambda x: x["dte"])
        return spot, raw
    except Exception as exc:
        print(f"    yf error {sym}: {exc}", file=sys.stderr)
        return None, []


def _yf_smile(sym: str, spot: float, target_dte: int = SMILE_TARGET_DTE) -> dict | None:
    """
    Returns smile dict {expiry, dte, strikes:[], iv:[], delta_call:[]} using yfinance.
    iv values are raw decimals.
    """
    import yfinance as yf
    try:
        t = yf.Ticker(sym)
        expiries = t.options
        if not expiries:
            return None
        today = date.today()
        best_exp, best_dte = None, None
        for exp in expiries:
            exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
            dte = (exp_date - today).days
            if dte <= 0:
                continue
            if best_dte is None or abs(dte - target_dte) < abs(best_dte - target_dte):
                best_exp, best_dte = exp, dte
        if best_exp is None:
            return None
        chain = t.option_chain(best_exp)
        calls = chain.calls
        if calls.empty:
            return None
        lo, hi = spot * (1 - SMILE_STRIKE_PCT), spot * (1 + SMILE_STRIKE_PCT)
        mask = (calls["strike"] >= lo) & (calls["strike"] <= hi)
        sub = calls[mask].copy()
        sub = sub[sub["impliedVolatility"].apply(lambda v: not _is_zero_or_absent(v))]
        sub = sub.sort_values("strike")
        if sub.empty:
            return None
        return {
            "expiry": best_exp,
            "dte": best_dte,
            "strikes": [round(float(r["strike"]), 2) for _, r in sub.iterrows()],
            "iv": [round(float(r["impliedVolatility"]), 6) for _, r in sub.iterrows()],
            "delta_call": [],  # yfinance provides no greeks; filled by CBOE path when available
        }
    except Exception:
        return None


# ── CBOE fallback ─────────────────────────────────────────────────────────────

_CBOE_SYM_RE = re.compile(r"([A-Z0-9\-]+?)(\d{6})([CP])(\d+)")

def _cboe_fetch(sym: str) -> dict | None:
    """
    Fetch CBOE delayed JSON. Returns parsed dict or None on any error.
    Normalises multi-class tickers (e.g. BRK.B → BRKB for CBOE).
    """
    cboe_sym = sym.replace(".", "")
    url = f"https://cdn.cboe.com/api/global/delayed_quotes/options/{cboe_sym}.json"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "trading-terminal/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        print(f"    cboe error {sym}: {exc}", file=sys.stderr)
        return None


def _cboe_atm_iv(cboe_data: dict) -> tuple[float | None, list[dict]]:
    """
    Extract (spot, raw_list) from CBOE JSON, same shape as _yf_atm_iv.
    CBOE iv field is already a decimal (0.2876 = 28.76%).
    """
    try:
        d = cboe_data.get("data") or {}
        spot = _nan_to_none(d.get("current_price"))
        if not spot:
            return None, []
        opts = d.get("options") or []
        today = date.today()
        by_dte: dict[int, dict[str, list[tuple[float, float]]]] = {}
        for o in opts:
            m = _CBOE_SYM_RE.match(o.get("option", ""))
            if not m:
                continue
            _, dt_str, typ, sr_raw = m.groups()
            try:
                exp_date = datetime.strptime(dt_str, "%y%m%d").date()
            except ValueError:
                continue
            dte = (exp_date - today).days
            if dte <= 0:
                continue
            strike = int(sr_raw) / 1000.0
            iv_val = _nan_to_none(o.get("iv"))
            if _is_zero_or_absent(iv_val):
                continue
            bucket = by_dte.setdefault(dte, {"C": [], "P": []})
            bucket[typ].append((strike, iv_val))

        raw: list[dict] = []
        for dte, sides in by_dte.items():
            # ATM: find strike nearest to spot among all strikes in this expiry
            all_strikes = {s for s, _ in sides.get("C", []) + sides.get("P", [])}
            if not all_strikes:
                continue
            atm_strike = min(all_strikes, key=lambda s: abs(s - spot))
            call_iv = next((iv for s, iv in sides.get("C", []) if s == atm_strike), None)
            put_iv  = next((iv for s, iv in sides.get("P", []) if s == atm_strike), None)
            if call_iv is not None and put_iv is not None:
                avg_iv = (call_iv + put_iv) / 2.0
            elif call_iv is not None:
                avg_iv = call_iv
            elif put_iv is not None:
                avg_iv = put_iv
            else:
                continue
            raw.append({"dte": dte, "iv": avg_iv})

        raw.sort(key=lambda x: x["dte"])
        return spot, raw
    except Exception as exc:
        print(f"    cboe parse error: {exc}", file=sys.stderr)
        return None, []


def _cboe_smile(cboe_data: dict, spot: float, target_dte: int = SMILE_TARGET_DTE) -> dict | None:
    """
    Extract smile dict from CBOE JSON (calls only, nearest-to-30-DTE expiry,
    strikes ±35% of spot, delta_call from CBOE greeks).
    """
    try:
        d = cboe_data.get("data") or {}
        opts = d.get("options") or []
        today = date.today()
        by_dte: dict[int, list] = {}
        for o in opts:
            m = _CBOE_SYM_RE.match(o.get("option", ""))
            if not m:
                continue
            _, dt_str, typ, sr_raw = m.groups()
            if typ != "C":
                continue
            try:
                exp_date = datetime.strptime(dt_str, "%y%m%d").date()
            except ValueError:
                continue
            dte = (exp_date - today).days
            if dte <= 0:
                continue
            strike = int(sr_raw) / 1000.0
            iv_val = _nan_to_none(o.get("iv"))
            delta = _nan_to_none(o.get("delta"))
            if _is_zero_or_absent(iv_val):
                continue
            by_dte.setdefault(dte, []).append((strike, iv_val, delta or 0.0))

        if not by_dte:
            return None
        best_dte = min(by_dte.keys(), key=lambda d_: abs(d_ - target_dte))
        best_exp = (date.today() + __import__("datetime").timedelta(days=best_dte)).isoformat()
        contracts = sorted(by_dte[best_dte], key=lambda x: x[0])
        lo, hi = spot * (1 - SMILE_STRIKE_PCT), spot * (1 + SMILE_STRIKE_PCT)
        sub = [(s, iv, d) for s, iv, d in contracts if lo <= s <= hi]
        if not sub:
            return None
        return {
            "expiry": best_exp,
            "dte": best_dte,
            "strikes": [round(s, 2) for s, _, _ in sub],
            "iv": [round(iv, 6) for _, iv, _ in sub],
            "delta_call": [round(d, 4) for _, _, d in sub],
        }
    except Exception:
        return None


# ── Variance interpolation ─────────────────────────────────────────────────────

def _variance_interp(target_dte: int, raw: list[dict]) -> float | None:
    """
    Linear interpolation in total-variance space (SVI-consistent).
    raw: [{'dte': int, 'iv': float}] sorted by DTE ascending.
    Returns annualized IV as raw decimal, or None if raw is empty.
    """
    if not raw:
        return None
    tvar = [(r["dte"] / 365.0, r["iv"] ** 2 * (r["dte"] / 365.0)) for r in raw]
    t = target_dte / 365.0
    if t <= 0:
        return None

    # Bracketed interpolation
    for i in range(len(tvar) - 1):
        t1, w1 = tvar[i]
        t2, w2 = tvar[i + 1]
        if t1 <= t <= t2:
            wt = w1 + (w2 - w1) * (t - t1) / (t2 - t1) if t2 > t1 else w1
            v = math.sqrt(max(wt, 0.0) / t)
            return v if v > 0 else None

    # Flat extrapolation
    T_last, W_last = tvar[-1]
    if t > T_last:
        v = math.sqrt(W_last / T_last) if T_last > 0 else 0.0
        return v if v > 0 else None
    # t < T_first: flat short end
    T_first, W_first = tvar[0]
    v = math.sqrt(W_first / T_first) if T_first > 0 else 0.0
    return v if v > 0 else None


def _build_term(spot: float, raw: list[dict], iv_source: str) -> list[dict]:
    """
    Build the term structure list from raw ATM iv observations.
    Skips tenors where no expiry falls within ±40% of target DTE.
    Returns list of dicts matching mastermind.opts/v1 term schema.
    """
    if not raw:
        return []
    raw_dtes = [r["dte"] for r in raw]
    term = []
    for label, target_dte in TENORS.items():
        lo = target_dte * (1 - TENOR_TOLERANCE)
        hi = target_dte * (1 + TENOR_TOLERANCE)
        nearest = min(raw_dtes, key=lambda d: abs(d - target_dte))
        if not (lo <= nearest <= hi):
            continue  # no expiry within tolerance — skip this tenor
        iv = _variance_interp(target_dte, raw)
        if iv is None or iv <= 0:
            continue
        # Find the actual expiry that anchors this tenor (nearest real expiry)
        anchor = min(raw, key=lambda r: abs(r["dte"] - target_dte))
        term.append({
            "label": label,
            "dte": target_dte,
            "expiry": (date.today() + __import__("datetime").timedelta(days=anchor["dte"])).isoformat(),
            "iv": round(iv, 6),
        })
    return term


# ── Per-symbol orchestration ──────────────────────────────────────────────────

def collect_one(sym: str) -> dict | None:
    """
    Collect options data for one symbol. Returns the opts payload dict, or None on failure.
    """
    print(f"  {sym} ...", end=" ", flush=True)
    spot = None
    raw: list[dict] = []
    smile: dict | None = None
    iv_source = "yfinance"

    # ── Primary: yfinance ──
    spot, raw = _yf_atm_iv(sym)
    if spot and raw:
        smile = _yf_smile(sym, spot)

    # ── Fallback: CBOE ──
    cboe_data = None
    if not spot or not raw:
        cboe_data = _cboe_fetch(sym)
        if cboe_data:
            spot, raw = _cboe_atm_iv(cboe_data)
            iv_source = "cboe"

    if not spot or not raw:
        print("no data", flush=True)
        return None

    # Augment smile with CBOE greeks (delta) if yfinance had no delta
    if smile and (not smile.get("delta_call") or all(d == 0 for d in smile["delta_call"])):
        if cboe_data is None:
            cboe_data = _cboe_fetch(sym)
        if cboe_data:
            cboe_smile = _cboe_smile(cboe_data, spot)
            if cboe_smile and len(cboe_smile.get("delta_call", [])) == len(cboe_smile.get("strikes", [])):
                # Use CBOE smile (better greeks); fall back to yf smile if CBOE smile is shorter
                if len(cboe_smile["strikes"]) >= len(smile["strikes"]):
                    smile = cboe_smile
                    iv_source = "yfinance|cboe"

    # If primary gave no smile, try CBOE smile
    if smile is None:
        if cboe_data is None:
            cboe_data = _cboe_fetch(sym)
        if cboe_data:
            smile = _cboe_smile(cboe_data, spot)
            if smile:
                iv_source = "cboe" if iv_source == "cboe" else "yfinance|cboe"

    term = _build_term(spot, raw, iv_source)

    n_term = len(term)
    n_smile = len(smile["strikes"]) if smile else 0
    print(f"term={n_term} smile_strikes={n_smile} src={iv_source}", flush=True)

    if n_term == 0:
        return None

    payload: dict = {
        "schema": "mastermind.opts/v1",
        "ticker": sym,
        "asof": date.today().isoformat(),
        "spot": round(spot, 4),
        "term": term,
        "iv_source": iv_source,
    }
    if smile and n_smile >= 3:
        payload["smile"] = {
            "expiry": smile["expiry"],
            "dte": smile["dte"],
            "strikes": smile["strikes"],
            "iv": smile["iv"],
            "delta_call": smile["delta_call"],
        }
    else:
        payload["smile"] = None

    return payload


# ── Stale check ───────────────────────────────────────────────────────────────

def _is_stale(path: Path, stale_days: int) -> bool:
    if not path.exists():
        return True
    mtime = path.stat().st_mtime
    age_days = (time.time() - mtime) / 86400
    return age_days >= stale_days


# ── Universe helpers ──────────────────────────────────────────────────────────

def _manifest_top_us(n: int) -> list[str]:
    """Return top-N US equity symbols from manifest by dollar volume (price × vol)."""
    if not MANIFEST.exists() or n <= 0:
        return []
    try:
        m = json.loads(MANIFEST.read_text())
        rows = []
        for sym, d in m.get("symbols", {}).items():
            if sym in _NO_OPTS:
                continue
            last = d.get("last") or 0
            vol  = d.get("vol") or 0
            rows.append((sym, last * vol))
        rows.sort(key=lambda x: x[1], reverse=True)
        return [s for s, _ in rows[:n] if s not in DEFAULT_UNIVERSE]
    except Exception:
        return []


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    import argparse
    ap = argparse.ArgumentParser(description="Collect options IV → <SYM>.opts.json")
    ap.add_argument("--only",       default="",  help="comma-separated symbols override")
    ap.add_argument("--top",        type=int, default=0,
                    help="include top-N US names by manifest dollar volume")
    ap.add_argument("--stale-days", type=float, default=1.0,
                    help="skip symbols whose opts.json is fresher than N days (default 1)")
    ap.add_argument("--limit",      type=int, default=0,
                    help="process at most N symbols (for test runs)")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    if args.only:
        universe = [s.strip().upper() for s in args.only.split(",") if s.strip()]
    else:
        universe = list(DEFAULT_UNIVERSE)
        extra = _manifest_top_us(args.top)
        universe.extend(s for s in extra if s not in universe)

    if args.limit > 0:
        universe = universe[: args.limit]

    print(f"collect_options: {len(universe)} symbols, stale_days={args.stale_days}")

    ok, skipped, failed = 0, 0, 0
    for sym in universe:
        out_path = OUT / f"{sym}.opts.json"
        if not _is_stale(out_path, args.stale_days):
            print(f"  {sym} fresh — skip")
            skipped += 1
            continue
        try:
            payload = collect_one(sym)
            if payload:
                out_path.write_text(json.dumps(payload, separators=(",", ":")))
                ok += 1
            else:
                failed += 1
        except KeyboardInterrupt:
            print("\ninterrupted — progress saved", flush=True)
            break
        except Exception as exc:
            print(f"  {sym} ERROR: {exc}", file=sys.stderr)
            failed += 1

        # ~1s jitter between symbols (yfinance/CBOE etiquette)
        time.sleep(0.8 + random.random() * 0.6)

    print(f"\ndone: ok={ok} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
