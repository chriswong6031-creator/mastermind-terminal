/**
 * Deterministic CSV export for the Options Tape.
 *
 * The caller owns filtering and sorting; this module deliberately preserves that
 * order and serializes every supplied row. The export is a display-only research
 * surface: heuristic direction labels keep their leading `~` and no row becomes
 * an issued position or execution instruction.
 */

export type CsvScalar = string | number | boolean | null | undefined;

export const OPTIONS_TAPE_EXPORT_SCHEMA = "terminal.options_tape_csv/v1";

export const OPTIONS_TAPE_CSV_COLUMNS = [
  "export_schema",
  "authority",
  "direction_basis",
  "feed_schema",
  "session_date",
  "feed_asof",
  "display_stale",
  "event_id",
  "event_ts",
  "root",
  "group",
  "group_zh",
  "right",
  "expiration",
  "strike",
  "dte",
  "dte_bucket",
  "mny_bucket",
  "side",
  "n_prints",
  "size",
  "avg_price",
  "premium",
  "premium_z",
  "baseline_source",
  "vol_gt_oi",
  "repeated",
  "zerodte",
  "swept",
  "signing_source",
] as const;

export interface OptionsTapeCsvEvent {
  id: string;
  ts: string;
  root: string;
  group: string;
  group_zh: string;
  right: "C" | "P";
  exp: string;
  strike: number;
  dte: number;
  dte_bucket: string;
  mny_bucket: string;
  side: "~buy" | "~sell" | "mixed";
  n_prints: number;
  size: number;
  avg_price: number;
  premium: number;
  premium_z: number | null;
  baseline_source: string;
  vol_gt_oi: boolean | null;
  repeated: boolean;
  zerodte: boolean;
  swept?: boolean;
  signing_source: string;
}

export interface OptionsTapeCsvMetadata {
  feedSchema?: string | null;
  sessionDate?: string | null;
  feedAsof?: string | null;
  displayStale: boolean;
}

const UTF8_BOM = "\uFEFF";

// Spreadsheet applications may execute strings beginning with one of these
// characters as a formula. Leading whitespace/BOM does not make that safe, and
// leading tab/newline controls are dangerous themselves. Numeric values are not
// modified, so a legitimate negative number remains a number in the export.
const LEADING_FORMULA = /^[\s\uFEFF]*[=+\-@]/u;
const LEADING_CONTROL = /^[ \u00A0\u2000-\u200A\u202F\u205F\u3000\uFEFF]*[\t\r\n]/u;

function spreadsheetSafeString(value: string): string {
  return LEADING_FORMULA.test(value) || LEADING_CONTROL.test(value) ? `'${value}` : value;
}

/** Serialize one RFC-4180 field after applying string-only formula hardening. */
export function serializeCsvCell(value: CsvScalar): string {
  let rendered = "";
  if (typeof value === "string") rendered = spreadsheetSafeString(value);
  else if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    rendered = Object.is(value, -0) ? "0" : String(value);
  } else if (typeof value === "boolean") rendered = value ? "true" : "false";

  if (/[",\r\n]/u.test(rendered)) return `"${rendered.replace(/"/gu, '""')}"`;
  return rendered;
}

/** RFC-4180 records with CRLF, a final CRLF, and a UTF-8 spreadsheet BOM. */
export function serializeCsv(rows: readonly (readonly CsvScalar[])[]): string {
  return `${UTF8_BOM}${rows.map((row) => row.map(serializeCsvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * Build the complete Options Tape CSV in the exact order supplied by the UI's
 * filtered/sorted collection. Optional source fields remain blank rather than
 * being coerced into false observations.
 */
export function buildOptionsTapeCsv(
  events: readonly OptionsTapeCsvEvent[],
  metadata: OptionsTapeCsvMetadata,
): string {
  const rows: CsvScalar[][] = [
    [...OPTIONS_TAPE_CSV_COLUMNS],
    ...events.map((event): CsvScalar[] => [
      OPTIONS_TAPE_EXPORT_SCHEMA,
      "display_only",
      "tilde_inferred",
      metadata.feedSchema,
      metadata.sessionDate,
      metadata.feedAsof,
      metadata.displayStale,
      event.id,
      event.ts,
      event.root,
      event.group,
      event.group_zh,
      event.right,
      event.exp,
      event.strike,
      event.dte,
      event.dte_bucket,
      event.mny_bucket,
      event.side,
      event.n_prints,
      event.size,
      event.avg_price,
      event.premium,
      event.premium_z,
      event.baseline_source,
      event.vol_gt_oi,
      event.repeated,
      event.zerodte,
      event.swept,
      event.signing_source,
    ]),
  ];
  return serializeCsv(rows);
}

function safeFilenameSegment(value: string | null | undefined, fallback: string): string {
  const safe = (value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return safe || fallback;
}

function compactUtcTimestamp(value: string | null | undefined): string {
  if (!value) return "unknown-asof";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  }
  return safeFilenameSegment(value, "unknown-asof");
}

/** Filename depends only on feed metadata, never on wall-clock export time. */
export function buildOptionsTapeCsvFilename(
  metadata: Pick<OptionsTapeCsvMetadata, "sessionDate" | "feedAsof">,
): string {
  const session = safeFilenameSegment(metadata.sessionDate, "unknown-session");
  const asof = compactUtcTimestamp(metadata.feedAsof);
  return `mastermind-options-tape_${session}_${asof}.csv`;
}
