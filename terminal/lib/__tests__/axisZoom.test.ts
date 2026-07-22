import { describe, it, expect } from "vitest";
import {
  clampAxisZoom,
  axisZoomMargins,
  wheelDeltaToZoomStep,
  type AxisMargins,
} from "@/lib/chart-engine/axisZoom";

// Pure-math tests for the axis-wheel squash/stretch (extracted from ChartPanel). The
// price pane's default margins; subpanes pass their own base, so tests vary it.
const PRICE: AxisMargins = { top: 0.1, bottom: 0.08 };

describe("clampAxisZoom", () => {
  it("clamps the lower bound to -base.bottom (bottom margin can reach 0, no further)", () => {
    expect(clampAxisZoom(PRICE, -1)).toBe(-PRICE.bottom);
    // a different base moves the floor with it
    expect(clampAxisZoom({ top: 0.2, bottom: 0.3 }, -5)).toBe(-0.3);
  });

  it("clamps the upper bound to 0.4", () => {
    expect(clampAxisZoom(PRICE, 10)).toBe(0.4);
  });

  it("passes through values already in range", () => {
    expect(clampAxisZoom(PRICE, 0.15)).toBe(0.15);
  });
});

describe("axisZoomMargins", () => {
  it("adds zoom to both margins", () => {
    expect(axisZoomMargins(PRICE, 0.1)).toEqual({ top: 0.2, bottom: 0.18 });
  });

  it("clamps each margin to [0, 0.49]", () => {
    // upper: base.top 0.1 + 0.5 would be 0.6 → clamped to 0.49
    expect(axisZoomMargins(PRICE, 0.5)).toEqual({ top: 0.49, bottom: 0.49 });
    // lower: base.bottom 0.08 - 0.2 would be negative → clamped to 0
    expect(axisZoomMargins(PRICE, -0.2)).toEqual({ top: 0, bottom: 0 });
  });

  it("is the identity at zoom 0 (unchanged base margins)", () => {
    expect(axisZoomMargins(PRICE, 0)).toEqual(PRICE);
  });

  it("reaches bottom exactly 0 at the negative clamp floor (no overshoot)", () => {
    const floor = clampAxisZoom(PRICE, -1); // = -0.08
    expect(axisZoomMargins(PRICE, floor).bottom).toBe(0);
  });
});

describe("wheelDeltaToZoomStep", () => {
  it("scales pixel-mode delta by 0.0004", () => {
    expect(wheelDeltaToZoomStep(100, 0)).toBeCloseTo(0.04, 10);
  });

  it("multiplies line-mode (deltaMode 1) delta by 16 before scaling", () => {
    // one line ≈ 16px, so line-mode 1 must equal pixel-mode 16
    expect(wheelDeltaToZoomStep(1, 1)).toBeCloseTo(wheelDeltaToZoomStep(16, 0), 10);
    expect(wheelDeltaToZoomStep(1, 1)).toBeCloseTo(16 * 0.0004, 10);
  });

  it("preserves sign (scroll up vs down)", () => {
    expect(wheelDeltaToZoomStep(-50, 0)).toBeCloseTo(-wheelDeltaToZoomStep(50, 0), 10);
  });
});

describe("accumulate + clamp (as ChartPanel drives it)", () => {
  // ChartPanel keeps a running zoom, adds each notch's step, then clamps.
  const step = (zoom: number, deltaY: number, deltaMode = 0) =>
    clampAxisZoom(PRICE, zoom + wheelDeltaToZoomStep(deltaY, deltaMode));

  it("returns to the start within float epsilon after equal up/down steps", () => {
    let z = 0;
    z = step(z, 120); // scroll down
    z = step(z, -120); // scroll back up
    expect(z).toBeCloseTo(0, 10);
    expect(axisZoomMargins(PRICE, z)).toEqual(
      expect.objectContaining({
        top: expect.closeTo(PRICE.top, 10),
        bottom: expect.closeTo(PRICE.bottom, 10),
      }),
    );
  });
});
