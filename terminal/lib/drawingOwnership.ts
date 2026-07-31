/**
 * React identity for the imperative chart renderer. Authentication is part of
 * the identity because ChartPanel owns native pointer listeners and mutable
 * drafts that must never survive into another drawing owner.
 */
export function drawingPanelInstanceKey(ownerKey: string, symbol: string): string {
  return `${ownerKey}:${symbol}`;
}
