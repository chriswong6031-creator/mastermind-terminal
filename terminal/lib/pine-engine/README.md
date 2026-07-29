# Pine v6 execution engine

A focused, client-side TypeScript interpreter for Pine Script v6. It runs a user's pasted
script against the chart's real bar data (in-browser) and produces plot/marker/level series
that render on the Lightweight-Charts v5 chart — the "indicators actually run" feature the
terminal was missing. No server round-trip, no Python, no new runtime dependency.

## Why a custom interpreter (vs PineTS / server-side PyneCore)

- The candle data and the chart already live client-side (LWC v5). Running Pine in the same
  place means zero latency and direct control over how `plot()` maps to LWC series.
- The app deploys by rsync to a VPS; a Python service (PyneCore) would add a process to run,
  deploy, and keep in sync. Avoided.
- A bespoke interpreter keeps the bundle dependency-free and lets us map Pine semantics onto
  LWC primitives exactly (e.g. `plot.style_histogram` → per-bar-colored `HistogramSeries`,
  `plotshape` → `createSeriesMarkers`, `hline` → `createPriceLine`).

## Pipeline

```
source ──▶ lexer.ts ──▶ parser.ts ──▶ runtime.ts ──▶ { plots, shapes, hlines, inputs, warnings }
          (tokens +     (AST)         (bar-by-bar
           INDENT/DEDENT)              interpreter)
```

- **lexer.ts** — tokenizer with Python-style INDENT/DEDENT (function bodies & if/for blocks are
  indentation-delimited); newlines suppressed inside `()[]{}`.
- **parser.ts** — recursive-descent statements + precedence-climbing expressions. Call nodes get
  a stable id (keys `ta.*` per-call-site state); non-identifier index bases get a history id.
- **runtime.ts** — executes the AST once per bar. Series are per-bar arrays; `var` persists,
  `:=` reassigns, `expr[n]` reads history, user functions bind params as **aliases** to the
  caller's series so `_src[1]` inside a function reads the argument's real history. `ta.*` keep
  per-call-site state. Tolerant by design: unimplemented calls (tables, labels, fill, bgcolor…)
  are no-ops returning `na` so a large real-world script still runs and plots what it can. A
  request.security call to a **coarser** timeframe resamples the chart bars up to that TF, re-runs
  the whole script on the higher-TF series (one re-run per distinct TF, cached), and reads the
  requested expression off it — so MTF gates use real higher-TF values, not the chart TF.
- **builtins.ts** — constant namespaces (`color.*`, `shape.*`, `plot.style_*`, …), color→CSS
  conversion, `str.tostring` formatting, timeframe-seconds.
- **index.ts** — the split public surface: `compile(source) → { ok, errors, ast }` parses **once**
  and returns a reusable AST; `runCompiled(ast, bars, opts)` executes it with **no re-parse**;
  `runPine(source, bars, opts)` = compile+run (still one parse total); `compilePine(source)` is the
  parse-only editor check. (Historically `runPine` parsed, then `run` re-parsed — that double parse
  is gone; `run()` accepts a `ParseResult` directly.)
- **host-shared.ts** — side-effect-free helpers shared by the main thread and the worker:
  `hashSource()` (FNV-1a source hash = the AST-cache key / `astId`) and columnar `Bar` packing
  (`barsToColumns`/`columnsToBars`) for transferable worker payloads.
- **worker.ts** — the Web Worker entry (runs compile+execute off the UI thread; caches the AST per
  source hash worker-side so data-only re-runs skip parsing). See *Worker protocol* below.
- **host.ts** — `createPineHost()` — the integration API for ChartPanel + PineEditor: async
  `compile`/`run` over the worker with **cancellation/supersession** (per-`slot`), a **per-run wall
  budget** (terminate + auto-respawn on breach), and a **synchronous fallback** (`runPineSync`,
  `compilePineSync`) for SSR/tests/no-Worker environments.

## Worker protocol (host.ts ⇄ worker.ts)

The engine runs inside a terminateable `Web Worker` so a heavy or runaway script never blocks the UI
thread. `createPineHost()` returns a `PineHost` (a real worker host in the browser, a synchronous host
under SSR/tests where `hasWorker()` is false — same surface either way, so callers hold one reference).

Host API:

- `compile(source) → Promise<{ ok, errors[], astId }>` — parse once; the worker caches the AST under
  `astId` (= source hash). Editors call this on a debounce; a new compile supersedes the prior one.
- `run({ slot, source, astId?, bars, inputs?, opts?, budgetMs? }) → Promise<PineResult>` where
  `PineResult = { ok, errors[], result, cancelled?, budgetExceeded?, astId? }`:
  - **supersession** — a new `run` for the same `slot` (e.g. a scriptId) cancels any in-flight run
    for that slot; the superseded promise resolves `{ cancelled: true, result: null }` and its worker
    reply is dropped, so a stale result can never paint over a newer one.
  - **wall budget** — each run arms a timer (`budgetMs`, default 1500ms). On breach the host
    `terminate()`s the worker (real preemption — the cooperative in-engine budget can't stop a tight
    non-looping hot path) and auto-respawns; the run resolves `{ budgetExceeded: true }` + a runtime
    error. (A budget breach poisons the in-flight batch: every pending run resolves `budgetExceeded`
    because the terminated worker will never reply — the consumer simply re-runs.)
  - **transferable payload** — `bars` are packed to Float64Array columns (`o/h/l/c/v`) + an ISO-time
    `string[]`; the numeric buffers are transferred (zero-copy) to the worker, which rehydrates them.
  - `astId` lets the worker skip re-parsing on data-only re-runs; if the id isn't cached (a fresh
    worker after a respawn), the worker recompiles from `source` (always sent) and re-caches.
- `evict(source)` / `clear()` — drop one / all cached ASTs (e.g. on script delete).
- `dispose()` — terminate the worker and resolve every pending run as cancelled.

Wire message kinds: `→ compile / run / evict / clear`, `← compiled / ran`. The worker is
constructed with `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` (Turbopack
/ Next 16 bundles it to a worker chunk).

> **ChartPanel integration contract (for the consumer lane):** the na-gap fix (below) emits
> **whitespace points** `{ time }` (no `value`) for na bars on line/area/stepline/circles plots. To
> get the visual break, ChartPanel's `addPinePlot` must **pass those whitespace points through to
> `series.setData` for line-family series** instead of filtering them out — Lightweight-Charts breaks
> the line at a whitespace point. Histogram/columns/cross bars are still omitted (correct for discrete
> series). Valued points remain `{ time, value, color? }`.

## Coverage

✓ `indicator()`/`strategy()`, `input.int/float/bool/string/timeframe/source`
✓ `ta.macd/rsi/stoch/ema/sma/rma/wma/crossover/crossunder/highest/lowest/change/barssince/atr/tr/stdev/cci/sum/rising/falling/valuewhen`
✓ `math.*`, `color.new/rgb` + named colors, `str.tostring/format`, arithmetic/compare/ternary/logical
✓ series semantics — bar-by-bar, `[n]` history, `var`, `:=`, tuples, single- & multi-line user functions, `for`, `if`
✓ `plot` (→ line / histogram / area / circles-as-point-markers), `plotshape`/`plotchar` (→ markers), `hline` (→ price line)
✓ `request.security` — true higher-timeframe resampling (see below)

### request.security — higher-timeframe resampling

A `request.security(sym, tf, expr, …)` call to a **coarser** `tf` than the chart now resamples for
real instead of collapsing to the chart TF:

1. the chart bars (already at the chart TF — the engine never sees finer data) are grouped up to
   `tf` — ISO-week for `W`, calendar buckets for `M`/`3M`/`12M`, an epoch-aligned N-day grid for
   `nD` — producing HTF bars plus a `chart-bar → HTF-bar` index;
2. the **whole script re-runs** on those HTF bars (one cached re-run per distinct coarser TF), so
   every series the expression depends on (`ta.*`, `calc()`, …) is recomputed on the HTF timeline;
3. each chart bar reads `expr` off its HTF bar. Because the expression keeps its own `[n]` offset,
   `request.security(sym, tf, _src[1], lookahead=barmerge.lookahead_off)` returns the **confirmed
   (closed) HTF bar** — non-repainting — while `_src` (no `[1]`) returns the **developing** HTF bar.
   This is exactly the flagship's `secScalar` (confirmed, `rep=false`) vs `secDev` (developing) split.

Same-timeframe or finer requests evaluate the expression in place (a finer TF can't be rebuilt from
chart bars). Validated on the flagship over a 3D chart (confirm→1W resampled): the confirm-gate
sign flips on ~20% of bars vs the old chart-TF passthrough, and the gated BUY★/SELL★/CUT/RE-BUY
signals differ on 19 of 34 symbols.

Deferred / no-op (clearly reported, never throws):
- Tables, labels, lines, boxes, `fill`, `bgcolor`, `alertcondition` are parsed but draw nothing
  (they aren't chart series). The flagship's MTF dashboard table is therefore not rendered here.
- A finer-than-chart `request.security` (e.g. the flagship's 1D *lead* TF under a 3D chart) falls
  back to the chart value — the engine only receives chart-TF bars, so sub-chart bars can't be
  reconstructed. A fresh `ta.*` computed *inside* a security expression isn't recomputed on the HTF
  timeline (the flagship passes plain series refs, so this doesn't affect it).

## Audit & known limitations

A multi-agent adversarial audit (find → verify-by-running → empirical batteries) drove the engine's
correctness. Fixed in that pass: `na(x)` dispatch, Wilder `ta.rma`/`ta.atr` seeding, function-local
`var` carry-forward, `and`/`or` + ternary evaluating both operands so `ta.*` state stays in sync,
expression-argument history for function params, leading-operator line continuation, two-word type
qualifiers (`series float`), na-valued comparisons, `ta.stoch` zero-range → na, bare `ta.tr`,
positional `plot()` style/linewidth, multi-dot/empty-exponent number lexing, `not`/equality operator
precedence, and the `pineKey` re-run trigger (now keys on full source, not length).

Fixed in the Wave-1 pass (worker + correctness quick wins):
- **`plot()` na → whitespace gap.** na/non-finite points on line/area/stepline/circles plots now emit
  a whitespace point `{ time }` (no `value`) so Lightweight-Charts **breaks the line** at the gap
  instead of connecting across it (correct `plot(cond ? x : na)` shape). Histogram/columns/cross bars
  are still omitted (a missing discrete bar is correct). *ChartPanel must pass whitespace points
  through to `setData` for line-family series — see the integration contract above.*
- **`plotshape`/`plotchar`/`plotarrow` honor `series bool`.** A **finite numeric** first arg (e.g.
  `plotshape(close, …)`) is a Pine type error and no longer fires a marker on every non-zero bar —
  it's warned and skipped. `na` (an un-warmed bool) is still a valid `series bool` value; boolean
  conditions (`ta.crossover(...)`, `close > x`, `and`-chains) work unchanged.
- **Real run cancellation.** With the Web Worker (host.ts) the per-run wall budget is enforced by
  `terminate()` (true preemption) instead of the engine's post-hoc cooperative poll — a runaway
  script is killed without ever freezing the UI thread. The in-engine cooperative budget
  (`DEFAULT_BUDGET_MS`, `MAX_TOTAL_LOOP_ITERS`) remains as a soft in-worker guard.
- **Single parse + AST cache.** A run parses the source once; `compile()` returns a reusable AST and
  the worker caches it per source hash, so replay ticks / live splices / param edits re-run without
  re-parsing.

Remaining known limitations (low blast radius, documented on purpose):
- **Tables/labels/lines/boxes/`strategy.*` orders/`fill`/`bgcolor`/`alertcondition` still no-op** —
  parsed, their arguments evaluated (so a `ta.*` used only inside one still advances per-bar state,
  same rule as and/or/ternary), and the output dropped (they aren't chart series). Scripts using
  them run and plot what they can; the
  editor surfaces a warning for the unsupported builtins (they no longer silently dead-chart under a
  bare "✓ Compiled"). Mapping the chart-drawable subset (label/line/box → overlay primitives, bgcolor
  → background rects) is future work.
- **Pine is skipped on intraday timeframes** (the engine's date math assumes `YYYY-MM-DD`); the
  chart guards the build so an added script simply doesn't run on intraday TFs. Normalizing time
  handling to epoch-ms is future work.
- A fresh `ta.*` computed **inside** a `request.security` expression isn't recomputed on the HTF
  timeline (pre-computed series refs — the flagship's pattern — resample correctly).
- `ta.*`/`expr[n]` inside an `if`-block branch only advance on bars where the branch runs — Pine
  itself documents this as unsupported; hoist `ta.*` to top level (the flagship does).
- Per-bar `plot()` colors render as a single color on **line/area/circle** series (Lightweight-Charts
  has one color per line series); histograms keep per-bar color.
- Undefined identifiers resolve to `na` + a surfaced warning (deliberately tolerant) rather than a
  hard compile error.
- `color.from_gradient`, `for…in` array iteration, tab-width indentation, and `plotshape`
  `location.top/bottom` (Lightweight-Charts markers only support above/below/in-bar) are approximated.

## The proprietary flagship vs. this engine — the decision

The locked `RM×ST — MTF Signal Suite` (`PROPRIETARY_SCRIPT`, `locked: true`) keeps using its
**precomputed Python signals** from `signal_layer/confluence.py` (the "golden oracle") on the
chart — that is the validated, parity-gated path that produces the BUY/SELL/CUT/RE-BUY badges.
"Add to chart" on the locked indicator does **not** route it through this engine, so the golden
signals are never duplicated or contradicted. This general-purpose engine runs **arbitrary user
scripts** instead. (The engine *can* execute the flagship source faithfully — including its MTF
trend gates, now that `request.security` resamples — for the oscillator pane + markers, but the
on-chart endorsement of record stays with the oracle.)
