import { describe, it, expect } from "vitest";
import { priceTagTop, crosshairLabelHalf, TAG_DODGE_GAP } from "../priceTagPlacement";

// Shipped geometry: 12px axis font → an 11px label half-height; the web badge measures ~13px
// each side of its anchor (symbol + price + countdown on one line).
const HALF = crosshairLabelHalf(12);
const TAG = { up: 13, down: 13 };
const PANE = 556;                 // price-pane height measured at 1440×900 with one sub-pane
const top = (anchor: number, crossY: number | null, tag = TAG, paneH = PANE) =>
  priceTagTop(anchor, crossY, tag, HALF, paneH);

describe("crosshairLabelHalf", () => {
  it("matches lightweight-charts' label box (fs + 2×3/12·fs + 2×2/12·fs, halved)", () => {
    expect(crosshairLabelHalf(12)).toBeCloseTo(11, 10);
    expect(crosshairLabelHalf(13)).toBeCloseTo(13 * 11 / 12, 10);
  });
  it("falls back to the 12px default for a missing font size", () => {
    expect(crosshairLabelHalf(0)).toBeCloseTo(11, 10);
  });
});

describe("priceTagTop", () => {
  it("keeps the badge on the price when no crosshair is on the pane", () => {
    expect(top(190, null)).toBe(190);
  });

  it("keeps the badge on the price when the crosshair label clears it", () => {
    // clearance = tag.up + HALF + gap = 13 + 11 + 3 = 27
    expect(top(190, 190 - 28)).toBe(190);
    expect(top(190, 190 + 28)).toBe(190);
  });

  it("moves the badge below a colliding label — including a dead-on hover", () => {
    const expected = 190 + HALF + TAG_DODGE_GAP + TAG.up;   // 217
    expect(top(190, 190)).toBeCloseTo(expected, 10);
    // the badge's top edge sits exactly `gap` under the label's bottom edge
    expect(top(190, 190) - TAG.up - (190 + HALF)).toBeCloseTo(TAG_DODGE_GAP, 10);
  });

  it("dodges a label that overlaps from either side", () => {
    expect(top(190, 175)).toBeCloseTo(175 + HALF + TAG_DODGE_GAP + TAG.up, 10);
    expect(top(190, 205)).toBeCloseTo(205 + HALF + TAG_DODGE_GAP + TAG.up, 10);
  });

  it("flips above the label when there is no room below", () => {
    const anchor = PANE - 8;                                 // last price pinned to the pane floor
    const placed = top(anchor, anchor);
    expect(placed).toBeCloseTo(anchor - HALF - TAG_DODGE_GAP - TAG.down, 10);
    expect(placed + TAG.down).toBeLessThanOrEqual(anchor - HALF);   // clear of the label
    expect(placed - TAG.up).toBeGreaterThanOrEqual(0);              // still inside the pane
  });

  it("stays below when neither side fits (pane shorter than the two boxes)", () => {
    const tiny = 30;
    expect(top(15, 15, TAG, tiny)).toBeCloseTo(15 + HALF + TAG_DODGE_GAP + TAG.up, 10);
  });

  it("honours an asymmetric badge box (shell mode lifts the countdown below the badge)", () => {
    const shellTag = { up: 9, down: 23 };                    // countdown hangs outside the badge
    // below-placement anchors off `up`, above-placement off `down`
    expect(top(190, 190, shellTag)).toBeCloseTo(190 + HALF + TAG_DODGE_GAP + shellTag.up, 10);
    const anchor = PANE - 8;
    expect(top(anchor, anchor, shellTag)).toBeCloseTo(anchor - HALF - TAG_DODGE_GAP - shellTag.down, 10);
    // an asymmetric box still collides on the side its long tail reaches
    expect(top(190, 190 + 33, shellTag)).not.toBe(190);
    expect(top(190, 190 - 33, shellTag)).toBe(190);
  });

  it("ignores a non-finite crosshair coordinate", () => {
    expect(top(190, NaN)).toBe(190);
  });
});
