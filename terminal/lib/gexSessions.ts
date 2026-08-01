/**
 * gexSessions.ts — contract for the dated GEX-ladder history plane (R0.10 of the
 * Options Superintelligence Masterplan).
 *
 * Store (macro hub nightly, WP-GEX-SNAPSHOTS, accruing since 2026-07-16):
 *   gex_at:{ROOT}:{DATE}  → R2 options_hub/gex_history/{ROOT}/{DATE}.json — the FULL
 *                           options_hub.gex/v1 payload (by_strike greek nets, by_expiry,
 *                           walls/flip/scalars) exactly as the live board published it
 *                           that session. Same bytes as that day's gex:{ROOT}.
 *   gex_dates:{ROOT}      → R2 options_hub/gex_history/{ROOT}/dates.json — the sessions
 *                           index the macro hub maintains beside the snapshots, so the
 *                           Exposure desk's session picker never has to probe blind.
 *
 * The index is BEST-EFFORT in both directions (same law as the flow-archive dates.json):
 *   - a listed date can still 404 (accrual holes exist — e.g. 2026-07-18 / 07-20 were
 *     never published), so readers render an honest missing-session state, never today's
 *     ladder wearing an archived label;
 *   - an unlisted date can still exist (index written after the snapshot). The desk's
 *     scrubber therefore may probe a specific date the user explicitly picked, but bulk
 *     enumeration comes only from this index.
 *
 * DOM-free so lib/__tests__/gexSessions.test.ts can pin the contract without a component.
 */

const SESSION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Exact YYYY-MM-DD session-date string (the dated-key shape). */
export function isGexSessionDate(s: unknown): s is string {
  return typeof s === "string" && SESSION_DATE_RE.test(s);
}

/**
 * The sessions index for the dated GEX plane — `gex_dates:{ROOT}` →
 * options_hub/gex_history/{ROOT}/dates.json. Dates are NEWEST FIRST. No retention
 * fields: EOD ladders are small and the plane keeps every session (unbounded accrual),
 * unlike the pruned intraday surface store.
 */
export interface GexDates {
  schema?: string;
  root: string;
  dates: string[]; // "YYYY-MM-DD", NEWEST FIRST
  latest: string | null; // === dates[0] (null when empty)
  count?: number;
  asof?: string;
  source?: string;
}

/**
 * Validator for the sessions index — the TS twin of the macro hub's dates-index writer
 * (scripts/build_options_hub_nightly.py). Checks the same three things as the surface
 * plane's isSurfaceDates: every entry is a session date, the list is sorted newest-first,
 * and `latest` is dates[0] (null when empty). A payload failing any of them is not
 * trusted as a session list — the picker's dropdown stays hidden and the desk keeps its
 * scrubber-probe behaviour only.
 */
export function isGexDates(x: unknown): x is GexDates {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const dates = o.dates;
  if (!Array.isArray(dates) || !dates.every(isGexSessionDate)) return false;
  // Newest first — ISO dates sort lexicographically.
  const desc = [...dates].sort().reverse();
  if (dates.some((d, i) => d !== desc[i])) return false;
  if (dates.length > 0 ? o.latest !== dates[0] : o.latest !== null) return false;
  return typeof o.root === "string";
}

/**
 * Session date of a gex payload's `asof`. The hub plane stamps a bare "YYYY-MM-DD"
 * (verified live), while the dev fixture carries a full ISO stamp — both reduce to
 * their date prefix. Null for anything else, never a coerced guess.
 */
export function gexSessionOf(asof: unknown): string | null {
  if (typeof asof !== "string") return null;
  const d = asof.slice(0, 10);
  return SESSION_DATE_RE.test(d) ? d : null;
}
