"""A deterministic synthetic tape + its full slice emission — the golden-diff fixture.

Not a test module (leading underscore = pytest never collects it). It exists so the
no-artifact FALLBACK can be proved the only way that means anything: emit the whole
``mastermind.indicator/v1`` signal stream with the washout-override gate wired but no
state file present, and diff it byte-for-byte against a golden generated from the
PRE-fence emitter (``origin/master`` @ 397700aa). An empty diff is the proof that a
missing/stale artifact leaves live behaviour exactly where it was.

The series is chosen (seed 7) because its four ``bear_block`` fires ALL fail the keeper's
counter-trend ``reclaim_and_hold`` leg — the fidelity trap in fixture form. Any refactor
that routes override fires through the keeper re-blocks every one of them, and both the
golden diff and the spine test in ``test_washout_entry_mask.py`` say so.

Regenerate the golden (only ever from a tree whose emitter you intend to freeze)::

    python3 -m tests._synthetic_tape --write
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

GOLDEN = Path(__file__).resolve().parent / "golden" / "no_state_slice.json"


def synthetic_close(n: int = 1200, seed: int = 7) -> pd.Series:
    """A long bull → deep bear → recovery daily tape. Pure function of (n, seed)."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2021-01-04", periods=n)
    t = np.arange(n)
    trend = 100 * np.exp(0.0009 * t)
    cycle = 1 + 0.30 * np.sin(2 * np.pi * t / 190) + 0.12 * np.sin(2 * np.pi * t / 47)
    noise = np.cumsum(rng.normal(0, 0.004, n))
    return pd.Series(trend * cycle * np.exp(noise), index=idx)


def emit(symbol: str = "SYNTH", **build_kw) -> dict:
    """Full emission for the synthetic tape: ``{"signals": [...], "state": {...}}``.

    ``build_kw`` is forwarded to ``build_v2`` so a caller can wire the override gate.
    Everything else is fixed, so any diff is attributable to the emitter alone.
    """
    from signal_layer import confluence, confluence_v2, contracts

    close = synthetic_close()
    sig = confluence.compute_signals(close)
    v2 = confluence_v2.build_v2(sig, close, **build_kw)
    ind = contracts.indicator_contract(
        symbol, "3D", sig, bar_quality="real_ohlc", src_text="", honest_read="", v2=v2)
    return {"signals": ind["signals"], "state": ind["state"]}


def main(argv: list[str]) -> int:
    doc = emit()
    if "--write" in argv:
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n")
        print(f"wrote {GOLDEN} ({len(doc['signals'])} signals)")
    else:
        print(json.dumps(doc, indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
