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
  are no-ops returning `na` so a large real-world script still runs and plots what it can.
- **builtins.ts** — constant namespaces (`color.*`, `shape.*`, `plot.style_*`, …), color→CSS
  conversion, `str.tostring` formatting, timeframe-seconds.
- **index.ts** — `runPine(source, bars, opts)` and `compilePine(source)` (parse-only check).

## Coverage

✓ `indicator()`/`strategy()`, `input.int/float/bool/string/timeframe/source`
✓ `ta.macd/rsi/stoch/ema/sma/rma/wma/crossover/crossunder/highest/lowest/change/barssince/atr/tr/stdev/cci/sum/rising/falling/valuewhen`
✓ `math.*`, `color.new/rgb` + named colors, `str.tostring/format`, arithmetic/compare/ternary/logical
✓ series semantics — bar-by-bar, `[n]` history, `var`, `:=`, tuples, single- & multi-line user functions, `for`, `if`
✓ `plot` (→ line / histogram / area / circles-as-point-markers), `plotshape`/`plotchar` (→ markers), `hline` (→ price line)

Deferred / no-op (clearly reported, never throws):
- `request.security` is evaluated on the **chart timeframe** (a true higher-timeframe resample
  is not implemented). In single-timeframe mode the flagship's MTF trend gates collapse to
  "agree", which is sound for a single-TF read; full MTF fidelity is the main follow-up.
- Tables, labels, lines, boxes, `fill`, `bgcolor`, `alertcondition` are parsed but draw nothing
  (they aren't chart series). The flagship's MTF dashboard table is therefore not rendered here.

## Audit & known limitations

A multi-agent adversarial audit (find → verify-by-running → empirical batteries) drove the engine's
correctness. Fixed in that pass: `na(x)` dispatch, Wilder `ta.rma`/`ta.atr` seeding, function-local
`var` carry-forward, `and`/`or` + ternary evaluating both operands so `ta.*` state stays in sync,
expression-argument history for function params, leading-operator line continuation, two-word type
qualifiers (`series float`), na-valued comparisons, `ta.stoch` zero-range → na, bare `ta.tr`,
positional `plot()` style/linewidth, multi-dot/empty-exponent number lexing, `not`/equality operator
precedence, and the `pineKey` re-run trigger (now keys on full source, not length).

Remaining known limitations (low blast radius, documented on purpose):
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
scripts** instead. (The engine *can* execute the flagship source faithfully for the
single-timeframe oscillator pane + markers — see the screenshots used in validation — but the
on-chart endorsement of record stays with the oracle.)
