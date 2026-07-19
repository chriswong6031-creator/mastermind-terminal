import { describe, it, expect } from "vitest";
import {
  arcStateColor,
  clampArcValue,
  arcGeometry,
  ARC_SWEEP_DEG,
} from "@/components/ui/ArcGauge";
import { placeTip, isWarm, type Rect } from "@/components/ui/Tip";

// DOM-light smoke tests: exercise the pure logic the primitives depend on
// (arc geometry + state color + tip flip/clamp + warm-open window). The vitest
// env is node (no jsdom), so we test the exported functions, not the render tree.

describe("ArcGauge logic", () => {
  it("maps each state to exactly one design token; neutral is grey, never red", () => {
    expect(arcStateColor("bull")).toBe("var(--up)");
    expect(arcStateColor("bear")).toBe("var(--down)");
    expect(arcStateColor("warn")).toBe("var(--signal)");
    // "no signal must look like no signal": neutral is the muted text token, not --down
    expect(arcStateColor("neutral")).toBe("var(--text-2)");
    expect(arcStateColor("neutral")).not.toBe("var(--down)");
  });

  it("clamps values into 0–100 and treats NaN as 0", () => {
    expect(clampArcValue(50)).toBe(50);
    expect(clampArcValue(-20)).toBe(0);
    expect(clampArcValue(140)).toBe(100);
    expect(clampArcValue(Number.NaN)).toBe(0);
    expect(clampArcValue(Infinity)).toBe(0);
  });

  it("sweeps 240° and offsets from full (empty) at 0 to zero at 100", () => {
    const r = 50;
    const g0 = arcGeometry(r, 0);
    const g100 = arcGeometry(r, 100);
    const gMid = arcGeometry(r, 50);
    // arc length is 240/360 of the full circle
    expect(g0.arcLen).toBeCloseTo(g0.full * (ARC_SWEEP_DEG / 360), 6);
    // value 0 → fully unfilled (offset === arcLen); value 100 → fully filled (offset 0)
    expect(g0.offset).toBeCloseTo(g0.arcLen, 6);
    expect(g100.offset).toBeCloseTo(0, 6);
    // 50% sits halfway
    expect(gMid.offset).toBeCloseTo(gMid.arcLen / 2, 6);
  });
});

describe("Tip positioning + warm-open", () => {
  const anchor = (x: number, y: number, w = 40, h = 40): Rect => ({
    left: x, top: y, right: x + w, bottom: y + h, width: w, height: h,
  });
  const vp = { width: 1000, height: 800 };
  const tip = { width: 120, height: 32 };

  it("keeps the preferred side when it fits", () => {
    const p = placeTip(anchor(500, 400), tip, "top", vp);
    expect(p.side).toBe("top");
    // centered horizontally over a 40px anchor
    expect(p.left).toBe(Math.round(500 + 20 - 60));
  });

  it("flips to the opposite side when the preferred side would overflow", () => {
    // anchor pinned to the top edge → 'top' can't fit, must flip to 'bottom'
    const p = placeTip(anchor(500, 2), tip, "top", vp);
    expect(p.side).toBe("bottom");
    expect(p.top).toBeGreaterThanOrEqual(2 + 40); // below the anchor
  });

  it("clamps the cross-axis so the tip never leaves the viewport", () => {
    // anchor hard against the right edge, side=right would overflow horizontally
    const p = placeTip(anchor(960, 400), tip, "right", vp);
    expect(p.left + tip.width).toBeLessThanOrEqual(vp.width - 8 + 0.5);
    expect(p.left).toBeGreaterThanOrEqual(8);
  });

  it("warm-open window: a recent close opens the next tip with no delay", () => {
    const now = 10_000;
    expect(isWarm(now, now - 100)).toBe(true);   // closed 100ms ago → warm
    expect(isWarm(now, now - 500)).toBe(false);  // closed 500ms ago → cold
    expect(isWarm(now, now - 299)).toBe(true);   // boundary just inside
    expect(isWarm(now, now - 300)).toBe(false);  // boundary at the edge
  });
});
