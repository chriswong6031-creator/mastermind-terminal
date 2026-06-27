"""Phase 0b acceptance: the parity harness works and the oracle self-checks clean.

When the PineTS sidecar lands (Phase 1), add a case that passes its compute fn as
``engine_fn`` and asserts parity on a REAL-OHLC symbol (research doc P0-3).
"""
import os
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))

import sys
sys.path.insert(0, str(ROOT))
from signal_layer import golden_gate, backtest, contracts   # noqa: E402


def _close(sym="AAPL"):
    p = MACRO / "data" / "stocks" / f"{sym}.parquet"
    if not p.exists():
        pytest.skip(f"macro deep store not available at {p}")
    return pd.read_parquet(p)["close"].dropna().astype(float)


def test_oracle_self_check_is_exact():
    """The candidate engine == the oracle ⇒ zero series diff and exact event match."""
    g = golden_gate.check(_close("AAPL"), bar_quality="synthetic_open_deepstore")
    assert g["pass"] is True
    assert g["max_series_abs_diff"] == 0.0
    assert g["event_match"] is True
    # a deep-store gate is advisory only — flagged, not trusted as real_ohlc parity
    assert g["gate_valid"] is False


def test_backtest_emits_the_net_new_metrics():
    bt = backtest.run_backtest(_close("AAPL"), fixed=True)
    assert bt["status"] == "ok"
    m = bt["metrics"]
    for k in ("sharpe", "sortino", "cagr", "calmar", "exposure"):
        assert k in m, f"missing net-new metric {k}"
    assert m["n_trades"] == len(bt["trades"])
    assert bt["_returns"], "daily return series (for loop/harness) must be present"


def test_model_slice_strips_raw_arrays():
    """The Opus-facing projection must never carry the chart arrays (§4/D9)."""
    close = _close("NVDA")
    from signal_layer import confluence
    ind = contracts.indicator_contract("NVDA", "3D", confluence.compute_signals(close))
    slim = contracts.model_slice(ind)
    assert not any(k in slim for k in ("series", "gates", "bars"))
    assert "signals" in slim and "state" in slim
    assert len(slim["signals"]) <= 12   # history is capped for the model
