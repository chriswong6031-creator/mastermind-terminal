import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHART_RIGHT_OFFSET,
  DEFAULT_CHART_VIEW_BARS,
  defaultChartRightOffset,
  normalizedChartLogicalRange,
  withChartFutureOffset,
} from "@/lib/chart-engine/viewReset";

describe("normalizedChartLogicalRange", () => {
  it("reserves enough future bars to clear the last-price symbol tag", () => {
    expect(DEFAULT_CHART_RIGHT_OFFSET).toBe(24);
    expect(defaultChartRightOffset(904)).toBe(24);
    expect(defaultChartRightOffset(329)).toBe(77);
  });

  it("restores the recent default window instead of fitting a long history", () => {
    expect(normalizedChartLogicalRange(1_200, false)).toEqual({
      from: 1_200 - DEFAULT_CHART_VIEW_BARS,
      to: 1_200 - 1 + DEFAULT_CHART_RIGHT_OFFSET,
    });
  });

  it("extends explicit ranges into the empty future area", () => {
    expect(withChartFutureOffset({ from: 10, to: 50 })).toEqual({ from: 10, to: 50 + DEFAULT_CHART_RIGHT_OFFSET });
    expect(withChartFutureOffset({ from: 10, to: 50 }, 7)).toEqual({ from: 10, to: 57 });
    expect(withChartFutureOffset(null)).toBeNull();
  });

  it("fits a history that is already shorter than the default window", () => {
    expect(normalizedChartLogicalRange(DEFAULT_CHART_VIEW_BARS, false)).toBeNull();
  });

  it("fits the currently available replay slice", () => {
    expect(normalizedChartLogicalRange(1_200, true)).toBeNull();
  });
});
