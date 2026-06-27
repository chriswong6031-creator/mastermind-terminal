"""FastAPI surface for the charting container (Phase 0 stub).

Mirrors Mastermind's FastAPI shape so the same deploy story applies. Routes that
hit compute or (later) a PAID data feed are explicitly flagged for auth + rate-limit
(research doc §8 P2-2): an unguarded ``/scan`` over the universe is a real wallet-risk.

Run:  MACRO_REPO=/path/to/macro  uvicorn api.main:app --reload --port 8800
      (or:  python -m uvicorn api.main:app ...)

Phase 0 reads price history from the macro deep store. Phase 1 swaps the source for
the live Polygon/Alpaca feed behind ``ingest/`` with identical contract shapes.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd

try:
    from fastapi import FastAPI, HTTPException, Response
    from pydantic import BaseModel
except ImportError as e:   # keep the module importable for tests without fastapi
    raise SystemExit("install deps first: pip install -r requirements.txt") from e

from signal_layer import backtest, contracts, confluence  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))
STOCKS = MACRO / "data" / "stocks"

app = FastAPI(title="Charting App", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True, "phase": "0", "macro_repo_present": STOCKS.exists()}


@app.get("/chart/{symbol}")
def chart(symbol: str):
    """Serve the OHLC contract the web chart renders."""
    p = ROOT / "web" / "ohlc" / f"{symbol.upper()}.json"
    if not p.exists():
        raise HTTPException(404, f"no OHLC for {symbol} — run ingest/sample_from_macro.py")
    return Response(p.read_text(), media_type="application/json")


@app.get("/indicator/{indicator_id}/{symbol}")
def indicator(indicator_id: str, symbol: str, slice: bool = False):
    """Return a mastermind.indicator/v1 contract (or its model slice with ?slice=true).

    ``slice=true`` is what the brain should request — it strips the raw arrays (§4/D9).
    """
    p = ROOT / "contracts" / "samples" / f"{symbol.upper()}.indicator.json"
    if not p.exists():
        raise HTTPException(404, f"no indicator contract for {symbol}")
    doc = json.loads(p.read_text())
    return contracts.model_slice(doc) if slice else doc


class BacktestReq(BaseModel):
    symbol: str
    fixed: bool = True
    cost_bps: float = 3.0
    slippage_bps: float = 1.0


@app.post("/backtest")
def run_backtest(req: BacktestReq):
    """Tier-1 backtest → backtest_result/v1.

    TODO(Phase 1): AUTH + RATE-LIMIT this route. It is compute-amplifying and, once
    the live feed lands, hits a paid data source. Do not expose it unguarded.
    """
    p = STOCKS / f"{req.symbol.upper()}.parquet"
    if not p.exists():
        raise HTTPException(404, f"no price history for {req.symbol}")
    close = pd.read_parquet(p)["close"].dropna().astype(float)
    bt = backtest.run_backtest(close, fixed=req.fixed,
                               cost_bps=req.cost_bps, slippage_bps=req.slippage_bps)
    return contracts.backtest_contract(req.symbol.upper(), "3D", bt)


@app.get("/scan")
def scan():
    """Universe scan ("MTF confluence + RSI<30") — Phase 2.

    Deferred deliberately: requires (a) auth + rate-limit, (b) a stated universe
    cardinality + IO/cost budget (Phase 2 could emit thousands of files), (c) the
    cost_guard ceiling. See research doc §8 P2-2 / P2-3.
    """
    raise HTTPException(501, "scan is Phase 2 (needs cost/IO budget + cost_guard) — see docs")
