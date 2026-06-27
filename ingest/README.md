# ingest/ — market data

## Phase 0 (now)
- **`sample_from_macro.py`** — reads the macro repo's deep OHLC store and emits the
  chart OHLC contract + both data-contract samples from REAL data. This is the worked
  example of the data-contract seam; in Phase 1 the same shapes come from the live feed.

## Phase 1 (pending decision D1 — the live feed)
Modules to add, behind the SAME contract shapes so nothing downstream changes:

- **`polygon_live.py`** — WebSocket tick/quote/AH stream + REST history. Reuses the
  macro repo's existing Polygon auth pattern (`collectors/polygon_options.py`).
- **`alpaca_live.py`** — cheaper dev feed. **Respect the 1-WebSocket-connection ceiling**
  (bar-replay + live chart + scanner can want more than one stream — validate first).
- **`session.py`** — the piece a "lift chart.js" does NOT give you for free:
  session calendar (pre / RTH / post), holidays + half-days, reconnect + backfill,
  out-of-order / late-tick dedup, and gap handling on the time axis so an AH session
  is delineated and never drawn as a flat overnight line.
- **`bars.py`** — aggregate the live tape into the OHLC contract; set `bar_quality`
  (`real_ohlc` for live, vs `synthetic_open_deepstore` for the macro backfill).

## Gotchas to carry over (from the macro chart.js audit)
- Daily bars use `"YYYY-MM-DD"` strings; intraday uses epoch seconds — never mix them
  in one render. The 4H path buckets by `floor(epoch / 4h)`.
- The SAFE-name transform is `ticker.replace("=", "_").replace("^", "_")` — file names
  and fetch URLs must match it.
