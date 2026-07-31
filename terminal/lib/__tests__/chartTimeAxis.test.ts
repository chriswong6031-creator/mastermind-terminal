import { describe, expect, it } from "vitest";
import { TickMarkType, type UTCTimestamp } from "lightweight-charts";
import { formatChartTimeTick } from "../chartTimeAxis";

const instant = (Date.UTC(2026, 6, 30, 17, 5, 9) / 1000) as UTCTimestamp;

describe("adaptive chart time-axis labels", () => {
  it.each([
    TickMarkType.Year,
    TickMarkType.Month,
    TickMarkType.DayOfMonth,
  ])("delegates calendar tick type %s to the zoom-aware library formatter", (tickMarkType) => {
    expect(formatChartTimeTick("2026-07-30", tickMarkType, "24")).toBeNull();
    expect(formatChartTimeTick("2026-07-30", tickMarkType, "12")).toBeNull();
  });

  it("delegates the default 24-hour clock to the library formatter", () => {
    expect(formatChartTimeTick(instant, TickMarkType.Time, "24")).toBeNull();
  });

  it("formats the optional 12-hour clock without exceeding eight characters", () => {
    const label = formatChartTimeTick(instant, TickMarkType.Time, "12");
    expect(label).toBe("5:05 PM");
    expect(label?.length).toBeLessThanOrEqual(8);
  });
});
