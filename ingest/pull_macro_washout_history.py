"""Basket-washout HISTORY bridge — the backward-looking sibling of ``pull_macro_washout``.

Reads the Macro Dashboard's ``basket_washout_history.v1`` artifact (per-name qualifying
date INTERVALS, published per notch) and writes a trimmed ``washout_history/v1`` bridge
file the terminal serves as a static asset.

WHAT IT IS FOR — AND WHAT IT IS NOT
-----------------------------------
The live state artifact answers "does this name qualify TODAY"; the enter mask asks it, and
the PIT rule stops it from ever reaching backwards. This file answers the different, purely
retrospective question "was this name inside a qualifying washout on the day that old fire
was refused" — which is what the DISPLAY-ONLY retro projection needs
(``signal_layer.washout_override.mark_retro``).

Nothing downstream of this file can trade, alert, or accrue. That is enforced where the
marks are applied, not here; but it is the reason this bridge carries no freshness gate and
no ``qualifies`` map. A history file is a statement about days that are already over: age
costs it coverage at the recent edge — the safe direction — and nothing else.

THE NOTCH IS CARRIED, NEVER ASSUMED. Windows cut at one notch must not paint another
notch's claim, so the bridge keeps the artifact's per-notch structure intact and the reader
selects the live notch out of it (``WashoutHistory``). A single-notch artifact must declare
which notch it is, or the reader refuses it outright.

Usage:  python ingest/pull_macro_washout_history.py
Env:    MACRO_WASHOUT_HISTORY_URL | MACRO_R2_BASE | MACRO_REPO
"""

import json
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from signal_layer.washout_override import (  # noqa: E402
    HISTORY_SCHEMA_BRIDGE,
    HISTORY_SCHEMA_IN,
    WASHOUT_OVERRIDE_NOTCH,
    _iso,
    _parse_interval,
)
from ingest.pull_macro_washout import _fetch_url  # noqa: E402

log = logging.getLogger(__name__)

MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
OUT = ROOT / "terminal" / "public" / "data" / "washout_history.json"
_R2_BASE = os.environ.get("MACRO_R2_BASE", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev")
_REL = "factordata/basket_washout_history.json"

# The notch grid the macro artifact publishes. The bridge keeps all of them so a notch move
# (an era event, but a one-line one) needs no re-pull.
NOTCHES = (20, 25, 30)


def resolve_source() -> tuple[dict, str] | None:
    """The artifact + where it came from. Same preference order as the state bridge."""
    url = os.environ.get("MACRO_WASHOUT_HISTORY_URL")
    if url:
        got = _fetch_url(url)
        if got is not None:
            return got, url
    r2 = f"{_R2_BASE.rstrip('/')}/{_REL}"
    got = _fetch_url(r2)
    if got is not None:
        return got, r2
    local = MACRO / "site" / _REL
    if local.exists():
        try:
            return json.loads(local.read_text()), str(local)
        except Exception as e:  # noqa: BLE001 — never raise; keep last-good output
            log.warning("washout history unreadable at %s: %s", local, e)
    return None


def _trim_intervals(raw) -> dict[str, list[list]]:
    """Normalize the per-name windows to ``{notch: [[start, end|None], ...]}``.

    Accepts the per-notch map (the published shape) or a flat list (single-notch artifact,
    filed under the live notch — the reader's own notch gate is what keeps that honest).
    Each window is normalized through ``_parse_interval`` so the bridge output is one shape
    no matter which of the accepted input forms the publisher used.
    """
    def norm(seq) -> list[list]:
        out = []
        for item in seq or ():
            iv = _parse_interval(item)
            if iv is not None:
                out.append([iv[0], iv[1]])
        return out

    if isinstance(raw, dict):
        return {str(k): norm(v) for k, v in raw.items()
                if str(k).isdigit() and norm(v)}
    if isinstance(raw, (list, tuple)):
        flat = norm(raw)
        return {str(WASHOUT_OVERRIDE_NOTCH): flat} if flat else {}
    return {}


def _trim_names(names) -> dict[str, dict]:
    """Keep only names with at least one qualifying window at some notch.

    The macro artifact is a whole-universe census; the overwhelming majority of names never
    qualified at any notch and would be dead weight in a browser-served asset.
    """
    out: dict[str, dict] = {}
    if not isinstance(names, dict):
        return out
    for ticker, row in names.items():
        if not isinstance(row, dict):
            continue
        intervals = _trim_intervals(row.get("intervals") or row.get("qualifying_intervals"))
        if not intervals:
            continue
        rec: dict = {"intervals": intervals}
        for key in ("group_id", "name", "name_zh", "basis"):
            val = row.get(key)
            if val:
                rec[key] = str(val)
        out[str(ticker)] = rec
    return out


def build_washout_history(src: dict) -> dict:
    """Trim a raw ``basket_washout_history.v1`` artifact into the bridge shape."""
    names = _trim_names(src.get("names"))
    return {
        "schema": HISTORY_SCHEMA_BRIDGE,
        "source_schema": str(src.get("schema") or HISTORY_SCHEMA_IN),
        "as_of": _iso(src.get("as_of")),
        "notches": [n for n in NOTCHES],
        "names": names,
        # The one claim this file makes about itself. Every consumer of the retro class
        # re-states it in user-facing words; here it is machine-readable so a reader that
        # mistook this for the live gate would have to ignore an explicit field to do it.
        "is_display_only": True,
    }


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    got = resolve_source()
    if got is None:
        # Not an error path for the product: no history simply means no retro marks.
        log.warning("no basket-washout HISTORY source reachable (set "
                    "MACRO_WASHOUT_HISTORY_URL or MACRO_REPO). Leaving any existing %s "
                    "untouched — historical refusals render exactly as they do today.",
                    OUT.name)
        return 0
    src, provenance = got
    hist = build_washout_history(src)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(hist, separators=(",", ":"), ensure_ascii=False))
    tmp.replace(OUT)   # atomic: a reader never sees a half-written history
    log.info("wrote %s from %s — as_of=%s names with windows=%d",
             OUT.name, provenance, hist["as_of"], len(hist["names"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
