import { TickMarkType, type Time } from "lightweight-charts";

export type ChartHourFormat = "12" | "24";
export const MAX_DAY_TICK_SPAN_DAYS = 120;

function utcDate(time: Time): Date {
  if (typeof time === "number") return new Date(Number(time) * 1000);
  if (typeof time === "string") return new Date(`${time.slice(0, 10)}T00:00:00Z`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

export function chartTimeSpanDays(from: Time, to: Time): number | null {
  const fromDate = utcDate(from);
  const toDate = utcDate(to);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return null;
  return Math.abs(toDate.getTime() - fromDate.getTime()) / 86_400_000;
}

/**
 * Keep calendar ticks adaptive by returning null for year/month/day labels.
 * Lightweight Charts then applies its zoom-aware formatter:
 * year → abbreviated month → day number as the visible range tightens.
 *
 * Only 12-hour clock labels need a custom value. The default 24-hour clock
 * also returns null so the library retains its own collision-safe formatting.
 */
export function formatChartTimeTick(
  time: Time,
  tickMarkType: TickMarkType,
  hourFormat: ChartHourFormat,
  visibleSpanDays: number | null = null,
  locale = "default",
): string | null {
  if (tickMarkType === TickMarkType.DayOfMonth && visibleSpanDays != null && visibleSpanDays > MAX_DAY_TICK_SPAN_DAYS) {
    const date = utcDate(time);
    if (!Number.isFinite(date.getTime())) return "";
    // A lower-priority tick in the first week often occupies a missing month
    // boundary on sparse/resampled data. Use the month name there; suppress
    // later orphan dates such as a lone "27" at the far edge.
    if (date.getUTCDate() <= 7) {
      return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date);
    }
    return "";
  }
  if (hourFormat !== "12") return null;
  if (tickMarkType !== TickMarkType.Time && tickMarkType !== TickMarkType.TimeWithSeconds) return null;

  const date = utcDate(time);
  if (!Number.isFinite(date.getTime())) return null;
  const hour24 = date.getUTCHours();
  const hour = hour24 % 12 || 12;
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  if (tickMarkType === TickMarkType.TimeWithSeconds) {
    const second = String(date.getUTCSeconds()).padStart(2, "0");
    return `${hour}:${minute}:${second}`;
  }
  return `${hour}:${minute} ${hour24 >= 12 ? "PM" : "AM"}`;
}

/**
 * Keep calendar labels sensitive to the currently visible time span. The
 * callback is read at paint time so zooming can switch cleanly between the
 * month/year hierarchy and useful day numbers without rebuilding the chart.
 */
export function chartTimeAxisOptions(
  hourFormat: ChartHourFormat,
  visibleSpanDays: () => number | null = () => null,
) {
  return {
    tickMarkFormatter: (time: Time, tickMarkType: TickMarkType, locale: string) =>
      formatChartTimeTick(time, tickMarkType, hourFormat, visibleSpanDays(), locale),
  } as const;
}
