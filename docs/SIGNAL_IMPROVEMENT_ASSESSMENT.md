# Golden Oracle & Research-Desk Read — Improvement Assessment

*Prepared 2026-07-13 from a 25-agent audit (evidence cited to file:line and shipped data files). Display-tier framing throughout: everything here is context/display work — nothing below is a promotion claim, and any future authority change (rank/size/gate) goes through the usual gauntlet.*

---

## Part 1 — Golden Oracle signaling system

### What it is today

`signal_layer/confluence.py` (faithful Pine port — its math is frozen; improvements layer on top):

- **Engine**: "RSI-MACD × StochRSI MTF confluence" on a session-grouped **3-day bar** series.
  BUY = crossover of `EMA(RSI14,14) − EMA(RSI14,60)` over its `EMA(…,5)` signal line, **and** a StochRSI %K/%D bull cross within the last 8 bars, **and** a prior-closed-week confirmation, **and** RSI14 < 65 (confluence.py:110-126, 183-199). SELL mirrors with an over-extension requirement. Plus fast cut/re-buy within 3 bars and two regime gates (bear-block, strong-bull hold; :220-248).
- **Why it feels weak**: the buy trigger is a **triple-smoothed chain on 3-day bars** (RSI → EMA14 vs EMA60 → EMA5 signal), gated by *prior-closed* weekly/monthly bars. Structural lag ≈ weeks. Empirically ~2.3 entries/symbol/year, median exposure 0.24.

### Measured performance (shipped slices, fixed=True, 3 bps cost)

- Beats buy-and-hold total return on **3 of 34** flagship names — and 2 of those 3 (BTC-USD, TLT) only because buy-and-hold *lost* money. On the 30 names where B&H was positive: **1/30**.
- Left on the table: NVDA 1.13× vs 10.24× B&H; PLTR 1.17 vs 12.59; MU 0.08 vs 15.32; AVGO 0.54 vs 5.68.
- WR median 0.55; PF median 2.89 but the high PFs are small-sample artifacts (NFLX PF=194.8 on 6 trades); 4 names PF<1; many verdicts rest on n=2–7 trades.
- Failure regimes: (a) strong secular bulls — over-exits and can't re-enter (the big cost); (b) choppy single names (ARM/TSLA/XOM negative CAGR).
- It is honest as a **risk/timing overlay** (capital preservation in down markets), weak as a standalone alpha engine.

### What shipped this session

- **Default OFF** (owner order): oracle markers + verdict paint are now gated on the `_oracle` indicator being enabled; toggleable in the Indicators modal, persisted like any indicator (ChartPanel paintStatus/renderSignals gates; default set excludes `_oracle`).

### Improvement directions (ranked; display-tier; none edit confluence.py)

| # | Direction | Mechanism | Effort | Risk |
|---|---|---|---|---|
| 1 | **Regime-gate displayed markers** | Dim/badge BUY marks when `regimeBull=false` and SELL marks when `regimeBull=true` ("counter-trend" chip). Data already in every slice (`above200`, `weeklyBull`). Directly targets the over-exit-in-bull cost. | LOW-MED | LOW |
| 2 | **MTF-alignment strength chip** | The engine already exports w_bull/mo_bull/w2_bull/above200 gates in the contract; show "3/4 timeframes aligned" per signal instead of the crude `_strength()` heuristic (contracts.py:134-138). | LOW | LOW |
| 3 | **techRating agreement badge** | Show the 26-indicator technical rating at each marker; disagreement = "low-confidence" tag. Requires evaluating techRating historically (currently latest-bar only). | MED | MED |
| 4 | **Staleness/recency on verdicts** | Manifest `verdict` = last signal, however old (build_polygon_universe.py:105). Add signal-age display + decay the screener sort weight. Also: fix ScreenerView "Avg WR" (unweighted mean over unequal n) and show n(trades) beside WR/PF so small-sample verdicts stop presenting as equals. | LOW | LOW |
| 5 | **Vol/exposure context chip** | Low exposure still takes deep drawdowns (PLTR −49% at 0.24 exposure). ATR/realized-vol chip at each marker. | MED | LOW |
| 6 | **Tape/dealer context on markers** | intel.json already carries gex_flip, call/put walls, ai_lean, short_pct; join as marker hover context. LLM `ai_lean` stays de-escalation-only per house law. | MED | LOW |

**Recommended sequence**: 1 + 2 + 4 first (all low effort, reuse existing computed state, and they fix the two most misleading things users see: counter-trend markers presented at full strength, and stale/small-n verdicts presented as fresh/robust). Then 3 if the historical techRating eval is worth the compute.

**Explicitly not recommended**: editing the oracle's math (breaks the golden-gate parity contract, golden_gate.py:84-134), or a new intraday engine (different inputs, out of scope — the engine only consumes daily closes).

---

## Part 2 — Research-desk read

### What it is today

The desk read (verb/band/headline + conviction ring) is a **pure pass-through** of upstream `intel.analysis.decision/conviction` built by `ingest/pull_macro_intel.py` (US) / `pull_cn_hk_intel.py` (CN/HK). The frontend did no scoring (OracleDash.tsx:403-429; StockAnalysis verb chip).

### Confirmed accuracy failure modes

1. **Staleness leak (major)** — the 5-day freshness gate only nulls `tape.ai_lean`; the decision block renders however stale (AAPL intel was 17 days old, shown as a live read).
2. **Magnitude/direction conflation (major)** — `conviction.score` is *name quality*, not *act-now confidence*: AAPL shipped score 94 (green ring) beside verb WAIT/entry blocked/size 0. Reads as incoherent.
3. **HK-lite heuristic (major)** — long-tail CN/HK desk reads come from a 3-branch 200MA/50MA rule with an additive score (pull_cn_hk_intel.py:554-593), visually identical to engine-backed reads; missing-momentum data silently scores as a negative (`or 0` on null ret_3m).
4. **Tone-null sign loss (minor)** — bearish reads with `tone=null` rendered neutral amber (0700.HK).

### What shipped this session (owner order: integrate technical ratings)

All **de-escalation-only** (house law: the technical term may cap/discount, never raise or flip bullish):

- **Freshness discount**: `w = clamp((staleDays−2)/10, 0, 0.5)`; displayed score = `min(convScore, (1−w)·conv + w·techNorm)` — tech can only pull *down*; a plain-word note shows "Read blended with live price action — desk data N days old".
- **Disagreement haircut**: desk-bullish + tech ≤ −0.3 → score capped at 55 + "Technical tape disagrees" chip. Desk-bearish + tech improving → context chip only, no score change.
- **Color-coherence cap**: stale non-bullish reads can't paint a buy-green ring (cap 65).
- **Tone-null recovery**: bearish tint derived from entry.status/horizon when tone is null.
- **Technical rating line** inside the desk card ("Technical rating: Buy (+0.23)"), so desk and tape are reconciled in one place.

### Remaining improvement directions

| # | Direction | Effort | Risk |
|---|---|---|---|
| 1 | **Split the ring**: show *name quality* and *timing/act-now* as two separate small meters instead of one conflated number (upstream fields already distinguish them: decision vs entry/size). | MED | LOW |
| 2 | **Replace HK-lite verb with the real techRating verdict** (client-side, bars already loaded); keep the "technical coverage" honesty label; cap its band so it can't originate high conviction. Fix the `or 0` null-momentum bias. | MED | MED (CN/HK sparsity — must show honest nulls) |
| 3 | **Confluence-of-sources meter** ("3 of 4 sources agree"): engine lean, techRating, factor z, analyst tilt — with an N-of-M denominator so single-source names don't masquerade as confluent. | MED | MED |
| 4 | **Upstream freshness SLA**: CN intel was 17 days stale because `refresh_cn_hk.sh`/`refresh_fund.sh` only run manually on the Mac. Schedule them (note: launchd cannot read ~/Documents — run via a login-session cron or relocate the lane). | LOW-MED | LOW |

---

## Data-coverage roadmap surfaced by the audit (not in this session's scope)

- HK fund.json coverage 470/2,798 (16.8%); TO (219) and intl (999) have zero fund/intel pipeline.
- US intel 50.2% (source-limited to /opt/macro stockdata mirror).
- 544 orphan OHLC files on the VPS; `gc_orphans.py` disabled pending dry-run.
- Three-way git divergence (local / origin-master / VPS hot-edits) was healed for the app + fund pipeline by the 2026-07-13 VPS-canonical snapshot commit, but origin/master still carries unmerged PRs (#88–#98 lineage) that predate it.
