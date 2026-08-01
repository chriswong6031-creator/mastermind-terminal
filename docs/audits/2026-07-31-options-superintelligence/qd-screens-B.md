# QuantData.us feature screenshots — catalog B
Source folder: `/Users/chriswong/Downloads/some key features 1` (6 PNGs, `download (1).png` … `download (6).png`).
These are the owner's curated "we must have this" reference set. Each section below is one screenshot, cataloged exhaustively: page identity, every visible widget/control/column/legend/badge, the concrete data shown, and the backend capability each element implies.

---

## 1. `download (1).png` — Consolidated Order Flow (options time & sales tape)

**Page identity.** Tab bar across the top: **"Consolidated Order Flow"** (active, green live dot), **"Unconsolidated Order Flow"**, **"Stock Price / Time"**, plus a **"+"** button to add more tabs. Every tab has a kebab (⋮) menu. This is QuantData's flagship options flow tape.

**Summary KPI strip (live daily aggregates, each with a red/green donut gauge):**
- **Sentiment: Bullish** (donut showing bull/bear premium split)
- **Put / Call Ratio: 60.13%**
- **Put / Call Volume: 8.52 M / 12.44 M**
- **Put / Call Premium: $7.79 B / $9.90 B**

**Header controls (right side):** date picker showing **Jan 2, 2026** (i.e. any historical session is browsable, not just today); a flag icon (saved/preset filters); a funnel filter icon; a filter-preset/copy icon; a column-picker (list) icon; a red circular reset/replay button.

**Table columns** (each header carries its own funnel icon → per-column filtering):
1. **Time** — HH:MM:SS to the second, sort arrow (descending), e.g. 4:11:03 PM down to 4:10:14 PM (after-hours prints included).
2. **Contract** — four sub-fields: ticker (SPY, SPX, IWM, VIX, QQQ, TLT, IBIT), expiration date (Jan 5 2026 … May 15 2026), strike ($684, $7,100, $236, $20, $450, $87.50, $6,600, $51.50 …), and Call/Put.
3. **Spot** — underlying price at the moment of the print (e.g. SPX $6,858.47, VIX $14.47, TLT $87.12). Note VIX options with VIX spot — index options with index level captured per-trade.
4. **Quantity** — contracts, from 30 up to **36,000** (block prints).
5. **Price** — execution price plus a colored **side letter code**: **A** = at ask, **B** = at bid, **AA** = above ask, **BB** = below bid, **M** = mid-market (white). Visible examples: $1.39 B, $33.80 B, $0.47 A, $2.02 M, $4.29 BB, $166.50 AA, $169.50 BB.
6. **Bid-Ask** — the NBBO quote at execution time, formatted `$bid x $ask` (e.g. $1.39 x $1.40, $165.70 x $166.30, $2.32 x $2.36). Colored dot (red/green/white) preceding it in the Premium column region.
7. **Premium** — dollar premium of the print with colored dot: $28.50 K, $507 K, $68.15 K, **$7.27 M**, **$8.42 M**, $499.50 K, $722 K, $1.70 M.
8. **Sentiment** — Bullish / Bearish / Neutral with green/red/white dot. The classification is side-aware, not just call/put: a **call hit on the bid = Bearish** (SPY $684 Call @ $1.39 B → Bearish), a **put sold at bid = Bullish** (IWM $236 Put @ $0.37 B → Bullish), **mid prints = Neutral** (both 36,000-lot IWM puts @ M → Neutral).
9. **Exchange** — CBOE, PACF, BATS, MIAX, MRCY, EDGX, and **MULTIPLE** (a consolidated multi-exchange sweep — this is the "Consolidated" in the tab name; the sibling tab shows the raw per-exchange legs).
10. **Unnamed trailing badge column** — a colored circle per row (gray/white/orange/yellow): trade condition/flag badges (sweep / block / split / unusual style tagging). A horizontal scrollbar at the bottom shows more columns exist off-screen.

**Notable rows (data richness evidence):**
- 4:11:00 PM VIX Jan 21 2026 $20 Call, spot $14.47, 1,450 @ $0.47 A, $0.45 x $0.48, $68.15 K, Bullish, CBOE (row highlighted/selected — row-level highlight state exists).
- 4:10:51 PM IWM Feb 20 2026 $234 and $236 Puts, **36,000 contracts each**, $2.02/$2.34 M(id), premium **$7.27 M / $8.42 M**, Neutral, MIAX — institutional block spread captured as paired prints.
- 4:10:18 PM SPX Mar 20 2026 $6,900 Put @ $166.50 **AA** and Call @ $169.50 **BB** — deep-ITM SPX combo legs, ~$500 K each.
- IBIT (crypto ETF) options present — universe includes new ETFs.

**Backend capability implied:**
- Full **OPRA time & sales** ingestion at tick granularity with second-level timestamps, including the 4:00–4:15 PM options session.
- **NBBO quote capture at trade time** (bid x ask per print) → requires a consolidated quote feed joined to every trade, not just trades.
- **Aggressor-side classification** into 5 buckets (below-bid / bid / mid / ask / above-ask) and a **side+type → sentiment** rule engine.
- **Consolidated vs unconsolidated** duality: sweep aggregation across exchanges ("MULTIPLE") plus the raw per-exchange leg view on the second tab.
- **Per-exchange attribution** across all OPRA exchanges.
- **Live daily aggregates** (P/C ratio, volume, premium, sentiment) computed streaming.
- **Multi-day history**: the date picker means every session's full tape is stored and queryable.
- Per-column server-side filtering, column show/hide, saved filter presets.

---

## 2. `download (2).png` — Exposure by Strike: Net Gamma Exposure By Strike (SPY) with intraday replay

**Page identity.** Tabs: Consolidated Order Flow, Unconsolidated Order Flow, **"Exposure by Strike"** (active, green dot), "+". Chart title: **"Net Gamma Exposure By Strike - SPY"**.

**Controls:**
- **SPY** ticker pill with a **">"** drill/breadcrumb arrow.
- **Expiration** filter (calendar-style input, empty = all expirations aggregated; i.e. per-expiration filtering of the exposure calc is supported).
- Date picker: **Jan 23, 2026** (historical session).
- **"Gamma"** dropdown with a bar-chart glyph — the greek/metric selector (Gamma here; Delta variant proven in screenshot 6, so the dropdown is multi-greek).
- **"Per 1% Move"** dropdown — normalization mode selector (exposure expressed per 1% underlying move; implies alternative normalizations exist).
- Funnel filter icon, a percent/strike-range icon, magnifier (zoom), red reset button.

**Chart:**
- Legend: **Net Exposure** (green dot) and **Underlying ($689.39)** (blue) — spot drawn as a blue dashed vertical line at ~$689.
- Y-axis: **"Gamma Exposure (Per 1% Move)"**, symmetric −4.75 B … +4.75 B (dollar gamma).
- X-axis: strike price, **$646.61 → $730.1** (auto-ranged around spot).
- Bars: **red = negative net gamma** clustered below spot (typical put-dominated strikes), **green = positive** above spot; an enormous **−4.6 B bar at the ATM strike (~$689)** and a +2.4 B green bar just above (~$692). Zero line drawn dashed red.

**Time replay scrubber (bottom):** a "Time" slider spanning **9:30 AM → 3:51 PM** with a draggable handle, a **pause/play button**, and a current-position bubble reading **"3:51 PM"**. The whole strike profile re-renders as you scrub — intraday GEX evolution replay.

**Backend capability implied:**
- **Intraday snapshotting of the entire SPY options chain** (OI/volume + computed greeks per strike) at minutes-level cadence, stored per session and per historical date.
- Dealer **gamma exposure model** with sign conventions and $-per-1%-move normalization.
- Strike-level aggregation across all expirations with optional expiration filter.
- **Replay service**: given (ticker, date, time) return the full per-strike exposure vector — i.e. a time-series of chain snapshots, not a single EOD calc.

---

## 3. `download (3).png` — Heat Map: Net GEX Heat Map (SPY), strike × expiration matrix with replay

**Page identity.** Tabs: Consolidated Order Flow, Unconsolidated Order Flow, **"Heat Map"** (active, green dot), "+". Chart title: **"Net GEX Heat Map - SPY"**.

**Controls:** **SPY** pill; date picker **Dec 18, 2025**; metric dropdown **"Net GEX"** (implies other metrics: OI, volume, delta …); funnel filter; **alert bell icon** (create alerts off heat-map levels); a refresh/loop icon; magnifier zoom; red reset.

**Legend:** **MVC ($676 Dec 18, 2025)** in purple — the "MVC" (most-valuable/max contract) cell is auto-detected and highlighted purple; **Underlying ($675.84)** in blue — the nearest strike row label **$676 is rendered blue** on the axis.

**Matrix:**
- **Rows = strikes $684 down to $668** ($1 increments, y-axis label "Strike Price").
- **Columns = expirations**, ~12 columns labeled in pairs: **Dec 18 2025, Dec 22 2025, Dec 24 2025, Dec 29 2025, Dec 31 2025, Jan 9 2026** (dailies/weeklies plus the monthly — more expirations than labels, labels span column groups).
- **Cells = signed net GEX dollar values** with green/red intensity shading: e.g. $680/Dec-18 = 526.97 M; $680 next col = **1.16 B** (bright green); $677/Dec-18 = **1.08 B**; $676/Dec-18 = **3.70 B** (purple MVC cell); $675/Dec-18 = **−915.58 M** (bright red); $670 second col = **−1.53 B** (brightest red); $678 late col = 530.34 M (bright green). Small values render in K (e.g. 255.51 K, 867.14 K, −450.75 K). Empty cells exist (no OI at that strike/expiry).
- Extreme cells get saturated highlight colors (bright green / bright red / purple) vs muted shading for ordinary magnitudes.

**Time replay scrubber:** 9:30 AM → 4:15 PM (options close), play/pause, position bubble **"4:15 PM"**.

**Backend capability implied:**
- **Per-(strike, expiration) GEX matrix**, not just per-strike aggregate — full 2-D chain decomposition.
- Same intraday snapshot/replay store as #2, addressable at (ticker, date, time) → full matrix.
- **MVC detection** (argmax cell) computed server-side per snapshot.
- **Alerting hooks** on exposure surfaces (bell icon).
- Historical dates (Dec 18, 2025 picker) → the matrices are archived per session.

---

## 4. `download (4).png` — Quant Data dashboard: Contract Statistics / Market Share / Contract Trade Side Statistics / Contract Price-Time

**Page identity.** Full app chrome visible: **"Quant Data"** logo (top-left), **"Built-In Pages"** dropdown, **"My Pages"** dropdown (user-composed custom layouts), a lightning bolt + live clock **3:57:36 PM**, global funnel filter, **pencil (edit-layout mode)**, fullscreen toggle, **Help**, **Settings**, red master reset. The workspace is a 2×2 grid of independent widget panels, each with its own tab strip and a "+" to add sibling tabs.

### Panel A (top-left): "Contract Statistics" — AAPL
- Controls: **AAPL** pill + ">", **Expiration** filter (empty), date **Dec 12, 2025**, **"Moneyness"** dropdown filter, **"Side"** dropdown (with $ glyph — premium/volume/count basis selector), funnel, red reset.
- Chart: **"Contract Statistics - AAPL"**, legend **Calls (green) / Puts (red)**; three 100%-stacked horizontal bars with in-bar value+percent labels:
  - **Premium**: Puts $43.16 M (12.83%) vs Calls $293.20 M (87.17%)
  - **Volume**: Puts 260.37 K (32.72%) vs Calls 535.46 K (67.28%)
  - **Trade Count**: Puts 41.80 K (36.46%) vs Calls 72.85 K (63.54%)
  - X-axis 0%…100%.
- Implies: per-ticker daily aggregates of premium/volume/trade-count split by call/put, filterable by expiration and moneyness.

### Panel B (top-right): "Market Share" — exchange volume share pie
- Controls: **Ticker** selector (empty = whole market), date **Dec 12, 2025**, **"Pie"** chart-type toggle, **"Exchange"** grouping toggle, funnel, a bar-chart alternate-view icon, red reset.
- Chart: **"Market Share (Equity Volume)"** — pie with 18 labeled slices, all options exchanges with percentages: **ARCA 10.20%, AMEX 6.72%, PHLX 13.47%, NOM 2.58%, BX 1.34%, MRX 4.83%, ISE 5.89%, GEMX 4.30%, SPHR 3.18%, PEARL 3.22%, MIAX 8.56%, EMLD 3.72%, MEMX 3.98%, EDGX 5.41%, CBOE 9.23%, C2 2.99%, BZX 3.31%, BOX 7.08%**.
- Implies: per-exchange volume accounting across the full OPRA exchange roster, market-wide or per-ticker, per day; a sibling **"Market Share Table"** tab exists (visible in Panel D's tab strip).

### Panel C (bottom-left): "Contract Trade Side Statistics" — AAPL premium by execution side
- Controls: **AAPL**, Expiration filter, date **Dec 12, 2025**, **Moneyness** dropdown, **"Premium"** metric dropdown (bar-chart glyph — switchable to volume/count), funnel, red reset.
- Chart: **"Contract Side Statistics (Premium) - AAPL"**, legend **Calls ($293.20 M) / Puts ($43.16 M)**; five 100%-stacked rows, one per execution-side bucket:
  - **Above Ask**: Puts $111.38 K (20.63%) vs Calls $428.40 K (79.37%)
  - **Ask**: $19.46 M (17.82%) vs $89.76 M (82.18%)
  - **Mid Market**: $4.65 M (15.59%) vs $25.18 M (84.41%)
  - **Bid**: $18.84 M (9.69%) vs $175.50 M (90.31%)
  - **Below Bid**: $96.26 K (3.97%) vs $2.33 M (96.03%)
- Implies: every trade for the day is bucketed by the 5-level aggressor classification (same AA/A/M/B/BB engine as the tape) and premium is aggregated per bucket per call/put — a direct downstream of trade-vs-NBBO joining.

### Panel D (bottom-right): tabs "Market Share Table" / **"Contract Price / Time"** (active) / "Stock Price / Time" / +
- Controls: contract selector breadcrumb **SPY > Dec 12, 2025 > $670 > Put** (ticker → expiration → strike → type), a second date picker **Dec 12, 2025**, **"Candle"** chart-style dropdown, **"1 Min"** interval dropdown, red reset.
- Chart: **"Contract Price / Time - SPY"**, legend **Contract ($0.01)** (red/green candles) and **Underlying ($681.41)** (blue line). Dual axes: left **Contract Price ($)** $0–$0.30; right **Underlying ($)** $678–$690. Lower sub-pane: **Option Volume** histogram (gridlines 2 K / 6 K) with a large red volume spike ~11:45 AM. X-axis 10:00 AM → 3:00 PM.
- Implies: **1-minute OHLCV candle series for every individual option contract**, stored historically (Dec 12 session viewed), with per-minute contract volume and a synchronized underlying price series for dual-axis overlay; selectable chart styles and intervals.

**Backend capability implied by the page as a whole:** a widget/dashboard platform (built-in + user-saved pages, per-panel tabs, edit mode), per-day aggregate stores keyed by ticker/expiration/moneyness/side, exchange-share accounting, and a **per-contract minute-bar warehouse** — the heaviest storage item on this page.

---

## 5. `download (5).png` — Volatility suite: Volatility Drift / IV Rank / Volatility Skew / Term Structure

**Page identity.** Same Quant Data chrome (Built-In Pages / My Pages, live clock **3:55:28 PM**). 2×2 grid of volatility widgets, all SPY.

### Panel A (top-left): "Volatility Drift" — intraday realized vs implied
- Controls: **SPY**, Expiration filter, date **Dec 12, 2025**, red reset.
- Chart: **"Volatility Drift - SPY"**, legend: **ARV (8.34%)** purple (actual/realized vol), **IV (7.39%)** yellow, **Underlying ($681.43)** blue. Left Y "Volatility" 0–35%; right Y $676–$690. X 10:00 AM → 3:00 PM. Three intraday series: jagged purple realized-vol line, smoother yellow IV drift line, blue underlying.
- Implies: **intraday implied-vol computation** (chain-derived, minute-cadence) and an **intraday realized-vol estimator** on the underlying, plotted head-to-head; historical sessions retrievable.

### Panel B (top-right): "IV Rank" — daily history
- Controls: **SPY**, **Contract Type** dropdown, **"365-Day Lookback"** dropdown, **"30-Day Maturity"** dropdown, red reset.
- Chart: **"Implied Volatility Rank - SPY"**, legend **IV Rank (6.64%)** yellow, **Underlying ($681.43)** blue. Left Y 0–40% "Implied Volatility Rank"; right Y $610–$690. X-axis **"Session Date": Sep 4, 2025 → Dec 8, 2025** (multi-month daily series).
- Implies: **constant-maturity 30-day IV** interpolated daily and archived for ≥ a year (the 365-day lookback needs a year of daily IV history), rank computed against the configurable window; maturity and lookback are user-selectable parameters.

### Panel C (bottom-left): "Volatility Skew" — multi-expiration smile with replay
- Controls: **SPY**, expiration multi-select pill reading **"Dec 15, 2025 + 6"** (7 expirations selected at once), **Contract Type** dropdown, date **Dec 12, 2025**, magnifier zoom, red reset.
- Chart: **"Volatility Skew - SPY"**, legend **IV** (yellow) and **Underlying ($681.43)** (dashed vertical at spot). Y "Implied Volatility" 0–50%; X "Strike Price" **$613.39 → $749.70**. **~7 colored skew/smile curves, one per selected expiration** (orange, red, blue, green, teal, cyan, yellow), all showing put-side elevation and upside wing kick.
- **Time replay scrubber**: 9:30 AM → 3:55 PM, play/pause, bubble "3:55 PM" — **the entire skew surface is replayable intraday**.
- Implies: per-contract IV across the whole chain snapshotted intraday, multi-expiration overlay rendering, replay store addressable by time.

### Panel D (bottom-right): "Term Structure" — ATM IV vs days-to-expiry with replay
- Controls: **SPY**, **Expiration** dropdown, **Strike Price** dropdown, **"Delta (0 to 1)"** dropdown (delta-bucket filter for which contracts feed the curve), date **Dec 12, 2025**, **"ATM"** toggle pill, red reset.
- Chart: **"Term Structure - SPY"**, legend **IV** yellow, **Underlying ($681.43)**. Y "Implied Volatility" 6–24%; X **"Days Until Expiration" 0 → 1000** — the term structure runs out ~3 years (LEAPS included), upward sloping from ~9% to ~21%.
- **Time replay scrubber**: 9:30 AM → 3:55 PM with bubble "3:55 PM".
- Implies: full-chain IV including LEAPS, ATM/delta-bucket selection logic, intraday snapshot + replay of the whole term structure.

**Backend capability implied by the page:** an **options-analytics compute layer producing IV per contract intraday**, constant-maturity interpolation, realized-vol estimation, and a snapshot archive deep enough to replay any historical session's skew/term structure minute by minute, plus ≥ 365 days of daily IV summary history.

---

## 6. `download (6).png` — Exposure workspace: GEX by Strike / Interval Map / Delta Exposure / Net GEX Heat Map (live session)

**Page identity.** Same chrome; clock **12:39:32 PM** — captured mid-session, all four time scrubbers sitting at "12:39 PM", i.e. these widgets stream live and the replay slider doubles as a live head. 2×2 grid, all SPY, session date **Dec 10, 2025**.

### Panel A (top-left): tabs **"Exposure by Strike"** (active) / **"Exposure by Expiration"** / +
- Controls: **SPY**, Expiration filter, **Dec 10, 2025**, **"Gamma"** metric dropdown, **"Per 1% Move"**, funnel, percent icon, zoom, red reset.
- Chart: **"Net Gamma Exposure By Strike - SPY"**, legend Net Exposure / **Underlying ($683.17)** (dashed blue vertical). Y ±1.75 B "Gamma Exposure (Per 1% Move)"; X $630.51 → $740. Red bars below ~$681, dense green bars $683–$710.
- **Below the chart: a brush/navigator mini-strip** (zoom-range selector with a sparkline) — pan/zoom over the strike axis.
- **Time scrubber**: ticks 9:30 AM → 12:30 PM, live bubble **12:39 PM**, pause button.
- Note the sibling tab **"Exposure by Expiration"** — the same exposure metrics aggregated per expiration date instead of per strike.

### Panel B (top-right): "Interval Map" — time × strike GEX bubble grid
- Controls: **SPY**, Expiration filter, **Dec 10, 2025**, **"5 Min"** interval dropdown, **"5 Strikes"** strike-granularity dropdown, **"Gamma (GEX)"** metric dropdown, bar-chart alternate view icon, zoom, red reset.
- Chart: **"Interval Map (GEX) - SPY"**, legend **Underlying ($683.17)** blue line. Y "Strike Price ($)" $676–$690; X time 9:30 AM → 12:30 PM.
- Rendering: a **dot-matrix bubble chart** — for every 5-minute interval and every strike, a dot whose **color is sign (green above/positive, red below/negative)** and whose **size encodes GEX magnitude**; the blue underlying price line snakes between the green ceiling and red floor, visually riding the gamma "rails". Horizontal brush/scrollbar below.
- Implies: **stored 5-minute per-strike GEX snapshots for the whole session** queried as a matrix — the clearest single proof of an intraday exposure time-series store; interval and strike bucket sizes are user-tunable.

### Panel C (bottom-left): tabs "Exposure by Strike" (active) / "Exposure by Expiration"
- Controls: **SPY**, Expiration, **Dec 10, 2025**, **"Delta"** metric dropdown, **"Per 1% Move"**, funnel, %, zoom, red reset.
- Chart: **"Net Delta Exposure By Strike - SPY"**. Y **"Delta Exposure (Per 1% Move)" ±27.5 B**; X $629.70 → $739.0. Green/red bars, one dominant ~+27 B green bar near $700, a −12 B red bar near $640.
- Same brush navigator + time scrubber to 12:39 PM.
- Confirms the greek dropdown is multi-metric: **Gamma and Delta proven on-screen** (Vanna/Charm likely siblings), all with the same per-1%-move normalization and replay.

### Panel D (bottom-right): "Heat Map" — Net GEX strike × expiration, live
- Controls: **SPY**, **Dec 10, 2025**, **"Net GEX"** dropdown, funnel, **alert bell**, refresh, zoom, red reset.
- Chart: **"Net GEX Heat Map - SPY"**, legend **MVC ($700 Dec 19, 2025)** purple, **Underlying ($683.17)**; the **$683 row label is blue** (spot row).
- Rows $690 down to $676; column labels **Dec 10, Dec 12, Dec 16, Dec 18, Dec 22, Dec 24, Dec 31 2025, Jan 9 2026** (~16 columns under 8 labels). Signed cells with intensity shading and saturated highlights: bright green **549.08 M** ($685 front expiry), **524.90 M** ($690), **269.26 M** ($683), **260.79 M** ($680); bright red **−305.18 M, −313.76 M, −182.51 M, −385.56 M, −246.97 M** clustered $677–$682 front expiries; K-scale cells (−531.72 K, 797.91 K, 682.55 K, −495.10 K, −487.06 K…) further out; some empty cells.
- Horizontal brush below the matrix; time scrubber to 12:39 PM.
- Note the MVC here points to **$700 Dec 19, 2025** — an expiration not even in the visible column window, i.e. MVC is computed over the full chain, and the matrix is horizontally scrollable across all expirations.

**Backend capability implied by the page:** everything from #2/#3 plus: multi-greek dealer-exposure computation (delta and gamma at minimum), by-strike AND by-expiration aggregations, 5-min interval × strike matrices, live streaming of all four widgets simultaneously with a common session clock, per-widget brush/zoom state, and alert hooks on the heat map.

---

## Cross-cutting synthesis — what the backend must provide to match this set

1. **OPRA tick-level time & sales with NBBO join.** Every print carries execution price, size, exchange, the prevailing bid×ask, the underlying spot, a 5-level aggressor classification (below-bid/bid/mid/ask/above-ask), a derived Bullish/Bearish/Neutral sentiment, and condition badges. Both consolidated (sweep-aggregated, "MULTIPLE") and unconsolidated (per-exchange leg) views exist.
2. **Full-session archives, browsable by date.** Every widget has a session date picker (Jan 2 2026, Jan 23 2026, Dec 18 2025, Dec 12 2025, Dec 10 2025 all shown) — tape, exposures, vol analytics and per-contract candles are all stored per historical day.
3. **Intraday snapshot store + replay everywhere.** Time scrubbers with play/pause appear on GEX-by-strike, GEX heat map, volatility skew, term structure, interval map — the chain's greeks/exposures are snapshotted at ≤5-min cadence (5-min proven by the Interval Map; the slider bubbles show minute resolution) and any moment of any stored session can be re-rendered. During market hours the same widgets run live (12:39:32 PM screenshot).
4. **Per-contract 1-minute OHLCV candles** with per-minute option volume and synchronized underlying overlay (Contract Price/Time widget), selectable interval and candle/line style.
5. **Dealer-exposure analytics**: net GEX and net delta exposure (dropdown-selectable greek), per-1%-move dollar normalization, aggregations by strike, by expiration, and by strike×expiration matrix, MVC (max cell) detection over the full chain, alert hooks on exposure surfaces.
6. **Volatility analytics layer**: per-contract IV intraday; multi-expiration skew overlays; ATM term structure to ~1000 days (LEAPS); delta-bucket (0–1) contract selection; intraday realized-vol (ARV) vs IV drift; constant-maturity 30-day IV with ≥365-day daily history for IV Rank.
7. **Daily aggregate stores**: put/call ratio/volume/premium and market sentiment (streaming, header KPIs); per-ticker premium/volume/trade-count call-put splits; per-ticker premium by execution-side bucket; all filterable by expiration and moneyness; per-exchange market-share accounting across all 18 OPRA exchanges (pie + table views).
8. **Dashboard platform**: Built-In Pages vs My Pages (user-saved layouts), 2×2 (and presumably arbitrary) panel grids, per-panel tab strips with "+" to add widgets, kebab menus, edit-layout pencil mode, global filter, fullscreen, per-widget reset, per-widget zoom and brush navigators, per-column table filters, column picker, saved filter flags.
9. **Universe**: index options (SPX, VIX) alongside ETFs (SPY, QQQ, IWM, TLT, IBIT) and single names (AAPL) — index-option support with index spot capture is required, not just equities.
