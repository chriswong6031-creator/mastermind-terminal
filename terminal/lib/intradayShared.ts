// Pure, node:fs-free helpers shared between intradaySources (client-shared) and intradayStore
// (server-only, node:fs). NO imports beyond this file — keeping it dep-free is what makes it safe
// to import from both sides of the client/server boundary.
//
// Turbopack rule: a module that client code transitively imports must not pull in node: builtins.
// intradaySources is imported by ChartPanel/TerminalShell/TechnicalsPage (all client components),
// so intradaySources must stay free of node:fs. intradayStore owns all fs access and is imported
// ONLY by the route. This shared module sits in between — no fs, no problem on either side.

export type Bar6 = [number, number, number, number, number, number];

export const INTRADAY_TFS = ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "45m", "1h", "2h", "3h", "4h"] as const;
const INTRADAY_SET: ReadonlySet<string> = new Set(INTRADAY_TFS);
export const isIntradayTf = (tf: string) => INTRADAY_SET.has(tf);

export function tfMinutes(tf: string): number {
  const m = /^(\d+)(m|h)$/.exec(tf);
  if (!m) return 0;
  const n = parseInt(m[1], 10) || 1;
  return m[2] === "h" ? n * 60 : n;
}

export type Market = "cn" | "hk" | "crypto" | "us" | "ca";
export function classify(sym: string): Market {
  if (/\.(SS|SZ)$/i.test(sym)) return "cn";
  if (/\.HK$/i.test(sym)) return "hk";
  if (/\.TO$/i.test(sym)) return "ca";
  if (/-USD$/i.test(sym)) return "crypto";
  return "us";
}

// Aggregate base bars into coarser `minutes` buckets, keyed by absolute (display-)epoch so buckets
// align to local clock boundaries. Bar6 layout: [epoch, open, high, low, close, vol].
export function resample(bars: Bar6[], minutes: number): Bar6[] {
  if (minutes <= 0 || bars.length === 0) return bars;
  const span = minutes * 60;
  const out: Bar6[] = [];
  let cur: Bar6 | null = null;
  let key = NaN;
  for (const b of bars) {
    const k = Math.floor(b[0] / span);
    if (k !== key) { if (cur) out.push(cur); key = k; cur = [k * span, b[1], b[2], b[3], b[4], b[5]]; }
    else { cur![2] = Math.max(cur![2], b[2]); cur![3] = Math.min(cur![3], b[3]); cur![4] = b[4]; cur![5] += b[5]; }
  }
  if (cur) out.push(cur);
  return out;
}

export type UsEquitySession = "regular" | "extended";
const US_REGULAR_START = 9 * 60 + 30;
const US_REGULAR_END = 16 * 60;
const US_EXTENDED_START = 4 * 60;
const US_EXTENDED_END = 20 * 60;

function displayMinuteOfDay(epoch: number): number {
  return ((Math.floor(epoch / 60) % 1440) + 1440) % 1440;
}

// US bars use a display epoch whose UTC clock components equal ET wall time.
// This lets the session filter stay DST-safe without converting the timestamp
// again: 09:30 in the display epoch is always the exchange's 09:30.
export function filterUsEquitySession(bars: Bar6[], session: UsEquitySession): Bar6[] {
  const start = session === "extended" ? US_EXTENDED_START : US_REGULAR_START;
  const end = session === "extended" ? US_EXTENDED_END : US_REGULAR_END;
  return bars.filter((b) => {
    const m = displayMinuteOfDay(b[0]);
    return m >= start && m < end;
  });
}

// Resample after session filtering and anchor buckets to the selected session
// open (09:30 regular, 04:00 extended). Absolute-hour bucketing would create a
// partial 09:00 bar and can mix premarket prints into an hourly regular candle.
export function resampleUsEquitySession(
  bars: Bar6[],
  minutes: number,
  session: UsEquitySession,
): Bar6[] {
  if (minutes <= 1 || bars.length === 0) return bars;
  const anchorMin = session === "extended" ? US_EXTENDED_START : US_REGULAR_START;
  const span = minutes * 60;
  const out: Bar6[] = [];
  let cur: Bar6 | null = null;
  let key = Number.NaN;
  for (const b of bars) {
    const dayStart = Math.floor(b[0] / 86400) * 86400;
    const offsetSec = b[0] - dayStart - anchorMin * 60;
    const k = dayStart + anchorMin * 60 + Math.floor(offsetSec / span) * span;
    if (k !== key) {
      if (cur) out.push(cur);
      key = k;
      cur = [k, b[1], b[2], b[3], b[4], b[5]];
    } else {
      cur![2] = Math.max(cur![2], b[2]);
      cur![3] = Math.min(cur![3], b[3]);
      cur![4] = b[4];
      cur![5] += b[5];
    }
  }
  if (cur) out.push(cur);
  return out;
}
