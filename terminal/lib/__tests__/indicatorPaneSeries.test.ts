import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { keepIndicatorPaneAxisLabelsOnly } from "@/lib/indicatorPaneSeries";

const chartPanel = readFileSync(
  path.resolve(__dirname, "..", "..", "components", "ChartPanel.tsx"),
  "utf8",
);

describe("indicator pane series display", () => {
  it("hides native latest-value lines without changing axis-label visibility", () => {
    const first = { applyOptions: vi.fn() };
    const second = { applyOptions: vi.fn() };
    const series = [first, second];

    expect(keepIndicatorPaneAxisLabelsOnly(series)).toBe(series);
    expect(first.applyOptions).toHaveBeenCalledWith({ priceLineVisible: false });
    expect(second.applyOptions).toHaveBeenCalledWith({ priceLineVisible: false });
    expect(first.applyOptions.mock.calls[0][0]).not.toHaveProperty("lastValueVisible");
    expect(second.applyOptions.mock.calls[0][0]).not.toHaveProperty("lastValueVisible");
  });

  it("applies the labels-only contract to full rebuilds and incremental pane additions", () => {
    expect(
      chartPanel.match(/series = keepIndicatorPaneAxisLabelsOnly\(series\);/g),
    ).toHaveLength(2);
  });
});
