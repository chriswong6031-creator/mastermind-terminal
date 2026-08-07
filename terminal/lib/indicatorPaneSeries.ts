type IndicatorPaneSeries = {
  applyOptions: (options: { priceLineVisible: boolean }) => void;
};

/**
 * Keep each series' existing right-axis label setting, but remove the native
 * horizontal line that Lightweight Charts draws from its latest value.
 *
 * Deliberate createPriceLine() guides (for example 80/50/20 or zero) are
 * separate primitives and remain visible.
 */
export function keepIndicatorPaneAxisLabelsOnly<T extends IndicatorPaneSeries>(series: T[]): T[] {
  for (const item of series) item.applyOptions({ priceLineVisible: false });
  return series;
}
