#!/usr/bin/env python3
"""Alerts evaluation engine — the server-side loop the Alerts UI always implied but never had.

Runs every 5 minutes (cron, same cadence as the flagship-signal refresh). One-shot semantics:
an armed alert whose condition is met FIRES once — the row is disarmed (active=false) and the
trigger evidence is stamped into condition.triggered = {at, value, note} (zero-DDL: the alerts
table has no state columns, so state rides the jsonb the UI already renders). Re-arming is a
user action in the UI (PATCH /api/alerts strips .triggered and re-sets active).

Condition contract (see terminal/components/AlertsView.tsx COND_TYPES):
  {type:"signal", target:"BUY"|"SELL"}   fires on a flagship signal of that side whose ts is
                                         >= the alert's creation date (stale signals never fire).
                                         BUY side = {BUY, REBUY}; SELL side = {SELL, CUT}.
  {type:"regime", target:"up"}           fires while manifest regimeBull is true.
  {type:"price", op:"above"|"below", value}  live hub quote (fallback: manifest EOD last).
  {type:"rsi", op:"below", value}        Wilder RSI(14) on daily EOD closes (matches chart RSI).

Data sources (all local to the VPS): terminal/public/data/manifest.json (verdict/regime/EOD),
<SYM>.slice.json (flagship signals), <SYM>.json (daily bars), Quote-Hub :HUB_PORT/quotes (live US+crypto).
Supabase access via the service-role key in terminal/.env.local (same file the app loads).

Usage: alerts_engine.py [--dry-run] [--data-dir DIR] [--env-file FILE]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_ENV = "/opt/terminal/terminal/.env.local"
DEFAULT_DATA = "/opt/terminal/terminal/public/data"
BUY_TYPES = {"BUY", "REBUY"}
SELL_TYPES = {"SELL", "CUT"}


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}", flush=True)


def load_env(path: str) -> dict:
    env = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http_json(url: str, headers: dict | None = None, method: str = "GET", body: dict | None = None, timeout: int = 15):
    req = urllib.request.Request(url, method=method, headers=headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw.strip() else None


class Supa:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": key, "Authorization": f"Bearer {key}"}

    def active_alerts(self) -> list[dict]:
        return http_json(f"{self.base}/alerts?active=eq.true&select=*", self.h) or []

    def fire(self, alert: dict, value, note: str) -> bool:
        """Disarm + stamp trigger evidence. The active=eq.true guard makes double-fires a no-op
        even if two engine runs overlap."""
        cond = dict(alert.get("condition") or {})
        cond["triggered"] = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "value": value, "note": note}
        url = f"{self.base}/alerts?id=eq.{urllib.parse.quote(str(alert['id']))}&active=eq.true"
        http_json(url, {**self.h, "Prefer": "return=minimal"}, method="PATCH",
                  body={"active": False, "condition": cond})
        return True


def rsi14(closes: list[float], period: int = 14) -> float | None:
    """Wilder RSI, seeded with the simple mean of the first `period` deltas — matches the chart's
    RSI implementation (ChartPanel) so the alert and the sub-pane agree."""
    if len(closes) < period + 1:
        return None
    gains = losses = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    ag, al = gains / period, losses / period
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        ag = (ag * (period - 1) + max(d, 0.0)) / period
        al = (al * (period - 1) + max(-d, 0.0)) / period
    if al == 0:
        return 100.0
    rs = ag / al
    return 100.0 - 100.0 / (1.0 + rs)


class Data:
    """Lazy per-symbol data access over the on-disk store + one batched hub call."""

    def __init__(self, data_dir: str, hub_port: str | None):
        self.dir = Path(data_dir)
        self.hub_port = hub_port
        self.quotes: dict[str, dict] = {}
        manifest = json.loads((self.dir / "manifest.json").read_text())
        self.symbols: dict[str, dict] = manifest.get("symbols") or {}

    def prime_quotes(self, syms: list[str]) -> None:
        if not self.hub_port or not syms:
            return
        try:
            q = http_json(f"http://127.0.0.1:{self.hub_port}/quotes?syms={urllib.parse.quote(','.join(syms))}", timeout=5)
            if isinstance(q, dict):
                self.quotes = q
        except Exception as e:  # hub down → manifest EOD fallback, not a failure
            log(f"quote hub unavailable ({e}); falling back to manifest EOD lasts")

    def last(self, sym: str):
        q = self.quotes.get(sym)
        if q and isinstance(q.get("last"), (int, float)):
            return float(q["last"]), "live"
        m = self.symbols.get(sym) or {}
        if isinstance(m.get("last"), (int, float)):
            return float(m["last"]), "eod"
        return None, None

    def regime_bull(self, sym: str):
        m = self.symbols.get(sym)
        return None if m is None else bool(m.get("regimeBull"))

    def signals(self, sym: str) -> list[dict]:
        p = self.dir / f"{sym}.slice.json"
        if not p.exists():
            return []
        try:
            return ((json.loads(p.read_text()).get("indicator") or {}).get("signals")) or []
        except Exception:
            return []

    def rsi(self, sym: str):
        p = self.dir / f"{sym}.json"
        if not p.exists():
            return None
        try:
            bars = json.loads(p.read_text()).get("bars") or []
            closes = [b[4] for b in bars if isinstance(b, list) and len(b) >= 5]
            return rsi14(closes[-300:])  # 300 bars ≫ enough for Wilder convergence
        except Exception:
            return None


def evaluate(alert: dict, data: Data):
    """Returns (fired, value, note) — fired=None means 'cannot evaluate' (missing data), which
    logs but never disarms."""
    cond = alert.get("condition") or {}
    sym = alert.get("symbol") or ""
    ctype = cond.get("type")

    if ctype == "signal":
        want = BUY_TYPES if cond.get("target") == "BUY" else SELL_TYPES
        created = (alert.get("created_at") or "")[:10]
        for sig in reversed(data.signals(sym)):
            ts = str(sig.get("ts") or "")[:10]
            if ts < created:
                break  # signals are chronological; older than the alert → stop
            if str(sig.get("type") or "").upper() in want:
                return True, sig.get("price"), f"{sig.get('type')} signal on {ts} (strength {sig.get('strength')})"
        return False, None, ""

    if ctype == "regime":
        rb = data.regime_bull(sym)
        if rb is None:
            return None, None, "symbol missing from manifest"
        return (rb is True), rb, "regime turned bullish" if rb else ""

    if ctype == "price":
        last, basis = data.last(sym)
        if last is None:
            return None, None, "no price available"
        v = float(cond.get("value") or 0)
        hit = last > v if cond.get("op") == "above" else last < v
        return hit, last, f"price {last} {cond.get('op')} {v} ({basis})" if hit else ""

    if ctype == "rsi":
        r = data.rsi(sym)
        if r is None:
            return None, None, "no daily bars for RSI"
        v = float(cond.get("value") or 0)
        hit = r < v
        return hit, round(r, 2), f"RSI(14) {r:.1f} below {v}" if hit else ""

    return None, None, f"unknown condition type {ctype!r}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="evaluate + log, but never write to Supabase")
    ap.add_argument("--env-file", default=DEFAULT_ENV)
    ap.add_argument("--data-dir", default=DEFAULT_DATA)
    args = ap.parse_args()

    env = load_env(args.env_file)
    url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        log("FATAL: supabase url/key missing from env file")
        return 2

    supa = Supa(url, key)
    alerts = supa.active_alerts()
    if not alerts:
        log("no armed alerts — nothing to do")
        return 0

    data = Data(args.data_dir, env.get("HUB_PORT", "3100"))
    price_syms = sorted({a["symbol"] for a in alerts if (a.get("condition") or {}).get("type") == "price"})
    data.prime_quotes(price_syms)

    fired = skipped = 0
    for a in alerts:
        try:
            hit, value, note = evaluate(a, data)
        except Exception as e:
            log(f"EVAL ERROR {a.get('symbol')} {a.get('id')}: {e}")
            continue
        tag = f"{a.get('symbol')} {json.dumps((a.get('condition') or {}), separators=(',', ':'))[:80]}"
        if hit is None:
            skipped += 1
            log(f"SKIP  {tag} — {note}")
        elif hit:
            fired += 1
            log(f"FIRE  {tag} — {note}" + (" [dry-run]" if args.dry_run else ""))
            if not args.dry_run:
                supa.fire(a, value, note)
        else:
            log(f"idle  {tag}")
    log(f"done: {len(alerts)} armed, {fired} fired, {skipped} unevaluable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
