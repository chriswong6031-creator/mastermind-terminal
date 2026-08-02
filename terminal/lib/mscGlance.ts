/**
 * mscGlance.ts — glance-tier positioning reads (MSC R3.2/R3.3).
 *
 * Pure parse + convention layer over `gexstate_index` (the cross-root aggregate,
 * options_structure/gex_state/_index.json) and single `gexstate:{ROOT}` payloads,
 * shared by the screener's msc_* columns, the watchlist regime dot and the ticker
 * page's positioning block.
 *
 * CONVENTION AUTHORITY: the six-state regime vocabulary and its colours are the
 * options desk's (gexdesk/MarketStateCard + gexStrings `regime*` keys). This module
 * owns the colour map so the desk and every glance surface read from ONE table —
 * a regime must never be one colour on the desk and another in the rail.
 *
 * REGIME-DYNAMICS LAW: a regime label never ships alone — consumers must put
 * stability and/or dist-to-flip beside it. This module carries the fields; the
 * law is enforced at each surface.
 */

export type GexRegime = "PIN" | "DRIFT" | "RANGE" | "TRANSITION" | "TREND" | "CASCADE" | "UNKNOWN";

export interface GlanceRow {
  regime: GexRegime;
  stabilityPct: number | null;
  netGexBn: number | null;
  gammaFlip: number | null;
  distToFlipPct: number | null;
  callWall: number | null;
  putWall: number | null;
  spot: number | null;
  /** Session date (YYYY-MM-DD) of this ROOT's build — staleness is per row. */
  asofDate: string | null;
}

export interface GlanceIndex {
  rows: Map<string, GlanceRow>;
  asofDate: string | null;
  nRoots: number;
}

/**
 * Structural-risk ordering for sorting: positive-γ pinning sorts low, negative-γ
 * cascade risk sorts high (matches the gexStrings grouping doctrine — PIN/DRIFT/
 * RANGE positive, TRANSITION near flip, TREND/CASCADE negative).
 */
export const REGIME_RANK: Record<GexRegime, number> = {
  PIN: 0,
  DRIFT: 1,
  RANGE: 2,
  TRANSITION: 3,
  TREND: 4,
  CASCADE: 5,
  UNKNOWN: -1,
};

/**
 * One colour table for every surface (moved here from gexdesk/MarketStateCard so
 * the desk and the glance surfaces cannot drift). Tokens are semantic, not
 * directional-price: PIN's `--up` reads "structurally supportive", TREND/CASCADE's
 * `--down` reads "destabilised" — the SAME pairing the desk has always shown, and
 * the pair still reads as opposites under html[data-updown="east"].
 */
export const REGIME_COLORS: Record<string, string> = {
  PIN: "var(--up)",
  DRIFT: "var(--brand-2)",
  RANGE: "var(--brand-2)",
  TRANSITION: "var(--signal)",
  TREND: "var(--down)",
  CASCADE: "var(--down)",
  UNKNOWN: "var(--muted)",
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

const REGIMES = new Set<GexRegime>(["PIN", "DRIFT", "RANGE", "TRANSITION", "TREND", "CASCADE"]);

export function normRegime(v: unknown): GexRegime {
  const s = typeof v === "string" ? (v.toUpperCase() as GexRegime) : "UNKNOWN";
  return REGIMES.has(s) ? s : "UNKNOWN";
}

const dateOf = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

function rowOf(raw: unknown): GlanceRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const row: GlanceRow = {
    regime: normRegime(r.gamma_regime),
    stabilityPct: numOrNull(r.stability_pct),
    netGexBn: numOrNull(r.net_gex_bn),
    gammaFlip: numOrNull(r.gamma_flip),
    distToFlipPct: numOrNull(r.dist_to_flip_pct),
    callWall: numOrNull(r.call_wall),
    putWall: numOrNull(r.put_wall),
    spot: numOrNull(r.spot),
    asofDate: dateOf(r.asof),
  };
  // A row with no regime AND no numbers is noise, not data.
  if (row.regime === "UNKNOWN" && row.netGexBn == null && row.gammaFlip == null) return null;
  return row;
}

/**
 * Parse the cross-root index payload. Returns null for anything that is not an
 * index (wrong schema family, empty {} degrade, no usable rows) — consumers then
 * stay exactly as they were without the columns/dots (degrade-to-absent law).
 */
export function parseGlanceIndex(raw: unknown): GlanceIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const rowsRaw = rec.rows;
  if (!rowsRaw || typeof rowsRaw !== "object") return null;
  const rows = new Map<string, GlanceRow>();
  for (const [root, v] of Object.entries(rowsRaw as Record<string, unknown>)) {
    const row = rowOf(v);
    if (row) rows.set(root.toUpperCase(), row);
  }
  if (!rows.size) return null;
  return { rows, asofDate: dateOf(rec.asof), nRoots: rows.size };
}

/** Parse ONE gexstate payload (the per-root form) into the same glance row. */
export function parseGlanceState(raw: unknown, root: string): GlanceRow | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.root === "string" && rec.root.toUpperCase() !== root.toUpperCase()) return null;
  return rowOf(rec);
}
