export const DEFAULT_CHART_VIEW_BARS = 240;
export const DEFAULT_CHART_RIGHT_OFFSET = 6;

export type ChartLogicalRange = { from: number; to: number };

/**
 * Return the Terminal's normal recent-bar viewport. A null range means the
 * available slice is already small enough (or replay is active), so fitting
 * that slice is the least surprising view.
 */
export function normalizedChartLogicalRange(
  rowCount: number,
  replayActive: boolean,
): ChartLogicalRange | null {
  const count = Math.max(0, Math.floor(rowCount));
  if (replayActive || count <= DEFAULT_CHART_VIEW_BARS) return null;

  return {
    from: count - DEFAULT_CHART_VIEW_BARS,
    to: count - 1 + DEFAULT_CHART_RIGHT_OFFSET,
  };
}
