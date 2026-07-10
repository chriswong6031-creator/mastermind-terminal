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

export type IndKey = "ema" | "bb" | "vwap" | "vol" | "rsi" | "stochrsi" | "macd"
  | "ichimoku" | "ribbon" | "supertrend" | "avwap" | "vprofile" | "volbox"
  | "rsistack" | "accum";
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
export const IND_ORDER: IndKey[] = [
  "ema", "bb", "vwap", "vol",
  "ichimoku", "ribbon", "supertrend", "avwap", "vprofile", "volbox",
  "rsi", "stochrsi", "macd", "rsistack", "accum",
];

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

  // ── New DT Technicals Suite (display-tier descriptive) ──

  ichimoku: {
    key: "ichimoku", label: "Ichimoku Cloud", tag: "Ichi", kind: "overlay",
    defaults: {
      tenkan: 9, kijun: 26, senkouB: 52, displacement: 26,
      tenkanCol: "#4d82ff", kijunCol: "#e8a33d",
      spanACol: "rgba(38,194,129,0.18)", spanBCol: "rgba(240,86,107,0.18)",
      width: 1,
    },
    fields: [
      { key: "tenkan", label: "Tenkan length", type: "number", group: "inputs", min: 1, max: 100, step: 1 },
      { key: "kijun", label: "Kijun length", type: "number", group: "inputs", min: 1, max: 200, step: 1 },
      { key: "senkouB", label: "Senkou B length", type: "number", group: "inputs", min: 1, max: 300, step: 1 },
      { key: "displacement", label: "Displacement", type: "number", group: "inputs", min: 1, max: 100, step: 1 },
      { key: "tenkanCol", label: "Tenkan color", type: "color", group: "style" },
      { key: "kijunCol", label: "Kijun color", type: "color", group: "style" },
      { key: "spanACol", label: "Span A fill", type: "color", group: "style" },
      { key: "spanBCol", label: "Span B fill", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 1 },
    ],
    source: `//@version=6
indicator("Ichimoku Cloud", overlay = true)
// DISPLAY-TIER DESCRIPTIVE — classic Ichimoku (Goichi Hosoda, 1969 / public domain)
tenkan = input.int(9, "Tenkan length")
kijun  = input.int(26, "Kijun length")
senkouBLen = input.int(52, "Senkou B length")
disp = input.int(26, "Displacement")
tenkanLine = (ta.highest(high, tenkan) + ta.lowest(low, tenkan)) / 2
kijunLine  = (ta.highest(high, kijun)  + ta.lowest(low, kijun))  / 2
spanA = (tenkanLine + kijunLine) / 2
spanB = (ta.highest(high, senkouBLen) + ta.lowest(low, senkouBLen)) / 2
plot(tenkanLine, "Tenkan", color.new(#4d82ff, 0))
plot(kijunLine,  "Kijun",  color.new(#e8a33d, 0))
p1 = plot(spanA, "Span A", offset = disp)
p2 = plot(spanB, "Span B", offset = disp)
fill(p1, p2, color = spanA >= spanB ? color.new(#26c281, 82) : color.new(#f0566b, 82))`,
  },

  ribbon: {
    key: "ribbon", label: "Trend Ribbon", tag: "Ribbon", kind: "overlay",
    defaults: {
      fast: 20, slow: 50, slopeWin: 10, colorCandles: true,
      colUp: "#26c281", colDn: "#f0566b",
      fillUp: "rgba(38,194,129,0.12)", fillDn: "rgba(240,86,107,0.12)",
      width: 1.5,
    },
    fields: [
      { key: "fast", label: "Fast EMA", type: "number", group: "inputs", min: 1, max: 200, step: 1 },
      { key: "slow", label: "Slow EMA", type: "number", group: "inputs", min: 1, max: 500, step: 1 },
      { key: "slopeWin", label: "Slope window", type: "number", group: "inputs", min: 2, max: 50, step: 1 },
      { key: "colorCandles", label: "Color candles", type: "bool", group: "inputs" },
      { key: "colUp", label: "Up line color", type: "color", group: "style" },
      { key: "colDn", label: "Down line color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 0.5 },
    ],
    source: `//@version=6
indicator("Trend Ribbon", overlay = true)
// DISPLAY-TIER DESCRIPTIVE — dual-EMA ribbon with slope filter
fast = input.int(20, "Fast EMA")
slow = input.int(50, "Slow EMA")
slopeWin = input.int(10, "Slope window")
ef = ta.ema(close, fast)
es = ta.ema(close, slow)
ribbonUp = ef > es and es > es[slopeWin] and close > es
ribbonDn = ef < es and es < es[slopeWin] and close < es
plot(ef, "Fast EMA", color = ribbonUp ? #26c281 : ribbonDn ? #f0566b : #8b93a3)
plot(es, "Slow EMA", color = ribbonUp ? #26c281 : ribbonDn ? #f0566b : #8b93a3)`,
  },

  supertrend: {
    key: "supertrend", label: "SuperTrend", tag: "ST", kind: "overlay",
    defaults: { period: 10, mult: 3, colUp: "#26c281", colDn: "#f0566b", width: 2 },
    fields: [
      { key: "period", label: "ATR period", type: "number", group: "inputs", min: 1, max: 100, step: 1 },
      { key: "mult", label: "Multiplier", type: "number", group: "inputs", min: 0.5, max: 10, step: 0.5 },
      { key: "colUp", label: "Up color", type: "color", group: "style" },
      { key: "colDn", label: "Down color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 0.5 },
    ],
    source: `//@version=6
indicator("SuperTrend", overlay = true)
// DISPLAY-TIER DESCRIPTIVE — classic SuperTrend (Olivier Seban, public domain)
period = input.int(10, "ATR period")
mult   = input.float(3.0, "Multiplier")
hl2    = (high + low) / 2
atrVal = ta.atr(period)
up     = hl2 - mult * atrVal
dn     = hl2 + mult * atrVal
var float upLine = na
var float dnLine = na
var bool  trend  = true
upLine := close[1] > upLine[1] ? math.max(up, upLine[1]) : up
dnLine := close[1] < dnLine[1] ? math.min(dn, dnLine[1]) : dn
trend  := close > dnLine[1] ? true : close < upLine[1] ? false : trend[1]
plot(trend ? upLine : na, "Up rail",   color.new(#26c281, 0), 2)
plot(trend ? na : dnLine, "Down rail", color.new(#f0566b, 0), 2)`,
  },

  avwap: {
    key: "avwap", label: "Anchored VWAP", tag: "AVWAP", kind: "overlay",
    defaults: { anchor: 0, lookback: 252, col: "#e8b339", width: 1.4 },
    fields: [
      // anchor: 0=swing_low, 1=swing_high, 2=max_history (number field as proxy for select)
      { key: "anchor", label: "Anchor (0=swing low, 1=swing high, 2=full history)", type: "number", group: "inputs", min: 0, max: 2, step: 1 },
      { key: "lookback", label: "Lookback bars", type: "number", group: "inputs", min: 20, max: 2000, step: 1 },
      { key: "col", label: "Line color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 0.5 },
    ],
    source: `//@version=6
indicator("Anchored VWAP", overlay = true)
// DISPLAY-TIER DESCRIPTIVE — cumulative Σ(TP×Vol)/Σ(Vol) from anchor bar
// anchor 0=swing_low, 1=swing_high, 2=max_history (over lookback window)
lookback = input.int(252, "Lookback bars")
anchor   = input.int(0, "Anchor (0=low, 1=high, 2=history)")
// implementation: locate anchor in lookback window, compute cumulative VWAP from there
typical = (high + low + close) / 3
// (platform-specific anchor logic omitted from Pine stub)
plot(ta.cum(typical * volume) / ta.cum(volume), "AVWAP", color.new(#e8b339, 0), 1, plot.style_line, linestyle = plot.style_linebr, trackprice = false)`,
  },

  vprofile: {
    key: "vprofile", label: "Volume Profile", tag: "Vol Profile", kind: "overlay",
    defaults: { window: 126, bins: 24, shelfMode: false, widthFrac: 0.18 },
    fields: [
      { key: "window", label: "Window (bars)", type: "number", group: "inputs", min: 20, max: 500, step: 1 },
      { key: "bins", label: "Price bins", type: "number", group: "inputs", min: 8, max: 64, step: 1 },
      { key: "shelfMode", label: "Money-flow weighted", type: "bool", group: "inputs" },
      { key: "widthFrac", label: "Bar width (fraction)", type: "number", group: "style", min: 0.05, max: 0.4, step: 0.01 },
    ],
    source: `//@version=6
indicator("Volume Profile", overlay = true)
// DISPLAY-TIER DESCRIPTIVE — volume-by-price histogram (right-anchored)
// shelfMode weights each bar's volume by money-flow buy_share = ((c-l)-(h-c))/(h-l) mapped to [0,1]
// POC = price-bin with highest volume; VAH/VAL = 70% value area (symmetric from POC)
// Rendered via SVG overlay (not a native LWC series)`,
  },

  volbox: {
    key: "volbox", label: "Volatility Box", tag: "VolBox", kind: "overlay",
    defaults: { bbLen: 20, mult: 2, pctileWin: 126, squeezePct: 25, boxWin: 20 },
    fields: [
      { key: "bbLen", label: "BB length", type: "number", group: "inputs", min: 5, max: 100, step: 1 },
      { key: "mult", label: "BB StdDev", type: "number", group: "inputs", min: 0.5, max: 5, step: 0.5 },
      { key: "pctileWin", label: "Percentile window", type: "number", group: "inputs", min: 20, max: 500, step: 1 },
      { key: "squeezePct", label: "Squeeze threshold %", type: "number", group: "inputs", min: 5, max: 50, step: 5 },
      { key: "boxWin", label: "Box range window", type: "number", group: "inputs", min: 5, max: 100, step: 1 },
    ],
    source: `//@version=6
indicator("Volatility Box", overlay = true)
// DISPLAY-TIER DESCRIPTIVE — Bollinger Band squeeze → consolidation box
// bandwidth = (upper-lower)/basis; squeeze when rolling percentile <= squeezePct
// box_hi = rolling max(high, boxWin); box_lo = rolling min(low, boxWin) during squeeze
// Rendered via SVG overlay; "resolved up/down" = descriptive breakout direction only`,
  },

  rsistack: {
    key: "rsistack", label: "RSI Stack", tag: "RSI Stack", kind: "pane",
    defaults: {
      len1: 7, len2: 14, len3: 21,
      ob: 70, os: 30, showLevels: true,
      col1: "#26c281", col2: "#4d82ff", col3: "#e8a33d", width: 1.4,
    },
    fields: [
      { key: "len1", label: "RSI 1 length", type: "number", group: "inputs", min: 2, max: 100, step: 1 },
      { key: "len2", label: "RSI 2 length", type: "number", group: "inputs", min: 2, max: 100, step: 1 },
      { key: "len3", label: "RSI 3 length", type: "number", group: "inputs", min: 2, max: 100, step: 1 },
      { key: "ob", label: "Overbought", type: "number", group: "inputs", min: 50, max: 100, step: 1 },
      { key: "os", label: "Oversold", type: "number", group: "inputs", min: 0, max: 50, step: 1 },
      { key: "showLevels", label: "Show OB/OS lines", type: "bool", group: "inputs" },
      { key: "col1", label: "RSI 1 color", type: "color", group: "style" },
      { key: "col2", label: "RSI 2 color", type: "color", group: "style" },
      { key: "col3", label: "RSI 3 color", type: "color", group: "style" },
      { key: "width", label: "Line width", type: "number", group: "style", min: 1, max: 4, step: 0.5 },
    ],
    source: `//@version=6
indicator("RSI Stack")
// DISPLAY-TIER DESCRIPTIVE — three RSI periods overlaid in one pane
len1 = input.int(7, "RSI 1 length")
len2 = input.int(14, "RSI 2 length")
len3 = input.int(21, "RSI 3 length")
ob   = input.int(70, "Overbought")
os   = input.int(30, "Oversold")
plot(ta.rsi(close, len1), "RSI 7",  color.new(#26c281, 0))
plot(ta.rsi(close, len2), "RSI 14", color.new(#4d82ff, 0))
plot(ta.rsi(close, len3), "RSI 21", color.new(#e8a33d, 0))
hline(ob); hline(os)`,
  },

  accum: {
    key: "accum", label: "Accumulation %", tag: "Accum", kind: "pane",
    defaults: { win: 63, showBands: true },
    fields: [
      { key: "win", label: "Window (bars)", type: "number", group: "inputs", min: 10, max: 500, step: 1 },
      { key: "showBands", label: "Show reference bands", type: "bool", group: "inputs" },
    ],
    source: `//@version=6
indicator("Accumulation %")
// Descriptive money-flow share (close-in-range). Does not identify institutional vs retail activity.
// 35/50/75 are public charting reference bands, not signals.
win = input.int(63, "Window (bars)")
range_ = high - low
buy_share = range_ == 0 ? 0.5 : ((close - low) - (high - close)) / range_ * 0.5 + 0.5
accum = 100 * ta.sum(buy_share * volume, win) / ta.sum(volume, win)
plot(accum, "Accum %", color.new(#4d82ff, 0))
hline(75, "ref", color.new(color.gray, 60), linestyle = hline.style_dashed)
hline(50, "ref", color.new(color.gray, 60), linestyle = hline.style_dashed)
hline(35, "ref", color.new(color.gray, 60), linestyle = hline.style_dashed)`,
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
