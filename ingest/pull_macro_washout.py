"""Basket-washout bridge (BLOCKED_ENTRY_RATIFICATION_PACKET_2026-08-10 §4.1).

Reads the Macro Dashboard's nightly ``basket_washout_state.v1`` artifact — per-name
thematic-basket peer drawdown from 252d highs — and writes a trimmed, versioned
``terminal/public/data/washout_state.json`` in the ``washout_state/v1`` shape. That file is
what ``signal_layer.washout_override`` reads when it stamps the display-tier "washout
override candidate" class onto a ``regime_blocked`` (⊘) fire.

Source (in preference order, mirroring ``pull_macro_risk``):
  1. ``MACRO_WASHOUT_URL`` env → HTTPS GET the web-served artifact (custom UA for the
     Cloudflare WAF; on any failure the existing output file is left untouched — last-good
     beats a truncated write).
  2. ``MACRO_R2_BASE``/``factordata/basket_washout_state.json`` — the same R2 origin
     ``pull_macro_intel.sync_r2_stockdata`` uses for stockdata.
  3. local ``MACRO_REPO/site/factordata/basket_washout_state.json``.

DISPLAY-ONLY. This never enters, sizes, or ranks anything: the ratified ``enter``-mask
conditional stays gated on the signal-era fence (packet §4.2). ``is_display_only`` is
propagated so no downstream reader can lose that fact.

CN/HK are out of the ratified construction (packet §3.4 — no US peer sets for those names);
whatever the artifact publishes for them is bridged verbatim, and the cohort gate that
matters lives in the stamper, not here.

Usage:  python ingest/pull_macro_washout.py
        MACRO_WASHOUT_URL / MACRO_R2_BASE / MACRO_REPO / WASHOUT_MAX_STALE_SESSIONS override.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer.washout_override import (  # noqa: E402
    DEFAULT_MAX_STALE_SESSIONS,
    DEFAULT_THRESHOLD,
    SCHEMA_BRIDGE,
    as_drawdown_fraction,
    sessions_between,
)

log = logging.getLogger(__name__)

MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
OUT = ROOT / "terminal" / "public" / "data" / "washout_state.json"
_R2_BASE = os.environ.get("MACRO_R2_BASE", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev")
_REL = "factordata/basket_washout_state.json"
_UA = "mastermind-feed/1.0"
_TIMEOUT = 30


def _fetch_url(url: str) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
            return json.loads(r.read())
    except Exception as e:  # noqa: BLE001 — never raise; keep last-good output
        log.warning("washout artifact fetch failed (%s): %s", url, e)
        return None


def resolve_source() -> tuple[dict, str] | None:
    """Return (raw_artifact_dict, provenance) or None if nothing is reachable."""
    url = os.environ.get("MACRO_WASHOUT_URL")
    if url:
        d = _fetch_url(url)
        if isinstance(d, dict):
            return d, f"url:{url}"
    if _R2_BASE:
        r2 = f"{_R2_BASE.rstrip('/')}/{_REL}"
        d = _fetch_url(r2)
        if isinstance(d, dict):
            return d, f"r2:{r2}"
    p = MACRO / "site" / _REL
    if p.exists():
        try:
            d = json.loads(p.read_text())
            if isinstance(d, dict):
                return d, f"local:{p}"
        except Exception as e:  # noqa: BLE001
            log.warning("could not read %s: %s", p, e)
    return None


def _trim_baskets(raw: dict) -> dict:
    out = {}
    for gid, b in (raw.get("baskets") or {}).items():
        if not isinstance(b, dict):
            continue
        row = {
            "name": str(b["name"]) if b.get("name") else None,
            "name_zh": str(b["name_zh"]) if b.get("name_zh") else None,
            "peer_median_dd_252": as_drawdown_fraction(b.get("peer_median_dd_252")),
            "n_members": int(b["n_members"]) if isinstance(b.get("n_members"), (int, float)) else None,
            "qualifies": {str(k): bool(v) for k, v in (b.get("qualifies") or {}).items()},
        }
        out[str(gid)] = {k: v for k, v in row.items() if v is not None}
    return out


def _trim_names(raw: dict) -> dict:
    out = {}
    for tkr, n in (raw.get("names") or {}).items():
        if not isinstance(n, dict):
            continue
        q = {str(k): bool(v) for k, v in (n.get("qualifies") or {}).items()}
        # Only names that qualify at SOME notch are carried: the artifact is a whole-universe
        # census, but the stamper only ever asks about qualifying names, and this file is
        # served to browsers. Dropping the ~95% that qualify nowhere keeps the payload small
        # without changing a single stamping decision.
        if not any(q.values()):
            continue
        out[str(tkr).upper()] = {
            "basis": str(n.get("basis") or "basket"),
            "group_id": str(n["group_id"]) if n.get("group_id") is not None else None,
            "peer_dd": as_drawdown_fraction(n.get("peer_dd")),
            "qualifies": q,
        }
    return out


def build_washout_state(src: dict, today: date | None = None) -> dict:
    """Map a ``basket_washout_state.v1`` dict → the ``washout_state/v1`` bridge shape.

    ``today`` is injectable for deterministic freshness tests (production omits it).
    """
    today = today or date.today()
    as_of = str(src.get("as_of"))[:10] if src.get("as_of") else None
    stale_sessions = None
    if as_of:
        try:
            stale_sessions = sessions_between(as_of, today.isoformat())
        except (ValueError, TypeError):
            as_of = None
    max_stale = int(os.environ.get("WASHOUT_MAX_STALE_SESSIONS", DEFAULT_MAX_STALE_SESSIONS))
    thresholds = [int(t) for t in (src.get("thresholds") or [20, 25, 30])
                  if isinstance(t, (int, float))]
    return {
        "schema": SCHEMA_BRIDGE,
        "source_schema": str(src.get("schema") or ""),
        "as_of": as_of,
        "stale": stale_sessions is None or stale_sessions > max_stale,
        "stale_sessions": stale_sessions,
        "threshold": os.environ.get("WASHOUT_THRESHOLD", DEFAULT_THRESHOLD),
        "thresholds": thresholds,
        "baskets": _trim_baskets(src),
        "names": _trim_names(src),
        "is_display_only": True,   # house law: display tier; the enter mask is unchanged
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    got = resolve_source()
    if got is None:
        # Not an error path for the product: no artifact simply means every ⊘ renders plain.
        log.warning("no basket-washout source reachable (set MACRO_WASHOUT_URL or MACRO_REPO). "
                    "Leaving any existing %s untouched — blocked fires stay plain.", OUT.name)
        return 0
    src, provenance = got
    state = build_washout_state(src)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, separators=(",", ":"), ensure_ascii=False))
    tmp.replace(OUT)   # atomic: a reader never sees a half-written state
    log.info("wrote %s from %s — as_of=%s stale=%s qualifying names=%d baskets=%d thr=%s%%",
             OUT.name, provenance, state["as_of"], state["stale"],
             len(state["names"]), len(state["baskets"]), state["threshold"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
