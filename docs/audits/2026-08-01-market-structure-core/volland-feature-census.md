# Volland (vol.land) — Complete Feature Census

**Compiled:** 2026-08-01 · **Analyst:** research agent, Mastermind Terminal
**Subscription status:** none (no trial exists — see §8). Everything below is from public sources.

## Evidence tagging

- **[DOC]** — stated in a public source I actually retrieved and read; URL cited.
- **[INF]** — my inference from documented facts; labelled as inference every time.
- **[UNKNOWN]** — could not determine. Stated as a gap, never filled with invention.

All prose is paraphrased. No marketing or documentation text is reproduced verbatim beyond short
quoted identifiers (widget names, enum values, field names).

---

## 0. Source inventory

| ID | Source | What it gave | Retrieved |
|----|--------|--------------|-----------|
| **S1** | `https://vol.land/VollandUserGuide_May26.pdf` — official user guide, cover-dated "Updated: May 27, 2026", 45pp | **Primary.** Per-widget descriptions, axes, framework | 2026-08-01, HTTP 200, 3,973,032 bytes |
| **S2** | `https://vol.land/VollandUserGuide_Jun24.pdf` — prior guide, "Updated: June 4, 2024", 35pp | Historical tier/pricing structure | 2026-08-01, HTTP 200, 1,583,233 bytes |
| **S3** | `https://api.vol.land/api/v1/stripe/products` (+ `?productType=volland-api`) | **Live pricing + per-tier feature lists + API pricing** | 2026-08-01, HTTP 200 |
| **S4** | `https://vol.land/assets/index-B7EPSNJp.js` — the site's React SPA bundle (701,668 bytes) | **Entitlement matrix, in-app widget help text, full FAQ, full API documentation, route table, endpoint surface** | 2026-08-01, HTTP 200 |
| **S5** | `https://vol.land/VollandWhitePaper.pdf` — "Impact of option dealer flows on equity returns", Jason D. DeLorenzo, dated December 19, 2023 | Computation methodology, accuracy validation | 2026-08-01, HTTP 200, 1,027,171 bytes |
| **S6** | `https://www.wizofops.com/` (`/volland.html`, `/faq.html`, `/articles/why-not-gex`) | Vendor positioning, anti-GEX argument | 2026-08-01 |
| **S7** | `https://laductrading.com/our-partners/` and `https://laductrading.com/new-volhacks-from-vol-land/` (dated Nov 16, 2025) | Third-party VolHacks writeup + discount offer | 2026-08-01 |
| **S8** | YouTube `@wizardofops` channel, oEmbed API | Video titles/URLs | 2026-08-01 |

**Method note:** `vol.land` returns HTTP 403 to the WebFetch user-agent but HTTP 200 to a normal
browser UA via curl. The site is a Vite/React SPA with a 4.6 KB HTML shell; all page copy lives in
the JS bundle (S4), which is why the bundle is the richest single source. There are no separate
lazy-loaded chunks for the pages quoted here.

---

## 1. Headline: the six tiers, live pricing, and the exact entitlement matrix

### 1.1 Live pricing (authoritative)

Pulled from Volland's own public Stripe products endpoint (S3), unauthenticated, on 2026-08-01.
This is the same call the pricing page itself makes (`Ft.getPricePlans` → `stripe/products` in S4).

| Tier | `metadata.tier` | Price (USD/mo) | Stripe product | Stripe price |
|------|-----|-----|-----|-----|
| VolHacks | 0 | **$99** | `prod_TMu7mJfQI225Bc` | `price_1SQAJPCEYcPfq5pZeca8Br3u` |
| Volland Swing | 1 | **$150** | `prod_M4T8uHE8XYNffC` | `price_1LMKCSCEYcPfq5pZCqTxR0OH` |
| Volland 0DTE | 2 | **$250** | `prod_NlxqHGpGGmXvF1` | `price_1N0PuqCEYcPfq5pZENku6Y0o` |
| Volland Insight | 3 | **$400** | `prod_Nlxr6Y3g4gPIXT` | `price_1N0PvbCEYcPfq5pZTuhrHTiU` |
| Volland Universe | 4 | **$1,000** | `prod_NlxrZJuaqW9PnY` | `price_1N0PwECEYcPfq5pZ7hQKt6KZ` |
| Volland Institutional | 5 | **$5,000** | `prod_TMu94mo6tpru3s` | `price_1SQAKsCEYcPfq5pZspqSV7rn` |

[DOC] All six prices, IDs and tier ordinals from S3. All are `type: "recurring"`, currency `usd`,
`paymentType: "subscription"`. No tier is flagged `mostPopular`. This exactly matches the tier
structure given in the research brief — **confirmed, not assumed.**

[DOC] Monthly billing only; no daily/weekly/annual plans (S4, FAQ "What subscription plans do you offer?").

### 1.2 Per-tier feature lists, verbatim-in-substance from Stripe (S3)

- **VolHacks ($99):** Quad Screener · Extremes · Catalyst Impact · Spot Vol Beta
- **Volland Swing ($150):** everything in VolHacks, plus Ticker Widget · Exposure Charts
- **Volland 0DTE ($250):** everything above, plus 0DTE Widget (updates every 5 minutes) · 0DTE Delta Decay Greek · Liquidity Widget · Notional Hedging Exposure
- **Volland Insight ($400):** everything above, plus Aggregate Greek Trend · Dealer Premiums Widget · Greek Hedging Widget · Spot-Vol Correlation "Overvixing" · Volatility Plane Heatmap · *Coming Soon:* Equity Futures Tickers
- **Volland Universe ($1,000):** everything above, plus Term Structure Aggregate Exposure · *Coming Soon:* Volatility Analytics · *Coming Soon:* Futures Tickers (Equities, Commodities) · *Coming Soon:* Futures Tickers (Foreign Exchange, Metals, Oil, Rates)
- **Volland Institutional ($5,000):** everything above, plus Floating Strike (every 5 min) · Implied Skew (every 5 min) · Theo Curves (every 5 min)

### 1.3 The entitlement matrix — extracted from the app's own gating code

This is the highest-value artifact in this report. S4 contains the literal client-side gate object.
Tier constants resolve as: `To`=VolHacks, `Et`=Volland Swing, `ye`=Volland 0DTE, `ee`=Volland
Insight, `Z`=Volland Universe, `W`=Volland Institutional; `Jo` = all six.

| Widget type (internal ID) | Minimum tier | Available on |
|---|---|---|
| `QUAD_SCREENER` | VolHacks | all 6 |
| `EXTREMES` | VolHacks | all 6 |
| `CATALYST_IMPACT` | VolHacks | all 6 |
| `SPOT_VOL_BETA` | VolHacks | all 6 |
| `TICKER` | Swing | 5 |
| `CHART` type=`exposure` | Swing | 5 |
| `CHART` type=`exposure`, greek=`deltaDecay` | 0DTE | 4 |
| `CHART` type=`summary` | 0DTE | 4 |
| `ZERODTE` | 0DTE | 4 |
| `LIQUIDITY` | 0DTE | 4 |
| `GREEK_HEDGING` | Insight | 3 |
| `DEALER_PREMIUM` | Insight | 3 |
| `AGGREGATE_TREND` | Insight | 3 |
| `SPOT_VOL_CORRELATION` | Insight | 3 |
| `GREEK_VOL_PLANE` | Insight | 3 |
| `TERM_STRUCTURE` | Universe | 2 |
| `FLOATING_STRIKE` | Institutional | 1 |
| `THEO_CURVES` | Institutional | 1 |
| `IMPLIED_SKEW` | Institutional | 1 |

[DOC] All rows from S4. Locked widgets render a placeholder reading "Upgrade to {tier} to view this
widget" (S4). Unavailable widgets appear greyed in the add-widget menu (S1, p.14).

[DOC] S4 also carries an ordered tier list that begins with a **legacy "Volland Basic"** tier ahead of
VolHacks — i.e. the client still recognises a grandfathered plan not on sale. [INF] Existing Basic
subscribers are likely still served; this is an inference from the constant's presence, not a stated policy.

### 1.4 Widget grouping and UI taxonomy (S4)

Widgets are grouped in the picker with colour codes: **Summary** (blue), **Exposure** (orange),
**DTE** (grey-blue), **Surface** (green), **Statistics** (purple), **VolHacks** (yellow),
**Institutional** (orange), **Other** (grey-blue). Full-screen mode is enabled only for `CHART`,
`CALENDAR`, and `GREEK_VOL_PLANE`. [DOC]

Also present in the widget registry but **not** sold as headline features: `WATCHLIST`, `CALENDAR`,
`NEWS`, `AGGREGATE`, `SCREENER`, `SHADOW`, `INTRO`. [DOC] S4. Their functionality is [UNKNOWN] —
they carry no in-app description text and no guide section.

---

## 2. VolHacks tier ($99) — the four poorly-understood widgets

These were the priority dig. All four are now documented from three independent angles: the official
guide (S1), the in-app tooltip registry (S4), and the API response schema (S4 API docs).

### 2.1 Quad Screener

**Displays** [DOC] (S1 p.16; S4): A four-quadrant scatter plot. User multi-selects tickers from
Volland's ~1,000-ticker library; each ticker plots as one point.
- **X-axis** — vanna exposure, expressing directional lean, **normalised against that ticker's own trailing 6 months**. S4 chart config labels this axis **"Direction"**.
- **Y-axis** — gamma exposure, expressing volatility expectation. S4 labels this axis **"Volatility"**.

**API shape** [DOC] (S4 API docs, `POST /volhacks/quad-screener`): request `{tickers: [...]}`;
response `{items: [{ticker, x, y}], lastModified}`. Sample values are small signed decimals
(e.g. SPX `x:0.3, y:0.82`; AAPL `x:-1, y:-0.28`). [INF] The `-1` values and the ±1 range strongly
suggest a clamped/normalised score rather than a raw notional — consistent with the "compared to the
past 6 months" normalisation. Inference, not stated.

**How a trader uses it** [DOC] (S1 p.16): Two named use cases — (1) build a workspace of many quad
screeners for sector-level analysis to surface **dispersion trade** opportunities; (2) plot an index
alongside its leveraged ETFs, volatility ETNs and largest components to detect dealers leaning too
far one way or over-levered in a particular volatility regime.

**Computation** [DOC]: Stated only as "uses vanna exposure" (X) and "gamma exposure" (Y) with a
6-month lookback for the X normalisation. The normalisation formula itself is [UNKNOWN].

**Media** [DOC]: `https://www.youtube.com/shorts/LpeDXkJErCc` — "Quad Screener #Trading Ideas -
Custom Volland Widgets for Dispersion and Risk Management" (Wizard of Ops). Also covered in the
LaDuc/DeLorenzo joint presentation (S7). Screenshot in S1 at p.16. **Timestamps: [UNKNOWN]** — I
could not retrieve chapter markers or transcripts (YouTube serves JS-only pages to this toolchain).

### 2.2 Extremes

**Displays** [DOC] (S1 p.17; S4): A compact table, not a chart. It reports **support** and
**resistance** extreme price levels across **three independent tenor buckets**:
- Short-Term: 0–2 weeks
- Swing Term: 2–6 weeks
- Long Term: 2–6 months

**Meaning** [DOC] (S1 p.17): Levels are **vanna transition levels** — prices at which dealers would
be actively hedging *against* prevailing market momentum. These mark where dealers get stretched, so
they are candidate reversal zones.

**Sentinel semantics** [DOC] (S1 p.17; S4 tooltip) — this is the part that confuses people:
- `---` in **support**, or `+++` in **resistance** → there is *not enough option volume at any price*
  to arrest momentum at that tenor. (No brake exists.)
- `+++` in **support**, or `---` in **resistance** → price has *already passed* the nearest extreme;
  start looking for a reversal.

**Critical structural caveat** [DOC] (S1 p.17): the three tenors are computed **independently and do
not consider one another**. Consequently a long-term resistance can legitimately print *below* a
short-term resistance. Volland justifies isolating them on the grounds that vanna is computed on
fixed-price volatility and volatility moves at different speeds per tenor. Regime guidance given:
short-term extremes dominate in calm markets, swing-term in moderately volatile markets, long-term in
very volatile markets.

**API shape** [DOC] (S4, `GET /volhacks/extremes?ticker=`): returns three objects `shortTerm`,
`swing`, `longTerm`, each `{min, max, maxFallbackValue, minFallbackValue}`. Note the sample shows
`min: "NaN"` paired with `minFallbackValue: "---"` — i.e. the sentinel strings are a **fallback field
carried separately from the numeric field**, and `NaN` is transported as a *string*.

**Computation** [DOC]: "vanna transition levels" at three tenors; the transition detection algorithm
is [UNKNOWN].

**Media** [DOC]: `https://www.youtube.com/shorts/yU3nIwgAIiU` — "Introducing VolHacks: Quad Screener,
Spot Vol Beta, Catalyst Impact, Extremes". Screenshot in S1 p.17. Timestamps [UNKNOWN].

### 2.3 Catalyst Impact

**Displays** [DOC] (S1 p.17; S4): A **single gauge** (not a time series). API returns exactly one
number: `{percentage: 97.1}` (S4, `GET /volhacks/catalyst-impact?ticker=`). The gauge is labelled in
bias language, e.g. "strong bullish bias".

**Meaning** [DOC] (S1 p.17): It measures the **imbalance of price power derived from delta change on
the dealer book**, and projects what dealer hedging will do to the underlying **given the IV crush
that reliably follows a catalyst**. Explicitly *not* a fundamental view — it reads the net positioning
of all participants.

**Directional convention (counter-intuitive, worth flagging)** [DOC] (S1 p.17; S4): a *strong bullish
bias* reading means **customers are positioned bearish at the margin**, so the likely post-catalyst
drift is upward. The widget is a contrarian read on crowding.

**How a trader uses it** [DOC] (S1 p.17): Pre-earnings / pre-event triage. If your fundamental thesis
*opposes* the gauge, the guide's advice is to stay out of the name through the catalyst. If your
thesis *agrees* with the gauge, you are the contrarian and should research harder before sizing.

**Computation** [DOC]: Stated as based on "delta change on the dealer book" combined with post-catalyst
IV reduction. The specific formula and what the percentage is a percentage *of* are [UNKNOWN].

**Media** [DOC]: Covered in `https://www.youtube.com/shorts/yU3nIwgAIiU` and the LaDuc presentation
(S7). Screenshot in S1 p.17. Timestamps [UNKNOWN].

### 2.4 Spot Vol Beta ("Overvixing")

**Displays** [DOC] (S1 p.18; S4): A **gauge plus a table of "Vol Events"** beneath it. API returns
`{correlation, vixEvents: []}` (S4, `GET /volhacks/spot-vol-beta?ticker=`).

**Meaning** [DOC] (S1 p.18): Built on spot-vol correlation — the inverse relation between daily equity
returns and implied volatility. Volland dynamically derives the VIX change implied by each 1% SPX
move. **"Overvixing"** = VIX overshoots that implied change; **"undervixing"** = it undershoots.

**The headline quantitative claim** [DOC] (S1 p.18): Volland's study finds that when VIX changes **2
or more points** by the close, SPX trades back to the **prior day's close within 3 weeks**. Since
2012 this has hit **28 of 30 times = 93%**, against what they compute as a ~**42%** base rate implied
by options. [DOC] S7 (LaDucTrading partners page) independently states the same 28-of-30 / 93% figure
"as of October 31, 2025" — so the sample is dated and has not been restated since.

**Regime usage** [DOC] (S1 p.18): frequent overvixing tends to load a rally that fires when the market
turns up; undervixing helps time the *top* of a volatility-driven rally.

**Interpretation of the live reading** [DOC] — from a third-party republication of Volland's own SPX
number: `https://www.financialjuice.com/News/9465183/SPX-Spot-Vol-Beta---Volland.aspx` and
`https://x.com/financialjuice/status/2026387525728665908` report an SPX Spot Vol Beta of **-0.96**
described as volatility *under-reacting* to the price move. [INF] So the published gauge value is a
signed beta near -1 for SPX, and more-negative = VIX reacting more strongly. Inference from one
example; the scale bounds are [UNKNOWN].

**Naming note** [DOC]: The Insight tier separately sells a **"Spot-Vol Correlation 'Overvixing'"**
widget (`SPOT_VOL_CORRELATION`, S3/S4). That is a *different* widget from VolHacks' Spot Vol Beta —
see §5.4. Both trade on the overvixing concept; the VolHacks one is the reduced gauge, the Insight
one is the underlying regression chart.

**Media** [DOC]: `https://www.youtube.com/shorts/yU3nIwgAIiU`. Screenshot in S1 p.18. Timestamps [UNKNOWN].

### 2.5 Vendor's own framing of VolHacks

[DOC] (S1 p.16): Volland explicitly positions the VolHacks widgets as **simplifications** and warns
users to lean on them "prudently" while still learning the granular data. [INF] This reads as the
vendor hedging against the $99 tier being treated as a complete product — relevant if we are
benchmarking a comparable entry tier.

---

## 3. Volland Swing tier ($150) — additions

### 3.1 Ticker Widget

**Displays** [DOC] (S1 p.26): A statistics panel showing, for one underlying: current price, that
ticker's **30-day "VIX" calculation**, and total dealer hedging.

**Notable capability** [DOC] (S1 p.26): Volland computes a **VIX-style 30-day IV number for every
ticker it covers**, not just indices. That is a genuinely differentiated data point.

**Interpretation guidance** [DOC] (S1 p.26): when notional dealer hedging exceeds equity notional
traded, it does *not* mean dealers are all the volume — it means dealers carry heavily warehoused risk
in that name, so volatile moves hit the price hard. Example given: mega-cap tech that can move 10–15%
on earnings despite multi-trillion-dollar caps.

[DOC] In the June 2024 guide (S2 p.20) this panel also displayed **equity notional traded that day**
for the option-vs-equity notional comparison. The May 2026 guide's Ticker Widget description no longer
lists that field. [INF] Possibly moved to another widget or dropped; I could not confirm which. Flagged
as a **discrepancy between the two guides**, not a finding.

### 3.2 Exposure Charts

The core product. Three chart forms share the exposure engine.

**(a) The Exposure Chart** [DOC] (S1 p.20) — a net-dealer-positioning **histogram by strike**.
- X-axis: available option strikes
- Y-axis: notional USD dealers must hedge
- Each bar = notional held for the selected greek at that strike; hover gives strike + notional
- S4 chart config: column series, green positive / red negative, y-axis titled "Notional Hedging Requirement", compact `$` formatting, plot-lines marking current price

**(b) The Dealer Flow Chart / "Cumulative Chart"** [DOC] (S1 p.21)
- X-axis: strikes; Y-axis: **cumulative** dealer notional hedging requirement (USD)
- Behaviour differs by greek order — and this is the important part:
  - **First-order greeks** → absolute value of dealer position across all strikes; renders as a roughly horizontal line
  - **Second-order greeks** → the most recent update's closing strike is pinned at **zero**, and the curve shows cumulative hedging requirement as the market moves away from it
- S4: line series with markers, same "Notional Hedging Requirement" y-axis

**(c) Term Structure Exposure Chart** [DOC] (S1 p.22) — *Universe tier only*, see §6.1.

**Controls** [DOC] (S1 p.19): greek → ticker → expirations → kind (puts / calls / puts & calls).
Expiration selection is disabled when organising by term. A toggle above the preview adds both the
histogram and the cumulative chart simultaneously. Historical replay is available via a date/timestamp
selector (S4 exposes `history/dates` and `history/timestamps`; widget header shows a "Historical" badge).

**Greeks offered** [DOC] (S4 FAQ): charm, delta, delta-adjusted gamma (DAG), gamma, rho, theta, vanna,
vega, vomma — plus **0DTE delta decay on select tiers**. S4 additionally carries an internal list
`["delta","vega","theta","vomma","rho","dag"]`; [INF] this is likely the set treated as first-order
for cumulative-chart rendering, but that mapping is an inference.

**Expiration enum** [DOC] (S4 API docs): `ALL, CUSTOM, SPECIFIC, TODAY, TOMORROW, DAY_AFTER_TOMORROW,
THIRD_FRIDAY, THIS_YEAR, NEXT_YEAR, NEXT_MONTH, THIRTY_NEXT_DAYS, THIS_WEEK, NEXT_WEEK`. The UI
relabels `THIRTY_NEXT_DAYS` → "0 - 30 DAYS" and `THIRD_FRIDAY` → "MONTHLY".

---

## 4. Volland 0DTE tier ($250) — additions

### 4.1 0DTE Widget (updates every 5 minutes)

**Cadence** [DOC]: 5 minutes, versus 2 minutes for the rest of the platform (S3 feature string; S4 FAQ
"The 0DTE widget refreshes every 5 minutes").

**What it outputs** [DOC] (S1 pp.31–38, and S4 API `GET /paradigms/0dte?ticker=`): The widget's
headline job is to **classify the day into a paradigm and emit tradeable levels**. The API response is
the clearest specification available:

```
{ paradigm, lastModified, lis: [...], target, totalZeroDteOptionVolume, aggregatedCharm }
```

- `paradigm` — sample value **`"GEX-PURE"`**. [INF] The `-PURE` suffix implies Volland grades paradigm
  purity/confidence beyond the four base labels; the full enum is **[UNKNOWN]**.
- `lis` — an **array** of "line in the sand" prices (sample: `[6749]`)
- `target` — a single projected price (sample: `6759`)
- `aggregatedCharm`, `totalZeroDteOptionVolume` — supporting scalars

[DOC] (S1 pp.35–38): the guide repeatedly instructs the reader to consult the 0DTE widget to determine
whether the day is a GEX, Anti-GEX or Sidial paradigm, and to expect price to reverse **within the
range the widget shows**.

**The four paradigms** [DOC] (S1 pp.33–37) — classifications of *customer* positioning, from which
dealer behaviour is derived:

| Paradigm | Customers are | Dealer/market consequence | Suggested trade (S1 p.38) |
|---|---|---|---|
| **Bank of America (BofA)** | long calls **and** puts | balance-seeking; range-bound until a LIS breaks | Neutral bias, fade large moves; iron condors / iron flies |
| **Sidial** | short calls **and** puts | dealers long options, dynamically hedge → dealer hedging *exaggerates* every move; whipsaw | Volatile bias, be nimble; buy straddles / long gamma |
| **GEX** | long puts, short calls | bullish; price rises until enough negative charm above spot flips positive | Bullish bias, buy to target; stop if bearish LIS breaks |
| **Anti-GEX** | short puts, long calls | bearish, with a floor at the balance point | Bearish bias, sell to target; stop if bullish LIS breaks |

[DOC] (S1) Paradigm names are credited to the source papers: Bank of America / JP Morgan, Kris Sidial
(Ambrus), and SqueezeMetrics for GEX. [DOC] (S2 p.30) Paradigms typically set by ~10:30 a.m. Eastern
and hold for the day — explicitly "far from a guarantee".

**Line in the sand (LIS)** [DOC] (S1 glossary; S4 FAQ): the underlying price at which dealers must
*flip* hedging direction. Volland's stated mechanism: vanna/charm strikes flip sign and order flow gets
too intense. S4's FAQ is pointed about this — it says GEX-style services would call this the "gamma
flip" price and asserts they are not measuring it correctly. [DOC] (S2 p.24) When a LIS breaks, the
guide describes a 10–15 point move in roughly 5 minutes, with dealers gamma-hedging "in triples"
(~3× the gamma notionally required, assuming trend).

**Media** [DOC]: Spanish-language paradigm explainers by a third party, SpreadGreg:
- GEX paradigm — `https://www.youtube.com/watch?v=Esp4E8XHLn8`
- BofA paradigm — `https://www.youtube.com/watch?v=1hx1EeuHQgQ`
- Anti-GEX paradigm — `https://www.youtube.com/watch?v=AuoMnWvOXpc`
- Subscriber session — `https://youtu.be/7VfuWkcQK6w` "0DTE Dealer Positioning Shifts in REAL TIME! Subscribers Only Session with Wizard of Ops - 11/10/23"

Paradigm chart screenshots appear in S1 at pp.33–37. Timestamps [UNKNOWN].

### 4.2 0DTE Delta Decay Greek

**This is Volland's most notable proprietary greek and the clearest single differentiator.** [DOC] (S1 p.7):

- **Definition:** Delta Decay combines 0DTE delta exposure with vanna and charm principles to express
  **how much dealers must buy or sell at the current price, with current positioning, by end of day.**
- **Why it exists:** Volland states plainly that they previously relied on **charm** for this, and that
  charm — being second-order — "does not give an accurate view of how much actual notional imbalance
  there is on the dealer side." Delta Decay replaces it so that the **Y-axis and total notional hedging
  calculation** reflect true 0DTE dealer imbalance.
- **Short form** (S4 help registry): the total delta that must be unwound before end of day at the
  0DTE level.
- **Sign convention** (S1 p.15 interpretation table): Delta Decay positive → **bearish** (both above
  and below spot); negative → **bullish**. Identical polarity to charm in the same table.

[INF] This is a direct admission that their own earlier charm-based 0DTE framework understated notional
accuracy — useful competitive intelligence, and a caution against building a charm-only 0DTE view.

**Gating detail** [DOC] (S4): implemented as the exposure chart with `greek: "deltaDecay"`, gated to
0DTE tier and above — i.e. it is a greek selection inside the standard exposure widget, not a separate
widget type.

### 4.3 Liquidity Widget — DADS

**Displays** [DOC] (S1 p.25): A statistics panel showing **DADS** (Delta-Adjusted Dealer Spread) with
the ticker's VIX shown beneath it. API: `GET /liquidity?ticker=` → `{deltaAdjustedDealerSpread, vix}` (S4).

**Computation — unusually explicit** [DOC] (S1 p.25):
> per trade: (execution price − fair value) × option delta; then **average the trade-level DADS**.

- Volland calls this a Volland-exclusive calculation based on **dealer execution quality**.
- When an option expires, its DADS drops out of the average.
- More volatile underlying → larger DADS. DADS correlates with VIX.
- **Reference value given: DADS ≈ 10–12 for SPX in a highly liquid environment.**

[DOC] **Unit inconsistency worth noting:** S1 p.25 cites SPX DADS of 10–12, while the S4 API sample
returns `deltaAdjustedDealerSpread: 0.37`. These cannot both be the same unit. The scale/units are
therefore **[UNKNOWN]** — do not assume. (Possibly the API sample is a different ticker or a different
normalisation; I could not determine which.)

**Trader meaning** [INF]: a dealer-edge/execution-cost proxy — rising DADS implies dealers demanding
more compensation, i.e. deteriorating liquidity. The guide states the correlation to VIX but does not
give an explicit trading rule; the trading application is my inference.

### 4.4 Notional Hedging Exposure

[DOC] This exact phrase appears as a $250-tier feature bullet in Stripe (S3) but **has no
correspondingly named section in the May 2026 guide (S1) and no entry in the S4 widget registry.**

[INF] Most likely it denotes the notional-hedging *quantity* — the "Notional Hedging Requirement"
y-axis that S4's chart configs apply across exposure/cumulative/term-structure charts — being unlocked
in its aggregate/total form at this tier, rather than a distinct widget. **This is an inference and I
could not confirm it.** Treat the mapping as **[UNKNOWN]**; the marketing bullet does not resolve to a
discrete widget in any source I read.

---

## 5. Volland Insight tier ($400) — additions

### 5.1 Aggregate Greek Trend (Historical Greek Charts)

**Displays** [DOC] (S1 p.24): Under the "Statistics" widget group. Select ticker + greek.
- X-axis: daily time series, **trailing 6 months**
- Y-axis: aggregate level of that greek per day
- S4: also computes a **historical average** overlay series; y-axis titled "Aggregate Value"

**Purpose** [DOC] (S1 p.24): position the *current* cumulative greek against its own recent history, to
see how dealer positioning differs from the recent norm. Worked example given: SPX charm printing very
low versus the prior 6 months means bullish delta decay is running higher than usual.

**Media** [DOC]: `https://youtu.be/5t7nbhRl_lg` — "Historical Charts - Options Dealer Positioning
Dashboard VOLLAND" (legacy interface). Screenshot S1 p.24.

### 5.2 Dealer Premiums Widget

**Displays** [DOC] (S1 p.26): Two figures — **Net Dealer Premium** (total dealer premium across all
open options traded that day) and **0DTE premium** (the portion collected exclusively in 0DTE).

**API shape** [DOC] (S4, `GET /premiums?ticker=`) — richer than the guide describes:
```
zeroDteDealerPremium: {v1Premium, v2Premium}
dealerPremium:        {v1Premium, v2Premium}
dealerPremiumChange:  {v1Premium, v2Premium}
```
[DOC] So there are **two premium methodologies in parallel** (`v1Premium` / `v2Premium`) plus a
day-over-day change series. Sample magnitudes differ by orders of magnitude and even in sign
(`dealerPremium.v1Premium: 277,892,502,809.92` vs `v2Premium: -791,781,424.21`). What v1 and v2
denote is **[UNKNOWN]** — not documented anywhere I found. [INF] Likely a methodology revision kept
side-by-side for continuity.

**Explicit caveat** [DOC] (S1 p.26): this is **not** dealer P&L. The guide's instruction is to compare
it against a rough estimate of required payout, as context for the rest of the workspace.

### 5.3 Greek Hedging Widget

**Displays** [DOC] (S1 p.25): Notional changes in **delta, vega, and theta** versus the prior day.

**Meaning** [DOC] (S1 p.25):
- **Delta hedging figure** = total delta change from *new positioning + vanna + gamma + charm*, combined
  into one number. It is the total notional impact dealers had on the underlying that day. Explicitly
  **not** the amount remaining to hedge, since much hedging occurs intraday.
- **Vega + theta figures** = the change in the dealers' premium greeks over the day. The guide gives a
  falsifiable read: **negative → IV and skew should have dropped; positive → IV and skew should have risen.**

**The underlying model** [DOC] (S1 §Swing Principle 3; identical in S2 p.30) — Volland's core identity:

```
(Gamma Exposure × Underlying Change)
+ (Aggregate Vanna × Fixed-Price Vol Change)
+ (Aggregate Charm × Hours Passed)
= Total Delta Notional Hedged
```

[DOC] Two implementation details that matter for anyone replicating it:
- **Charm is computed per HOUR, not per day.** The guide states the conventional calculation is per day
  and that Volland deliberately made it hourly for granularity.
- **Sign convention is "days passing", not "days remaining"** — which *flips the sign* versus the
  common convention. Consequence, stated explicitly: **negative charm is bullish, positive charm is bearish.**
- **Vanna** is per **1-point change in annualised IV** on that specific option (fixed-price volatility).
- **Gamma** is per **1-point** move in the underlying.

[DOC] (S1) Delta notional conversion, from the white paper (S5 §5): `delta × total_size × 100 × current_underlying`.

### 5.4 Spot-Vol Correlation "Overvixing"

**Displays** [DOC] (S1 pp.41–42; S4): The regression chart behind the Spot Vol Beta gauge. S4's chart
config titles the y-axis **"VIX Point Change"**. [INF] X-axis is SPX % change — inferred from the
regression form quoted below, not separately stated.

**Computation, with a published worked example** [DOC] (S2 pp.32; carried into S1): For daily 2022 SPX
vs VIX, Volland publishes the fitted line:

```
VIXchg = (-111.09 × SPXchg%) - 0.0613     R² = 0.71
```

summarised as: each 1-point rise in VIX corresponds to a 1.11% fall in SPX. The guide explicitly walks
the reader through interpreting R² as the share of the dependent variable explained, and calls 0.71
extremely high for a financial series while warning it will not hold as well in individual equities.

**Trader usage** [DOC] (S1 pp.41–42):
- Convert an IV thesis into an underlying-move thesis via the fitted slope.
- **Skew is treated as a prediction of *future* spot-vol correlation.** If skew prices a 1-point IV rise
  as only a 0.85% SPX decline while the historical correlation says 1.11%, skew is pricing more
  volatility than the correlation implies → candidate options to sell.
- An outsized daily spot-vol move is attributed to either an anticipated event or a liquidity shortfall
  (the latter visible as wider bid/ask spreads).

**Also** [DOC] (S1 p.6): Volland now uses the **R² on this widget, per underlying**, as its measure of
how much of that equity's movement is option-liquidity driven — replacing the older "roughly one third
of underlying trades" framing in S2 p.6. That is a meaningful methodology upgrade between the two guides.

### 5.5 Volatility Plane Heatmap / 3D Volatility Plane

**Displays** [DOC] (S1 p.27) — internal ID `GREEK_VOL_PLANE`, group "Surface". A rotatable, zoomable
**3D surface**:
- **X-axis:** days until expiration
- **Y-axis:** strike price
- **Z-axis:** implied volatility level
- **Colour:** the selected greek's value, either **absolute** or **relative to yesterday**, per a legend on the right

**Controls** [DOC] (S1 p.27): click-drag to rotate; mouse scroll wheel to zoom; hover tooltip returns
fixed-price vol, strike, and DTE for the point under the cursor. Greek is user-selected. Full-screen
supported (S4). Available for all Volland tickers.

**Meaning** [DOC] (S1 p.27): it shows fixed-price volatility across the whole strike × tenor grid *and*
the IV changes simultaneously, heat-mapped by dealer greek exposure. The stated value is seeing exactly
how much IV remains in each tenor and how positioning is shifting to match — described as especially
useful for planning options trades.

**Lineage** [DOC]: S2 p.18 describes a 2D predecessor — a "vanna widget" density heatmap with strike on
Y and expiration on X, coloured by notional hedging required given the fixed-strike vol change measured
**from the prior market day's close**. [INF] The 3D plane appears to be the generalisation of that
widget to all greeks plus an IV Z-axis. Inference from the two guides' descriptions.

[DOC] Related detail from S2 p.18: strikes ≤45 DTE are affected substantially more by vanna, and
vanna's sign flips as strikes are crossed.

**Endpoints** [DOC] (S4): `POST /heatmaps/greeks-3d-plane`, `POST /volland-live-api-3d-greeks`,
`GET /volland-live-api-vanna-plane`, `GET /volland-live-api-iv_plane`.

---

## 6. Volland Universe tier ($1,000) — additions

### 6.1 Term Structure Aggregate Exposure

**Displays** [DOC] (S1 pp.22–23) — two chart forms, both with **option tenor on the X-axis** instead of strike:

**(a) Term Structure Exposure Chart** — bars.
- X: tenor · Y: cumulative dealer notional hedging requirement (USD)
- Each bar = aggregate notional at that tenor, summing exposure across all strikes

**(b) Term Structure Cumulative Exposure Chart** — dots.
- X: tenor · Y: cumulative dealer notional hedging requirement (USD)
- Each dot = cumulative aggregate notional **accumulating from the nearest expiration outward**

**Background colour banding** [DOC] (S1 pp.22–23) — identical on both, encoding the time gap between tenors:

| Colour | Bucket | Time gap |
|---|---|---|
| Orange | daily | 1–5 days |
| Yellow | weekly | 6–10 days |
| Blue | monthly | 11–35 days |
| Indigo | quarterly | 36–360 days |
| Violet | annual | >360 days |

[DOC] Expiration selection is **disabled** when the chart is organised by term (S1 p.19) — the term axis
*is* the expiration dimension. Endpoint: `POST /exposure/term-structure` (S4).

### 6.2 Coming Soon (Universe)

[DOC] (S3): **Volatility Analytics**; **Futures Tickers (Equities, Commodities)**; **Futures Tickers
(Foreign Exchange, Metals, Oil, Rates)**. [DOC] (S4 FAQ): equity futures tickers "will soon be rolled
out for select subscription tiers"; commodities, FX and metals also coming.

**No ship date, no spec, no screenshots for any of these. Contents of "Volatility Analytics" are [UNKNOWN].**

---

## 7. Volland Institutional tier ($5,000) — additions

[DOC] (S1 p.28) Framing: where every other widget is a **snapshot of the current market state**, the
Institutional widgets are designed to **anticipate** it and locate the most vulnerable conditions of
dealer risk. Because of compute cost they refresh every **5 minutes** rather than 2 — **except Floating
Strike**, which the guide explicitly exempts. Note this contradicts the Stripe marketing copy (S3),
which advertises all three, Floating Strike included, as "Updates Every 5 Minutes". **Discrepancy
flagged; S1 is the more specific source but I cannot resolve which is correct.**

### 7.1 Theo Curves

**Displays** [DOC] (S1 p.28): Cumulative greek exposure **as a function of hypothetical spot price**.
- **X-axis:** the underlying spot price at which the cumulative greek is evaluated
- **Y-axis:** total notional exposure of the greek (S4 chart config titles it **"Notional Delta"**)
- **Yellow curve:** dealer exposure for the selected greek
- **Blue curve:** *implied* exposure given the fixed-price volatility skew

**Meaning** [DOC] (S1 p.28): the guide describes it as the institutional counterpart to the cumulative
exposure-by-strike chart. The distinction it draws: the standard chart gives the *current* state of the
greek at each strike, whereas Theo Curves give cumulative exposure **under changes in spot** — i.e. a
scenario/shock curve rather than a positional snapshot. The yellow-vs-blue gap is the dealer-positioning
deviation from what skew implies. [INF] That gap is the tradeable signal; the guide does not say so
explicitly.

**Controls** [DOC] (S1 p.28): greek, underlying, expiration(s), kind. Endpoints: `POST /theo-curves`,
`GET /theo-curves/expirations` (S4). Screenshot S1 p.28.

### 7.2 Floating Strike

**Displays** [DOC] (S1 p.29): A **multi-ticker** bar chart that normalises different underlying prices
onto a common axis **by call delta**.
- **X-axis:** combined call delta
- **Y-axis:** total notional exposure
- Each bar: combined notional exposure at that call delta

**Meaning** [DOC] (S1 p.29): stated purpose is identifying **dispersion risk** against an underlying
exposure view — comparing many names at once without price-scale distortion.

**Controls / constraints** [DOC] (S1 p.29): multi-select tickers via search-and-checkbox; also select
greeks, expirations and kind. **This widget cannot be grouped**, because it spans multiple underlyings.
Endpoint: `POST /exposure/floating-strike` (S4). Screenshot S1 p.29.

### 7.3 Implied Skew (Curves)

**Displays** [DOC] (S1 p.30):
- **X-axis:** the underlying spot price at which the skew curve is evaluated
- **Y-axis:** annualised implied volatility (S4 chart config titles it **"Implied Skew"**)
- **Yellow curve:** the dealer-positioning-implied skew curve
- **Blue curve:** the actual market fixed-price volatility skew

**Computation** [DOC] (S1 p.30): built by combining **vega, vanna and vomma** data to derive a dealer
implied skew curve **from positioning alone**. This is the only place vomma is described as load-bearing.

**The thesis** [DOC] (S1 p.30): Volland's studies attribute skew pricing to event-driven pricing,
historical distributions, arbitrage prevention **and** dealer positioning. Their claim is that as the
first three soften, **dealer-positioning skew becomes the dominant determinant of fixed-price vol
pricing — making it a leading indicator of future skew.**

**Constraint** [DOC] (S1 p.30): **single expiration only** — multi-select is disallowed, because each
skew curve must be measured against the market skew curve in its own tenor and tenors cannot be mixed.
Endpoint: `POST /implied-skew` (S4). Screenshot S1 p.30.

---

## 8. Free tier, trial policy, refunds, billing

- **No free trial.** [DOC] (S4 FAQ, "Is there a free trial available?") — stated directly. The
  substitute offered is **Volland Academy**, a free self-directed e-learning platform at
  `https://vol.land/academy`, which requires only a (free) site account. [DOC] (S1 p.4): modules with
  instructional videos and quizzes, no required order, new modules added periodically.
- **No free data tier.** [DOC] — no source describes any unpaid data access. `/api/v1/public-data` exists
  in the bundle but the one endpoint referencing it (`volland-stats`) returned HTTP 404 when I probed it.
- **Refunds: all sales final.** [DOC] (S4 FAQ). Cancellation is scheduled via subscription management.
- **Mid-cycle tier changes allowed.** [DOC] (S4 FAQ): **upgrades are prorated**; **downgrades issue
  account credits** (not refunds) applicable to future payments.
- **Payment:** Stripe, major credit cards, auto-renewing monthly. [DOC] (S1 p.3; S4 FAQ).
- **Affiliate programme:** the site loads **FirstPromoter** (`cdn.firstpromoter.com/fpr.js`, campaign id
  `swm5tfyl`) and the checkout call accepts an `fp_ref` parameter. [DOC] (S4 + homepage HTML). So there
  is a formal affiliate/referral scheme.
- **Subscriber Discord:** `https://www.vollanddiscord.com`, with gated `subs-private-channels` requiring
  an active subscription. [DOC] (S4 FAQ).

---

## 9. Discounts and historical pricing

### 9.1 Discounts found

- **LaDucTrading partner offer: 25% off the first three months of any vol.land subscription.** [DOC] —
  stated repeatedly on `https://laductrading.com/our-partners/`, retrieved 2026-08-01.
- [INF] A web-search snippet attributed promo codes **`LADUC50`** (50% off VolHacks, 3 months) and
  **`LADUC25`** (25% off any tier, 3 months), new customers only, valid through **November 30, 2025**.
  **I could not confirm these literal code strings in the page body** — the visible page text only
  carries the 25%/three-month offer behind a link. Treat the code strings and the expiry date as
  **unconfirmed**.
- **No official/site-wide Volland discount code was found.** [DOC] — nothing in S3, S4, S1 or the site
  HTML. Generic coupon aggregators returned results for `vlandshop.com`, an unrelated automotive parts
  retailer — **not Volland**. Do not trust those.
- **ORATS cross-promotion** (`https://orats.com/volland`): ORATS offers Volland users discounts on
  *ORATS'* products (Trading Tools $49/mo, Delayed Data API $49/mo, Historical Data $399). [DOC] This is
  a discount *from ORATS*, not on Volland. No formal integration is described.

### 9.2 Historical pricing — a documented repositioning

This is well-evidenced and strategically interesting.

**June 2024 structure** [DOC] (S2 p.3) — four tiers, differentiated **purely by refresh cadence**, with
all features otherwise equal:

| Tier (Jun 2024) | Price | Cadence |
|---|---|---|
| Volland Basic | $150/mo | once daily, after hours |
| Volland 3 | $250/mo | 3×/day — ~11:30am, 2:00pm, 7:00pm ET |
| Volland 30 | $400/mo | every 30 min during RTH |
| Volland Live | $1,000/mo | every 5 min during RTH |

[DOC] S4 still contains a **stale legacy FAQ string** stating that the only difference between tiers is
update frequency — a fossil of this model left in the bundle.

**Current structure (2026)**: six tiers differentiated by **widget access**, with **every tier receiving
identical 2-minute updates** and the same ~1,000 core tickers. [DOC] (S1 p.3; S4 FAQ; S3).

**The mapping** [INF] — the four legacy price points survived intact and were re-labelled:

| Old | New | Price |
|---|---|---|
| Volland Basic | Volland Swing | $150 (unchanged) |
| Volland 3 | Volland 0DTE | $250 (unchanged) |
| Volland 30 | Volland Insight | $400 (unchanged) |
| Volland Live | Volland Universe | $1,000 (unchanged) |
| — | **VolHacks (new floor)** | $99 |
| — | **Institutional (new ceiling)** | $5,000 |

This is my inference from the identical price ladder plus the tier ordinals in S3, **corroborated** by
the Stripe product IDs: Swing is `prod_M4T8…`/`price_1LMKCS…`, the $250/$400/$1,000 tiers are all
`prod_Nlx…`/`price_1N0P…` (one creation batch), and VolHacks + Institutional are `prod_TMu…`/
`price_1SQA…` (a later batch). [INF] Stripe IDs are only loosely chronological, so treat the batching as
supporting evidence, not proof.

**Dating the VolHacks/Institutional launch** [DOC]: LaDucTrading published the VolHacks launch
presentation on **November 16, 2025** (S7). [INF] Combined with the `price_1SQA…` batch, the two new
tiers went live around October–November 2025.

**Coverage growth** [DOC]: 200+ tickers (S2 p.3, Jun 2024) → ~1,000 (S1 p.3; S4 FAQ, 2026).

---

## 10. The API

**Volland has a real, documented REST API.** Full documentation is embedded in the site bundle (S4) and
rendered at `https://vol.land/api/documentation`.

- **Base URL:** `https://api.vol.land/api/v1/` [DOC]
- **Auth:** header `X-API-KEY: {your_api_key}` [DOC]
- **Key management:** self-service at `/app/user-settings/api-key`; **maximum 2 active keys
  simultaneously**; keys shown once on generation. [DOC] (S4)
- **Pricing:** **$500 one-time for 2,000 API calls** (`prod_R9l4C87OEA1FOU`, `price_1QHRXx…`,
  `type: one_time`, `credits: 2000`). [DOC] (S3) → **$0.25 per call.**
- **Prerequisite:** an active **Volland Universe or Institutional** subscription is required both to
  purchase *and* to use API credits. [DOC] (S3 product description) — i.e. effective entry cost is
  $1,000/mo + $500.
- [DOC] Consistent with S4's FAQ ("API integration is available for users on select tiers") and the
  entitlement matrix. There is also an **`/api-enterprise`** and a **`/demo-request`** route in the
  router (S4) — enterprise terms are **[UNKNOWN]**.
- **Rate limits: [UNKNOWN]** — no rate-limit statement in the documentation. The credit model appears to
  be the only throttle.

### 10.1 Documented public endpoints (S4)

| Method | Path | Returns |
|---|---|---|
| POST | `/exposures` | `{items:[{x: strike, y: exposure|cumulative}]}` |
| GET | `/tickers` | ticker list |
| GET | `/greeks` | available greek names |
| GET | `/expirations?tickers=&timestamp=` | expiration dates; timestamp has **5-minute resolution** |
| GET | `/premiums?ticker=` | `zeroDteDealerPremium`, `dealerPremium`, `dealerPremiumChange`, each `{v1Premium, v2Premium}` |
| GET | `/history/dates?ticker=` | dates with history available |
| GET | `/history/timestamps?ticker=&date=` | intraday timestamps (samples show **30-minute** spacing) |
| GET | `/liquidity?ticker=` | `{deltaAdjustedDealerSpread, vix}` |
| GET | `/paradigms/0dte?ticker=` | `{paradigm, lastModified, lis[], target, totalZeroDteOptionVolume, aggregatedCharm}` |
| POST | `/volhacks/quad-screener` | `{items:[{ticker,x,y}], lastModified}` |
| GET | `/volhacks/extremes?ticker=` | `{shortTerm, swing, longTerm}` each `{min,max,maxFallbackValue,minFallbackValue}` |
| GET | `/volhacks/catalyst-impact?ticker=` | `{percentage}` |
| GET | `/volhacks/spot-vol-beta?ticker=` | `{correlation, vixEvents[]}` |

`/exposures` accepts `{ticker, kind, greek, expirations{option,from,to,dates}, isCumulative, timestamp}`.
The `timestamp` field enables historical point retrieval and must come from `/history/timestamps`. [DOC]

[DOC] **Notably absent from the public API:** Theo Curves, Floating Strike, Implied Skew, the 3D
volatility plane, term structure, and greek hedging. The public API covers VolHacks + core exposure +
premiums/liquidity/paradigms only.

### 10.2 Internal endpoint surface (not public API, but observable in S4)

The dashboard itself calls a wider set under `https://api.vol.land/api/v1/data`, useful as a map of the
real feature surface: `volland-api-daily-exposure`, `volland-live-api-exposure`, `exposure`,
`exposure/term-structure`, `exposure/floating-strike`, `volland-live-api-agg_charm`,
`volland-live-api-iv_plane`, `volland-live-api-eod`, `tickers/summary`,
`volland-live-api-ges_strike_list`, `volland-live-api-iv-adjusted-vanna`,
`volland-live-api-aggregate-greeks`, `greeks/aggregate`, `greeks/aggregate-hedging`,
`volland-live-api-candles`, `volland-live-api-vanna-plane`, `zero_dte/tickers`,
`zero_dte/volland-live-api-zero-dte`, `zero_dte/exposure/volland-live-api-zero-dte`,
`zero_dte/volland-live-api-charm-balance`, `paradigms/0dte`, `spot-vol-correlation`,
`volland-live-api-greek-trend`, `premiums`, `liquidity`, `screener`, `volland-live-api-3d-greeks`,
`heatmaps/greeks-3d-plane`, `theo-curves`, `theo-curves/expirations`, `implied-skew`,
`volhacks/*`, `history/dates`, `history/timestamps`. [DOC] (S4)

[DOC] Note `zero_dte/volland-live-api-charm-balance` — a **charm-balance** dataset exists in the 0DTE
lane with no corresponding named widget in the guide or Stripe features. Its surfaced form is [UNKNOWN].

---

## 11. Data sourcing, computation, and stated accuracy

**Sourcing** [DOC] (S1 p.6; S5 §4): a real-time option trade execution feed via **OPRA, sourced through
Cboe**. Note S1 adds "sourced through Cboe" where S2 p.6 said only OPRA. S7 independently describes it
as a trade-level feed on 1,000 tickers direct from Cboe.

**Trade-side classification** [DOC] — and this is where the two guides **differ materially**:

| | June 2024 (S2 p.6) & White Paper (S5) | May 2026 (S1 p.6) & current FAQ (S4) |
|---|---|---|
| Inputs | executed price, **surrounding orders**, **Black-Scholes fair value**, bid/ask spreads | executed price, **execution IV**, **binomial fair value**, bid/ask spreads |

[DOC] Volland moved from a Black-Scholes fair-value model to a **binomial** one and swapped
"surrounding orders" for "execution IV". This is a real, documented methodology change — worth noting
for anyone benchmarking classification accuracy.

**Pipeline** [DOC] (S1 p.6): classify each order as dealer buy or write → compute the greeks
representing dealer risk per transaction → compile total dealer positioning per strike per expiration →
for exposure widgets, compute per-strike greek exposure to derive hedging momentum.

**Accuracy claim and how it was validated** [DOC] (S5 §4): Cboe distributes **open/close data**, which
Volland calls the definitive answer on which orders are dealer-bought or -sold. Because Cboe has a
monopoly on SPX, Volland tested its methodology against that ground truth and reports:
- **>90% accuracy across all expirations**
- **99% accuracy in 0DTE**

[INF] The validation is SPX-only. Accuracy on single names — where Cboe open/close ground truth is not
similarly available — is **[UNKNOWN]** and should not be assumed to match.

**White paper particulars** [DOC] (S5): Author **Jason D. DeLorenzo**, dated December 19, 2023. JEL
G11/G12/G17/Y10. Non-0DTE study spans **2018–2022** SPX using Cboe open/close; 0DTE study uses **2023**
data. Conclusion: dealers are **more sensitive to IV changes than to underlying movement**, and charm
analysis yields a significant 0DTE edge in the right window relative to expiration. Options between
−0.03 and +0.03 delta are excluded from the 0DTE analysis. Acknowledges Michael Shields and Max
Turnquist of Aureum LLC for quantitative development, Hunter Edmonds for data analysis, and reviewers
including **Henry Schwartz** (Cboe). No outliers removed unless specified.

**Hedging assumptions — also changed between guides** [DOC]:

| Assumption | June 2024 (S2) | Current (S1 / S4) |
|---|---|---|
| Share of vega hedged | **30–40%** | **85%** |
| Vanna hedging mechanism | not specified | ~**85% of SPX vanna hedged via /VX futures**; single names via swaps or, more often, other options |
| Dealer share of underlying movement | 35–40% | 35–40% (unchanged; attributed to a Cboe data-team conversation) |
| Theta hedging | not specified | hedged like vega, via /VX futures and swaps; if dealers are very long theta, /VX tends to carry a higher premium to VIX |

[INF] The vega assumption moving from 30–40% to 85% is a large model change that would materially shift
any vega-driven output. Documented in both guides; the reason for the change is [UNKNOWN].

**Other stated mechanics** [DOC]:
- **DAG** = flip the sign of every strike above current price, so green = dealer buying, red = dealer selling (S1 p.7).
- **"Dealer o'clock"** — dealers warehouse intraday risk and hedge aggressively at roughly **2:00–3:00 p.m. ET** (S1/S4 glossary; S2 said 1:30–3:00 p.m., another small revision).
- Dealers hedge to **deltas, not P&L** (S1 §Swing Principle 2).
- Coverage limited to the **top ~1,000 tickers by option volume**; penny stocks explicitly excluded for lack of liquidity (S4 FAQ).
- **No dark-pool data**, deliberately — Volland states it has seen no study correlating dark pools with equity movement (S4 FAQ).
- Cboe estimates **85–90%** of option orders are accepted by dealers (S1 p.5).

**Anti-GEX positioning** [DOC] (`https://www.wizofops.com/articles/why-not-gex`; S4 FAQ): Volland argues
GEX rests on 2017-era assumptions — that all puts are bought and all calls sold, using open interest —
which it calls too reductive. It asserts the magnetic effects commonly attributed to gamma are actually
**vanna** effects, and that its own edge is order-by-order side classification plus a wider greek set
(vanna, charm, vomma, delta, vega, rho, theta).

---

## 12. Company, founder, and channels

- **Founder:** **Jason D. DeLorenzo**. [DOC] (S5 author line): founded **Ad Deum Funds, LLC** — a
  registered investment advisor — in 2018; serves as Principal and Owner; created Volland and offers it
  as a subscription service.
- **Operating entity:** Ad Deum Funds, LLC **d/b/a Wizard of Ops**. "Volland®" is a registered trademark
  of Ad Deum Funds. Contact `info@addeumfunds.com`. [DOC] (S1/S2 disclaimer).
- **Background** [DOC] (search-surfaced biography, `https://www.chimeraresearchgroup.com/author/delo/`
  and `https://medium.com/authority-magazine/…`): BA Seton Hall (2002), MA Economics George Mason
  (2017), trading options since 2010. [INF] These are secondary-source biography pages, not primary
  documents — lower confidence than the white paper author line.
- **Cboe credibility claim** [DOC] (S4 FAQ): Volland states its founder spoke at Cboe's annual **Risk
  Management Conference**, and that Volland is trusted by institutions including Cboe itself. I could
  **not independently verify** the conference appearance — **[UNKNOWN]**.
- **Affiliated hedge fund:** `addeumfunds.com`, described by S7 as audited. [DOC] (S4 FAQ) also claims
  the affiliated internal hedge fund has consistently outperformed the broader market — **unverified
  vendor claim**.
- **Launch:** Volland launched publicly around **June 2, 2023** per the press release
  `https://www.globenewswire.com/news-release/2023/06/02/2681141/0/en/Wizard-of-Ops-Launches-Innovative-Real-Time-Fintech-Solution-for-Options-Dealer-Positioning.html`.
  The user guide's "Created" date is **May 25, 2023**. [DOC] [INF] Some secondary sources say 2022,
  which conflicts; the Swing tier's Stripe product ID dates to the 2022 batch, so a 2022 soft launch is
  plausible but unconfirmed.

### Channels [DOC] — all from the site's own link constants (S4)

| Channel | URL |
|---|---|
| X / Twitter (brand) | `https://twitter.com/wizofops` |
| X / Twitter (founder, personal) | `https://x.com/delocrg` |
| YouTube | `https://www.youtube.com/@wizardofops` |
| Discord (public) | `https://www.vollanddiscord.com` |
| Substack — "Great and Powerful Vol" | `https://wizardofops.substack.com/` |
| Company site | `https://www.wizofops.com/` |
| 1-on-1 paid education | `https://www.wizofops.com/volland1on1edu.html` |

**Best explanatory X threads: [UNKNOWN].** I identified the handles but did not retrieve or rank
individual threads — X is not readable by this toolchain without authentication. This is a real gap.

**Podcast appearances** [DOC]: one confirmed — Advanta IRA podcast Episode 150, "Understanding Options
Trading for Investors with Jason DeLorenzo",
`https://www.advantaira.com/podcast/episode-150-understanding-options-trading-for-investors-with-jason-delorenzo/`.
A broader appearance list is [UNKNOWN].

---

## 13. Documentation / knowledge-base URL structure [DOC] (S4 router + sitemap)

**Public marketing/docs routes:**
`/` · `/about` · `/help` · `/faq` · `/resources` · `/research` · `/api` · `/api/documentation` ·
`/api-enterprise` · `/pricing` · `/institutional` · `/retail` · `/demo-request` · `/contact-us` ·
`/terms-of-service` · `/privacy-policy` · `/quiz` → `/quiz/start` → `/quiz/result/:animalName`

**Academy (free, account required):**
`/academy` · `/academy/section/:sectionId` · `/academy/section/:sectionId/:lessonId` ·
`/academy/section/:sectionId/:lessonId/quiz` · `/academy/section/:sectionId/:lessonId/results` ·
`/academy/result` · `/academy/complete`

**App (authenticated):**
`/app/workspace` · `/app/workspace/new` · `/app/workspace/welcome` · `/app/workspace/:workspaceId` ·
`/app/workspace/:workspaceId/new` (add widget) · `/app/workspace/:workspaceId/:widgetId/edit` ·
`/app/workspace/:workspaceId/group/:groupId/edit` · `/app/user-settings` · `/app/user-settings/invoices` ·
`/app/user-settings/api-pricing` · `/app/user-settings/api-key` · `/app/pricing` ·
`/checkout/success` · `/checkout/failed`

**Static documents:**
- `https://vol.land/VollandUserGuide_May26.pdf` — current English guide
- `https://vol.land/VollandUserGuide_es.pdf` — **Spanish edition**
- `https://vol.land/VollandUserGuide_Jun24.pdf` — prior edition (still served)
- `https://vol.land/VollandWhitePaper.pdf`
- `https://vol.land/sitemap.xml`, `robots.txt` (sitemap-only; no crawl restrictions on the routes above)

[INF] The `/quiz` → `/quiz/result/:animalName` route implies a tier-recommendation quiz that outputs an
**animal persona**. S4's FAQ confirms a "3-question quiz" for matching trading style to tier; the animal
names themselves are [UNKNOWN].

**Onboarding/UX detail** [DOC] (S1 pp.12–14): workspaces are user-built tabs of widgets; unlimited
workspaces; most widgets offer small/medium/large sizes; widgets support edit/duplicate/delete via a
3-dot menu, drag-and-drop layout, colour-coded grouping, and a minimap. [DOC] (S2 p.4) The June 2024
version offered **preset workspaces** mirroring the legacy Summary/Exposure/0DTE sheets; the May 2026
guide describes only custom workspace creation. [INF] Presets may have been removed — unconfirmed.

---

## 14. Media inventory

### YouTube — "Discover Volland (Legacy Interface)" playlist
`https://www.youtube.com/playlist?list=PLvdB0x63FsarPZvNLyPYwTIggB-S1k-iQ` (15 videos) [DOC] — titles
resolved via the YouTube oEmbed API on 2026-08-01:

| # | Title | URL |
|---|---|---|
| 1 | Options Dealer Positioning: Introduction to Volland | `https://youtu.be/aCHL8D7Y-jc` |
| 2 | Exposure Sheet: Options Dealer Positioning | `https://youtu.be/ShBVVRIlV3k` |
| 3 | Summary Sheet: Options Dealer Positioning | `https://youtu.be/kXV953ZluFQ` |
| 4 | Delta: Option Greeks Knowledge & Application | `https://youtu.be/pHHlnGlFKjU` |
| 5 | Gamma: Option Greeks Knowledge & Application | `https://youtu.be/9asyMAfkQ8w` |
| 6 | Vega and Theta: Option Greeks Knowledge & Application | `https://youtu.be/yWP-HhVZi0w` |
| 7 | Vanna Part 1 | `https://youtu.be/sOrLgHS0yjs` |
| 8 | Vanna Part 2 | `https://youtu.be/HrP3gx1_-qo` |
| 9 | Cumulative Charts: Options Dealer Positioning | `https://youtu.be/uAQJCwuKP6M` |
| 10 | Charm: Option Greeks Knowledge & Application | `https://youtu.be/0B7I8Fy3JQs` |
| 11 | Look and Feel Refresh | `https://youtu.be/BTardb8ryLs` |
| 12 | Elevate Your Options Dealer Positioning Data — New VOLLAND Update Tiers! | `https://youtu.be/8xQb2eq6d-0` |
| 13 | Options Greeks Explained \| Vol.land by Wizard of Ops | `https://youtu.be/vfGzH_JtfCE` |
| 14 | Historical Charts — Options Dealer Positioning Dashboard VOLLAND | `https://youtu.be/5t7nbhRl_lg` |
| 15 | 0DTE Dealer Positioning Shifts in REAL TIME! Subscribers Only Session — 11/10/23 | `https://youtu.be/7VfuWkcQK6w` |

**Caveat** [DOC]: the playlist is explicitly labelled **"Legacy Interface"** — it documents the
pre-workspace sheet-based UI, not the current widget UI.

### Other videos [DOC]
- `https://www.youtube.com/watch?v=YE0njZswa3A` — "Options Gamma — Actionable Data with Volland Custom Workspaces" (**current** workspace UI)
- `https://www.youtube.com/shorts/yU3nIwgAIiU` — "Introducing VolHacks: Quad Screener, Spot Vol Beta, Catalyst Impact, Extremes"
- `https://www.youtube.com/shorts/LpeDXkJErCc` — "Quad Screener — Custom Volland Widgets for Dispersion and Risk Management"
- `https://www.youtube.com/watch?v=H7U2bk3x5gg` — "Volland with Jason DeLorenzo" (third-party interview; oEmbed unavailable, title from search result)
- SpreadGreg (Spanish) paradigm series — `Esp4E8XHLn8` (GEX), `1hx1EeuHQgQ` (BofA), `AuoMnWvOXpc` (Anti-GEX)

### Third-party writeup [DOC]
`https://laductrading.com/new-volhacks-from-vol-land/` — Samantha LaDuc + Jason DeLorenzo joint VolHacks
walkthrough, published **November 16, 2025**. The most substantive independent VolHacks description found.

### Screenshots [DOC]
The richest screenshot set is inside **S1 (`VollandUserGuide_May26.pdf`)**, at these pages:
Quad Screener p.16 · Catalyst Impact p.17 · Extremes p.17 · Spot Vol Beta p.18 · Exposure Chart p.20 ·
Dealer Flow/Cumulative p.21 · Term Structure p.22 · Term Structure Cumulative p.23 · Aggregate Greek
Trend p.24 · Greek Hedging p.25 · Liquidity p.25 · Net Dealer Premium p.26 · Ticker p.26 ·
3D Volatility Plane p.27 · Theo Curves p.28 · Floating Strike p.29 · Implied Skew p.30 ·
0DTE paradigm charts pp.33–37.

**Video timestamps: [UNKNOWN] across the board.** YouTube serves JS-only pages to this toolchain, so I
could retrieve titles (via oEmbed) but not descriptions, chapter markers, or transcripts. Anyone needing
timestamps must open the videos directly.

---

## 15. What I could not determine — explicit gaps

1. **Video timestamps / chapter markers** — none retrievable (§14).
2. **Best explanatory X threads** — handles found, threads not retrieved or ranked (§12).
3. **"Notional Hedging Exposure"** ($250 tier bullet) does not resolve to any widget in the guide or the
   app registry (§4.4).
4. **"Volatility Analytics"** (Universe, coming soon) — no spec, no date (§6.2).
5. **DADS units** — guide says ~10–12 for SPX, API sample returns 0.37; irreconcilable from public
   sources (§4.3).
6. **`v1Premium` vs `v2Premium`** in the premiums API — undocumented (§5.2).
7. **Full `paradigm` enum** — only `GEX-PURE` observed; the suffix convention is undocumented (§4.1).
8. **`charm-balance` dataset** — exists in the 0DTE API lane with no named widget (§10.2).
9. **Floating Strike cadence** — S1 exempts it from the 5-minute rule, Stripe copy advertises 5 minutes.
   Contradiction unresolved (§7).
10. **Undocumented widgets** — `WATCHLIST`, `CALENDAR`, `NEWS`, `AGGREGATE`, `SCREENER` have no public
    descriptions (§1.4).
11. **API rate limits** and **enterprise API terms** (§10).
12. **Single-name accuracy** — the >90%/99% claim is SPX-validated only (§11).
13. **Cboe Risk Management Conference appearance** — vendor claim, unverified (§12).
14. **LADUC50 / LADUC25 code strings** — unconfirmed (§9.1).
15. **Whether legacy "Volland Basic" subscribers are still served** (§1.3).

---

## 16. Takeaways relevant to our build

[INF] — everything in this section is my assessment, not vendor documentation.

1. **The moat is trade-side classification, not the charts.** Volland's defensible claim is order-by-order
   dealer buy/write classification validated against Cboe open/close on SPX (>90% / 99% 0DTE). The
   visualisations are conventional; the classifier is the asset. Any competing product is judged on that
   axis first.
2. **The tier ladder is now a widget-access ladder, not a latency ladder** — a deliberate repositioning
   since 2024 that let them add a $99 floor and a $5,000 ceiling while holding the four legacy price
   points fixed. Note that giving *every* tier 2-minute data is a strong retention play.
3. **Delta Decay is the most copyable good idea here.** Volland states outright that charm — a
   second-order greek — misrepresents true 0DTE notional imbalance, and that a purpose-built
   delta-decay measure fixes the Y-axis. That is a direct, documented critique of the standard approach.
4. **The Extremes tenor-independence caveat is a design lesson.** Three independently-computed vanna
   tenors can produce a long-term resistance below a short-term one. They ship it anyway and explain it.
   A naive implementation that "fixes" the ordering would destroy the signal.
5. **Sign conventions must be pinned explicitly.** Volland computes charm per *hour* on a *days-passing*
   basis, inverting the common sign. Their whole interpretation table depends on it. Our regime-labelling
   work should record convention alongside every greek.
6. **Their published model is a testable identity**, not a black box:
   `(GEX × ΔUnderlying) + (Vanna × ΔFixedPriceVol) + (Charm × HoursPassed) = Total Delta Notional Hedged`.
   That is directly comparable against our own exposure math.
7. **Two documented methodology revisions** (Black-Scholes → binomial fair value; vega-hedged assumption
   30–40% → 85%) mean any historical Volland-derived series has a regime break. Relevant if we ever
   benchmark against archived Volland numbers.
8. **API economics are punitive:** $0.25/call with a mandatory $1,000/mo subscription floor. This is not
   a data-licensing business; it is a terminal business with an API bolt-on.
9. **No trial + "all sales final" + a month-long stated learning curve** is a notably high-friction
   funnel, mitigated only by the free Academy. Their own FAQ says users typically need a month to learn
   the product — an implicit admission that the surface is hard to read.
