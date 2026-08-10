import { describe, expect, it } from "vitest";
import {
  axisLogFormulaForRange,
  axisRangeFromLog,
  axisRangeToLog,
  axisValueAtCoordinate,
  wheelDeltaPixels,
  wheelDeltaToZoomFactor,
  zoomAxisRange,
  type AxisRange,
} from "@/lib/chart-engine/axisZoom";

describe("logarithmic price-axis domain", () => {
  it("round-trips ordinary and sub-unit ranges", () => {
    for (const range of [{ from: 100, to: 200 }, { from: 0.0012, to: 0.0018 }]) {
      const formula = axisLogFormulaForRange(range);
      const restored = axisRangeFromLog(axisRangeToLog(range, formula), formula);
      expect(restored.from).toBeCloseTo(range.from, 12);
      expect(restored.to).toBeCloseTo(range.to, 12);
    }
  });

  it("matches the renderer's adaptive formula for narrow ranges", () => {
    expect(axisLogFormulaForRange({ from: 10, to: 10.05 })).toEqual({
      logicalOffset: 6,
      coordinateOffset: 0.000001,
    });
  });
});

describe("axisValueAtCoordinate", () => {
  const RANGE: AxisRange = { from: 100, to: 200 };
  const MARGINS = { top: 0.1, bottom: 0.1 };

  it("maps the usable axis band into the scale's displayed domain", () => {
    expect(axisValueAtCoordinate(RANGE, 10, 100, MARGINS)).toBeCloseTo(200, 10);
    expect(axisValueAtCoordinate(RANGE, 89, 100, MARGINS)).toBeCloseTo(100, 10);
    expect(axisValueAtCoordinate(RANGE, 49.5, 100, MARGINS)).toBeCloseTo(150, 10);
  });

  it("respects inverted price scales", () => {
    expect(axisValueAtCoordinate(RANGE, 10, 100, MARGINS, true)).toBeCloseTo(100, 10);
    expect(axisValueAtCoordinate(RANGE, 89, 100, MARGINS, true)).toBeCloseTo(200, 10);
  });

  it("falls back safely for unusable geometry", () => {
    expect(axisValueAtCoordinate(RANGE, 50, 1, MARGINS)).toBe(150);
    expect(axisValueAtCoordinate(RANGE, 50, 100, { top: 0.6, bottom: 0.6 })).toBe(150);
  });
});

describe("wheelDeltaPixels", () => {
  it("normalizes pixel, line, and page-mode wheel events", () => {
    expect(wheelDeltaPixels(12, 0)).toBe(12);
    expect(wheelDeltaPixels(1, 1)).toBe(16);
    expect(wheelDeltaPixels(1, 2, 640)).toBe(640);
  });

  it("neutralizes non-finite device input", () => {
    expect(wheelDeltaPixels(Number.NaN, 0)).toBe(0);
  });
});

describe("wheelDeltaToZoomFactor", () => {
  it("maps a conventional notch to a smooth multiplicative step", () => {
    expect(wheelDeltaToZoomFactor(120, 0)).toBeCloseTo(Math.exp(120 * 0.0012), 10);
  });

  it("makes equal opposite deltas reciprocal", () => {
    const out = wheelDeltaToZoomFactor(80, 0);
    const into = wheelDeltaToZoomFactor(-80, 0);
    expect(out * into).toBeCloseTo(1, 12);
  });

  it("bounds one accelerated frame without imposing a cumulative limit", () => {
    expect(wheelDeltaToZoomFactor(100_000, 0)).toBeCloseTo(Math.exp(0.35), 12);
    expect(wheelDeltaToZoomFactor(-100_000, 0)).toBeCloseTo(Math.exp(-0.35), 12);
  });
});

describe("zoomAxisRange", () => {
  const RANGE: AxisRange = { from: 100, to: 200 };

  it("keeps the price under the pointer stationary", () => {
    expect(zoomAxisRange(RANGE, 125, 0.5)).toEqual({ from: 112.5, to: 162.5 });
    expect(zoomAxisRange(RANGE, 125, 2)).toEqual({ from: 75, to: 275 });
  });

  it("is reversible for reciprocal factors", () => {
    const factor = wheelDeltaToZoomFactor(120, 0);
    const expanded = zoomAxisRange(RANGE, 140, factor);
    const restored = zoomAxisRange(expanded, 140, 1 / factor);
    expect(restored.from).toBeCloseTo(RANGE.from, 10);
    expect(restored.to).toBeCloseTo(RANGE.to, 10);
  });

  it("keeps compounding far beyond the former fixed clamp", () => {
    const factor = wheelDeltaToZoomFactor(-120, 0);
    let range = RANGE;
    let spanAt40 = 0;
    for (let i = 1; i <= 80; i += 1) {
      range = zoomAxisRange(range, 150, factor);
      if (i === 40) spanAt40 = range.to - range.from;
    }
    const spanAt80 = range.to - range.from;
    expect(spanAt40).toBeGreaterThan(0);
    expect(spanAt80).toBeGreaterThan(0);
    expect(spanAt80).toBeLessThan(spanAt40 * 0.01);
  });

  it("keeps expanding across many gestures without saturating", () => {
    const factor = wheelDeltaToZoomFactor(120, 0);
    let range = RANGE;
    let spanAt20 = 0;
    for (let i = 1; i <= 40; i += 1) {
      range = zoomAxisRange(range, 150, factor);
      if (i === 20) spanAt20 = range.to - range.from;
    }
    expect(range.to - range.from).toBeGreaterThan(spanAt20 * 10);
  });

  it("keeps the last valid range at numerical boundaries", () => {
    expect(zoomAxisRange(RANGE, 150, Number.NaN)).toBe(RANGE);
    expect(zoomAxisRange({ from: 1, to: 1 }, 1, 2)).toEqual({ from: 1, to: 1 });
    expect(zoomAxisRange(RANGE, Number.MAX_VALUE, 2)).toBe(RANGE);
  });
});
