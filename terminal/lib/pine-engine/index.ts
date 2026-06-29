// Public surface for the Pine v6 engine.
//
//   runPine(source, bars, opts)  → executes the script bar-by-bar and returns plots/shapes/hlines
//   compilePine(source)          → parse-only check (real syntax errors with line/col), for the editor
//
// SCOPE (this is a focused, single-timeframe interpreter, not a 100% Pine clone):
//   ✓ indicator()/strategy(), input.int/float/bool/string/timeframe/source
//   ✓ ta.macd/rsi/stoch/ema/sma/rma/wma/crossover/crossunder/highest/lowest/change/barssince/atr/…
//   ✓ math.*, color.* (new/rgb + named), str.tostring/format, arithmetic/compare/ternary/logical
//   ✓ series semantics — bar-by-bar, `[n]` history, `var`, `:=`, user functions (single/multi-line, tuples)
//   ✓ plot (→ line/histogram/area/circles), plotshape/plotchar (→ markers), hline (→ price line)
//   ✓ request.security: a COARSER timeframe is truly resampled — the chart bars are grouped up to the
//     requested TF, the whole script re-runs on those HTF bars, and the expression reads that series.
//     `_src[1]` = confirmed/closed HTF bar (non-repaint, lookahead_off); `_src` = developing HTF bar.
//     Same/finer TF evaluates in place (the engine only receives chart-TF bars, so finer can't be rebuilt).
//   ✗ tables/labels/lines/boxes/fill/bgcolor/alertcondition: parsed and treated as no-ops (they don't
//     produce chart series). The flagship's MTF dashboard table is therefore not drawn here — its
//     validated BUY/SELL/CUT/RE-BUY signals keep coming from the precomputed Python oracle path.
import { parse } from "./parser";
import { PineSyntaxError } from "./lexer";
import { run, type Bar, type RunResult } from "./runtime";

export type { Bar, RunResult, PinePlot, PineShape, PineHline, PineInput, PineMeta } from "./runtime";

export interface PineError { line: number; col: number; message: string; phase: "parse" | "runtime"; }
export interface CompileResult { ok: boolean; errors: PineError[]; }
export interface PineRunOutput { ok: boolean; errors: PineError[]; result: RunResult | null; }

export function compilePine(source: string): CompileResult {
  try { parse(source); return { ok: true, errors: [] }; }
  catch (e) { return { ok: false, errors: [toError(e, "parse")] }; }
}

export function runPine(source: string, bars: Bar[], opts: { timeframe?: string; symbol?: string; params?: Record<string, any> } = {}): PineRunOutput {
  let parsed = false;
  try {
    parse(source); parsed = true;
    const result = run(source, bars, opts);
    return { ok: true, errors: [], result };
  } catch (e) {
    return { ok: false, errors: [toError(e, parsed ? "runtime" : "parse")], result: null };
  }
}

function toError(e: unknown, phase: "parse" | "runtime"): PineError {
  if (e instanceof PineSyntaxError) return { line: e.line, col: e.col, message: e.message, phase: "parse" };
  const msg = e instanceof Error ? e.message : String(e);
  return { line: 0, col: 0, message: msg, phase };
}
