/**
 * Pure selector for the R5 put/call open-interest history surface.
 *
 * Source rows come directly from options_hub.oi_time/v1. The only derived
 * value is put_oi / call_oi. Invalid or non-positive call-OI denominators stay
 * null so charts break at the gap instead of inventing a zero or carrying a
 * neighboring value across it.
 */

export interface PutCallOiSourceRow {
  date?: unknown;
  call_oi?: unknown;
  put_oi?: unknown;
}

export interface PutCallOiHistoryPoint {
  date: string;
  epoch: number;
  callOi: number | null;
  putOi: number | null;
  ratio: number | null;
}

export interface PutCallOiHistorySummary {
  validSessionCount: number;
  latest: PutCallOiHistoryPoint | null;
  low: number | null;
  high: number | null;
}

function validIsoDate(value: unknown): { date: string; epoch: number } | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const epoch = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== date) return null;
  return { date, epoch };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Sort and de-duplicate dated source rows while retaining invalid ratios as
 * explicit gaps. When a malformed payload repeats a date, the last row wins,
 * matching the usual overwrite-in-place snapshot convention.
 */
export function selectPutCallOiHistory(
  sourceRows: readonly (PutCallOiSourceRow | null | undefined)[] | null | undefined,
): PutCallOiHistoryPoint[] {
  const byDate = new Map<string, PutCallOiHistoryPoint>();
  for (const source of sourceRows ?? []) {
    if (!source || typeof source !== "object") continue;
    const stamp = validIsoDate(source.date);
    if (!stamp) continue;
    const callOi = finiteNumber(source.call_oi);
    const putOi = finiteNumber(source.put_oi);
    const ratio = callOi != null && callOi > 0 && putOi != null && putOi >= 0
      ? putOi / callOi
      : null;
    byDate.set(stamp.date, {
      ...stamp,
      callOi,
      putOi,
      ratio: ratio != null && Number.isFinite(ratio) ? ratio : null,
    });
  }
  return [...byDate.values()].sort((a, b) => a.epoch - b.epoch);
}

export function summarizePutCallOiHistory(
  points: readonly PutCallOiHistoryPoint[],
): PutCallOiHistorySummary {
  const valid = points.filter(
    (point): point is PutCallOiHistoryPoint & { ratio: number } =>
      typeof point.ratio === "number" && Number.isFinite(point.ratio),
  );
  if (valid.length === 0) {
    return { validSessionCount: 0, latest: null, low: null, high: null };
  }
  return {
    validSessionCount: valid.length,
    latest: valid[valid.length - 1],
    low: Math.min(...valid.map((point) => point.ratio)),
    high: Math.max(...valid.map((point) => point.ratio)),
  };
}
