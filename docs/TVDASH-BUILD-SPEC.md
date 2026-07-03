# BUILD-SPEC — TradingView-Parity Ticker Pane + Dashboard Suite
**Authored by the orchestrator (Fable), 2026-07-03, from 19-agent recon (`/tmp/tvdash-staging/{spec,code,data}/*.md`, `CAPABILITY-MATRIX.md`, `RECON-SYNTHESIS.md`).**
**Worktree (live prod baseline, commit a3362ec):** `/Users/chriswong/Documents/Cluade/charting-app/.claude/worktrees/sad-borg-e31d48`
**Deploy target:** VPS `root@146.190.142.17:/opt/terminal` (rsync; Caddy+EdgeOne in front). Mac is the fundamentals build host.

---

## 0. Rulings (final — implementers do not relitigate)

| # | Ruling | Rationale |
|---|---|---|
| R1 | **Serving = static per-symbol files** under `terminal/public/data/` rsync'd from the Mac, exactly like `.intel.json`. NO new API routes, NO hub changes in v1. New files serve immediately without rebuild/restart (verified, `api-serving.md` §4). Transcripts are per-call static files under `public/data/tx/<SYM>/…` fetched on demand. | Proven pattern; zero VPS services; middleware already excludes `/data/` |
| R2 | **Fix Caddy `/data/*` cache header BEFORE bulk-shipping new files.** JUDGE-VERIFIED: the live Caddyfile has NO `/data` override today (the memory claiming it was deployed is wrong — live file is truth). Exact edit in §7.1 (matchers + `defer` + backup + `caddy validate` + reload + rollback). HONESTY CLAUSE: `s-maxage` is necessary-but-NOT-sufficient — EdgeOne will still RefreshHit (revalidate per request) until the owner adds an EdgeOne-console cache rule; v1 accepts RefreshHit and the console rule is an owner-gated follow-up. Do not claim origin-load safety on the Caddy fix alone. | Judge sequencing-deploy B1/B2; live probe `eo-cache-status: MISS`, `max-age=0` |
| R3 | **Sources per market:** US/ADR = Mac `site/stockdata` treasure + yfinance (statements A+Q, estimates, targets, rec distribution, calendar, dividends, holders) + Polygon (news, profile branding); CN = Tushare (already-entitled; statements via `*_vip` whole-market pulls + existing parquets); HK = akshare statements/ratios/dividends + yfinance HK estimates/targets; Crypto = derived-only (performance/seasonals/technicals/RV cone). EDGAR = phase-2 hardening fallback, not v1. | Capability matrix; yfinance FREE-VERIFIED for all needed endpoints |
| R4 | **Licensing posture** (consistent with the established owner precedent for Tencent quotes): internal-use accepted-risk for yfinance/defeatbeta with hard caching + honest "data may be delayed" labeling; EDGAR/Polygon/Tushare are clean/paid. Do NOT use Finnhub/FMP/AlphaVantage (free tiers prohibit public display; signup friction). Owner can veto in review. | Synthesis Open-Q1; precedent from CN/HK quote decision |
| R5 | **CN estimates/targets: graceful empty states** — no street consensus exists (`report_rc` is 1/hr guidance-only). Tushare `forecast_vip` guidance may render as a "company guidance" chip, not analyst consensus. | R4 in synthesis |
| R6 | **Revenue segmentation (by source / by country): UI ships with graceful empty state**; populate only from `fund.json.segments` when present (v1 collectors emit `null`). No feed hunt. | No clean source in any market |
| R7 | **Mega-pane = in-shell full-coverage overlay** (`z-index: 90` — JUDGE FIX: `.app.fs .workspace` is already z-80 and would tie/shadow it; OracleDash scrim also 90, EventEdgePop 95; MegaPane's Esc handler registers on `window` with `capture: true` + `stopPropagation` so it wins over ChartPanel/SearchModal Esc listeners), NOT a new route. Shallow deep-link via `?pane=<page>` synced with `history.replaceState`. One container `MegaPane.tsx` hosting pages: `overview, statements, statistics, dividends, earnings, revenue, forecast, technicals, seasonals, mastermind`. First six share the TV "Financials" tab bar; forecast/technicals/seasonals are sibling dashboards; `mastermind` hosts the existing deep-analysis (decision hero, entry, factors, GEX, macro, smart money) so the old modal's content has a real home. | shell-code.md §7; owner: "expand the full-analysis popup into the full-screen suite" |
| R8 | **"Open Full Analysis" button → opens MegaPane at `overview`.** The old `.sa-modal` is REPLACED by the MegaPane (delete the modal mount; keep `.sa-modal-*` CSS harmless). | Owner: current popup "basically useless" |
| R9 | **Charts in the new UI are hand-rolled SVG primitives** (`components/fin/FinCharts.tsx`) — no new chart library. lightweight-charts stays chart-panel-only. | Bundle size; design control; Spark precedent |
| R10 | **All new UI strings bilingual** via `pick(en, zh)` / `t()` per existing i18n conventions. Numbers use shared `fmtNum` helpers (K/M/B/T, 2 decimals, U+2212 minus, green/red sign colors) in `lib/finFormat.ts`. | ticker-pane-code.md §8 |
| R11 | **CN chart↔panel price fix = Option A client-side splice**, JUDGE-HARDENED: the splice operates on the DAILY source array (`fullBarsRef`-level), never directly on a resampled series. If quote session-date (market-local) > last daily bar date, append a synthetic daily bar `{time: sessionDate, o: q.open, h: q.high, l: q.low, c: q.last, v: q.vol}`; if equal, patch the last daily bar (`c=q.last, h=max(h,q.high), l=min(l,q.low)`). For resampled TFs (3D/W/1M), recompute ONLY the final bucket via the existing bucketer and `series.update()` it with the bucket's EXISTING time key (never invent a new bucket unless the daily date genuinely starts one, e.g. a new ISO week). Guards: no-op when `replayIdx != null`; no-op on `basis === "EOD"`/missing; re-apply after Effect 2's `setData` (which erases a prior splice); no-op on intraday TFs (they're already live). Applies to all markets with LIVE/DELAYED_15M quotes (CN/HK/US/crypto). | price-mismatch.md §7 + judge frontend-arch B1/B2 (resample keys `ChartPanel.tsx:31-32`, default TF is 3D, EFFECT 4 replay rebuild) |
| R12 | **Intraday TFs go live**: wire `/api/intraday` into ChartPanel's data effect for `1m 5m 15m 30m 1h 2h 4h`; add them to `FUNCTIONAL` for markets `us,crypto,cn,hk` (`.TO` stays daily-only). Epoch-second time axis on intraday; daily signal/compare overlays disabled on intraday TFs (they are date-string keyed). | price-mismatch.md §5 |
| R13 | **Technicals ratings are computed client-side** in `lib/techRating.ts` from bars (daily file or `/api/intraday` per selected TF) — indicator votes per TradingView's documented rules; no server compute. | Matrix B8 — all HAVE |
| R14 | **Golden Oracle gets its own overlay dashboard** (`OracleDash.tsx`, opened from the Golden Oracle rail card): verdict + WR/PF/CAGR + full signal history (all `slice.indicator.signals`, not just 12) + equity curve when `<SYM>.backtest.json` exists (flagships). Clicking a signal row closes the overlay, jumps the chart to that bar, and pulse-highlights that marker. Jump = `window` CustomEvent `mm:chart-jump` `{sym, ts}`; ChartPanel listens, snaps ts to the nearest bar time via the SAME snapping the marker renderer uses (`near()` in `resolveSigMarks`, works on resampled TFs too), `setVisibleLogicalRange` centered ±40 bars. JUDGE CORRECTION: markers here are a hand-rolled SVG layer (`renderSignals`/`sigMarksRef`, `ChartPanel.tsx:298-323`), NOT lightweight-charts `setMarkers` — implement the pulse as a transient `highlight` flag on the target sigMark + a CSS/SVG animation (~2.5s), cleared on symbol/TF change (timer cleanup guard) before restoring normal rendering. | Owner feature request; judge frontend-arch A5/A6/A7 |
| R15 | **Event-Edge badge becomes CLICKABLE** (keeps hover tooltip): click opens a small anchored popover dashboard (`EventEdgePop.tsx`) with: trust-tier pill, the full `decision.trust_en/zh` prose (THE event edge), plus structured context chips when present — next earnings date + days-away, SUE-z, beats streak, avg surprise, drivers list. Fixed-position like `.sa-trust-pop` (overflow-safe), dismiss on Esc/outside-click. | Owner: "state what the event edge is" |
| R16 | **File-ownership matrix is hard law** (§6). A lane touches ONLY its files. TerminalShell.tsx and StockAnalysis.tsx belong to the integration lane (FE-3) exclusively. New CSS goes in `terminal/app/fin.css` (new file, imported from `app/layout.tsx` by FE-3; class inventory pre-defined in §5.4) — nobody appends to `globals.css` except FE-3 (max 10 lines: import + small shell hooks). | Prevents merge conflicts across parallel lanes |
| R17 | **Backfill scope v1:** US = every manifest `us` equity with a `site/stockdata` JSON (~1,300) + yfinance supplement for the S&P1500∩manifest actives + all ADRs (~350); CN = all 1,538 site names + parquet-covered; HK = all 504 covered names; opts.json = flagship 37 + top ~300 optionable US/ADR by dollar volume; transcripts = names with `earnings.surprises` (~1,274) × last 8 quarters, incremental. Long tail fills on subsequent nightly/weekly runs. | Bounded first ship; rolling completeness |
| R18 | **Freshness targets:** fund.json daily (Mac cron `refresh_fund.sh`, after Macro Dashboard's own build), opts.json nightly, transcripts daily incremental, intel daily. Manual trigger documented; cron line provided but enabling is owner's call (matches `refresh_cn_hk.sh` precedent). | ingest-topology.md §6 |

---

## 1. New data contracts (authoritative)

### 1.1 `<SYM>.fund.json` — `mastermind.fund/v1` (target < 60 KB)
```jsonc
{
  "schema": "mastermind.fund/v1",
  "ticker": "ZS", "asof": "2026-07-03",
  "quote_currency": "USD",      // trading currency (price/mktcap/dividends)
  "stmt_currency": "USD",       // financial-reporting currency (statements/estimates) — JUDGE FIX: for many HK names (e.g. 0700.HK) this is CNY while quote_currency is HKD; NEVER mix the two in a ratio without this field. From yfinance .info.financialCurrency
  "src": {"statements": "yfinance|tushare|akshare|site", "estimates": "yfinance|null", "dividends": "yfinance|tushare|akshare|polygon"},
  "profile": {"website": null, "employees": null, "sector": null, "industry": null, "description": null, "founded": null, "hq": null},
  "stats": {"mktcap": null, "shares_out": null, "float_shares": null, "inst_pct": null, "insider_pct": null, "beta": null, "num_holders": null},
  "statements": {
    "annual": {
      "periods": ["2021","2022","2023","2024","2025"],      // fiscal-year labels, oldest→newest
      "period_end": ["2021-07-31", "..."],
      "income": {"revenue": [], "cogs": [], "gross_profit": [], "opex": [], "op_income": [], "nonop_income": [], "pretax_income": [], "taxes": [], "net_income": [], "eps_basic": [], "eps_diluted": [], "ebitda": []},
      "balance": {"assets": [], "assets_st": [], "assets_lt": [], "liabilities": [], "liab_st": [], "liab_lt": [], "equity": [], "debt": [], "cash": [], "net_debt": []},
      "cashflow": {"cfo": [], "cfi": [], "cff": [], "capex": [], "fcf": []}
    },
    "quarterly": { /* same shape; periods like "Q3 '26"; include period_end */ }
  },
  "ratios": {
    "periods": ["2021","..."],                                // annual series aligned to statements.annual
    "pe": [], "ps": [], "pb": [], "pcf": [], "ev": [], "ev_ebitda": [],
    "current": {"pe_ttm": null, "pe_fwd": null, "ps": null, "pb": null, "ev_ebitda": null, "div_yield": null, "payout": null, "gross_margin": null, "net_margin": null, "roe": null, "roa": null, "debt_to_equity": null, "current_ratio": null}
  },
  "earnings": {
    // JUDGE FIXES: next_period is DERIVED (fiscal-year-end + quarter arithmetic in gen_fund_json — document the algorithm in-file); next_eps_est from yfinance calendar "Earnings Average"; next_rev_est from calendar "Revenue Average"; per-quarter period labels derived from the earnings_dates datetime index + fiscal calendar.
    "next_date": "2026-09-08", "next_period": "Q4 2026", "next_eps_est": 1.08, "next_rev_est": 876970000,
    // q[]: yfinance carries NO per-quarter revenue actual/estimate — rev_a/rev_e stay null for US/HK, and EarningsPage's Revenue Reported/Estimate/Surprise table renders a designed EMPTY STATE when all rev_a are null (not a broken half-table). CN can fill rev_a from Tushare income quarterlies (no estimates).
    // tx id = defeatbeta FISCAL year+quarter labels (e.g. ZS "2018Q3" reported 2018-06-06) so the doc-icon join matches the transcript store exactly.
    "q": [ {"period": "Q3 2026", "end": "2026-04-30", "report_date": "2026-05-29", "eps_a": 0.84, "eps_e": 0.80, "rev_a": null, "rev_e": null, "surp_pct": 5.0, "tx": "2026Q3"} ],   // oldest→newest, ≥8 rows where available
    "fy": [ {"period": "2025", "eps_a": 3.19, "eps_e": 3.28, "rev_a": null, "rev_e": null, "surp_pct": null} ]
  },
  "estimates": {   // null for CN. JUDGE FIX: yfinance provides EXACTLY 4 estimate rows (0q,+1q,0y,+1y) — two forward quarters and two fiscal years, NO third year. Contract fixed to that reality; ForecastPage + Overview Estimates render max 2 FY columns and the forecast fan spans current-FY→next-FY only.
    "eps_fy": {"periods": ["2026","2027"], "avg": [], "high": [], "low": [], "n": []},   // exactly 0y,+1y
    "rev_fy": {"periods": ["2026","2027"], "avg": [], "high": [], "low": [], "n": []},
    "eps_q":  {"periods": ["Q4 '26","Q1 '27"], "avg": [], "high": [], "low": [], "n": []},  // exactly 0q,+1q
    "growth": {"rev_yoy": null, "eps_yoy": null}
  },
  "analyst": {   // null for CN; HK = yfinance (NOT unaudited hk_deep)
    "dist": {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0},
    "rating_label": "Strong buy",
    "target": {"mean": null, "high": null, "low": null, "n": null}
  },
  "dividends": {"never_paid": true, "yield_ttm": null, "payout_ratio": null,
    "events": [ {"ex": "2026-05-09", "amount": 0.26, "pay": null, "type": "regular"} ],  // full history oldest→newest
    "splits": [ {"date": "2020-08-31", "ratio": "4:1"} ]},
  "ownership": {"free_float_pct": null, "closely_held_pct": null,
    "top_inst": [ {"name": "", "pct": null, "value": null} ]},   // ≤10
  "guidance": null,   // CN only: {"type":"预增","chg_min":..,"chg_max":..,"period":".."} from forecast_vip
  "segments": null    // deferred (R6): when present {"by_source":{"periods":[],"series":[{"name":"","values":[]}]},"by_country":{...}}
}
```
**Rules:** every field nullable; arrays aligned to `periods` with `null` holes; values raw units (USD/CNY/HKD, not millions); frontend guards every section. Emitters must be deterministic (stable key order, sorted periods) for clean rsync diffs.

### 1.2 `<SYM>.opts.json` — `mastermind.opts/v1` (US/ADR optionable only)
```jsonc
{"schema": "mastermind.opts/v1", "ticker": "AAPL", "asof": "2026-07-03", "spot": 308.06,
 "term": [ {"label": "1W", "dte": 7, "expiry": "2026-07-10", "iv": 0.412} /* tenors nearest 1W 2W 1M 2M 3M 6M 9M 1Y */ ],
 "smile": {"expiry": "2026-08-01", "dte": 29, "strikes": [], "iv": [], "delta_call": []},
 "iv_source": "yfinance|cboe"}
```
ATM IV = mid of nearest-ATM call/put IV per expiry (drop zero/absent IVs); tenor bucket = expiry with DTE nearest to target. Smile = nearest-to-30-DTE monthly, strikes within ±35% of spot, zero-IV rows dropped. **UNITS RULING (judge):** `iv` is ALWAYS a raw decimal (0.412 = 41.2%) in both term and smile, from both yfinance and CBOE sources (CBOE already emits decimals; never store iv_pct) — frontend multiplies by 100 at render.

### 1.3 Transcripts — `public/data/tx/<SYM>/<ID>.json.gz`, ID = `YYYYQn` (FISCAL year+quarter, defeatbeta labels)
**JUDGE FIXES:** (a) stored GZIPPED at rest (raw ~100–150 KB → ~30 KB; 10k files ≈ 300 MB not 1.2 GB; client decompresses via `DecompressionStream("gzip")` in `lib/fund.ts` `getTx()` — with a graceful error if unsupported); (b) the collector NEVER issues per-symbol remote queries at scale — it downloads defeatbeta's `stock_earning_call_transcripts.parquet` ONCE per run to a local cache and filters locally (the probe observed HTTP 429 after ~5-6 remote DuckDB queries); (c) inner JSON shape (pre-gzip):
```jsonc
{"schema": "mastermind.tx/v1", "ticker": "ZS", "id": "2026Q3", "period": "Q3 FY2026",
 "date": "2026-05-29", "title": "Zscaler Inc, Earnings, Q3 FY2026",
 "segments": [ {"speaker": "Operator", "role": "", "text": "..."}, {"speaker": "Ashwin Kulkarni", "role": "VP of Investor Relations, Zscaler", "text": "..."} ]}
```
Index lives in `fund.json.earnings.q[].tx`. Source: defeatbeta-api (dedicated throwaway venv `/tmp/dbeta-venv` or `~/.mm-dbeta-venv`; do NOT touch the macro venv).

### 1.4 US `intel.json` `analysis` block (bridge extension)
`pull_macro_intel.py` gains `build_analysis()` emitting the SAME `intel/v1` `analysis` contract `pull_cn_hk_intel.py` emits (decision/conviction/entry stay whatever `view`/`conviction` provide; add `valuation` from site valuation ratios, `financials` incl. `multiyear` + piotroski/altman, `analyst` incl. surprises/beats/sue_z/revisions + targets from the new us_deep collector when present, `smart_money` from 13F, `profile`, `tech`). Loop widens from 37 flagships to every manifest `us` symbol with a site JSON. Existing `tape`+`cards` preserved verbatim.

---

## 2. Ingest work packages (Mac, macro venv unless noted)

| WP | New/changed file(s) | Does |
|---|---|---|
| D1 | `ingest/collect_us_fund.py` | yfinance per-symbol pull → cache dir `Macro Dashboard/data/us_fund/<SYM>.json` (raw payload: A+Q statements, estimates, analyst, calendar, earnings_dates, dividends+splits, holders, info). Resumable (skip if cache < N days old), threaded ≤4, jittered sleep, `--only`, `--limit`, `--stale-days`. Universe: manifest `us` ∩ (site/stockdata ∪ S&P1500 ∪ ADRC set). |
| D2 | `ingest/collect_cn_hk_fund.py` | CN: Tushare `income_vip/balancesheet_vip/cashflow_vip` per quarter-end period (~28 periods × 3 = ~84 whole-market calls — JUDGE-VERIFIED feasible: `income_vip(period=20241231)` returned 6,656 rows in one call; cache parquet per statement) + reuse existing `financials/valuation/forecast/holders` parquets + `pro.dividend` (verified per-ticker + whole-market). **CN cost-basis RULING (judge):** `gross_profit = total_revenue − oper_cost` (营业成本), NOT `total_cogs` (营业总成本, which bundles selling/admin/finance and differs by ~40B for Moutai); `opex = total_cogs − oper_cost` best-effort. HK: akshare `stock_financial_hk_report_em` — annual AND quarterly both work (`indicator="季度"` returned 95 periods for 00700, judge-verified) + dividends per ticker (regex-parse the text field e.g. "每股派港币5.3元") over the 504 covered names, resumable cache (collect_hk_deep pattern) + yfinance HK estimates/targets/rec for the same names. |
| D3 | `ingest/gen_fund_json.py` | The single emitter: joins US caches + site/stockdata, CN parquets, HK caches → `terminal/public/data/<SYM>.fund.json` per §1.1, with per-market field mapping tables in-file. Deterministic output. `--market us|cn|hk|all`, `--only`, `--limit`. |
| D4 | `ingest/collect_options.py` | yfinance chains (primary) + CBOE delayed fallback → `<SYM>.opts.json` per §1.2 for flagship 37 + top ~300 optionable. Resumable, `--only`. |
| D5 | `ingest/collect_transcripts.py` | defeatbeta-api in its own venv (`/tmp/dbeta-venv` ALREADY EXISTS with defeatbeta-api 0.0.60 + duckdb 1.5.3 — reuse it; auto-create a persistent `~/.mm-dbeta-venv` clone if /tmp was wiped) → **download the full `stock_earning_call_transcripts.parquet` ONCE per run to a local cache dir, then filter LOCALLY** (never per-symbol remote queries — 429 risk, judge blocking fix) → `tx/<SYM>/<ID>.json.gz` (gzip at rest) + patches `tx` ids into the fund cache using defeatbeta's FISCAL year/quarter labels; incremental (existing IDs skipped). US/ADR only. |
| D6 | `pull_macro_intel.py` extension per §1.4 + `ingest/collect_us_deep.py` (yfinance targets+rec dist for site-covered names → `data/tushare/us_deep.parquet` the bridge joins). |
| D7 | `ingest/refresh_fund.sh` | One-command driver mirroring `refresh_cn_hk.sh`. **JUDGE FIXES folded in:** (1) FIRST step = `git -C "<Macro Dashboard>" pull --ff-only origin main` (the site/stockdata treasure is built by GitHub Actions CI at 22:40 UTC — there is NO local Mac build; without the pull the emitter reads stale site data; skip-with-warning if the clone is dirty); (2) disk-budget precondition: abort if Mac free space < 10 GB (`df` check; the data volume is at 95%/93 GB free) and support `--prune-cache` to delete raw us_fund payloads after emit; (3) rsync uses `--files-from` name lists (never re-walk the 905 MB data dir); (4) refuse to start the bulk rsync inside 21:00–22:30 UTC (nightly terminal-data window). Then: collect (unless `--skip-collect`) → gen_fund_json → collect_options → collect_transcripts → pull_macro_intel (US analysis) → `rsync -az --files-from` `*.fund.json`, `*.opts.json`, `tx/`, US `*.intel.json` to `VPS:/opt/terminal/terminal/public/data/`. Flags: `--us-only|--cn-hk-only|--skip-collect|--skip-tx|--skip-opts|--limit N|--prune-cache`. NO VPS rebuild/restart needed. Suggested cron: `30 23 * * *` (after CI's 22:40 build). First backfill is an overnight job (US yfinance ~1.3h @4 threads; HK akshare ~4.7h serial; CN minutes; transcripts minutes with the local-parquet pattern). |

**Tushare/akshare/yfinance etiquette:** obey the probes' observed limits (yfinance ~1s jitter between symbols, threads ≤4; Tushare `*_vip` ≤ 2/s; akshare serial with 0.5–1s sleep). All collectors must be Ctrl-C-safe and resumable.

---

## 3. Frontend work packages

### 3.1 Shared libs (lane FE1a)
- `terminal/lib/finFormat.ts` — `fmtNum` (K/M/B/T + 2dp + U+2212), `fmtPct`, `fmtCur`, `signColor`, `fmtDate`, `periodLabel` (fiscal "Q3 '26"), `daysUntil`, **and `pick(zh: boolean, en: string, cn?: string): string`** (JUDGE FIX: today `pick` is a private closure inside StockAnalysis — FE2 lanes need a shared export; FE3 later refactors StockAnalysis to import this one).
- `terminal/lib/fund.ts` — TS types for fund/opts/tx contracts + `getFund(sym)`, `getOpts(sym)`, `getTx(sym,id)`. **JUDGE FIX:** `lib/dataCache.ts` does NOT cache misses (it deletes the key on `!r.ok`, so long-tail symbols would re-404 on every render) — `fund.ts` keeps its own negative-cache map (`sym → miss-until-ts`, TTL 10 min) in front of dataCache. `getTx` fetches `.json.gz` and decompresses via `DecompressionStream("gzip")`. `getBars(sym)` re-exports dataCache's OHLC getter so rail widgets share the chart's inflight fetch (never a third raw `fetch`).
- `terminal/lib/realizedVol.ts` — Yang-Zhang realized vol over windows [10,21,42,63,126,252] + percentile cone from daily bars (recipe in `data/options-iv.md`).
- `terminal/lib/techRating.ts` — from `Bar[]`: RSI(14), Stoch %K(14,3,3), CCI(20), ADX(14), Awesome Osc, Momentum(10), MACD(12,26,9), StochRSI Fast(3,3,14,14), Williams %R(14), Bull Bear Power(13), Ultimate (7,14,28); MAs: EMA+SMA 10/20/30/50/100/200, Ichimoku Base(9,26,52), VWMA(20), HMA(9); per-indicator Buy/Sell/Neutral votes per TradingView's documented rating rules; group scores (−1..1) → 5-zone verdict (Strong sell / Sell / Neutral / Buy / Strong buy); pivots Classic/Fibonacci/Camarilla/Woodie/DM from prior-period HLC. Pure functions, unit-testable.

### 3.2 Chart primitives (lane FE1b)
`terminal/components/fin/FinCharts.tsx` + `terminal/app/fin.css` foundation: `<Bars>` (grouped, signed), `<StackedBars>`, `<LineSeries>` (multi-line + dotted variant), `<ComboChart>` (bars + line + right axis), `<Dumbbell>` (actual solid / estimate hollow dots per period + FORECAST hatched zone), `<Donut>`, `<HalfGauge>` (needle + 5-zone gradient + verdict word + Sell/Neutral/Buy counts), `<Waterfall>`, `<CapitalStructure>`, `<YearOverlay>` (multi-year normalized paths + average dotted + right-edge year/value labels + year-range slider + Percent/Regular toggle), `<MiniTable>` (metric rows × period cols, sticky first col, expandable rows, green/red change sub-values, blue row highlight, left/right period paging chevrons). All SVG, CSS-var themed, tooltips via a shared fixed-position `<FinTip>` (`.sa-trust-pop` pattern). Class inventory per §5.4.

### 3.3 Chart panel features (lane FE1c) — owns `ChartPanel.tsx`, `ChartPane.tsx`, `lib/paneSync.ts` (if needed)
1. **Live-bar splice (R11):** new optional prop `liveQuote` on ChartPane/ChartPanel; effect updates/appends the last daily bar via `series.update()` when quote session-date ≥ last bar date and basis ∈ LIVE/DELAYED_15M. Status line reflects spliced close. Works for CN/HK now, harmless elsewhere (US quotes carry basis DELAYED_15M — splice them too; crypto LIVE too; guard `EOD` no-op). Timezone: derive quote session-date in market-local wall-clock (reuse market classification).
2. **Intraday branch (R12):** in the data effect, `isIntradayTf(tf)` → fetch `/api/intraday?sym&tf&ext` DIRECTLY (no dataCache — it's `force-dynamic`/no-store; a stale 60s client cache would lag a fast session; judge A4), epoch-sec axis, skip resampleTf + date-keyed signal/compare overlays; keep indicators (they're bar-agnostic). Expose per-market intraday capability helper for the shell (`.TO` none; others full set).
3. **Jump-to-signal (R14):** listen `mm:chart-jump` `{sym, ts}` → if sym is this pane's active symbol and tf is daily-derived, find bar index by date, `timeScale().setVisibleLogicalRange({from: i-40, to: i+40})`, marker-highlight pulse ~2.5s, then restore markers.

### 3.4 Mega-pane pages
- **FE2a `components/fin/MegaPane.tsx` + `OverviewPage.tsx` + `StatementsPage.tsx` + `TranscriptDrawer.tsx`** — container (header: symbol + logo initial + page title + Back to chart; tab pill bar for the six financials tabs; Esc/scrim close; `?pane=` sync), Overview per `spec/overview-page.md` (Key facts, About w/ Show more, Ownership donut, Capital structure, Valuation, Growth & Profitability incl. waterfall, Revenue breakdown (empty-state per R6), Estimates, Dividends strip, Financial health; section `›` headers jump to sibling tabs), Statements per `spec/statements-transcript.md` (3 statement pills + A/Q toggle + mini chart strip + full `<MiniTable>` with TV row taxonomy §1.1 + doc-icon columns opening `TranscriptDrawer` — right slide-in, speaker-bold paragraphs, close ×/Esc; icon only when `tx` id exists).
- **FE2b `StatisticsPage.tsx`, `DividendsPage.tsx`, `EarningsPage.tsx`, `RevenuePage.tsx`** — per `spec/stats-earn-rev-div.md`: Statistics (P/E bar header chart + Key stats rows + Valuation-ratios table incl. `Current` live column from quote); Dividends (empty state exactly like TV when `never_paid`; else yield/history/payout cards + events table); Earnings (summary strip incl. days-to-earnings, EPS dumbbell + FORECAST zone, Reported/Estimate/Surprise `<MiniTable>`, same for Revenue, A/Q toggles); Revenue (segments when present else empty-state card + estimates fallback).
- **FE2c `ForecastPage.tsx`, `TechnicalsPage.tsx`, `SeasonalsPage.tsx`** — per `spec/forecast.md` + `spec/tech-seasonals.md`: Forecast (Price target tab: price history line from `/data/<SYM>.json` + fan to mean/high/low targets + summary sentence + rating gauge + distribution bars; Actuals-and-estimates tab: estimate-fan line chart + statement-pills + Actual/Avg/High/Low/#estimates `<MiniTable>` from `estimates`); Technicals (TF pill row — daily-derived TFs always; intraday pills enabled per market via FE1c helper, fetching `/api/intraday`; three `<HalfGauge>`s + Oscillators/MAs tables + Pivots 5-method table, all from `techRating.ts`); Seasonals (full `<YearOverlay>` incl. year-range slider, Average, Percent/Regular, chart/table toggle w/ monthly-returns grid).
- **FE2d `OracleDash.tsx` + `EventEdgePop.tsx`** — per R14/R15. OracleDash: overlay (not mega-pane page) with Golden Oracle branding, verdict hero, WR/PF/CAGR/trades stats, equity curve `<LineSeries>` from `<SYM>.backtest.json` when present, full signal-history table (badge/date/price/strength/reasons chips) with hover→"Jump to chart" affordance dispatching `mm:chart-jump` + closing. EventEdgePop: anchored fixed popover per R15.

### 3.5 Integration (lane FE3 — exclusive owner of `TerminalShell.tsx`, `StockAnalysis.tsx`, `SeasonalityCard.tsx`, `app/globals.css` (≤10 lines), `app/layout.tsx` (fin.css import), `lib/i18n.tsx` (new LEX keys))
1. **Rail revamp** (per `spec/ticker-pane.md`, adapted): section order = price header (existing) → market-status/basis line (existing) → Golden Oracle compact card (+ "Signal history" button → OracleDash) → decision hero + trust badge (Event-Edge now clickable → EventEdgePop) + drivers/cautions (KEEP — differentiator) → **Key stats** (volume, avg vol 30D, mktcap, next earnings in-N-days) → **Earnings mini** `<Dumbbell>` (last 4Q + next, days badge) + More info → earnings page → **Dividends line** (empty copy or yield + next ex-date) → **Financials mini** `<ComboChart>` w/ statement dropdown + A/Q toggle + More financials → statements → **Performance grid** (1W 1M 3M 6M YTD 1Y tiles, client-computed from bars) → **Seasonals** (existing monthly card + More seasonals → seasonals page) → **Technicals gauge** (compact `<HalfGauge>` from techRating on daily bars + More technicals) → **Analyst gauge** (fund.analyst; CN empty-state) + target/upside + See forecast → **ATM IV term structure + Vol curve minis** (opts.json; others RV-cone mini) → entry timing / factors / valuation / financials-margins / smart-money / flows (KEEP, compact) → **Profile** (website/employees/sector/industry + description clamp). Everything null-guarded; sections hide when dataless. **Bars plumbing (judge A2):** StockAnalysis receives no bars today — all rail widgets needing bars (perf grid, techRating gauge, RV cone) use ONE `getBars(sym)` from `lib/fund.ts` (dataCache-routed, dedupes with the chart's fetch); FE3 also migrates SeasonalityCard's raw `fetch` to the same getter.
2. **MegaPane mount** + `paneOpen` state + `?pane=` sync; "Open full analysis" → MegaPane overview; delete old `.sa-modal` mount.
3. **FUNCTIONAL expansion** per R12 + pass `liveQuote={quotes[sym]}` into ChartPane (R11).
4. **i18n:** add LEX keys for all new fixed labels (en+zh).

### 3.6 CSS/class taxonomy (§5.4 referenced by all lanes)
Prefix `fin-`: `.fin-scrim .fin-pane .fin-head .fin-tabs .fin-tab .fin-body .fin-sec .fin-sec-h .fin-grid2/3/4 .fin-card .fin-table .fin-row .fin-cell .fin-chip .fin-toggle .fin-pill .fin-gauge .fin-legend .fin-tip .fin-empty .fin-drawer .fin-drawer-h .fin-seg .fin-slider`, plus rail minis `.sa-kstats .sa-earn-mini .sa-fin-mini .sa-perf-grid .sa-gauge .sa-iv-mini .sa-more-btn`. FE1b authors the foundation in `app/fin.css`; other lanes may ADD classes to their own components inline-styled or extend fin.css ONLY in clearly-marked lane-owned blocks appended at file end (`/* === FE2a === */` etc.) to keep merges trivial.

---

## 4. Sequencing

```
Phase A (parallel):  D1 D2 D4 D5 D6 collectors+bridge   |   FE1a FE1b FE1c
Phase B:             D3 emitter + D7 driver (needs D1/D2 shapes)   |   FE2a FE2b FE2c FE2d (need FE1a/b contracts, which are spec-frozen here — can start with types from §1)
Phase C:             FE3 integration (needs FE1c props + FE2 components)
Phase D:             adversarial review (bugs, contract conformance, i18n, null-guards, CSS collisions) → fix pass
Phase E:             local build + tsc gate + preview smoke → deploy:
                     (1) Caddy /data header fix (R2, with backup)
                     (2) rsync frontend source → VPS build → restart → route checks
                     (3) Mac backfill runs (D7) → rsync data waves (flagships first, then US/CN/HK bulk)
                     (4) live verification + memory write
```
Backfills (Phase E-3) can start as soon as D3 lands, concurrent with FE phases.

## 7. Deploy runbook additions (judge-mandated)

### 7.1 Caddy `/data` cache block (Phase E-1, exact edit)
```
# inside the app.mastermind-x.com site block, BEFORE reverse_proxy:
@manifest path /data/manifest.json
header @manifest >Cache-Control "public, s-maxage=60, max-age=0, must-revalidate"
@data path /data/*
header @data >Cache-Control "public, s-maxage=300, max-age=0, must-revalidate"
```
(`>` = Caddy's defer-to-response shorthand — REQUIRED, plain `header` double-emits alongside Next's `max-age=0`. `@manifest` must precede `@data`; Caddy applies both matchers but the later `header` directive for the more-specific matcher must not be shadowed — verify with curl that manifest gets 60 and a symbol file gets 300.)
Procedure: `cp /etc/caddy/Caddyfile /opt/terminal/_backups/Caddyfile-<ts>` → edit → `caddy validate --config /etc/caddy/Caddyfile` → `systemctl reload caddy` → verify `curl -sI` on origin + edge. Rollback = restore backup + reload. **Expected outcome: EdgeOne moves to RefreshHit (still revalidates per request) — full TTL Hits require an owner EdgeOne-console rule (owner follow-up, not v1).**

### 7.2 FE deploy (Phase E-2)
- Per-file backups BEFORE rsync: every FE3-owned existing file (`TerminalShell.tsx, StockAnalysis.tsx, SeasonalityCard.tsx, layout.tsx, i18n.tsx, globals.css`) + `ChartPanel.tsx, ChartPane.tsx` → `/opt/terminal/_backups/tvdash-<ts>/`.
- CODE requires build: rsync source → `cd /opt/terminal/terminal && rm -rf .next && npm run build && systemctl restart terminal` → `curl 127.0.0.1:3000/terminal` 200. DATA files are rsync-only (no build) — do not conflate (judge A2).
- Ship the **flagship-37 fund.json/opts.json/tx wave in the SAME deploy** so the first live view isn't all empty states (judge A1).
- EdgeOne prerender pinning: verify live with a fresh cache key `/?nocache=<ts>` + `/terminal` (force-dynamic, uncached) — no purge creds exist locally (owner console only).

### 7.3 Hygiene
- `.gitignore` additions (worktree): `terminal/public/data/*.fund.json`, `terminal/public/data/*.opts.json`, `terminal/public/data/tx/`, plus Mac-side cache dirs are outside this repo (no entry needed).
- Memory updates at the end: deploy-topology (Caddy /data block NOW live — the earlier memory claim was wrong), new fund-pipeline memory, quote-hub memory correction.
- Owner-flagged items in the final report: EdgeOne console cache rule; bulk transcript wave licensing posture (R4); hk_deep provenance audit (we use yfinance HK targets instead).

## 5. Acceptance checks (review lane enforces)
1. `tsc --noEmit` clean vs baseline (2 known pre-existing errors only).
2. Every new UI section renders a graceful empty state with `fund=null`, `opts=null`, `intel=null` (long-tail symbol test: e.g. a `.TO` name, a lite HK name, a CN small cap, crypto).
3. Bilingual: `mm.lang=zh` shows zh for every new fixed label.
4. No `globals.css` collisions; fin.css only additive.
5. CN splice: with a mocked LIVE quote, last bar close == header price on **D AND 3D AND W AND 1M** (per-TF bucket-fold verified; default TF is 3D so this is the first thing users see); EOD basis → no splice; replay mode → no splice.
6. Jump-to-signal: BUY marker 200 bars back → chart centers ±40 bars, marker pulses, restores.
7. fund.json emitter: golden-file test for one US (ZS or AAPL), one CN (600519.SS), one HK (0700.HK) — schema-valid, arrays aligned, deterministic on re-run.
8. Transcript drawer: doc icon only where `tx` exists; drawer scrolls, closes on Esc.
9. Mega-pane on mobile ≤ 520px: single column, tabs scrollable (reuse `.sa-modal` mobile precedent).
10. No new API routes, no hub edits, no VPS service changes.

## 6. File-ownership matrix (hard law)

| Lane | Owns (create/edit) |
|---|---|
| D-lanes | `ingest/collect_us_fund.py`, `ingest/collect_cn_hk_fund.py`, `ingest/gen_fund_json.py`, `ingest/collect_options.py`, `ingest/collect_transcripts.py`, `ingest/collect_us_deep.py`, `ingest/refresh_fund.sh`, `ingest/pull_macro_intel.py` |
| FE1a | `lib/finFormat.ts`, `lib/fund.ts`, `lib/realizedVol.ts`, `lib/techRating.ts` |
| FE1b | `components/fin/FinCharts.tsx`, `app/fin.css` (foundation) |
| FE1c | `components/ChartPanel.tsx`, `components/ChartPane.tsx` |
| FE2a | `components/fin/MegaPane.tsx`, `components/fin/OverviewPage.tsx`, `components/fin/StatementsPage.tsx`, `components/fin/TranscriptDrawer.tsx`, fin.css `/* === FE2a === */` block |
| FE2b | `components/fin/{StatisticsPage,DividendsPage,EarningsPage,RevenuePage}.tsx`, fin.css block |
| FE2c | `components/fin/{ForecastPage,TechnicalsPage,SeasonalsPage}.tsx`, fin.css block |
| FE2d | `components/fin/{OracleDash,EventEdgePop}.tsx`, fin.css block |
| FE3 | `components/TerminalShell.tsx`, `components/StockAnalysis.tsx`, `components/SeasonalityCard.tsx`, `app/layout.tsx`, `lib/i18n.tsx`, `app/globals.css` (≤10 lines) |

Interfaces frozen by this spec: fund/opts/tx contracts (§1), `mm:chart-jump` event, `liveQuote` prop, `techRating.ts` exports (`computeRatings(bars, tf): {oscillators: Row[], mas: Row[], pivots: PivotTable, summary: GroupScore×3}`), FinCharts component props (FE1b documents them in JSDoc; FE2 lanes read the file before using).
