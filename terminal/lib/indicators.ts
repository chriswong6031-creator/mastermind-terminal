// Central registry for the chart's built-in indicators — the single source of truth shared by the
// legend (ChartOverlays), the settings dialog (IndicatorSettings), the chart engine (ChartPanel) and
// the workspace state (TerminalShell). Each indicator declares:
//   • how it shows up (label/tag, overlay-on-price vs its own sub-pane)
//   • its full set of user-editable inputs + style fields (drives the Settings dialog)
//   • default parameter values (used to seed state and to backfill older persisted params)
//   • a read-only Pine-style source snippet (shown by the legend's "Source code" action)
//
// Pine custom scripts are NOT in this registry — they carry their own source/params and are handled
// directly in TerminalShell/ChartPanel.

export type IndKey = "ema" | "bb" | "vwap" | "vol" | "rsi" | "stochrsi" | "macd";
export type IndKind = "overlay" | "pane";
export type FieldType = "number" | "color" | "bool";

export interface IndField {
  key: string;
  label: string;
  type: FieldType;
  group: "inputs" | "style";
  min?: number;
  max?: number;
  step?: number;
}

export interface IndDef {
  key: IndKey;
  label: string;   // full legend name
  tag: string;     // short label (used in compact contexts)
  kind: IndKind;   // overlay = draws on the price pane; pane = gets its own sub-pane
  defaults: Record<string, any>;
  fields: IndField[];
  source: string;  // read-only pseudo-Pine, shown by "Source code…"
}

// canonical display/draw order — overlays first, then sub-pane indicators top→bottom
export const IND_ORDER: IndKey[] = ["ema", "bb", "vwap", "vol", "rsi", "stochrsi", "macd"];

const COL = {
  warn: "#e8a33d", link: "#4d82ff", faint: "rgba(214,218,227,0.5)",
  up: "#26c281", down: "#f0566b", gold: "#e8b339",
  upFill: "rgba(38,194,129,0.4)", downFill: "rgba(240,86,107,0.4)",
  upHist: "rgba(38,194,129,0.5)", downHist: "rgba(240,86,107,0.5)",
  bbBand: "rgba(77,130,255,0.55)", bbBasis: "rgba(214,218,227,0.45)",
};

export const IND_DEFS: Record<IndKey, IndDef> = {
  ema: {
    key: "ema", label: "Moving Averages", tag: "MA", kind: "overlay",
    defaults: {
      ma1On: true, ma1Len: 20, ma1Col: COL.warn,
      ma2On: true, ma2Len: 50, ma2Col: COL.link,
      ma3On: true, ma3Len: 200, ma3Col: COL.faint,
      width: 1,
    },
    fields: [
      { key: "ma1On", label: "MA 1", type: "bool", group: "inputs" },
      { key: "ma1Len", label: "MA 1 length", type: "number", group: "inputs", min: 1, max: 500, step: 1 },
      { key: "ma2On", label: "MA 2", type: "bool", group: "inputs" },
      { key: "ma2Len", label: "MA 2 length", type: "number", group: "inputs", min: 1, max: 500, step: 1 },
      { key: "ma3On", label: "MA 3", type: "bool", group: "inputs" },
      { key: "ma3Len", label: "MA 3 length", type: "number", group: "inputs", min: 1, max: 500, step: 1 },
      { key: "ma1Col", label: "MA 1 color", type: "color", group: "style" },
      { key: "ma2Col", label: "MA 2 color", type: "color", group: "style" },
      { key: "ma3Col", label: "MA 3 color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 1 },
    ],
    source: `//@version=6
indicator("Moving Averages", overlay = true)
len1 = input.int(20, "MA 1 length")
len2 = input.int(50, "MA 2 length")
len3 = input.int(200, "MA 3 length")
plot(ta.ema(close, len1), "MA 1", color.new(#e8a33d, 0))
plot(ta.ema(close, len2), "MA 2", color.new(#4d82ff, 0))
plot(ta.ema(close, len3), "MA 3", color.new(#d6dae3, 50))`,
  },
  bb: {
    key: "bb", label: "Bollinger Bands", tag: "BB", kind: "overlay",
    defaults: { length: 20, mult: 2, basisCol: COL.bbBasis, bandCol: COL.bbBand, width: 1 },
    fields: [
      { key: "length", label: "Length", type: "number", group: "inputs", min: 2, max: 200, step: 1 },
      { key: "mult", label: "StdDev", type: "number", group: "inputs", min: 0.1, max: 5, step: 0.1 },
      { key: "basisCol", label: "Basis color", type: "color", group: "style" },
      { key: "bandCol", label: "Bands color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 1 },
    ],
    source: `//@version=6
indicator("Bollinger Bands", overlay = true)
length = input.int(20, "Length")
mult = input.float(2.0, "StdDev")
basis = ta.sma(close, length)
dev = mult * ta.stdev(close, length)
plot(basis, "Basis")
plot(basis + dev, "Upper")
plot(basis - dev, "Lower")`,
  },
  vwap: {
    key: "vwap", label: "VWAP", tag: "VWAP", kind: "overlay",
    defaults: { col: COL.gold, width: 1.4 },
    fields: [
      { key: "col", label: "Color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 0.5 },
    ],
    source: `//@version=6
indicator("VWAP", overlay = true)
typical = (high + low + close) / 3
plot(ta.cum(typical * volume) / ta.cum(volume), "VWAP", color.new(#e8b339, 0))`,
  },
  vol: {
    // pane-less: drawn embedded at the bottom of the price pane on its own hidden overlay scale
    key: "vol", label: "Volume", tag: "Vol", kind: "overlay",
    defaults: { upCol: COL.upFill, downCol: COL.downFill },
    fields: [
      { key: "upCol", label: "Up color", type: "color", group: "style" },
      { key: "downCol", label: "Down color", type: "color", group: "style" },
    ],
    source: `//@version=6
indicator("Volume")
col = close >= open ? color.new(#26c281, 60) : color.new(#f0566b, 60)
plot(volume, "Volume", col, style = plot.style_columns)`,
  },
  rsi: {
    key: "rsi", label: "RSI", tag: "RSI", kind: "pane",
    defaults: { length: 14, col: COL.link, width: 1.2, obLevel: 70, osLevel: 30, showLevels: true },
    fields: [
      { key: "length", label: "Length", type: "number", group: "inputs", min: 2, max: 100, step: 1 },
      { key: "obLevel", label: "Overbought", type: "number", group: "inputs", min: 50, max: 100, step: 1 },
      { key: "osLevel", label: "Oversold", type: "number", group: "inputs", min: 0, max: 50, step: 1 },
      { key: "showLevels", label: "Show OB/OS lines", type: "bool", group: "inputs" },
      { key: "col", label: "RSI color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 1 },
    ],
    source: `//@version=6
indicator("RSI")
length = input.int(14, "Length")
r = ta.rsi(close, length)
plot(r, "RSI", color.new(#4d82ff, 0))
hline(input.int(70, "Overbought"))
hline(input.int(30, "Oversold"))`,
  },
  stochrsi: {
    key: "stochrsi", label: "Stochastic RSI", tag: "Stoch RSI", kind: "pane",
    defaults: { rsiLength: 14, stochLength: 14, smoothK: 3, smoothD: 3, kCol: COL.up, dCol: COL.down, width: 1.6 },
    fields: [
      { key: "rsiLength", label: "RSI length", type: "number", group: "inputs", min: 2, max: 100, step: 1 },
      { key: "stochLength", label: "Stochastic length", type: "number", group: "inputs", min: 2, max: 100, step: 1 },
      { key: "smoothK", label: "Smooth %K", type: "number", group: "inputs", min: 1, max: 20, step: 1 },
      { key: "smoothD", label: "Smooth %D", type: "number", group: "inputs", min: 1, max: 20, step: 1 },
      { key: "kCol", label: "%K color", type: "color", group: "style" },
      { key: "dCol", label: "%D color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 0.5 },
    ],
    source: `//@version=6
indicator("Stochastic RSI")
rsiLen = input.int(14, "RSI length")
stochLen = input.int(14, "Stochastic length")
smoothK = input.int(3, "Smooth %K")
smoothD = input.int(3, "Smooth %D")
r = ta.rsi(close, rsiLen)
k = ta.sma(ta.stoch(r, r, r, stochLen), smoothK)
d = ta.sma(k, smoothD)
plot(k, "%K", color.new(#26c281, 0))
plot(d, "%D", color.new(#f0566b, 0))`,
  },
  macd: {
    key: "macd", label: "MACD", tag: "MACD", kind: "pane",
    defaults: { fast: 12, slow: 26, signal: 9, macdCol: COL.link, signalCol: COL.warn, upHist: COL.upHist, downHist: COL.downHist, width: 1.3 },
    fields: [
      { key: "fast", label: "Fast length", type: "number", group: "inputs", min: 1, max: 100, step: 1 },
      { key: "slow", label: "Slow length", type: "number", group: "inputs", min: 1, max: 200, step: 1 },
      { key: "signal", label: "Signal length", type: "number", group: "inputs", min: 1, max: 100, step: 1 },
      { key: "macdCol", label: "MACD color", type: "color", group: "style" },
      { key: "signalCol", label: "Signal color", type: "color", group: "style" },
      { key: "upHist", label: "Histogram +", type: "color", group: "style" },
      { key: "downHist", label: "Histogram −", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 0.1 },
    ],
    source: `//@version=6
indicator("MACD")
fast = input.int(12, "Fast length")
slow = input.int(26, "Slow length")
sig = input.int(9, "Signal length")
[macdLine, signalLine, hist] = ta.macd(close, fast, slow, sig)
plot(hist, "Histogram", style = plot.style_columns)
plot(macdLine, "MACD", color.new(#4d82ff, 0))
plot(signalLine, "Signal", color.new(#e8a33d, 0))`,
  },
};

export function isIndKey(k: string): k is IndKey {
  return Object.prototype.hasOwnProperty.call(IND_DEFS, k);
}

// ── visibility-on-intervals (TradingView's "Visibility" tab) ──
// The terminal is daily-EOD, so only Day/Week/Month timeframes are real; each unit can be toggled
// off or bounded to a [min,max] multiplier (e.g. show only on D/2D by setting Days max=2). Stored
// per-indicator under `_vis`, so it persists + resets alongside the rest of the settings.
export type VisUnit = "days" | "weeks" | "months";
export type VisRange = { on: boolean; min: number; max: number };
export function defaultVis(): Record<VisUnit, VisRange> {
  return { days: { on: true, min: 1, max: 366 }, weeks: { on: true, min: 1, max: 52 }, months: { on: true, min: 1, max: 12 } };
}
export const VIS_UNITS: { key: VisUnit; label: string; max: number }[] = [
  { key: "days", label: "Days", max: 366 },
  { key: "weeks", label: "Weeks", max: 52 },
  { key: "months", label: "Months", max: 12 },
];

export function indDefaults(key: string): Record<string, any> {
  return isIndKey(key) ? { ...IND_DEFS[key].defaults, _vis: defaultVis() } : {};
}
// merge persisted params over the registry defaults so older saved params backfill new fields
export function withDefaults(key: string, params?: Record<string, any> | null): Record<string, any> {
  return { ...indDefaults(key), ...(params || {}) };
}
export function allDefaults(): Record<string, Record<string, any>> {
  const o: Record<string, Record<string, any>> = {};
  for (const k of IND_ORDER) o[k] = indDefaults(k);
  return o;
}
