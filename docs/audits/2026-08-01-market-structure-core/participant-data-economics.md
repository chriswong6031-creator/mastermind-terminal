# Participant-Tagged Options Data: What It Costs, and Do We Need It?

**Date:** 2026-08-01
**Context:** We already hold ThetaData PROFESSIONAL (full OPRA trade tape with NBBO, EOD greeks 2017→, daily OI, 15-min chain snapshots). Question: do we buy exchange participant / open-close data?
**Tagging:** `[DOC]` = stated in a public source I actually read (URL cited). `[DOC-2nd]` = figure came from a search-engine summary of a source I could not load directly — treat as one notch weaker. `[INF]` = my inference. `[UNKNOWN]` = could not determine.

---

## TL;DR — the recommendation

**Take Cboe's free trial. Budget $0 for calibration. Do not buy the redistribution license.**

Cboe currently offers a **free trial of up to 6 months of historical End-of-Day Open-Close data** to any firm that has never purchased it and never had a trial, effective 2025-11-24 `[DOC]`. Six months of per-strike, per-day, origin-tagged, open-vs-close ground truth is more than enough to calibrate and measure a trade-classification estimator. That is exactly our stated use case, and it costs nothing.

The decisive constraint is on the *other* side of the decision: **showing derived aggregates from Open-Close to our SaaS subscribers costs $5,000/month per exchange on top of the data fees** `[DOC]` — roughly **$60,000/year for one exchange**, before the underlying subscription. That is the number that kills the "power a live product feature with it" plan, not the raw data cost.

Because our use case is *calibrate and validate*, not *serve*, we stay on the internal-use side of the license and never trigger that fee.

| Path | Cost | Verdict |
|---|---|---|
| Calibrate/validate only (free trial, C1 EOD, 6 months) | **$0** | **Do this** |
| Extend calibration beyond the trial | $300–$600 per month-of-data `[DOC]` | Optional, cheap |
| Power a live product feature (C1 EOD + external derived-data distribution) | **~$67,200/yr** (see §4.4) | Defer |
| Per-trade ground truth (Trade-by-Trade Report) | $8,000 per month-of-data ad-hoc; 1 month free trial `[DOC]` | Only if EOD proves insufficient |

---

## 1. Cboe LiveVol / DataShop — Open-Close Volume Summary

### 1.1 What is actually in it

From the Cboe rule filing SR-CboeEDGX-2025-082, which describes the product in the exchange's own words `[DOC]` (https://cdn.cboe.com/resources/regulation/rule_filings/approved/2025/SR-CboeEDGX-2025-082.pdf):

**End-of-Day (EOD) Open-Close** is an end-of-day volume summary of activity on that exchange, broken out **at the option level** by:
- **origin** — customer, professional customer, broker-dealer, market maker (four categories)
- **side** — buy or sell
- **price**
- **transaction type** — opening or closing

Customer and professional-customer volume is further split into **trade-size buckets: under 100 contracts, 100–199, and over 199** `[DOC]`.

"At the option level" means per option series — i.e. per expiry/strike/right `[INF]`, which is what we would need for strike-level calibration. The DataShop product page additionally lists OHLC prices, total volume and open interest as fields present **only in the EOD file, not in the intraday intervals** `[DOC]` (https://datashop.cboe.com/cboe-options-open-close-volume-summary).

**Intraday Open-Close** carries the same origin / side / open-close / size-bucket structure but **drops price and open interest**. It comes as snapshots on either a **1-minute or 10-minute interval**, published within five minutes of the interval closing `[DOC]`.

Format is CSV, delivered by SFTP; the 1-minute product is also available via Snowflake with restrictions `[DOC]` (https://datashop.cboe.com/cboe-options-open-close-volume-summary).

### 1.2 Critical scope limit — this is *not* the OPRA tape

The filing is explicit and repeats it three times: Open-Close Data "is proprietary Exchange trade data and does not include trade data from any other exchange" `[DOC]`.

This matters enormously for calibration:

- Cboe's four options exchanges (C1, C2, BZX, EDGX) accounted for **28.15% of US options matched volume** on 2026-07-31 `[DOC]` (https://www.cboe.com/us/options/market_share/market/ — same page: Nasdaq complex 27.21%, NYSE 19.19%, MIAX 17.51%, BOX 4.60%, MEMX 3.35%; total 80,583,443 contracts).
- But **98.2% of index option volume traded on Cboe-operated exchanges in Q1 2026** `[DOC-2nd]` (https://www.cboe.com/insights/posts/the-state-of-the-options-industry-q-1-2026).

**Implication `[INF]`:** for **SPX and VIX** — Cboe-proprietary, exclusively listed products — the C1 Open-Close file is effectively a *complete census* of the trade population, and is near-perfect ground truth. For **SPY, QQQ, and single stocks**, Cboe sees only roughly a quarter of the tape, so open-close is a *sample*, not a census. A calibration built on it is still valid for the Cboe-executed subset, but generalizing an accuracy figure from that subset to the whole OPRA tape requires assuming Cboe-routed flow is representative — which is not obviously true, since routing is venue-fee- and payment-driven. **Calibrate on SPX first; treat equity-name accuracy numbers as an estimate with a stated caveat.**

### 1.3 History depth

`[DOC]` (https://datashop.cboe.com/cboe-options-open-close-volume-summary):

| Exchange | EOD from | 10-min from | 1-min from |
|---|---|---|---|
| C1 (Cboe Options — SPX/VIX) | 2005-01-03 (format changed 2011) | 2011-01-03 | 2019-10-07 |
| BZX, C2, EDGX | 2018-01-02 | 2019-03-01 | 2019-03-01 |

C1 also includes Global Trading Hours sessions from 2023-12-11 `[DOC]`. Pre-2005 data is said to be available by contacting support `[DOC]`.

### 1.4 The actual prices

Authoritative source: **Cboe Exchange, Inc. Fees Schedule dated July 20, 2026** `[DOC]` (https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf, "Livevol Fees" section, pp. 12–13). These are the **C1** rates.

**End-of-Day Open-Close**

| Item | Price |
|---|---|
| Ad-hoc historical, one–four years | **$600.00 per month of data** |
| Ad-hoc historical, five or more years | **$300.00 per month of data** |
| Ongoing subscription (daily updates) | **$600.00 per month** |
| Academic purchasers | **$1,500 per year**, then **$125 per additional month** |
| **Free trial** | **up to 6 months of EOD historical data** |

**Intraday Open-Close**

| Item | Ten-Minute | One-Minute |
|---|---|---|
| Subscription | **$3,000/month** or **$36,000/year** | **$12,000/month** or **$144,000/year** |
| Ad-hoc historical, last four years | **$1,000 per month of data** | **$4,000 per month of data** |
| Ad-hoc historical, five or more years | *(no separate rate shown in the schedule)* `[UNKNOWN]` | **$2,500 per month of data** |
| Academic | $3,000 first year, then $250/month | $12,000 first year, then $1,000/month |
| Free trial | up to 6 months | up to 6 months |

Mid-month subscriptions and ad-hoc requests for partial date ranges are **prorated** `[DOC]`.

**Note the pricing unit.** "$600 per month" for an ad-hoc historical request means *$600 per calendar month of data purchased*, not $600 for the whole order. The EDGX filing states this plainly: the charge "is $400 per request, per month," and "an ad hoc request can be for any number of months" `[DOC]`. So a full year of C1 EOD history at the one-to-four-year rate is **12 × $600 = $7,200** `[INF, arithmetic]`.

**The other Cboe exchanges are cheaper.** For EDGX (and per the parallel filings, BZX and C2), ad-hoc historical rates are `[DOC]` (SR-CboeEDGX-2025-082):
- EOD Open-Close: **$400 per request, per month**, available from January 2018
- Ten-Minute Intraday: **$500 per request, per month**
- One-Minute Intraday: **$1,500 per request, per month**

### 1.5 The free trial — the single most important finding

`[DOC]` (Cboe Fees Schedule p.12, and SR-CboeEDGX-2025-082):

> A free trial is available for **up to 6 months** of End-of-Day Open-Close Historical Data to both TPHs and non-TPHs who have **not previously purchased** End-of-Day Open-Close Historical Data or **previously received a free trial**.

Key properties:
- **Effective 2025-11-24**, approved by the exchange's President on 2025-11-21 `[DOC]`.
- Open to **non-members** ("non-TPHs") — we do not need to be a trading permit holder `[DOC]`.
- Offered **separately for each of the three products** — EOD, Ten-Minute Intraday, One-Minute Intraday — each with its own up-to-6-months trial `[DOC]`. That is potentially 18 product-months free at C1 alone.
- Filed in **parallel by C1, C2, BZX and EDGX** `[DOC]` — the same free-trial filing exists for each exchange (SEC release numbers 2025-22868 for Cboe/C1, 2025-22861 for C2, 2025-22860 for EDGX, 2025-22862 for BZX). **`[INF]`** this suggests the trial can be claimed once per exchange, potentially multiplying available free data — but I did **not** find a document confirming the trials are independent across affiliated exchanges rather than pooled at the group level. **Verify with Cboe before planning around it.**
- **One-time and consuming.** Once claimed, it is gone. Use it deliberately.

**`[INF]` — strategic note:** since ad-hoc requests can name arbitrary months, the six free months should be *chosen*, not taken contiguously from the present. Picking six regime-diverse months (e.g. a volmageddon-type shock, a 2020-style crash, a grinding bear month, a low-vol melt-up, a recent 0DTE-dominated month) buys far more calibration signal than six consecutive quiet months.

### 1.6 Other discounts

- **Academic discount:** 50% off standard price on select historical datasets with a **$500 minimum**, restricted to accredited educational institutions whose faculty/students use the data solely for research and education, and not combinable with other discounts `[DOC-2nd]` (https://datashop.cboe.com/academic-discount; application form at https://datashop.cboe.com/documents/DataShop_Application_for_Academic_Discount.pdf). The Open-Close-specific academic rates quoted in §1.4 come directly from the fee schedule `[DOC]`. **We do not qualify** — we are a commercial SaaS, not an accredited institution `[INF]`.
- **Volume discount:** a 20%-off promotion applied to historical purchases totalling $20,000 or more, run 2025-07-28 → 2025-09-30 `[DOC-2nd]`; an earlier identical window ran 2025-04-23 → 2025-06-30 and has since been removed from the fee schedule as expired `[DOC]` (SR-CboeEDGX-2025-082). **`[INF]`** Cboe appears to re-run this promotion periodically, so a large historical purchase is worth timing.
- **Startup tier:** **not found.** No evidence Cboe offers one.

### 1.7 New product — the Trade-by-Trade (TBT) Report

Filed 2025-12-04 as SR-CBOE-2025-088 `[DOC]` (https://cdn.cboe.com/resources/regulation/rule_filings/approved/2025/SR-CBOE-2025-088.pdf). This is **materially better ground truth than Open-Close** and is worth knowing about.

Each row is a **single trade event**, carrying: transaction time, trading floor timestamp, underlying symbol, full OSI details (root, expiry, strike, call/put), trade size, trade price, **market context indicators including NBB/NBO and local BBO**, **side (buy/sell)**, **transaction type (opening/closing)**, and **origin (customer, professional customer, broker-dealer, market maker)** `[DOC]`.

Delivered **T+1**, produced after midnight ET, explicitly so that "the data is strictly historical and cannot be used to influence intraday trading decisions" `[DOC]`.

**This is a per-trade labelled dataset with the quote context attached** — i.e. precisely the (features, label) pairs a trade-classification model needs, with no aggregation loss `[INF]`. Open-Close only gives daily or interval *totals*, so calibrating against it requires matching aggregates rather than individual trades.

Pricing, from the July 2026 fee schedule `[DOC]`:

| Item | Price |
|---|---|
| Subscription | **$12,000 per month** |
| Ad-hoc historical request | **$8,000 per month of data** |
| Academic | $24,000 first year, then $2,000/month |
| **Free trial** | **up to 1 month** of TBT data, for those who have not purchased it or had a trial |

**`[INF]`** The one-month free TBT trial is arguably the highest-value free asset on the table for our purpose: a single month of per-trade labelled SPX data would let us measure our estimator's accuracy trade-by-trade rather than only in aggregate. It is worth claiming alongside the EOD trial.

---

## 2. OCC — is there free participant data?

**Partially answered; key details `[UNKNOWN]`.**

OCC publishes a set of market data reports that are free to access on theocc.com, including **"Volume by Account Type"**, "Daily Volume", "Open Interest", "Volume Query", "Exchange Volume by Class", and "Monthly & Weekly Volume Statistics" `[DOC-2nd]` (https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-by-account-type; index described at https://www.optionseducation.org/referencelibrary/market-data).

I attempted to load the OCC pages directly and via archive.org and was blocked (HTTP 403 from theocc.com; web.archive.org unavailable to my fetch tool). **I therefore could not verify the following, and they should be checked manually before relying on them:**

- `[UNKNOWN]` Whether Volume by Account Type is broken out **per underlying symbol or per series**, or is only a **market-wide aggregate**. The one concrete detail I could retrieve — that "details for individual options on futures are available in the Volume Query and Volume by Account Type reports by searching within futures products" `[DOC-2nd]` — hints at some symbol-level querying, but does not establish series-level granularity.
- `[UNKNOWN]` Whether OCC's account types split **opening vs closing** transactions. OCC's account-type taxonomy is customer / firm / market-maker, which is an *origin* split; open-vs-close is a separate dimension and I found no evidence OCC publishes it.
- `[UNKNOWN]` History depth and whether a bulk download or API exists.

**`[INF]` — provisional assessment:** OCC's free reports are almost certainly **too coarse to calibrate a per-strike trade classifier**. OCC is the clearing house; its public statistics are oriented to industry-level volume and open interest reporting. Even in the best case where symbol-level account-type volume is available, the absence of an open/close split and of strike-level detail would make it a sanity check on totals rather than ground truth for classification. **Worth 30 minutes of manual browsing to confirm, but do not build a plan around it.**

---

## 3. Alternative vendors

### 3.1 Nasdaq — Trade Outline / Open-Close Trade Profile

Nasdaq sells the direct equivalent for its four options exchanges. PHLX Options Trade Outline (PHOTO) "includes fields broken down by opening buy, closing buy, opening sell and closing sell for every option series listed and traded on PHLX" `[DOC-2nd]` (https://www.nasdaqtrader.com/Micro.aspx?id=phlxdp).

Fees effective 2024-07-01 `[DOC]` (https://www.nasdaqtrader.com/TraderNews.aspx?id=DN2024-3):

| Product | Intraday | EOD | Historical (most recent 36 months, one-time) | Derived-data external distribution |
|---|---|---|---|---|
| PHLX (PHOTO) | $3,000/mo | $850/mo | **$12,000** intraday / **$6,000** EOD | **$5,000/mo** |
| Nasdaq Options (NOTO) | $2,000/mo | $575/mo | $6,000 / $3,000 | $4,000/mo |
| GEMX | $1,500/mo | $575/mo | $9,000 / $4,800 | $3,000/mo |
| ISE | $2,500/mo | $850/mo | $12,000 / $7,200 | $4,500/mo |

ISE + intraday + EOD combined is $3,100/mo `[DOC]`.

**Notable:** Nasdaq's historical pricing is a **one-time flat fee for 36 months of data**, not per-month-of-data like Cboe. **$3,000 one-time for three years of NOTO EOD** is the cheapest bulk participant-tagged history I found anywhere `[INF]`. The catch: the discount is stated as available "to firms currently subscribed to [an] ongoing subscription" `[DOC]`, so it likely requires holding a live subscription (NOTO EOD at $575/mo) alongside — call it ~$3,000 + a few months of $575 `[INF]`.

**`[INF]`** If the Cboe free trial proves insufficient and we need broader multi-venue calibration coverage, the Nasdaq 36-month historical bundle is the best paid option on a dollars-per-observation basis.

### 3.2 MIAX

MIAX sells a 10-Minute Report and a 1-Minute Report. Per Feb 2026 rule filings `[DOC-2nd]` (https://www.federalregister.gov/documents/2026/02/17/2026-03022/... and parallel filings for Pearl, Emerald, Sapphire):
- 1-Minute Report subscription: **$6,000**
- Ad-hoc historical: **$2,500 per request, per month**, available from **March 2019**
- Academic: **$4,500 for the first year**, then **$375 per month** for additional months

MIAX was 17.51% of matched volume on 2026-07-31 `[DOC]`.

### 3.3 NYSE

NYSE publishes an **Options Open-Close Volume Summary** with **five participant categories — Customer, Professional Customer, Firm, Broker-Dealer, Market Maker** `[DOC]` (https://www.nyse.com/market-data/historical/open-close-volume-summary). That is one more category than Cboe's four: NYSE separates **Firm** (OCC clearing member proprietary) from **Broker-Dealer**, which is a genuinely useful extra distinction `[INF]`. Same size buckets (<100, 100–199, >199), EOD on a T+1 basis and 10-minute intraday snapshots published within five minutes `[DOC]`.

**Price: not found.** The product page carries only "Purchase Now" links with no stated fees `[DOC]`. History depth also not stated `[UNKNOWN]`.

### 3.4 OptionMetrics — IvyDB Signed Volume

**Important: this is not ground truth.** IvyDB Signed Volume assigns trades as buyer- or seller-initiated "based on the trade price and the bid-ask quote at the time of the trade" `[DOC]` (https://optionmetrics.com/signed-volume/) — i.e. it is an **inference algorithm of exactly the same class as the estimator we are trying to validate**, not an exchange-sourced origin tag.

Coverage is daily since January 2016, with 5-minute and 30-minute intraday snapshots in addition to EOD `[DOC]`. No accuracy metrics or validation statistics are published on the product page `[DOC]`. Pricing is not disclosed; sold as an add-on to IvyDB US `[DOC]`. Commonly reached through WRDS at academic institutions `[DOC-2nd]` (https://wrds-www.wharton.upenn.edu/pages/about/data-vendors/optionmetrics/).

**`[INF]`** Buying IvyDB Signed Volume to validate our classifier would be circular — we would be measuring our algorithm against another algorithm. It is a potential *benchmark competitor*, not a *reference standard*.

### 3.5 ORATS, Polygon, Intrinio, Barchart, Nasdaq Data Link

**No evidence found that any of these resell exchange participant/origin or open-close data.**

- **ORATS** sells smoothed greeks, IVs and theoretical values built from an end-of-day snapshot taken ~14 minutes before the close `[DOC-2nd]` (https://orats.com/ and https://orats.com/data-api). No participant-origin product found.
- **Polygon, Intrinio, Barchart** — searched specifically for open-close/participant/origin fields; nothing surfaced `[UNKNOWN as to definitive absence; found nothing]`.
- **Nasdaq Data Link** does host PHOTO (https://data.nasdaq.com/databases/PHOTO) as a delivery channel for the Nasdaq product `[DOC-2nd]`, but the page is JS-rendered and I could not retrieve its pricing `[UNKNOWN]`. **`[INF]`** it is a distribution route for §3.1's product, not an independent cheaper source.

**`[INF]` — why the resale market is thin:** the exchanges' derived-data distribution licenses (§4) make reselling participant data expensive for any vendor, which plausibly explains why the usual retail-facing API vendors do not carry it.

### 3.6 Does ThetaData already give us this?

**No.** ThetaData's roadmap lists Python Library, Interest Rates and API Keys as complete (Q2 2026); Symbology and V3 Splits & Dividends as coming (Q3 2026); CME Futures & Futures Options and Real Time SIP Data on the horizon (Q4 2026) `[DOC]` (https://www.thetadata.net/roadmap). **No open-close, participant, origin, or trade-classification product appears anywhere on the roadmap** `[DOC]`.

Our ThetaData PRO tape gives us trade prints with NBBO context — the *features*. It does not give us the *labels*. That is precisely the gap participant data fills `[INF]`.

---

## 4. Redistribution and licensing — the decisive constraint

This is the part that determines whether this data can ever touch our product, and the answer is nuanced but clear.

### 4.1 The default is: no redistribution at all

From the **Cboe/LiveVol Historical Market Data Subscriber Agreement** (dated 2022-05-27) `[DOC]` (https://datashop.cboe.com/documents/Historical_Market_Data_Subscriber_Agreement.pdf), Section 1:

> Subscriber is prohibited from selling, distributing, transferring, or otherwise disseminating Data to any other person or entity.

### 4.2 Redistribution is an add-on right you must order

Section 2 of the same agreement `[DOC]` — note the opening conditional:

> **REDISTRIBUTION.** In the event that Subscriber **selects the right to redistribute Data in an order**, the following terms shall apply:
> a. Subscriber's redistribution of the Data is **for display only**;
> b. **Display redistribution of Derived Data … is also permitted**;
> c. Subscriber may not transfer the Data to any third party;
> d. Subscriber may not grant the right to redistribute the Data to any third party.

So redistribution is not forbidden — it is **an elective, separately-priced right**, and when held, it **explicitly permits display redistribution of Derived Data**.

### 4.3 What counts as "Derived Data"

Section 3 `[DOC]`, and repeated near-verbatim in the fee schedule `[DOC]`. Derived Data is a new original work created from the Data, provided it:

- **(a)** is created in whole or in part from Data;
- **(b)** is **not an index or financial product**;
- **(c)** **cannot be readily reverse-engineered to recreate Data**, or used to create other data that is a reasonable facsimile or substitute for Data;
- **(d)** where a data provider requires it, is covered by an appropriate authorizing agreement.

And the sting in the tail `[DOC]`:

> Where Subscriber has created or calculated new original works that do not meet the standards set forth in subsections (c) – (d) above, such new original works **shall constitute Data** for the purposes of this Agreement.

There is also an explicit carve-out `[DOC]`: computing Greeks (delta, gamma, theta, vega, rho), theoretical values, or implied volatility **for internal use** is expressly not prohibited. Using Data as an input to an **index** or to create a **financial instrument/investment product** requires a *separate* license.

### 4.4 The price of showing derived aggregates to subscribers

From the C1 Fees Schedule, "Open-Close Derived Data" section `[DOC]` (https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf, p.13):

| Right | C1 price |
|---|---|
| External Distribution of Ten-Minute **and** End-of-Day Derived Data | **$5,000 per month** |
| External Distribution of One-Minute Derived Data | **$7,500 per month** |

And critically `[DOC]`: *"The fee for external distribution of Derived Data from Open-Close Data is **in addition to** fees for the End-of-Day product or the Intraday product, or both, as applicable."*

The same **$5,000/month** external-distribution-of-derived-data fee appears in the **BZX** and **C2** fee schedules `[DOC-2nd]` (https://www.cboe.com/us/options/membership/fee_schedule/ctwo/ and the BZX equivalent). **`[INF]`** this is a **per-exchange** charge, so covering all four Cboe exchanges would be ~$20,000/month = **$240,000/year** in distribution rights alone.

**Realistic minimum to ship a live SPX-only feature `[INF, arithmetic on DOC figures]`:**

```
C1 EOD Open-Close subscription      $600/mo   =  $7,200/yr
C1 EOD Derived Data ext. distrib. $5,000/mo   = $60,000/yr
                                              -----------
                                                $67,200/yr
```

Add the other three Cboe exchanges for equity-name coverage and it is roughly **$262,000/year** `[INF]`. Nasdaq's parallel license adds $3,000–$5,000/month per exchange on top `[DOC]`.

### 4.5 So — can a retail SaaS legally show derived aggregates?

**Yes, but only with the external-distribution licence, and only as display.** Concretely `[INF, grounded in the DOC'd clauses above]`:

- ✅ **Permitted with the licence:** showing subscribers a *chart* of, say, net customer opening delta by strike — a genuinely aggregated, transformed statistic, rendered for display.
- ❌ **Not permitted, ever:** giving subscribers the raw open-close file, or an API that returns per-strike origin/open-close volumes. That is transferring Data, barred by §2(c) regardless of licence.
- ⚠️ **The trap — §3(c):** an aggregate that is fine-grained enough to be *inverted* back to the underlying per-strike origin volumes stops being Derived Data and legally **becomes Data**. A per-strike, per-day, per-origin display is not really a derivation at all; it is a re-presentation. Anything we ship must aggregate across at least one dimension (origin categories collapsed, strikes bucketed, or time coarsened) with enough loss that reconstruction is infeasible.
- ⚠️ **Indices are separately licensed.** If we ever turn an Open-Close-derived series into something index-like or into the basis of a tradable product, that needs its own agreement under §3.

**The clean escape for our actual use case:** *calibrating and validating an estimator is internal use.* We never redistribute the Data, and the model coefficients we fit are not a facsimile of the Data. We stay entirely inside the base licence and never owe the $5,000/month.

**`[INF]`, and I want to flag this as genuinely uncertain:** publishing a *model-quality statistic* — e.g. "our estimator agrees with exchange open-close tags 87% of the time" — is a single summary number, plainly not reverse-engineerable, and in my reading is not "redistribution of Data" in any practical sense. But that is my inference from the clause text, not a documented Cboe position, and the agreement does not address it. **Get it in writing from Cboe sales before putting an accuracy claim in marketing copy.** The cost of asking is zero; the cost of being wrong is a licence breach.

---

## 5. Is there a free or cheap slice good enough to *calibrate*?

**Yes — and it is free.** This is the answer to the question we actually care about.

| Option | Cost | What you get | Fit for calibration |
|---|---|---|---|
| **Cboe EOD Open-Close free trial** | **$0** | Up to **6 months** of per-series, origin-tagged, open/close, size-bucketed EOD data. Choose any months from 2005 (C1) `[DOC]` | **Excellent** — this is the recommendation |
| **Cboe Trade-by-Trade free trial** | **$0** | **1 month** of per-trade rows with origin, open/close, side, NBBO/BBO context `[DOC]` | **Best-in-class labels**, short window |
| Cboe 10-min / 1-min intraday free trials | $0 | Up to 6 months each `[DOC]` | Good for intraday-shape calibration |
| Extend Cboe EOD beyond trial | $300–600 per month-of-data `[DOC]` | Arbitrary additional months | Cheap top-up |
| Nasdaq 36-month EOD historical | $3,000 (NOTO) – $7,200 (ISE) one-time `[DOC]` | 3 years, different venue mix | Best paid bulk value; likely needs live subscription |
| MIAX academic | $4,500 first year `[DOC]` | 1-min report history | Not eligible — we are not academic |
| OCC free reports | $0 | Account-type volume/OI | **Probably too coarse** `[INF]`, granularity `[UNKNOWN]` |
| OptionMetrics Signed Volume | not disclosed | Inferred signs | **Circular — not ground truth** `[DOC]` |

**Cboe DataShop also provides sample datasets** in compressed `.gz` form `[DOC]` (https://datashop.cboe.com/faqs), though the FAQ does not say whether Open-Close specifically has a free sample `[UNKNOWN]`. Worth checking the product page while logged in — a schema sample is useful for building the parser *before* burning the trial.

### Why calibration is genuinely worth doing

The academic evidence says naive trade classification is **much worse on options than on stocks**, which is the strongest argument for getting ground truth.

Grauer, Schuster and Uhrig-Homburg, *"Option Trade Classification: Limits, Corrections, and Implications for Stock Returns"* `[DOC-2nd]` (https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4098475 — SSRN and EconBiz both returned 403 to my fetches, so these figures come from search-engine summaries of the abstract and should be confirmed by reading the paper):

- Using **matched intraday transactions and Open/Close data** as ground truth, the standard **Lee–Ready algorithm correctly signs only about 60–64% of option trades**.
- The stated cause is that **sophisticated customers frequently use limit rather than market orders**, which breaks the assumption underlying quote-based classification.
- Their additional rules **improve correct classification by more than 10 percentage points**.

For contrast, on equities the quote rule, tick rule and Lee–Ready classify roughly **76.4%, 77.7% and 81.1%** of trades correctly `[DOC-2nd]` (summarised from https://www.sciencedirect.com/science/article/abs/pii/S1386418115000415 and related literature).

**`[INF]` — the implication for us:** if our estimator is a Lee–Ready variant, its true accuracy on options is plausibly in the low 60s, not the high 80s we might assume by analogy with equities. A GEX or dealer-positioning surface built on a 60%-accurate sign is carrying far more error than its presentation would suggest. **Six free months of ground truth would tell us which regime we are in — and the published literature says there is roughly 10+ points of accuracy available from better rules, which we cannot capture or verify without labels.** That is a large payoff for $0.

This also connects to the house `regime-dynamics-law`: an estimator's accuracy is itself a level that trends — classification error is likely regime-dependent (worse in high-vol, high-0DTE conditions where limit-order use spikes) `[INF]`. Choosing regime-diverse trial months (§1.5) would let us measure that dependence rather than assume a constant.

---

## 6. Recommendation

**Do this now — cost $0:**

1. **Claim the Cboe C1 EOD Open-Close free trial** — up to 6 months, non-TPHs eligible `[DOC]`. Choose six **regime-diverse** months rather than six consecutive recent ones.
2. **Claim the Cboe Trade-by-Trade free trial** — 1 month `[DOC]`. This gives per-trade labels with NBBO context, the cleanest possible calibration target.
3. **Focus calibration on SPX/VIX**, where C1 is a near-complete census (98.2% of index volume is Cboe-operated `[DOC-2nd]`). Treat equity-name accuracy as an estimate carrying a representativeness caveat, since Cboe sees only ~28% of overall matched volume `[DOC]`.
4. **Confirm three things with Cboe sales before ordering** — all free to ask:
   - whether the free trials are independent per exchange (C1/C2/BZX/EDGX) or pooled at the group level `[UNKNOWN]`;
   - whether an Open-Close schema sample is available before the trial is consumed `[UNKNOWN]`;
   - whether publishing a model-accuracy statistic derived from the data requires the distribution licence (§4.5) `[UNKNOWN]`.
5. **Spend 30 minutes manually checking OCC's free Volume by Account Type report** to close the `[UNKNOWN]` in §2 — it is free, and if it happens to be symbol-level it is a useful cross-check on totals.

**Do not do this yet:**

- **Do not buy the external-distribution Derived Data licence** at $5,000/month per exchange `[DOC]`. It is only needed to *show* Open-Close-derived aggregates to subscribers, which is not our stated use case. Revisit only if a validated estimator turns into a flagship product surface worth ~$67,200/year at SPX-only scope `[INF]`.
- **Do not buy OptionMetrics IvyDB Signed Volume** as ground truth — it is an inference algorithm, so validating against it would be circular `[DOC]`.
- **Do not expect ThetaData to close this gap** — nothing on their roadmap addresses participant or open-close data `[DOC]`.

**If the free trials prove insufficient:**

- Top up Cboe EOD at **$300–$600 per month of data** `[DOC]` — a full extra year of C1 EOD is $7,200 at the 1–4 year rate, or $3,600 at the 5+ year rate `[INF, arithmetic]`.
- Or buy **Nasdaq's 36-month EOD historical bundle** at **$3,000 (NOTO) to $7,200 (ISE)** one-time `[DOC]` — the best dollars-per-observation on the market, and it diversifies venue mix — subject to confirming the ongoing-subscription prerequisite `[DOC]`.

**Bottom line:** the honest cost of answering "how accurate is our trade-classification estimator?" is **$0**, via a free trial that Cboe introduced in November 2025 and that we appear to be eligible for. The expensive question — $60k+/year — is a *different* question, about shipping the data into the product, and we should not conflate the two. Calibrate first, on free data, and let the measured accuracy tell us whether the licensed version is ever worth buying.

---

## Sources

**Primary (read directly):**
- Cboe Exchange, Inc. Fees Schedule, July 20, 2026 — https://cdn.cboe.com/resources/membership/Cboe_FeeSchedule.pdf (LiveVol Fees, pp. 12–13: Open-Close, Open-Close Derived Data, Trade by Trade Report)
- SR-CboeEDGX-2025-082 (free trial + product description + EDGX fees) — https://cdn.cboe.com/resources/regulation/rule_filings/approved/2025/SR-CboeEDGX-2025-082.pdf
- SR-CBOE-2025-088 (Trade-by-Trade Report) — https://cdn.cboe.com/resources/regulation/rule_filings/approved/2025/SR-CBOE-2025-088.pdf
- Cboe/LiveVol Historical Market Data Subscriber Agreement — https://datashop.cboe.com/documents/Historical_Market_Data_Subscriber_Agreement.pdf
- Cboe DataShop Open-Close product page — https://datashop.cboe.com/cboe-options-open-close-volume-summary
- Cboe DataShop FAQs — https://datashop.cboe.com/faqs
- Cboe US Options Market Share — https://www.cboe.com/us/options/market_share/market/
- Nasdaq Data News 2024-3 (Trade Outline fees + derived data licences) — https://www.nasdaqtrader.com/TraderNews.aspx?id=DN2024-3
- NYSE Options Open-Close Volume Summary — https://www.nyse.com/market-data/historical/open-close-volume-summary
- OptionMetrics IvyDB Signed Volume — https://optionmetrics.com/signed-volume/
- ThetaData roadmap — https://www.thetadata.net/roadmap

**Secondary (search summaries; source not loaded directly — 403/JS):**
- Federal Register free-trial filings, 2025-12-16: Cboe/C1 2025-22868, C2 2025-22861, EDGX 2025-22860, BZX 2025-22862
- Federal Register proration filings, 2026-06-01: EDGX 2026-10830, C2 2026-10831, BZX 2026-10832
- MIAX 1-Minute Report fee filings, 2026-02-17 — https://www.federalregister.gov/documents/2026/02/17/2026-03022/
- Cboe State of the Options Industry Q1 2026 — https://www.cboe.com/insights/posts/the-state-of-the-options-industry-q-1-2026
- Cboe academic discount — https://datashop.cboe.com/academic-discount
- Grauer, Schuster & Uhrig-Homburg, "Option Trade Classification" — https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4098475
- Chakrabarty et al., trade classification accuracy on equities — https://www.sciencedirect.com/science/article/abs/pii/S1386418115000415
- OCC Volume by Account Type — https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-by-account-type
- Cboe C2 fee schedule — https://www.cboe.com/us/options/membership/fee_schedule/ctwo/
