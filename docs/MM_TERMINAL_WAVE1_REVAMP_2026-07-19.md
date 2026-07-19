# Mastermind Terminal — Wave 1 Production Revamp (2026-07-19)

Program: full-scale audit → design v6 → build. Operator order: Fable orchestrates + designs,
Opus reviews + builds; no Sonnet anywhere in the design/build path. This doc is the canonical
Wave-1 spec; the 13-lane audit evidence lives in the session archive (per-lane JSON was staged
at /tmp/mm-audit/ during the build).

Companion assessment: `docs/MASTERMIND_TERMINAL_PRODUCTION_COMPETITIVE_ASSESSMENT_2026-07-18.md`
(Codex, product/platform scope). This wave executes the UI/UX + P0-bug slice plus the
performance backbone; it deliberately defers the five-workspace IA re-org, the market-data
plane, alerts delivery, and Strategy Lab.

## Audit verdict (13 opus lanes, all returned)

1. **Options crash (P0)** — stale-chunk-after-deploy: `/flow` HTML is served with
   `s-maxage=300, stale-while-revalidate=600` (next.config.ts:106) while
   `scripts/deploy_terminal.sh` retains only ONE prior build and the swap purges all old
   content-hashed chunks. Old documents then resolve lazy tabs against missing factories →
   Turbopack "module factory is not available". NOT a module-graph bug (verified: dynamic
   imports of FlowDeskView/GexDeskView/PrismView/ProphetView are clean). The vanished
   logo/menu has TWO causes: (a) during a crash, chrome lives INSIDE OptionsHubView so the
   route error boundary replaces chrome + content together; (b) — found in live verification,
   missed by the audit — a DETERMINISTIC layout bug: `.obs-ambient > *` (observatory.css:31)
   cancels `position:fixed` on MobileNav's drawer/scrim at equal specificity in a later
   sheet, so they join the `.app2` grid auto-placement and push `.topbar` into the bottom
   28px status row on every /flow visit. Fixed by restoring the fixed pieces + pinning the
   chrome grid cells explicitly (observatory.css, after the offending rule). (b) is the
   everyday "logo/menu disappeared" the operator reported; (a) is the crash-day variant.
2. **Insider Power (P0, wrong-answer)** — scoring lives in the **Macro Dashboard repo**
   (`engine/insider_power.py`): `score = 50 + 50·tanh(2·balance)` saturates to ~0 for any
   sell-only tape, and confidence gates on `sellers≥3` alone → routine equity-comp selling
   reads "Very bearish / SELL SIGNAL — High Confidence" (reproduced on AAPL fixture: 3/100,
   7 sellers / 0 buyers, last trade 8 months old). Tests currently ASSERT the buggy behavior.
3. **Seasonality** — defaults to ALL listed years (30+ spaghetti lines on long-history names);
   `MAX_YEARS = 8` exists but is wired to nothing; all aggregates silently include pre-2010
   regimes.
4. **Fundamentals viz** — Capital Structure reuses a sign-colored Waterfall (meaningless here,
   and theme-flipping under east red-up), legend dots contradict bar colors, no inline values,
   "Enterprise value" truncates. Color-law violations in OverviewPage/RevenuePage/StatisticsPage.
5. **Analyst pane** — false "No analyst coverage" during load, sell bars painted neutral grey,
   estimate columns indistinguishable from actuals, misleading statement toggle.
6. **Design system** — solid v5 skeleton (TV's exact brand blue, near-black stack, tabular-nums)
   undermined by: ~25 ad-hoc font sizes across 6 weights, un-animatable hard-edged conic
   gauges (the "retro odometers"), two disconnected border/elevation languages (opaque shell
   hairlines vs .obs alpha glass), no easing token, ~55+ hardcoded directional colors, and six
   mutually inconsistent tooltip systems (190 native `title=` on the chart toolbar alone).
7. **Pine engine** — synchronous main-thread interpreter; replay auto-play re-parses+re-runs
   every script every tick (O(N²) + DOM churn); every run parses source twice; diagnostics
   (parse + 130-bar dry run) on the UI thread; plots freeze on live ticks; `plot()` drops na
   instead of whitespace; strategy/table/label/line calls silently no-op.
8. **Chart smoothness** — SVG overlays destroyed+rebuilt per crosshair/range event with an
   O(daily²) gap-zone recompute inside the hot path; 6s quote poll allocates fresh state
   unconditionally (re-renders the whole pane grid); zero React.memo; drawing pointermove does
   full rebuilds with no rAF batching.
9. **Nav/IA** — chrome hand-duplicated across 8+ view components (AdminView drops MobileNav,
   RouteSkeleton drops it during transitions); FlowView.tsx is 684 dead lines; five-workspace
   IA re-org deferred by design.
10. **DataBento readiness** — the display-epoch timestamp fiction is load-bearing across the
    intraday stack; Bar6 has no source/venue/session fields; browser-side Polygon WS
    (`lib/live.ts`) is a key-exposure/licensing liability; no 1s support anywhere. Wave 1
    ships the integration design doc + kills live.ts; the epoch migration is its own wave.
11. **Dead affordances** — Bar Replay fully built but unreachable; Alt+R advertised as
    Rectangle but resets the chart (+5 phantom shortcuts); plus-button toggle dispatches an
    event nobody listens to; drawing Lock disabled forever.
12. **Tooltips** — no shared primitive; six systems, three glass styles, two delays, no
    warm-open, two implementations clip at viewport edges.
13. **Quality gates** — typecheck + 263 vitest GREEN on master (keep them green); lint
    abandoned (581 errors, ungated); fin pages/ChartPanel/OptionsHubView have zero coverage;
    five orphaned custom-runner tests run in no gate.

## Design language v6 (surgical evolution of locked v5 — additive, no rewrite)

Keep: brand `#2962ff`, the near-black panel stack, Inter + JetBrains Mono, 4/6/8 radii,
directional-color law (`--up`/`--down` only, east-flip safe), frosted `--pop-*` glass.

Add to `:root` (tokens; `.obs` layer keeps working untouched):

```css
--ease-out: cubic-bezier(.22,1,.36,1);   /* THE easing. Pair with --t-fast/--t-med. */
--t-fast: 120ms; --t-med: 200ms; --t-slow: 320ms;
--hairline: rgba(255,255,255,.08);       /* unify borders toward alpha hairlines */
--hairline-strong: rgba(255,255,255,.14);
--fs-micro:10px; --fs-label:11px; --fs-ui:12.5px; --fs-body:13px;
--fs-emph:14px; --fs-title:16px; --fs-num:20px; --fs-num-lg:28px;
```

Laws for every surface this wave touches (do not mass-migrate untouched files):
- **Type**: numerals always `var(--font-num)` + tabular; uppercase micro-labels
  10–11px/600/+0.08em `var(--muted)`; dense tables 12.5px with −0.01em; no new half-pixel
  sizes; max two weights per component (450/650 preferred).
- **Motion**: every interactive surface transitions `background,color,border-color,transform`
  at `var(--t-fast) var(--ease-out)`; data draws in at `var(--t-slow)` (bars grow, arcs sweep,
  ≤20ms stagger); `prefers-reduced-motion` kills all of it.
- **Color**: semantic tokens only. Directional = `--up/--down`. Composition/structure charts
  NEVER use directional tokens (that was the capital-structure bug). Accents: `--brand`
  (interactive), `--signal` (attention, non-directional), `--warn`.
- **Borders**: new/touched surfaces use `--hairline`; elevation = alpha steps + `--pop-shadow`,
  never brighter opaque greys.

### New primitives (contracts)

**ArcGauge** (`terminal/components/ui/ArcGauge.tsx`) — replaces every speedometer/rainbow/
hard-edged conic. SVG arc, 240° sweep, `stroke-linecap="round"`; track
`rgba(255,255,255,.07)`; progress in ONE state color (`bull|bear|warn|neutral` →
`--up/--down/--signal/--text-2`), subtle glow (drop-shadow 30% of state color); center value
`var(--font-num)` 650 tabular; animated sweep 600ms `var(--ease-out)` on mount/value change
(CSS transition on stroke-dashoffset; `@property` not required). Props:
`{ value: 0–100, state, size?: number, label?: string, sublabel?: string, showValue?: boolean }`.
NEVER a red→green gradient: the STATE picks one color; neutral is grey — "no signal" must
look like no signal.

**Tip** (`terminal/components/ui/Tip.tsx` + globals.css block) — the one tooltip.
`{ label: ReactNode, side?: 'top'|'bottom'|'left'|'right', size?: 'mini'|'card',
shortcut?: string, children: trigger }`. Fixed-position portal, measured flip+clamp at
viewport edges, open delay 120ms with **warm-open** (module-level timestamp: if any Tip
closed <300ms ago, next opens at 0ms — the TradingView feel), close instant; glass from
`--pop-*` tokens; mini = 11.5px/600 single line + optional `.ds-kbd` shortcut chip; card =
12.5px, max-width 280px, may contain rows. Never used for content that belongs inline.

### Surface specs

**Insider pane** (display; engine fix ships separately in the Macro repo):
- Kill the speedometer. Header = verdict chip + one plain-word sentence + evidence strip
  (`Buyers · Sellers · Net · Window · Last trade (age)`, mono values).
- Verdict states: `NO SIGNAL — routine selling only` (grey), `BEARISH TILT` / `BEARISH
  CLUSTER` (down), `BULLISH — insider buying` (up), driven by new engine fields
  (`signal`, `routine_only`, `posture_reason`). Until v2 payloads bake, a display-side shim
  may DE-ESCALATE only: `buyers === 0 && score < 40 && no v2 fields` → render the NO SIGNAL
  state (never escalate client-side; scoring stays engine-owned).
- ArcGauge (neutral/grey when routine_only) as secondary evidence, not the headline.
- Buy/sell volume chart: bars `--up/--down` at 70% alpha, 3px radius; price line
  `--text-2` 1.25px; 10px muted axis labels; Tip card hover (month, buy $, sell $, price).
- Trades table: tinted type pills (12% bg, no solid fills), value column mono
  right-aligned, age-aware date dimming.

**Capital structure** (purpose-built bridge in FinCharts, drop the Waterfall reuse):
horizontal composition rows — `Market cap` (brand 60%), `+ Debt` (warn 55%), `− Cash`
(outline notch), `= Enterprise value` (brand solid) — inline mono values on every bar, full
labels left (never truncated), dotted `--hairline-strong` connectors, explainer line
`EV = market cap + debt − cash` in muted 11px. No y-axis, no directional tokens, no legend.

**Seasonality**: default window = last **10 complete years** + current YTD; segmented
`[5Y | 10Y | 15Y | Max]` persisted at `mm.seas.win`; mean path 2px brand + soft area fill;
individual years 1px at 22% alpha, hover/legend-click to highlight; current year 1.5px
`--signal`; legend collapses past 12 years into a "N years" chip + popover; monthly
median/hit-rate strip under the chart; Table view capped to window (expander for all);
ALL AdvancedSeasonality aggregates compute over the selected window only; fix the January
return definition (prior-Dec-close → Jan-close, consistent with other months).

**Analyst/Forecast**: load skeleton (kill the false "No analyst coverage" flash); sell /
strong-sell distribution bars in `--down` tints (28%/45%); distribution scaled to TOTAL;
estimate-only columns get a 45° SVG-pattern hatch + "E" suffix; statement toggle moves
under the chart it actually controls; add target-range band (low—mean—high horizontal band
with current-price marker); surface `estimates.growth` YoY chips and `eps_q` forward strip.

## Build lanes (all Opus; design lanes via `designer`)

| Lane | Files (ownership is exclusive) | Content |
|---|---|---|
| INFRA | next.config.ts, scripts/deploy_terminal.sh, app/error.tsx, app/global-error.tsx, lib/live.ts (delete), app/api/intraday/route.ts (cache key) | deploymentId + chunk-generation retention (union prior `_next/static` post-swap, keep 3 gens), chunk-error auto-reload w/ sessionStorage guard, kill Polygon browser WS |
| SHELL | app/flow/layout.tsx (new), OptionsHubView.tsx (chrome strip), RouteSkeleton.tsx, AdminView.tsx, FlowView.tsx (delete), TerminalShell.tsx (replay enable, quote suppression, visibility pause, memo), DrawingSidebar.tsx, ChartFrameBar.tsx (dead controls) | persistent chrome, wire Bar Replay, honest/dead-control cleanup |
| TOKENS (designer) | globals.css (additive v6), observatory.css (ring rebuild), ui/ArcGauge.tsx (new), ui/RingGauge.tsx (restyle in place), ui/Tip.tsx (new), AppNav.tsx (tip unify) | v6 tokens + primitives |
| FIN (designer) | fin/InsiderPage.tsx, fin/FinCharts.tsx, fin/OverviewPage.tsx, fin/RevenuePage.tsx, fin/StatisticsPage.tsx, fin/ForecastPage.tsx, StockAnalysis.tsx, lib/fund.ts (Insider type), fin.css | insider display, capital bridge, color-law fixes, analyst fixes |
| SEASONAL (designer, after FIN) | lib/seasonal.ts, fin/SeasonalsPage.tsx, fin/SeasonalsChart.tsx, fin/AdvancedSeasonality.tsx, SeasonalityCard.tsx (+ marked fin.css block) | window defaults + restyle |
| PINE | lib/pine-engine/* (+ new worker.ts, host.ts), PineEditor.tsx | Web Worker isolation w/ cancellation + budget, AST cache by source hash, single parse, inline editor diagnostics |
| CHARTPANEL (after PINE+SHELL) | ChartPanel.tsx | pine-worker integration, replay O(N²) fix, live-tick pine re-run, overlay rAF/diff, gap-zone memo, pointermove rAF, Alt-shortcut reconciliation (Alt+R = Rectangle as advertised) |
| DATABENTO-DOC | docs/DATABENTO_INTEGRATION_DESIGN.md (new) | canonical UTC bar schema, hub adapter seam, 1s/1m/1h/d ladder, epoch-migration plan w/ per-source basis field |
| INSIDER-ENGINE (Macro repo) | engine/insider_power.py, tests/test_insider_power_signals.py (+ sync check on insider_power_signals.py / insider_factor.py) | neutral-by-default scoring v2 (below) |

### Insider scoring v2 (Macro repo `engine/insider_power.py`)

Principle: **absence of buys is not evidence of bearishness.** Routine, spread-out,
baseline-sized selling at an equity-comp company is the null state.

- Split gross into `gross_buy` / `gross_sell`. If `gross_buy ≈ 0`: score floors at 40
  (neutral band) and `signal = NEUTRAL` with `routine_only = true`, UNLESS the
  informative-sell bar clears.
- Informative-sell features (all computable from today's panel):
  **cluster** (≥3 distinct `rptownercik` selling within 30–45d),
  **into-weakness** (trans price below trailing reference / after a decline),
  **baseline exceedance** (z-score of monthly sell_usd vs the name's own trailing 12m),
  **top-exec participation** (CEO/CFO). Score may drop below the floor only when ≥2 fire;
  confidence High requires cluster + (baseline z or into-weakness).
- **Recency gate**: most recent open-market trade >90d old → confidence None, signal decays
  to NEUTRAL (a 2025 sell is not a 2026-07 signal).
- `insider_sell` boolean requires the informative bar (not score≤40); `insider_buy`
  unchanged. New payload fields: `signal`, `confidence`, `routine_only`, `posture_reason`
  (EN/ZH-safe plain words), `last_trade_age_d`. Keys are additive — existing consumers keep
  working; semantics only de-escalate (house epistemics law).
- Tests: REPLACE the two assertions encoding the bug (pure-sell → score<50 / insider_sell
  fires) with: routine pure-sell → score≈45–50, NEUTRAL, `insider_sell=False`; clustered
  top-exec selling into a decline → score<40, `insider_sell=True`, confidence High; stale
  tape → confidence None.
- Follow-up (NOT this wave): extend `collectors/sec_insider.py` panel with post-transaction
  holdings + 10b5-1 plan flag (slow SEC-paced backfill), then add magnitude-vs-holdings and
  planned/discretionary splits.

## Deferred (explicitly out of Wave 1)

Five-workspace IA re-org · DataBento implementation (doc only) + display-epoch migration ·
alert delivery platform · Strategy Lab · full 55-site directional-color migration (only
touched files migrate) · full `title=` → Tip migration beyond toolbar/nav/gauges · lint-debt
payoff (new/touched code must be clean; the 581 legacy errors are a separate sweep) ·
insider panel backfill (holdings/10b5-1) · fin-page test scaffolding beyond the smoke tests
this wave adds.

## Verification gates for this wave

`npx tsc --noEmit` clean · `npm test` (vitest, 263+) green · new smoke tests for ArcGauge/
Tip/seasonal window/capital bridge · orphaned .mjs custom-runner tests still pass ·
dev-server visual pass on: /terminal (chart + replay), AAPL Insider / Seasonal / Statistics /
Analyst panes, /flow all tabs, mobile 390px spot-check · east red-up flip spot-check on every
touched directional surface.
