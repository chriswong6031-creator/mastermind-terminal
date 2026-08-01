# QuantData.us feature-screenshot catalog — set A ("some key features", 10 images)

Source folder: `/Users/chriswong/Downloads/some key features` — files `download (1).png` … `download (10).png`.
These are the owner's curated "we must have this" screenshots of QuantData.us. Every image was read
and cataloged below: page identity, every visible widget/control/column/legend/badge, the data on
screen, and the backend capability each screen implies.

---

## Shared chrome (appears in every screenshot)

- **Workspace tab bar** across the top: two saved workspace tabs named **"Consolidated Order Flow"**
  and **"Unconsolidated Order Flow"** (each with a kebab `⋮` menu), then the **active tool tab**
  (name varies per screenshot: Net Drift, Interval Map, Volatility Drift, Net Flow, Dark Flow,
  Gainers / Losers, Market Map, News Feed, Stock Price / Time, Volatility Skew) marked with a
  **green "live" dot** and its own kebab menu, then a **`+` button** to add another tool tab.
  This is a Bloomberg-style multi-tab workspace: users compose dashboards from a tool palette and
  the tabs persist as named workspaces.
  - The workspace names themselves are a data hint: *consolidated* (OPRA consolidated tape) vs
    *unconsolidated* (per-exchange / raw prints) order-flow views are both offered.
- **Ticker pill** top-left (SPY / NVDA / TSLA), dark rounded button — clicking presumably opens a
  symbol search; on some screens followed by a `>` chevron (symbol drill-in).
- **Expiration input** with calendar icon (placeholder text "Expiration") on the options tools —
  filter the analytics to one or more expirations.
- **Session date pill** (e.g. "Dec 18, 2025", "Dec 19, 2025") with calendar icon on every tool —
  the whole tool can be pointed at ANY historical trading session, not just today. (Screenshots are
  dated Dec 2025; i.e. full-session archives are retrievable months later.)
- **Red circular "reset/history" button** at far top-right of every tool (circular-arrow glyph) —
  reset view / return to live.
- Dark navy theme, white/blue typography, green=calls/bullish, red=puts/bearish, blue=underlying.

---

## 1. `download (1).png` — **Net Drift (Premium) — SPY**

**Identity:** Tool tab "Net Drift" (green live dot). Chart title: **"Net Drift (Premium) - SPY"**.

**Controls (left→right):**
- SPY ticker pill + `>` chevron.
- "Expiration" date-picker input (calendar icon) — empty (all expirations).
- Session date pill: **Dec 18, 2025**.
- **"Moneyness"** pill (money-bag icon) — a moneyness filter (ITM/OTM/ATM buckets).
- Icon cluster: **funnel filter icon with a green "1" badge** (one active filter), **bell icon**
  (alerting from this chart), **lightbulb icon** (insights/ideas), **chart-style toggle icon**
  (axis/line style switch), and the red reset button.

**Chart:**
- Legend: **Calls (−$8.27 M)** green, **Puts ($16.37 M)** red, **Underlying ($675.79)** blue —
  legend values are the *current cumulative* net-drift totals for the session.
- Left Y axis: **Premium ($)** from −$15 M to $20 M. Right Y axis: **Underlying ($)** $674–$681.
- X axis: 10:00 AM → 4:00 PM (regular session, minute-resolution lines).
- Three series: cumulative net call premium drift (green, drifting to −$8.27M), cumulative net put
  premium drift (red, grinding up to +$16.37M all afternoon), and the SPY price line (blue).
- **Bottom sub-panel "Volume":** separate mini-chart, Y axis 0 → −250 K, a red line/area of
  cumulative **net contract volume** (negative all day, i.e. net sold / put-dominated), sharing the
  same time axis.

**Data displayed:** SPY, session 2025-12-18, per-minute cumulative net premium by side (calls vs
puts), net volume, spot overlay.

**Backend implications:**
- Requires the **full OPRA trade tape for the underlying's whole chain**, with each trade classified
  by side/aggressor (buy vs sell) so premium can be *netted* (bought − sold), not just summed.
- Per-minute cumulative aggregation over the session; simultaneous net-volume aggregation.
- Filterable server-side (or in a rich client cache) by **expiration** and **moneyness**.
- Historic sessions retrievable by date → multi-month archive of per-minute aggregates.
- Alert hooks off a derived intraday series (bell icon).

---

## 2. `download (2).png` — **Interval Map (GEX) — SPY**

**Identity:** Tool tab "Interval Map". Chart title: **"Interval Map (GEX) - SPY"**.

**Controls:**
- SPY pill + chevron; "Expiration" picker (empty); session date **Dec 18, 2025**.
- **"10 Min"** pill (clock icon) — the aggregation interval is user-selectable.
- **"5 Strikes"** pill (strike-count icon) — how many strikes around spot to render.
- **"Gamma (GEX)"** pill (bar-chart icon) — the plotted metric is a dropdown (Gamma GEX shown;
  implies siblings like Delta/OI/Volume/Vanna etc.).
- Icon cluster: chart icon, magnifier/zoom icon, red reset.

**Chart:**
- Legend: **Underlying ($675.84)** blue.
- Y axis: **Strike Price ($)** $671–$686 with gridlines at listed strikes ($1 apart, visible rows
  roughly every strike).
- X axis: 9:30 AM → 4:00 PM in 10-minute columns.
- **Bubble matrix:** at each (strike, 10-min interval) a dot whose **size = GEX magnitude** and
  **color = sign** (green = positive gamma, red = negative gamma). A dominant row of large green
  bubbles sits at ~$680 all day (the gamma wall), growing/shrinking through the day; late-day green
  bubbles appear near $676–677; strikes below ~$675 show tiny red dots.
- Blue **underlying price line** overlaid on the same axes, oscillating $675.5–$679.5.

**Data displayed:** SPY strikes $671–$686, 2025-12-18, gamma exposure evolving per 10-min interval,
spot path.

**Backend implications:**
- **Per-strike, per-interval intraday GEX time series** — needs OI + greeks per contract and an
  intraday recomputation cadence (at least every 10 min; interval selector implies finer, likely
  1-min, snapshots stored).
- Requires an options-greeks source (or in-house BS greeks from chain quotes) plus OI, refreshed
  intraday, per strike — far beyond a once-daily GEX snapshot.
- Metric selector implies the same (strike × time) matrix is precomputed/queriable for multiple
  exposure metrics.
- Historical day retrieval of the full matrix.

---

## 3. `download (3).png` — **Volatility Drift — NVDA**

**Identity:** Tool tab "Volatility Drift". Chart title: **"Volatility Drift - NVDA"**.

**Controls:** NVDA pill + chevron; "Expiration" picker (empty); session date **Dec 19, 2025**;
red reset. (No moneyness/side pills on this tool.)

**Chart:**
- Legend: **ARV (15.95%)** purple, **IV (32.04%)** yellow, **Underlying ($180.99)** blue.
- Left Y axis: **Volatility** 0%–80%. Right Y axis: **Underlying ($)** $173–$181.
- X axis: ~9:30 AM → 4:00 PM, minute-level.
- Yellow **IV** line: chain-aggregate implied volatility drifting from ~55% at the open down to
  ~30–33% midday, spiking to ~58% into the close then snapping back — i.e. real-time IV with
  visible open/close auction effects.
- Purple **ARV** line: intraday **actual/realized volatility** estimate, extremely spiky
  (5%–70% range), computed from the underlying's own price movement.
- Blue underlying price line ($178.3 → $181).

**Data displayed:** NVDA 2025-12-19, minute-level aggregate IV vs realized vol vs spot.

**Backend implications:**
- **Minute-level chain-aggregate IV series** — requires intraday option quote snapshots (NBBO mids)
  across the chain and an aggregation rule (ATM/expiry-weighted), stored per minute per underlying.
- **Intraday realized-vol engine** on 1-min underlying bars (rolling-window annualized RV).
- IV/RV spread ("drift") visualization = vol-premium monitor; historical days retrievable.

---

## 4. `download (4).png` — **Net Flow (Premium) — SPY**

**Identity:** Tool tab "Net Flow". Chart title: **"Net Flow (Premium) - SPY"**.

**Controls:**
- SPY pill + chevron; "Expiration" picker; session date **Dec 19, 2025**.
- **"Moneyness"** pill and **"Side"** pill ($ icon) — filter by moneyness bucket AND by trade side
  (bid/ask/mid aggressor).
- Icon cluster: funnel filter, bar-chart icon, dual-line chart-style icon, red reset.

**Chart:**
- Legend: **Calls ($660.6 M)** green, **Puts ($864.3 M)** red, **Underlying ($680.64)** blue —
  running session **gross premium totals** by side.
- Left Y axis: **Premium ($)** $0–$50 M (per-interval, not cumulative). Right Y axis: Underlying
  $677–$682.
- X axis: 9:30 AM → 4:00 PM.
- Green and red spiky per-minute premium prints (call vs put premium per interval), green shown as
  a filled area near the baseline; two giant red put spikes (~$30 M at 10:05 AM, ~$40 M at 2:20 PM)
  and a paired green ~$13 M burst at 2:20 PM; blue SPY price line above.

**Data displayed:** SPY 2025-12-19 per-minute call/put premium with $-scale, day totals $660.6M
calls / $864.3M puts, spot overlay.

**Backend implications:**
- Per-minute **gross premium aggregation from the full OPRA tape** for the symbol, side-classified
  (Side filter ⇒ aggressor inference at trade level against the NBBO at print time — needs quotes).
- Moneyness classification at print time ⇒ needs spot at trade timestamp.
- Distinct from Net Drift (#1): this is the *per-interval* premium tape; Drift is the *cumulative
  net* view. Both must exist as queryable series.

---

## 5. `download (5).png` — **Dark Flow — TSLA** (dark-pool equity prints)

**Identity:** Tool tab "Dark Flow". Chart title: **"Dark Flow - TSLA"**.

**Controls:** TSLA pill; session date **Dec 18, 2025**; red reset. (No expiration — this is an
equity, not options, tool.)

**Chart:**
- Legend: **Notional Value ($25.47 B)** purple, **Underlying ($484.50)** blue — $25.47 B is the
  session's cumulative dark notional.
- Left Y axis: **Notional Value** $0–$700 M (per-interval). Right Y axis: Underlying $460–$495.
- X axis: **8:00 AM → ~5:30 PM** — includes pre-market and post-market, not just RTH.
- Purple spiky series of per-minute **off-exchange/dark-pool traded notional**: near-zero until
  ~9:30, sustained $50–200 M/min during RTH, then a **~$650 M single-interval spike at ~4:10 PM**
  and another ~$160 M print ~5:00 PM (closing-cross / late TRF reporting).
- Blue TSLA price line ($470 → $492 → $484) across the whole extended session.

**Data displayed:** TSLA 2025-12-18 dark-pool notional per minute, day total $25.47B, extended-hours
price.

**Backend implications:**
- A **FINRA TRF / off-exchange equity print feed** (trade-level with exchange/venue code "D"),
  minute-aggregated to notional, covering **extended hours**.
- This is an *equities* data lane separate from OPRA — a second tape subscription and pipeline.
- Cumulative session totals + historical-day retrieval.

---

## 6. `download (6).png` — **Gainers / Losers** (market-wide flow leaderboard)

**Identity:** Tool tab "Gainers / Losers". A full-width sortable table.

**Controls:**
- **"Sector"** dropdown (top-left, placeholder).
- Session date **Dec 18, 2025**.
- Icon cluster: funnel filter, a calendar/columns icon, a **column-picker icon** (table-columns
  glyph), red reset. A vertical scrollbar on the right (more rows below rank 16).

**Table columns (each with its own funnel/sort control):**
`Rank | Ticker | Bearish Premium | Bullish Premium | Premium Ratio | Volume (+%) | Trade Count (+%) | Premium (+%)`
- **Bearish Premium** rendered as red pill-bars, **Bullish Premium** as green pill-bars, bar length
  proportional to value (data-bar cells).
- Volume, Trade Count, and Premium each carry a **secondary blue % column** = that ticker's share
  of the whole market's volume/trades/premium.

**Visible data (rank: ticker — bearish / bullish / ratio / volume(+%) / trades(+%) / premium(+%)):**
1. SPY — $16.60 B / $16.69 B / 0.99 / 17.03 M (23.19%) / 1.37 M (16.07%) / $33.70 B (39.27%)
2. SPX — $6.90 B / $6.45 B / 1.07 / 5 M (6.81%) / 1.33 M (15.60%) / $14.23 B (16.59%)
3. MSTR — $1.93 B / $1.83 B / 1.05 / 755.30 K (1.03%) / 64.96 K (0.76%) / $3.92 B (4.57%)
4. TSLA — $1.28 B / $1.41 B / 0.91 / 2.96 M (4.03%) / 599.37 K (7.01%) / $2.96 B (3.45%)
5. QQQ — $912.70 M / $945.56 M / 0.97 / 6.86 M (9.33%) / 856.44 K (10.01%) / $1.98 B (2.30%)
6. ORCL — $653 M / $840.13 M / 0.78 / 613.25 K (0.83%) / 58 K (0.68%) / $1.59 B (1.86%)
7. UNH — $592.03 M / $788.55 M / 0.75 / 220.90 K (0.30%) / 25.03 K (0.29%) / $1.39 B (1.62%)
8. NVDA — $640.90 M / $674.64 M / 0.95 / 2.77 M (3.77%) / 287.29 K (3.36%) / $1.61 B (1.87%)
9. CRWV — $401.42 M / $564.44 M / 0.71 / 359.43 K (0.49%) / 28.23 K (0.33%) / $1.03 B (1.20%)
10. COST — $260.58 M / $557.41 M / 0.47 / 107.11 K (0.15%) / 11.53 K (0.13%) / $821.20 M (0.96%)
11. COIN — $577.97 M / $516.25 M / 1.12 / 313.03 K (0.43%) / 39.41 K (0.46%) / $1.10 B (1.29%)
12. AVGO — $771.95 M / $504.65 M / 1.53 / 748.01 K (1.02%) / 96.66 K (1.13%) / $1.31 B (1.53%)
13. META — $547.01 M / $484.84 M / 1.13 / 549.34 K (0.75%) / 111.86 K (1.31%) / $1.07 B (1.25%)
14. NFLX — $328.78 M / $390.10 M / 0.84 / 721.96 K (0.98%) / 55.43 K (0.65%) / $733.34 M (0.85%)
15. NDX — $629.01 M / $368.41 M / 1.71 / 113.40 K (0.15%) / 53.64 K (0.63%) / $1.10 B (1.28%)
16. MU — $290.82 M / $365.26 M / 0.80 / 735.88 K (1.00%) / 150.76 K (1.76%) / $697.78 M (0.81%)

**Backend implications:**
- **Whole-market OPRA aggregation**: per-ticker daily premium split into bullish vs bearish (i.e.
  every option trade classified by side AND direction semantics: call-buy/put-sell = bullish etc.),
  plus totals for volume/trade-count/premium market-wide so per-ticker % shares can be computed.
- Index options included (SPX, NDX) ⇒ OPRA index feed, not just equity options.
- Sector metadata per ticker for the Sector filter; sortable/rankable API; customizable columns.
- The 39.27% / $33.70B figures imply the denominator (all-market totals ≈ $86 B premium/day) is
  also computed — full-tape processing, not a watchlist.

---

## 7. `download (7).png` — **Market Map** (sector treemap with intraday time scrubber)

**Identity:** Tool tab "Market Map". Full-screen treemap.

**Controls:**
- "Sector" dropdown (filter to one sector); session date **Dec 18, 2025**; **"Sector"** grouping
  pill (grid icon — grouping mode selector); magnifier/zoom; red reset.
- **Bottom time scrubber:** a "Time" slider spanning 9:30 AM → 4:15 PM with tick labels
  (9:30, 10:30, 11:30, 12:30, 1:30, 2:30, 3:30), a draggable white handle at the far right, a
  **play/pause button**, and a blue "4:15 PM" current-position badge. The treemap is **replayable
  through the session**.

**Treemap content (sector headers with blue banner bars):**
- **Technology:** NVDA +1.68%, AAPL 0%, GOOG +1.85%, GOOGL +1.87%, MSFT +1.54%, META +2.24%,
  AVGO +1.08%, TSM +2.79%, ORCL +0.83%, PLTR +4.73%, ASML +2.11%, AMD +1.45%, plus hundreds of
  small tiles.
- **Financial Services:** VOO +0.75%, JPM −0.61%, SPY +0.42%, V +0.41%, IVV +0.81%, VXUS +0.92%,
  MA +0.14% (note: broad-market ETFs are mapped into this sector bucket).
- **Consumer Cyclical:** AMZN +2.43%, TSLA +3.43%, HD −0.49%, BABA +0.18%.
- **Industrials**, **Consumer Defensive** (WMT −0.71%, PG −1.52%), **Healthcare** (LLY +1.45%,
  JNJ −1.11%), **Energy**, **Communication Services**, **Utilities**, **Basic Materials**,
  **Real Estate** — each with dense mosaics of green/red tiles down to tiny caps.
- Tile size ≈ market cap (or dollar volume); tile color = % change at the scrubbed time; label =
  ticker + %.

**Backend implications:**
- **Per-minute price snapshots for the entire US equity/ETF universe** (thousands of symbols) for
  any archived session, so the treemap can be scrubbed/animated through the day.
- Sector/industry classification and market-cap reference data for the whole universe.
- Efficient snapshot query ("all symbols' % change as of 11:37 AM on 2025-12-18").

---

## 8. `download (8).png` — **News Feed**

**Identity:** Tool tab "News Feed". A filterable real-time news list.

**Controls:**
- **"Search…"** free-text box; **"Ticker"** dropdown; **"Topics"** pill (top-right); funnel filter
  icon; red reset. Right-edge scrollbar. Each row has a kebab `⋮` menu.

**Row anatomy:** bold headline; timestamp line "December 18, 2025 at H:MM PM"; **topic tags** in
blue (e.g. "News, Guidance", "Earnings, Earnings Beats, News", "Cryptocurrency, News",
"News, Trading Ideas", "News, Intraday Update, Markets", "News, General"); **ticker tags** (BB,
TSX:BB; SAVA; NKE; MSFT; PTRN; ADBE; CMG; SHW; $BTC, $DOGE, $ETH, $SHIB, $SOL + 1); and on one row
a green **sentiment badge "Slightly Bullish"**.

**Visible items (all Dec 18, 2025, 5:00–5:08 PM — i.e. post-close wire):**
1. 5:08 PM — "BlackBerry Sees Q4 Adj EPS $0.03–$0.05 vs $0.04 Est; Sees Sales $138.000M–$148.000M
   vs $143.393M Est" — News, Guidance — BB, TSX:BB.
2. 5:07 PM — Cassava Sciences FDA letter: clinical trial on full clinical hold — News, General — SAVA.
3. 5:07 PM — NIKE sports-teams quote — News — NKE.
4. 5:06 PM — "BlackBerry Q3 Adj. EPS $0.05 Beats $0.04 Estimate, Sales $141.800M Beat $137.398M
   Estimate" — Earnings, Earnings Beats, News — BB, TSX:BB — **Slightly Bullish** badge.
5. 5:04 PM — "OpenAI's New Fundraising Round Could Value Startup at as Much as $830 Billion – WSJ"
   — News, General — MSFT.
6. 5:04 PM — "Pattern Group Acquires NextWave; Terms Not Disclosed" — News — PTRN.
7. 5:02 PM — "Adobe Teams Up With Runway…AI Video" — News — ADBE.
8. 5:00 PM — "$1000 Invested In Chipotle 10 Years Ago…" — News, Trading Ideas — CMG.
9. 5:00 PM — "Price Over Earnings Overview: Sherwin-Williams" — News, Intraday Update, Markets — SHW.
10. 5:00 PM — "Bitcoin Slides To $85,000 As Ethereum, XRP, Dogecoin Stare Into The Abyss" —
    Cryptocurrency, News — $BTC, $DOGE, $ETH, $SHIB, $SOL + 1.
11. (cut off) "Carnival Q2 Preview…".

**Backend implications:**
- A **licensed low-latency news wire** (taxonomy — Guidance / Earnings Beats / Trading Ideas /
  Intraday Update / "$1000 Invested" listicles — is Benzinga's signature format) with per-story
  ticker mapping (including non-US listings like TSX:BB and crypto $-symbols), topic taxonomy, and
  **machine sentiment tags**.
- Server-side search + ticker + topic filtering; historical retention (dated archive).

---

## 9. `download (9).png` — **Stock Price / Time — TSLA** (underlying candles)

**Identity:** Tool tab "Stock Price / Time". Chart title: **"Stock Price / Time - TSLA"**.

**Controls:** TSLA pill; session date **Dec 18, 2025**; **"Candle"** pill (chart-type selector —
candle vs line etc.); **"1 Min"** pill (interval selector); red reset.

**Chart:**
- Legend: **Underlying ($483.40)** blue.
- Y axis: **Underlying ($)** $471–$492. X axis: ~9:30 AM → ~3:50 PM.
- Full-session **1-minute OHLC candlesticks**, green up / red down, showing $478 open area, dip to
  ~$473.5, rally to ~$490.7 by 11:45, choppy $486–$489.5 afternoon, late fade to ~$483.4. Faint
  volume bars are visible at the lower-left edge behind the axis.

**Backend implications:**
- **1-min OHLC(V) bar store for underlyings with multi-month history**, interval switching, and a
  charting component inside the same workspace framework as the options tools.

---

## 10. `download (10).png` — **Volatility Skew — SPY** (multi-expiry, time-scrubbable)

**Identity:** Tool tab "Volatility Skew". Chart title: **"Volatility Skew - SPY"**.

**Controls:**
- SPY pill; **expiration multi-select pill "Dec 22, 2025 + 7"** (eight expirations selected);
  **"Contract Type"** dropdown (calls/puts/both); session date **Dec 19, 2025**; magnifier; red
  reset.
- **Bottom time scrubber** identical to Market Map's: "Time" slider 9:30 AM → 4:15 PM with tick
  labels, white drag handle, play/pause button, blue "4:15 PM" position badge — the skew is
  **replayable through the session**.

**Chart:**
- Legend: **IV** (yellow dot) and **Underlying ($680.64)** (blue dot).
- X axis: **Strike Price** $612.57 → $748.70. Y axis: **Implied Volatility** 0%–50%.
- ~8 colored skew curves (rainbow: greens, orange, red, yellow, cyan, blues) — one per selected
  expiration — forming the classic smirk: ~25–48% IV at deep puts, ~7–10% trough slightly above
  spot, noisy rising wing to ~20–45% on far OTM calls (short-dated curves are the spikiest).
- **Vertical dashed blue line at spot (~$680.64)**.

**Backend implications:**
- **Full-chain per-strike IV for multiple expirations, snapshotted at intraday intervals** and
  stored per session so the skew can be scrubbed/replayed — i.e. an intraday IV-surface archive,
  not a single end-of-day skew.
- Requires option NBBO quotes chain-wide at snapshot cadence + IV solving, per expiration, with
  contract-type filtering.

---

## Cross-cutting capability summary (what "having this" requires)

1. **Two market-data tapes:** OPRA options trade+quote (incl. index options SPX/NDX) and an
   equities lane including **off-exchange/TRF dark prints** with extended hours.
2. **Trade-level enrichment at ingest:** aggressor/side classification vs NBBO, premium, moneyness
   vs spot-at-print, bullish/bearish semantics — the basis of Net Flow, Net Drift, and
   Gainers/Losers.
3. **Per-minute aggregate stores** per underlying: premium by side (interval and cumulative), net
   volume, dark notional, 1-min OHLCV, aggregate IV, realized vol.
4. **Per-strike × per-interval matrices:** GEX (and sibling metrics) for the Interval Map; chain IV
   snapshots for Volatility Skew replay.
5. **Whole-universe snapshots:** every symbol's price/% change per minute (Market Map scrubber) and
   whole-market daily totals (Gainers/Losers % shares).
6. **Multi-month historical session archive** addressable by date-picker on every tool (Dec-2025
   sessions viewable in later months).
7. **Replay UX primitives:** time scrubber + play/pause on Market Map and Volatility Skew; red
   reset/return-to-live control everywhere; green live-dot tabs (streaming updates).
8. **Workspace system:** named multi-tab layouts, per-tab tool picker (`+`), per-tab kebab menus,
   per-tool filter stacks (expiration, moneyness, side, sector, strikes, interval, metric,
   contract type), alerting (bell), and column customization on tables.
9. **News integration:** licensed wire with topics, tickers (incl. TSX + crypto), sentiment badges,
   search/filter.
