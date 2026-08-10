import { describe, expect, it } from "vitest";
import {
  OPTIONS_CATEGORY_KEYS,
  OPTIONS_HUB_WORKSPACE_VIEWS,
  OPTIONS_IA_BY_CATEGORY,
  OPTIONS_IA_CATEGORIES,
  OPTIONS_IA_VIEW_BY_KEY,
  optionsCategoryForView,
} from "@/lib/optionsIa";

describe("Options seven-category IA", () => {
  it("keeps the masterplan category order exact", () => {
    expect(OPTIONS_IA_CATEGORIES.map((category) => category.key)).toEqual([
      "command",
      "flow",
      "exposure",
      "structure",
      "volatility",
      "statistics",
      "prophet",
    ]);
    expect(OPTIONS_CATEGORY_KEYS).toHaveLength(7);
  });

  it("places every existing Options workspace pane exactly once", () => {
    expect(OPTIONS_HUB_WORKSPACE_VIEWS).toHaveLength(14);
    expect(new Set(OPTIONS_HUB_WORKSPACE_VIEWS).size).toBe(14);
    expect([...OPTIONS_HUB_WORKSPACE_VIEWS].sort()).toEqual([
      "desk",
      "gex",
      "largest",
      "levels",
      "positioning",
      "prophet",
      "screener",
      "structure",
      "surface",
      "tape",
      "tickers",
      "tide",
      "volatility",
      "zero_dte",
    ]);
  });

  it("gives each category a deterministic home without inventing Statistics data", () => {
    for (const category of OPTIONS_IA_CATEGORIES) {
      if (category.key === "statistics") {
        expect(category.views).toEqual([]);
        expect(category.defaultView).toBe("statistics");
        continue;
      }
      expect(category.views.some((view) => view.key === category.defaultView)).toBe(true);
    }

    expect(OPTIONS_IA_BY_CATEGORY.flow.defaultView).toBe("tape");
    expect(OPTIONS_IA_VIEW_BY_KEY.zero_dte.pageKey).toBe("0dte");
    expect(OPTIONS_IA_VIEW_BY_KEY.largest.pageKey).toBe("largest");
    expect(OPTIONS_IA_VIEW_BY_KEY.screener.pageKey).toBe("vol");
    expect(optionsCategoryForView("zero_dte")).toBe("flow");
    expect(optionsCategoryForView("largest")).toBe("flow");
    expect(optionsCategoryForView("surface")).toBe("flow");
    expect(optionsCategoryForView("positioning")).toBe("exposure");
    expect(optionsCategoryForView("statistics")).toBe("statistics");
  });
});
