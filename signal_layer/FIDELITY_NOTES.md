# Flagship signal fidelity — `confluence.py` vs TradingView

Goal: make the Python oracle reproduce TradingView's BUY★/SELL★/CUT/RE-BUY for the flagship
**"RSI-MACD × Stochastic — MTF Signal Suite"** (3D timeframe). Validated against TradingView
NVDA-3D ground truth (5 crosshair bar-timestamps + 9 visible markers, June 2026).

## What was wrong, and by how much

Measured on real NVDA data (signal-date Jaccard; before → after):

| Gap | Effect | Verdict |
|---|---|---|
| **3D bar phase/anchor** (dominant) | The 3 possible session-grouping phases share **0** signal dates with each other | TV anchors at IPO; locked 5/5 |
| **`resample("3B")` calendar buckets** → session-grouping | ~80% of signal dates move (Jaccard 0.11) | structural bug; session-grouping is correct |
| **RSI/EMA seeding** (`ewm(adjust=True)` → Wilder RMA SMA-seed + Pine `ta.ema`) | kept all signals, +2 sells (Jaccard 0.92) | minor but load-bearing near gate thresholds |

### The anchor (the fix that matters)
TradingView builds the **3D** timeframe by grouping **trading sessions** three at a time,
anchored at the symbol's **first listed session (IPO)** — NOT calendar business days. Empirically
(locked 5/5 against TV NVDA crosshairs):

> a 3D bar **closes** where the global session index (0-based from IPO) `% 3 == 0`,
> and **opens** where `% 3 == 1`.

`resample("3B")` was wrong twice over: it buckets by the Mon–Fri calendar (mis-splitting real
sessions around every holiday) **and** anchors to the calendar grid, not the session sequence.

Only daily-**multiples** (3D) are session-grouped. W / 2W / 1M confirm timeframes are calendar
units in TV, so they stay `resample("W-FRI" / "2W-FRI" / "ME")` — verified correct (incl. holiday
weeks).

## Implementation (`confluence.py`)
- `_3d_groups` / `_resample_3d` — session-grouped 3D, closes at global idx `%3==0`, bars labeled by
  **open** date (TV's bar timestamp). `bar_anchor` = global session index of the input's first row.
- `ipo_bar_anchor(feed_close, symbol)` — derives `bar_anchor` for a TRUNCATED feed from the deep
  OHLC store's IPO calendar (shares the NYSE calendar with the live Polygon feed). Returns 0 if the
  store lacks the symbol (then the grid is session-grouped but anchored at the feed start).
- `_rma` — Wilder RMA, SMA-seeded (Pine `ta.rma`); `ema` — `ewm(adjust=False)` (Pine `ta.ema`).
- `rsi` — Pine edge: `down==0 → 100` (was NaN).
- Weekly confirm gate — maps each 3D bar to the **prior fully-closed weekly bar (W-1)** by
  session-aligned `searchsorted` (Pine `request.security(…, macd[1], lookahead_off)`), replacing the
  `shift(1)+ffill` that double-lagged to W-2; bull `>=` and bear `<=` both inclusive on a tie.

## Validation (NVDA 3D)
- 3D bar opens reproduce **5/5** TV crosshair timestamps (full-history parquet AND truncated
  Polygon feed with `bar_anchor=5645`).
- **8–9 of 9** visible TV markers reproduced, including Feb-03 = **CUT** (a bar can be both CUT and
  SELL★; TV's primary is CUT — the contract emitter now follows Pine's `compTxt` priority
  revSell > revBuy > CB > CS).
- Golden gate: **pass**, max series abs diff **0.0**, event_match true, `gate_valid: real_ohlc`.
- Adversarial audit (16 agents): core math (`_rma`/`rsi`/`ema`/stoch/crosses/gates/`_resample_3d`)
  matches a from-scratch Pine to **~1e-14**; the weekly-gate, RSI-`down==0`, and bear-tie fixes flip
  **zero** in-window (2021–2026) signals.

## Residuals (cannot be fully closed)
- **Data feed** — Polygon (terminal) vs yfinance (deep store) vs TradingView's own feed differ;
  same math+phase gives Polygon-vs-yfinance Jaccard **0.906** (~9% of signals). The one NVDA miss
  (a ~Nov-2025 SELL★) is a macd cross TV's feed made and Polygon's didn't (within 0.1). This is the
  floor.
- **Warm-up / truncated feed** — full IPO history vs the 6-yr Polygon feed are **identical from
  2023+**; they differ only in the 2021–2022 RSI/EMA warm-up. The chart shows ~the last 220 3D bars
  (≈2023→), so the default view matches TV; scrolling to 2021–2022 needs full IPO history.
- **Symbols not in the deep store** (ETFs SPY/QQQ/DIA/IWM/GLD/TLT/SOXL, older non-store stocks
  MSTR/SMCI/CRM, crypto BTC/ETH/SOL/XRP) fall back to `bar_anchor=0`: correct grouping, best-effort
  phase. Recent IPOs whose feed starts at IPO (ARM, COIN) are already correct at 0. To close the
  rest: add them to the deep store, or backfill Polygon to IPO.

## Downstream impact
- **Terminal slices** regenerated (`ingest/regen_slices.py`, 34 symbols) — markers move to the
  TV-correct grid (current-committed vs new Jaccard 0.12; counts ~unchanged, dates relocated).
- **Macro Dashboard** shares this file (runs full-history, `bar_anchor=0` → already correct phase):
  full-history old-vs-new Jaccard ~0.13 (same magnitude; correct direction). **Sync this file back**
  to the Macro repo's `research/signal_engine/confluence.py` to keep them identical.
- **`pine-engine`** (client-side interpreter) does NOT recompute the flagship — unaffected.
- Call sites now thread the anchor: `regen_slices`, `build_polygon_universe`, `backtest.run_backtest`,
  `golden_gate.check` (all accept/derive `bar_anchor`).
