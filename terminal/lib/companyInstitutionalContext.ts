/**
 * Verified, point-in-time 13F company context.
 *
 * The browser only calls the same-origin BFF. The server proves the mutable R2
 * marker, its immutable generation manifest, the company-object receipt, and
 * the exact Company Intelligence lineage before returning descriptive context.
 * This plane has no ranking or action authority.
 */

import {
  normalizeCompanyIntelligenceSymbol,
  type CompanyIntelligenceVerifiedLineage,
} from "./companyIntelligence";

export const COMPANY_INSTITUTIONAL_CONTEXT_SCHEMA = "company_institutional_context.v1" as const;
export const COMPANY_INSTITUTIONAL_MANIFEST_SCHEMA = "company_institutional_context_manifest.v1" as const;
export const COMPANY_INSTITUTIONAL_MAX_R2_JSON_BYTES = 4 * 1024 * 1024;

export type CompanyInstitutionalWireStatus = "ready" | "partial" | "no_covered_holder";
export type CompanyInstitutionalState = CompanyInstitutionalWireStatus | "stale" | "not_covered";
export type CompanyInstitutionalWarning =
  | "current_snapshots_missing"
  | "comparison_snapshots_missing"
  | "resolution_partial"
  | "history_coverage_incomplete";
export type CompanyInstitutionalAction = "new" | "add" | "hold" | "trim" | "exit" | "unavailable";

export interface CompanyInstitutionalSnapshotReceipt {
  path: string;
  sha256: string;
  bytes: number;
}

export interface CompanyInstitutionalPosition {
  manager: string;
  manager_name: string;
  manager_style: string;
  manager_grade: string;
  action: CompanyInstitutionalAction;
  is_current_holder: boolean;
  value_usd: number;
  book_weight_pct: number;
  shares: number;
  shares_change_pct: number | null;
  period_end: string;
  filing_date: string;
  snapshot: CompanyInstitutionalSnapshotReceipt;
}

export interface CompanyInstitutionalCoverage {
  configured_manager_count: number;
  active_manager_count: number;
  closed_manager_count: number;
  reporting_manager_count: number;
  missing_manager_count: number;
  comparison_reporting_manager_count: number;
  comparison_missing_manager_count: number;
  resolved_position_count: number;
  unresolved_position_count: number;
}

export interface CompanyInstitutionalTrendPeriod {
  period_end: string;
  available_on: string | null;
  reporting_manager_count: number;
  missing_manager_count: number;
  holder_count: number;
  total_value_usd: number;
  eligible: boolean;
}

export interface CompanyInstitutionalContext {
  schema: typeof COMPANY_INSTITUTIONAL_CONTEXT_SCHEMA;
  authority: "context_only";
  is_context_only: true;
  generated_at: string;
  generation_id: string;
  status: CompanyInstitutionalWireStatus;
  company: { ticker: string };
  company_intelligence: {
    generation_id: string;
    context_sha256: string;
    latest_event_id: string | null;
    latest_event_call_date: string | null;
  };
  period: {
    build_as_of: string;
    consensus_period: string;
    comparison_period: string;
    filing_window_closed_on: string;
    consensus_available_on: string | null;
    latest_reporting_filing_date: string | null;
  };
  coverage: CompanyInstitutionalCoverage;
  positions: CompanyInstitutionalPosition[];
  consensus: {
    current_holder_count: number;
    buyer_count: number;
    trimmer_count: number;
    exit_count: number;
    unknown_move_count: number;
    total_value_usd: number;
    /** Concentration among tracked managers, not total institutional ownership. */
    ownership_hhi: number | null;
    max_book_weight_pct: number | null;
    avg_book_weight_pct: number | null;
  };
  trend: {
    status: "available" | "insufficient_coverage" | "no_history";
    direction: "accumulating" | "distributing" | "stable" | null;
    eligible_period_count: number;
    periods: CompanyInstitutionalTrendPeriod[];
  };
  warnings: CompanyInstitutionalWarning[];
}

export interface CompanyInstitutionalManifest {
  schema: typeof COMPANY_INSTITUTIONAL_MANIFEST_SCHEMA;
  generation_id: string;
  generated_at: string;
  company_count: number;
  covered_company_count: number;
  position_record_count: number;
  consensus_period: string;
  coverage: CompanyInstitutionalCoverage;
  source: {
    company_intelligence: { generation_id: string; sha256: string };
    smart_money_config: { sha256: string };
    share_class_equivalence: { sha256: string };
    universe_membership: { sha256: string };
    snapshot_index: { sha256: string; snapshot_count: number; manager_count: number };
    builder: typeof COMPANY_INSTITUTIONAL_CONTEXT_SCHEMA;
  };
  files: Record<string, { sha256: string; bytes: number }>;
  status: "ready" | "partial" | "empty";
  warnings: CompanyInstitutionalWarning[];
}

export type CompanyInstitutionalErrorCode =
  | "invalid_symbol"
  | "not_found"
  | "unauthorized"
  | "upstream_unavailable"
  | "invalid_payload";

export type CompanyInstitutionalResult =
  | { ok: true; state: CompanyInstitutionalState; context: CompanyInstitutionalContext }
  | { ok: false; state: "error"; error: { code: CompanyInstitutionalErrorCode; message: string; retryable: boolean } };

type JsonObject = Record<string, unknown>;
type FetchedJson = { kind: "ok"; raw: unknown; bytes: Uint8Array } | { kind: "missing" } | { kind: "failure" };
type ManifestSnapshot = { manifest: CompanyInstitutionalManifest; at: number };
type ContextSnapshot = { context: CompanyInstitutionalContext; at: number };

const R2_HOST = "pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev";
const SHA256 = /^[a-f0-9]{64}$/;
const GENERATION = /^[a-f0-9]{24,64}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MANIFEST_TTL_MS = 30_000;
const CONTEXT_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 2_500;
const MAX_CONTEXT_CACHE_ENTRIES = 256;
const MAX_MANIFEST_FILES = 20_000;
const TREND_VALUE_CHANGE_PCT = 15;
const WARNINGS = new Set<CompanyInstitutionalWarning>([
  "current_snapshots_missing", "comparison_snapshots_missing", "resolution_partial", "history_coverage_incomplete",
]);
const ACTIONS = new Set<CompanyInstitutionalAction>(["new", "add", "hold", "trim", "exit", "unavailable"]);

let manifestCache: ManifestSnapshot | null = null;
const contextCache = new Map<string, ContextSnapshot>();
const lastGoodByTicker = new Map<string, ContextSnapshot>();

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function exactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validSha(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function validGeneration(value: unknown): value is string {
  return typeof value === "string" && GENERATION.test(value) && !value.includes("..");
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && ISO_TIMESTAMP.test(value)
    && Number.isFinite(new Date(value).getTime());
}

function validDateOrTimestamp(value: unknown): value is string {
  return validDate(value) || validTimestamp(value);
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0") ? value : null;
}

function count(value: unknown, max = 100_000): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

function number(value: unknown, min = 0, max = 1e16): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function nullableNumber(value: unknown, min = 0, max = 1e16): number | null | undefined {
  if (value === null) return null;
  return number(value, min, max) ?? undefined;
}

function rounded(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function sameNumber(left: number | null, right: number | null, tolerance = 1e-9): boolean {
  return left === null || right === null
    ? left === right
    : Math.abs(left - right) <= tolerance;
}

function normalizeWarnings(value: unknown): CompanyInstitutionalWarning[] | null {
  if (!Array.isArray(value) || value.length > WARNINGS.size) return null;
  const out: CompanyInstitutionalWarning[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !WARNINGS.has(entry as CompanyInstitutionalWarning)) return null;
    out.push(entry as CompanyInstitutionalWarning);
  }
  return out.length === new Set(out).size && out.every((entry, index) => index === 0 || out[index - 1] < entry) ? out : null;
}

function normalizeCoverage(raw: unknown): CompanyInstitutionalCoverage | null {
  const value = object(raw);
  const keys = [
    "configured_manager_count", "active_manager_count", "closed_manager_count", "reporting_manager_count",
    "missing_manager_count", "comparison_reporting_manager_count", "comparison_missing_manager_count",
    "resolved_position_count", "unresolved_position_count",
  ];
  if (!value || !exactKeys(value, keys)) return null;
  const values = Object.fromEntries(keys.map((key) => [key, count(value[key], 100_000)])) as Record<string, number | null>;
  if (Object.values(values).some((entry) => entry === null)) return null;
  const out = values as unknown as CompanyInstitutionalCoverage;
  return out.configured_manager_count === out.active_manager_count + out.closed_manager_count
    && out.active_manager_count === out.reporting_manager_count + out.missing_manager_count
    && out.active_manager_count === out.comparison_reporting_manager_count + out.comparison_missing_manager_count
    ? out : null;
}

function normalizePosition(raw: unknown, buildAsOf: string, consensusPeriod: string): CompanyInstitutionalPosition | null {
  const value = object(raw);
  const keys = [
    "manager", "manager_name", "manager_style", "manager_grade", "action", "is_current_holder", "value_usd",
    "book_weight_pct", "shares", "shares_change_pct", "period_end", "filing_date", "snapshot",
  ];
  if (!value || !exactKeys(value, keys)) return null;
  const manager = text(value.manager, 96);
  const managerName = text(value.manager_name, 240);
  const managerStyle = text(value.manager_style, 96);
  const managerGrade = text(value.manager_grade, 96);
  const action = value.action;
  const isCurrent = value.is_current_holder;
  const valueUsd = number(value.value_usd);
  const bookWeight = number(value.book_weight_pct, 0, 100);
  const shares = number(value.shares);
  const sharesChange = nullableNumber(value.shares_change_pct, -1e7, 1e7);
  const snapshot = object(value.snapshot);
  if (!manager || !SLUG.test(manager) || !managerName || !managerStyle || !managerGrade
    || typeof action !== "string" || !ACTIONS.has(action as CompanyInstitutionalAction)
    || typeof isCurrent !== "boolean" || valueUsd === null || bookWeight === null || shares === null || sharesChange === undefined
    || !validDate(value.period_end) || value.period_end !== consensusPeriod || !validDate(value.filing_date)
    || value.filing_date <= value.period_end || value.filing_date > buildAsOf
    || !snapshot || !exactKeys(snapshot, ["path", "sha256", "bytes"])) return null;
  const path = text(snapshot.path, 320);
  const bytes = count(snapshot.bytes, 1_000_000_000);
  if (!path || path !== `data/smart_money/${manager}/${consensusPeriod}.parquet`
    || !validSha(snapshot.sha256) || bytes === null || bytes <= 0
    || (action === "exit") === isCurrent) return null;
  return {
    manager, manager_name: managerName, manager_style: managerStyle, manager_grade: managerGrade,
    action: action as CompanyInstitutionalAction, is_current_holder: isCurrent, value_usd: valueUsd,
    book_weight_pct: bookWeight, shares, shares_change_pct: sharesChange,
    period_end: value.period_end, filing_date: value.filing_date,
    snapshot: { path, sha256: snapshot.sha256, bytes },
  };
}

function normalizeTrend(raw: unknown, activeManagers: number, buildAsOf: string, consensusPeriod: string): CompanyInstitutionalContext["trend"] | null {
  const value = object(raw);
  if (!value || !exactKeys(value, ["status", "direction", "eligible_period_count", "periods"])
    || (value.status !== "available" && value.status !== "insufficient_coverage" && value.status !== "no_history")
    || (value.direction !== "accumulating" && value.direction !== "distributing" && value.direction !== "stable" && value.direction !== null)
    || !Array.isArray(value.periods) || value.periods.length > 20) return null;
  const eligibleCount = count(value.eligible_period_count, 64);
  if (eligibleCount === null) return null;
  const periods: CompanyInstitutionalTrendPeriod[] = [];
  let prior = "";
  for (const rawPoint of value.periods) {
    const point = object(rawPoint);
    if (!point || !exactKeys(point, ["period_end", "available_on", "reporting_manager_count", "missing_manager_count", "holder_count", "total_value_usd", "eligible"])) return null;
    const reporting = count(point.reporting_manager_count);
    const missing = count(point.missing_manager_count);
    const holders = count(point.holder_count);
    const total = number(point.total_value_usd);
    const available = point.available_on;
    if (!validDate(point.period_end) || point.period_end <= prior || point.period_end > consensusPeriod
      || reporting === null || missing === null || reporting + missing !== activeManagers
      || holders === null || total === null || typeof point.eligible !== "boolean"
      || (available !== null && (!validDate(available) || available > buildAsOf || available <= point.period_end))
      || point.eligible !== (missing === 0 && available !== null)) return null;
    prior = point.period_end;
    periods.push({
      period_end: point.period_end, available_on: available as string | null,
      reporting_manager_count: reporting, missing_manager_count: missing, holder_count: holders,
      total_value_usd: total, eligible: point.eligible,
    });
  }
  const eligible = periods.filter((point) => point.eligible);
  if (eligibleCount !== eligible.length
    || (value.status === "available" && (eligibleCount < 2 || value.direction === null))
    || (value.status !== "available" && value.direction !== null)) return null;
  if (value.status === "available") {
    const first = eligible[0];
    const last = eligible[eligible.length - 1];
    const holderDelta = last.holder_count - first.holder_count;
    const valueChange = first.total_value_usd > 0
      ? (last.total_value_usd - first.total_value_usd) / first.total_value_usd * 100
      : null;
    const expectedDirection = holderDelta > 0 || (holderDelta === 0 && valueChange !== null && valueChange > TREND_VALUE_CHANGE_PCT)
      ? "accumulating"
      : holderDelta < 0 || (holderDelta === 0 && valueChange !== null && valueChange < -TREND_VALUE_CHANGE_PCT)
        ? "distributing"
        : "stable";
    if (value.direction !== expectedDirection) return null;
  }
  return { status: value.status, direction: value.direction, eligible_period_count: eligibleCount, periods };
}

export function normalizeCompanyInstitutionalContext(
  raw: unknown,
  expectedTicker?: string,
  expectedGeneration?: string,
): CompanyInstitutionalContext | null {
  const value = object(raw);
  const keys = [
    "schema", "authority", "generated_at", "generation_id", "status", "company", "company_intelligence",
    "period", "coverage", "positions", "consensus", "trend", "warnings",
  ];
  const derived = value && exactKeys(value, [...keys, "is_context_only"]) && value.is_context_only === true;
  if (!value || (!exactKeys(value, keys) && !derived) || value.schema !== COMPANY_INSTITUTIONAL_CONTEXT_SCHEMA
    || value.authority !== "context_only" || !validTimestamp(value.generated_at) || !validGeneration(value.generation_id)
    || (expectedGeneration && value.generation_id !== expectedGeneration)
    || (value.status !== "ready" && value.status !== "partial" && value.status !== "no_covered_holder")) return null;
  const company = object(value.company);
  const ticker = company && exactKeys(company, ["ticker"]) && typeof company.ticker === "string"
    ? normalizeCompanyIntelligenceSymbol(company.ticker) : null;
  if (!ticker || ticker !== company?.ticker || (expectedTicker && ticker !== expectedTicker)) return null;
  const ci = object(value.company_intelligence);
  if (!ci || !exactKeys(ci, ["generation_id", "context_sha256", "latest_event_id", "latest_event_call_date"])
    || !validGeneration(ci.generation_id) || !validSha(ci.context_sha256)
    || ((ci.latest_event_id === null) !== (ci.latest_event_call_date === null))
    || (ci.latest_event_id !== null && (!text(ci.latest_event_id, 128) || !validDateOrTimestamp(ci.latest_event_call_date)))) return null;
  const period = object(value.period);
  if (!period || !exactKeys(period, ["build_as_of", "consensus_period", "comparison_period", "filing_window_closed_on", "consensus_available_on", "latest_reporting_filing_date"])
    || !validDate(period.build_as_of) || !validDate(period.consensus_period) || !validDate(period.comparison_period)
    || !validDate(period.filing_window_closed_on) || period.comparison_period >= period.consensus_period
    || period.filing_window_closed_on < period.consensus_period || period.filing_window_closed_on > period.build_as_of) return null;
  for (const field of ["consensus_available_on", "latest_reporting_filing_date"] as const) {
    const stamp = period[field];
    if (stamp !== null && (!validDate(stamp) || stamp <= period.consensus_period || stamp > period.build_as_of)) return null;
  }
  const coverage = normalizeCoverage(value.coverage);
  if (!coverage || (period.consensus_available_on === null) !== (coverage.missing_manager_count > 0)
    || (period.consensus_available_on !== null && period.consensus_available_on !== period.latest_reporting_filing_date)
    || !Array.isArray(value.positions) || value.positions.length > coverage.active_manager_count) return null;
  const positions: CompanyInstitutionalPosition[] = [];
  for (const rawPosition of value.positions) {
    const position = normalizePosition(rawPosition, period.build_as_of, period.consensus_period);
    if (!position || positions.some((entry) => entry.manager === position.manager)) return null;
    positions.push(position);
  }
  if (!positions.every((entry, index) => index === 0
    || `${positions[index - 1].action}:${positions[index - 1].manager}` < `${entry.action}:${entry.manager}`)) return null;
  const consensus = object(value.consensus);
  const consensusKeys = ["current_holder_count", "buyer_count", "trimmer_count", "exit_count", "unknown_move_count", "total_value_usd", "ownership_hhi", "max_book_weight_pct", "avg_book_weight_pct"];
  if (!consensus || !exactKeys(consensus, consensusKeys)) return null;
  const current = positions.filter((position) => position.is_current_holder);
  const currentCount = count(consensus.current_holder_count);
  const buyerCount = count(consensus.buyer_count);
  const trimmerCount = count(consensus.trimmer_count);
  const exitCount = count(consensus.exit_count);
  const unknownCount = count(consensus.unknown_move_count);
  const totalValue = number(consensus.total_value_usd);
  const hhi = nullableNumber(consensus.ownership_hhi, 0, 1);
  const maxWeight = nullableNumber(consensus.max_book_weight_pct, 0, 100);
  const avgWeight = nullableNumber(consensus.avg_book_weight_pct, 0, 100);
  const computedTotal = rounded(current.reduce((sum, position) => sum + position.value_usd, 0), 2);
  const computedHhi = computedTotal > 0
    ? rounded(current.reduce((sum, position) => sum + (position.value_usd / computedTotal) ** 2, 0), 6)
    : null;
  const weights = current.map((position) => position.book_weight_pct);
  const computedMaxWeight = weights.length ? rounded(Math.max(...weights), 4) : null;
  const computedAvgWeight = weights.length ? rounded(weights.reduce((sum, weight) => sum + weight, 0) / weights.length, 4) : null;
  if (currentCount !== current.length || buyerCount !== current.filter((position) => position.action === "new" || position.action === "add").length
    || trimmerCount !== current.filter((position) => position.action === "trim").length
    || exitCount !== positions.filter((position) => position.action === "exit").length
    || unknownCount !== current.filter((position) => position.action === "unavailable").length
    || totalValue === null || hhi === undefined || maxWeight === undefined || avgWeight === undefined
    || !sameNumber(totalValue, computedTotal, 0.005) || !sameNumber(hhi, computedHhi, 0.0000005)
    || !sameNumber(maxWeight, computedMaxWeight, 0.00005) || !sameNumber(avgWeight, computedAvgWeight, 0.00005)) return null;
  const trend = normalizeTrend(value.trend, coverage.active_manager_count, period.build_as_of, period.consensus_period);
  const warnings = normalizeWarnings(value.warnings);
  if (!trend || !warnings) return null;
  const expectedWarnings: CompanyInstitutionalWarning[] = [];
  if (coverage.missing_manager_count) expectedWarnings.push("current_snapshots_missing");
  if (coverage.comparison_missing_manager_count) expectedWarnings.push("comparison_snapshots_missing");
  if (coverage.unresolved_position_count) expectedWarnings.push("resolution_partial");
  if (trend.status === "insufficient_coverage") expectedWarnings.push("history_coverage_incomplete");
  expectedWarnings.sort();
  if (warnings.join("|") !== expectedWarnings.join("|")
    || (value.status === "no_covered_holder") !== (currentCount === 0)
    || (value.status === "ready" && warnings.length > 0)
    || (value.status === "partial" && warnings.length === 0)) return null;
  return {
    schema: COMPANY_INSTITUTIONAL_CONTEXT_SCHEMA, authority: "context_only", is_context_only: true,
    generated_at: value.generated_at, generation_id: value.generation_id, status: value.status,
    company: { ticker },
    company_intelligence: {
      generation_id: ci.generation_id as string, context_sha256: ci.context_sha256 as string,
      latest_event_id: ci.latest_event_id as string | null, latest_event_call_date: ci.latest_event_call_date as string | null,
    },
    period: {
      build_as_of: period.build_as_of, consensus_period: period.consensus_period, comparison_period: period.comparison_period,
      filing_window_closed_on: period.filing_window_closed_on, consensus_available_on: period.consensus_available_on as string | null,
      latest_reporting_filing_date: period.latest_reporting_filing_date as string | null,
    },
    coverage, positions,
    consensus: {
      current_holder_count: currentCount, buyer_count: buyerCount as number, trimmer_count: trimmerCount as number,
      exit_count: exitCount as number, unknown_move_count: unknownCount as number, total_value_usd: totalValue,
      ownership_hhi: hhi, max_book_weight_pct: maxWeight, avg_book_weight_pct: avgWeight,
    },
    trend, warnings,
  };
}

export function normalizeCompanyInstitutionalManifest(raw: unknown): CompanyInstitutionalManifest | null {
  const value = object(raw);
  const keys = ["schema", "generation_id", "generated_at", "company_count", "covered_company_count", "position_record_count", "consensus_period", "coverage", "source", "files", "status", "warnings"];
  if (!value || !exactKeys(value, keys) || value.schema !== COMPANY_INSTITUTIONAL_MANIFEST_SCHEMA
    || !validGeneration(value.generation_id) || !validTimestamp(value.generated_at) || !validDate(value.consensus_period)
    || (value.status !== "ready" && value.status !== "partial" && value.status !== "empty")) return null;
  const companyCount = count(value.company_count, 1_000_000);
  const coveredCount = count(value.covered_company_count, 1_000_000);
  const positionCount = count(value.position_record_count, 1_000_000);
  const coverage = normalizeCoverage(value.coverage);
  const warnings = normalizeWarnings(value.warnings);
  const source = object(value.source);
  if (companyCount === null || coveredCount === null || coveredCount > companyCount || positionCount === null || !coverage || !warnings
    || !source || !exactKeys(source, ["company_intelligence", "smart_money_config", "share_class_equivalence", "universe_membership", "snapshot_index", "builder"])
    || source.builder !== COMPANY_INSTITUTIONAL_CONTEXT_SCHEMA) return null;
  const ci = object(source.company_intelligence);
  const smart = object(source.smart_money_config);
  const classes = object(source.share_class_equivalence);
  const universe = object(source.universe_membership);
  const snapshots = object(source.snapshot_index);
  if (!ci || !exactKeys(ci, ["generation_id", "sha256"]) || !validGeneration(ci.generation_id) || !validSha(ci.sha256)
    || !smart || !exactKeys(smart, ["sha256"]) || !validSha(smart.sha256)
    || !classes || !exactKeys(classes, ["sha256"]) || !validSha(classes.sha256)
    || !universe || !exactKeys(universe, ["sha256"]) || !validSha(universe.sha256)
    || !snapshots || !exactKeys(snapshots, ["sha256", "snapshot_count", "manager_count"]) || !validSha(snapshots.sha256)) return null;
  const snapshotCount = count(snapshots.snapshot_count);
  const managerCount = count(snapshots.manager_count, 10_000);
  const files = object(value.files);
  if (snapshotCount === null || managerCount === null || !files || Object.keys(files).length !== companyCount || Object.keys(files).length > MAX_MANIFEST_FILES) return null;
  const normalizedFiles: Record<string, { sha256: string; bytes: number }> = {};
  for (const [path, rawReceipt] of Object.entries(files)) {
    const match = path.match(/^companies\/([A-Z0-9](?:[A-Z0-9.-]{0,14}[A-Z0-9])?)\.json$/);
    const receipt = object(rawReceipt);
    const bytes = receipt ? count(receipt.bytes, 100_000_000) : null;
    if (!match || normalizeCompanyIntelligenceSymbol(match[1]) !== match[1] || !receipt || !exactKeys(receipt, ["sha256", "bytes"])
      || !validSha(receipt.sha256) || bytes === null || bytes <= 0) return null;
    normalizedFiles[path] = { sha256: receipt.sha256, bytes };
  }
  if ((value.status === "empty") !== (companyCount === 0)
    || (value.status === "ready" && warnings.length > 0)
    || (value.status === "partial" && warnings.length === 0)) return null;
  return {
    schema: COMPANY_INSTITUTIONAL_MANIFEST_SCHEMA, generation_id: value.generation_id, generated_at: value.generated_at,
    company_count: companyCount, covered_company_count: coveredCount, position_record_count: positionCount,
    consensus_period: value.consensus_period, coverage,
    source: {
      company_intelligence: { generation_id: ci.generation_id as string, sha256: ci.sha256 as string },
      smart_money_config: { sha256: smart.sha256 as string }, share_class_equivalence: { sha256: classes.sha256 as string },
      universe_membership: { sha256: universe.sha256 as string },
      snapshot_index: { sha256: snapshots.sha256 as string, snapshot_count: snapshotCount, manager_count: managerCount },
      builder: COMPANY_INSTITUTIONAL_CONTEXT_SCHEMA,
    },
    files: normalizedFiles, status: value.status, warnings,
  };
}

function error(code: CompanyInstitutionalErrorCode, message: string, retryable: boolean): CompanyInstitutionalResult {
  return { ok: false, state: "error", error: { code, message, retryable } };
}

function ready(context: CompanyInstitutionalContext, state: CompanyInstitutionalState = context.status): CompanyInstitutionalResult {
  return { ok: true, state, context };
}

function validR2Base(base: string): string | null {
  try {
    const parsed = new URL(base);
    return parsed.protocol === "https:" && parsed.hostname === R2_HOST && !parsed.port && parsed.pathname === "/"
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      ? parsed.toString().replace(/\/$/, "") : null;
  } catch { return null; }
}

function pinnedFinalUrl(requestedUrl: string, finalUrl: string): boolean {
  if (!finalUrl) return true;
  try {
    const requested = new URL(requestedUrl);
    const final = new URL(finalUrl);
    return final.protocol === "https:" && final.hostname === R2_HOST && !final.port && final.origin === requested.origin
      && final.pathname === requested.pathname && final.search === requested.search && final.hash === "";
  } catch { return false; }
}

async function readBounded(response: Response, controller: AbortController): Promise<Uint8Array | null> {
  const header = response.headers.get("content-length");
  if (header !== null) {
    const advertised = Number(header);
    if (!Number.isSafeInteger(advertised) || advertised < 0 || advertised > COMPANY_INSTITUTIONAL_MAX_R2_JSON_BYTES) return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > COMPANY_INSTITUTIONAL_MAX_R2_JSON_BYTES) {
        controller.abort();
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } catch { return null; } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<FetchedJson> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: controller.signal });
    if (!pinnedFinalUrl(url, response.url)) return { kind: "failure" };
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "failure" };
    const bytes = await readBounded(response, controller);
    if (!bytes) return { kind: "failure" };
    try { return { kind: "ok", raw: JSON.parse(new TextDecoder().decode(bytes)), bytes }; }
    catch { return { kind: "failure" }; }
  } catch { return { kind: "failure" }; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}

function canonicalJson(value: unknown): string | null {
  try {
    const normalize = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(normalize);
      if (item !== null && typeof item === "object") {
        const source = item as Record<string, unknown>;
        return Object.fromEntries(Object.keys(source).sort().map((key) => [key, normalize(source[key])]));
      }
      return item;
    };
    return JSON.stringify(normalize(value));
  } catch { return null; }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function matchesLineage(
  context: CompanyInstitutionalContext,
  manifest: CompanyInstitutionalManifest,
  expected?: CompanyIntelligenceVerifiedLineage,
): boolean {
  return context.generation_id === manifest.generation_id
    && context.generated_at === manifest.generated_at
    && context.period.consensus_period === manifest.consensus_period
    && context.company_intelligence.generation_id === manifest.source.company_intelligence.generation_id
    && (!expected || (
      context.company_intelligence.generation_id === expected.generation_id
      && context.company_intelligence.context_sha256 === expected.context_sha256
      && context.company_intelligence.latest_event_id === expected.latest_event_id
      && context.company_intelligence.latest_event_call_date === expected.latest_event_call_date
      && manifest.source.company_intelligence.sha256 === expected.manifest_sha256
    ));
}

function remember(key: string, ticker: string, context: CompanyInstitutionalContext, at: number): void {
  if (!contextCache.has(key) && contextCache.size >= MAX_CONTEXT_CACHE_ENTRIES) {
    const oldest = contextCache.keys().next().value as string | undefined;
    if (oldest) contextCache.delete(oldest);
  }
  contextCache.set(key, { context, at });
  if (!lastGoodByTicker.has(ticker) && lastGoodByTicker.size >= MAX_CONTEXT_CACHE_ENTRIES) {
    const oldest = lastGoodByTicker.keys().next().value as string | undefined;
    if (oldest) lastGoodByTicker.delete(oldest);
  }
  lastGoodByTicker.set(ticker, { context, at });
}

async function loadVerifiedManifest(base: string, signal?: AbortSignal): Promise<{ manifest: CompanyInstitutionalManifest; stale: boolean } | "invalid" | null> {
  const now = Date.now();
  if (manifestCache && now - manifestCache.at < MANIFEST_TTL_MS) return { manifest: manifestCache.manifest, stale: false };
  const marker = await fetchJson(`${base}/company_institutional_context/manifest.json`, signal);
  if (marker.kind !== "ok") return manifestCache ? { manifest: manifestCache.manifest, stale: true } : null;
  const markerManifest = normalizeCompanyInstitutionalManifest(marker.raw);
  if (!markerManifest) return manifestCache ? { manifest: manifestCache.manifest, stale: true } : "invalid";
  const immutable = await fetchJson(`${base}/company_institutional_context/generations/${markerManifest.generation_id}/manifest.json`, signal);
  if (immutable.kind !== "ok") return manifestCache ? { manifest: manifestCache.manifest, stale: true } : immutable.kind === "missing" ? "invalid" : null;
  const immutableManifest = normalizeCompanyInstitutionalManifest(immutable.raw);
  const markerCanonical = canonicalJson(marker.raw);
  const immutableCanonical = canonicalJson(immutable.raw);
  if (!immutableManifest || !markerCanonical || markerCanonical !== immutableCanonical
    || immutableManifest.generation_id !== markerManifest.generation_id) return manifestCache ? { manifest: manifestCache.manifest, stale: true } : "invalid";
  manifestCache = { manifest: markerManifest, at: now };
  return { manifest: markerManifest, stale: false };
}

export async function resolveCompanyInstitutionalContextFromR2(
  symbol: string,
  base: string,
  options: { signal?: AbortSignal; expectedCompanyIntelligence?: CompanyIntelligenceVerifiedLineage } = {},
): Promise<CompanyInstitutionalResult> {
  const ticker = normalizeCompanyIntelligenceSymbol(symbol);
  if (!ticker) return error("invalid_symbol", "Invalid ticker", false);
  const expected = options.expectedCompanyIntelligence;
  if (expected && (!validGeneration(expected.generation_id) || !validSha(expected.context_sha256) || !validSha(expected.manifest_sha256)
    || ((expected.latest_event_id === null) !== (expected.latest_event_call_date === null))
    || (expected.latest_event_id !== null && (!text(expected.latest_event_id, 128) || !validDateOrTimestamp(expected.latest_event_call_date))))) {
    return error("invalid_payload", "Current Company Intelligence lineage is invalid", true);
  }
  const safeBase = validR2Base(base);
  if (!safeBase) return error("upstream_unavailable", "Institutional context is unavailable", true);
  const manifestRead = await loadVerifiedManifest(safeBase, options.signal);
  if (manifestRead === "invalid") return error("invalid_payload", "Institutional context publication is invalid", true);
  if (!manifestRead) return error("upstream_unavailable", "Institutional context is unavailable", true);
  const { manifest, stale } = manifestRead;
  if (expected && (manifest.source.company_intelligence.generation_id !== expected.generation_id
    || manifest.source.company_intelligence.sha256 !== expected.manifest_sha256)) {
    return error("invalid_payload", "Institutional context is not aligned with current Company Intelligence", true);
  }
  const receipt = manifest.files[`companies/${ticker}.json`];
  const cacheKey = `${manifest.generation_id}:${ticker}`;
  const cached = contextCache.get(cacheKey);
  const remembered = lastGoodByTicker.get(ticker);
  const cachedContext = cached && matchesLineage(cached.context, manifest, expected) ? cached.context : null;
  const lastGood = remembered && matchesLineage(remembered.context, manifest, expected) ? remembered.context : null;
  if (stale) return cachedContext ? ready(cachedContext, "stale") : lastGood ? ready(lastGood, "stale")
    : error("upstream_unavailable", "Institutional context is temporarily unavailable", true);
  if (!receipt) return error("not_found", "Institutional context is not covered", false);
  const now = Date.now();
  if (cachedContext && cached && now - cached.at < CONTEXT_TTL_MS) return ready(cachedContext);
  const fetched = await fetchJson(`${safeBase}/company_institutional_context/generations/${manifest.generation_id}/companies/${ticker}.json`, options.signal);
  if (fetched.kind === "missing") return lastGood ? ready(lastGood, "stale") : error("invalid_payload", "Institutional context publication is incomplete", true);
  if (fetched.kind !== "ok") return cachedContext ? ready(cachedContext, "stale") : lastGood ? ready(lastGood, "stale")
    : error("upstream_unavailable", "Institutional context is temporarily unavailable", true);
  const hash = await sha256Hex(fetched.bytes);
  if (fetched.bytes.byteLength !== receipt.bytes || hash !== receipt.sha256) return cachedContext ? ready(cachedContext, "stale") : lastGood ? ready(lastGood, "stale")
    : error("invalid_payload", "Institutional context failed its manifest receipt", true);
  const context = normalizeCompanyInstitutionalContext(fetched.raw, ticker, manifest.generation_id);
  if (!context || !matchesLineage(context, manifest, expected)) return cachedContext ? ready(cachedContext, "stale") : lastGood ? ready(lastGood, "stale")
    : error("invalid_payload", "Institutional context payload is invalid", true);
  remember(cacheKey, ticker, context, now);
  return ready(context);
}

export async function getCompanyInstitutionalContext(
  symbol: string,
  options: { signal?: AbortSignal; retryNonce?: number } = {},
): Promise<CompanyInstitutionalResult> {
  const ticker = normalizeCompanyIntelligenceSymbol(symbol);
  if (!ticker) return error("invalid_symbol", "Invalid ticker", false);
  const suffix = options.retryNonce === undefined ? "" : `?retry=${encodeURIComponent(String(options.retryNonce))}`;
  try {
    const response = await fetch(`/api/company-institutional-context/${encodeURIComponent(ticker)}${suffix}`, {
      cache: "no-store", signal: options.signal, headers: { accept: "application/json", "cache-control": "no-store" },
    });
    let raw: unknown;
    try { raw = await response.json(); } catch { return error("upstream_unavailable", "Institutional context returned malformed JSON", true); }
    const payload = object(raw);
    if (!payload) return error("upstream_unavailable", "Institutional context returned malformed JSON", true);
    if (payload.ok === false && payload.state === "error") {
      const issue = object(payload.error);
      const code = issue?.code;
      const message = text(issue?.message, 300);
      if ((code === "invalid_symbol" || code === "not_found" || code === "unauthorized" || code === "upstream_unavailable" || code === "invalid_payload")
        && message && typeof issue?.retryable === "boolean") return error(code, message, issue.retryable);
    }
    if (payload.ok === true && (payload.state === "ready" || payload.state === "partial" || payload.state === "no_covered_holder" || payload.state === "stale" || payload.state === "not_covered")) {
      const context = normalizeCompanyInstitutionalContext(payload.context, ticker);
      if (context && (payload.state === "stale" || payload.state === context.status)) return ready(context, payload.state);
    }
    return error(response.status === 404 ? "not_found" : "upstream_unavailable", "Institutional context returned an invalid response", response.status !== 404);
  } catch { return error("upstream_unavailable", "Institutional context could not be reached", true); }
}

export function __resetCompanyInstitutionalContextCacheForTests(): void {
  manifestCache = null;
  contextCache.clear();
  lastGoodByTicker.clear();
}
