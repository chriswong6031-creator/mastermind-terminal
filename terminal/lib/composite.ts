/**
 * composite.ts — parse, validate, and compute composite/basket symbols.
 *
 * A composite is a "+" delimited expression of 2–10 US equity legs,
 * e.g. "META+AVGO+AMZN+ARM+BABA".
 *
 * CONTRACT:
 *   - parseComposite: string → string[] | null  (null = not a composite)
 *   - isComposite: boolean guard
 *   - validateLegs: check each leg against a manifest
 *   - compositeLabel: canonical display label
 *   - alignAndSum: inner-join bars by date and sum OHLC (volume → 0)
 *   - compositeQuote: batch {last, prevClose} → summed last, chg%
 */

export const COMPOSITE_MAX_LEGS = 10;
export const COMPOSITE_SEPARATOR = "+";

/** Parse a composite expression. Returns null if it is not a composite. */
export function parseComposite(expr: string): string[] | null {
  if (!expr || !expr.includes(COMPOSITE_SEPARATOR)) return null;
  const legs = expr
    .split(COMPOSITE_SEPARATOR)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  // Must have 2–10 legs, each a valid ticker-shaped string (1-10 caps/digits/.)
  if (legs.length < 2 || legs.length > COMPOSITE_MAX_LEGS) return null;
  if (!legs.every((l) => /^[A-Z0-9.]{1,10}$/.test(l))) return null;
  return legs;
}

/** True if the string looks like a composite expression. */
export function isComposite(sym: string): boolean {
  return parseComposite(sym) !== null;
}

/** Canonical string for a set of legs (deduped, uppercase, joined). */
export function compositeExpr(legs: string[]): string {
  return legs.map((s) => s.toUpperCase()).join(COMPOSITE_SEPARATOR);
}

/** Short display label — up to 3 legs shown, then "…". */
export function compositeLabel(expr: string): string {
  const legs = parseComposite(expr);
  if (!legs) return expr;
  if (legs.length <= 3) return legs.join("+");
  return legs.slice(0, 3).join("+") + "+…";
}

/**
 * Validate that every leg exists in the manifest.
 * Returns { valid: true } | { valid: false; unknown: string[] }
 */
export function validateLegs(
  legs: string[],
  manifest: Record<string, unknown>
): { valid: true } | { valid: false; unknown: string[] } {
  const unknown = legs.filter((l) => !manifest[l]);
  if (unknown.length === 0) return { valid: true };
  return { valid: false, unknown };
}

type Bar = { time: string; o: number; h: number; l: number; c: number; v: number };

/**
 * Align multiple bar arrays on shared dates (inner join) and sum OHLC.
 * Volume is set to 0 (composite has no meaningful volume).
 * Bars arrays must each be sorted ascending by date (they always are from the data files).
 */
export function alignAndSum(legBars: Bar[][]): Bar[] {
  if (!legBars.length) return [];
  if (legBars.some((b) => !b.length)) return [];

  // Build a set of dates present in ALL legs (inner join).
  const sets = legBars.map((bars) => new Set(bars.map((b) => b.time)));
  const shared = sets[0];
  for (let i = 1; i < sets.length; i++) {
    for (const d of Array.from(shared)) {
      if (!sets[i].has(d)) shared.delete(d);
    }
  }
  if (!shared.size) return [];

  // Sort shared dates and compute element-wise sums.
  const dates = Array.from(shared).sort();
  const byDate: Bar[][] = legBars.map((bars) => {
    const m = new Map<string, Bar>(bars.map((b) => [b.time, b]));
    return dates.map((d) => m.get(d)!);
  });

  return dates.map((d, di) => {
    let o = 0, h = 0, l = 0, c = 0;
    for (let li = 0; li < byDate.length; li++) {
      const b = byDate[li][di];
      o += b.o; h += b.h; l += b.l; c += b.c;
    }
    return { time: d, o, h, l, c, v: 0 };
  });
}

/**
 * Compute composite quote from per-leg quotes.
 * Returns { last, prevClose, chg } where chg is percentage.
 */
export function compositeQuote(
  legs: string[],
  quotes: Record<string, { last?: number; prevClose?: number } | null>
): { last: number; prevClose: number; chg: number } | null {
  let sumLast = 0;
  let sumPrev = 0;
  for (const leg of legs) {
    const q = quotes[leg];
    if (!q || q.last == null || !isFinite(q.last)) return null;
    sumLast += q.last;
    // If prevClose is missing, approximate from last (0% change for that leg).
    const prev = q.prevClose != null && isFinite(q.prevClose) ? q.prevClose : q.last;
    sumPrev += prev;
  }
  const chg = sumPrev !== 0 ? ((sumLast - sumPrev) / sumPrev) * 100 : 0;
  return { last: sumLast, prevClose: sumPrev, chg };
}
