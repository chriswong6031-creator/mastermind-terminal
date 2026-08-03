import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHART_RIGHT_OFFSET,
  DEFAULT_CHART_VIEW_BARS,
  normalizedChartLogicalRange,
} from "@/lib/chart-engine/viewReset";

describe("normalizedChartLogicalRange", () => {
  it("restores the recent default window instead of fitting a long history", () => {
    expect(normalizedChartLogicalRange(1_200, false)).toEqual({
      from: 1_200 - DEFAULT_CHART_VIEW_BARS,
      to: 1_200 - 1 + DEFAULT_CHART_RIGHT_OFFSET,
    });
  });

  it("fits a history that is already shorter than the default window", () => {
    expect(normalizedChartLogicalRange(DEFAULT_CHART_VIEW_BARS, false)).toBeNull();
  });

  it("fits the currently available replay slice", () => {
    expect(normalizedChartLogicalRange(1_200, true)).toBeNull();
  });
});
