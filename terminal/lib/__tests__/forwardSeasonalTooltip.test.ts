import { describe, expect, it } from "vitest";
import { forwardSeasonalTooltipRows } from "../forwardSeasonalTooltip";

describe("forward seasonal timeline tooltip", () => {
  const multiMonthWindow = {
    dir: "bull" as const,
    expected_move: 17.24,
    typical_move: 14.96,
    win_rate: 0.741,
    n: 27,
    n_eff: 27,
    lo: -3.82,
    hi: 36.7,
    evidence_score: 85,
    confidence: "high" as const,
  };

  it("keeps a multi-month window to a bounded interval summary", () => {
    const rows = forwardSeasonalTooltipRows(multiMonthWindow);

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.label)).toEqual([
      "Typical move",
      "Positive years",
      "Middle range",
      "Support",
      "Effective years",
    ]);
    expect(rows.map((row) => row.value)).toEqual([
      "+15.0%",
      "74%",
      "−3.8% … +36.7%",
      "High · 85/100",
      "27",
    ]);
  });

  it("stays compact when optional range and evidence values are absent", () => {
    const rows = forwardSeasonalTooltipRows({
      ...multiMonthWindow,
      lo: null,
      hi: null,
      evidence_score: undefined,
      confidence: "low",
      n_eff: 10.7,
    });

    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row.label === "Support")?.value).toBe("Low");
    expect(rows.find((row) => row.label === "Effective years")?.value).toBe("10.7");
  });
});
