// Type declaration for the plain-.mjs pure util (see windowGexRows.mjs).
// Generic in the row element so the caller's row type flows through the filter.
export function windowGexRows<T extends { strike: number }>(
  rows: T[],
  spotRef: number,
  pct: number,
): T[];
