import { describe, expect, it } from "vitest";
import { DETENT_DISMISS_SLACK, DETENT_FLICK_V, resolveDetentRelease } from "../sheetDetent";

// The phone's two drawers (Drawings / ticker picker via MobileSheet, and the Analysis hub) share
// this decision. 844px viewport, the contract phone height: resting 62% = 523, full 96% = 810.
const INITIAL = 523;
const FULL = 810;
const at = (height: number, startHeight: number, velocity: number) =>
  resolveDetentRelease({ height, startHeight, velocity, initial: INITIAL, full: FULL });

const SLOW = 0;
const FLICK_DOWN = DETENT_FLICK_V + 0.1;
const FLICK_UP = -(DETENT_FLICK_V + 0.1);

describe("resolveDetentRelease", () => {
  it("settles on the nearer detent when the finger was not thrown", () => {
    expect(at(540, INITIAL, SLOW)).toBe("initial");
    expect(at(700, INITIAL, SLOW)).toBe("full");
    expect(at(790, FULL, SLOW)).toBe("full");
  });

  it("dismisses a slow drag pulled clear under the resting detent", () => {
    expect(at(INITIAL - DETENT_DISMISS_SLACK - 1, INITIAL, SLOW)).toBe("dismiss");
    // …but not one that merely sags: the sheet springs back.
    expect(at(INITIAL - DETENT_DISMISS_SLACK + 1, INITIAL, SLOW)).toBe("initial");
  });

  it("takes a short flick DOWN one detent: full → resting, resting → gone", () => {
    // Barely moved, but thrown — distance alone would have kept both where they were.
    expect(at(FULL - 40, FULL, FLICK_DOWN)).toBe("initial");
    expect(at(INITIAL - 20, INITIAL, FLICK_DOWN)).toBe("dismiss");
  });

  it("dismisses a hard throw from full that clears the resting detent", () => {
    expect(at(INITIAL - DETENT_DISMISS_SLACK - 1, FULL, FLICK_DOWN)).toBe("dismiss");
  });

  it("opens on any flick UP, however short, from either detent", () => {
    expect(at(INITIAL + 20, INITIAL, FLICK_UP)).toBe("full");
    expect(at(INITIAL - 30, INITIAL, FLICK_UP)).toBe("full");
  });

  it("reads a mid-animation start height as the detent it is nearest", () => {
    // A second flick during the 240ms snap starts from wherever the sheet currently is; a height
    // still above the midpoint counts as coming FROM full, so it steps to resting, not away.
    expect(at(600, 700, FLICK_DOWN)).toBe("initial");
  });
});
