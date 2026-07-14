"""Brain/Macro intel bridge (HANDOFF §7.6).

Deployed to /opt/terminal/ingest by terminal-build.sh's runtime sync (see DEPLOY.md) —
merged changes reach the box on the next deploy, not before.

For each equity symbol in the Mastermind Terminal universe, reads the Macro Dashboard's
per-stock JSON (site/stockdata/<SYM>.json) and writes a trimmed, versioned
terminal/public/data/<SYM>.intel.json in the ``intel/v1`` shape.

#18 bridge-contract fix (2026-07-01):
  1. ai_lean.dir is now a pure function of decision.band + entry_signal.status via an
     explicit mapping table — never derived from a single scalar (ladder.dir was the
     prior bug: ladder.dir='up' → BULL even while decision.band='neutral', score=50).
  2. Freshness gate: source asof older than MAX_STALE_DAYS trading-calendar days →
     stale=True; ai_lean is replaced by abstain=True (panel/copilot must not use a
     stale lean as a live signal).
  3. MACRO_STOCKDATA is read from MACRO_STOCKDATA env var (falls back to a sane
     path-relative default); a missing directory is logged loudly rather than silently
     producing empty output.
  4. This script is wired into the nightly VPS refresh /usr/local/bin/terminal-data,
     whose canonical source is the macro repo's app/deploy/terminal-refresh.sh
     (ingest/terminal-refresh.sh here is a pointer stub only).

sector_pulse pass-through (feat/sector-pulse-intel):
  5. When the source stockdata JSON contains a top-level ``sector_pulse`` block, a
     trimmed subset is forwarded into the intel/v1 output under ``tape.sector_pulse``.
     Trimmed shape: {theme_id, theme_name, heat, label, reco, rank, n_themes,
     rank_delta_5d, as_of}.
     heat ∈ heating | hot | cooling | broken | idle.
  6. Stale gate applies: when tape.stale is True the sector_pulse block is dropped
     entirely (not emitted as null) so the panel cannot display a stale heat as live.
  7. Absent/null source sector_pulse → field omitted from output (never null).
     Consumers MUST handle missing field — presence is not guaranteed.

Crypto symbols (BTC-USD, ETH-USD, SOL-USD, XRP-USD) and any symbol missing a source
file are silently skipped (no source file in stockdata/).

Usage:
    python ingest/pull_macro_intel.py [SYM ...]
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.build_polygon_universe import DEFAULT, META  # noqa: E402

# ── path ───────────────────────────────────────────────────────────────────────
# Prefer the env var; fall back to the standard relative position from the repo root
# so the script works in worktrees and CI without hard-coded absolute paths.
_env_path = os.environ.get("MACRO_STOCKDATA")
if _env_path:
    MACRO_STOCKDATA = Path(_env_path)
else:
    # Default: assume charting-app sits next to the macro repo as a sibling
    MACRO_STOCKDATA = ROOT.parent / "Macro Dashboard" / "site" / "stockdata"

OUT = ROOT / "terminal" / "public" / "data"

# ── freshness ──────────────────────────────────────────────────────────────────
# Allow up to this many calendar days of lag before treating a snapshot as stale.
# 3 trading days ≈ 5 calendar days (with weekend buffer); using 5 is conservative
# but safe when no trading-calendar helper is available.
MAX_STALE_DAYS: int = int(os.environ.get("INTEL_MAX_STALE_DAYS", "5"))

# ── R2 stockdata sync ─────────────────────────────────────────────────────────
# site/stockdata/ was gitignored from the macro repo on 2026-07-01 and now lives
# exclusively on R2.  This leg mirrors the public bucket into MACRO_STOCKDATA so
# pull_macro_intel can read it regardless of how the VPS checkout is set up.
# No credentials: the bucket is publicly readable (same URL the browser clients use).
# Cloudflare WAF blocks the default Python-urllib User-Agent — must send a custom one.
_R2_BASE     = os.environ.get("MACRO_R2_BASE",
                               "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev")
_R2_UA       = "mastermind-feed/1.0"
_R2_DIR      = "stockdata"
_R2_TIMEOUT  = 30        # seconds per request
_R2_WORKERS  = 16
_R2_META     = ".r2_sync.json"   # local stamp: {"etag": "...", "count": N}

# ── factordata (tech lab) ──────────────────────────────────────────────────────
# tech_lab.json — per-signal descriptive profiles (64 signals; fetched once per run).
# tech_events/<SYM>.json — per-symbol fire dates (only available for covered symbols).
# Both are on the public macro site; 404 / timeout → omit the tech block entirely.
_FACTORDATA_BASE = os.environ.get(
    "FACTORDATA_BASE", "https://mastermind-x.com/factordata"
)
_FACTORDATA_UA      = "mastermind-feed/1.0"
_FACTORDATA_TIMEOUT = 20   # seconds per request — tech_lab.json is ~20–80KB
_TECH_LAB_LOG_ONCE: set = set()  # suppress repeated 404/error log per URL

log = logging.getLogger(__name__)


def _r2_fetch(url: str) -> tuple[bytes, str] | None:
    """GET url → (body, etag) or None on any error."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _R2_UA})
        with urllib.request.urlopen(req, timeout=_R2_TIMEOUT) as r:
            return r.read(), (r.headers.get("ETag") or "").strip('"')
    except Exception:
        return None


def sync_r2_stockdata(dest: Path) -> int | None:
    """Mirror the R2 stockdata dir into *dest*.

    Returns the number of files written (0 = ETag fast-path, nothing changed)
    or None when the sync could not run.  Never raises — keeps the last-good
    local mirror intact on any failure.

    The sync destination is always MACRO_STOCKDATA so pull_macro_intel reads
    fresh files regardless of whether the VPS git checkout carries them.
    """
    try:
        got = _r2_fetch(f"{_R2_BASE}/{_R2_DIR}/_manifest.json")
        if not got:
            return None
        try:
            names = [str(n) for n in json.loads(got[0])["files"]]
        except Exception:
            return None
        tag, meta_path = got[1], dest / _R2_META
        try:  # ETag fast-path: same manifest + local count matches → nothing to do
            if tag and json.loads(meta_path.read_text()).get("etag") == tag \
                    and sum(1 for _ in dest.glob("*.json")) >= len(names):
                return 0
        except Exception:
            pass
        dest.mkdir(parents=True, exist_ok=True)

        def _pull(name: str) -> bool:
            result = _r2_fetch(f"{_R2_BASE}/{_R2_DIR}/{name}")
            if not result:
                return False
            out = dest / name
            tmp = out.with_name(f".{out.name}.tmp")
            tmp.write_bytes(result[0])
            tmp.replace(out)
            return True

        with ThreadPoolExecutor(max_workers=_R2_WORKERS) as ex:
            results = list(ex.map(_pull, names))
        failed = [n for n, r in zip(names, results) if not r]
        # Transient rate-limit failures under full parallelism resolve on narrower
        # passes (observed 2026-07-04: 1023/1666 failed at 16 workers, yet every
        # straggler succeeded when fetched individually).
        for pause, workers in ((2, 4), (5, 2)):
            if not failed or len(failed) == len(names):
                break
            time.sleep(pause)
            with ThreadPoolExecutor(max_workers=workers) as ex:
                retry = list(ex.map(_pull, failed))
            failed = [n for n, r in zip(failed, retry) if not r]
        ok = len(names) - len(failed)
        if failed:
            log.warning("R2 sync incomplete: %d/%d files failed (will retry next run)",
                        len(failed), len(names))
        if ok == len(names) and tag:   # only stamp a complete sync
            meta_path.write_text(json.dumps({"etag": tag, "count": ok}))
        return ok
    except Exception:
        return None

# ── ai_lean mapping table ──────────────────────────────────────────────────────
# HARD INVARIANT: dir must never contradict decision.band.
#
# decision.band values observed in production (2026-07-01 audit):
#   'high'         — high-conviction opportunity
#   'constructive' — setup forming, not yet confirmed
#   'neutral'      — no clear edge
#   'low'          — weak / avoid
#   ''  / None     — missing
#
# entry_signal.status values observed:
#   'buy_now', 'buy_soon', 'partial'      → active entry signals
#   'watch', 'wait_pullback'              → conditional / not yet
#   'hold', 'extended', 'blocked'         → no entry
#   'topping', 'exit'                     → exit / avoid
#   '' / None                             → missing
#
# Mapping logic (in priority order):
#   1. If decision.band is missing/empty → NEUTRAL (insufficient data, abstain)
#   2. band='low' OR entry='exit'/'topping' → BEAR
#   3. band='high' AND entry in buy family  → BULL
#   4. band='constructive' AND entry in buy family → BULL
#   5. Everything else → NEUTRAL
#      (includes: high-band but entry=blocked/extended, constructive but entry=watch, etc.)
#
# NEVER derive dir from ladder.dir alone — it is a price-regime descriptor, not an
# actionable directional lean (a stock can have ladder.dir='up' while decision.band='neutral').

_BUY_ENTRIES = frozenset({"buy_now", "buy_soon", "partial"})
_EXIT_ENTRIES = frozenset({"exit", "topping"})


def _map_ai_dir(band: str | None, entry_status: str | None) -> str:
    """Map (decision.band, entry_signal.status) → BULL | BEAR | NEUTRAL.

    This is the single canonical mapping for the intel bridge.  Every path through
    build_intel must call this function — never inline the logic.
    """
    b = (band or "").lower().strip()
    e = (entry_status or "").lower().strip()

    # 1. No band → can't determine direction
    if not b:
        return "NEUTRAL"

    # 2. Bearish band or active exit signals → BEAR
    if b == "low" or e in _EXIT_ENTRIES:
        return "BEAR"

    # 3. Bullish band + confirmed entry → BULL
    if b in ("high", "constructive") and e in _BUY_ENTRIES:
        return "BULL"

    # 4. Everything else → NEUTRAL (includes high-band but entry blocked/extended/hold)
    return "NEUTRAL"


# ── helpers ────────────────────────────────────────────────────────────────────

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


# ── sector_pulse helpers ───────────────────────────────────────────────────────
# HARD INVARIANT: only these heat values are forwarded to the Terminal.
# Any unrecognised value from the source is dropped (treat as absent) so a
# future dashboard experiment cannot push an unknown label into the UI.
_VALID_HEAT = frozenset({"heating", "hot", "cooling", "broken", "idle"})


def _build_sector_pulse(src_pulse: object) -> dict | None:
    """Extract a trimmed sector_pulse dict from the raw stockdata block.

    Returns None when the block is absent, null, not a dict, or contains no
    recognisable heat value.  Callers that receive None must omit the field from
    the output entirely — never write ``sector_pulse: null``.

    Trimmed fields passed through:
        theme_id, theme_name, heat, label, reco, rank, n_themes, rank_delta_5d, as_of

    Fields intentionally omitted (dashboard-internal / too large for terminal):
        theme_name_zh, theme_ids (list), region
    """
    if not isinstance(src_pulse, dict):
        return None

    heat = _str(src_pulse.get("heat"))
    if not heat or heat not in _VALID_HEAT:
        return None  # unknown or missing heat → treat as absent

    out: dict = {"heat": heat}

    for key in ("theme_id", "theme_name", "label", "reco", "as_of"):
        v = _str(src_pulse.get(key))
        if v is not None:
            out[key] = v

    for key in ("rank", "n_themes"):
        v = src_pulse.get(key)
        if v is not None:
            try:
                out[key] = int(v)
            except (TypeError, ValueError):
                pass

    v_delta = src_pulse.get("rank_delta_5d")
    if v_delta is not None:
        rounded = _r(v_delta, 1)
        if rounded is not None:
            out["rank_delta_5d"] = rounded

    return out


def _is_stale(asof: str | None, today: date, max_days: int) -> bool:
    """Return True if asof is absent or older than max_days calendar days."""
    if not asof:
        return True
    try:
        src_date = date.fromisoformat(str(asof)[:10])
    except (ValueError, TypeError):
        return True
    return (today - src_date).days >= max_days


# ── core builder ───────────────────────────────────────────────────────────────

def build_intel(sym: str, src: dict, today: date | None = None) -> dict:
    """Map a Macro Dashboard stockdata dict → intel/v1 contract.

    The ``today`` parameter exists for testing (pass a fixed date to make freshness
    assertions deterministic).  Production callers omit it and get date.today().
    """
    if today is None:
        today = date.today()

    # --- helpers to navigate nested dicts safely ---
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

    asof = _str(src.get("asof"))

    # ── freshness gate ───────────────────────────────────────────────────────
    stale = _is_stale(asof, today, MAX_STALE_DAYS)

    # ── field extraction ─────────────────────────────────────────────────────
    view = src.get("view") or {}
    decision = g(view, "decision") or {}
    conviction = src.get("conviction") or {}
    ladder = src.get("ladder") or {}
    gex = src.get("gex") or {}
    positioning = src.get("positioning") or {}
    entry_signal = src.get("entry_signal") or {}

    decision_band = _str(g(decision, "band"))
    entry_status = _str(entry_signal.get("status"))
    headline = _str(g(decision, "headline"))

    # ── ai_lean: mapping table, never single-scalar derivation ───────────────
    if stale:
        # Abstain entirely when data is stale; the panel/copilot must not display
        # a lean that may be many days out of date.
        ai_lean: dict = {"abstain": True, "reason": "stale"}
    else:
        ai_dir = _map_ai_dir(decision_band, entry_status)
        conviction_score = _r(conviction.get("score"), 1)
        # Consistency guard: a BULL with a low score or a BEAR with a high score
        # indicates a mapping edge-case — demote to NEUTRAL rather than lying.
        if ai_dir == "BULL" and conviction_score is not None and conviction_score < 55:
            ai_dir = "NEUTRAL"
        if ai_dir == "BEAR" and conviction_score is not None and conviction_score > 65:
            ai_dir = "NEUTRAL"
        ai_lean = {
            "dir": ai_dir,
            "score": conviction_score,
            "band": decision_band,
            "entry": entry_status,
        }

    tape: dict = {
        "ai_lean": ai_lean,
        "asof": asof,
        "stale": stale,
        "conviction": _r(conviction.get("score"), 1),
        "regime": _str(ladder.get("regime_label")),
        "gex_flip": _r(gex.get("gamma_flip"), 2),
        "call_wall": _r(gex.get("call_wall"), 2),
        "put_wall": _r(gex.get("put_wall"), 2),
        "short_pct": _r(g(positioning, "short", "pct_float"), 2),
    }

    # ── sector_pulse pass-through ─────────────────────────────────────────────
    # Drop when stale: the panel must not display a sector heat that may be days
    # out of date.  Absent/null source → field omitted (never null in output).
    if not stale:
        pulse = _build_sector_pulse(src.get("sector_pulse"))
        if pulse is not None:
            tape["sector_pulse"] = pulse

    # ── cards.ai_judgment ────────────────────────────────────────────────────
    size = conviction.get("size") or {}
    ai_judgment = {
        "verdict": headline,
        "gloss": _str(g(decision, "gloss")),
        "size_pct": _r(size.get("pct"), 1),
    }

    # ── cards.conviction ─────────────────────────────────────────────────────
    cautions_raw = conviction.get("cautions") or []
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

    # ── cards.levels ─────────────────────────────────────────────────────────
    levels = [
        {"label": "Call wall", "price": _r(gex.get("call_wall"), 2), "kind": "resistance"},
        {"label": "Gamma flip", "price": _r(gex.get("gamma_flip"), 2), "kind": "pivot"},
        {"label": "Put wall", "price": _r(gex.get("put_wall"), 2), "kind": "support"},
    ]

    # ── cards.analyst ────────────────────────────────────────────────────────
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

    # ── cards.smart_money ────────────────────────────────────────────────────
    sm = src.get("smart_money") or {}
    sm_trend = sm.get("trend") or {}
    smart_money_card = {
        "trend": _str(sm_trend.get("direction")),
        "n_holders": _r(sm.get("n_holders"), 0),
        "value_change_pct": _r(sm_trend.get("value_change_pct"), 2),
    }

    # ── analysis.confluence / analysis.sniper (new contract blocks) ─────────────
    # The Macro Dashboard nightly will carry these top-level keys once live.
    # Until then they are absent from old stockdata JSONs → we silently omit them
    # (never emit null; the UI must handle missing keys as "not yet available").
    analysis_extras: dict = {}

    raw_confluence = src.get("confluence")
    if isinstance(raw_confluence, dict):
        htf_s2_raw = raw_confluence.get("htf_s2")  # SHADOW — never forward to UI
        conf_out: dict = {}
        tier = raw_confluence.get("tier")
        if tier is not None:
            conf_out["tier"] = _str(tier)
        w = raw_confluence.get("weight")
        if w is not None:
            conf_out["weight"] = _r(w, 4)
        sub = raw_confluence.get("sub")
        if sub is not None:
            conf_out["sub"] = _str(sub)
        ticks = raw_confluence.get("ticks")
        if ticks is not None:
            try:
                conf_out["ticks"] = int(ticks)
            except (TypeError, ValueError):
                pass
        btc = raw_confluence.get("bars_to_cross")
        if btc is not None:
            conf_out["bars_to_cross"] = _r(btc, 2)
        for bool_key in ("provisional", "not_topped", "htf_s1"):
            v = raw_confluence.get(bool_key)
            if v is not None:
                conf_out[bool_key] = bool(v)
        # htf_s2 is SHADOW — deliberately not forwarded (brief contract)
        _ = htf_s2_raw  # consumed but not emitted
        asof_conf = _str(raw_confluence.get("asof"))
        if asof_conf is not None:
            conf_out["asof"] = asof_conf
        if conf_out:
            analysis_extras["confluence"] = conf_out

    raw_sniper = src.get("sniper")
    if isinstance(raw_sniper, dict):
        sniper_out: dict = {}
        w2w = raw_sniper.get("w2_washout")
        if w2w is not None:
            sniper_out["w2_washout"] = bool(w2w)
        w2s = raw_sniper.get("w2_stoch_d")
        if w2s is not None:
            sniper_out["w2_stoch_d"] = _r(w2s, 2)
        d63 = raw_sniper.get("days_since_63d_low")
        if d63 is not None:
            try:
                sniper_out["days_since_63d_low"] = int(d63)
            except (TypeError, ValueError):
                pass
        coiled = raw_sniper.get("coiled")
        if coiled is not None:
            sniper_out["coiled"] = bool(coiled)
        asof_sniper = _str(raw_sniper.get("asof"))
        if asof_sniper is not None:
            sniper_out["asof"] = asof_sniper
        if sniper_out:
            analysis_extras["sniper"] = sniper_out

    out: dict = {
        "schema": "intel/v1",
        "ticker": sym,
        "asof": asof,
        "tape": tape,
        "cards": {
            "ai_judgment": ai_judgment,
            "conviction": conviction_card,
            "levels": levels,
            "analyst": analyst_card,
            "smart_money": smart_money_card,
        },
    }
    # Only emit the analysis sub-object when there is at least one block to write.
    # This keeps old-data output identical to pre-contract (no empty {} noise).
    if analysis_extras:
        out["analysis"] = analysis_extras
    return out


# ── tech block helpers ─────────────────────────────────────────────────────────

def _factordata_fetch(path: str) -> dict | None:
    """GET {_FACTORDATA_BASE}/{path} → parsed JSON dict, or None on 404/error.

    On 404 or network error, logs once per URL and returns None.  Callers treat
    None as "not available" and omit the block rather than crashing.
    """
    url = f"{_FACTORDATA_BASE}/{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _FACTORDATA_UA})
        with urllib.request.urlopen(req, timeout=_FACTORDATA_TIMEOUT) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if url not in _TECH_LAB_LOG_ONCE:
            _TECH_LAB_LOG_ONCE.add(url)
            if e.code == 404:
                log.debug("factordata 404 (not yet live): %s", url)
            else:
                log.warning("factordata HTTP %d: %s", e.code, url)
        return None
    except Exception as e:
        if url not in _TECH_LAB_LOG_ONCE:
            _TECH_LAB_LOG_ONCE.add(url)
            log.warning("factordata fetch error for %s: %s", url, e)
        return None


def _fetch_tech_lab_profiles() -> dict | None:
    """Fetch tech_lab.json once per run.  Returns a dict keyed by signal_id, or None.

    tech_lab.json schema:
        {"generated_utc": "...", "signals": {<signal_id>: {...}}, ...}

    Returns the inner "signals" dict (keyed by signal_id → profile), or None when
    the request fails or the expected structure is absent.
    """
    raw = _factordata_fetch("tech_lab.json")
    if not isinstance(raw, dict):
        return None
    signals = raw.get("signals")
    if not isinstance(signals, dict) or not signals:
        return None
    return signals


def _build_tech_block(sym: str, lab_profiles: dict | None) -> dict | None:
    """Build intel["tech"] for *sym*.

    Fetches tech_events/<SYM>.json.  Returns None when:
    - the per-symbol events endpoint returns 404/error (not yet live, or symbol not covered)
    - the payload is malformed

    When lab_profiles is None (tech_lab.json unavailable), profiles are omitted
    from the output but the events block is still forwarded if available.

    Output shape:
        {
            "events": <raw tech_events payload>,
            "profiles": {signal_id: <tech_lab.json row>},   # only signals present in events
            "asof": "<generated_utc>",
        }
    The "profiles" key is omitted when lab_profiles is None.
    Callers must handle a missing "profiles" key.

    House-law invariant (TLT-R3): this function only FETCHES and FORWARDS data
    produced by the macro Python engine.  No signals, scores, or escalations are
    derived here.
    """
    events_raw = _factordata_fetch(f"tech_events/{sym}.json")
    if not isinstance(events_raw, dict):
        return None  # 404 or parse error — omit block silently, rest of intel unaffected

    out: dict = {"events": events_raw}

    # Forward only the signal profiles that appear in this symbol's events payload.
    if isinstance(lab_profiles, dict):
        sig_ids = set(events_raw.get("signals", {}).keys())
        profiles = {sid: lab_profiles[sid] for sid in sig_ids if sid in lab_profiles}
        if profiles:
            out["profiles"] = profiles

    # Forward the generated_utc timestamp for display / staleness checks in the UI.
    asof = events_raw.get("generated_utc")
    if isinstance(asof, str) and asof:
        out["asof"] = asof

    return out


def main(syms: list[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    # ── R2 sync leg ─────────────────────────────────────────────────────────
    # site/stockdata/ is gitignored from the macro repo since 2026-07-01 and
    # lives exclusively on the public R2 bucket.  Pull it before reading files.
    n = sync_r2_stockdata(MACRO_STOCKDATA)
    if n is None:
        log.warning("R2 sync failed — reading last-good local mirror at %s", MACRO_STOCKDATA)
    elif n == 0:
        log.info("R2 stockdata fresh (ETag match) — %d files in %s",
                 sum(1 for _ in MACRO_STOCKDATA.glob("*.json")), MACRO_STOCKDATA)
    else:
        log.info("R2 stockdata synced: %d files written to %s", n, MACRO_STOCKDATA)

    # ── loud directory check ─────────────────────────────────────────────────
    if not MACRO_STOCKDATA.is_dir():
        log.error(
            "MACRO_STOCKDATA directory not found: %s\n"
            "Set the MACRO_STOCKDATA env var to the correct path.\n"
            "This is a configuration error, not a per-symbol skip.",
            MACRO_STOCKDATA,
        )
        sys.exit(1)

    OUT.mkdir(parents=True, exist_ok=True)
    today = date.today()

    # Equity-only symbols (skip crypto)
    equity_syms = [s for s in syms if META.get(s, ("", "Equities", ""))[1] == "Equities"]

    # ── tech block: fetch tech_lab.json once per run ─────────────────────────
    # 404 or timeout → lab_profiles=None; per-symbol tech block is omitted when None.
    # This is a best-effort enrichment — failure here must never block the core intel write.
    log.info("fetching tech_lab.json from %s …", _FACTORDATA_BASE)
    lab_profiles = _fetch_tech_lab_profiles()
    if lab_profiles is None:
        log.warning(
            "tech_lab.json unavailable (404 or timeout) — tech block will be omitted "
            "from all intel files this run.  This is expected until the macro endpoint "
            "goes live.  Core intel write is unaffected."
        )
    else:
        log.info("tech_lab.json: %d signals loaded", len(lab_profiles))

    ok, skipped, stale_count, failed = [], [], [], []
    for sym in equity_syms:
        src_path = MACRO_STOCKDATA / f"{sym}.json"
        if not src_path.exists():
            log.debug("skip %s: no source file", sym)
            skipped.append(sym)
            continue
        try:
            with open(src_path) as f:
                src = json.load(f)
            intel = build_intel(sym, src, today=today)

            # ── tech block (best-effort enrichment) ─────────────────────────
            # Fetch per-symbol events; 404 = symbol not yet covered = omit quietly.
            # Any failure here must not affect the core intel write (handled by
            # the outer try/except on the symbol loop).
            tech = _build_tech_block(sym, lab_profiles)
            if tech is not None:
                intel["tech"] = tech

            out_path = OUT / f"{sym}.intel.json"
            out_path.write_text(json.dumps(intel, separators=(",", ":")))
            lean = intel["tape"]["ai_lean"]
            is_stale = intel["tape"].get("stale", False)
            if is_stale:
                stale_count.append(sym)
                log.info("  %s: STALE (asof=%s) → abstain", sym, intel.get("asof"))
            else:
                log.info(
                    "  %s: wrote %s (regime=%s dir=%s band=%s entry=%s score=%s tech=%s)",
                    sym,
                    out_path.name,
                    intel["tape"].get("regime"),
                    lean.get("dir"),
                    lean.get("band"),
                    lean.get("entry"),
                    lean.get("score"),
                    "yes" if tech is not None else "omitted",
                )
            ok.append(sym)
        except Exception as exc:
            log.error("  ERROR %s: %s", sym, exc)
            failed.append(sym)

    print(
        f"\nDone: {len(ok)} written ({len(stale_count)} stale→abstain), "
        f"{len(skipped)} skipped (no src), {len(failed)} failed"
    )
    if stale_count:
        print(f"  Stale (abstained): {stale_count[:10]}{'...' if len(stale_count)>10 else ''}")
    if failed:
        print(f"  Failed: {failed}")


if __name__ == "__main__":
    main(sys.argv[1:] or DEFAULT)
