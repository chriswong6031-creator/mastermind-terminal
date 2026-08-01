# QuantData Parity Program — History Reconstruction & Drop Audit

*Read-only audit, 2026-07-31, against `origin/master` (charting-app) + `origin/main` (Macro Dashboard) + project memory + live ops worktrees. All paths absolute.*

---

## 0. Program lineage — the document map

The "QuantData parity program" is actually **three stacked programs plus two law documents**, executed 2026-07-24 → 2026-07-26, on top of an options suite originally built against a *different* competitor (MomoEdge, PR #20, 2026-07-07):

| Doc | Where | Date | Role |
|---|---|---|---|
| `docs/OPTIONS_SUITE_PARITY_MASTERPLAN.md` | charting-app | 2026-07-24 | **The QuantData.us teardown** (v3.quantdata.us, live browser recon + 2 Opus code audits) + P0–P5 roadmap. Committed with PR #177. |
| `research/quanted_options/RECON.md` + `MASTERPLAN.md` | Macro Dashboard repo | 2026-07-24/25 | **A second competitor teardown** — quantedoptions.com (licensed-CBOE SPX/VIX gamma workspace; authenticated Lite-tier account + JS bundle extraction incl. their exact heatmap shader). Drove terminal PRs #197/#198/#199. |
| `research/options_estate/OEU_MASTERPLAN.md` | Macro Dashboard repo | 2026-07-25 | **Options Estate Unification** — successor program; lanes T-A/T-B/T-C/T-D/T-E = terminal PRs #200/#205/#201/#204/#209 + bug wave #217. |
| `docs/DATABENTO_INTEGRATION_DESIGN.md` | charting-app | (Wave-1 doc) | **Design-only** licensed intraday/dark-pool plane. Explicitly "Status: design only… implementation is a later wave." Its only shipped act was deleting `lib/live.ts`. |
| `docs/DAYTRADE_SUITE_SPEC.md` §0 + `docs/PRODUCT_PLAN_V2.md` §0 | charting-app | 2026-07-10 | Inherited laws: `--up/--down` only, i18n everything, **"No order execution, no P&L, no news feed"**, pure-black Coinbase-Advanced design language. |
| `docs/FEATURE_GAP_AUDIT.md` | charting-app | 2026-06-27 | The TV/TrendSpider analog (charting side) — referenced by the masterplan as its sibling. |

One referenced doc is a ghost: `docs/OPTIONS_TERMINAL_UPGRADE_REVIEW_2026-07-23.md` is cited by the quanted MASTERPLAN as upstream context but **never existed on master** (`git log` empty) — it was an uncommitted audit; its findings were partially recovered into `research/options_estate/EOD_CONSOLIDATION_BLUEPRINT_20260723.md` in the macro repo.

### PR timeline (charting-app, options/flow suite, #177 → today)

- **2026-07-24 (one day):** #177 P0 greek-switcher + by-expiration + masterplan · #178 SSE spine (Phase 1a) · #179 GEX desk on SSE · #180 tape on SSE + honest LIVE badge · #181/#191 entitlement gates (macro-api, not `profiles.is_pro`) · #182 Tide on SSE · #183 GEX tab → "Exposure" · #185 honest metric labels · #186 tide freshness · #187 dist-to-flip · #189 ATM bolding · #190 Tip tooltips · #192 hub-tape SSE (Phase 1 spine complete).
- **2026-07-25 (quanted + OEU wave 1):** #197 quanted Wave 1 (paint-surface pane + replay spine + Session Flow + ladder upgrades) · #198 Wave 2E (greek surfaces live via feature-detect, strike-evolution modal, expiry drawer) · #199 options alert conditions (gamma-flip cross, wall proximity, premium burst, 0DTE spike) · #200 OEU T-A (expiry lens end-to-end + ladder truth: `$mn` vs `$bn` formatter bug, PEAK re-spec, pin-probability normalize, single DTE helper) · #201 OEU T-C (flagship Surface tab, quad view, theme engine, send-to-chart; dead `vol` tab removed).
- **2026-07-26:** #204 OEU T-D (scanner belts, premium-burst z-math truth fix, hot-pocket alert, AlertsView honesty) · #205 OEU T-B (multi-day replay, replayBus workspace time-travel, scrubber annotations) · #207 (re-land of #192) · #209 OEU T-E (EOD context belt: structure strip, dark-pool mini-panel, vol-regime chip, Prophet receipt) · #210/#211 **Phase 2 slices 1+2** (net-GEX history strip → session scrubber on the Exposure desk) · #212–#219 fixture/honesty hardening (IV units ×100 fix, honest-empty fixture fallbacks, heat_seeker confidence number-not-tier) · #217 OEU bug wave.
- **2026-07-27/28:** #195 /options paywall · #228 v7 institutional restyle of the whole flow suite.
- **2026-07-29/30:** #230 v7b quality wave (flowdesk overlay expansion, gexdesk NET GEX fix, surface y-domain/y-zoom, prophet v2 dossier, SSE compression).
- **2026-07-31:** #262/#265/#267 Prophet/surface layout regressions repaired; native shell mode ships with **`options: false`** in `terminal/lib/platform/featureManifest.ts:15` (Options suite excluded from every installable alpha).

Macro-repo data-plane siblings: #1774 current-day per-expiration fallback · #2308 FC-R6 two-tier cadence (default OFF) · **#2638 U-CHAIN 15-min greeks/OI chain snapshots ("Interval Map / Vol Drift data")** · #3452 Flow-Surface per-strike net-premium snapshot store · #3461 intraday **greek grids** (gex/dex/vanna/charm) in that store · #3499 dated surface retention (N=10 sessions) + darkpool/vol-regime R2 mirrors (OEU M-XP).

---

## 1. LIST 1 — The masterplan's own P0–P5 roadmap, per-item status on today's master

### Phase 0 — "free wins on data we already have" — ✅ SHIPPED (with one audit correction)
| Item | Status | Evidence |
|---|---|---|
| Render the "discarded" TidePayload per-minute series | **N/A — audit claim was WRONG.** The Tide tab (`TideChart`, NCP/NPP areas + SPY overlay + sector grid) was already fully built; only the desk tab compacts it. Recorded in memory as "VERIFY audit claims against code before building." A richer Session Flow pane shipped anyway (#197 T1: cumulative/per-min, C/P legs, off-open rebase). | memory `options-suite-parity-program`; `terminal/components/surface/SessionFlowPane.tsx` |
| Greek-switcher GEX/DEX/VEX/CHEX on the GEX desk | **SHIPPED** #177 (2026-07-24, same day as the masterplan) + Exposure-by-Expiration; tab renamed "Exposure" #183; expiry drawer #198; walls suppressed for non-gamma lenses. | `terminal/components/gexdesk/GexDeskView.tsx`, `StrikeLadder.tsx` |

### Phase 1 — "live spine (keystone)" — ⚠️ PARTIAL: transport done, source unfixed
| Item | Status | Evidence |
|---|---|---|
| WebSocket/SSE gateway; convert tape/gauges/heatmap to push | **SHIPPED** (SSE-over-WS by design): #178 spine (`lib/flowSource.ts`, `app/api/flow/stream/route.ts`, `lib/flowStream.ts`); all 4 in-repo consumers migrated — GEX desk #179, Flow Desk tape #180 (+honest LIVE badge), Tide #182, hub tape #192/#207. |
| Fix poller `full_day` re-pull → sub-minute | **UNSHIPPED.** `/Users/chriswong/liveflow-ops-wt/data/live_flow_out/meta.json` (last local run before the M1 cutover): `cadence_sec_target 120, cadence_sec_measured 2466.3, delta_mode "full_day"`, note *"Incremental time-window pulls not supported on this terminal; using full-day re-pull each cycle."* A `_probe_delta_mode` and FC-R6 two-tier cadence exist in `scripts/live_flow_poller.py` but two-tier is **DEFAULT OFF**. |
| Capture dropped `condition`/`ext_condition1..4` + `bid_size`/`ask_size` | **UNSHIPPED.** `collectors/thetadata.py` `bulk_trade_quote` parser (~line 1483-1497) still keeps only `price,size,exchange,bid,ask` — sweep/block/ISO flags still discarded at ingest. |
| Expand 122 → ~380 roots | **UNSHIPPED.** `universe_n: 122` (22 ETF anchors + top-100, tier-1/tier-2 round-robin). |

### Phase 2 — intraday snapshot store + playback — ⚠️ PARTIAL, re-scoped to "playback on data we own"
| Item | Status | Evidence |
|---|---|---|
| Persist 1-min snapshots of flow/exposure/OI (ClickHouse/Parquet) | **PARTIAL, different shape.** The store engine question was resolved as **immutable JSON blobs on R2** (copied from the quanted teardown's data plane, RECON §2), not ClickHouse/DuckDB: Flow-Surface store (macro #3452) = per-stamp per-strike net-premium grids at poller cadence; #3461 added gex/dex/vanna/charm grids; #3499 added dated retention (10 sessions) + index. U-CHAIN (#2638) adds 15-min full-chain greeks/OI sweeps. **No general 1-min store of tape/OI; cadence is the (hourly-ish) poller's, not 1-min.** |
| Shared chart wrapper: date-picker + intraday scrubber + crop | **PARTIAL.** ReplayBar (⏮◀▶⏭, speeds, Space/Home/End, LIVE badge) + multi-day session picker shipped on the **Surface tab only** (#197/#205); `replayBus` time-travels sibling panes honestly (#205); Exposure desk got a **scalar** session scrubber over `history[]` (#210/#211). **No crop/zoom range control anywhere; no date-picker on the GEX by-strike ladder; tape/tide/OI have no playback.** |
| Backfill daily history from the 51 GB EOD greek surface | **UNSHIPPED as playback.** `scripts/build_index_gex_history.py` can reconstruct a full chain per historical date but only summarizes to scalars (`{date, net_gex_bn, gamma_flip, call_wall, put_wall, regime}`), index-only. Verified 2026-07-26: **every guessed dated per-strike R2 key 404s** — full by-strike ladders for past dates are not persisted anywhere. This is the recorded "Phase-2 slice 3" blocker (macro-repo data-plane program, honesty-gated). |

### Phase 3 — full greeks + Exposure-page parity — ⚠️ PARTIAL
| Item | Status |
|---|---|
| Intraday greek surface (verify `/greeks/all` 1-sec stream, else recompute) | **Open question ANSWERED — stream is broken on our setup:** `collectors/thetadata.py` docstring: */greeks/all streams 1-second snapshots; multi-day requires interval ≥ 1 min, but ALL interval values are rejected with "Invalid interval: X" for this endpoint.* Recompute path partially exists: snapshot first/second-order greek endpoints feed U-CHAIN 15-min sweeps + the Flow-Surface greek grids (#3461). Not per-minute, not full-universe. |
| Exposure by-Strike / by-Expiration | **SHIPPED** (#177 + #198 bubble/bars drawer + #200 expiry lens reading matrix cells, honest dashes for uncovered strikes). |
| Interval Map | **UNSHIPPED in UI** despite the data lane existing (U-CHAIN #2638 was explicitly built "for Interval Map / Vol Drift data"). Zero grep hits in `terminal/`. |
| Multi-metric Heat Map (30+ metrics) + MVC | **UNSHIPPED.** Surface pane has 4 metrics (netprem/gamma/vanna/charm); Prism has 6 lenses with VEX+UNUSUAL deliberately disabled. Nothing close to 30 metrics or MVC markers/alerts. |
| Normalization modes (Per $1 / 1 unit / 1% move) | **UNSHIPPED.** |
| Aggregation-period selector (1min…4hr) | **PARTIAL** — surface agg 1m/5m/15m/30m only. |

### Phase 4 — dark pool + Filter Groups + alerts — ❌ MOSTLY UNSHIPPED
| Item | Status |
|---|---|
| Live off-exchange/TRF print feed + Dark Pool page | **UNSHIPPED.** Shipped instead: EOD context-belt **mini-panel** (#209) off delayed FINRA short-volume (`darkpool/eod.json`, 3 honest states). Databento remains design-only; the Polygon-TRF-vs-Databento choice (masterplan §6 Q3) was never decided. |
| Filter Group engine (Field/Operator/Value, saved/shareable) | **UNSHIPPED entirely.** Zero occurrences of any filter-group concept in `terminal/`. The tape has fixed filter chips (WHALES etc.) only. |
| Filter-scoped throttled options alerts | **PARTIAL, different shape.** 5 fixed condition types shipped (`opt_gamma_flip`, `opt_wall_touch`, `opt_premium_burst`, `opt_0dte_spike`, `opt_surface_pocket` — #199 + #204, TS+Python parity-tested, account-gated). No filter-group scoping, no per-widget inheritance, no public alert library, no widget-specific MVC alerts. |

### Phase 5 — completeness — ❌ LARGELY UNSHIPPED
| Item | Status |
|---|---|
| Market-share by exchange + trade-side statistics | **UNSHIPPED** (exchange still captured but never aggregated; zero grep hits). |
| Max Pain/Time + OI Change + OI/Time extensions | **PARTIAL.** OI-change movers/hot-contracts/OI-confirmed rails predate the masterplan (Polygon lane) and render in Prism/hub; Max-Pain-over-time and OI-over-time series **unshipped**. |
| IV percentile + scalar 25Δ skew + IV history | **DROPPED with recorded reason** (see List 3, item 4). Existing IV suite (rank/term/smile/history payload) unchanged, living in the Tickers drill since the pass-3 "Tickers+Vol merge" (#34); dead `vol` tab key removed by T-C. |
| Exchange Notifications (REG SHO, LUDP, halts) | **UNSHIPPED.** |
| Widget composability (add-tool catalog, drag-drop, custom pages) | **UNSHIPPED.** The desk remains a fixed 11-tab shell — tab set today: prophet·desk·tape·tide·tickers·screener·gex(Exposure)·surface·prism·leaders·radar (`OptionsHubView.tsx:81`). Net change since the masterplan: `vol` removed, `surface` added. |

### Infra-plan items
- Serving droplet $12→$24: **DONE** 2026-07-24, verified healthy.
- Data plane off the Mac onto a DO droplet: **superseded** — owner ruling moved the entire ~22-job plane **M2 workstation → M1 Max Studio** (free, always-on) on 2026-07-25 instead, freeing the ~$5k DO credits; migration complete, rollback armed (memory `m2-to-m1-dataplane-migration`).
- Keep serving on R2, don't migrate to DO Spaces: **followed** (credit-cliff egress reasoning).
- Mastermind-AI-as-options-brain (vs Quant-IQ clone): direction adopted; brain proxy/run-plane wiring #142/#208; options-specific context specialization not yet observed as a dedicated ship.

---

## 2. LIST 2 — The full QuantData capability census the masterplan recorded (its teardown)

Everything below is *documented in the masterplan itself* (§1.1–1.4). This is the complete feature census it took:

**Architecture/infra (§1.1):** Next.js SPA; REST one-endpoint-per-widget with per-instance UUIDs; **WebSocket push keyed per widget** (`websocketKey`, confirmed live tick advance); full **OPRA consolidated + unconsolidated options tape**; consolidated equities + dark-pool tape; **365+ days history**; **1-minute exposure snapshots** ("scrub any 1-minute snapshot"); **15-greek engine** incl. 2nd/3rd order (Charm, Color, Speed, Ultima, Veta, Vomma, Zomma); exposure data model `expirationDate → strikePriceInCents → {CALL,PUT}` at sub-dollar strike granularity; "Quant IQ" AI assistant (⌘I); pricing Std $74.99 / Pro $106.49 / API $149.99 (20+ endpoints, 240 req/min, MCP).

**The 7 pages (§1.2):**
1. Dashboard — Consolidated + Unconsolidated Order Flow, Equity Prints, Dark Pool Levels, Net Flow, Net Drift, News, Gainers/Losers.
2. Exposure — GEX/DEX/VEX/CHEX by Strike, by Expiration, **Interval Map**, **Heat Map**.
3. Flow Analysis — Net Flow, Net Drift (+volume subpanel), dual Heat Maps.
4. Dark Pool / Equities — Stock Price/Time candles, Dark Pool Levels, Dark Flow, Equity Prints.
5. Statistics — Contract Statistics, Contract Trade-Side Statistics, Market Share (pie/bar), Market Share Table.
6. Open Interest — OI by Strike, OI by Expiration, OI Change, Max Pain, **Max Pain/Time**, **OI/Time**.
7. Volatility Analysis — Volatility Drift, IV Rank, Volatility Skew, Term Structure.

**Tool catalog (§1.3, 30+):** Options (~23): Consolidated Order Flow · Unconsolidated (raw tape) · Contract Price/Time · Contract Statistics · Contract Side Statistics · Exposure by Strike · Exposure by Expiration · Interval Map · Heat Map (30+ metrics) · Max Pain · Max Pain/Time · OI by Strike · OI by Expiration · OI Change · Net Flow · Net Drift · IV Rank · Term Structure · Volatility Drift · Volatility Skew · Market Share · Market Share Table · Gainers/Losers. Equities: Dark Flow · Dark Pool Levels · Equity Prints · **Exchange Notifications (REG SHO, LUDP, halts)** · Market Map (sector treemap) · Stock Price/Time · Gainers/Losers. News: real-time news + sentiment + topic tagging + market events.

**Control depth (§1.4):** greek multi-select switch on every exposure surface; normalization (Per $1 / Per 1 Unit / Per 1% Move); aggregation period 1min→4hr; **playback + crop on every time-series widget** (date-picker, intraday scrubber 9:30→4:15, crop/zoom range slider); Heat Map 30+ metrics with MVC marker + MVC Proximity/Shift alerts; **Filter Groups** — saved, named, shareable (My/Public library), Group→Filter Sets (OR)→Filters (AND) as Field/Operator/Value with a vocabulary spanning *Trade* (Golden Sweeps, Complex/Floor/Auction/Tied/Cancelled trades, Opening Positions, Unusual, Moneyness, Premium, Quantity, Sentiment, Trade Side, Money Type, Consolidation Type), *all 15 Greeks*, *Contract* (DTE, Expiration, IV, OI, Strike, Volume, Volume>OI, Type), *Underlying* (Ticker, Sector, Industry, Indexes, ETFs, Penny Program, Stock Price); **per-widget throttled alerts** inheriting the widget's filter group + public alert library + widget-specific types; **sentiment engine** — exec-vs-NBBO tagging (Below Bid/Bid/Mid/Ask/Above Ask) → Bullish/Bearish/Neutral, header gauges (Sentiment, P/C Ratio, P/C Volume, P/C Premium), Contract Trade-Side Statistics panel.

---

## 3. LIST 3 — Explicitly deferred/dropped items and the recorded reason

Grouped by the reason class the program itself recorded.

### A. Honesty-doctrine drops (the house epistemics vetoed the feature)
1. **Prism VEX lens** — deliberately disabled in `LensBar`: *"vanna stability unconfirmed"*; live matrix payload carries no vanna fields. Enabling = fabrication.
2. **Prism UNUSUAL lens** — disabled: *"30d per-strike volume baseline must accrue"* before an unusualness read is honest.
3. **LIVE badge on the GEX desk** — refused (PR #179 ruling): GEX data is EOD-nightly, so a live *connection* must not be dressed as live *data*; the asof staleness chip stays the truth source. Reusable ruling: LIVE only when `SSE open && asof same ET day && !stale`.
4. **IV percentile + scalar 25Δ risk-reversal** (a P5 item) — *verified and skipped*: the vol payload's smile carries only `strike/call_iv/put_iv` (no per-strike delta → 25Δ RR not computable), and `iv_rank_252` is already UI-labeled "percentile" while not matching the linear rank formula — semantics unconfirmable from the frontend. "Don't build without backend/delta data."
5. **GEX-desk historical date-picker (Phase-2 slice 3)** — blocked by a **data boundary** verified 2026-07-26: full per-strike ladders for past dates are persisted **nowhere** (all guessed dated R2 keys 404; archives are index-only scalars). Ruling: *"Do NOT ship a date-picker against unpublished/unvalidated reconstructed data (empty-state / honesty violation)"* — slice 3 is a macro-repo data-plane program first.
6. **Macro-event markers (FOMC/CPI) on the replay scrubber** (#205) — investigated, reachable, and **not shipped**: `feeds/event_calendar.json` is forward-only (horizon 21d) while replay only shows past sessions — *"the overlap is structurally empty… a feature that can never fire."* Finding recorded in `lib/replayEngine.ts`.
7. **SessionFlowPane on archived sessions** (#205) — deliberately **withdraws** rather than relabel: the per-minute tide is a live-session artifact with no dated copy, and the surface store's netprem is only the C−P difference, so the two legs can't be reconstructed point-in-time.
8. **Client-side Phase-2 scaffolding pre-build** (scrubber/date-picker against a mock) — rejected: "risks rework until the store schema is real."
9. **Heatmap "Call share" label, PRISM OI/VOL units, "Cluster ≥$3M" badge, ATM bolding, pin-probability, `$mn/$bn` formatter** — a family of shipped-then-corrected honesty bugs (#185, #200, #218) showing the doctrine applied retroactively, not just prospectively.

### B. Infra-gated deferrals (blocked on the data plane, not the frontend)
10. **Poller cadence fix (~hourly → sub-minute)** — *"the real 'feels alive' unlock"* — deferred because it touches the running launchd `com.mastermind.liveflow` feeding prod and needed the data-plane box; the SSE spine was built ready to carry it. Still unshipped after the M2→M1 migration (2026-07-25). Root cause is upstream: the Theta Terminal build rejects incremental time-window pulls (`delta_mode: full_day` + probe fallback in the poller).
11. **Trade-condition + bid/ask-size capture** — same deferral bundle; parser still drops them today (verified in `collectors/thetadata.py`).
12. **Universe expansion 122 → ~380 roots** — same bundle; `universe_n` still 122.
13. **1-min exposure snapshot store, full universe** — the "one genuinely new system"; only the Flow-Surface slice exists (surface-materialized roots at poller cadence, 10-session retention).
14. **Intraday 1-sec greeks** — masterplan open-question §6.1 resolved negatively: `/greeks/all` rejects **all** interval values on our tier/terminal ("Invalid interval: X") → stream path dead; per-minute Black-Scholes recompute on the data-plane box never built (15-min U-CHAIN sweeps are the closest existing lane).

### C. Entitlement / licensing / data-boundary drops
15. **Live dark-pool/TRF prints** — "biggest data-source gap"; ThetaData doesn't cover it; requires a *new paid feed* (Polygon-TRF interim vs Databento licensed). Decision explicitly parked into the Databento design's frame (§6.3) and never taken. Databento doc itself: "design only," with a hard entitlement note — *a developer subscription is NOT a terminal redistribution license*; pro/non-pro classification required before serving licensed depth.
16. **Browser Polygon WebSocket** (`lib/live.ts`, `NEXT_PUBLIC_POLYGON_KEY`) — ruled a *redistribution-license + key-exposure liability*: **"delete, not adapt"** (deleted in Wave 1).
17. **Signed participant exposure views** (the quanted teardown's MM/Firm/Broker-Dealer/Customer buckets) — **DON'T build**: *"we lack the license — never imply we have exchange-tagged positioning; our labels must say 'OI-assumption model'."*
18. **HK synthesized bars merged with licensed bars** — Databento doc hard list: never blend `synthesized:true` with real OHLC (route HK through Databento when licensed).

### D. DNR / signal-doctrine kills (macro estate rulings inherited by the program)
19. **Positioning-fusion composite score** across positioning keys — banned (DNR §1, MSP-R3, Signal-Commons).
20. **Charm/vanna as tradeable signals** — dead (DNR §2 "signed-charm kill"); surfaces/education may render mechanics but must carry no signal claims; OEU gate 0.5: nothing new feeds rank/size/gate; LLMs never originate signals.
21. **DOI, skew-deceleration** — "stay dead/display-only per DNR" (OEU 0.5).

### E. Product-strategy / positioning drops
22. **Quant-IQ clone** — rejected: context-specialize the already-wired Mastermind AI ("one assistant across charts + options + macro beats a siloed Quant-IQ clone").
23. **News feed** — QuantData's whole News tool class is census'd but appears in **no phase of the roadmap**; the inherited DAYTRADE §0 law is explicit: *"No order execution, no P&L, no news feed."*
24. **Widget composability / drag-drop / custom pages** — nominally P5 but framed as "toward matching their flexibility **inside our design**"; never started; the fixed-tab desk is treated as a design advantage, not a deficit.
25. **East-Asian color-flip fixes on options surfaces** — deprioritized by operator ruling: "US options, zh not important; only fix cases wrong in DEFAULT EN mode."
26. **Options suite in the native app alphas** — excluded by governance (`featureManifest.ts:15 options:false`, AGENTS.md: "The Options suite is excluded from every installable alpha surface… while remaining untouched on the web").
27. **DO Spaces migration** — rejected (credit-cliff egress; keep R2 zero-egress).
28. **OEU §5 explicit deferrals** (adjacent estate, recorded 2026-07-25): moving intraday_flow into the Terminal; sunsetting legacy page URLs; Terminal Leaders/Radar ↔ macro Leaders dedup; shared authenticated user-state (watchlists/saved scans across estates); research API; full per-metric provenance objects; **OPEX/expiration calendar page**; **OI-change history map (strike × date)** — "strong candidates for the next EOD program."

---

## 4. LIST 4 — Blind spots: capabilities the masterplan NEVER mentioned

Benchmarked against what a full options platform (QuantData + Unusual Whales/CheddarFlow/InsiderFinance-class) offers. "Never mentioned" = absent from the masterplan's teardown census *and* its roadmap (adjacent docs noted where they later caught it).

1. **Multi-day OI heatmap (strike × date history map)** — the masterplan records OI Change / OI-by-strike / OI/Time but never a strike×date OI evolution surface. OEU §5 later independently names "OI-change history map (strike × date)" as a next-program candidate — so the estate caught it, the masterplan didn't.
2. **Largest-trades board** ("biggest prints of the day" leaderboard by premium, distinct from a filterable tape) — nowhere in census or roadmap.
3. **Dedicated 0DTE dashboard** — DTE appears only as a filter-vocabulary field in the census; no 0DTE-specific surface is planned. (The house independently shipped 0DTE tide buckets and an `opt_0dte_spike` alert, but as scattered features, not a dashboard.)
4. **Earnings-aware options analytics** — earnings/IV screeners (pre-earnings elevated IV, implied-vs-realized earnings move, term-structure inversion screens) are absent everywhere on the options side. (`FEATURE_GAP_AUDIT` #14 covers earnings *markers on charts* only.)
5. **Options profit/strategy calculator** (multi-leg P&L modeling, breakevens, payoff diagrams) — never mentioned. Note the DAYTRADE "no P&L" law targets *position tracking*; a pre-trade payoff calculator was simply never discussed.
6. **Historical flow search** — querying the tape archive by ticker/date/filters. Replay ≠ search; tape retention is 24h rolling + 48h hourly archive, so the capability is structurally impossible today and no phase proposes fixing retention for search.
7. **Per-trade greeks in the tape** — the census records QuantData computing 15 greeks *per trade*, but no roadmap phase ever plans greeks-at-trade-time columns/filters for our feed (Phase 3 is surfaces only; live greeks noted absent in the poller and left there).
8. **Sweep/block classification engine** — Phase 1 stops at "capture the condition columns"; no spec anywhere for actually *classifying* sweeps (multi-exchange stitching, ISO nuance, opening-position detection, floor/complex trade tagging) — the intelligence layer QuantData's filter vocabulary (Golden Sweeps, Opening Positions, Money Type…) implies.
9. **Watchlist-scoped flow** — "show me the tape for MY watchlist" (the Terminal has real watchlists and a flow desk; no doc connects them).
10. **Alert delivery channels** — QuantData's throttling is census'd, but delivery (mobile push, email, webhook, Discord) is never discussed; house options alerts are in-app evaluations on a 5-min cron.
11. **A public data API / MCP as our product** — QuantData's $149.99 API tier (20+ endpoints, 240 req/min, MCP server) is recorded in the pricing census but never once considered as a capability *we* might sell. OEU §5 defers a "research API" without connecting it to the parity frame.
12. **Options chain browser** — a plain sortable chain (bid/ask/last/vol/OI/IV/greeks per contract) is table stakes on every brokerage and options platform; the Terminal has ladders/matrices/surfaces but no chain table, and no doc notes the absence.
13. **P/C ratio history charting** — header P/C gauges are census'd; put/call ratio *time series* (a standard sentiment chart) never appears.
14. **Expiration/OPEX calendar surface** — absent from the masterplan (OEU §5 later flags it).
15. **Realized-vs-expected-move tracking** — expected-move data exists (`moves:{ROOT}` powering the structure strip) but scoring expected vs realized (a standard vol-desk report) is never mentioned.
16. **Vol surface 3D / full IV surface visualization** — census stops at Skew + Term Structure; our side has smile/term; a full surface view (strike × expiry × IV, standard on vol platforms) is unmentioned.
17. **Short-interest / borrow-rate integration** on the dark-pool page — FINRA short-volume exists in the macro darkpool desk, but SI%/CTB as options-desk context is never raised.
18. **Data export** (CSV download of tape/exposure/screens) — never mentioned.
19. **Per-contract liquidity scoring** beyond the Prophet receipt's one-off spread/OI line — no systematic spread/liquidity column in any planned surface.
20. **Delta-adjusted / moneyness-bucketed exposure aggregations** (exposure by moneyness band rather than raw strike) — unmentioned.

**Meta-observation:** the blind-spot pattern is consistent — the teardown census was *excellent on what QuantData shows on screen* (pages, tools, controls) and thin on **workflow/productization capabilities** (search, export, delivery channels, calculators, chain table, selling the API). The two later teardowns (quanted, OEU) partially compensated on surfaces (replay, paint-surfaces, scanner belts, EOD context) but not on workflow features.

---

## 5. Why the unshipped half stayed unshipped — the causal chain

1. **The frontend outran the data plane by design.** Every in-repo lane the masterplan enabled (P0, 1a/1b, Phase-2 slices 1–2, T-A…T-E) shipped within 72 hours of the teardown. Everything left — cadence, conditions, universe, 1-min store, per-strike history, dark-pool prints — lives in the *macro/ops* estate and was explicitly tagged **"⚠️ WHAT'S LEFT IS INFRA-GATED"** in program memory as of 2026-07-24.
2. **The infra unblock arrived and was immediately spent elsewhere.** The gate was "wait for the DO data-plane box"; instead the owner ruled the free M1 Max the data-plane host, and 2026-07-25/26 went to the full 22-job M2→M1 migration (a reliability program, not a parity program). The poller cadence/conditions/roots work — which the migration was supposed to enable — has no shipped commit after it.
3. **Attention then rotated off options entirely:** 07-27→07-31 master is onboarding/paywall (#195), v7/v7b UI overhauls (#228/#230), premium indicator suites (#231-#238), and the native-apps alpha (S0–S5) — which *excludes* the options suite from its surfaces by policy.
4. **Honesty doctrine acted as a hard veto, not a style guide.** At least seven distinct parity features (VEX/UNUSUAL lenses, LIVE badges, IV percentile/25Δ, GEX date-picker, event markers, archived-session tide) were affirmatively *stopped* because the underlying data could not support the claim — the recorded reasons are specific and evidence-based (payload fields verified absent, R2 keys 404'd, calendar horizon checked).
5. **Licensing boundaries were respected early:** the browser vendor socket was deleted rather than adapted, dark-pool needs a feed we don't own, participant-tagged positioning is explicitly off-limits without a license — so the two biggest remaining data gaps (live prints, sub-minute full-universe tape) each require *spending decisions* (Databento/Polygon-TRF; Theta terminal upgrade or recompute box) that were parked as open questions §6 and never closed.

## 6. Key file paths (for follow-up)

- Masterplan: `/Users/chriswong/Documents/Cluade/charting-app/.claude/worktrees/terminal-chinese-text-crypto-323a48/docs/OPTIONS_SUITE_PARITY_MASTERPLAN.md`
- Sibling docs: same dir — `FEATURE_GAP_AUDIT.md`, `DATABENTO_INTEGRATION_DESIGN.md`, `DAYTRADE_SUITE_SPEC.md`, `PRODUCT_PLAN_V2.md`
- Second/third program docs (macro repo, read via `git show origin/main:`): `research/quanted_options/{RECON,MASTERPLAN}.md`, `research/options_estate/OEU_MASTERPLAN.md` in `/Users/chriswong/Documents/Cluade/Macro Dashboard`
- Live poller evidence: `/Users/chriswong/liveflow-ops-wt/scripts/live_flow_poller.py`, `/Users/chriswong/liveflow-ops-wt/collectors/thetadata.py` (~line 1483-1497 column keep-list), `/Users/chriswong/liveflow-ops-wt/data/live_flow_out/meta.json` (cadence 2466s, delta_mode full_day, 122 roots)
- Terminal state: `terminal/components/OptionsHubView.tsx:81` (tab census), `terminal/lib/optionsAlerts.ts` (5 opt_* kinds), `terminal/components/surface/*` (replay estate), `terminal/components/gexdesk/GexHistory.tsx` (scalar scrubber), `terminal/lib/platform/featureManifest.ts:15` (`options: false`)
- Program memory: `~/.claude/projects/-Users-chriswong-Documents-Cluade-charting-app/memory/options-suite-parity-program.md` (the running ledger, incl. the 2026-07-26 data-boundary verification)
