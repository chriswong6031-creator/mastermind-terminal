# Mastermind Terminal + Macro Dashboard — Decision-Ready System Assessment

*Prepared 2026-07-02 for handoff to `fable` (novel durable solution design + phased build). Produced by a 13-agent investigation workflow (8 investigation lanes → 4 adversarial verifiers → synthesis). Every load-bearing claim is cited to file:line, a VPS probe, or an external source. Where an adversarial verdict corrected a lane, the verdict wins and is flagged.*

> **Verification boundary (important):** the local git repo is stale (prod is canonical). The most load-bearing probes — Polygon entitlement `NOT_AUTHORIZED`, 900s/20h staleness, empty `/etc/macro-live.env`, cron timings, 5,261-symbol manifest, per-symbol compute — were run against the **VPS this session** and are single-sourced. Re-verify entitlement + `macro-live.env` + re-benchmark `gen_slices_all` on the box before committing spend/effort.

---

## 1. Executive Summary

The Terminal is in far better structural shape than "budget TradingView" implies. The chart already runs **TradingView's own open-source renderer** (lightweight-charts ^5.2.0), and the shell already has watchlists, multi-chart, saved layouts, replay, drawings, compare, and hotkeys — so the gap is **depth and polish, not missing pillars or a cheap canvas**.

The single biggest structural truth: **"completely live for the whole universe on a public, no-login app" is a market-data licensing-architecture problem, not a wiring or subscription-price problem.** The current Polygon/Massive key is provably delayed-only, and a public app makes every anonymous visitor a "professional subscriber" for exchange display fees, which can push a naive real-time US SIP feed toward $10k+/mo.

The good news: the highest-value near-term wins are almost all **$0 and free of that licensing trap** — live crypto via a keyless exchange WebSocket, a chart-remount fix that makes the UI feel instant, edge-caching the data files, a fast flagship-signal cron, and honest freshness labels.

**The single biggest lever is not "buy real-time" — it is to build a small server-side fan-out hub, seed it with free crypto + CN/HK feeds, make everything downstream (Terminal header, Macro overlay, signals) read one price, then decide the US-real-time licensing question deliberately, on top of that hub.** Sequence the free wins first; make the crypto fan-out the seed of the durable hub; buy US real-time last, and only behind an identity gate.

**Two corrections that most change the plan vs the raw lanes:**
1. **Alpaca is redistribution-illegal for this public app** ("you cannot redistribute Alpaca API data" — a login gate does not cure it). The license-clean US vendor is **Databento US Equities Mini / DBEQ.BASIC**.
2. **"Intraday signals" must be sold honestly** — this is a daily→3D-bar swing engine where a ±20% forming-bar move flips a discrete BUY/SELL marker for only ~2 of 9 names. The deliverable is "live oscillator/gate state + occasional early crossover," **not** a stream of flipping signals.

---

## 2. Problem List

| # | Problem | Root cause (evidence) | Severity | Current state |
|---|---------|----------------------|----------|---------------|
| 1 | **US/ETF header quotes are yesterday's EOD, not live** (bulk of ~5,261 symbols) | `TerminalShell.tsx:269` `lastPx = liveQuote?.last ?? livePx ?? m?.last`; `fetchQuote()` null for `us` (`intradaySources.ts:192`); `useLive` OFF; manifest `as_of:2026-07-01` | **High** | manifest EOD fallback |
| 2 | **No real-time entitlement on the Polygon/Massive key** (the crux) | VPS: `/v2/last/trade/AAPL`→`NOT_AUTHORIZED`; `socket.polygon.io` auths but every `T.*/AM.*` subscribe→"not authorized"; only `delayed.polygon.io AM.*` (15-min) entitled; snapshot lags exactly 900s | **Critical** | delayed-only |
| 3 | **Crypto not live at all — worse than "15-min delayed"** | `fetchQuote` null for crypto; Polygon crypto snapshot→`NOT_AUTHORIZED`; delayed agg was **~20h stale** for a 24/7 asset. Only 4 symbols (BTC/ETH/SOL/XRP-USD) | **High** | manifest EOD |
| 4 | **Signals lag — once/day at 21:30 UTC (~8–24 min run)** | Cron `30 21 * * * terminal-data`; `confluence.py` is a pure daily→3D-bar engine (`compute_signals(close)` :161; `resample_sessions` :144-157) — no tick/volume input | **High** | monolithic nightly full-rebuild |
| 5 | **HK is delayed, not live** | Same Tencent path as CN; `intradaySources.ts:140` — HK "~15-min delayed at source" | **Med/High** | delayed masquerading as live |
| 6 | **Missing CN/HK stocks + ADRs excluded** | Both `build_universe.us_exchange_map()` and `expand_universe.us_reference()` query Polygon `type=CS` only; all ~377 ADRs are `type=ADRC` → structurally excluded (NIO/TSM/BIDU/LI/XPEV absent; BABA/JD/PDD are fragile manual injections). HK capped ~522 by akshare turnover (HKEX ~2,600); CN capped at macro store 1,494 (A-shares ~5,400) | **High (ADR) / Med (long tail)** | CS-only pipeline |
| 7 | **Terminal ↔ Macro "duplication"** | **REFUTED as a dollars problem.** `/etc/macro-live.env` empty (`polygon_key:False`); macro-live runs free Yahoo spark over ~9 names, builds risk-STATE not quotes; Terminal doesn't read overlay.json. Real overlap = duplicated *engineering* + **price divergence** (delayed-Polygon SPY vs Yahoo SPY) | **Medium** | fully decoupled |
| 8 | **"Budget TradingView" feel** | Renderer IS TV's open-source lightweight-charts — *not* the problem. Deficits: ~10 indicators vs 100+, ~9 drawings vs 80+, 4 chart types vs 17, micro-polish | **Medium** | pillars exist, depth capped |
| 9 | **Symbol/timeframe switch feels janky** | `ChartPanel.tsx:96-104,417` calls `chart.remove()` + `createChart()` on **every** dep change (symbol, TF, indicator toggle, every replay frame) → flash/reflow/re-fetch | **Med/High** | full remount each change |
| 10 | **Data files uncached at the edge** *(surfaced)* | Caddy vhost sends no `Cache-Control`; 568KB manifest + every OHLC/slice/intel revalidates on every load + switch (`public,max-age=0`) | **Critical (latency)** | no edge cache |
| 11 | **Public-app display licensing** *(the real US blocker)* | Public/no-login → every visitor a pro subscriber; per-pro-subscriber SIP display fees vendor-agnostic + uncapped | **Critical (cost gate)** | not addressed |
| 12 | **Canada `.TO` unhandled + likely broken chart** *(surfaced)* | `classify()` has no `.TO` branch → falls to `us` → `fetchQuote` null + Polygon gets a raw `.TO` ticker (wrong TSX symbology); ~219 names | **Low/Med** | unhandled |
| 13 | **515 orphan OHLC files / manifest-disk drift** *(surfaced)* | 5,739 OHLC on disk vs 5,261 in manifest; 897MB data dir | **Low** | no GC pass |

---

## 3. Solution Options per Problem

*(S/M/L/XL effort; $ = monthly; ★ = recommended. Verifier corrections applied.)*

**P1/P2 US live quotes & entitlement**
- **A — Delayed-AM WS bridge (S, $0):** consume the *entitled* `delayed.polygon.io AM.*` so US headers move on a 15-min cadence instead of frozen EOD, honestly badged. *Band-aid for realness, durable as a fallback tier.*
- **★ C — Databento US Equities Mini behind a fan-out hub + identity gate (XL, $ usage-metered):** the only license-clean path to genuine real-time US across the universe. **Alpaca is refuted** (redistribution-illegal — a login gate does not cure it). Databento Mini/DBEQ carries an explicit derived-redistribution/display license with no per-user exchange fees; it is composite BBO top-of-book and usage-metered, so **scope to a flagship/subscribed subset**, not a 5,000-symbol firehose. *Durable.*

**P3 Crypto live**
- **★ One server-side keyless exchange WS relay → SSE/WS fan-out (M, $0):** Coinbase/OKX/Kraken public ticker for the 4 majors (Macro already has `okx.py`/`coinbase.py` plumbing); in-memory last-price; `/api/crypto/stream`. Sub-second live. *Durable — the seed of the shared hub.* Redistribution nuance: exchange ToUs are internal-use-leaning → treat as accepted-risk internal-use and label; Coinbase/Kraken are the conservative US choices (Binance.com is US-geo-blocked).

**P4 Signal lag** — see §5. **★ Fast flagship-37 `*/5` cron (S, $0)** + **incremental only-changed broad regen (M, $0)**. Streaming-signal service refuted as premature.

**P5 HK live** — **★ real-time HK feed (M, $ low-hundreds; AllTick/Futu/Longport internal-use)** to replace delayed Tencent HK; or accept delayed-HK with an honest badge (S, $0) interim.

**P6 Universe / ADRs**
- **★ Polygon `type=ADRC` reference pass (S, $0):** ~377 ADRs + ~40 backfills within nightly budget; reconcile the manual BABA/JD/PDD injection so the pipeline owns them. *Durable.*
- **★ Raise CN cap via Tushare bulk daily bars (L, $0 if entitled):** import the ~3,900-name A-share long tail with real OHLC.
- Fix HK akshare code contamination + raise cap (M, $0). Gate ETFs (~5,204) behind a separate flag (they'd ~double the universe).

**P7 Consolidation** — see §4. **★ Sequenced:** crypto relay now → point Macro's `build_live_overlay` at the Terminal quote endpoint (kills price divergence, no new service) → full hub only when a real-time entitlement lands. **Never merge the signal/overlay layers.**

**P8/P9 TradingView parity** — see §6. **★ Fix the ChartPanel remount (S-M, $0)** is the top premium-feel win. **Migrating to the TV Charting Library is refuted as the next step** (XL, TV logo, rebuild data layer, discards Golden-Oracle + Pine engine).

**P10 Edge cache — ★ Caddy `Cache-Control` on `/data/*` (S, $0).** Short `max-age`/content-hash for the daily manifest (not `immutable`).

**P11 Licensing — ★ Identity/non-pro gate before showing real-time to anonymous visitors; serve delayed/EOD to the public tier.** Prerequisite for any US real-time.

**P12 Canada — ★ `.TO` branch in `classify()` + a TSX-capable source (S, $0).**

**P13 Orphans — ★ GC pass + manifest/disk reconciliation folded into the nightly build (S, $0).**

---

## 4. The Consolidation Architecture (the durable core)

**Target state: one server-side Quote-Hub that owns every upstream connection; Terminal + Macro + signals all read from it.**

```
        ┌──────────────────────── QUOTE-HUB (own systemd unit on the VPS) ────────────────────────┐
 UPSTREAM (one persistent conn per venue, server-side only):
   • US equities/ETF  → Databento US Equities Mini (real-time, redistribution-licensed) [PHASE 3]
   • US/ETF fallback  → Polygon delayed AM (15-min) — cold-start / anonymous tier        [PHASE 1]
   • Crypto (4+)      → keyless exchange WS (Coinbase/OKX/Kraken)                         [PHASE 0]
   • China A-share    → Tencent qt.gtimg.cn (already real-time)                           [exists]
   • Hong Kong        → real-time HK vendor (AllTick/Futu) or delayed Tencent + badge     [PHASE 2]
   • Canada .TO       → TSX-capable vendor                                                [PHASE 2]

   IN-MEMORY / REDIS last-price map:  price:{sym} → {last, chg, basis(LIVE|15m|EOD), ts, source}

   FAN-OUT: ONE multiplexed WS/SSE endpoint; browsers subscribe BY VIEWPORT
            (only stream the ~30 symbols currently on screen — never 5,000)
   READ-THROUGH HTTP:  GET /quote?sym= , /intraday?sym=&tf=  (internal)
        └────────────────────────────────────────────────────────────────────────────────────────┘
              ▲                          ▲                                ▲
     Terminal /api/quote,      Macro build_live_overlay          Signal engine tail-bar
     /api/intraday (read hub)  (reads hub, drops direct Yahoo)   recompute (reads hub close)
```

**Design decisions:**
- **Terminal owns the hub** (has the key, the universe, the user traffic; Macro's need is a tiny ≤150-name overlay). Runs as its own systemd unit (not inside Next) so reconnection/backpressure are isolated.
- **Databento's role:** the **Mini/DBEQ** product is the license-clean US backbone (redistribution + display, no per-user exchange fee). It is **not** the existing `databento_tbbo.py` collector (OPRA-options-only, inert — stays in Macro for option-flow calibration). Scope Mini to a flagship/subscribed set (usage-metered).
- **Server-side fan-out is mandatory regardless of vendor.** Today's `lib/live.ts` opens `wss://socket.polygon.io` **from the browser** — leaks the key, multiplies per-subscriber cost by client count. One upstream socket → N browsers, viewport-scoped, is what makes "whole universe live" tractable.
- **The hub does NOT solve display licensing** — it caps per-connection cost, not per-human-viewer exchange fees. Hence the **identity/non-pro gate (P11)**: anonymous = delayed/EOD; attested non-pro logged-in = real-time.
- **Both apps read one price** → the SPY-divergence bug disappears. **Signals hang off the hub** (§5).
- **Sequencing:** build the hub *just-before/with* the real-time entitlement — **not before**. The **crypto relay is the zero-cost seed that proves the topology** first.

---

## 5. Signal-Engine Redesign

**Honest framing (verifier, high-confidence):** `confluence.py` is a **pure daily→3D-bar swing engine** (`compute_signals` consumes a close series only; `resample_sessions` takes the last close of each 3-session bucket). Closed 3D bars are **immutable**, so blanket intraday recompute of history is wasted. Only the **forming tail bar** can change — and even a **±20% forming-bar move flips a discrete BUY/SELL marker for just ~2 of 9 flagship names** (CB/CS need a fresh RSI-MACD crossover, heavily EMA-smoothed and sticky). What *does* move intraday is continuous **StochRSI k/d state and the 200d gate**. **So the deliverable is "live oscillator/gate state + occasional early crossover," NOT a stream of flipping signals.** A true intraday-timeframe engine is a *different engine* (new inputs) and is **out of scope**.

**Bottleneck correction (verifier):** the lane's "128.9 ms/symbol × 5,400 ≈ all of the 727s" is **not supported** — local re-measurement puts compute at ~12–42 ms/call, so `gen_slices_all`'s 727s is dominated by **I/O / JSON write / per-file overhead**, not the confluence math. **Re-benchmark on the VPS.** The main lever is **stop full-regen**, not "faster compute."

**The redesign (cheapest correct path, in order):**
1. **Fast flagship-37 tier** — a `*/5 1-21 * * 1-5` cron recomputes only the 37 rich-slice names (seconds of compute), mirroring the proven `macro-live` pattern. **S, $0, durable** (per-symbol independence verified — computing NVDA→AAPL→NVDA yields byte-identical frames).
2. **Incremental broad regen** — change nightly `gen_slices_all` from full-regen to **only symbols whose OHLC changed today** (mtime/hash), enabling 2–3×/day. **M, $0.** Guard: a big backfill trips the detector → falls back to full regen.
3. **Decouple OHLC-fetch from signal-compute** so signal reruns don't re-fetch the 1,494 China files (the 634s stage). **M, $0.**
4. **Tail-bar patch service** — recompute only the forming 3D/weekly/monthly bar using the live close from the **hub**, patch just the last marker into the cached slice. **M, $0 for delayed; needs the hub.**

**Refute:** the streaming/event-driven signal service (XL) — over-engineered for a daily-bar engine. **Do not buy real-time market data to justify signal cadence** — the signal only needs a daily/late-session close, already free.

---

## 6. TradingView-Parity Plan (ranked by ROI)

**Framing correction (verified locally):** the renderer **is** TV's own open-source lightweight-charts ^5.2.0 with hand-coded indicators — the "budget feel" is **not** the canvas.

**Cheap premium-feel wins first (≈1–2 weeks total, $0):**
1. **Fix the ChartPanel full-remount** → mount-once effect + `series.setData()`/incremental `addSeries`/`removeSeries`. Kills the flash/reflow/re-fetch on every symbol/TF/indicator/replay change. *The single biggest cheap "snappy/premium" win.* (S-M)
2. **Edge-cache `/data/*.json` at Caddy** (short max-age/content-hash) — the largest current latency source. Remove the double slice fetch; add client cache + prefetch + debounced search. (S)
3. **Live crypto via keyless WS behind fan-out** — flips the most-broken market to genuinely live. (M)
4. **Honest freshness labels (LIVE / 15-min / EOD)** — removes the biggest "fake" tell. (S)
5. **Typography / crosshair / label-chrome / dark-theme polish pass**; guaranteed 60fps pan/zoom. (S)

**Deep items later (only on explicit demand):**
6. Expand indicators/drawings/chart types **incrementally on lightweight-charts** (keeps brand independence, small bundle, Golden-Oracle intact).
7. Extend the real Pine engine (`lib/pine-engine/`) toward more of `ta.*` — a *moderate subset*, not full v6.

**Explicitly do NOT:**
- **Do NOT migrate to the TradingView Charting Library now** (XL, TV logo, rebuild the entire data layer against the Datafeed API, discard the working Golden-Oracle markers + client-side Pine engine). It buys breadth users have not asked for to fix a liveness+polish problem — wrong layer.
- **Do NOT** treat "more indicators" as the premium metric — breadth is a vanity number here.

---

## 7. Phased Plan

Each phase ships user-facing value and de-risks the next. **Free-tier path (Phases 0–2) ≈ $0/mo.**

### Phase 0 — Free quick wins (~1 week, $0)
- **Scope:** Caddy edge-cache `/data/*` + remove double slice (P10); fix ChartPanel remount (P9); live crypto via keyless WS behind a minimal SSE relay (P3 — *the hub seed*); fast flagship-37 `*/5` signal cron (P4); honest LIVE/15m/EOD badges; `.TO` branch (P12); GC the 515 orphans (P13); Polygon `type=ADRC` pass (P6).
- **Effort:** S-M. **Cost:** $0. **Risk:** low (ChartPanel refactor is the only real risk — gate behind tests; crypto relay must be server-side fan-out).
- **Outcome:** app *feels* materially snappier, crypto goes genuinely live, watched-name signals refresh every 5 min, US ADRs appear, delayed data stops lying about being live.

### Phase 1 — Consolidation seed + delayed-US realness (~1–2 weeks, $0)
- **Scope:** promote the crypto relay into a small **Quote-Hub** (in-memory/Redis last-price map, viewport fan-out); wire entitled **Polygon delayed-AM WS** so US/ETF headers move on 15-min (P1a); point Macro's `build_live_overlay` at the hub to **kill the SPY divergence** (P7); incremental only-changed broad regen + decouple OHLC-fetch (P4).
- **Effort:** M-L. **Cost:** $0. **Risk:** medium (always-on process ops; Macro cross-repo coupling).
- **Outcome:** one price everywhere; US headers animate (honestly labeled 15-min); broad signals 2–3×/day; the durable backbone exists with a free feed behind it.

### Phase 2 — Coverage + regional live (~2–3 weeks, low $)
- **Scope:** CN long-tail via **Tushare bulk** (P6) + HK akshare de-contamination/cap raise; **real-time HK feed** into the hub (P5); TSX source for Canada; premium-polish pass; incremental sharded nightly build so the bigger universe stays under cron budget.
- **Effort:** L. **Cost:** $0 (Tushare) + low-hundreds/mo (HK real-time, if licensed). **Risk:** medium (build-time/manifest-size growth; akshare fragility).
- **Outcome:** comprehensive CN/HK coverage, HK actually live, Canada functional, visibly premium chrome.

### Phase 3 — Durable real-time rebuild (weeks, $$, deliberate)
- **Scope:** procure **Databento US Equities Mini/DBEQ** (redistribution-licensed) scoped to flagship/subscribed; build the **identity/non-pro gate** (P11) so anonymous = delayed, attested = real-time; full Redis-backed hub with subscription bookkeeping; tail-bar signal patch reading real-time closes.
- **Effort:** XL. **Cost:** $ usage-metered + gate/build. **Risk:** high (usage-metered billing — cap by symbol set; licensing correctness).
- **Outcome:** genuine real-time US on the watched/subscribed universe, license-clean, on the shared backbone — without the unbounded public-SIP exposure.

---

## 8. Costs & Risks Summary

| Component | Free-tier path | Premium path |
|---|---|---|
| Crypto real-time | **$0** (keyless exchange WS) | $0 |
| CN A-share real-time | **$0** (Tencent) | $0 |
| CN long-tail OHLC | **$0** (Tushare, if entitled) | $0 |
| US equities | **$0** (15-min delayed Polygon, labeled) | **$ usage-metered** (Databento Mini/DBEQ, flagship-scoped) — *not Alpaca* |
| HK real-time | $0 (delayed Tencent + badge) | **~low-hundreds/mo** (AllTick/Futu, internal-use) |
| Hub infra | **$0** (existing VPS + optional Redis) | $0 |
| **Total** | **≈ $0/mo** | **low-hundreds/mo + usage-metered US** — far below the $10k+ naive public-SIP figure |

> **Cost verdict:** the lanes' "$99–150/mo" is **not achievable as described** (it rested on the illegal Alpaca pick). The honest premium range is higher and usage-metered, still well under $10k. A naive uncapped public real-time US SIP feed is effectively **unbounded**.

**Top 5 risks**
1. **Licensing (P11) is the real gate, not price.** Ship the identity gate *before* any real-time US display, or exposure is unbounded.
2. **Wrong-vendor procurement.** Alpaca is **refuted (redistribution-illegal)**. Use Databento Mini/DBEQ. Fix the ranking before anyone buys.
3. **Redistribution ambiguity on "free" legs.** Coinbase ToU forbids third-party display; Tencent CN/HK is unofficial. Accepted-risk internal-use — decide the posture explicitly.
4. **VPS-only evidence.** Re-verify entitlement + `/etc/macro-live.env` + re-benchmark `gen_slices_all` on the box before committing spend/effort.
5. **Premature hub / over-engineering.** Building the full Redis hub or a streaming signal service *before* a real-time feed exists is infrastructure with nothing to carry. Sequence the hub with the entitlement; the crypto relay is the zero-cost proof.

---

## 9. Open Decisions for the Owner

1. **How "live" is live enough, and for whom?** Delayed-everywhere (honest labels, $0) vs real-time-for-logged-in-users (Databento Mini + gate, $$) vs real-time-for-all (unbounded — rejected). *Rec: delayed public tier + real-time gated tier.*
2. **Redistribution posture: internal-only vs public.** If truly internal, free Tencent/Coinbase/akshare "accepted-risk" sources are fine. If public-compliant, you need redistribution-licensed vendors — this drives cost and vendor choice more than anything else.
3. **US real-time vendor: Databento Mini/DBEQ (usage-metered, license-clean) — confirmed direction. Not Alpaca.** Fork is *scope*: flagship/subscribed subset vs broader.
4. **Charting library: stay on lightweight-charts (recommended) vs migrate to TV Charting Library.** Migration is XL, adds the TV logo, discards Golden-Oracle + Pine — only worth it if users explicitly demand the long-tail indicator/drawing surface.
5. **"Import ALL" ambition vs incremental cap-raises.** Full ~18–19k is an XL rearchitecture (build >60–75 min, manifest 556KB→2MB hurting client search, disk →2.8GB, needs a search API). *Rec: incremental (ADRC pass + Tushare CN + HK cap), not a wholesale "everything" project.*
6. **HK real-time now or later?** Pay low-hundreds/mo (AllTick/Futu, internal-use) to make HK genuinely live, or ship delayed-HK with an honest badge until demand justifies the spend.

---

## EXECUTION APPENDIX — Phase 0+1 BUILT & DEPLOYED 2026-07-02/03

*Fable-orchestrated: 5-designer workflow + coherence judge (`BUILD-SPEC.md`, 10 rulings) → 6 implementers (opus/sonnet/haiku) → 3 adversarial reviewers → fix pass → batched deploy with command-level verification. All Phase 0 + Phase 1 items shipped at $0.*

| Item | Status | Proof |
|---|---|---|
| Live crypto (P3) | ✅ Coinbase WS via Quote-Hub; `basis:LIVE`; price moves between polls; manifest crypto rows now live 24/7 (5-min cron) | BTC 61,470→61,475 across checks vs ~20h-stale before |
| Quote-Hub seed (P7 target-state) | ✅ `quote-hub.service`, loopback :3100, `/quotes` batch, LRU-500 delayed-AM subs, hub-down→EOD fallback invariant | `/health` ok; kill-switches; no key leaks |
| US realness (P1a) | ✅ Delayed-AM through the hub; headers tick **incl. after-hours**; placeholder carries manifest day-chg (fixed post-review) | AAPL 308.06 +4.65% DELAYED_15M post-close |
| Honest badges | ✅ 3-way LIVE/15-min/EOD from `quote.basis`, en+zh | bundle-verified |
| ChartPanel remount (P9) | ✅ Six-effect refactor; exactly one `createChart`; view preserved on indicator toggle; 2 review MAJORs fixed; tsc-gated | `grep -c createChart == 1`; runtime visual smoke by owner advised |
| Edge cache (P10) | ✅ Caddy `/data/*` headers (defer-form; double-header gotcha fixed); EdgeOne now caches (RefreshHit) | ⚠ full TTL Hits need an owner EdgeOne-console rule |
| Fast signals (P4) | ✅ `fast_flagship` `*/5` cron: tail-bar patch of the 37, backtest preserved, `state.forming`, RMW manifest merge, flock vs nightly | 4 patched/0.5s per tick; idempotent |
| `--changed-only` slices (P4) | ✅ shipped (nightly stays full-regen for now) | — |
| ADR import (P6) | ✅ CS∪ADRC reference (+sentinel), +376 ADRs, OHLC+slices backfilled | NIO/TSM/BIDU/LI/XPEV live end-to-end; manifest 5,264→5,640 |
| `.TO` fix (P12) | ✅ `ca` market; no Polygon garbage | SHOP.TO → `quote:null` |
| Orphan GC (P13) | ✅ 536 archived reversibly (`_gc_manifest.json`); market-filter bug found & fixed | matches empirical count exactly |
| Confluence API gate | ✅ Box = 3-arg anchored API; capability probe selects it (local repo carries a different single-arg lineage — do not conflate) | VPS `inspect.signature` |

**Not done (unchanged from plan):** Phase 3 procurement (Databento Mini + identity gate), HK real-time vendor, CN long-tail import, EdgeOne console cache rule (owner-only), Macro `build_live_overlay`→hub pointing (deferred: zero-dollar duplication confirmed; wire when convenient). Backups: `/opt/terminal/_backups/tvparity-20260702-224036/`, `orphans-20260702T225450Z/`.

---

## Relevant paths (VPS is canonical — local repo is stale)

- **Quote/chart engine:** `/opt/terminal/terminal/lib/intradaySources.ts`, `lib/live.ts`, `app/api/quote/route.ts`, `app/api/intraday/route.ts`, `components/TerminalShell.tsx` (:269 quote tiers, :210 poll), `components/ChartPanel.tsx` (:96-104,417 remount)
- **Signal engine:** `signal_layer/confluence.py` (:144-157, :161); VPS `/opt/terminal/ingest/gen_slices_all.py`, `/usr/local/bin/terminal-data`
- **Universe:** `/opt/terminal/ingest/build_universe.py`, `expand_universe.py`; flagship META `ingest/build_polygon_universe.py`
- **Consolidation:** `/opt/macro/scripts/build_live_overlay.py`, `engine/live_quotes.py`, `collectors/{okx,coinbase,databento_tbbo}.py`, `/etc/macro-live.env`, `/etc/caddy/Caddyfile`
- **Data:** `/opt/terminal/terminal/public/data/manifest.json` (as_of 2026-07-01, 5,261 symbols)
