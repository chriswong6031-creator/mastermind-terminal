// TradingView-style price-axis wheel zoom — renderer-independent range math.
//
// The old implementation changed `scaleMargins` and clamped a cumulative offset.
// That could only compress the drawable pane to a two-percent sliver, so repeated
// gestures always hit a visible wall. A real price-axis zoom scales the numeric
// domain instead: every wheel frame compounds the current range around the price
// under the pointer. There is deliberately no cumulative product limit here; only
// the finite precision of JavaScript numbers can eventually stop a gesture.

export type AxisMargins = { top: number; bottom: number };
export type AxisRange = { from: number; to: number };
export type AxisLogFormula = { logicalOffset: number; coordinateOffset: number };

// 120px is the conventional mouse-wheel notch. At this sensitivity one notch is
// about 15.5%, while a 1px trackpad delta is a nearly imperceptible 0.12% step.
const WHEEL_EXPONENT_PER_PX = 0.0012;
// OS/browser acceleration can occasionally deliver a very large single event.
// Bound that one frame (not the accumulated zoom) so it cannot flash the chart;
// subsequent frames continue compounding without a ceiling.
const MAX_FRAME_EXPONENT = 0.35;
const DEFAULT_LOG_FORMULA: AxisLogFormula = { logicalOffset: 4, coordinateOffset: 0.0001 };

export function wheelDeltaPixels(delta: number, deltaMode: number, pagePx = 800): number {
  if (!Number.isFinite(delta)) return 0;
  if (deltaMode === 1) return delta * 16; // Firefox line mode
  if (deltaMode === 2) return delta * Math.max(1, pagePx); // page mode
  return delta;
}

/**
 * Convert a wheel delta into a multiplicative range factor.
 *
 * `factor < 1` zooms in and `factor > 1` zooms out. The exponential mapping
 * makes equal opposite deltas exact reciprocals and keeps high-resolution
 * trackpad motion continuous rather than quantized into notches.
 */
export function wheelDeltaToZoomFactor(delta: number, deltaMode: number, pagePx = 800): number {
  const px = wheelDeltaPixels(delta, deltaMode, pagePx);
  const exponent = Math.max(-MAX_FRAME_EXPONENT, Math.min(MAX_FRAME_EXPONENT, px * WHEEL_EXPONENT_PER_PX));
  return Math.exp(exponent);
}

/**
 * Resolve the value underneath a price-axis pointer in the scale's own domain.
 *
 * Lightweight Charts exposes percentage/index ranges in their displayed domain,
 * while `series.coordinateToPrice()` always converts them back to raw prices.
 * Mixing those two spaces makes cursor-anchored zoom drift. Reconstructing the
 * library's linear coordinate mapping keeps Normal, Percent, Indexed-to-100 and
 * (after its public-API bridge) Logarithmic modes on the same smooth path.
 */
export function axisValueAtCoordinate(
  range: AxisRange,
  coordinate: number,
  height: number,
  margins: AxisMargins,
  inverted = false,
): number {
  const { from, to } = range;
  if (![from, to, coordinate, height, margins.top, margins.bottom].every(Number.isFinite)
    || to <= from || height <= 1) return (from + to) / 2;

  const topPx = margins.top * height;
  const bottomPx = margins.bottom * height;
  const internalHeight = height - topPx - bottomPx;
  if (internalHeight <= 1) return (from + to) / 2;

  const y = Math.max(0, Math.min(height - 1, coordinate));
  const inverseCoordinate = inverted ? y : height - 1 - y;
  const ratio = (inverseCoordinate - bottomPx) / (internalHeight - 1);
  return from + (to - from) * ratio;
}

/** Mirror Lightweight Charts' v5 logarithmic-domain formula. */
export function axisLogFormulaForRange(range: AxisRange): AxisLogFormula {
  const difference = Math.abs(range.to - range.from);
  if (!Number.isFinite(difference) || difference >= 1 || difference < 1e-15) return DEFAULT_LOG_FORMULA;
  const digits = Math.ceil(Math.abs(Math.log10(difference)));
  const logicalOffset = DEFAULT_LOG_FORMULA.logicalOffset + digits;
  return { logicalOffset, coordinateOffset: 1 / (10 ** logicalOffset) };
}

export function axisPriceToLog(price: number, formula: AxisLogFormula): number {
  const magnitude = Math.abs(price);
  if (magnitude < 1e-15) return 0;
  const logical = Math.log10(magnitude + formula.coordinateOffset) + formula.logicalOffset;
  return price < 0 ? -logical : logical;
}

export function axisLogToPrice(logical: number, formula: AxisLogFormula): number {
  const magnitude = Math.abs(logical);
  if (magnitude < 1e-15) return 0;
  const price = (10 ** (magnitude - formula.logicalOffset)) - formula.coordinateOffset;
  return logical < 0 ? -price : price;
}

export function axisRangeToLog(range: AxisRange, formula: AxisLogFormula): AxisRange {
  return { from: axisPriceToLog(range.from, formula), to: axisPriceToLog(range.to, formula) };
}

export function axisRangeFromLog(range: AxisRange, formula: AxisLogFormula): AxisRange {
  return { from: axisLogToPrice(range.from, formula), to: axisLogToPrice(range.to, formula) };
}

/** Scale a numeric price domain around an anchor while preserving that anchor. */
export function zoomAxisRange(range: AxisRange, anchor: number, factor: number): AxisRange {
  const { from, to } = range;
  if (![from, to, anchor, factor].every(Number.isFinite) || to <= from || factor <= 0) return range;

  const next = {
    from: anchor - (anchor - from) * factor,
    to: anchor + (to - anchor) * factor,
  };
  // At the true floating-point limit subtraction can collapse the interval, and
  // at the opposite limit multiplication can overflow. Keep the last valid frame;
  // there is no arbitrary product zoom cap before either numerical boundary.
  if (!Number.isFinite(next.from) || !Number.isFinite(next.to) || next.to <= next.from) return range;
  return next;
}
