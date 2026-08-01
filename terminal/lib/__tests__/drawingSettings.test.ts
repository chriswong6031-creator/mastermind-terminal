import { describe, expect, it } from "vitest";
import { DEFAULT_FIBONACCI_LEVELS, FIBONACCI_LEVEL_SLOTS } from "@/lib/drawing-engine/geometry";
import { calculatePositionMetrics, fibonacciSettings, positionSettings } from "@/lib/drawing-engine/settings";

describe("drawing-specific settings", () => {
  it("exposes all 24 Fibonacci slots while preserving eleven defaults", () => {
    const settings = fibonacciSettings(undefined);
    expect(settings.levels).toHaveLength(24);
    expect(settings.levels.filter((level) => level.visible).map((level) => level.value)).toEqual([...DEFAULT_FIBONACCI_LEVELS]);
    expect(settings.levels.map((level) => level.value)).toEqual([...FIBONACCI_LEVEL_SLOTS]);
  });

  it("sanitizes persisted Fibonacci visibility, colors, reverse, and labels", () => {
    const settings = fibonacciSettings({
      fibReverse: true,
      fibLabels: "price",
      fibLevelStyles: [
        { value: -7.25, visible: true, color: "#112233" },
        { value: Number.POSITIVE_INFINITY, visible: "yes", color: "red" },
      ],
    });
    expect(settings).toMatchObject({ reverse: true, labels: "price" });
    expect(settings.levels[0]).toEqual({ value: -7.25, visible: true, color: "#112233" });
    expect(settings.levels[1].value).toBe(FIBONACCI_LEVEL_SLOTS[1]);
    expect(settings.levels[1].visible).toBe(false);
    expect(settings.levels[1].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("calculates fixed-risk position size and bounds unsafe preferences", () => {
    expect(positionSettings({ accountSize: -2, riskPercent: 500 })).toEqual({
      accountSize: 1,
      riskMode: "percent",
      riskPercent: 100,
      riskAmount: 1,
    });
    expect(calculatePositionMetrics(
      [{ t: "1", p: 100 }, { t: "2", p: 110 }, { t: "2", p: 95 }],
      { accountSize: 25_000, riskPercent: 2 },
    )).toMatchObject({
      riskBudget: 500,
      quantity: 100,
      positionValue: 10_000,
      targetProfit: 1_000,
      rewardRisk: 2,
    });
    expect(calculatePositionMetrics(
      [{ t: "1", p: 100 }, { t: "2", p: 110 }, { t: "2", p: 95 }],
      { accountSize: 25_000, riskMode: "money", riskAmount: 750 },
    )).toMatchObject({
      riskMode: "money",
      riskBudget: 750,
      quantity: 150,
      targetProfit: 1_500,
    });
  });
});
