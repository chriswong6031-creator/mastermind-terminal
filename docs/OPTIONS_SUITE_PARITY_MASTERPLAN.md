# Options Suite Parity Masterplan — vs QuantData.us

*Fable program · 2026-07-24 · competitive teardown + verified infra audit + phased roadmap.*
*This is the **options** analog of `FEATURE_GAP_AUDIT.md` (which tracks TV/TrendSpider charting).*
*Feed/infra work here composes with `DATABENTO_INTEGRATION_DESIGN.md` (licensed intraday plane)*
*and obeys the laws in `DAYTRADE_SUITE_SPEC.md` §0 + the design language in `PRODUCT_PLAN_V2.md` §0.*

Method note: QuantData claims come from a live browser teardown of `v3.quantdata.us` on 2026-07-24
(all 7 pages, the Add-Tool catalog, filter/alert builders, network + JS-bundle inspection, and a
confirmed live-tick observation). Our-side claims come from two Opus code-audit agents that read
source directly; on-disk sizes/root-counts are one level removed (sub-agent `du`/`git`), flagged inline.

---

## 0. TL;DR

QuantData's edge is **not** a few missing charts — it is a different **data-and-delivery
architecture**:

- They ingest the **full OPRA options tape** (every trade, every exchange) and compute **15 greeks
  per trade** in real time; we ingest a thin derived slice and render **gamma only** (our
  `delta_net/vanna_net/charm_net` are already in the payload, rendered nowhere).
- They **push over WebSockets per-widget**; we **poll static JSON** (30–60s). Zero WS/SSE in our stack.
- They store **1-minute intraday snapshots for 365+ days**, so every chart has a date-picker +
  intraday playback scrubber + crop tool. We have **no playback / historical-date nav** on any
  options surface, and our "live" flow feed actually refreshes **~hourly** (measured 3562s, not its
  120s target).
- Everything is **one composable widget engine** (30+ tools, drag-drop, saveable/shareable Filter
  Groups, per-widget throttled alerts). Ours is a fixed 11-tab desk.

**Our offsetting strengths:** superior modern UI (vs their dated-terminal look), a proprietary
server-side **flowScore** model they have no equivalent of, a **60 GB EOD options store** (383 roots,
2012→2026, incl. a **51 GB full 1st/2nd/3rd-order greek+IV surface**), EOD OI history per contract,
and a competent single-daily GEX/DEX/VEX/CHEX + IV + max-pain engine. Much of the gap is
**pipeline + rendering on assets we already own**, plus one genuinely new system (the intraday
snapshot store) and one new data source (live dark-pool/TRF prints).

---

## 1. QuantData teardown

### 1.1 Stack / infrastructure
- **Frontend**: Next.js (Turbopack) SPA at `v3.quantdata.us`.
- **Backend**: `core-lb-prod.quantdata.us/api/*` — REST, Bearer-auth, **one endpoint per widget type**,
  each widget instance = a UUID (e.g. `/api/options/exposure/strike/{uuid}`, `/api/interval-map/{uuid}`,
  `/api/options/heat-map/{uuid}`, `/api/options/order-flow/consolidated/{uuid}`, `/api/equities/prints/{uuid}`).
- **Live delivery**: **WebSocket push, keyed per widget** (`WebSocketClientContextProvider`,
  `useWebSocketClientContext`; each tool carries a `websocketKey`). Confirmed live: tape timestamp
  advanced 8:34:59→8:35:09 within a 10s observation window.
- **Data**: officially licensed real-time exchange data — **full OPRA consolidated + unconsolidated
  options tape**; consolidated equities + dark-pool tape. History **365+ days** (tool previews showed
  Jul-2024 data) + **1-minute exposure snapshots** ("scrub any 1-minute snapshot").
- **Greeks engine**: 15 greeks incl. 2nd/3rd-order (Charm, Color, Speed, Ultima, Veta, Vomma, Zomma).
- **Data model** (captured from their payload): exposure = `expirationDate → strikePriceInCents →
  {CALL, PUT}` — every strike (sub-dollar granularity), every expiration, both sides, per greek,
  per 1-minute snapshot.
- **AI**: "Quant IQ" assistant (⌘I).
- **Pricing**: Standard $74.99/mo ($62.49 annual) · Professional $106.49/$93.99 (same features,
  licensing tier for registered pros) · API $149.99/$124.99 (20+ endpoints, 240 req/min, MCP).

### 1.2 The 7 pages
1. **Dashboard** — Consolidated + Unconsolidated Order Flow, Equity Prints, Dark Pool Levels, Net
   Flow, Net Drift, News, Gainers/Losers.
2. **Exposure** — GEX/DEX/VEX/CHEX by Strike, by Expiration, Interval Map, Heat Map.
3. **Flow Analysis** — Net Flow, Net Drift (+volume subpanel), dual Heat Maps.
4. **Dark Pool / Equities** — Stock Price/Time (candles), Dark Pool Levels, Dark Flow, Equity Prints.
5. **Statistics** — Contract Statistics, Contract Trade-Side Statistics, Market Share (pie/bar),
   Market Share Table.
6. **Open Interest** — OI by Strike, OI by Expiration, OI Change, Max Pain, Max Pain/Time, OI/Time.
7. **Volatility Analysis** — Volatility Drift, IV Rank, Volatility Skew, Term Structure.

### 1.3 Tool catalog (30+ composable widgets: Equities / News / Options)
**Options (~23):** Consolidated Order Flow · Unconsolidated Order Flow (raw tape) · Contract Price/Time ·
Contract Statistics · Contract Side Statistics · Exposure by Strike · Exposure by Expiration ·
Interval Map · **Heat Map (30+ metrics)** · Max Pain · Max Pain/Time · Open Interest by Strike ·
Open Interest by Expiration · Open Interest Change · Net Flow · Net Drift · IV Rank · Term Structure ·
Volatility Drift · Volatility Skew · Market Share · Market Share Table · Gainers/Losers.
**Equities:** Dark Flow · Dark Pool Levels · Equity Prints · Exchange Notifications (REG SHO, LUDP,
halts) · Market Map (sector treemap) · Stock Price/Time · Gainers/Losers.
**News:** real-time news + sentiment + topic tagging + market events.

### 1.4 Control depth (the "professional" differentiator)
- **Greek switch** on any exposure surface: Gamma (GEX) / Delta (DEX) / Vanna (VEX) / Charm (CHEX),
  multi-select — same by-strike / by-expiration / interval-map / heatmap views.
- **Normalization**: Per $1 Move / Per 1 Unit / Per 1% Move.
- **Aggregation period**: 1/2/3/4/5/10/15/20/30 min, 1/2/4 hr.
- **Playback + crop**: every time-series widget has (a) historical date-picker, (b) intraday
  playback scrubber + pause (9:30→4:15), (c) crop/zoom range slider to isolate part of the day.
- **Heat Map = 30+ metrics** (GEX/DEX/VEX/CHEX/Net Premium/Net Volume/…), strike × expiration, MVC
  (max-value-cell) marker; heatmap-specific alerts (MVC Proximity, MVC Shift).
- **Filter Groups**: saved, named, **shareable** (My/Public library). Group → Filter Sets (OR) →
  Filters (AND) as `Field / Operator / Value`. Field vocabulary:
  - *Trade:* Golden Sweeps, Complex/Floor/Auction/Tied/Cancelled Trades, Opening Positions, Unusual,
    Moneyness ($/%), Premium, Quantity, Sentiment, Trade Side, Money Type, Consolidation Type.
  - *Greeks:* all 15 (Charm, Color, Delta, Gamma, Omega, Rho, Sigma, Speed, Theta, Ultima, Vanna,
    Vega, Veta, Vomma, Zomma).
  - *Contract:* DTE, Expiration, IV, OI, Strike, Volume, Volume>OI, Contract Type.
  - *Underlying:* Ticker, Sector, Industry, Indexes, ETFs, Penny Program, Stock Price.
- **Alerts**: per-widget, inherit the widget's filter group, throttle-configurable, public library,
  widget-specific types (tape→"New Consolidated Flow"; heatmap→"MVC Proximity/Shift").
- **Sentiment engine**: each trade tagged where it executed vs NBBO (Below Bid / Bid / Mid / Ask /
  Above Ask) → Bullish/Bearish/Neutral; header gauges (Sentiment, P/C Ratio, P/C Volume, P/C Premium);
  Contract Trade-Side Statistics panel.

---

## 2. Our verified current state

**Delivery:** everything is HTTP-polled static JSON. `terminal/app/api/flow/route.ts` = plain `GET`,
`Cache-Control: no-store`, 30s TTL + SWR. No WebSocket/SSE anywhere.

**Live flow poller** (`/Users/chriswong/liveflow-ops-wt/scripts/live_flow_poller.py`, launchd
`com.mastermind.liveflow`, weekdays, `--rth-only`):
- Only calls ThetaData v3 `trade_quote` (`collectors/thetadata.py`), `expiration=*&strike=*`, with a
  **per-expiration ≤90-DTE fallback** when v3 rejects current-day wildcard.
- Universe **122 roots** live (22 ETFs + top 100), NOT the full ~380.
- **Effective cadence ~59 min** (`cadence_sec_measured 3562.7`, target 120) — the Theta Terminal
  build can't do incremental time-window pulls, so it re-pulls `full_day` every cycle. **Our "live"
  feed is effectively hourly.**
- Parser keeps `price,size,exchange,bid,ask` but **DROPS** `condition`/`ext_condition1..4`
  (sweep/ISO/block flags) and `bid_size`/`ask_size`. No live greeks (loads t-1 OI from EOD store).
- Output → local JSON + **Cloudflare R2** `live_flow/*`; **retention 24h** rolling + 48h hourly
  archive. **No replay** — a past intraday session can't be reconstructed.

**GEX lanes** (macro repo `/Users/chriswong/Documents/Cluade/Macro Dashboard/`), both consumed by
`route.ts`:
- Cboe lane (`engine/gex_engine.py`, `gex_model.py`, `build_gex_board.py`) — own Black-Scholes;
  delta/gamma/vanna/charm → GEX/VEX/CEX/net-delta; per-strike walls + per-expiry term + strike×expiry
  matrix; max pain; IV30/IV-rank/25Δ skew/term/smile.
- Polygon `options_hub` lane (`com.mastermind.optionshub` → `build_options_hub_nightly --publish`,
  **once/weekday 16:45 ET**) — OI-change (oi_movers/hot_contracts/oi_confirmed) + full-history iv_rank.
- **Both are single daily EOD snapshots.** `latest.json` overwritten each run; per-name parquet keeps
  **one summary row/day** — **by-strike detail is NOT persisted** → no intraday greek series, no replay.
- Freshness two-tier: only the **22 ETF/index anchors** get greeks re-pulled daily
  (`theta_backfill_keepalive.sh`); single names stay frozen. All regime output is display-only /
  dealer-sign-assumed.

**On-disk (sub-agent measured):** canonical EOD store at `/Users/chriswong/theta-ops-wt/data/thetadata_eod/`
(via `THETADATA_STORE`): **~60 GB**, 383 roots, 2012→2026 — `eod/` 7.3 GB, `oi/` 1.9 GB,
**`greeks/` 51 GB** (full 1st/2nd/3rd-order greek + IV, 1 row/contract/day). So **OI history + greek/IV
history ARE stored — EOD granularity only.** No intraday options-tick store anywhere.

**ThetaData** = Options **PROFESSIONAL, 8 concurrent**. Client already implements the full entitled
surface (trade_quote, eod chains, open_interest, greeks/eod). Un-ingested: intraday greeks
(`greeks/eod` is EOD-only; the 1-sec `/greeks/all` stream noted "rejected/interval-broken", not
wired), trade-condition capture, full-universe live flow.

**Dark pool:** `build_darkpool_desk.py` produces **delayed FINRA short-volume + weekly ATS** (2–4 wk
lag). **No live prints, no TRF tape.** ThetaData does not cover this.

**Terminal surfaces** (`components/OptionsHubView.tsx`, 11 tabs: prophet·desk·tape·tide·tickers·
screener·gex·prism·leaders·radar): GEX desk renders **gamma only**; the `TidePayload` per-minute
series is **fetched then discarded to a static call/put bar**; Prism = strike×expiry OI/ΔOI/GEX/VOL
matrix + max pain; IV suite solid (rank/term/smile) but no percentile/scalar-skew/history; **no
playback, no options-condition alerts** (`AlertsView` has 6 basic price/RSI/regime conditions).

### Capability × state × gap
| Capability | Our state | Gap to parity |
|---|---|---|
| Live flow tape | 122 roots, **~hourly**, conditions/sizes dropped | sub-min full ~380-root tape; capture conditions+sizes; streaming transport |
| GEX/DEX/VEX/CHEX by strike/expiry | ✅ shape, but **gamma-only rendered**, EOD, 22 names fresh | render all 4 greeks; intraday refresh; all names fresh |
| Intraday greek series + date-picker + scrubber | ❌ daily EOD, by-strike not persisted | **entire feature** — capture + persist per-strike history + replay store |
| OI history / OI-change / max pain | ✅ EOD OI 2012→now; OI-change (Polygon lane); max pain both | unify OI-change across lanes; expose everywhere |
| IV rank / skew / term / smile | ✅ (daily) | add IV percentile + scalar 25Δ RR + intraday |
| Greek/IV surface history | ✅ **EOD** 2012→now (51 GB) | intraday granularity |
| Dark pool / TRF prints | ⚠️ delayed FINRA volume only | **live off-exchange print feed** (biggest data-source gap) |
| Market-share by exchange | exchange captured, not aggregated | real-time share stats |
| Transport | HTTP polling | WS/SSE |
| Historical intraday replay | ❌ | persisted intraday tick + greek-snapshot store |

---

## 3. Roadmap (phased)

**Phase 0 — free wins on data we already have (days):**
- Render the discarded `TidePayload` per-minute series as a real Net Flow / Net Drift chart.
- Render the `delta_net/vanna_net/charm_net` already in the GEX payload behind a greek-switcher
  (GEX/DEX/VEX/CHEX) on the existing GEX desk.
- *No new data, no infra. Immediate visible robustness jump.*

**Phase 1 — live spine (keystone, weeks):**
- WebSocket/SSE gateway in front of `/api/flow`; convert tape, header gauges, and one heatmap to push.
- Fix the poller's `full_day` re-pull → sub-minute (the ~hourly→live fix); capture the dropped
  `condition`/`ext_condition` + `bid_size`/`ask_size` columns; expand 122 → ~380 roots.
- *This is the highest-leverage build — it's what makes the product feel alive.*

**Phase 2 — intraday snapshot store + playback (weeks):**
- Persist 1-min snapshots of flow/exposure/OI to a time-series store (ClickHouse or Parquet-on-disk).
- Build the shared chart wrapper: historical date-picker + intraday scrubber + crop range control
  (reuse `lib/intradayMath.ts` display-epoch/`sessionSlices`; obey DAYTRADE_SUITE_SPEC §0 laws).
- Backfill daily history immediately from the existing 51 GB EOD greek surface.
- *Unlocks history + replay across all widgets at once.*

**Phase 3 — full greeks + Exposure-page parity (weeks):**
- Compute the greek surface on the ThetaData chain **intraday** (verify `/greeks/all` 1-sec stream on
  our tier first; else recompute Black-Scholes per minute on the data-plane box).
- Build Exposure-by-Strike / by-Expiration / Interval-Map / multi-metric Heat Map with greek-switcher
  + normalization modes + aggregation-period selector.

**Phase 4 — dark pool + Filter Groups + alerts (weeks):**
- Live off-exchange/TRF print feed — **compose with `DATABENTO_INTEGRATION_DESIGN.md`** (Databento is
  the licensed intraday equities plane; TRF/dark-pool prints ride the same adapter). Cheapest interim
  path = Polygon trades w/ TRF exchange codes (we already pay Polygon). Build the Dark Pool page.
- Filter Group engine (Field/Operator/Value over the tape) + filter-scoped throttled options alerts.

**Phase 5 — completeness:**
- Statistics (market-share by exchange, trade-side stats); Max Pain/Time + OI Change + OI/Time
  extensions; IV percentile + scalar skew + IV history; Exchange Notifications; widget composability
  (add-tool catalog, drag-drop, custom pages) toward matching their flexibility inside our design.

**Sequencing insight:** Phases 0–1 + the poller/condition/root fixes are wiring/ops on assets we
already own; Phase 2 is the one genuinely new system; Phase 4 is the one new data source. Everything
keeps our UI/design advantage (PRODUCT_PLAN_V2 §0: pure-black Coinbase-Advanced language, blue accent).

---

## 4. Infra plan

**Serving box (DO droplet):** upgraded $12 (1 vCPU/2 GB/50 GB) → **$24 (2 vCPU/4 GB/80 GB)** on
2026-07-24 — fixes the `next build` OOM at 2 GB; sized for **serving + WebSocket gateway** only.
Verified healthy post-resize: `/api/flow?f=manifest|feed` + `/api/nw` return 200 JSON, `/api/quote`
correctly 401s (auth restarted fine).

**Do NOT put the data plane on the $24 box:** the 60 GB EOD store won't fit 80 GB, and the JVM +
poller + snapshot DB + per-minute greek recompute won't fit 4 GB alongside Node.

**DO startup credits applied (pending, ~1 wk):** ~$5000/yr ≈ $400/mo. When they land:
- Migrate the entire data plane **off the Mac** (biggest reliability win — no home machine in the
  critical path): Theta Terminal + poller + builders + the 60 GB store onto a **dedicated data-plane
  droplet** (8–16 GB / 4–8 vCPU, ~$84–126/mo) + **block storage** (250 GB ≈ $25/mo) for the store +
  growing intraday snapshots. All-in ~$150–200/mo, well under credit.
- **Discipline (credit cliff):** design for sane post-credit steady state; keep data serving on **R2**
  (zero egress) — do NOT migrate to DO Spaces just because credits would cover it (egress bill on
  renewal). Interim: keep poller/Theta on the Mac until the data-plane box exists; don't block Phase 0–1.

**ThetaData:** PROFESSIONAL is **enough** for the options half — the blockers are wiring, not
entitlement. The one thing to actively verify: `/greeks/all` 1-sec streaming on our tier/terminal
version (determines stream-vs-recompute for Phase 3).

**AI:** use **Mastermind AI** (already wired, already reaches options data) as the options-desk brain
via context-specialization — options system prompt (dealer positioning, flow interpretation, IV/skew),
feed it on-screen widgets + active ticker, add GEX/greeks/flow query tools. One assistant across
charts + options + macro beats a siloed Quant-IQ clone.

---

## 5. Constraints inherited from existing docs
- **DAYTRADE_SUITE_SPEC §0**: directional colors only `--up`/`--down` (East-Asian flip must work);
  i18n every string via `lib/i18n.tsx`; one time-type per LWC series (numeric display-epoch intraday);
  nulls not NaN; new intraday math in `lib/intradayMath.ts`; no order execution / P&L.
- **PRODUCT_PLAN_V2 §0**: pure-black canvas `#07080a`, flat institutional (Coinbase Advanced), blue
  accent used sparingly; Free vs Pro gate (`is_pro`) on proprietary surfaces.
- **DATABENTO_INTEGRATION_DESIGN**: the intraday plane is display-epoch (market-local-as-UTC), `Bar6`
  is a bare tuple with no venue/provenance, the browser Polygon socket (`lib/live.ts`) is a
  redistribution/key liability to **delete not adapt**; hub owns streaming/quotes, app owns historical
  bars — Databento/dark-pool gets a seam on each side, don't merge the planes.

## 6. Open questions to verify before spending
1. `/greeks/all` 1-sec stream on our ThetaData PROFESSIONAL tier — works, or must we recompute?
2. Poller TZ: plist `Hour=6 Min=25` (local) vs documented 09:25 ET — confirm the actual start.
3. Dark-pool feed choice: Polygon-TRF (cheap, already paid) vs Databento (licensed, richer) — decide
   in the DATABENTO design's frame.
4. Snapshot store engine: ClickHouse (RAM-hungry, powerful) vs DuckDB/Parquet (lighter) on the
   data-plane box.
