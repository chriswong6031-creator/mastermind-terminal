export const DEFAULT_CHART_VIEW_BARS = 240;
export const DEFAULT_CHART_RIGHT_OFFSET = 24;
export const DEFAULT_CHART_RIGHT_BUFFER_PX = 80;

export type ChartLogicalRange = { from: number; to: number };

/**
 * Convert the desired visual clearance into logical bars. Narrow charts need
 * more future bars because the normalized 240-bar window compresses each bar.
 * Cap the blank region at 30% so an exceptionally narrow pane stays useful.
 */
export function defaultChartRightOffset(plotWidth?: number): number {
  if (plotWidth == null || !Number.isFinite(plotWidth) || plotWidth <= 0) {
    return DEFAULT_CHART_RIGHT_OFFSET;
  }
  const width = Math.max(1, plotWidth);
  const bufferPx = Math.min(DEFAULT_CHART_RIGHT_BUFFER_PX, width * 0.3);
  const plottedBars = DEFAULT_CHART_VIEW_BARS - 1;
  return Math.max(
    DEFAULT_CHART_RIGHT_OFFSET,
    Math.ceil((bufferPx * plottedBars) / Math.max(1, width - bufferPx)),
  );
}

/**
 * Return the Terminal's normal recent-bar viewport. A null range means the
 * available slice is already small enough (or replay is active), so fitting
 * that slice is the least surprising view.
 */
export function normalizedChartLogicalRange(
  rowCount: number,
  replayActive: boolean,
  plotWidth?: number,
): ChartLogicalRange | null {
  const count = Math.max(0, Math.floor(rowCount));
  if (replayActive || count <= DEFAULT_CHART_VIEW_BARS) return null;

  return {
    from: count - DEFAULT_CHART_VIEW_BARS,
    to: count - 1 + defaultChartRightOffset(plotWidth),
  };
}
