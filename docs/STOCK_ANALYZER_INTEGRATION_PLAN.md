# Stock Analyzer ⇄ Mastermind Terminal — Integration Plan

**Status:** SPEC ONLY — nothing built. For review before implementation.
**Date:** 2026-06-28
**Spans two repos:** `Macro Dashboard` (analyzer, public static site) and `charting-app/terminal` (Next.js Terminal SaaS).

---

## 1. The goal, restated

When a user finds a stock on the macro dashboard, they can jump into the Terminal and see that
stock's **full intelligence** (signals, AI judgment, conviction, GEX, analyst, etc.) **alongside the
big chart — without the data covering the chart.** Conversely, the analyzer page keeps a clean,
beautiful read-only chart and a "Full Chart →" button that hands off to the Terminal.

This is **not an either/or.** Direction A (rich data in the Terminal) and Direction B (polished
analyzer chart + handoff button) are two ends of one flow joined by a single button. We build both,
phased. Direction B ships first (low risk, macro-repo-only); Direction A is the bigger payoff.

---

## 2. What already exists (so we extend, not rebuild)

### Terminal (`charting-app/terminal`)
- **Engine:** Lightweight Charts v5 in `components/ChartPanel.tsx` — candles/heikin/bars/line/area,
  EMA·BB·VWAP overlays, RSI·StochRSI·MACD·Volume panes, on-chart BUY/SELL markers, bar replay.
- **Right rail:** `TerminalShell.tsx` → `<aside className="rail">` with tabs `Watchlist | Details | Signals`.
  - `Details` tab = manifest card (OHLC/52w/regime) + **Golden Oracle** WR/PF/CAGR + `SeasonalityCard` + "Ask Mastermind AI".
  - `Signals` tab = **stub** (not implemented).
- **Top stats bar:** Last / 24h Change / Volume / Day High / Day Low.
- **Search:** `SearchModal` via `+` / type-anywhere / ⌘K.
- **AI:** `CopilotPanel` slide-over (deterministic verdict+regime+backtest read).
- **Routing in:** `/terminal?sym=<SYM>` → `searchParams.sym` → `initialSymbol` → `TerminalShell`.
  `initialSymbol` is honored even if the symbol isn't in the user's watchlist.
- **Data layer:** `terminal/public/data/<SYM>.json` (OHLC bars) + `<SYM>.slice.json` (signals/state) +
  `manifest.json` (per-symbol summary). Built by `ingest/build_polygon_universe.py` over a **34-symbol** universe,
  reusing the Macro Dashboard `.venv` + Polygon key.
- **Auth:** `proxy.ts` guards `/terminal`. Supabase + Pro gating (`is_pro`).

### Analyzer (`Macro Dashboard/site`)
- `stock.html` — hash-routed SPA (`stock.html#AAPL`), hydrates ~12 panels from **one file per ticker**:
  `stockdata/<ticker>.json` (1,681 tickers). Chart via `window.StockChart.mount(box, ticker, opts)` in
  `chart.js` (LWC v5), markers from `site/signals/<T>.json` (the §7 contract).
- `stockdata/<ticker>.json` top-level keys (the intelligence we want to surface):
  `tech, cycle, mtf, ladder, alerts, anticipation, profile, valuation, financials, factors,
  positioning, analyst, earnings, accounting_quality, fund_flows, alpha, smart_money, vol_squeeze,
  gex, gex_confirm, revisions, basket_alloc, conviction, risk_sizing, composite, entry_signal,
  macro_sensitivity, altdata, dt_contra, view`.

**Implication:** the analyzer's `stockdata/<ticker>.json` is already the data contract. The Terminal
rail re-skins it; it does **not** recompute anything.

---

## 3. Interface design (the "don't cover the chart" answer)

Principle: **resize, don't overlay.** A drawer floating over the chart violates the rule. A rail the
chart *reflows around* (LWC resizes natively) does not. Three layers, mapped onto existing structure:

1. **Signal tape — always visible, zero chart pixels.** Extend the existing top stats bar (or a thin
   strip beneath it) with headline chips: **AI lean** (`view`/`conviction`), **MTF** (`mtf`),
   **Conviction** (`conviction.score`), **Regime** (`ladder.regime_label`), **GEX magnet**
   (`gex.call_wall`/`gamma_flip`), **Short %** (`positioning.short`). This is the at-a-glance read for
   90% of sessions and costs no chart space.

2. **Intelligence rail — collapsible, resizes the chart.** Reuse `<aside className="rail">`.
   - Rename/extend tabs → `Watchlist | Intel | Signals` (add `Intel`; flesh out `Signals`).
   - `Intel` = stacked cards from `<SYM>.intel.json`: AI judgment (`view`/`conviction`), conviction
     bars (`conviction.drivers`), key levels (`tech`/`gex`), analyst & estimates (`analyst`/`earnings`/`revisions`),
     options/dealer-gamma (`gex`/`gex_confirm`), factors (`factors`), smart money (`smart_money`/`fund_flows`).
   - Add a **collapse/expand control**: collapse → chart goes full-bleed; expand → ~320px (today's width);
     **"Expand ⤢"** → wide "Analyze" mode (~520px or a max-width drawer) for the full deep-dive, with the
     chart reflowing narrower (never covered). This is the exact interaction in the prototype.
   - Tabs are how 12 panels fit a narrow rail — one focused card-stack at a time, scrollable.

3. **Rail ⇄ chart wiring (Phase 3, the "cool" layer).** The rail isn't a table *next to* a chart — it
   *annotates* it. Reuse `createSeriesMarkers` + the planned overlay engine (HANDOFF §7.1):
   - Key levels / GEX magnet / call & put walls (`gex`) → horizontal lines on the chart.
   - Analyst target (`analyst.target`) → a target line.
   - Dated events (AI-lean flips, §7 buy/sell/cut/rebuy markers) → pins on the candles.
   - Clicking a rail item highlights/scrolls the chart to it.

---

## 4. Data bridge — the `intel/v1` contract (the core new plumbing)

The Terminal must not couple to every macro field. Define a **stable, namespaced subset** so the macro
schema can evolve without breaking the rail.

- **New builder:** `ingest/pull_macro_intel.py` (sibling to `build_polygon_universe.py`, same venv).
  - Reads `../Macro Dashboard/site/stockdata/<SYM>.json` (same machine, no network/CORS).
  - Maps → a trimmed, versioned `intel/v1` object (only the fields the rail renders; drop the heavy/raw
    sub-trees like `financials.raw`).
  - Writes `terminal/public/data/<SYM>.intel.json` — same pattern as the existing `.slice.json`.
- **Terminal fetch:** `ChartPanel`/rail already fetch `/data/<symbol>.json` + `.slice.json`; add
  `/data/<symbol>.intel.json` (graceful null if absent — intel is enrichment, chart stands alone).
- **Contract location:** add `intel/v1` to `signal_layer/contracts.py` (where `mastermind.indicator/v1`
  and `model_slice` already live) so producer + consumer share one definition. This realizes the
  "publish-then-pull" flow flagged as deferred in HANDOFF §7.6.

### `intel/v1` shape (proposed)
```jsonc
{
  "schema": "intel/v1",
  "ticker": "AAPL",
  "asof": "2026-06-27",
  "tape": {                      // the always-visible signal-tape chips
    "ai_lean": {"dir": "BULL", "score": 72},
    "mtf": {"up": 4, "n": 4},
    "conviction": 81,
    "regime": "Risk-on",
    "gex_magnet": 195.0,
    "short_pct": 3.1
  },
  "cards": {                     // the rail Intel tab, render-ready
    "ai_judgment": { ...subset of view/conviction... },
    "conviction":  { "score": 81, "drivers": [...], "cautions": [...] },
    "levels":      { "support": 184.2, "resistance": 195.0, "target": 210 },
    "analyst":     { ...analyst/earnings/revisions... },
    "options_gex": { ...gex/gex_confirm... },
    "factors":     { ...factors... },
    "smart_money": { ...smart_money/fund_flows... }
  },
  "chart_overlays": {            // Phase 3 — what to draw on the chart
    "levels": [{"label": "GEX magnet", "price": 195.0, "kind": "gamma"}],
    "markers": [{"ts": "2026-05-12", "type": "AI_BULL", "text": "AI lean ▲"}]
  }
}
```

---

## 5. Routing & the auth handoff

- **Analyzer button → Terminal:** add to `stock.html` near the chart:
  - `Full Chart →` / `Open in Terminal ⤢` → `${TERMINAL_BASE}/terminal?sym=<TICKER>`
    (`TERMINAL_BASE` = `https://app.mastermind-x.com` prod / `http://localhost:3002` dev).
- **Terminal already accepts `?sym=`** and makes it `active` even outside the watchlist. ✅
- **Auth round-trip (important):** `/terminal` is guarded by `proxy.ts`. A signed-out user clicking the
  button hits `/login`. Ensure `proxy.ts` preserves the destination → `/login?next=/terminal?sym=AAPL`
  and redirects back post-login. Per the SaaS pivot, this gate is *desirable*: the public analyzer is the
  free top-of-funnel; "Open in Terminal" is the Pro upgrade hook. Spec: free users land on a teaser/paywall
  for the Terminal, Pro users land straight in.

---

## 6. The universe gap (must-solve prerequisite)

Terminal = 34 symbols; analyzer = 1,681. A handoff for a symbol the Terminal hasn't built shows
"No data" + "—". Options:

- **(A) Expand the build universe** to the macro `config.yml → stock_search` library (or a curated few
  hundred most-trafficked) and re-run `build_polygon_universe.py` + `pull_macro_intel.py`. Pro: simple,
  predictable. Con: `public/data` grows (OHLC × N); 1,681 full histories is sizable.
- **(B) Lazy / on-demand build:** an API route builds `<SYM>.json` + `.intel.json` on first request and
  caches. Pro: no bulk storage. Con: cold-start latency, needs the Python builder reachable at runtime.
- **Recommendation:** **(A) for the analyzed/most-trafficked universe** (covers the realistic handoff
  set) **+ (B) lazy fallback** for the long tail. Phase it: start by expanding to ~the S&P 500 +
  tracked ETFs (matches the analyzer's nightly library), measure data size, then decide on the tail.

---

## 7. Direction B — analyzer chart polish (macro-repo-only, ships first)

Keep `stock.html` as the research home; make its embedded chart a **clean, simple, beautiful read**, and
push "full charting" to the Terminal:

- In `chart.js`, define a lightweight default profile for the embed: **candles + EMA(20/50) + volume**,
  hide the MACD/StochRSI oscillator stack by default (those belong to the Terminal's full chart), tidy
  grid/axis/spacing, keep the §7 markers. The analyzer chart stays "garnish"; the Terminal is the lab.
- Add the **"Full Chart →"** button (§5). No Terminal changes required for this phase.
- Risk: near-zero, isolated to the macro repo, deploys via `site/**`.

---

## 8. Phasing, effort, risk

| Phase | Repo | What | Risk | Ships value |
|------|------|------|------|-------------|
| **0** | both | `intel/v1` contract in `contracts.py` + `pull_macro_intel.py` builder + universe expansion (§6A) | Med (data plumbing) | Enables everything |
| **1** | macro | Polish analyzer chart + "Full Chart →" button + auth round-trip (§5, §7) | Low | Immediate; standalone |
| **2** | terminal | Signal tape in top bar + `Intel` rail tab from `intel/v1` + collapsible/expand rail | Med | The core integration |
| **3** | terminal | Rail⇄chart wiring (levels/markers overlays), ⌘K parity, deep-link to a rail tab | Med-High (overlay engine) | The "cool" layer; shares HANDOFF §7.1 work |

Phase 1's button is the bridge to Phase 2, so Phase 1 is never throwaway. Phase 3 piggybacks on the
overlay engine the Terminal already plans to build (HANDOFF §7.1–7.2).

---

## 9. Open decisions for the user (before building)

1. **Universe strategy** — expand to S&P 500 + ETFs now, full 1,681, or lazy-on-demand? (§6)
2. **Gating** — is "Open in Terminal" a Pro upgrade hook (paywall for free users) or open to all? (§5)
3. **"Full analyze" view** — widen the existing rail to ~520px, or a separate max-width drawer? (§3.2)
4. **Doc home** — keep this plan here (`charting-app/docs/`, next to FEATURE_GAP_AUDIT) or mirror into
   the macro repo's `research/`?

---

## 10. Key files touched (when we build)

- **Macro:** `site/chart.js` (embed profile), `site/stock.html` (button), `config.yml` (universe list).
- **Terminal:** `signal_layer/contracts.py` (intel/v1), `ingest/pull_macro_intel.py` (new),
  `ingest/build_polygon_universe.py` (universe), `components/TerminalShell.tsx` (signal tape + rail tabs +
  collapse/expand), a new `components/IntelRail.tsx` (the card renderers), `components/ChartPanel.tsx`
  (Phase 3 overlays), `proxy.ts` (auth `next=` round-trip).
- ⚠️ Terminal gotcha (HANDOFF §8): appended `globals.css` rules need `rm -rf terminal/.next` to apply.
- ⚠️ `signal_layer/confluence.py` is the golden oracle — never edit.
