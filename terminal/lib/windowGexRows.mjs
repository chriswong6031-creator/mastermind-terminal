/**
 * Pure utility — filters GEX strike rows to within `pct` of spotRef.
 * Exported as plain .mjs so both the TS source (via re-export) and the
 * node test file can import it without a tsx compile step.
 *
 * @param {Array<{strike: number}>} rows
 * @param {number} spotRef
 * @param {number} pct  e.g. 0.10 for ±10%
 * @returns {Array<{strike: number}>}
 */
export function windowGexRows(rows, spotRef, pct) {
  if (!spotRef || !rows.length) return rows;
  const lo = spotRef * (1 - pct);
  const hi = spotRef * (1 + pct);
  return rows.filter((r) => r.strike >= lo && r.strike <= hi);
}
