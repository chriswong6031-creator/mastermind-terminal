"""Golden-gate INVERSION acceptance (audit #7): the gate now validates the local engine
against the dashboard's EXPORTED corrected golden vectors, so a stale fork FAILS and the
corrected engine PASSES — the opposite of the old self-check-the-oracle behavior.

Covers: the corrected engine reproduces the golden BUY/SELL/tier sequence exactly; a
deliberately-staled engine_fn FAILS; the inputs-hash guard; the no-contract fallback that
SKIPS (never silently passes); and the retained engine-vs-engine diff still works.
"""
import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))

import sys
sys.path.insert(0, str(ROOT))
from signal_layer import golden_gate, backtest, contracts, confluence   # noqa: E402


def _close(sym="AAPL"):
    p = MACRO / "data" / "stocks" / f"{sym}.parquet"
    if not p.exists():
        pytest.skip(f"macro deep store not available at {p}")
    return pd.read_parquet(p)["close"].dropna().astype(float)


def _golden_close(sym):
    """Load a golden-symbol close from wherever it lives (US / CN / HK stores)."""
    for sub in ("stocks", "china_stocks", "hk_stocks"):
        p = MACRO / "data" / sub / f"{sym}.parquet"
        if p.exists():
            c = pd.read_parquet(p)["close"].dropna().astype(float)
            c.index = pd.to_datetime(c.index)
            return c
    pytest.skip(f"{sym} not in macro store")


def _contract():
    c = golden_gate.load_contract()
    if not c:
        pytest.skip("golden contract not exported (run scripts/export_signal_contracts.py)")
    return c


# ── the inversion: corrected engine PASSES, stale fork FAILS ──────────────────
def test_corrected_engine_passes_all_golden_symbols():
    contract = _contract()
    for vec in contract["symbols"]:
        sym = vec["symbol"]
        r = golden_gate.check_symbol(sym, _golden_close(sym), contract=contract)
        assert r["pass"] is True, f"{sym} should PASS: {r}"
        assert r["sequence_exact"] is True
        assert r["inputs_hash_match"] is True
        assert r["moved_dates"] == 0


def test_stale_fork_fails_the_gate():
    """A deliberately-staled engine_fn (calendar 3B + adjust=True EMA + bare RMA) FAILS —
    the whole point of the inversion (the old gate blessed exactly this bug)."""
    contract = _contract()

    def stale_fork(dc: pd.Series) -> pd.DataFrame:
        def lrsi(c, n=14):
            d = c.diff()
            up = d.clip(lower=0).ewm(alpha=1 / n, min_periods=n).mean()
            dn = (-d.clip(upper=0)).ewm(alpha=1 / n, min_periods=n).mean()
            return 100 - 100 / (1 + up / dn.replace(0, np.nan))
        lema = lambda s, sp: s.ewm(span=sp, min_periods=sp).mean()
        s3 = dc.resample("3B").last().dropna()          # the calendar-bin bug
        if len(s3) < 90:
            return pd.DataFrame()
        r = lrsi(s3, 14)
        macd = lema(r, 14) - lema(r, 60)
        sig = lema(macd, 5)
        lo, hi = r.rolling(14).min(), r.rolling(14).max()
        k = ((r - lo) / (hi - lo).replace(0, np.nan) * 100).rolling(3).mean()
        d = k.rolling(3).mean()
        xo = lambda a, b: (a > b) & (a.shift(1) <= b.shift(1))
        xu = lambda a, b: (a < b) & (a.shift(1) >= b.shift(1))
        cb = xo(macd, sig) & (r < 65)
        cs = xu(macd, sig) & ((k.rolling(8).max() >= 80))
        return pd.DataFrame({"CB": cb.fillna(False), "CS": cs.fillna(False),
                             "revBuy": False, "revSell": False}, index=s3.index)

    r = golden_gate.check_symbol("NVDA", _golden_close("NVDA"),
                                 engine_fn=stale_fork, contract=contract)
    assert r["pass"] is False
    assert r["sequence_exact"] is False
    assert r["moved_dates"] > 20   # ~106 in practice — the fork's dates barely overlap


def test_check_all_passes_for_corrected_engine():
    contract = _contract()
    closes = {s["symbol"]: _golden_close(s["symbol"]) for s in contract["symbols"]}
    r = golden_gate.check_all(closes)
    assert r["all_pass"] is True
    assert r["n_checked"] == len(contract["symbols"])


def test_no_contract_skips_never_passes(tmp_path):
    """A missing contract must return pass=None (SKIP), never a silent True."""
    r = golden_gate.check_symbol("NVDA", _golden_close("NVDA"),
                                 contract={})   # empty ⇒ treated as no oracle
    assert r["pass"] is None
    assert r["reason"] in ("no_contract", "no_vector_for_symbol")


def test_inputs_hash_mismatch_fails():
    """If the fed inputs differ from the vector's, the gate must not pass on a lucky
    sequence match — the hash guard rejects it."""
    contract = _contract()
    c = _golden_close("NVDA")
    # perturb a bar INSIDE the vector's window by a visible amount so the rounded-to-6dp
    # inputs-hash cannot match the exported vector.
    c2 = c.copy()
    win = next(v["window"] for v in contract["symbols"] if v["symbol"] == "NVDA")
    inwin = c2.index[(c2.index >= win["start"]) & (c2.index <= win["end"])]
    c2.loc[inwin[len(inwin) // 2]] = float(c2.loc[inwin[len(inwin) // 2]]) + 5.0
    r = golden_gate.check_symbol("NVDA", c2, contract=contract)
    assert r["inputs_hash_match"] is False
    assert r["pass"] is False


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
