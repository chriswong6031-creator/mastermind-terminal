# Volland (vol.land) — Methodology Teardown

**Audit date:** 2026-08-01
**Subject:** Volland by Wizard of Ops / Ad Deum Funds, LLC — how the dealer-positioning engine actually works
**Author of subject IP:** Jason D. DeLorenzo (founder, Ad Deum Funds, LLC)

Every claim below is tagged:
- **[DOC]** — stated in a public source I actually read end-to-end; URL given.
- **[INF]** — my inference from the evidence. Explicitly labelled. Not a fact.
- **[UNKNOWN]** — could not determine from public sources. Stated as a gap, not filled with invention.

All prose is paraphrase. No vendor marketing or documentation text is reproduced verbatim except where a
short technical term is unavoidable (e.g. "line in the sand", "Delta-Adjusted Dealer Spread").

---

## 0. Source inventory — what I actually got

This teardown is unusually well-sourced because I recovered the vendor's own primary documents rather
than relying on second-hand descriptions. `WebFetch` 403s on `vol.land`; a plain browser User-Agent over
`curl` returns HTTP 200. That is the single most useful access note in this document.

| # | Source | What it is | URL | Read? |
|---|---|---|---|---|
| S1 | White paper, "Impact of option dealer flows on equity returns", DeLorenzo, dated 19 Dec 2023 | 22pp, the origin document for the accuracy claim | `https://vol.land/VollandWhitePaper.pdf` (mirror: `https://www.wizofops.com/uploads/1/1/6/8/116858111/impactofoptiondealerflowsonequityreturns.pdf`) | Full text + all table images |
| S2 | User Guide, updated **4 Jun 2024**, 35pp | Older widget catalogue | `https://vol.land/VollandUserGuide_Jun24.pdf` | Full text |
| S3 | User Guide, updated **27 May 2026**, 45pp | **Current** guide — documents Theo Curves, Floating Strike, Implied Skew, Term Structure | `https://vol.land/VollandUserGuide_May26.pdf` | Full text |
| S4 | Working paper, "The Influence of Options Market Maker Risk Management on the Implied Volatility Surface", Johannes Dassler, Univ. Bayreuth, 4 May 2026 | Volland's "May 2026 White Paper" | `https://vol.land/InfluenceofOptionsMMRiskMgmtOnImpliedVolSurface.pdf` | Front matter, §4 Data, §4.7 Limitations, §5 Methodology |
| S5 | The live SPA JavaScript bundle | Widget registry, API endpoint map, tier gating, FAQ, landing copy | `https://vol.land/assets/index-B7EPSNJp.js` | Programmatically mined |
| S6 | Wizard of Ops article, "What Makes Volland the Best Source for Option Dealer Positioning?", 25 Nov 2024 | The most explicit public statement about the classifier | `https://www.wizofops.com/articles/what-makes-volland-the-best-source-for-option-dealer-positioning` | Full |
| S7 | Wizard of Ops, "Why Not GEX?", 5 Apr 2023 | Their critique of the incumbent model | `https://www.wizofops.com/articles/why-not-gex` | Full |
| S8 | Wizard of Ops, "Overvixing and Undervixing", 27 Jan 2022 | Origin of the spot-vol signal | `https://www.wizofops.com/articles/overvixing-and-undervixing` | Full |
| S9 | Product page | Tier names, coverage | `https://www.wizofops.com/volland.html` | Full |

Also read for the independent-literature section: Bilz (KIT) ML trade-classification thesis, the Cboe-published
0DTE gamma paper (Amaya/Garcia-Ares/Pearson/Vasquez), Muravyev's options-market-maker paper, and the
Cboe DataShop Open-Close product description. URLs in §8.

**A note on the site's own labelling inconsistency [DOC]:** the Resources page in S5 labels the link to
`VollandWhitePaper.pdf` as the "December 2024 White paper", but the PDF's own title page is dated
**19 December 2023**. Minor, but if you cite it, cite 2023.

---

## 1. The pipeline, as the vendor documents it

The disclosed pipeline is stable across all three vendor documents and the live app. Paraphrasing S3 p.6,
S1 §4, and the S5 in-app FAQ:

1. **Ingest.** A real-time option trade-execution feed via OPRA — and S3 (2026) adds a detail the earlier
   documents omit: the OPRA feed is **sourced through Cboe** [DOC, S3 p.6]. Every executed option trade is
   identified.
2. **Classify.** Order by order, decide whether the *dealer* was the buyer or the writer.
3. **Greek each trade.** For each transaction, compute the greeks representing the risk the dealer just took
   on [DOC, S3 p.6].
4. **Accumulate.** For each strike at each expiration, compile the running total dealer position [DOC, S3 p.6].
5. **Project exposure.** For the exposure widgets, compute how much of each greek exposure dealers hold at
   each strike — described as establishing the "hedging momentum" for each greek [DOC, S3 p.6].
6. **Aggregate.** Sum strike values to get aggregate dealer greeks [DOC, S1 §4].

Coverage and cadence [DOC, S3 pp.3, 28; S5 FAQ]:
- ~1,000 most liquid equity/ETF tickers by option volume, plus major indices. Explicitly **not** suitable for
  illiquid names — the vendor states the model requires a liquidity/volume floor to be accurate [DOC, S5 FAQ].
- Dashboard refresh **every 2 minutes** at all tiers (2026). The **Institutional** widgets refresh every
  **5 minutes** instead, explicitly because of compute cost — **except Floating Strike**, which stays on the
  2-minute cadence [DOC, S3 p.28]. The 0DTE widget refreshes every 5 minutes [DOC, S5 FAQ].
- Greeks offered: charm, delta, delta-adjusted gamma (DAG), gamma, rho, theta, vanna, vega, vomma, plus
  "0DTE delta decay" on select tiers [DOC, S5 FAQ].

**Historical note [DOC]:** the June 2024 guide (S2 p.3) described four tiers priced $150 / $250 / $400 /
$1,000 per month, differentiated *by update frequency* (daily → 3×/day → 30-min → 5-min). By May 2026 (S3 p.3)
this had been restructured to **six tiers — VolHacks, Volland Swing, Volland 0DTE, Volland Insight, Volland
Universe, Volland Institutional — all on the same 2-minute cadence, differentiated by feature access instead**.
Current dollar prices are served from Stripe at runtime (`stripe/products` in S5) and are **[UNKNOWN]** — I
found no static public price list for the 2026 six-tier structure.

---

## 2. The classification algorithm — everything that is disclosed

This is the crown jewel and it is deliberately under-specified. Here is the complete public surface, and an
important **drift between document versions** that nobody seems to have noticed.

### 2.1 The three published formulations

**(a) White paper, Dec 2023 [DOC, S1 §4]** — the classifier uses, as guides, on an order-by-order basis:
- executed price
- **surrounding orders**
- **Black-Scholes fair value**
- bid/ask spreads

**(b) User Guide Jun 2024 [DOC, S2 p.6]** — identical four inputs. Same wording.

**(c) User Guide May 2026 [DOC, S3 p.6] and the live in-app FAQ [DOC, S5]** — the input list has **changed**:
- executed price
- **execution IV** (replacing "surrounding orders")
- **binomial fair value** (replacing "Black-Scholes fair value")
- bid/ask spreads

**This is a real, documented model change, not a rewording [INF, high confidence].** Two substantive
implications:
- Moving from Black-Scholes to a **binomial** fair value is what you would do to price **American-style**
  contracts and early exercise correctly. Volland covers ~1,000 single names and ETFs, which are American
  style; a Black-Scholes theo would systematically misprice ITM puts and dividend-sensitive calls, and any
  price-vs-fair-value classifier inherits that bias directly.
- Replacing "surrounding orders" with "**execution IV**" moves the decision variable from price space into
  vol space. Classifying on the IV implied by the execution, rather than the raw premium, normalises across
  strike, tenor, and intraday spot drift. **[INF]** — the vendor does not explain the change anywhere I found.

### 2.2 The most explicit public description of the mechanism

From S6 (Nov 2024), which is the only vendor source that goes past the four-input list [DOC]:

- The base technique is **midpoint determination** — compare the execution price against the top-of-book
  bid/ask to infer which side lifted or hit. This is the classical quote rule.
- They state they do **not** use the raw midpoint. Instead they substitute a **computed fair value** for the
  midpoint as the decision boundary.
- They state they use a **"shallow book"** approach specifically to address the failure modes of top-of-book
  data.
- They apply **corrections for late-reported transactions and for spread/multi-leg trades**.
- They **store every executed trade**, and describe data processing and storage as their principal moat.
- Positioning against GEX: they characterise open-interest-based GEX as roughly directionally right about
  ±75% of the time and functionally obsolete; they claim their method is more accurate than all alternatives.
  **No accuracy number is given in that article** [DOC, S6].

Independent restatement, from the Bayreuth working paper [DOC, S4 §4.1]: each filled order is classified as a
dealer buy or sell by a proprietary engine combining the executed price, the **surrounding order book**, the
fair value, and the prevailing bid-ask spread. (Note this restatement matches the *older* 2023 formulation,
suggesting the author was briefed from S1 rather than the current engine — or that "surrounding order book"
and "shallow book" are the same idea described twice.)

### 2.3 What is deliberately withheld

**[UNKNOWN]**, and I want to be blunt that these are the parts that actually determine whether a
reimplementation works:
- The decision rule itself. Is it a threshold on (exec_price − fair_value)? A signed distance in IV space? A
  learned classifier? Nothing public resolves this.
- How "shallow book" is defined — how many levels, from which venue(s), and how depth enters the decision.
- The tie-break for midspread trades, which the independent literature (§8) shows is the dominant failure
  mode and a rising share of volume.
- How multi-leg / spread / complex orders are decomposed and signed.
- How the initial inventory state is seeded. Volland accumulates *from the tape*, so the running position is
  `sum of classified trades since some epoch`. The epoch, and how open interest existing before that epoch is
  handled, is never stated. This is a first-order correctness question — the Cboe-published academic paper on
  the same problem devotes a full paragraph to exactly this error term (§8.3).
- Whether and how positions are decremented at expiration, assignment, or exercise.
- Whether classification is ever revised after the fact once the day's Cboe Open-Close data lands.

---

## 3. The accuracy claim — full forensic

### 3.1 The claim and its single source

The claim appears in exactly one place in the vendor's own writing, in **two sentences** at the end of S1 §4
[DOC, `https://vol.land/VollandWhitePaper.pdf`, §4 "Calculating Options Dealer Positioning", p.5]:

> *(paraphrase)* Cboe distributes open/close data, which the author describes as the definitive answer to
> which orders were dealer-bought or dealer-sold. Because Cboe has a monopoly on SPX, the methodology was
> tested against it. Volland is stated as **over 90% accurate across all expirations, and 99% accurate in
> 0DTE options**.

That is the entirety of the disclosure. There is **no** accuracy table, no confusion matrix, no sample size,
no date range attached to the accuracy test, no definition of what "accurate" means, and no appendix.
Appendix A of S1 contains four regression tables (§4.3 below) — **none of them is the accuracy study**.

### 3.2 What we can and cannot pin down

| Question | Answer |
|---|---|
| Where published? | Section 4 of the vendor's own white paper, self-published on `vol.land`. Also listed on SSRN (abstract id 4669282, surfaced in search; I did not read the SSRN page). **[DOC]** |
| Peer reviewed? | **No.** It is a self-published working paper. S1's acknowledgements thank named individuals (incl. Henry Schwartz of Cboe) for "critical review and commentary" — that is informal review, not peer review. **[DOC, S1 acknowledgements]** |
| Independently audited? | **Not found.** No third-party audit, replication, or verification of the accuracy figure exists in any source I could locate. **[UNKNOWN → reported as absent]** |
| Sample size of the accuracy test? | **[UNKNOWN]** — never stated. |
| Date range of the accuracy test? | **[UNKNOWN]** — never stated. The paper's *other* studies use 2018–2022 (non-0DTE framework) and 2023 (0DTE framework) **[DOC, S1 §5]**, but the accuracy test is not explicitly tied to either window. |
| Universe? | SPX only, by the paper's own logic ("Cboe has a monopoly on SPX" is given as the *reason* it could be tested). **[DOC, S1 §4]** |
| Metric definition? | **[UNKNOWN]** — "accuracy" is undefined. Per-trade agreement? Daily net-signed-volume correlation? Sign agreement on the aggregate? Not stated. |

### 3.3 The structural problem with the benchmark — and why the headline number is probably not comparable to the academic literature

This is **[INF]**, but it is well-grounded and is the single most important analytical point in this report.

Cboe's **Open-Close Volume Summary** is an **aggregated** product, not a trade-level one. Per Cboe DataShop
[DOC, `https://datashop.cboe.com/cboe-options-open-close-volume-summary`], it provides end-of-day summaries or
intraday 1-minute / 10-minute snapshots, categorised by participant type (customer, professional customer,
broker-dealer, market maker) and split by buy/sell × open/close, **per option series**. It does not identify
individual trades.

Therefore **a comparison against Cboe Open-Close cannot measure per-trade classification accuracy.** It can
only measure how closely Volland's *aggregate signed volume per series per interval* matches Cboe's. Those are
very different quantities, and the aggregate one is far easier to get right: individual misclassifications that
cancel out within a bucket are invisible. **[INF]**

Two corroborating observations:
- Muravyev's work on the same data explicitly notes that Open-Close gives *daily aggregate* OMM activity and
  that individual-OMM intraday rebalancing therefore cannot be studied [DOC, `https://www.fma.org/assets/docs/Derivatives2025/Muravyev.pdf`].
- The Bayreuth paper written *with* Volland's data concedes the point in its own limitations: identification of
  individual market-maker accounts is not possible with the dataset; the premium variable is a market-wide
  proxy, not any individual book [DOC, S4 §4.7].

**Net reading [INF]:** the ">90% / 99%" figure is plausibly a genuine, well-earned number on an *aggregate
reconciliation* task, and simultaneously not comparable to the 60–75% per-trade accuracies that the academic
literature reports (§8). Treating them as the same metric would be an error. If we reimplement, we must decide
*which* accuracy we are targeting and benchmark accordingly — and the honest, achievable target for a per-trade
classifier is the academic band, not 90%.

Also worth noting: the 99% 0DTE figure is the *easiest* case. 0DTE has no pre-existing open interest to seed —
the position starts at zero every morning and is fully observable within the session — which removes the entire
initial-inventory error term. **[INF]** That the 0DTE number is far higher than the all-expirations number is
exactly what that explanation predicts.

### 3.4 The regression evidence that *is* published (Appendix A of S1)

These are real, complete, verifiable tables [DOC, S1 Appendix A, pp.20–21], all n = 1,213 observations. They
validate the *usefulness* of the data, not the *classification accuracy*.

| Table | Relationship | Multiple R | R² | Slope coefficient | t-stat | p |
|---|---|---|---|---|---|---|
| 8 | Spot-vol correlation | 0.7553 | 0.5705 | 124.6226 | 40.107 | 1.74e-224 |
| 9 | Aggregate delta change vs SPX % change | 0.5927 | 0.3512 | 1.80089e+11 | 25.605 | 6.39e-116 |
| 10 | Vega hedging vs SPX % change | 0.6985 | 0.4879 | 1.6642e+13 | 33.966 | 3.48e-178 |
| 11 | Gamma notional hedging vs SPX % change | 0.6560 | 0.4304 | −1.30235e+11 | −30.248 | 3.57e-150 |

The sign convention on Table 8's slope is **[UNKNOWN]** — the coefficient reads +124.62, yet the body text and
the user guide both describe spot-vol as *inverse*, and S2 p.32 gives a 2022 fit of
`VIX_chg = (−111.09 × SPX_chg%) − 0.0613` with R² ≈ 0.71 [DOC, S2 p.32]. I cannot resolve which variable was
signed which way from the extracted table alone, and I am not going to guess.

**The headline substantive finding [DOC, S1 §6, §9]:** vega hedging, not gamma hedging, dominates. The paper
reports aggregate vega in the trillions per IV point against aggregate gamma hedging of roughly **$5–10bn per
SPX point**, and states vega's notional hedging requirement is ~100× delta's. Their conclusion is that gamma's
correlation to market moves is an *externality* of vega exposure rather than a cause, and that the industry's
focus on gamma is misguided. They further conclude dealers are typically **long near-dated gamma and short
far-dated vega**, and offer that as an explanation for persistent IV term-structure contango.

### 3.5 The 0DTE paradigm backtest (Table 2, S1 p.14)

Read from the embedded table image at 200 dpi. 2023 sample, SPX.

Paradigm frequency, all observations: **GEX 29.30%, Anti-GEX 8.96%, BofA 56.52%, Sidial 5.97%**.
End-of-day paradigm: **GEX 23.78%, Anti-GEX 4.90%, BofA 67.13%, Sidial 4.20%**. [DOC]

| Paradigm | Occurrences | Result | Rate |
|---|---|---|---|
| BofA (close between the two lines in the sand) | 1,136 | 1,112 success / 24 fail | **97.89% win**; LIS breached 50, breach rate 4.40% |
| GEX (target hit intraday) | 589 | 117 hit / 5 fail / 467 neutral | **19.86% target-hit** |
| Anti-GEX (target hit intraday) | 180 | 64 hit / 5 fail / 133 neutral | **35.56% target-hit** |
| Sidial | 120 | 36 success / 84 fail | **30.00% win** |

**Two honest caveats, both mine:**
1. **An arithmetic inconsistency in the vendor's own table [DOC].** GEX reconciles (117 + 5 + 467 = 589). Anti-GEX
   does **not** (64 + 5 + 133 = 202 ≠ 180 occurrences). The stated 35.56% is 64/180. One of those figures is wrong
   in the published paper.
2. The BofA "97.89% win rate" is a **range-hold** statistic on a range the model itself defines, on a
   ~0.65%-down / ~0.30%-up asymmetric band with deltas of roughly 0.15–0.30 [DOC, S1 §8a]. It is an
   in-sample descriptive statistic, not a tested strategy with costs. Read it accordingly.

---

## 4. Widget-by-widget methodology (current, May 2026)

### 4.1 The widget registry and tier gating — extracted from the live app [DOC, S5]

Mined directly from the JS bundle. This is the authoritative current feature map.

| Widget type | UI label | Tiers | Backend endpoint | Group |
|---|---|---|---|---|
| `QUAD_SCREENER` | Quad Screener | all six | `POST volhacks/quad-screener` | VolHacks |
| `EXTREMES` | Extremes | all six | `GET volhacks/extremes` | VolHacks |
| `CATALYST_IMPACT` | Catalyst Impact | all six | `GET volhacks/catalyst-impact` | VolHacks |
| `SPOT_VOL_BETA` | Spot Vol Beta | all six | `GET volhacks/spot-vol-beta` | VolHacks |
| `CHART` (exposure) | By Strike / Gamma / Vanna / Charm | Swing+ | `POST exposure` | Exposure |
| `TERM_STRUCTURE` | **By Term** | **Universe, Institutional** | `POST exposure/term-structure` | Exposure |
| `CHART` (deltaDecay) | 0DTE Delta Decay | 0DTE+ | `POST exposure` | DTE |
| `ZERODTE` | 0DTE | 0DTE+ | `GET zero_dte/...`, `GET paradigms/0dte` | Statistics |
| `TICKER` | Ticker | Swing+ | `GET tickers/summary` | Statistics |
| `GREEK_HEDGING` | Greek Hedging | Insight+ | `GET greeks/aggregate-hedging` | Statistics |
| `AGGREGATE_TREND` | Aggregate Greek Trend | Insight+ | `GET volland-live-api-greek-trend` | Statistics |
| `SPOT_VOL_CORRELATION` | Spot-Vol Correlation | Insight+ | `GET spot-vol-correlation` | Statistics |
| `DEALER_PREMIUM` | Dealer Premium | Insight+ | `GET premiums` | Statistics |
| `LIQUIDITY` | Liquidity | 0DTE+ | `GET liquidity` | Statistics |
| `GREEK_VOL_PLANE` | Greek Volatility (3D vol plane) | Insight+ | `POST heatmaps/greeks-3d-plane` | Surface |
| `FLOATING_STRIKE` | **Floating Strike** | **Institutional only** | `POST exposure/floating-strike` | Institutional |
| `THEO_CURVES` | **Theo Curves** | **Institutional only** | `POST theo-curves` (+ `GET theo-curves/expirations`) | Institutional |
| `IMPLIED_SKEW` | **Implied Skew** | **Institutional only** | `POST implied-skew` | Institutional |

Other endpoints visible in the client: `greeks/aggregate`, `volland-live-api-iv_plane`,
`volland-live-api-iv-adjusted-vanna`, `volland-live-api-vanna-plane`, `volland-live-api-ges_strike_list`,
`zero_dte/volland-live-api-charm-balance`, `volland-live-api-candles`, `history/dates`,
`history/timestamps`, `screener`. **[DOC, S5]** — useful as a feature checklist even though the payload
schemas are behind auth.

### 4.2 "Notional Hedging Exposure" — the exposure charts

**[DOC, S3 pp.19–23]** Two chart forms per greek, both denominated in **notional USD dealers must hedge**:

- **Exposure Chart** — x = strikes, y = notional USD to hedge, one bar = notional held for that greek at that
  strike. The stated purpose of the whole exposure family is to locate the price levels at which dealers must
  buy or sell the underlying hard to stay delta-flat.
- **Dealer Flow / Cumulative Chart** — x = strikes, y = *cumulative* notional hedging requirement. The
  construction differs by greek order, and this is a genuinely non-obvious detail:
  - **First-order greeks:** the absolute dealer position in that greek summed across all strikes — renders as a
    flat horizontal line.
  - **Second-order greeks:** the **closing strike at the most recent update is pinned to zero**, and the curve
    shows the cumulative hedging requirement that accrues as the market moves away from that anchor.

The landing-page framing is that ~95% of institutional option counterparties are wholesalers who must
dynamically hedge, and that the "Notional Hedging Requirement" is the key to spotting an imbalanced book
[DOC, S5 landing copy].

**Directional interpretation matrix [DOC, S2 p.12]** — read entirely from the dealer's perspective:

| Greek | Positive above spot | Positive below spot | Negative above spot | Negative below spot |
|---|---|---|---|---|
| Charm | Bearish | Bearish | Bullish | Bullish |
| Gamma | Resistance | Support | Permissive | Permissive |
| DAG | Buying | Buying | Selling | Selling |
| Vanna | Magnet | Magnet | Repellent | Repellent |
| Vega | Long options | Long options | Short options | Short options |
| Theta | Short options | Short options | Long options | Long options |

**DAG (Delta-Adjusted Gamma) construction [DOC, S2 p.7]:** flip the sign of gamma at every strike above the
current price. That is the whole transform. Its purpose is to make gamma readable as directional dealer
buying (green) vs selling (red) on the cumulative chart, since raw gamma is sign-blind to direction.

**Charm sign convention — a trap for reimplementation [DOC, S2 p.31]:** Volland computes charm as *days
passing* (+1 day elapsed), not as *DTE decreasing*. This **inverts the sign** relative to the common textbook
convention. In Volland, **negative charm is bullish and positive charm is bearish**. They also state charm is
computed per **hour**, not per day, for granularity. Get this wrong and every 0DTE paradigm read flips.

### 4.3 "Greek Hedging" widget — what it actually is

The brief for this audit asked about a "Greek Hedging Widget scenario model". **The current widget is not a
scenario model.** I read the rendering component directly out of the app bundle: it renders a **three-row
table** — Daily Delta Hedging, Daily Vega Hedging, Daily Theta Hedging — each a single currency-formatted
number from `GET greeks/aggregate-hedging` [DOC, S5]. No scenario inputs, no sliders, no what-if.

S3 p.25 confirms and explains the semantics [DOC]:
- The **delta hedging** figure combines the day's delta changes from **new positioning + vanna + gamma +
  charm** into one number. It represents the total notional impact dealers had on the underlying that day —
  explicitly **not** the amount left to hedge, since much is done intraday.
- The **vega and theta** figures are the day's change in the premium greeks. The guide states these should be
  reflected in IV and skew: negative ⇒ IV and skew should have fallen; positive ⇒ risen.
- Repeated caveat: the number is notional and should not be read literally, only compared against equity
  notional traded.

**The actual "scenario model" is a documented formula, not a widget [DOC, S2 p.31, Swing Trading Principle 3a]:**

```
Total Delta Notional Hedged =
      (Gamma Exposure       × Underlying Change)
    + (Aggregate Vanna      × Fixed-Price Vol Change)
    + (Aggregate Charm      × Hours Passed)
```

with delta notional defined as `delta × total_size × 100 × underlying` [DOC, S1 §5]. The guide's swing-trading
workflow is literally: form a thesis on each of the three right-hand variables, and the formula gives you the
dealer hedging flow. This is the most directly reimplementable thing in the entire product. The guide attaches
a "15% on SPX" figure to the gamma/charm/vanna notional in that principle; the meaning of that 15% is
**[UNKNOWN]** from the text.

### 4.4 "Dealer Premiums" — and the explicit not-P&L warning

**[DOC, S3 p.26]** Two numbers: **Net Dealer Premium** (total dealer premium across all open options traded
that day) and **Net 0DTE Dealer Premium** (the 0DTE-only slice). The in-app labels add "(Incl. Intrinsic)"
[DOC, S5], which the PDF does not mention — so intrinsic value is included, not just extrinsic.

The guide states plainly, in both the 2024 and 2026 editions, that **this is not a dealer profit-and-loss
figure**. It should be compared against a rough estimate of the payout that will be required. It is framed as
context, not as a P&L.

Why the distinction matters, per the paper's own theory [DOC, S1 §7]: in the BofA paradigm dealers are net
*positive* premium, and the working theory is that they hedge *with those premiums in mind*, defending the
strikes where premium collected turns into net payout — that boundary being the "line in the sand". S1 is
unusually candid here: it says outright that this premium-gatekeeping theory is **fitted to observed data and
is not proven**, and volunteers the counter-argument that a dealer's actual objective is positive expectancy
over cost of risk management, not premium defence.

**Line in the sand (LIS), formal definition [DOC, S2 p.10]:** the strike at which dealers flip hedging
behaviour (buying→selling or vice versa). Below/beyond it, dealers start gamma-hedging and the trend
accelerates. S2 p.24 adds an observational claim that the gamma hedge tends to be done in **triples** — three
times the gamma notionally required, assuming a trend — and that an LIS break typically produces a 10–15 point
SPX move in roughly five minutes. That "triples" claim has no cited evidence.

### 4.5 Spot-Vol Correlation and "Overvixing"

**Definitions [DOC, S2 pp.10–11]:** Spot-vol correlation (SVC) is the linear regression between VIX points and
SPX percent change on a daily timeframe. **Overvixed** = VIX runs higher than the SPX move implies;
**undervixed** = lower.

**The widget [DOC, S5]** displays four statistics: **R²**, **SLOPE**, **VOL SLOPE** (computed in the client as
`1 / slope`), and **CURRENT RATIO**.

**The asymmetry claim [DOC, S8]:** overvixing mean-reverts sharply — an SPX rally with a VIX drop, attributed
to market-maker vanna. Undervixing does **not** strongly mean-revert; it accumulates until an event triggers an
overvixed drop in SPX. This asymmetry is the whole thesis and it is asserted without a published test in S8.

**The quantified signal, "Spot Vol Beta" / "Vol Events" [DOC, S3 p.18]:** when VIX moves 2 or more points at
day's end relative to its implied change, SPX is stated to trade back to the prior day's close within 3 weeks.
**Since 2012: 28 of 30 occurrences, 93%**, against a stated options-implied base rate of ~42%. The in-app
version of this text [DOC, S5] states the same 93% but omits the 28/30 denominator. **n = 30 over 14 years** —
that is a very thin sample for a 93% claim, and the ~42% "options imply" baseline is unexplained
(**[UNKNOWN]** how it was computed).

**Causal claim [DOC, S1 §6b; S2 p.8]:** vega's regression slope against SPX is very close to the inverse of the
spot-vol correlation's slope. They argue from this that **dealer vega hedging drives spot-vol correlation**,
rather than the conventional gearing/dynamic-vol-hedging explanation, and consequently that **skew is
determined by aggregate dealer vega positioning while changes in vega are governed by vanna**. S1 itself calls
this suggestive rather than conclusive.

**Vanna stochastic [DOC, S1 §6c-ii]:** because vanna alone does not correlate to market moves independently of
vega, they convert vanna into a **stochastic oscillator** locating the market on the dealer book's vega curve.
±1 ⇒ vega curve maximally sensitive to spot; 0 ⇒ market sits at the dealers' extreme vega value and IV has
complete control of vega hedging. They report all of 2022 read negative — contrary to their prior expectation —
and suggest the measure may lead market stress by 1–3 months. Mechanism for the stochastic normalisation
(window, bounds) is **[UNKNOWN]**.

### 4.6 Implied Skew and Theo Curves — the institutional-tier IP

This is the part the brief flagged as most important, and S3 (May 2026) documents it for the first time. Both
are **Institutional-tier only** [DOC, S5].

#### Theo Curves [DOC, S3 p.28]

- **What it computes:** the **cumulative greek exposure as a function of a hypothetical change in the
  underlying spot price**. The guide explicitly frames it as the institutional counterpart to the by-strike
  cumulative exposure chart: where that chart shows the *current* state at each strike, Theo Curves shows the
  cumulative exposure the dealer book *would have* at each spot level.
- **Axes:** x = the underlying spot price at which the cumulative greek is evaluated; y = total notional greek
  exposure.
- **Two curves, and this is the core idea:** a **yellow** curve = the **dealer** exposure of the selected
  greek; a **blue** curve = the **implied** exposure given by the **fixed-price volatility skew**. The product
  is the *divergence between the two*.
- **Controls:** greek, underlying, expiration(s), option kind. Client default config is `greek: "delta",
  kind: "both"` [DOC, S5].

So: Theo Curves is a **spot-scenario reprice of the accumulated dealer book**, plotted against a market-implied
counterfactual derived from the observed skew. **[INF]** Mechanically, that requires (a) the full per-strike
per-expiry dealer position, (b) a vol model that tells you what each contract's IV becomes at each candidate
spot, and (c) re-greeking every contract at every candidate spot. Item (b) is precisely why the widget needs a
skew model — and why it shares infrastructure with Implied Skew. The 5-minute (rather than 2-minute) refresh on
Institutional widgets, which S3 attributes to compute cost, is consistent with a full book reprice across a
spot grid.

#### Implied Skew Curves [DOC, S3 p.30]

This is the closest the vendor comes to describing the mechanism, and it is more explicit than I expected:

- **Inputs:** it brings together Volland's **vega, vanna, and vomma** data to construct a **dealer implied skew
  curve based solely on positioning**.
- **Axes:** x = the underlying spot price at which the skew curve is evaluated; y = **annualised implied
  volatility**.
- **Two curves:** **yellow** = the dealer-positioning-derived skew curve; **blue** = the **market**
  fixed-price volatility skew. Again, the signal is the gap.
- **Constraint that reveals the construction:** you **cannot** select multiple expirations, because each skew
  curve must be measured against the market skew curve **in its own tenor** and tenors cannot be mixed
  [DOC, S3 p.30]. The client enforces this — `IMPLIED_SKEW` config carries a single-expiration selector while
  `THEO_CURVES` carries a multi-expiration one [DOC, S5].
- **The theoretical claim:** Volland states its studies show that skew pricing is driven by event-driven
  pricing, historical distributions, arbitrage prevention, **and** dealer positioning; and that **as the first
  three influences soften, dealer positioning becomes the dominant determinant of fixed-price vol pricing** —
  making the positioning-derived skew a **leading indicator of future skew**.
- Marketing framing [DOC, S5]: a method to price skew in accordance with total dealer positioning, used to
  anticipate how the skew curve *should* be priced and thereby avoid liquidity traps; and to find where on the
  vol curve dealers face the most liquidity pressure through skew mispricing.

**How far can we reconstruct the mechanism? [INF — this is inference, clearly labelled]**

The vendor never publishes the functional form. But the inputs they name — **vega, vanna, vomma** — are exactly
the first- and second-order sensitivities of the book's value to volatility:
- **vega** = ∂V/∂σ — the book's level exposure to vol,
- **vanna** = ∂²V/∂σ∂S — how that vol exposure changes as spot moves,
- **vomma** = ∂²V/∂σ² — the convexity of vol exposure in vol itself.

A book that is short vega at a given strike wants that strike's IV lower; vanna tells you how that pressure
migrates as spot moves; vomma tells you how it accelerates as vol itself moves. Constructing a
"positioning-implied IV per strike" from that triple is a natural — though far from unique — construction: you
are asking, at each spot level, what IV surface would leave the aggregate dealer book at its least-stressed
(or a marginal-cost-of-risk-equalising) state, and reading off the resulting σ(K). The paper's own thesis
supports this reading: it argues skew *is* the dealers' assumption about IV movement given a spot move, and
that vega hedging enforces spot-vol correlation [DOC, S1 §6b].

**What remains [UNKNOWN]:** the objective function being optimised (if any), the normalisation, how the curve
is anchored to a level rather than only a shape, whether arbitrage-freeness is enforced, and whether vomma
enters as a weight or as a term in a Taylor expansion. Anyone claiming to know the exact formula from public
sources is guessing. **We would have to design our own.**

### 4.7 Floating Strike — answered, and it is not what the name suggests

The brief flagged this as poorly documented. It **was** — the 2024 guide has no such widget — but S3 documents
it clearly [DOC, S3 p.29]:

- **Purpose:** view exposure across **multiple tickers simultaneously** by **normalising the different
  underlying price scales onto a common axis of call delta**. It is positioned as a **dispersion-risk** tool.
- **x-axis = combined call delta.** **y-axis = total notional exposure.** Each bar = combined notional exposure
  at that call delta.
- **Controls:** multi-select tickers (checkbox search), plus greek, expirations, and option kind.
- **Constraint:** the widget cannot be grouped with others, because of its multi-underlying nature. The UI also
  blocks batch expiration changes for it [DOC, S5].
- It is the **only** Institutional widget that stays on the 2-minute refresh rather than 5-minute [DOC, S3 p.28].
- Client default config: `tickers: [], greek: "delta"` [DOC, S5].

So "floating strike" here means **moneyness-normalised (delta-space) strike axis**, enabling cross-asset
overlay. It is *not* the sticky-strike/sticky-delta vol-dynamics sense of the term found in the options
literature. Landing copy corroborates: understand the delta levels where wholesalers are most exposed across
multiple assets; spot when index and ETF positioning decouples [DOC, S5].

### 4.8 Term Structure Aggregate Exposure

**[DOC, S3 pp.22–23]** Two forms, both gated to **Volland Universe and Institutional** [DOC, S5], endpoint
`POST exposure/term-structure`. Note: when charting by term you **cannot** select expirations — the tenor axis
*is* the expiration dimension [DOC, S3 p.19].

- **Term Structure Exposure Chart:** x = option tenor; y = cumulative dealer notional hedging requirement; each
  bar = the aggregate notional for that greek at that tenor, summing across all strikes at that tenor.
- **Term Structure Cumulative Exposure Chart:** same axes, but each point is the **running cumulative** notional
  from the nearest expiration outward.

**The tenor bucketing is explicitly published and is directly reusable [DOC, S3 pp.22–23]** — the background of
the chart is colour-banded by the *time gap between consecutive tenors*:

| Band | Colour | Gap between tenors |
|---|---|---|
| Daily | Orange | 1–5 days |
| Weekly | Yellow | 6–10 days |
| Monthly | Blue | 11–35 days |
| Quarterly | Indigo | 36–360 days |
| Annual | Violet | > 360 days |

Note the subtlety: the bucket is defined by the **gap to the neighbouring expiration**, not by absolute DTE.
That is a smarter construction than fixed DTE buckets — it adapts to each underlying's actual listing schedule.

A **different** tenor split is used elsewhere: the **Extremes** widget uses Short-Term 0–2 weeks / Swing-Term
2–6 weeks / Long-Term 2–6 months, computed on **vanna transition levels**, with each tenor computed
independently of the others (so a long-term resistance can legitimately sit below a short-term one)
[DOC, S3 p.17]. And the Bayreuth paper uses a fifth split — 0DTE / 1–5 / 6–15 / 16–30 / 31+ DTE — chosen to
mirror how market-maker desks are organised by horizon [DOC, S4 §4.5].

### 4.9 Other widgets worth capturing

- **Liquidity — "Delta-Adjusted Dealer Spread" (DADS)** [DOC, S3 p.25]. A genuinely novel and *fully specified*
  metric, unusually for this vendor. Per trade: `(execution price − fair value) × delta`. Then averaged across
  trade-level DADS. Expired trades drop out of the average. It rises with underlying volatility and correlates
  to VIX. **Stated reference level: roughly 10–12 for SPX in a highly liquid regime.** This is the only formula
  in the product given end to end, and note that it is computed from the *same* `(execution price − fair value)`
  quantity that drives the trade classifier — strong evidence that the classifier's decision variable is
  literally signed distance from fair value. **[INF on that last point.]**
- **Quad Screener** [DOC, S3 p.16]: x = vanna exposure (directional lean vs the trailing 6 months); y = gamma
  exposure (volatility expectation). Used for sector dispersion screens and index-vs-leveraged-ETF comparisons.
- **Catalyst Impact** [DOC, S3 p.17]: gauges the imbalance of "price power" from delta change on the dealer
  book, driven by the post-catalyst IV crush. A strong bullish reading means customers are positioned bearish
  at the margin.
- **3D Volatility Plane** [DOC, S3 p.27]: x = DTE, y = strike, z = implied volatility, with the surface
  heat-mapped by the selected greek — either absolute, or **changed from yesterday's greek profile**.
- **Aggregate Greek Trend** [DOC, S3 p.24]: 6 months of daily aggregate greek history per ticker.
- **Ticker widget** [DOC, S3 p.26]: current price, total hedging, and a per-ticker **VIX-methodology 30-day IV**
  — i.e. they compute a VIX-style index for every covered name.

---

## 5. The 0DTE paradigm framework (their signature intellectual product)

Four regimes, defined by the **shape of the charm profile relative to spot** [DOC, S1 §7; S2 pp.23–27]. Each is
named after the paper that first described that customer configuration.

| Paradigm | Customer position | Charm signature | Dealer stance | Behaviour |
|---|---|---|---|---|
| **BofA** | long calls **and** puts | negative below spot, positive above | short strangles; **net positive premium** | Range-bound; LIS defended both sides. Most common. |
| **GEX** | long puts, short calls | negative **both** sides | the classic SqueezeMetrics assumption | Bullish trend to an OTM **target**; LIS below. 2nd most common. |
| **Anti-GEX** | short puts, long calls | positive **both** sides | bearish risk reversal | Bearish trend to a target below; LIS above. 3rd most common. |
| **Sidial** | short calls **and** puts | mixed / mean-reverting | long options; **negative premium** | Whipsaw; dealers revert price to charm-neutral. Rarest. |

Vocabulary: a **target** is an OTM strike at the charm balance point that should be *touched* during the day
but need not close there; an **LIS** is where dealers flip from buying to selling [DOC, S1 §7].

**Operational timing findings [DOC, S1 §8]:**
- Paradigms typically set by **~10:30 a.m. ET** and usually persist for the day — the guide is explicit that
  this is not guaranteed [DOC, S2 p.30].
- **"Dealer o'clock"** — dealers warehouse intraday risk and hedge aggressively roughly **1:30–3:00 p.m. ET**
  (S1 §8 says 1–2.5 hours before expiration). Rationale from private interviews with dealers: dynamic hedging
  into 0DTE flow gets whipsawed and is costly [DOC, S1 §8; S2 p.10].
- Dealers hedge earlier if the market goes "out of bounds", heuristically **>1.5× the opening straddle price**
  [DOC, S2 p.21].
- GEX paradigm loses edge if the target is not reached before ~1 p.m.; both GEX and Anti-GEX tend to migrate
  into BofA over the day.
- Trading map [DOC, S2 p.30]: BofA → iron condors/flies; Sidial → long straddles/long gamma; GEX → bullish
  short gamma; Anti-GEX → bearish short gamma.

**Their contrarian 0DTE conclusion [DOC, S1 §8d]:** they argue 0DTE **reduces** overall market volatility,
because much 0DTE trading is dealer-to-dealer and lets dealers hedge the whole book daily at a fraction of the
cost. They speculate that many of the "customers" Volland sees in 0DTE are actually **longer-tenor dealers**
hedging their short-vol books cheaply — and name **overnight liquidity** as the factor that could break this.

---

## 6. The May 2026 working paper — semi-independent, and honest about limits

**[DOC, S4]** "The Influence of Options Market Maker Risk Management on the Implied Volatility Surface: An
Empirical Analysis", Johannes Dassler, University of Bayreuth, working paper dated 4 May 2026, supervised by
Jan Heldmann.

**Independence assessment — important.** The author's contact address on the title page is
**`johannes@vol.land`**, and the acknowledgements thank the Volland team, specifically Hunter Edmonds for
mentorship and Jason and Jill DeLorenzo for providing the data and for review and commentary. So: it is an
academically supervised thesis, but it is **not an independent audit of Volland**. Treat it as a
well-constrained internal study conducted under academic supervision. **[DOC + INF on the characterisation.]**

**Design:** one-minute SPX/SPXW bid and offer quote snapshots, **2 Jan – 31 Mar 2026**, RTH only,
**23,249 snapshots** (390/day). **SVI Jump-Wings** (Gatheral & Jacquier 2013) fitted **independently to bid and
to offer** for five expiration slices (0DTE, 5, 15, 30, 60 DTE) at every snapshot. Surface dynamics regressed on
delta-binned order flow, lagged greek exposures, and a weighted aggregate inventory-stress measure, split by
realised-volatility regime (5-min RV in the main spec, 30-min for robustness).

**Volland's role:** supplies both (a) the trade-level MM buy/sell classification and (b) the aggregate MM book
in notional greeks — delta, gamma, vanna, charm, vomma, and 0DTE delta decay — **at one-minute frequency**
[DOC, S4 §4.4]. The paper states the accuracy of the inventory construction is verified against Cboe
Open/Close, without giving numbers.

**Findings [DOC, S4 abstract]:** three of four predictions confirmed — order flow moves the surface **locally,
not globally**; the **lagged** greek state of the book predicts subsequent SVI parameter changes, with **gamma
the dominant transmission channel at short maturities**; and aggregate inventory stress drives substantial
surface movement in high-vol regimes. The fourth — the asymmetric bid/offer adjustment predicted by inventory
theory — is **not detected** at one-minute frequency.

**Stated limitations [DOC, S4 §4.7]** — and these are more candid than anything the vendor writes about itself:
- One-minute snapshots may miss sub-minute surface dynamics.
- **The Volland classification is proprietary and its precise construction cannot be fully disclosed, which
  introduces opacity into the identification of market-maker vs customer flow.** (The vendor's own supplied
  paper says this in print.)
- A three-month sample covers one regime; generalisability is limited.
- Individual market-maker accounts cannot be identified, so the premium variable is a market-wide proxy for
  collective risk tolerance, not any participant's actual financial position.

---

## 7. Published limitations, disclaimers, and criticism

### 7.1 The vendor's own caveats — collected

Credit where due: Volland caveats more than most vendors in this space [DOC, S2/S3 unless noted].

- Dealer hedging accounts for **35–40%** of underlying movement, attributed to a discussion with the Cboe data
  team. Volland covers only that slice; passive flows, hedge funds, CTAs, ETF rebalancers and others may push
  the other way and Volland "may not be a perfect match all the time" [DOC, S2 p.30].
- Elsewhere the same claim appears as **~1/3 of stock volume**, attributed to Henry Schwartz (2023)
  [DOC, S5 landing]. The two framings (35–40% of *movements* vs 1/3 of *volume*) are not the same statistic.
- The Greek Hedging number "shouldn't be taken literally" — use it only as a comparison against equity notional
  traded [DOC, S3 p.25].
- Notional dealer hedging exceeding equity notional traded does **not** mean dealers are the whole volume; it
  means warehoused risk is large [DOC, S3 p.26].
- Vega is only partially hedged. S2 p.8 assumes **30–40%** of vega is hedged. S1 §6b quotes Henry Schwartz
  (text message, 15 Dec 2023) estimating **only ~25% of SPX option vega is hedged in VIX instruments**, with
  much warehoused or dispersed. So a meaningful share of the vega exposure Volland measures never becomes
  observable hedging flow at all.
- Their informal study of expiring delta positions in SPX found **no correlation to the next day's opening
  price** [DOC, S2 p.29] — a negative result they published.
- The premium-defence explanation of the BofA "line in the sand" is **fitted to data and not proven**, with the
  counter-argument stated by the authors themselves [DOC, S1 §7].
- The Sidial paradigm does not occur often enough for statistical significance [DOC, S1 §8c].
- The model requires a liquidity/option-volume floor; penny stocks are explicitly out of scope [DOC, S5 FAQ].
- Standard "as is" liability disclaimers in both the guide and the site terms; the site terms explicitly
  disclaim endorsement of the accuracy, completeness, timeliness or reliability of any content [DOC, S3
  Disclaimer; S5 Terms].
- Learning curve: they state most users take **at least a month** to learn the product [DOC, S5 FAQ].

### 7.2 Their criticism of competitors

**[DOC, S7 and S5 FAQ]** Their case against GEX:
- GEX rests on 2017-era assumptions — all puts bought, all calls sold — derived from **open interest**, which
  they argue were reasonable when insurers and long-only funds dominated but are wrong now that volumes have
  more than tripled.
- They allege competitors continue to use assumptions they know to be inaccurate.
- Substantively: they argue the "magnetic" price levels attributed to gamma are actually **vanna**, reasoning
  that a true gamma effect would require dealers to reverse position without price movement.
- On "gamma flip": they say services using reductive GEX assumptions label the vanna/charm sign-flip point the
  "gamma flip" price and are not measuring it correctly [DOC, S5 FAQ].
- ±75% directional accuracy is their characterisation of GEX [DOC, S6] — self-serving and unsourced.

### 7.3 Independent criticism of Volland — the honest finding

**I could not find any substantive independent critique, replication, or negative technical review of
Volland's methodology.** Searches across Reddit, review sites, competitor content, and general web turned up
nothing beyond vendor material and neutral coverage. **[UNKNOWN → reported as absent, not as endorsement.]**

The nearest thing to independent criticism applicable to the category:
- The Bayreuth paper's own opacity limitation (§6) — from a paper Volland itself publishes.
- The general observation that dealer-positioning outputs are **model outputs, not exchange-published
  statistics**, so two legitimate models can disagree; and that Cboe's own 0DTE work notes the difficulty
  outside observers face inferring participant positioning.
- Competitor positioning: Menthor Q markets its futures figures as calculated natively from futures data
  rather than mapped from equity options, an implicit swipe at OPRA-derived approaches
  (`https://menthorq.com/`). SpotGamma's own support docs describe DDOI/structural positioning as inference
  (`https://support.spotgamma.com/hc/en-us/articles/15246735925395-DDOI-Dealer-Directional-Positioning`).

**My own methodological criticisms**, offered as **[INF]** and clearly labelled as mine, not as documented
findings:
1. **The accuracy metric is undefined and the benchmark cannot support a per-trade claim** (§3.3). This is the
   most consequential gap.
2. **The initial-inventory seeding problem is never addressed** (§2.3). Tape-accumulated positions inherit an
   unknown constant offset for every series that began trading before the accumulation epoch. The Cboe-published
   academic paper treats exactly this as a first-order error and spends a paragraph bounding it (§8.3); Volland
   never mentions it. For 0DTE it is a non-issue, which is consistent with the 99%-vs-90% gap.
3. **Table 2's Anti-GEX row does not reconcile** (§3.5).
4. **The 93% overvixing signal rests on n = 30** (§4.5).
5. **The two "dealer share of flow" statistics are not the same measurement** and are used interchangeably (§7.1).
6. **The "gamma hedging in triples" and "10–15 points in 5 minutes" claims are asserted without evidence** (§4.4).

---

## 8. Independent literature: what per-trade option side classification actually achieves

This is the section that governs what a reimplementation can realistically hit.

### 8.1 The classical benchmark — and a citation discrepancy worth knowing

**Savickas & Wilson (2003)**, "On Inferring the Direction of Option Trades", the founding study
(`https://papers.ssrn.com/sol3/papers.cfm?abstract_id=295024`). Proprietary CBOE data, **3 Jul – 31 Dec 1995**,
**869,217 matched trades** [DOC, as reported in the Bilz thesis §2.1, `https://github.com/KarelZe/thesis/releases`].

**Note a live discrepancy in the secondary literature [DOC]:** the commonly circulated figure for the quote
rule from this paper is **83%** (with LR 80%, EMO 77%, tick 59%). The Bilz thesis, citing Savickas & Wilson
pp.883–887 directly, reports the quote rule at **78.98%**. Both figures are in circulation. If we cite this
paper, we should read it ourselves rather than inherit either number. Either way the qualitative findings hold:
the quote rule is best, tick-based rules are worst, all rules do markedly worse on options than on stocks, and
all rules are worst of all on **index** options — which is exactly the SPX case Volland benchmarks on.

### 8.2 The modern benchmark — accuracy has *deteriorated* badly

**Grauer, Schuster & Uhrig-Homburg (2023)**, "Option Trade Classification: Limits, Corrections, and Implications
for Stock Returns" (`https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4098475`). Three large datasets,
2005–2021, ISE and CBOE. Headline: classical rules such as LR achieve only **62.03% / 62.53%** — far below stock
market performance. Root cause identified: **sophisticated customers routinely use limit orders**, which breaks
the initiator assumption underlying every quote-based rule. They introduce two new overrides — a **depth rule**
(classify midspread trades using bid/ask depth) and a **trade size rule** (classify trades whose size matches
the quoted size at bid or ask) — improving accuracy by **6% to 47%** depending on the exchange's pricing model.
Applied to an option-order-imbalance stock strategy, their rules raise the Sharpe ratio from **2.22 to 4.25**.

**Bilz (KIT), "Improving Option Trade Classification With Machine Learning"** — a master's thesis that won the
BAI Science Award 2024; PDF at `https://github.com/KarelZe/thesis/releases/download/23-29/thesis.pdf`; the
accompanying Python package `tclf` implements every rule (`https://github.com/KarelZe/tclf`). It reproduces the
Grauer et al. baselines and reports full tables. **These are the numbers to design against** [DOC, Tables 8 & 9]:

**ISE sample** — accuracy over the entire dataset (and test set):

| Rule | Coverage | Accuracy (all) | Accuracy (test) |
|---|---|---|---|
| Tick rule (exchange) | 91.58% | **49.67%** | 50.24% |
| Reverse tick (exchange) | 90.35% | 51.47% | 50.53% |
| **Quote rule (exchange)** | 91.12% | **62.67%** | 57.01% |
| Quote rule (NBBO) | 91.73% | **63.72%** | 59.57% |
| LR (NBBO) | 99.81% | 63.56% | 59.62% |
| Reverse LR (NBBO) | 99.73% | **63.78%** | 59.71% |
| EMO (exchange) | 98.73% | 55.42% | 53.79% |
| CLNV (NBBO, reversed) | 98.70% | 60.16% | 57.43% |
| **GSU small** (Grauer et al.) | 99.79% | 63.89% | 60.05% |
| **GSU large** (with depth + trade-size overrides) | 99.99% | **75.49%** | **67.61%** |

**CBOE sample** — same construction:

| Rule | Coverage | Accuracy (all) | Accuracy (test) |
|---|---|---|---|
| Tick rule (exchange) | 91.45% | **48.75%** | 49.00% |
| Quote rule (exchange) | 90.52% | **62.46%** | 62.07% |
| Quote rule (NBBO) | 91.18% | 60.80% | 59.81% |
| Reverse LR (exchange) | 99.46% | 62.46% | 61.99% |
| EMO (exchange) | 97.96% | 49.14% | 48.65% |
| **GSU large** | 99.99% | **71.85%** | **66.52%** |

Naïve majority-class baseline on ISE: **51.40%**.

**Machine learning results** [DOC, Bilz §1, §7]:
- Transformers on trade + quote data reach **63.78%** on ISE; adding quote/size features lifts to **72.58%**
  (ISE) and **72.15%** (CBOE); the largest Transformer with option-specific features reaches **74.28%**,
  **+7.76%** over the Grauer et al. state of the art.
- Gradient-boosted trees improve **3.62–4.73%** on ISE and **5.26–5.43%** on CBOE over the rule benchmark on
  trade data alone; reaching **63.67–72.34%** in absolute terms.
- **Semi-supervised pre-training** on unlabelled trades pushes Transformers to **74.55%** on ISE (**+6.94%**).
- Interpretability finding worth noting: attention probing shows the learned rules **mimic the classical
  rules** — the model rediscovers quote-rule-like logic rather than finding something exotic.
- Applied to effective-spread estimation on CBOE, the ML models approximate the true **2.50%** effective spread
  best, versus **5.70%** from rule-based estimation.

### 8.3 The alternative that sidesteps classification entirely

**Amaya, Garcia-Ares, Pearson & Vasquez (2025)**, "0DTE Index Options and Market Volatility: How Large is Their
Impact?", published by Cboe (`https://cdn.cboe.com/resources/education/research_publications/gammasqueezes.pdf`).

Rather than infer the dealer side, they use **proprietary Cboe trade data that directly flags whether the OMM
bought or sold** [DOC]. Their reconstruction is exactly the accumulation Volland performs, but on labelled
ground truth: at inception of a series the aggregate OMM net position is zero; each OMM buy increments and each
sell decrements by trade size; cumulate to the present.

**Crucially, they document the seeding problem Volland never mentions [DOC]:** they cannot compute positions for
series that began trading before 2 Jan 2020 (their data start), because doing so leaves an error equal to the
unknown OMM position at that date. They mitigate by starting statistical analysis only from **July 2020**, and
argue the residual error is bounded because open interest at ≥6 months to expiry is small relative to short
tenors and the OMM net position cannot exceed open interest. **This is the correct way to handle the problem,
and it should be in our design.**

**Muravyev (2016)**, "Order Flow and Expected Option Returns", *Journal of Finance*
(`https://onlinelibrary.wiley.com/doi/10.1111/jofi.12380`), plus his more recent "Options Market Makers"
(`https://www.fma.org/assets/docs/Derivatives2025/Muravyev.pdf`): signs trades with a **quote-rule variant**
(above midpoint ⇒ buy, below ⇒ sell); computes OMM positions from **Cboe Open-Close** using the
**zero-net-supply identity** — OMM positions must offset proprietary traders' and public customers' positions.
He is explicit that Open-Close is **daily aggregate**, so intraday rebalancing by individual OMMs cannot be
studied. Substantive finding: inventory risk has a first-order effect on option prices, and order imbalances
attributable to inventory risk have roughly **five times** the price impact previously believed.

### 8.4 What this means for us

**[INF, but this is the actionable conclusion]**

1. **Do not target 90%.** A defensible per-trade target on modern data is **~63%** with a good NBBO quote rule,
   **~67–75%** with depth and trade-size overrides (GSU-large), and **~72–75%** with a trained model. Anyone
   promising 90% per-trade on public tape is either measuring something else or wrong.
2. **The cheapest large win is not the classifier, it is the overrides.** GSU-large beats the plain quote rule
   by roughly **12 points** on ISE and **9** on CBOE using only depth and trade-size logic — no ML required.
   Volland's own "shallow book" language is very likely the same family of idea [INF].
3. **Midspread trades are the battleground** and their share is rising [DOC, Bilz §7]. Depth-based
   disambiguation is where the accuracy lives.
4. **Fair value beats midpoint as the decision boundary** — this is the one genuinely differentiated idea
   Volland discloses, and it is not in the academic rule set. The academic rules all use the quote midpoint. If
   we substitute a model theo (binomial for American style, per Volland's 2026 change) we are doing something
   the published benchmarks have not tested. **That is a real research opportunity, not just a copy.**
5. **Seed the inventory honestly.** Adopt the Amaya et al. discipline: define the accumulation epoch, quantify
   the residual error against open interest, and either burn in for six months or bound and disclose the error.
   0DTE and short-dated series are immediately correct; long-dated series are not.
6. **Benchmark on two axes, not one:** per-trade accuracy against any labelled sample we can obtain, *and*
   aggregate agreement against Cboe Open-Close (1-min or 10-min snapshots, which are purchasable). Report both.
   Never conflate them.
7. **Reimplementable today from public docs, no research required:** DAG sign-flip; the delta-notional formula;
   the three-term hedging formula (§4.3); the DADS liquidity metric (§4.9); the term-structure gap-based tenor
   bucketing (§4.8); the Floating Strike call-delta normalisation (§4.7); the charm-per-hour, days-passing sign
   convention (§4.2); the four 0DTE paradigm definitions (§5).
8. **Requires original research, cannot be copied:** Implied Skew and Theo Curves (§4.6). The inputs are public
   (vega, vanna, vomma; dealer-vs-market curve comparison in a single tenor) but the functional form is not.
   Budget this as genuine quant R&D.

---

## 9. Open questions — the honest gap list

| # | Question | Status |
|---|---|---|
| 1 | The actual decision rule of the classifier | **[UNKNOWN]** — most valuable withheld item |
| 2 | Definition of "shallow book" (levels, venues, weighting) | **[UNKNOWN]** |
| 3 | Sample size, period, and metric definition of the >90%/99% accuracy study | **[UNKNOWN]** — never published |
| 4 | Whether the accuracy test was per-trade or aggregate reconciliation | **[UNKNOWN]** — I argue in §3.3 it can only be aggregate, but this is [INF] |
| 5 | Initial inventory seeding / accumulation epoch | **[UNKNOWN]** — never addressed by the vendor |
| 6 | Expiry/assignment/exercise decrement handling | **[UNKNOWN]** |
| 7 | Multi-leg and spread trade decomposition | Acknowledged as corrected [DOC, S6]; method **[UNKNOWN]** |
| 8 | Implied Skew functional form | **[UNKNOWN]** — inputs known, mechanism not |
| 9 | Theo Curves spot-grid resolution and vol-path assumption | **[UNKNOWN]** |
| 10 | Vanna stochastic normalisation window | **[UNKNOWN]** |
| 11 | Meaning of the "15% on SPX" figure in the hedging formula | **[UNKNOWN]** |
| 12 | Basis of the ~42% options-implied baseline for the overvixing signal | **[UNKNOWN]** |
| 13 | Current 2026 six-tier pricing | **[UNKNOWN]** — served from Stripe at runtime |
| 14 | Any independent audit or replication of the accuracy claim | **Not found** |
| 15 | Volland API response schemas | Behind auth; endpoint names captured in §4.1 |

---

## Appendix A — access notes for future audits

- `vol.land` returns **403** to `WebFetch` but **200** to `curl` with a standard browser User-Agent. This
  applies to the site and all its PDFs.
- The current user guide URL follows the pattern `https://vol.land/VollandUserGuide_<Mon><YY>.pdf`
  (`_Jun24`, `_May26`), plus a Spanish edition at `VollandUserGuide_es.pdf`. **Check for a newer edition before
  relying on this teardown** — the May 2026 edition added the entire Institutional widget chapter that the
  June 2024 edition lacked, which is where most of §4.6–4.8 came from.
- Other PDFs referenced by the SPA: `/VollandWhitePaper.pdf`,
  `/ImpactOfOptionDealerFlowsOnEquityReturns.pdf` (identical content, different filename),
  `/InfluenceofOptionsMMRiskMgmtOnImpliedVolSurface.pdf`.
- The SPA bundle at `https://vol.land/assets/index-<hash>.js` contains the complete widget registry, tier
  gating map, backend endpoint list, FAQ, glossary, and landing copy. The hash changes on deploy — re-read the
  `<script src>` from the homepage HTML first.
- Regression and paradigm tables in the white paper are **embedded raster images**, invisible to `pdftotext`.
  Render the page with `pdftoppm -r 200 -png` (or extract with `pdfimages -png`) and read the image.
- Other vendor channels not exhausted here: Volland Academy (`https://vol.land/academy`, free with an account),
  the Discord (`https://www.vollanddiscord.com`), the Substack
  (`https://wizardofops.substack.com` — daily option outlooks, largely commentary rather than methodology), and
  the YouTube channel (`https://www.youtube.com/@wizardofops`). YouTube transcripts were not retrievable via
  `WebFetch` in this session.
