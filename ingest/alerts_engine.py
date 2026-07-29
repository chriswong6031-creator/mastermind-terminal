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
                                                    slope of the cumulative ncp|npp leg runs ≥ z
                                                    standard errors ABOVE the baseline that PRECEDES
                                                    that window (defaults window 10, z 2). One-sided
                                                    (hot only); baseline must be ≥ MIN_BASELINE_MULT×
                                                    the window or the result is an honest null.
                                                    Fire-once per minute stamp on cond._pb=
                                                    {lastFiredT,lastZ}. Reads Flow.tide().
  {type:"opt_0dte_spike", root, share_pct?}         fires when the 0d bucket's share of tracked net
                                                    premium at the latest common stamp ≥ share_pct
                                                    (default 55). Missing "0d" bucket → SKIP (honest
                                                    disable). Fire-once per stamp on cond._zd. Reads
                                                    Flow.dte().
  {type:"opt_surface_pocket", root, k?, near_pct?, metric?}  fires when a single strike × interval
                                                    cell on the newest Flow-Surface snapshot, at a
                                                    strike within near_pct% of spot (default 5),
                                                    carries |net premium| ≥ k× (default 4) the mean
                                                    |cell| over the SAME strikes in the intervals
                                                    before it. No surface for the root → SKIP.
                                                    Fire-once per interval on cond._sp. Reads
                                                    Flow.surface(root).

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

    def surface(self, root: str):
        """Latest Flow-Surface frame for a root, via the store's own chain:
        surface_idx:{ROOT} → latest stamp → surface:{ROOT}:{STAMP}.

        Mirrors terminal/lib/flowSource.ts fixtureFor(): the fixture holds ONE canonical
        full-day frame per root, truncated to the intervals realized as of the requested
        stamp. Unknown root (or an index with no stamps) → None → the evaluator's honest
        'no surface for this root yet' null.
        """
        if not root:
            return None
        key = root.upper()
        idx_all = self._load("surface_idx_fixture.json")
        idx = idx_all.get(key) if isinstance(idx_all, dict) else None
        if not isinstance(idx, dict):
            return None
        stamps = idx.get("stamps") if isinstance(idx.get("stamps"), list) else []
        latest = idx.get("latest")
        if not latest or not stamps:
            return None
        surf_all = self._load("surface_fixture.json")
        full = surf_all.get(key) if isinstance(surf_all, dict) else None
        if not isinstance(full, dict):
            return None
        frame_stamps = full.get("stamps") if isinstance(full.get("stamps"), list) else []
        times = full.get("time_steps") if isinstance(full.get("time_steps"), list) else []
        i = frame_stamps.index(latest) if latest in frame_stamps else -1
        upto = i + 1 if i >= 0 else len(times)  # unknown stamp → full day (flowSource parity)
        grids_full = full.get("grids") if isinstance(full.get("grids"), dict) else {}
        grids = {m: [row[:upto] for row in g] for m, g in grids_full.items() if isinstance(g, list)}
        spot_path = full.get("spot_path") if isinstance(full.get("spot_path"), list) else None
        spot = full.get("spot")
        if spot_path and 0 <= upto - 1 < len(spot_path):
            spot = spot_path[upto - 1]
        return {
            "spot": spot,
            "price_levels": full.get("price_levels"),
            "time_steps": times[:upto],
            "grids": grids,
            "asof": full.get("asof"),
            "cadence": full.get("cadence"),
            "root": key,
            "session_date": full.get("session_date"),
        }


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(float(x))


def _as_of(asof) -> str:
    return f"as of {asof}" if asof else "as of unknown time"


# The baseline must be at least this multiple of the test window before a pace can be called
# "unusual" (mirrors optionsAlerts.ts MIN_BASELINE_MULT).
MIN_BASELINE_MULT = 2
# Intervals of trailing surface history required before a hot pocket can be scored.
MIN_SURFACE_COLS = 3


def _session_slope_stats(series: list[float], window: int):
    """Slope stats for a CUMULATIVE series (ports optionsAlerts.ts sessionSlopeStats).

    Per-step deltas d[i]=series[i]-series[i-1]. The trailing `window` deltas are the TEST
    window; the deltas STRICTLY BEFORE it are the baseline. The statistic is winMean −
    baseMean, a comparison of TWO sample means, so it is judged against the standard error
    of THAT difference — base_std*sqrt(1/w + 1/base_n) — not the one-sample base_std/sqrt(w),
    which treats the baseline mean as a known constant and drops its own sampling error.
    At the minimum baseline this guard admits (base_n = 2w) that omission inflates z by
    exactly sqrt(1.5) ~ 22.5%: a "2 sigma" alert really fired at 1.63 sigma. The one-sample
    form is only the baseN -> infinity special case.

    This SE must stay byte-for-byte equivalent to optionsAlerts.ts (the TS is the source of
    truth and drives the same alerts client-side); tests/test_alerts_options.py mirrors the
    vitest expectations verbatim as the parity guard.

    z=None (with `why`) whenever it is not scoreable: too little baseline, or a flat baseline.
    """
    deltas = [series[i] - series[i - 1] for i in range(1, len(series))]
    n = len(deltas)
    if n == 0:
        return {"winMean": None, "baseMean": None, "baseStd": None, "se": None, "z": None,
                "n": 0, "w": 0, "baseN": 0, "why": "no tape"}
    w = max(1, min(int(window) or 1, n))
    base_n = max(0, n - w)
    blank = {"winMean": None, "baseMean": None, "baseStd": None, "se": None, "z": None,
             "n": n, "w": w, "baseN": base_n}
    # Min-sample guard — an honest null beats a z off a handful of samples.
    if base_n < MIN_BASELINE_MULT * w:
        return {**blank, "why": "not enough baseline before the window"}

    base = deltas[:base_n]
    win = deltas[base_n:]
    win_mean = sum(win) / w
    base_mean = sum(base) / base_n
    var = sum((d - base_mean) ** 2 for d in base) / base_n  # population
    base_std = math.sqrt(var)
    if not base_std > 0:
        return {**blank, "winMean": win_mean, "baseMean": base_mean, "baseStd": base_std,
                "why": "flat baseline"}
    # Two-sample SE of (win_mean − base_mean): base_std*sqrt(1/w + 1/base_n). The 1/base_n
    # term is the piece the old base_std/sqrt(w) form dropped (optionsAlerts.ts:215).
    se = base_std * math.sqrt(1 / w + 1 / base_n)
    return {"winMean": win_mean, "baseMean": base_mean, "baseStd": base_std, "se": se,
            "z": (win_mean - base_mean) / se, "n": n, "w": w, "baseN": base_n, "why": ""}


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
    """Ports evalPremiumBurst — per-minute-delta z on the cumulative leg, fire-once per stamp.

    ONE-SIDED: only a HOT pace fires. The old two-sided abs(z) also fired on a tape that had
    gone unusually QUIET, which is the opposite of what the alert promises.
    """
    leg = "npp" if cond.get("leg") == "npp" else "ncp"
    window_min = max(1, int(cond["window_min"])) if _finite(cond.get("window_min")) else 10
    z_thresh = cond["z"] if _finite(cond.get("z")) else 2
    mins = tide.get("minutes") if isinstance(tide, dict) else None
    # Window + baseline: (1+MIN_BASELINE_MULT)*w deltas → one more sample than that.
    need = (1 + MIN_BASELINE_MULT) * window_min + 1
    if not isinstance(mins, list) or len(mins) < need:
        return None, None, "not enough tape for pace check", prev
    series = []
    for m in mins:
        v = m.get(leg) if isinstance(m, dict) else None
        if not _finite(v):
            return None, None, "not enough tape for pace check", prev
        series.append(float(v))
    stats = _session_slope_stats(series, window_min)
    z = stats["z"]
    if z is None or not math.isfinite(z):
        return None, None, stats.get("why") or "pace not scoreable", prev
    latest_t = (mins[-1].get("t") if isinstance(mins[-1], dict) else None) or ""
    fires = z >= z_thresh
    already = prev.get("lastFiredT") == latest_t
    zval = round(z, 2)
    if fires:
        nxt = {"lastFiredT": latest_t, "lastZ": zval}
    else:
        nxt = {"lastFiredT": prev.get("lastFiredT"), "lastZ": prev.get("lastZ")}
    if fires and not already:
        root = cond.get("root") or "the underlying"
        legw = "net-put premium" if leg == "npp" else "net-call premium"
        note = (f"{root} {legw} moving at an unusual pace (z {z:.1f}, last {window_min}m vs the "
                f"{stats['baseN']}m before it) · intraday tape {_as_of(tide.get('asof'))}")
        return True, zval, note, nxt
    return False, zval, "", nxt


def _eval_surface_pocket(cond: dict, frame, prev: dict):
    """Ports evalSurfaceHotPocket — a single strike x interval cell on the Flow-Surface that is
    running hot near spot.

    Scale = MEAN |cell| over the same near-spot strikes in the intervals STRICTLY BEFORE the
    newest one (same baseline-exclusion discipline as the premium-burst z). Tri-state null when
    there is no surface for the root, too few intervals, no strikes in the band, or a zero scale.
    """
    metric = cond.get("metric") if isinstance(cond.get("metric"), str) and cond.get("metric") else "netprem"
    k = cond["k"] if _finite(cond.get("k")) and cond["k"] > 0 else 4
    near_pct = cond["near_pct"] if _finite(cond.get("near_pct")) and cond["near_pct"] > 0 else 5
    levels = frame.get("price_levels") if isinstance(frame, dict) else None
    steps = frame.get("time_steps") if isinstance(frame, dict) else None
    grids = frame.get("grids") if isinstance(frame, dict) else None
    grid = grids.get(metric) if isinstance(grids, dict) else None
    spot = frame.get("spot") if isinstance(frame, dict) else None
    if (not isinstance(levels, list) or not isinstance(steps, list) or not isinstance(grid, list)
            or not _finite(spot) or spot <= 0):
        return None, None, "no surface for this root yet", prev
    t_last = len(steps) - 1
    if t_last < MIN_SURFACE_COLS:
        return None, None, "not enough surface history to scale", prev
    rows = [i for i, lv in enumerate(levels) if _finite(lv) and (abs(lv - spot) / spot) * 100 <= near_pct]
    if not rows:
        return None, None, "no strikes near spot on the surface", prev

    total = 0.0
    cnt = 0
    for r in rows:
        row = grid[r] if r < len(grid) else None
        if not isinstance(row, list):
            continue
        for t in range(min(t_last, len(row))):
            v = row[t]
            if _finite(v):
                total += abs(v)
                cnt += 1
    if cnt == 0 or total == 0:
        return None, None, "surface too sparse to scale", prev
    scale = total / cnt

    hot = 0.0
    hot_level = None
    for r in rows:
        row = grid[r] if r < len(grid) else None
        v = row[t_last] if isinstance(row, list) and t_last < len(row) else None
        if not _finite(v):
            continue
        if hot_level is None or abs(v) > abs(hot):
            hot, hot_level = float(v), levels[r]
    if hot_level is None:
        return None, None, "no surface reading at the latest interval", prev

    ratio = abs(hot) / scale
    stamp = steps[t_last] or ""
    fires = ratio >= k
    already = prev.get("lastFiredT") == stamp
    rval = round(ratio, 2)
    if fires:
        nxt = {"lastFiredT": stamp, "lastRatio": rval, "lastStrike": hot_level}
    else:
        nxt = {"lastFiredT": prev.get("lastFiredT"), "lastRatio": prev.get("lastRatio"),
               "lastStrike": prev.get("lastStrike")}
    if fires and not already:
        root = cond.get("root") or (frame.get("root") if isinstance(frame, dict) else None) or "the underlying"
        side = "call-side" if hot >= 0 else "put-side"
        note = (f"{root} {hot_level} strike lit up {ratio:.1f}× its usual cell on the surface "
                f"({side} net premium at {stamp}, strikes within {near_pct}% of spot) · "
                f"{_as_of(frame.get('asof'))}")
        return True, rval, note, nxt
    return False, rval, "", nxt


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
    "opt_surface_pocket": ("_sp", _eval_surface_pocket, lambda cond, flow: flow.surface(cond.get("root") or "")),
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
