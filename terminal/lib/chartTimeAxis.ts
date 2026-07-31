import { TickMarkType, type Time } from "lightweight-charts";

export type ChartHourFormat = "12" | "24";

function utcDate(time: Time): Date {
  if (typeof time === "number") return new Date(Number(time) * 1000);
  if (typeof time === "string") return new Date(`${time.slice(0, 10)}T00:00:00Z`);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
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
): string | null {
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
