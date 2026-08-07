/**
 * Analysis-route identifier grammar.  It intentionally accepts the forms
 * investors actually share (`BRK.B`, `RDS-A`, `^NDX`) but never a value that
 * could be mistaken for a pathname, query string, or fallback alias.
 */
export const ANALYSIS_SYMBOL = /^(?:\^[A-Z0-9]+|[A-Z0-9]+(?:[.-][A-Z0-9]+)*)$/;

export function normalizeAnalysisSymbol(value: string | undefined): string | null {
  const symbol = value?.trim().toUpperCase() ?? "";
  if (!symbol || symbol.length > 24 || !ANALYSIS_SYMBOL.test(symbol)) return null;
  return symbol;
}
