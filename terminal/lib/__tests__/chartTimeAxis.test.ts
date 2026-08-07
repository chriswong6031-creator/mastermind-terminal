import { describe, expect, it } from "vitest";
import { TickMarkType, type UTCTimestamp } from "lightweight-charts";
import { chartTimeAxisOptions, chartTimeSpanDays, formatChartTimeTick } from "../chartTimeAxis";

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

  it("suppresses isolated late-month days on wide calendar ranges", () => {
    const options = chartTimeAxisOptions("24", () => 365);
    expect(options.tickMarkFormatter("2026-07-27", TickMarkType.DayOfMonth, "en-US")).toBe("");
  });

  it("turns a first-week filler tick into its missing month label on wide ranges", () => {
    expect(formatChartTimeTick("2026-03-06", TickMarkType.DayOfMonth, "24", 365, "en-US")).toBe("Mar");
  });

  it("restores normal day-number formatting after zooming inside four months", () => {
    expect(formatChartTimeTick("2026-07-27", TickMarkType.DayOfMonth, "24", 90, "en-US")).toBeNull();
  });

  it("measures the visible calendar span for the formatter threshold", () => {
    expect(chartTimeSpanDays("2026-05-01", "2026-07-30")).toBe(90);
  });
});
