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

  Options-flow types (display-tier; algorithm is shared verbatim with terminal/lib/optionsAlerts.ts,
  parity-guarded by tests/test_alerts_options.py). Each carries per-condition hysteresis state on a
  cond sub-key that persists across runs WITHOUT firing (Supa.update_condition):
  {type:"opt_gamma_flip", root, band_pct?}          fires when spot crosses the gamma-flip level
                                                    (hysteresis dead-band = band_pct% of flip, default
                                                    0.05); first observation ARMS, never fires. State
                                                    on cond._fs = {side}. Reads Flow.gexstate(root).
  {type:"opt_wall_touch", root, wall, within_pct?}  fires on ENTER within within_pct% (default 0.25)
                                                    of the call|put wall (EOD wall level). First obs
                                                    arms; re-arms on leave. State on cond._wp={inside}.
                                                    Reads Flow.gex(root).
  {type:"opt_premium_burst", root, leg, window_min?, z?}  fires when the trailing-window per-minute
                                                    slope of the cumulative ncp|npp leg is ≥ z σ
                                                    (defaults window 10, z 2). Fire-once per minute
                                                    stamp on cond._pb={lastFiredT,lastZ}. Reads
                                                    Flow.tide().
  {type:"opt_0dte_spike", root, share_pct?}         fires when the 0d bucket's share of tracked net
                                                    premium at the latest common stamp ≥ share_pct
                                                    (default 55). Missing "0d" bucket → SKIP (honest
                                                    disable). Fire-once per stamp on cond._zd. Reads
                                                    Flow.dte().

Data sources (all local to the VPS): terminal/public/data/manifest.json (verdict/regime/EOD),
<SYM>.slice.json (flagship signals), <SYM>.json (daily bars), Quote-Hub :HUB_PORT/quotes (live US+crypto),
and the flow fixtures gexstate_fixture.json / gex_fixture.json / tide_fixture.json / dte_fixture.json
(prod: FLOW_BACKEND + R2 per terminal/lib/flowSource.ts — see Flow's TODO(prod) note).
Supabase access via the service-role key in terminal/.env.local (same file the app loads).

Usage: alerts_engine.py [--dry-run] [--data-dir DIR] [--env-file FILE]
"""
from __future__ import annotations

import argparse
import json
import math
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

    def update_condition(self, alert: dict, cond: dict) -> None:
        """Persist a condition jsonb WITHOUT firing (active stays true) — used by the stateful
        options evaluators to record a confirmed flip-side / wall-inside flag between runs so the
        hysteresis machine survives across the 5-minute cron. Guarded by active=eq.true, mirroring
        fire(), so it never resurrects an already-disarmed alert."""
        url = f"{self.base}/alerts?id=eq.{urllib.parse.quote(str(alert['id']))}&active=eq.true"
        http_json(url, {**self.h, "Prefer": "return=minimal"}, method="PATCH", body={"condition": cond})


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


class Flow:
    """Options-flow payload accessor over the on-disk fixture/data store (mirrors `Data`).

    For THIS task the disk/fixture read IS the contract: dev + parity run off the committed
    fixtures in terminal/public/data. On the VPS these arrive from the Python backend / R2 mirror
    (keys per terminal/lib/flowSource.ts r2Key()/backendPath()); the nightly/collect side writes the
    resolved files. Fail-soft: a missing file returns None → evaluate() returns fired=None → SKIP.

    # TODO(prod): resolve gexstate/gex/tide/dte via FLOW_BACKEND (http://127.0.0.1:8000) + R2 per
    # flowSource.r2Key/backendPath instead of the fixture read. Out of scope for this lane.
    """

    def __init__(self, data_dir: str):
        self.dir = Path(data_dir)
        self._cache: dict[str, dict | None] = {}

    def _load(self, name: str):
        if name in self._cache:
            return self._cache[name]
        p = self.dir / name
        val = None
        if p.exists():
            try:
                val = json.loads(p.read_text())
            except Exception:
                val = None
        self._cache[name] = val
        return val

    def gexstate(self, root: str):
        """Single-root gex_state. On the box it is per-root (gex_state_{ROOT}.json); in dev the one
        gexstate_fixture.json stands in. Returns the dict only when its root matches (or when the
        per-root file exists), else None → honest 'unavailable'."""
        specific = self._load(f"gex_state_{root}.json")
        if isinstance(specific, dict):
            return specific
        fx = self._load("gexstate_fixture.json")
        if isinstance(fx, dict) and (not root or str(fx.get("root", "")).upper() == root.upper()):
            return fx
        return None

    def gex(self, root: str):
        """Per-symbol EOD gex payload, keyed by root in gex_fixture.json."""
        fx = self._load("gex_fixture.json")
        if isinstance(fx, dict):
            hit = fx.get(root) or fx.get(root.upper())
            if isinstance(hit, dict):
                return hit
        return None

    def tide(self):
        fx = self._load("tide_fixture.json")
        return fx if isinstance(fx, dict) else None

    def dte(self):
        fx = self._load("dte_fixture.json")
        return fx if isinstance(fx, dict) else None


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(float(x))


def _as_of(asof) -> str:
    return f"as of {asof}" if asof else "as of unknown time"


def _session_slope_stats(series: list[float], window: int):
    """Slope stats for a CUMULATIVE series (ports optionsAlerts.ts sessionSlopeStats). Per-step
    deltas d[i]=series[i]-series[i-1]; trailing `window` deltas → recent mean; ALL deltas → session
    mean + POPULATION std; z=(recentMean-mean)/std. std==0 → z=None (un-z-scoreable flat tape)."""
    deltas = [series[i] - series[i - 1] for i in range(1, len(series))]
    n = len(deltas)
    if n == 0:
        return {"recentMean": None, "mean": None, "std": None, "z": None, "n": 0}
    mean = sum(deltas) / n
    var = sum((d - mean) ** 2 for d in deltas) / n  # population
    std = math.sqrt(var)
    w = max(1, min(window, n))
    recent = deltas[n - w:]
    recent_mean = sum(recent) / len(recent)
    z = None if std == 0 else (recent_mean - mean) / std
    return {"recentMean": recent_mean, "mean": mean, "std": std, "z": z, "n": n}


def _eval_gamma_flip(cond: dict, gs, prev: dict):
    """Ports evalGammaFlipCross — hysteresis dead-band, first-obs arms, fire-once per cross."""
    spot = gs.get("spot") if isinstance(gs, dict) else None
    flip = gs.get("gamma_flip") if isinstance(gs, dict) else None
    if not _finite(spot) or not _finite(flip):
        return None, None, "gamma-flip level unavailable", prev
    band = cond["band_pct"] if _finite(cond.get("band_pct")) else 0.05
    raw_side = "above" if spot >= flip else "below"
    prior = prev.get("side") if isinstance(prev.get("side"), str) else None
    beyond = flip != 0 and (abs(spot - flip) / flip) * 100 > band
    if prior is None:
        confirmed = raw_side
    elif raw_side != prior and beyond:
        confirmed = raw_side
    else:
        confirmed = prior
    nxt = {"side": confirmed}
    if prior is not None and confirmed != prior:
        root = cond.get("root") or (gs.get("root") if isinstance(gs, dict) else None) or "the underlying"
        if confirmed == "above":
            dirtxt = f"crossed above its gamma flip ({flip}) → long-gamma side"
        else:
            dirtxt = f"crossed below its gamma flip ({flip}) → short-gamma side"
        note = f"{root} {dirtxt} · {_as_of(gs.get('asof'))}, intraday"
        return True, spot, note, nxt
    return False, spot, "", nxt


def _eval_wall(cond: dict, gx, prev: dict):
    """Ports evalWallProximity — fire on ENTER (false->true), first-obs arms, note says EOD."""
    spot = gx.get("spot_ref") if isinstance(gx, dict) else None
    wall_side = "put" if cond.get("wall") == "put" else "call"
    wall = (gx.get("put_wall") if wall_side == "put" else gx.get("call_wall")) if isinstance(gx, dict) else None
    if not _finite(spot) or not _finite(wall) or wall == 0:
        return None, None, "wall level unavailable", prev
    within = cond["within_pct"] if _finite(cond.get("within_pct")) else 0.25
    dist_pct = (abs(spot - wall) / wall) * 100
    inside = dist_pct <= within
    prior = prev.get("inside") if isinstance(prev.get("inside"), bool) else None
    nxt = {"inside": inside}
    if inside and prior is False:
        root = cond.get("root") or (gx.get("root") if isinstance(gx, dict) else None) or "the underlying"
        note = f"{root} within {within}% of its {wall_side} wall ({wall}) — EOD wall level · {_as_of(gx.get('asof'))}"
        return True, spot, note, nxt
    return False, spot, "", nxt


def _eval_premium_burst(cond: dict, tide, prev: dict):
    """Ports evalPremiumBurst — per-minute-delta z on the cumulative leg, fire-once per stamp."""
    leg = "npp" if cond.get("leg") == "npp" else "ncp"
    window_min = int(cond["window_min"]) if _finite(cond.get("window_min")) else 10
    z_thresh = cond["z"] if _finite(cond.get("z")) else 2
    mins = tide.get("minutes") if isinstance(tide, dict) else None
    if not isinstance(mins, list) or len(mins) < window_min + 2:
        return None, None, "not enough tape for pace check", prev
    series = []
    for m in mins:
        v = m.get(leg) if isinstance(m, dict) else None
        if not _finite(v):
            return None, None, "not enough tape for pace check", prev
        series.append(float(v))
    stats = _session_slope_stats(series, window_min)
    if stats["std"] is None or not math.isfinite(stats["std"]) or stats["std"] == 0:
        return None, None, "flat tape", prev
    z = stats["z"]
    latest_t = (mins[-1].get("t") if isinstance(mins[-1], dict) else None) or ""
    fires = abs(z) >= z_thresh
    already = prev.get("lastFiredT") == latest_t
    zval = round(z, 2)
    if fires:
        nxt = {"lastFiredT": latest_t, "lastZ": zval}
    else:
        nxt = {"lastFiredT": prev.get("lastFiredT"), "lastZ": prev.get("lastZ")}
    if fires and not already:
        root = cond.get("root") or "the underlying"
        legw = "net-put premium" if leg == "npp" else "net-call premium"
        note = f"{root} {legw} moving at an unusual pace (z {z:.1f}, last {window_min}m) · intraday tape {_as_of(tide.get('asof'))}"
        return True, zval, note, nxt
    return False, zval, "", nxt


def _eval_0dte(cond: dict, dte, prev: dict):
    """Ports eval0dteShare — 0d share of tracked net premium at the latest common stamp. Missing
    '0d' bucket → None (honest disable, never fabricated)."""
    buckets = dte.get("buckets") if isinstance(dte, dict) else None
    if not isinstance(buckets, dict) or not isinstance(buckets.get("0d"), list):
        return None, None, "0DTE split unavailable", prev
    share_pct = cond["share_pct"] if _finite(cond.get("share_pct")) else 55
    keys = [k for k in buckets if isinstance(buckets[k], list)]
    stamp_sets = [set(r.get("t") for r in buckets[k] if isinstance(r, dict)) for k in keys]
    common = set.intersection(*stamp_sets) if stamp_sets else set()
    common.discard(None)
    if not common:
        return None, None, "0DTE split unavailable", prev
    stamp = sorted(common)[-1]

    def mag_at(rows):
        row = next((r for r in rows if isinstance(r, dict) and r.get("t") == stamp), None)
        if not row:
            return 0.0
        ncp = abs(row["ncp"]) if _finite(row.get("ncp")) else 0.0
        npp = abs(row["npp"]) if _finite(row.get("npp")) else 0.0
        return ncp + npp

    total = sum(mag_at(buckets[k]) for k in keys)
    zero_mag = mag_at(buckets["0d"])
    if total == 0:
        return None, None, "0DTE split unavailable", prev
    share = (zero_mag / total) * 100
    fires = share >= share_pct
    already = prev.get("lastFiredT") == stamp
    nxt = {"lastFiredT": stamp} if fires else {"lastFiredT": prev.get("lastFiredT")}
    if fires and not already:
        root = cond.get("root") or "the underlying"
        note = f"{root} 0DTE share {share:.0f}% of tracked net premium · 10-min DTE tape {_as_of(dte.get('asof'))}"
        return True, round(share, 1), note, nxt
    return False, round(share, 1), "", nxt


# Options-alert condition types that carry per-condition hysteresis state on a cond sub-key.
# The tuple is (state-key, evaluator, payload-getter). The engine persists nxt back to that
# sub-key when it changed but did NOT fire (see main()), so the state machine survives across runs.
_OPT_EVALUATORS = {
    "opt_gamma_flip": ("_fs", _eval_gamma_flip, lambda cond, flow: flow.gexstate(cond.get("root") or "")),
    "opt_wall_touch": ("_wp", _eval_wall, lambda cond, flow: flow.gex(cond.get("root") or "")),
    "opt_premium_burst": ("_pb", _eval_premium_burst, lambda cond, flow: flow.tide()),
    "opt_0dte_spike": ("_zd", _eval_0dte, lambda cond, flow: flow.dte()),
}


def evaluate(alert: dict, data: Data, flow: "Flow | None" = None):
    """Returns (fired, value, note, nextState) — fired=None means 'cannot evaluate' (missing data),
    which logs but never disarms. nextState is a dict ONLY for the stateful options types (the caller
    persists it on a non-firing change); it is None for the legacy signal/regime/price/rsi types."""
    cond = alert.get("condition") or {}
    sym = alert.get("symbol") or ""
    ctype = cond.get("type")

    if ctype in _OPT_EVALUATORS:
        state_key, fn, getter = _OPT_EVALUATORS[ctype]
        if flow is None:
            return None, None, "flow feed unavailable", None
        prev = cond.get(state_key) if isinstance(cond.get(state_key), dict) else {}
        payload = getter(cond, flow)
        return fn(cond, payload, prev)

    if ctype == "signal":
        want = BUY_TYPES if cond.get("target") == "BUY" else SELL_TYPES
        created = (alert.get("created_at") or "")[:10]
        for sig in reversed(data.signals(sym)):
            ts = str(sig.get("ts") or "")[:10]
            if ts < created:
                break  # signals are chronological; older than the alert → stop
            if str(sig.get("type") or "").upper() in want:
                return True, sig.get("price"), f"{sig.get('type')} signal on {ts} (strength {sig.get('strength')})", None
        return False, None, "", None

    if ctype == "regime":
        rb = data.regime_bull(sym)
        if rb is None:
            return None, None, "symbol missing from manifest", None
        return (rb is True), rb, "regime turned bullish" if rb else "", None

    if ctype == "price":
        last, basis = data.last(sym)
        if last is None:
            return None, None, "no price available", None
        v = float(cond.get("value") or 0)
        hit = last > v if cond.get("op") == "above" else last < v
        return hit, last, f"price {last} {cond.get('op')} {v} ({basis})" if hit else "", None

    if ctype == "rsi":
        r = data.rsi(sym)
        if r is None:
            return None, None, "no daily bars for RSI", None
        v = float(cond.get("value") or 0)
        hit = r < v
        return hit, round(r, 2), f"RSI(14) {r:.1f} below {v}" if hit else "", None

    return None, None, f"unknown condition type {ctype!r}", None


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
    flow = Flow(args.data_dir)
    price_syms = sorted({a["symbol"] for a in alerts if (a.get("condition") or {}).get("type") == "price"})
    data.prime_quotes(price_syms)

    fired = skipped = 0
    for a in alerts:
        try:
            hit, value, note, nxt = evaluate(a, data, flow)
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
                supa.fire(a, value, note)  # disarm + stamp; the fired cond need not carry state
        else:
            log(f"idle  {tag}")
            # Stateful options types: persist the confirmed flip-side / wall-inside flag between
            # runs (active stays true) so the hysteresis machine survives the 5-min cron. Only
            # when it actually changed — avoid a needless PATCH every run.
            ctype = (a.get("condition") or {}).get("type")
            if isinstance(nxt, dict) and ctype in _OPT_EVALUATORS:
                state_key = _OPT_EVALUATORS[ctype][0]
                cur = (a.get("condition") or {}).get(state_key)
                if cur != nxt:
                    cond = dict(a.get("condition") or {})
                    cond[state_key] = nxt
                    if not args.dry_run:
                        supa.update_condition(a, cond)
    log(f"done: {len(alerts)} armed, {fired} fired, {skipped} unevaluable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
