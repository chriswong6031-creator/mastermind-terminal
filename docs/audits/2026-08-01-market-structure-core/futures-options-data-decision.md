# Futures options data — buy / don't-buy decision

**Date:** 2026-08-01
**Scope:** Should Mastermind Terminal license CME options-on-futures data (ES, NQ, RTY, CL, GC, ZB) to
compute native futures gamma, as MenthorQ does? Is there a cheaper path?
**Tagging:** `[DOC]` = stated in a source I actually read (URL cited) · `[DOC-2nd]` = read via a search-result
extract of a page that blocked direct fetch · `[INF]` = my inference, labelled as such · `[UNKNOWN]` = could
not determine.

---

## 1. Verdict

**Don't buy futures options data now. Ship basis-converted ES/NQ/RTY/YM levels off the SPX/NDX/RUT chains we
already license, at near-zero marginal data cost, and instrument demand before spending anything.**

Three findings drive this, and two of them contradict the framing of the question:

1. **The "$199/mo" figure is the internal-use price, not our price.** Databento's CME Standard plan at
   $199/mo covers live + historical data but **external distribution is a Plus-tier feature at $1,750/mo**
   `[DOC]` (https://databento.com/pricing). A subscriber-facing terminal that publishes intraday levels is
   external distribution. The realistic line item is ~9x the number in the premise — before CME's own
   derived-data licence.
2. **MenthorQ's own documentation does not claim ES levels are purely native.** Their ES guide says gamma
   levels on ES are derived "primarily from SPX options and ES futures options" `[DOC]`
   (https://menthorq.com/guide/gamma-levels-on-es/), and they publish a Levels Conversion guide teaching
   spread/ratio mapping from an index chain onto a futures chart `[DOC]`
   (https://menthorq.com/guide/levels-conversion/). The native-futures moat is real for CL/GC/ZB/FX. For ES
   and NQ it is a blend, and the blend's dominant leg is the chain we already have.
3. **ES options are ~11% of the S&P-500 options complex by notional ADV; SPX is 74%** `[DOC]`
   (https://www.cboe.com/insights/posts/a-tale-of-two-markets-spx-options-expanding-lead-vs-eminis-, Wei
   Liao, 2025-09-30). In 0DTE — the segment that drives intraday level behaviour — SPX is 77% and ES is under
   8% `[DOC]` (same source). Buying ES options data to model S&P dealer gamma buys the minority book.

**Strongest runner-up:** buy Databento GLBX.MDP3 if and when we have a paying commodity/rates cohort. Basis
conversion is mathematically impossible for CL, GC and ZB — there is no index chain to convert from — so
that segment is the only one where the purchase buys capability rather than cosmetics.

**The single condition that flips me to buy:** internal search/usage telemetry showing a meaningful cohort
querying CL/GC/ZB/NG (not ES/NQ). We already have the instrument to measure this — the search-tracking plane
and owner Search Log (`terminal/lib/searchEvents.ts`, `terminal/lib/adminGate.ts`). Run that query before
spending; do not answer it by intuition.

---

## 2. Cost and coverage of futures-options data

### 2.1 Databento — CME Globex MDP 3.0 (GLBX.MDP3)

| Item | Figure | Source |
|---|---|---|
| Standard | **$199/mo** | `[DOC]` https://databento.com/pricing |
| Plus | **$1,750/mo** (annual contract) | `[DOC]` https://databento.com/pricing |
| Unlimited | **$4,500/mo** (annual contract) | `[DOC]` https://databento.com/pricing |
| Grandfathered Standard | $179/mo for 12 months, then $199/mo | `[DOC]` https://databento.com/blog/updates-to-subscription-pricing |
| Repricing effective | 2026-06-22 | `[DOC]` same |
| Historical pay-as-you-go, CME | **from $0.50/GB** | `[DOC]` https://databento.com/options |
| Historical pay-as-you-go, OPRA | from $0.04/GB | `[DOC]` https://databento.com/options |
| Coverage | 650,000+ symbols, futures **and options on futures**, CME/CBOT/NYMEX/COMEX, since 2010 | `[DOC]` https://databento.com/options |

Tier mechanics that matter more than the headline price:

- Standard includes **live data with no separate exchange licence fee** `[DOC]`
  (https://databento.com/pricing) — but its historical depth is capped (roughly 12 months of L0/L1, 1 month
  of L2/L3, 7 years OHLCV) `[DOC-2nd]` (https://databento.com/pricing, plan table).
- **"External distribution" is listed as a Plus feature** `[DOC]` (https://databento.com/pricing).
- Databento's stated general rule: "Most of our datasets can be redistributed internally or externally after
  24 hours" `[DOC]` (https://databento.com/pricing), and separately: a licence is required if you distribute
  externally within 24 hours of receipt; T+1 and older needs none `[DOC-2nd]`
  (https://databento.com/blog/introduction-market-data-licensing).
- Databento **does not supply greeks or IV** — "We don't currently provide pre-calculated implied volatility
  (IV) or greeks" `[DOC]` (https://databento.com/options). We would compute them ourselves.
- Databento's own licensing guide puts real-time CME futures data for a **professional** subscriber at "at
  least $2,700" per month `[DOC-2nd]` (https://databento.com/blog/subscriber-status). This is stated as an
  exchange-fee floor for professional real-time use and sits uneasily beside the "no license fees" claim on
  the Standard plan. `[INF]` The reconciliation is almost certainly that Standard's fee-free live data is
  scoped to non-professional / internal use, and our use case is neither. **`[UNKNOWN]` — this must be put to
  Databento sales in writing before any purchase.**

### 2.2 ThetaData — our incumbent vendor

- Retail plans: **Options Value $40/mo, Options Standard $80/mo, Options Pro $160/mo** `[DOC]`
  (https://www.thetadata.net/pricing).
- **No tier includes futures options today.** The pricing page covers "US Index & Stocks" only and does not
  mention futures anywhere `[DOC]` (https://www.thetadata.net/pricing).
- Roadmap: **"CME Futures & Futures Options", planned Q4 2026**, with 2 years of history for quotes, trades
  and open interest, depth of book, and real-time snapshots/streaming `[DOC]`
  (https://www.thetadata.net/roadmap). This corroborates the independent finding already recorded in
  `participant-data-economics.md` §219 of this audit set.
- `[UNKNOWN]` Price of the futures add-on. Not published.

**This is the most decision-relevant fact in the whole report.** `[INF]` If ThetaData ships on roadmap, we get
CME futures options inside an existing vendor relationship, existing contract, existing ingest code and
existing symbology work — with no new licensing counterparty and no new redistribution negotiation. Spending
$1,750/mo with Databento in August to obtain a capability that may arrive through our current vendor within
one to two quarters is a poor trade unless the capability is revenue-blocking right now.

### 2.3 Polygon.io / Massive

- Rebranded to Massive.com in 2026 `[DOC-2nd]` (https://apicostcalc.com/polygon.html).
- Futures plans: **Basic free (2y history, 10-min delayed), Starter $29/mo (2y, delayed), Developer $79/mo
  (5y, delayed), Advanced $199/mo (7y+, real-time)** `[DOC]` (https://massive.com/futures).
- **Options on futures: "Coming soon" — not available** `[DOC]` (https://massive.com/futures).
- `[INF]` Useful to us only as a cheap, licensed source of the **ES/NQ/RTY/YM futures price** needed for the
  basis leg. For that job the $29 Starter tier is sufficient (see §4.3).

### 2.4 CME DataMine / CME direct APIs

- DataMine is a self-service historical platform; subscriptions are per-dataset, 1-month or 12-month terms
  `[DOC-2nd]` (https://www.cmegroup.com/datamine.html). **`[UNKNOWN]` — no public per-dataset dollar prices.**
- CME's real-time futures & options API is quoted "as low as $0.50/GB plus applicable ILA fees" `[DOC-2nd]`
  (https://www.cmegroup.com/market-data/real-time-futures-and-options-data-api.html, via search extract —
  cmegroup.com timed out on every direct fetch attempt in this session).
- Free, no-licence public data does exist but is narrowing:
  - Volume and open interest reports for CME futures and options are **available free of charge**, with
    preliminary settlements in CSV at **6:00 p.m. Central** `[DOC-2nd]`
    (https://www.cmegroup.com/market-data/volume-open-interest.html).
  - The legacy settlement files at `ftp.cmegroup.com/pub/settle/*` carry per-strike **open interest,
    settlement price, delta, gamma, vega, vanna and volatility** `[DOC]`
    (https://github.com/mookie-blaylocks/settlement-parser).
  - **But CME is retiring that FTP site** — settle and bulletin files move to DataMine, and the website
    publication is delayed to midnight CT and reduced to a top-of-day file `[DOC-2nd]`
    (https://www.cmegroup.com/market-data/daily-bulletin.html, via search extract).
  - `[INF]` Building a production dependency on the free CME files is a dead end on a published deprecation
    path. Acceptable for a one-off research spike; not for a shipped feature.

### 2.5 Barchart

- Historical futures options back to the early 2000s across CME, ICE, Euronext, Eurex; EOD prices and
  settlements; **greeks and IV computed by Barchart** using Black-76 (Bachelier for spreads) `[DOC]`
  (https://www.barchart.com/solutions/services/futures-options).
- **Pricing: contact sales only. No public figures** `[DOC]` (same page).
- `[INF]` The only vendor found that hands over pre-computed futures-options greeks, which would remove real
  engineering work (see §5.4). Worth a quote request even in the don't-buy scenario, because the number is
  free to obtain.

### 2.6 dxFeed

- Secondary sources report CME/CBOT/NYMEX/COMEX at **$29/mo each, or a $79/mo four-exchange bundle**
  `[DOC-2nd]` (https://optimusfutures.com/dxfeed.php, https://dxfeed.com/market-data/futures/cme/).
- dxFeed's own futures/futures-options page publishes **no pricing** — request-a-quote only `[DOC]`
  (https://choose.dxfeed.com/futures-market-data/).
- `[UNKNOWN]` Whether the $29/$79 rates are non-professional retail terminal pricing (which would not cover a
  commercial redistribution use case) or an API entitlement. `[INF]` Given the gap between those numbers and
  every other professional CME quote in this report, retail-terminal pricing is the likely explanation.

### 2.7 Intrinio

- Intrinio's options product is scoped to **US stock and ETF options** `[DOC-2nd]` (https://intrinio.com/options).
- Their CME futures product page 404s (https://intrinio.com/products/cme-intraday-futures-prices).
- **No evidence found that Intrinio sells CME options-on-futures. Treat as not offered until proven
  otherwise.** `[UNKNOWN]` — search bounds: two targeted searches plus two direct fetches; I did not contact
  sales.

### 2.8 The licence nobody quotes: CME derived data

Publishing gamma levels computed from CME options data to paying subscribers creates a **derivative work of
CME Information**. CME requires a Derived Data License Agreement (DDLA) or Enterprise DDLA for that, fees
assessed annually, and the agreement restricts redistribution and derivative-work creation absent CME's
consent `[DOC-2nd]` (https://www.cmegroup.com/market-data/files/cme-derived-data-license-agreement.pdf,
https://www.cmegroup.com/market-data/browse-data/derived-data.html). Fees are tiered per instrument, with the
first five instruments at Tier 1 rates and lower per-instrument rates above six `[DOC-2nd]`
(https://www.cmegroup.com/market-data/files/2026-derived-data-fees.pdf).

**`[UNKNOWN]` — the actual dollar amounts.** The 2026 and 2025 derived-data fee PDFs timed out on every fetch
attempt (three tries, 60s each). This is a genuine gap and it is the single largest unpriced item in the
decision. `[INF]` Its existence alone means "buy Databento at $199" was never the true cost of shipping
MenthorQ-style futures levels.

### 2.9 Cost summary for our actual use case

| Path | Data cost/mo | Covers ES/NQ/RTY? | Covers CL/GC/ZB? | Licence risk |
|---|---|---|---|---|
| Basis conversion off existing SPX/NDX/RUT chains | **~$0** (optionally +$29 Massive for the futures leg) | Yes, as projected levels | **No** | None new `[INF]` |
| Databento Standard | $199 | Yes, native | Yes | External distribution not included `[DOC]`; CME DDLA `[UNKNOWN]` |
| Databento Plus | **$1,750** | Yes, native | Yes | External distribution included `[DOC]`; CME DDLA `[UNKNOWN]` |
| ThetaData futures add-on | `[UNKNOWN]`, not before Q4 2026 | Yes | Yes | Inside existing contract `[INF]` |
| Barchart EOD + greeks | `[UNKNOWN]` (quote) | Yes, EOD only | Yes, EOD only | `[UNKNOWN]` |

---

## 3. Is ES gamma materially different from SPX gamma, or redundant?

This is the question that decides whether native futures data adds signal or only coverage. The evidence
points the same way from four independent directions, but there is a real counter-argument and I state it.

### 3.1 The size argument — SPX dominates decisively

- SPX options: **74% of S&P-500-linked notional ADV, a record high, up from 58%**. E-mini options: **11%**.
  SPY ETF options: 15%. Total notional ADV across the three grew from $0.5T to $3.3T over five years `[DOC]`
  (https://www.cboe.com/insights/posts/a-tale-of-two-markets-spx-options-expanding-lead-vs-eminis-, Wei Liao,
  2025-09-30).
- 0DTE: **SPX 77%, ES just under 8%** `[DOC]` (same source).
- Caveat on the source: this is Cboe's own publication and Cboe is the SPX venue. `[INF]` The direction is
  nonetheless corroborated by CME's own promotional framing, which cites 0–5DTE E-mini options ADV of ~770K
  contracts in 2025 and 0DTE growth from ~100K to ~370K `[DOC-2nd]`
  (https://www.cmegroup.com/articles/2026/explore-the-benefits-of-short-dated-options.html, via search
  extract; direct fetch timed out) — real growth, and still an order of magnitude below the SPX 0DTE book by
  notional.

### 3.2 The mechanism argument — SPX dealers hedge *in* ES

The dealers who warehouse SPX options risk offload it into index futures; their hedging flow *is* ES order
flow `[DOC]` (https://www.gexmetrix.com/blog/gamma-futures). This means SPX gamma is not an approximation of
what moves ES — it is the causal upstream of what moves ES. Bias note: gexmetrix sells an index-options
product with no native futures data, so this is a self-serving argument; `[INF]` it is nevertheless
mechanically correct and is not contradicted by any source I found.

### 3.3 The vendor-behaviour argument — the leaders convert

- **SpotGamma** does not compute native ES gamma. Its levels are computed in SPX terms and plotted at the
  equivalent ES price: "The labels are in SPX terms, but SpotGamma adjusts the indicator to plot at the
  equivalent ES price, and this spread changes daily and is automatically adjusted by SpotGamma" `[DOC-2nd]`
  (https://support.spotgamma.com/hc/en-us/articles/1500006926242-... — the page 403s to direct fetch; text is
  a search-result extract of that page). Their ES-facing marketing asserts that high-OI SPX strikes create
  support and resistance for ES `[DOC]` (https://spotgamma.com/spx-options-levels-for-es-futures-traders/).
- **MenthorQ**, the native-futures vendor, still describes ES levels as coming "primarily from SPX options
  and ES futures options" `[DOC]` (https://menthorq.com/guide/gamma-levels-on-es/) and ships a Levels
  Conversion tool using spread (futures − index) or ratio (futures ÷ index) `[DOC]`
  (https://menthorq.com/guide/levels-conversion/).
- `[INF]` Two of the three best-known vendors in this category ship converted ES levels as the product, and
  the third blends. A commercial market has already tested whether converted levels are acceptable to ES
  traders, and the answer has been yes for years.

### 3.4 The honest counter-argument — where ES options are NOT redundant

I found no source that quantifies this, so it is reasoning, not evidence:

- **`[INF]` The strike grids are offset, so the level sets genuinely differ.** ES options strike at 25/10/5-point
  intervals on the *futures* price scale `[DOC]`
  (https://www.cmegroup.com/education/articles-and-reports/faq-sp-500-options-strike-price-listing-rules-changes).
  With the basis at +116 points (§4.1), an ES strike of 7500 sits at SPX-equivalent ~7384 — not on the SPX
  round-number grid at all. A large ES open-interest cluster can therefore sit at a price no SPX strike
  occupies, and conversion cannot manufacture it. This is a real, structural information gap, not a rounding
  artefact.
- **`[INF]` Different participants.** ES options are American-style on a futures contract and are the natural
  hedging venue for CTAs, managed futures and overnight risk; SPX options are European, cash-settled and
  institution/0DTE dominated. Different books, different roll behaviour.
- **`[DOC-2nd]` Weaker than it used to be: the overnight argument.** The classic case for ES options was that
  SPX is shut overnight. Cboe now runs SPX in Global Trading Hours from 8:15 p.m. to 9:25 a.m. ET plus Curb
  4:15–5:00 p.m., with GTH/Curb volume up 32% YoY in Q1 2026 `[DOC-2nd]`
  (https://www.cboe.com/insights/posts/what-does-it-take-to-offer-around-the-clock-equities-trading/ and Cboe
  IR releases). The overnight gap that native ES data used to fill is closing.

**Net read `[INF]`:** ES gamma is *mostly* redundant with SPX gamma for level-generation, with a real but
second-order residual — the offset strike grid. That residual is worth ~$1,750/mo only if we can show users
trade differently because of it. We cannot show that today.

---

## 4. The basis-conversion alternative

### 4.1 The mechanics

ES fair value is the cost of carry: **F = S · e^((r − q)·T)**, and **basis = F − S** — financing minus
dividends to expiry `[DOC]` (https://flashalpha.com/articles/es-futures-fair-value-basis-explained). ES is in
contango the overwhelming majority of the time; the basis decays mechanically to zero into each quarterly
settlement `[DOC]` (same).

Magnitudes, with sources:

- **Observed basis on 2026-07-31 21:00 ET: ES 7,502.88, basis vs SPX +116.2 points (+1.57%)** `[DOC]`
  (https://flashalpha.com/futures/es).
- Quarterly roll spread: **+20 to +30 points**, driven by expected dividends and the risk-free rate over the
  quarter `[DOC]` (https://www.tradingnewsterminal.com/blog/guide/es-futures-roll-date-2026); another source
  puts it at 15–25 points with rates 4–5% and dividend yield ~1.3% `[DOC-2nd]`
  (https://spxytrader.com/es-futures-rollover-calendar).
- Roll convention: **the Thursday before the second Friday of the contract month, 8 calendar days before the
  last trading day.** 2026 dates: Mar 12, Jun 12, Sep 11 (Friday), Dec 11 `[DOC]`
  (https://www.tradingnewsterminal.com/blog/guide/es-futures-roll-date-2026).

**The 2020-era "10 point discount" guidance still live on SpotGamma's marketing site `[DOC]`
(https://spotgamma.com/spx-options-levels-for-es-futures-traders/) is off by two orders of magnitude in the
current rate regime.** Any static offset we hard-code will be wrong. The offset must be computed live.

### 4.2 How accurate is it?

`[INF]` — the following is arithmetic on documented inputs, not a cited measurement:

- The deterministic drift of the basis is `dBasis/dt ≈ S·(r − q)/365`. At S ≈ 7,500 with r ≈ 4.5% and q ≈ 1.3%
  (rate/dividend figures `[DOC-2nd]` from https://spxytrader.com/es-futures-rollover-calendar), that is
  **≈ 0.66 index points per calendar day**.
- So a basis snapshot taken at the open is stale by well under one point by the close. Against a level set
  quoted in 5-point strike increments and an ES tick of 0.25, sub-point staleness is immaterial.
- Residual error sources are repo/financing repricing and dividend-expectation revisions, which move in
  fractions of a point intraday, plus quote-timing skew between the two legs.
- **The one thing that will destroy accuracy is a mishandled roll:** a 20–30 point jump `[DOC]`, i.e. 30–45x
  the daily drift. Roll handling is the only hard engineering requirement.

Verdict on adequacy `[INF]`: a dynamically-computed basis is accurate to roughly ±1 point for an ES trader.
That is inside the noise of a gamma level, which is itself a strike-anchored zone rather than a price. It is
good enough. A static offset is not, and the failure mode is silent.

### 4.3 The near-$0 implementation

1. **Compute basis from a synchronized snapshot**, never from two independently-timed quotes:
   `basis_t = ES_front(t) − SPX(t)`, both legs read at the same timestamp. Refresh every 1–5 minutes; hourly
   would also be defensible given 0.66 pts/day drift `[INF]`.
2. **Delayed data is fine for the basis leg.** Because both legs are snapped at the same delayed timestamp,
   the *difference* is unaffected by the delay; only the level itself needs to be live, and SPX we already
   have. `[INF]` This means Massive's $29/mo Starter futures tier (10-min delayed, 2y history) is sufficient
   `[DOC]` (https://massive.com/futures) — or $0 if any existing feed already carries a front-month ES print.
3. **Handle the roll explicitly** on the documented schedule (Thursday before the second Friday, 8 days before
   LTD) `[DOC]`, and assert on it: alarm if `|basis_t − basis_{t−1}| > 10` points outside a roll window.
4. **Dual-label every level** so the mapping is auditable by the user, e.g.
   `Call Wall — SPX 7,390 · ES 7,506 (basis +116.2, 14:32 ET)`. Never show a converted number without its
   basis and timestamp. `[INF]` This is also the honest-product answer: it tells the user exactly what the
   number is derived from, which a native-futures competitor cannot claim as an advantage over us.
5. **Same treatment for NQ (NDX/QQQ), RTY (RUT), YM (DJIA)** — identical mechanics, different index leg.

`[INF]` Estimated engineering: a basis service, a roll calendar, a dual-label formatter, and a drift alarm.
This is days, not weeks, and it reuses the options chains we already ingest.

---

## 5. CL, GC, ZB — where conversion cannot help

### 5.1 The capability gap is real

There is no index options chain for crude, gold or the long bond. `[INF]` For these, native CME options data
is not an optimization — it is the only path. If we want them, we buy.

### 5.2 The market is not small in absolute terms

- WTI crude oil **options** ADV: **320,000 contracts, a record, Q1 2026**; 273,000 in January 2026, up 26%
  `[DOC-2nd]` (https://www.barchart.com/story/news/37378869/... CME January volume release;
  https://www.cmegroup.com/media-room/press-releases/2025/11/04/...).
- CME energy ADV reached a record 4 million contracts; metals ADV up 127% to a record 1.7 million `[DOC-2nd]`
  (same releases).
- CME group-wide ADV ~28.1 million contracts in 2025, up 6% YoY `[DOC-2nd]` (same).
- For scale: E-mini S&P 0–5DTE options alone ran ~770K ADV in 2025 `[DOC-2nd]`.

### 5.3 But the segment inside *our* user base is unmeasured

`[UNKNOWN]` — I could not determine how many Mastermind Terminal users trade CL/GC/ZB. No public data can
answer this; it is an internal telemetry question.

What public data does say about the adjacent retail futures population: ES, NQ, CL, GC, ZN, ZF and 6E are the
liquid retail day-trading set, with micro contracts now over 45% of equity-index volume (MES ~1.6M/day, MNQ
~2.2M/day) `[DOC-2nd]` (https://proptradingvibes.com/blog/futures-contract-specifications,
https://daytraders.com/best-futures-markets-for-prop-firms). Prop firms list ES, NQ, MES, MNQ, CL, GC, ZB
`[DOC-2nd]` (https://velotrade.com/blog/best-prop-firm-for-futures).

`[INF]` That population exists but it is a *futures prop-firm* population, not our population. Our terminal is
equity/index: US/CN/HK equities, index options, screeners, fundamentals. A commodity-options desk is an
adjacent-market expansion, and expansions should be justified by demand evidence, not by the existence of the
market.

### 5.4 Hidden engineering cost, if we do buy

`[INF]` Native futures options are not a drop-in extension of our OPRA-shaped pipeline:

- **Different pricing model.** Options on futures price under Black-76 with the futures price as underlying,
  not Black-Scholes on spot `[DOC-2nd]` (https://ryanoconnellfinance.com/options-on-futures/).
- **Early exercise.** Most commodity and Treasury futures options are American-style, requiring binomial or
  finite-difference methods to capture the early-exercise premium; Black-76 is a close approximation only for
  short-dated OTM contracts. Exercise style even varies within the S&P complex by expiration cycle
  `[DOC-2nd]` (same).
- **Databento supplies no greeks or IV** `[DOC]` (https://databento.com/options) — we build the whole greeks
  layer, per product, per exercise style.
- **Per-underlying complexity.** Each contract has its own expiry calendar, strike listing rules, settlement
  convention and physical/financial delivery quirks. This is 20+ symbology problems, not one.

Barchart is the mitigation here — they compute greeks and IV in-house (Black-76, Bachelier for spreads)
`[DOC]` (https://www.barchart.com/solutions/services/futures-options) — which is why their quote is worth
requesting even under a don't-buy decision.

---

## 6. Recommendation

### Now (this quarter) — spend $0

1. **Ship basis-converted ES/NQ/RTY/YM levels** from the SPX/NDX/RUT/DJIA chains we already license, per §4.3.
   Dual-labelled, live basis, explicit roll handling, drift alarm.
2. **Instrument demand.** Add futures-symbol queries to the existing search-tracking plane and read the owner
   Search Log after 60 days. Specifically: what fraction of sessions query CL, GC, ZB, NG, SI, or their
   micros — as distinct from ES/NQ/RTY, which the conversion path already serves.
3. **Request two free quotes** — Barchart futures options (EOD + greeks) and dxFeed commercial. Both are
   contact-sales; both cost nothing to ask; both are currently `[UNKNOWN]` in this report and shouldn't stay
   that way.
4. **Put three written questions to Databento sales**, because the public pages conflict: (a) does a
   subscriber-facing web product publishing derived levels require Plus-tier external distribution, or does
   Standard cover it; (b) how does that interact with the 24-hour rule for a level published at 9 a.m. from a
   4 p.m. prior-day settlement; (c) do they hold a CME derived-data licence that covers downstream customers,
   or do we need our own DDLA.

### Trigger to buy — any one of these

- Search Log shows a material CL/GC/ZB cohort. Conversion cannot serve them; buy Databento.
- A named revenue opportunity (partner, prop-firm channel, enterprise tier) explicitly requires native futures
  gamma.
- ThetaData ships CME futures options (roadmap Q4 2026) `[DOC]` at a price inside our current envelope — in
  which case take that path in preference to Databento, because it adds no new vendor, contract, or
  redistribution negotiation.

### Do not buy on

The reasoning "MenthorQ has it, so we need it." Their ES/NQ product is a blend that leans on the SPX chain by
their own documentation, and their conversion tooling is public. The part of MenthorQ we cannot replicate for
free is CL/GC/ZB/FX — a segment we have not yet shown we have users for.

---

## 7. Open questions and gaps

Explicitly not determined in this session:

| Question | Status |
|---|---|
| CME derived-data licence fee, in dollars, for our use case | `[UNKNOWN]` — 2026 and 2025 fee PDFs timed out on 3 fetch attempts |
| Whether Databento Standard's "no license fees" survives professional/display/redistribution classification | `[UNKNOWN]` — pricing page and licensing blog conflict; needs written vendor answer |
| ThetaData futures add-on price | `[UNKNOWN]` — not published |
| Barchart futures-options price | `[UNKNOWN]` — contact sales only |
| dxFeed commercial/redistribution price | `[UNKNOWN]` — $29/$79 figures are secondary-source and probably retail terminal pricing |
| CME DataMine per-dataset prices | `[UNKNOWN]` — no public price list found |
| Whether Intrinio sells CME options on futures | `[UNKNOWN]` — no evidence found; search bounds were 2 searches + 2 fetches, one of which 404'd; sales not contacted |
| Size of our own CL/GC/ZB user cohort | `[UNKNOWN]` — internal telemetry question, answerable via the Search Log |
| Any quantitative study comparing ES-options-derived vs SPX-options-derived level accuracy | **Not found.** Searched five phrasings. Every vendor makes the claim qualitatively; none publishes a measurement. §3.4 is reasoning, not evidence. |

Pages that blocked direct fetch and were read only via search-result extracts, so treat their figures as
second-hand: seekingalpha.com (403), grokipedia.com (403), support.spotgamma.com (403),
spxytrader.com (403), and all of cmegroup.com (repeated 60s timeouts).
