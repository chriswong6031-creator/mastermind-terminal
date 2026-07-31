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
  return bars.filter((bar) => {
    const minute = displayMinuteOfDay(bar[0]);
    return minute >= start && minute < end;
  });
}

// Resample only after session filtering and anchor buckets to the selected
// session open. Absolute-hour bucketing creates a 09:00 candle and can mix
// premarket prints into a regular-session hourly candle.
export function resampleUsEquitySession(
  bars: Bar6[],
  minutes: number,
  session: UsEquitySession,
): Bar6[] {
  if (minutes <= 1 || bars.length === 0) return bars;
  const anchorMinute = session === "extended" ? US_EXTENDED_START : US_REGULAR_START;
  const span = minutes * 60;
  const out: Bar6[] = [];
  let current: Bar6 | null = null;
  let key = Number.NaN;
  for (const bar of bars) {
    const dayStart = Math.floor(bar[0] / 86400) * 86400;
    const offset = bar[0] - dayStart - anchorMinute * 60;
    const bucket = dayStart + anchorMinute * 60 + Math.floor(offset / span) * span;
    if (bucket !== key) {
      if (current) out.push(current);
      key = bucket;
      current = [bucket, bar[1], bar[2], bar[3], bar[4], bar[5]];
    } else {
      current![2] = Math.max(current![2], bar[2]);
      current![3] = Math.min(current![3], bar[3]);
      current![4] = bar[4];
      current![5] += bar[5];
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * "HH:MM" ET on a session date → the app's DISPLAY-EPOCH seconds.
 *
 * THE CONVENTION (see `etDisplay` in intradaySources): every provider's bars are emitted as a
 * "display epoch" — the market-local wall clock read AS IF it were UTC. A 09:31 ET bar becomes
 * 09:31Z, not 13:31Z. Lightweight-Charts renders timestamps in UTC, so this is what makes the
 * time axis read as the local session clock without any per-chart timezone plumbing.
 *
 * Anything drawn on the same axis as intraday candles MUST use this convention. Building the
 * true UTC instant instead (e.g. `new Date("<date>T09:31:00-04:00")`) silently shifts a series by
 * the market's UTC offset — 4h in EDT, 5h in EST — which is how the surface heat field ended up
 * plotted four hours to the right of its own candles and axis-labelled 13:31 for the 09:31 column.
 *
 * Deliberately arithmetic-only: no Intl, no DST lookup. The offset is not needed — and must not be
 * applied — because the wall-clock components ARE the output. Returns NaN on unparseable input so
 * callers can drop the point rather than plot it at the epoch.
 */
export function sessionEpoch(sessionDate: string, hhmm: string): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!d || !t) return NaN;
  return Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) / 1000;
}
