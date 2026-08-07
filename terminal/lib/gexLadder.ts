/**
 * gexLadder.ts — pure transforms behind the GEX desk's strike ladder (OEU T-A).
 *
 * Two jobs, both DOM-free so lib/__tests__/gexLadder.test.ts can assert them:
 *
 * 1. THE EXPIRY LENS. The ladder's expiry dropdown used to be a dead control — it set
 *    state nobody read, and the ladder stayed on the all-expiry aggregate. It stayed
 *    dead because the two stores carry DIFFERENT cuts of the same chain:
 *
 *      gex:{ROOT}     `by_strike[]`  per-STRIKE, every expiry summed   ($mn)
 *                     `by_expiry[]`  per-EXPIRY, every strike summed   ($mn)
 *      matrix:{ROOT}  `cells[]`      per (STRIKE × EXPIRY)             (whole dollars)
 *
 *    Neither store alone can answer "show me only 0DTE, by strike" — the CROSS of the
 *    two axes lives only in the matrix. So: the All lens reads `by_strike` (canonical,
 *    carries all four greeks); every narrower lens is computed from the matrix cells and
 *    converted to $mn so both sources share one unit and one formatter.
 *
 *    Honesty rules baked in here, not left to the view:
 *      - The matrix is gamma-only. Under DEX/VEX/CHEX there is no per-expiry cut, so the
 *        lens reports itself unavailable rather than filtering a greek it cannot filter.
 *      - A strike the matrix does not cover returns `null`, NOT 0 and NOT the aggregate.
 *        `null` renders as an em dash. A strike the matrix DOES cover but which carries
 *        no cell for the selected expiry is a real zero (no open interest there).
 *      - An expiry is only offered when the matrix actually holds cells for it at strikes
 *        the ladder shows. Two stores built by two nightly jobs drift (the live matrix ran
 *        two weeks behind the gex payload while this was written) — when they disagree the
 *        control goes dark with a reason instead of quietly lying.
 *      - "0DTE" is always relative to the MATRIX's own session (`matrix.asof`), never the
 *        gex payload's — the matrix's cells were computed as of its own snapshot, so a
 *        drifted matrix must not borrow "today" from the newer payload and relabel a
 *        14-DTE leg "0DTE". `matrixSessionsAgree` gates this: when the two stores disagree
 *        by more than a routine cadence gap, every narrow lens (zero / ex-zero / one) goes
 *        dark rather than summing — or mislabeling — across two different sessions. A cell
 *        for an expiry strictly before the matrix's own anchor day is dropped outright: it
 *        was already expired from the matrix's own vantage point and can be neither "0DTE"
 *        nor "what survives tonight".
 *
 * 2. THE BAR SCALE (bug B1). PEAK used to divide per-strike bars ($mn, per strike) by
 *    `max |history[].net_gex_bn|` — the SESSION's aggregate net in BILLIONS. Two different
 *    quantities, three orders of magnitude apart: on fixture data every bar collapsed to
 *    the 2px floor, on live data every bar saturated at full width. It is replaced by two
 *    bases that are the same quantity as the bars themselves.
 */

// ─── Source shapes (structural mirrors — no dependency on the client components) ────

/** One `matrix:{ROOT}` cell. `gex` is net gamma exposure in WHOLE DOLLARS. */
export interface GexMatrixCell {
  strike: number;
  expiry: string;
  gex: number | null;
}

/** The slice of `options_structure.matrix/v1` the ladder needs. */
export interface GexMatrix {
  asof?: string;
  spot?: number | null;
  expiries?: string[];
  strikes?: number[];
  cells?: GexMatrixCell[];
}

/** matrix `gex` is whole dollars; `by_strike` is $mn. One unit wins: $mn. */
const DOLLARS_PER_MN = 1e6;

// ─── Lens ───────────────────────────────────────────────────────────────────────────

/**
 * - `all`     every expiry (from `by_strike`)
 * - `zero`    the session's 0DTE expiry only
 * - `ex-zero` everything EXCEPT 0DTE ("what survives tonight")
 * - `one`     one named expiry
 */
export type ExpiryLensKind = "all" | "zero" | "ex-zero" | "one";

export interface ExpiryLens {
  kind: ExpiryLensKind;
  /** Set only when kind === "one". */
  exp?: string;
}

export const LENS_ALL: ExpiryLens = { kind: "all" };

/** Normalize an expiry key to its date part ("2026-07-11 00:00:00" → "2026-07-11"). */
export function normExp(exp: string | null | undefined): string {
  return (exp ?? "").slice(0, 10);
}

/** Does this lens read the matrix (rather than the all-expiry `by_strike` aggregate)? */
export function lensNeedsMatrix(lens: ExpiryLens): boolean {
  return lens.kind !== "all";
}

// ─── Matrix coverage ────────────────────────────────────────────────────────────────

/**
 * The strikes the matrix actually covers, as a Set. A ladder strike inside this set with
 * no cell for the selected expiry is a genuine zero; a ladder strike OUTSIDE it is
 * unknown — the matrix windowed it away — and must render as a dash.
 *
 * Falls back to the strikes present in `cells` when the payload omits the `strikes` axis.
 */
export function matrixStrikeSet(matrix: GexMatrix | null | undefined): Set<number> {
  const out = new Set<number>();
  if (!matrix) return out;
  if (Array.isArray(matrix.strikes) && matrix.strikes.length > 0) {
    for (const k of matrix.strikes) if (Number.isFinite(k)) out.add(k);
    return out;
  }
  for (const c of matrix.cells ?? []) if (Number.isFinite(c.strike)) out.add(c.strike);
  return out;
}

/**
 * Expiries the matrix can actually answer for THIS ladder: at least one cell whose strike
 * is a strike the ladder renders. Keyed by normalized (date-part) expiry.
 *
 * The strike test is what keeps a mismatched pair honest — a fixture (or a prod store that
 * fell behind) can carry a matrix for a different session whose strike axis does not
 * intersect the ladder at all. Expiry keys alone would look "covered"; every row would
 * then render a dash. Requiring a real overlap turns that into an honest disabled control.
 */
export function matrixExpiryCoverage(
  matrix: GexMatrix | null | undefined,
  ladderStrikes: Iterable<number>,
): Set<string> {
  const out = new Set<string>();
  if (!matrix?.cells?.length) return out;
  const wanted = new Set<number>();
  for (const k of ladderStrikes) wanted.add(k);
  if (wanted.size === 0) return out;
  for (const c of matrix.cells) {
    if (!wanted.has(c.strike)) continue;
    const e = normExp(c.expiry);
    if (e) out.add(e);
  }
  return out;
}

// ─── Per-strike values under a lens ─────────────────────────────────────────────────

export interface LensStrikeValues {
  /** strike → net gamma exposure in $mn under the lens (covered strikes only). */
  byStrike: Map<number, number>;
  /** Strikes the matrix covers at all — anything else is unknown, not zero. */
  covered: Set<number>;
  /** Σ of the lens across every covered strike, $mn (the summary bar's scoped Net GEX). */
  totalMn: number;
  /** How many matrix cells fed this lens (0 → the view shows an unavailable state). */
  cellCount: number;
}

/**
 * Calendar-day gap tolerated between the matrix's own session and the gex payload's
 * session before the narrow lenses are treated as untrustworthy. 4 covers a routine
 * long weekend plus a single Monday holiday (Fri close → Tue open); anything wider is
 * the documented drift failure mode ("two weeks behind"), not ordinary cadence.
 */
export const MAX_SESSION_GAP_DAYS = 4;

/**
 * Whether the matrix's own session and the gex payload's session are close enough that
 * summing the matrix under a narrow expiry lens is still honest. Date-part only (no
 * trading-calendar dependency); either side missing/unparseable is treated as disagreeing
 * — we cannot vouch for a session we cannot read.
 */
export function matrixSessionsAgree(
  matrixAsOf: string | null | undefined,
  gexAsOf: string | null | undefined,
): boolean {
  const m = normExp(matrixAsOf);
  const g = normExp(gexAsOf);
  if (!m || !g) return false;
  const mMs = Date.parse(`${m}T00:00:00Z`);
  const gMs = Date.parse(`${g}T00:00:00Z`);
  if (!Number.isFinite(mMs) || !Number.isFinite(gMs)) return false;
  return Math.abs(gMs - mMs) / 86_400_000 <= MAX_SESSION_GAP_DAYS;
}

/**
 * Sum the matrix cells selected by `lens` down to one value per strike, in $mn.
 *
 * `gexAsOf` is the GEX PAYLOAD's as-of — used only to check the matrix isn't stale
 * relative to it (`matrixSessionsAgree`). The 0DTE anchor itself is always the MATRIX's
 * own `asof` (see header): the matrix's cells were computed as of that session, so
 * "0DTE" must mean 0 DTE from there, never from a newer payload's "today".
 *
 * Two honesty guards, both new (this lens used to anchor on `gexAsOf` directly, with
 * neither guard — see the header's "two weeks behind" note):
 *   1. DRIFT: when the matrix and the gex payload disagree on session by more than
 *      `MAX_SESSION_GAP_DAYS`, every narrow lens returns empty/unavailable (cellCount 0,
 *      covered empty — the same "honest dash" every strike gets when the matrix never
 *      covered it at all) instead of summing across two different sessions.
 *   2. DTE>=0: a cell for an expiry strictly before the matrix's OWN anchor day is
 *      already expired from the matrix's own vantage point — dropped from every narrow
 *      lens, so it can never leak into "ex-zero" ("what survives tonight") nor be
 *      mislabeled "0DTE".
 */
export function matrixLensByStrike(
  matrix: GexMatrix | null | undefined,
  lens: ExpiryLens,
  gexAsOf: string | null | undefined,
): LensStrikeValues {
  const byStrike = new Map<number, number>();
  let totalMn = 0;
  let cellCount = 0;

  if (!matrix?.cells?.length || lens.kind === "all") {
    return { byStrike, covered: matrixStrikeSet(matrix), totalMn, cellCount };
  }

  const matrixAsOf = matrix.asof ?? null;
  if (!matrixSessionsAgree(matrixAsOf, gexAsOf)) {
    // Drift beyond the tolerance: treat the matrix as if it covers nothing rather than
    // let a stale snapshot masquerade as today's — or "what survives tonight" — cut.
    return { byStrike, covered: new Set<number>(), totalMn, cellCount };
  }

  const covered = matrixStrikeSet(matrix);
  const zeroDay = zeroDteExpiry(matrix.expiries ?? [], matrixAsOf);
  const wantExp = lens.kind === "one" ? normExp(lens.exp) : null;
  const anchorDay = normExp(matrixAsOf);

  for (const c of matrix.cells) {
    const e = normExp(c.expiry);
    if (!e) continue;
    if (anchorDay && e < anchorDay) continue; // DTE>=0: already expired at capture time
    if (lens.kind === "one" && e !== wantExp) continue;
    if (lens.kind === "zero" && e !== zeroDay) continue;
    if (lens.kind === "ex-zero" && e === zeroDay) continue;
    const raw = c.gex;
    if (raw == null || !Number.isFinite(raw)) continue;
    const mn = raw / DOLLARS_PER_MN;
    byStrike.set(c.strike, (byStrike.get(c.strike) ?? 0) + mn);
    totalMn += mn;
    cellCount++;
  }
  return { byStrike, covered, totalMn, cellCount };
}

/**
 * The expiry key that IS the snapshot's session day, or null. Date-part comparison only —
 * `dteRaw === 0` in lib/dte.ts terms, inlined here so this module stays free of imports
 * the view layer would have to thread through.
 */
export function zeroDteExpiry(
  expiries: Iterable<string>,
  asOf: string | null | undefined,
): string | null {
  const base = (asOf ?? "").slice(0, 10);
  if (base.length < 10) return null;
  for (const e of expiries) {
    if (normExp(e) === base) return base;
  }
  return null;
}

/**
 * One ladder row's value under the active lens.
 *   - All lens → the caller's aggregate value (from `by_strike`), always a number.
 *   - Narrower lens → the matrix sum for that strike; 0 when the strike is covered but
 *     carries no cell for the selection; `null` when the matrix never covered the strike.
 * `null` is the honest dash. It is never silently replaced by the aggregate.
 */
export function lensValueForStrike(
  strike: number,
  aggregate: number,
  lens: ExpiryLens,
  vals: LensStrikeValues,
): number | null {
  if (lens.kind === "all") return aggregate;
  const v = vals.byStrike.get(strike);
  if (v != null) return v;
  return vals.covered.has(strike) ? 0 : null;
}

// ─── Bar scale (B1) ─────────────────────────────────────────────────────────────────

export interface ScaleBases {
  /** max |value| across the rows currently ON SCREEN (after the ±% range filter). */
  nowMax: number;
  /** max |value| across EVERY row of the snapshot, so range presets don't rescale bars. */
  ladderMax: number;
}

/** Largest finite magnitude in a list, ignoring nulls. 0 when there is nothing to measure. */
export function maxAbs(values: Iterable<number | null | undefined>): number {
  let m = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    const a = Math.abs(v);
    if (a > m) m = a;
  }
  return m;
}

/**
 * The two honest normalizers for the NOW | LADDER MAX toggle.
 *
 * Both are the SAME QUANTITY as the bars they scale — per-strike exposure under the active
 * greek + expiry lens — which is precisely what the old PEAK base was not. `visible` is the
 * range-filtered slice; `full` is the whole snapshot. A floor keeps a degenerate all-zero
 * ladder from dividing by zero.
 */
export function scaleBases(
  visible: Iterable<number | null | undefined>,
  full: Iterable<number | null | undefined>,
  floor = 0.001,
): ScaleBases {
  const nowMax = Math.max(maxAbs(visible), floor);
  const ladderMax = Math.max(maxAbs(full), nowMax);
  return { nowMax, ladderMax };
}

// ─── Formatters ─────────────────────────────────────────────────────────────────────

/**
 * Format a $mn quantity — `by_strike` / `by_expiry` values and every matrix-derived lens.
 *
 * The desk used to run ONE formatter over both $mn and $bn fields, so a strike carrying
 * $284.5M printed as "+284.50B" against live data (engine/options_hub.py divides those
 * columns by 1e6 and says so; only `net_gex_bn` is billions). Two formatters now, each
 * named for its unit, so the mix-up cannot recur silently.
 */
export function fmtMn(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  // A covered strike with nothing at this expiry is a real, directionless zero — "+0"
  // would imply a positive read where there is none. (An UNCOVERED strike is `null`
  // upstream and renders an em dash instead; the two states must stay distinguishable.)
  if (abs < 0.0005) return "0";
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}B`;
  if (abs >= 1) return `${sign}${abs.toFixed(1)}M`;
  return `${sign}${(abs * 1000).toFixed(0)}K`;
}

/** Format a $bn quantity — `net_gex_bn` and the session history only. */
export function fmtBn(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs < 5e-7) return "0";
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1) return `${sign}${abs.toFixed(2)}B`;
  if (abs >= 0.001) return `${sign}${(abs * 1000).toFixed(1)}M`;
  return `${sign}${(abs * 1e6).toFixed(0)}K`;
}

/** Unsigned $mn magnitude, for scale captions ("±284.5M"). */
export function fmtMnMag(v: number): string {
  return fmtMn(Math.abs(v)).replace(/^\+/, "");
}
