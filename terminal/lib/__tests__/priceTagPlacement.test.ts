import { describe, expect, it } from "vitest";
import {
  PRICE_TAG_ROW_HEIGHT,
  PRICE_TAG_TIME_HEIGHT,
  PRICE_TAG_MIN_VALUE_WIDTH,
  priceTagRowTop,
  priceScaleDisplayValue,
  secondaryPriceTagTop,
} from "../priceTagPlacement";

const place = (
  primaryY: number,
  secondaryY: number,
  paneHeight = 556,
  primaryHeight = PRICE_TAG_ROW_HEIGHT + PRICE_TAG_TIME_HEIGHT,
) => secondaryPriceTagTop({ primaryY, secondaryY, paneHeight, primaryHeight });

describe("persistent price-tag geometry", () => {
  it("locks the compact TradingView row and numeric-lane dimensions", () => {
    expect(PRICE_TAG_ROW_HEIGHT).toBe(17);
    expect(PRICE_TAG_TIME_HEIGHT).toBe(14);
    expect(PRICE_TAG_MIN_VALUE_WIDTH).toBe(66);
  });

  it("centres the 17px price row on its real coordinate using integer pixels", () => {
    expect(priceTagRowTop(190)).toBe(182);
    expect(priceTagRowTop(190.49)).toBe(182);
    expect(priceTagRowTop(190.51)).toBe(183);
  });
});

describe("priceScaleDisplayValue", () => {
  it("matches percentage and IndexedTo100 scale units", () => {
    expect(priceScaleDisplayValue(120, 80, 2)).toBe(50);
    expect(priceScaleDisplayValue(120, 80, 3)).toBe(150);
  });

  it("keeps Normal/Logarithmic values raw and fails safely without a usable base", () => {
    expect(priceScaleDisplayValue(120, 80, 0)).toBe(120);
    expect(priceScaleDisplayValue(120, 80, 1)).toBe(120);
    expect(priceScaleDisplayValue(120, 0, 2)).toBe(120);
    expect(priceScaleDisplayValue(120, null, 3)).toBe(120);
  });
});

describe("secondaryPriceTagTop", () => {
  it("docks an equal/near extended price immediately above the pinned current row", () => {
    const primaryTop = priceTagRowTop(190);
    expect(place(190, 190)).toBe(primaryTop - PRICE_TAG_ROW_HEIGHT);
    expect(place(190, 175)).toBe(primaryTop - PRICE_TAG_ROW_HEIGHT);
    // Half-open rows: exactly touching at 17px separation is not an overlap.
    expect(place(190, 173)).toBe(priceTagRowTop(173));
  });

  it("leaves a diverged extended price on its natural projected coordinate", () => {
    expect(place(190, 150)).toBe(priceTagRowTop(150));
    expect(place(190, 240)).toBe(priceTagRowTop(240));
  });

  it("puts a lower extended price below the complete current price + time footprint", () => {
    const primaryTop = priceTagRowTop(190);
    expect(place(190, 200)).toBe(primaryTop + PRICE_TAG_ROW_HEIGHT + PRICE_TAG_TIME_HEIGHT);
  });

  it("uses only the price-row footprint when countdown display is disabled", () => {
    const primaryTop = priceTagRowTop(190);
    expect(place(190, 200, 556, PRICE_TAG_ROW_HEIGHT)).toBe(primaryTop + PRICE_TAG_ROW_HEIGHT);
  });

  it("flips the secondary row below when the primary is against the pane top", () => {
    const primaryTop = priceTagRowTop(10);
    expect(place(10, 10, 100)).toBe(primaryTop + PRICE_TAG_ROW_HEIGHT + PRICE_TAG_TIME_HEIGHT);
  });

  it("flips the secondary row above when the primary footprint reaches the pane floor", () => {
    const primaryTop = priceTagRowTop(95);
    expect(place(95, 96, 100)).toBe(primaryTop - PRICE_TAG_ROW_HEIGHT);
  });

  it("clamps a naturally off-pane secondary row without moving the primary", () => {
    expect(place(190, -50, 300)).toBe(0);
    expect(place(190, 500, 300)).toBe(300 - PRICE_TAG_ROW_HEIGHT);
  });
});
