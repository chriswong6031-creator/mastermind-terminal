# Charting App

A standalone **"TradingView-lite" charting system** — a sibling container to
`Mastermind`, built to integrate into the Macro Dashboard via a defined publish step
and to feed every signal / indicator / backtest output to the **Mastermind Opus brain**
and the **Macro Dashboard stock-picker** as clean, versioned data contracts.

> Display-only / paper-only / research. Nothing here executes orders.

## Why it exists (one sentence)

A self-hosted chart + custom (Pine-style) indicators + a strategy backtester whose
*centerpiece is the data contract, not the chart* — so the user's Pine signals become
something Opus can reason over and the picker can rank on.

## Architecture

```
charting-app/
  docs/RESEARCH_AND_ARCHITECTURE.md   ← READ THIS FIRST. Full research + decisions (D1–D9).
  web/            Phase 0a render harness — Lightweight Charts v5 (Apache-2.0) + chart.js
                  lifted from the dashboard, rendering OHLC this container emits itself.
  signal_layer/   The TRUSTED Python math:
                    confluence.py   GOLDEN ORACLE (verbatim faithful Pine port; never edited)
                    backtest.py     Tier-1 run_backtest — promotes simulate() + ADDS metrics
                    contracts.py    mastermind.indicator/v1 + backtest_result/v1 + model_slice()
                    golden_gate.py  parity gate: diff any engine vs the oracle (fail loudly)
  contracts/      JSON Schemas for the two contracts + real worked samples (AAPL, NVDA)
  ingest/         data feed. Phase 0: sample_from_macro.py (bridge demo). Phase 1: live feed.
  indicator_engine/  Node PineTS sidecar (AGPL firewall) — Phase 1.
  api/            FastAPI surface (mirrors Mastermind): /health /chart /indicator /backtest /scan
  data/           cache + backtest return-series parquet sidecars
  tests/          golden-gate parity test
```

## The two contracts (the whole point)

- **`mastermind.indicator/v1`** — series + discrete `signals[]` + `state{}` per
  {indicator, symbol, timeframe}. The `series`/`gates`/`bars` arrays are **chart-only**;
  `model_slice()` strips them so Opus ingests a ~6 KB surface, not a ~400 KB array dump.
- **`backtest_result/v1`** — headline metrics + per-trade list + a `series_ref` pointing
  at the daily-return parquet that **Mastermind `loop/harness`** consumes for the
  significance verdict (we feed the judge; we never duplicate it).

## Quickstart (Phase 0)

```bash
# 1) generate real sample artifacts from the macro deep store
MACRO_REPO="/Users/chriswong/Documents/Cluade/Macro Dashboard" \
  python ingest/sample_from_macro.py AAPL NVDA

# 2) view the chart harness
cd web && python -m http.server 8799      # → http://localhost:8799

# 3) (optional) the API
pip install -r requirements.txt
MACRO_REPO="/Users/chriswong/Documents/Cluade/Macro Dashboard" \
  uvicorn api.main:app --reload --port 8800

# 4) prove indicator parity
pytest -q
```

## Status — Phase 0 (scaffold) complete

- ✅ Container skeleton + lifted chart engine rendering its own OHLC contract
- ✅ Golden oracle + parity gate (diff = 0 on the self-check)
- ✅ Both v1 contracts + `model_slice()` guardrail, with real AAPL/NVDA samples
- ✅ Tier-1 backtester with the net-new metrics (Sharpe/Sortino/CAGR/Calmar/exposure)
- ⏭️ **Blocked on a decision before Phase 1:** the live market-data provider (D1) and the
  publish-step mechanics (D8). See `docs/RESEARCH_AND_ARCHITECTURE.md` §10.

## Not on GitHub (yet)

Like `Mastermind`, this is a local container. It will integrate with the Macro Dashboard
via a **publish step** (commit/push contract artifacts to the `macro` repo → the brain's
`vendor/macro → macro_src` pulls them) — **not** a shared filesystem. See §7/D8.
