"""Golden-reference parity gate — INVERTED (audit #7).

THE INVERSION (what changed and why)
------------------------------------
The old gate diffed a candidate engine against ``confluence.compute_signals`` — but that
local function WAS the stale fork (calendar 3B resample, adjust=True EMA, non-SMA-seeded
RMA). So the gate blessed the bug: a correct engine would FAIL and a bug-reproducing one
would PASS. The reference was a known-wrong oracle, inverting the gate's own purpose.

Now the oracle is the dashboard's EXPORTED CORRECTED golden vectors
(``site/factordata/contracts/golden_signals.json``): per-symbol inputs-hash + the expected
BUY/SELL/tier sequence from ``engine.canon.confluence_signals``. This gate:
  * verifies a candidate ``engine_fn`` reproduces that sequence EXACTLY on the same close
    window (a STALE fork FAILS; a canon-conformant engine PASSES), and
  * checks the ``inputs_hash`` so a sequence is only trusted when the same inputs were fed.

TV-ANCHORED LOCAL ENGINE (post-reconciliation, 2026-07): the production
``confluence.compute_signals`` is the TradingView-parity engine — IPO-phased session
grouping, 3D bars labeled by their OPEN date, session-aligned weekly gate — and it
INTENTIONALLY diverges from the canon vectors (canon labels bars by CLOSE date and keeps
the shift(1)+ffill weekly gate). Running ``check_symbol`` with the default engine therefore
reports ``pass=False`` with ``inputs_hash_match=True`` — the gate MEASURES that drift, it
does not bless it. It certifies canon-conformance only for an explicitly supplied
``engine_fn``. If the dashboard's canon ever adopts TV anchoring and re-exports, the
default engine should pass again (re-pin tests/test_golden_gate.py when that happens).

FALLBACK (never silently pass): if the contract file is absent (the macro repo hasn't
exported yet), the gate SKIPS with a loud warning and ``pass=None`` — it must never return
``pass=True`` without a real oracle to check against.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from . import confluence as engine

log = logging.getLogger(__name__)

ATOL = 1e-6
SERIES_COLS = ("macd", "sig", "k", "d", "rsi14")
EVENT_COLS = ("CB", "CS", "revBuy", "revSell")

_MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
CONTRACT_PATH = _MACRO / "site" / "factordata" / "contracts" / "golden_signals.json"

# map the corrected frame's boolean event columns → the contract's signal type
_EVENT_TO_TYPE = (("CB", "BUY"), ("revBuy", "REBUY"), ("CS", "SELL"), ("revSell", "CUT"))


# ═══════════════════════════════════════════════════════════════════════════════
# NEW primary gate: validate the local engine against the EXPORTED golden vectors
# ═══════════════════════════════════════════════════════════════════════════════
def load_contract(path: Path | None = None) -> dict | None:
    p = path or CONTRACT_PATH
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001
        log.error("golden contract unreadable at %s: %s", p, e)
        return None


def _inputs_hash(close: pd.Series) -> str:
    """Must match scripts/export_signal_contracts.py::_inputs_hash byte-for-byte."""
    payload = json.dumps(
        {"dates": [d.strftime("%Y-%m-%d") for d in close.index],
         "close": [round(float(v), 6) for v in close.to_numpy()]},
        sort_keys=True)
    return "sha256:" + hashlib.sha256(payload.encode()).hexdigest()


def _engine_sequence(close: pd.Series, engine_fn: Callable) -> list[tuple[str, str]]:
    sig = engine_fn(close.dropna())
    if sig is None or sig.empty:
        return []
    out = []
    for ts, row in sig.iterrows():
        for col, typ in _EVENT_TO_TYPE:
            if bool(row.get(col)):
                out.append((ts.strftime("%Y-%m-%d"), typ))
                break
    return out


def check_symbol(
    symbol: str,
    close: pd.Series,
    *,
    engine_fn: Callable[[pd.Series], pd.DataFrame] | None = None,
    contract: dict | None = None,
) -> dict:
    """Validate ``engine_fn`` against the exported golden vector for ``symbol``.

    ``pass`` semantics:
      * True  — the engine reproduced the golden BUY/SELL/tier sequence EXACTLY on the
                same inputs (inputs_hash matched).
      * False — the engine drifted (a stale fork): sequence and/or inputs mismatch.
      * None  — no oracle available (contract or symbol vector absent) → SKIP, never pass.
    """
    engine_fn = engine_fn or engine.compute_signals
    contract = contract if contract is not None else load_contract()
    if not contract:
        log.warning("golden contract absent (%s) — gate SKIPPED, NOT passed", CONTRACT_PATH)
        return {"pass": None, "reason": "no_contract", "symbol": symbol}

    vec = next((s for s in contract.get("symbols", []) if s["symbol"] == symbol), None)
    if vec is None:
        log.warning("no golden vector for %s in contract — gate SKIPPED", symbol)
        return {"pass": None, "reason": "no_vector_for_symbol", "symbol": symbol}

    # window-truncate the close to the vector's window before hashing / computing
    w = vec["window"]
    c = close.dropna().astype(float)
    c.index = pd.to_datetime(c.index)
    c = c[(c.index >= w["start"]) & (c.index <= w["end"])]

    inputs_ok = (_inputs_hash(c) == vec["inputs_hash"])
    got = _engine_sequence(c, engine_fn)
    want = [(x["ts"], x["type"]) for x in vec["expected_sequence"]]
    exact = (got == want)

    got_dates = {d for d, _ in got}
    want_dates = {d for d, _ in want}
    ok = bool(exact and inputs_ok)
    return {
        "pass": ok,
        "symbol": symbol,
        "inputs_hash_match": inputs_ok,
        "sequence_exact": exact,
        "n_engine": len(got),
        "n_golden": len(want),
        "shared_dates": len(got_dates & want_dates),
        "moved_dates": len(got_dates ^ want_dates),
        "oracle": contract.get("oracle"),
    }


def check_all(
    closes: dict[str, pd.Series],
    *,
    engine_fn: Callable[[pd.Series], pd.DataFrame] | None = None,
) -> dict:
    """Run :func:`check_symbol` over every symbol in the contract for which a close is
    supplied. ``all_pass`` is True only if EVERY checked symbol passed AND at least one was
    actually checked (no-oracle / no-closes ⇒ all_pass=None, never a silent True)."""
    contract = load_contract()
    if not contract:
        return {"all_pass": None, "reason": "no_contract", "results": []}
    results = []
    for s in contract.get("symbols", []):
        sym = s["symbol"]
        if sym in closes:
            results.append(check_symbol(sym, closes[sym], engine_fn=engine_fn,
                                        contract=contract))
    checked = [r for r in results if r["pass"] is not None]
    if not checked:
        return {"all_pass": None, "reason": "no_closes_for_any_contract_symbol",
                "results": results}
    return {"all_pass": all(r["pass"] for r in checked),
            "n_checked": len(checked), "results": results}


# ═══════════════════════════════════════════════════════════════════════════════
# Legacy engine-vs-engine diff — retained ONLY for a PineTS-vs-local comparison.
# It no longer certifies parity on its own (its reference is a local engine, not the
# exported oracle); use check_symbol/check_all for the real conformance gate.
# ═══════════════════════════════════════════════════════════════════════════════
def check(
    close: pd.Series,
    engine_fn: Callable[[pd.Series], pd.DataFrame] | None = None,
    *,
    bar_quality: str = "unknown",
    bar_anchor: int = 0,
    week_parity: int = 0,
) -> dict:
    """Diff a candidate engine against the LOCAL engine (e.g. a PineTS sidecar vs the
    Python port). NOTE: this is engine-vs-engine and does NOT anchor to the exported
    oracle; ``check_symbol`` is the authoritative conformance gate (audit #7).

    ``bar_anchor`` / ``week_parity`` phase the 3D session grid and the 2-week confirm pairing
    to the symbol's IPO (see ``confluence.compute_signals``). For a truncated feed pass
    ``engine.ipo_bar_anchor(close, sym)`` / ``engine.ipo_week_parity(close, sym)`` so the gate
    certifies the candidate on the SAME bar grid TradingView (and the live terminal) use."""
    engine_fn = engine_fn or (
        lambda c: engine.compute_signals(c, bar_anchor=bar_anchor, week_parity=week_parity))
    truth = engine.compute_signals(close.dropna(), bar_anchor=bar_anchor, week_parity=week_parity)
    cand = engine_fn(close.dropna())
    if truth.empty or cand.empty:
        return {"pass": False, "reason": "insufficient_data", "bar_quality": bar_quality}

    idx = truth.index.intersection(cand.index)
    max_diff = 0.0
    worst_col = None
    for c in SERIES_COLS:
        if c not in truth or c not in cand:
            continue
        a = truth.loc[idx, c].to_numpy(dtype=float)
        b = cand.loc[idx, c].to_numpy(dtype=float)
        mask = np.isfinite(a) & np.isfinite(b)
        if mask.any():
            d = float(np.max(np.abs(a[mask] - b[mask])))
            if d > max_diff:
                max_diff, worst_col = d, c

    event_match = True
    mismatched = []
    for c in EVENT_COLS:
        if c not in truth or c not in cand:
            continue
        if not truth.loc[idx, c].fillna(False).equals(cand.loc[idx, c].fillna(False)):
            event_match = False
            mismatched.append(c)

    ok = (max_diff < ATOL) and event_match
    return {
        "pass": bool(ok),
        "max_series_abs_diff": max_diff,
        "worst_series": worst_col,
        "event_match": event_match,
        "mismatched_events": mismatched,
        "bars_compared": int(len(idx)),
        "bar_quality": bar_quality,
        "atol": ATOL,
        "gate_valid": bar_quality == "real_ohlc",
        "note": "engine-vs-engine only; not the exported-oracle conformance gate",
    }
