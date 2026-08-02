/**
 * Company Intelligence is a display-only, generation-pinned context feed.
 *
 * This module deliberately has two seams:
 * - the browser calls the same-origin BFF via getCompanyIntelligence(); and
 * - the route uses resolveCompanyIntelligenceFromR2() to fetch and sanitize R2.
 *
 * The normalizers build new objects field-by-field. Never relay an R2 object through
 * this boundary: this feed contains external URLs and free-form source text.
 */

export const COMPANY_INTELLIGENCE_CONTEXT_SCHEMA = "company_intelligence_context.v1" as const;
export const COMPANY_INTELLIGENCE_MANIFEST_SCHEMA = "company_intelligence_manifest.v1" as const;

export type CompanyIntelligenceStatus = "ready" | "partial" | "stale" | "not_covered";
export type CompanyIntelligenceSourceKind = "earnings_history" | "score_overlay" | "transcript";
export type CompanyIntelligenceSourceRef = CompanyIntelligenceSourceKind;
export type CompanyIntelligenceSourceStatus = "present" | "metadata_only" | "missing";
export type CompanyIntelligenceCitationPrecision = "document" | "metadata";

export interface CompanyIntelligenceSourceReceipt {
  source_hash?: string;
  source_date?: string;
  record_id?: string;
}

export interface CompanyIntelligenceSource {
  source_ref: CompanyIntelligenceSourceRef;
  kind: CompanyIntelligenceSourceKind;
  status: CompanyIntelligenceSourceStatus;
  citation_precision: CompanyIntelligenceCitationPrecision;
  url: string | null;
  receipt: CompanyIntelligenceSourceReceipt | null;
}

export interface CompanyIntelligenceMetrics {
  sentiment: number | null;
  performance: number | null;
  confidence: number | null;
  combined: number | null;
  call_positivity: number | null;
  management_confidence: number | null;
  analyst_criticism: number | null;
  future_outlook: number | null;
  revenue_growth_pct: number | null;
  eps_growth_pct: number | null;
  gross_margin_pct: number | null;
  analysts_count: number | null;
  questions_count: number | null;
}

export interface CompanyIntelligenceFieldLineage {
  summary: CompanyIntelligenceSourceRef | null;
  key_quote: CompanyIntelligenceSourceRef | null;
  metrics: Record<keyof CompanyIntelligenceMetrics, CompanyIntelligenceSourceRef | null>;
  positive_highlights: CompanyIntelligenceSourceRef[];
  negative_highlights: CompanyIntelligenceSourceRef[];
  highlights: CompanyIntelligenceSourceRef[];
  tags: Record<string, CompanyIntelligenceSourceRef>;
}

export interface CompanyIntelligenceEvent {
  event_id: string;
  ticker: string;
  fiscal_year: number;
  fiscal_quarter: number;
  call_date: string;
  summary: string | null;
  highlights: string[];
  positive_highlights: string[];
  negative_highlights: string[];
  key_quote: string | null;
  tags: string[];
  metrics: CompanyIntelligenceMetrics;
  field_lineage: CompanyIntelligenceFieldLineage;
  previous_event_deltas: CompanyIntelligenceMetrics;
  sources: CompanyIntelligenceSource[];
  claim_citations_pending: true;
}

export interface CompanyIntelligenceTopic {
  tag: string;
  first_event_id: string;
  last_event_id: string;
  event_count: number;
  status: "added" | "persistent" | "dropped";
}

export interface CompanyIntelligenceContext {
  schema: typeof COMPANY_INTELLIGENCE_CONTEXT_SCHEMA;
  authority: "context_only";
  /** Explicit local guard for consumers: this feed never carries an action authority. */
  is_context_only: true;
  generated_at: string;
  generation_id: string;
  company: {
    ticker: string;
    display_name: string | null;
    exchange: null;
  };
  status: CompanyIntelligenceStatus;
  latest_event_id: string | null;
  latest_event: CompanyIntelligenceEvent | null;
  history: CompanyIntelligenceEvent[];
  topics: {
    timeline: CompanyIntelligenceTopic[];
    added: string[];
    dropped: string[];
    persistent: string[];
  };
  source_completeness: {
    earnings_history: { status: "present" | "partial" | "metadata_only" | "missing"; event_count: number };
    score_overlay: { status: "present" | "metadata_only" | "missing"; event_count: number };
    transcripts: { status: "present" | "partial" | "missing"; event_count: number };
  };
  warnings: string[];
  missing_sources: string[];
  transport_lineage: {
    earnings_manifest: { generation_id: string; sha256: string };
    tx_index: { schema: string; generation_id: string; sha256: string };
    builder: "company_intelligence.v1";
  };
}

export interface CompanyIntelligenceManifestFile {
  sha256: string;
  bytes: number;
}

export interface CompanyIntelligenceManifest {
  schema: typeof COMPANY_INTELLIGENCE_MANIFEST_SCHEMA;
  generation_id: string;
  generated_at: string;
  company_count: number;
  event_count: number;
  latest_event_date: string | null;
  source: {
    earnings_manifest: {
      generation_id: string;
      sha256: string;
      observed_counts: {
        history_rows: number;
        history_tickers: number;
        score_rows: number;
        score_tickers: number;
      };
    };
    tx_index: { schema: string; generation_id: string; sha256: string };
  };
  files: Record<string, CompanyIntelligenceManifestFile>;
  status: "ready" | "degraded" | "empty";
  warnings: string[];
  operational: { history_rows_rejected: number };
}

export type CompanyIntelligenceErrorCode =
  | "invalid_symbol"
  | "not_found"
  | "upstream_unavailable"
  | "invalid_payload";

export type CompanyIntelligenceResult =
  | {
    ok: true;
    state: "ready" | "partial" | "stale" | "not_covered";
    context: CompanyIntelligenceContext;
  }
  | {
    ok: false;
    state: "error";
    error: { code: CompanyIntelligenceErrorCode; message: string; retryable: boolean };
  };

/** Server-only receipts that bind a verified company object to its manifest. */
export interface CompanyIntelligenceVerifiedLineage {
  generation_id: string;
  latest_event_id: string | null;
  latest_event_call_date: string | null;
  context_sha256: string;
  manifest_sha256: string;
}

export interface CompanyIntelligenceLineageResolution {
  result: CompanyIntelligenceResult;
  lineage: CompanyIntelligenceVerifiedLineage | null;
}

type ServerResolution = CompanyIntelligenceResult;
type JsonRecord = Record<string, unknown>;

const SAFE_SYMBOL = /^[A-Z0-9](?:[A-Z0-9.-]{0,14}[A-Z0-9])?$/;
const SAFE_GENERATION = /^[a-f0-9]{24,64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_HISTORY = 12;
const MAX_SOURCES = 12;
const MAX_HIGHLIGHTS = 48;
const MAX_TAGS = 32;
// A twelve-event history can legitimately contribute up to 12 × 32 distinct
// bounded tags. Keep the union bounded without rejecting real long histories.
const MAX_TOPICS = MAX_HISTORY * MAX_TAGS;
const MAX_WARNINGS = 32;
const MAX_MISSING_SOURCES = 32;
const MAX_MANIFEST_FILES = 20_000;
const MAX_DISPLAY_NAME = 240;
const MAX_EVENT_ID = 128;
const MAX_SUMMARY = 8_000;
const MAX_QUOTE = 4_000;
const MAX_HIGHLIGHT = 1_200;
const MAX_TAG = 160;
const MAX_WARNING = 600;
const MAX_SCHEMA = 120;
const MAX_RECORD_ID = 160;
const MAX_URL = 2_048;
const MAX_NUMERIC_ABS = 1_000_000_000;
const MANIFEST_TTL_MS = 30_000;
const CONTEXT_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 2_500;
/** A company context is small; cap network bodies before JSON parsing or hashing. */
export const COMPANY_INTELLIGENCE_MAX_R2_JSON_BYTES = 4 * 1024 * 1024;
const MAX_CONTEXT_CACHE_ENTRIES = 256;
// This is intentionally a hostname rather than a suffix check: the BFF may
// only read the designated public R2 bucket, never an arbitrary HTTPS host.
const COMPANY_INTELLIGENCE_R2_HOST = "pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev";
const METRIC_KEYS = [
  "sentiment", "performance", "confidence", "combined", "call_positivity", "management_confidence",
  "analyst_criticism", "future_outlook", "revenue_growth_pct", "eps_growth_pct", "gross_margin_pct",
  "analysts_count", "questions_count",
] as const satisfies readonly (keyof CompanyIntelligenceMetrics)[];
const SOURCE_REFS = new Set<CompanyIntelligenceSourceRef>(["earnings_history", "score_overlay", "transcript"]);

type ManifestCache = { data: CompanyIntelligenceManifest; at: number };
type ContextCache = { data: CompanyIntelligenceContext; at: number };
let manifestCache: ManifestCache | null = null;
let verifiedManifestReceiptCache: { generation_id: string; sha256: string; at: number } | null = null;
const contextCache = new Map<string, ContextCache>();
const lastGoodContextByTicker = new Map<string, ContextCache>();

function object(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && ISO_TIMESTAMP.test(value)
    && Number.isFinite(new Date(value).getTime());
}

function requiredString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function nullableString(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  return requiredString(value, max) ?? undefined;
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function boundedNumberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_NUMERIC_ABS
    ? value
    : undefined;
}

function normalizedStringArray(value: unknown, maxItems: number, maxItemLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    const safe = requiredString(item, maxItemLength);
    if (!safe) return null;
    out.push(safe);
  }
  return out;
}

function validSha(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

export function normalizeCompanyIntelligenceSymbol(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase();
  return SAFE_SYMBOL.test(normalized) && !normalized.includes("..") && !/[\\/]/.test(normalized)
    ? normalized
    : null;
}

export function isCompanyIntelligenceSymbol(symbol: string): boolean {
  return normalizeCompanyIntelligenceSymbol(symbol) !== null;
}

export function isCompanyIntelligenceGenerationId(value: string): boolean {
  return SAFE_GENERATION.test(value) && !value.includes("..");
}

/** Safe display-link policy: HTTPS anywhere, or Terminal's own transcript archive only. */
export function isSafeCompanyIntelligenceSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL || /[\\\r\n]/.test(value)) return false;
  try {
    if (value.startsWith("/")) {
      const parsed = new URL(value, "https://app.mastermind-x.com");
      return parsed.origin === "https://app.mastermind-x.com"
        && parsed.pathname.startsWith("/data/tx/")
        && !parsed.pathname.includes("..")
        && !parsed.search
        && !parsed.hash;
    }
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function normalizeMetrics(raw: unknown): CompanyIntelligenceMetrics | null {
  const obj = object(raw);
  if (!obj) return null;
  const out = {} as CompanyIntelligenceMetrics;
  for (const key of METRIC_KEYS) {
    const value = boundedNumberOrNull(obj[key]);
    if (value === undefined) return null;
    out[key] = value;
  }
  return out;
}

function normalizeSource(raw: unknown): CompanyIntelligenceSource | null {
  const obj = object(raw);
  if (!obj) return null;
  const sourceRef = obj.source_ref;
  const kind = obj.kind;
  const status = obj.status;
  const citationPrecision = obj.citation_precision;
  if (
    (sourceRef !== "earnings_history" && sourceRef !== "score_overlay" && sourceRef !== "transcript")
    || (kind !== "earnings_history" && kind !== "score_overlay" && kind !== "transcript")
    || sourceRef !== kind
    || (status !== "present" && status !== "metadata_only" && status !== "missing")
    || (citationPrecision !== "document" && citationPrecision !== "metadata")
  ) return null;
  const url = obj.url === null ? null : isSafeCompanyIntelligenceSourceUrl(obj.url) ? obj.url : undefined;
  if (url === undefined || (status === "present" && url === null)) return null;

  let receipt: CompanyIntelligenceSourceReceipt | null = null;
  if (obj.receipt !== null) {
    const receiptRaw = object(obj.receipt);
    if (!receiptRaw) return null;
    const sourceHash = receiptRaw.source_hash;
    const sourceDate = receiptRaw.source_date;
    const recordId = receiptRaw.record_id;
    if (Object.keys(receiptRaw).some((key) => key !== "source_hash" && key !== "source_date" && key !== "record_id")) return null;
    if (sourceHash !== undefined && !validSha(sourceHash)) return null;
    // The producer receipts use the source's original calendar date when that is
    // all it knows, and an ISO timestamp when the upstream exposes a publication time.
    if (sourceDate !== undefined && !validDate(sourceDate) && !validTimestamp(sourceDate)) return null;
    const safeRecordId = recordId === undefined ? undefined : requiredString(recordId, MAX_RECORD_ID);
    if (recordId !== undefined && !safeRecordId) return null;
    receipt = {};
    if (typeof sourceHash === "string") receipt.source_hash = sourceHash;
    if (typeof sourceDate === "string") receipt.source_date = sourceDate;
    if (safeRecordId) receipt.record_id = safeRecordId;
  }
  return { source_ref: sourceRef, kind, status, citation_precision: citationPrecision, url, receipt };
}

function normalizeFieldLineage(
  raw: unknown,
  event: {
    summary: string | null;
    keyQuote: string | null;
    metrics: CompanyIntelligenceMetrics;
    highlights: string[];
    positiveHighlights: string[];
    negativeHighlights: string[];
    tags: string[];
  },
  sourceRefs: Set<CompanyIntelligenceSourceRef>,
): CompanyIntelligenceFieldLineage | null {
  const obj = object(raw);
  if (!obj) return null;
  const expectedFields = new Set([
    "summary", "key_quote", "metrics", "positive_highlights", "negative_highlights", "highlights", "tags",
  ]);
  if (Object.keys(obj).length !== expectedFields.size || Object.keys(obj).some((key) => !expectedFields.has(key))) return null;

  const scalarRef = (value: unknown, populated: boolean): CompanyIntelligenceSourceRef | null | undefined => {
    if (!populated) return value === null ? null : undefined;
    return typeof value === "string" && SOURCE_REFS.has(value as CompanyIntelligenceSourceRef)
      && sourceRefs.has(value as CompanyIntelligenceSourceRef)
      ? value as CompanyIntelligenceSourceRef
      : undefined;
  };
  const summary = scalarRef(obj.summary, event.summary !== null);
  const keyQuote = scalarRef(obj.key_quote, event.keyQuote !== null);
  if (summary === undefined || keyQuote === undefined) return null;

  const metricsRaw = object(obj.metrics);
  if (!metricsRaw || Object.keys(metricsRaw).length !== METRIC_KEYS.length
    || Object.keys(metricsRaw).some((key) => !METRIC_KEYS.includes(key as keyof CompanyIntelligenceMetrics))) return null;
  const metrics = {} as CompanyIntelligenceFieldLineage["metrics"];
  for (const key of METRIC_KEYS) {
    const ref = scalarRef(metricsRaw[key], event.metrics[key] !== null);
    if (ref === undefined) return null;
    metrics[key] = ref;
  }

  const refsFor = (value: unknown, expectedLength: number): CompanyIntelligenceSourceRef[] | null => {
    if (!Array.isArray(value) || value.length !== expectedLength) return null;
    const refs: CompanyIntelligenceSourceRef[] = [];
    for (const item of value) {
      if (typeof item !== "string" || !SOURCE_REFS.has(item as CompanyIntelligenceSourceRef)
        || !sourceRefs.has(item as CompanyIntelligenceSourceRef)) return null;
      refs.push(item as CompanyIntelligenceSourceRef);
    }
    return refs;
  };
  const positiveHighlights = refsFor(obj.positive_highlights, event.positiveHighlights.length);
  const negativeHighlights = refsFor(obj.negative_highlights, event.negativeHighlights.length);
  const highlights = refsFor(obj.highlights, event.highlights.length);
  if (!positiveHighlights || !negativeHighlights || !highlights) return null;

  const tagRefsRaw = object(obj.tags);
  if (!tagRefsRaw || new Set(event.tags).size !== event.tags.length
    || Object.keys(tagRefsRaw).length !== event.tags.length
    || Object.keys(tagRefsRaw).some((tag) => !event.tags.includes(tag))) return null;
  const tags: Record<string, CompanyIntelligenceSourceRef> = {};
  for (const tag of event.tags) {
    const ref = tagRefsRaw[tag];
    if (typeof ref !== "string" || !SOURCE_REFS.has(ref as CompanyIntelligenceSourceRef)
      || !sourceRefs.has(ref as CompanyIntelligenceSourceRef)) return null;
    tags[tag] = ref as CompanyIntelligenceSourceRef;
  }
  return {
    summary,
    key_quote: keyQuote,
    metrics,
    positive_highlights: positiveHighlights,
    negative_highlights: negativeHighlights,
    highlights,
    tags,
  };
}

function normalizeEvent(raw: unknown, expectedTicker: string): CompanyIntelligenceEvent | null {
  const obj = object(raw);
  if (!obj) return null;
  const eventId = requiredString(obj.event_id, MAX_EVENT_ID);
  const ticker = typeof obj.ticker === "string" ? normalizeCompanyIntelligenceSymbol(obj.ticker) : null;
  const fiscalYear = boundedInt(obj.fiscal_year, 2000, 2100);
  const fiscalQuarter = boundedInt(obj.fiscal_quarter, 1, 4);
  const summary = nullableString(obj.summary, MAX_SUMMARY);
  const keyQuote = nullableString(obj.key_quote, MAX_QUOTE);
  const highlights = normalizedStringArray(obj.highlights, MAX_HIGHLIGHTS, MAX_HIGHLIGHT);
  const positiveHighlights = normalizedStringArray(obj.positive_highlights, MAX_HIGHLIGHTS, MAX_HIGHLIGHT);
  const negativeHighlights = normalizedStringArray(obj.negative_highlights, MAX_HIGHLIGHTS, MAX_HIGHLIGHT);
  const tags = normalizedStringArray(obj.tags, MAX_TAGS, MAX_TAG);
  const metrics = normalizeMetrics(obj.metrics);
  const previousEventDeltas = normalizeMetrics(obj.previous_event_deltas);
  if (
    !eventId || ticker !== expectedTicker || fiscalYear === null || fiscalQuarter === null || !validDate(obj.call_date)
    || summary === undefined || keyQuote === undefined || !highlights || !positiveHighlights || !negativeHighlights || !tags
    || !metrics || !previousEventDeltas || obj.claim_citations_pending !== true || !Array.isArray(obj.sources)
    || obj.sources.length > MAX_SOURCES
  ) return null;
  const sources: CompanyIntelligenceSource[] = [];
  const sourceRefs = new Set<CompanyIntelligenceSourceRef>();
  for (const rawSource of obj.sources) {
    const source = normalizeSource(rawSource);
    if (!source || sourceRefs.has(source.source_ref)) return null;
    sourceRefs.add(source.source_ref);
    sources.push(source);
  }
  const fieldLineage = normalizeFieldLineage(obj.field_lineage, {
    summary,
    keyQuote,
    metrics,
    highlights,
    positiveHighlights,
    negativeHighlights,
    tags,
  }, sourceRefs);
  if (!fieldLineage) return null;
  return {
    event_id: eventId,
    ticker,
    fiscal_year: fiscalYear,
    fiscal_quarter: fiscalQuarter,
    call_date: obj.call_date,
    summary,
    highlights,
    positive_highlights: positiveHighlights,
    negative_highlights: negativeHighlights,
    key_quote: keyQuote,
    tags,
    metrics,
    field_lineage: fieldLineage,
    previous_event_deltas: previousEventDeltas,
    sources,
    claim_citations_pending: true,
  };
}

function normalizeTopics(raw: unknown): CompanyIntelligenceContext["topics"] | null {
  const obj = object(raw);
  if (!obj) return null;
  if (!Array.isArray(obj.timeline) || obj.timeline.length > MAX_TOPICS) return null;
  const timeline: CompanyIntelligenceTopic[] = [];
  for (const entry of obj.timeline) {
    const item = object(entry);
    if (!item) return null;
    const tag = requiredString(item.tag, MAX_TAG);
    const firstEventId = requiredString(item.first_event_id, MAX_EVENT_ID);
    const lastEventId = requiredString(item.last_event_id, MAX_EVENT_ID);
    const eventCount = boundedInt(item.event_count, 0, MAX_HISTORY);
    if (!tag || !firstEventId || !lastEventId || eventCount === null
      || (item.status !== "added" && item.status !== "persistent" && item.status !== "dropped")) return null;
    timeline.push({ tag, first_event_id: firstEventId, last_event_id: lastEventId, event_count: eventCount, status: item.status });
  }
  const added = normalizedStringArray(obj.added, MAX_TOPICS, MAX_TAG);
  const dropped = normalizedStringArray(obj.dropped, MAX_TOPICS, MAX_TAG);
  const persistent = normalizedStringArray(obj.persistent, MAX_TOPICS, MAX_TAG);
  return added && dropped && persistent ? { timeline, added, dropped, persistent } : null;
}

function normalizeSourceCompleteness(raw: unknown): CompanyIntelligenceContext["source_completeness"] | null {
  const obj = object(raw);
  if (!obj) return null;
  const earnings = object(obj.earnings_history);
  const score = object(obj.score_overlay);
  const transcripts = object(obj.transcripts);
  if (!earnings || !score || !transcripts) return null;
  const earningsCount = boundedInt(earnings.event_count, 0, MAX_HISTORY);
  const scoreCount = boundedInt(score.event_count, 0, MAX_HISTORY);
  const transcriptCount = boundedInt(transcripts.event_count, 0, MAX_HISTORY);
  if (
    earningsCount === null || scoreCount === null || transcriptCount === null
    || (earnings.status !== "present" && earnings.status !== "partial" && earnings.status !== "metadata_only" && earnings.status !== "missing")
    || (score.status !== "present" && score.status !== "metadata_only" && score.status !== "missing")
    || (transcripts.status !== "present" && transcripts.status !== "partial" && transcripts.status !== "missing")
  ) return null;
  return {
    earnings_history: { status: earnings.status, event_count: earningsCount },
    score_overlay: { status: score.status, event_count: scoreCount },
    transcripts: { status: transcripts.status, event_count: transcriptCount },
  };
}

function normalizeTransportLineage(raw: unknown): CompanyIntelligenceContext["transport_lineage"] | null {
  const obj = object(raw);
  const earnings = obj && object(obj.earnings_manifest);
  const txIndex = obj && object(obj.tx_index);
  if (!obj || !earnings || !txIndex || obj.builder !== "company_intelligence.v1") return null;
  const earningsGeneration = typeof earnings.generation_id === "string" ? earnings.generation_id : "";
  const txGeneration = typeof txIndex.generation_id === "string" ? txIndex.generation_id : "";
  const txSchema = requiredString(txIndex.schema, MAX_SCHEMA);
  if (!isCompanyIntelligenceGenerationId(earningsGeneration) || !validSha(earnings.sha256)
    || !isCompanyIntelligenceGenerationId(txGeneration) || !validSha(txIndex.sha256) || !txSchema) return null;
  return {
    earnings_manifest: { generation_id: earningsGeneration, sha256: earnings.sha256 },
    tx_index: { schema: txSchema, generation_id: txGeneration, sha256: txIndex.sha256 },
    builder: "company_intelligence.v1",
  };
}

/**
 * Strictly validates the producer contract, confirms the requested identity, and
 * creates a fresh display-only object. `expectedGenerationId` pins reads to a manifest.
 */
export function normalizeCompanyIntelligence(
  raw: unknown,
  expectedTicker: string,
  expectedGenerationId?: string,
): CompanyIntelligenceContext | null {
  const ticker = normalizeCompanyIntelligenceSymbol(expectedTicker);
  const obj = object(raw);
  if (!ticker || !obj || obj.schema !== COMPANY_INTELLIGENCE_CONTEXT_SCHEMA || obj.authority !== "context_only") return null;
  const generationId = typeof obj.generation_id === "string" ? obj.generation_id : "";
  if (!isCompanyIntelligenceGenerationId(generationId) || (expectedGenerationId && generationId !== expectedGenerationId)
    || !validTimestamp(obj.generated_at)) return null;
  const company = object(obj.company);
  const displayName = company ? nullableString(company.display_name, MAX_DISPLAY_NAME) : undefined;
  if (!company || normalizeCompanyIntelligenceSymbol(typeof company.ticker === "string" ? company.ticker : "") !== ticker
    || company.exchange !== null || displayName === undefined) return null;
  if (obj.status !== "ready" && obj.status !== "partial" && obj.status !== "stale" && obj.status !== "not_covered") return null;
  if (!Array.isArray(obj.history) || obj.history.length > MAX_HISTORY) return null;
  const history: CompanyIntelligenceEvent[] = [];
  const historyIds = new Set<string>();
  for (const eventRaw of obj.history) {
    const event = normalizeEvent(eventRaw, ticker);
    if (!event || historyIds.has(event.event_id)) return null;
    historyIds.add(event.event_id);
    history.push(event);
  }
  const latestEventId = obj.latest_event_id === null ? null : requiredString(obj.latest_event_id, MAX_EVENT_ID);
  if (latestEventId === undefined) return null;
  const latestEvent = obj.latest_event === null ? null : normalizeEvent(obj.latest_event, ticker);
  if ((latestEventId === null) !== (latestEvent === null) || (latestEvent && latestEvent.event_id !== latestEventId)) return null;
  if (latestEvent && historyIds.has(latestEvent.event_id)) {
    const historyEvent = history.find((event) => event.event_id === latestEvent.event_id);
    if (!historyEvent || JSON.stringify(historyEvent) !== JSON.stringify(latestEvent)) return null;
  }
  const topics = normalizeTopics(obj.topics);
  const sourceCompleteness = normalizeSourceCompleteness(obj.source_completeness);
  const warnings = normalizedStringArray(obj.warnings, MAX_WARNINGS, MAX_WARNING);
  const missingSources = normalizedStringArray(obj.missing_sources, MAX_MISSING_SOURCES, MAX_TAG);
  const transportLineage = normalizeTransportLineage(obj.transport_lineage);
  if (!topics || !sourceCompleteness || !warnings || !missingSources || !transportLineage) return null;
  return {
    schema: COMPANY_INTELLIGENCE_CONTEXT_SCHEMA,
    authority: "context_only",
    is_context_only: true,
    generated_at: obj.generated_at,
    generation_id: generationId,
    company: { ticker, display_name: displayName, exchange: null },
    status: obj.status,
    latest_event_id: latestEventId,
    latest_event: latestEvent,
    history,
    topics,
    source_completeness: sourceCompleteness,
    warnings,
    missing_sources: missingSources,
    transport_lineage: transportLineage,
  };
}

/** Strict manifest normalizer. It validates every file key before route code uses one. */
export function normalizeCompanyIntelligenceManifest(raw: unknown): CompanyIntelligenceManifest | null {
  const obj = object(raw);
  if (!obj || !exactKeys(obj, ["schema", "generation_id", "generated_at", "company_count", "event_count", "latest_event_date", "source", "files", "status", "warnings", "operational"])
    || obj.schema !== COMPANY_INTELLIGENCE_MANIFEST_SCHEMA || !validTimestamp(obj.generated_at)) return null;
  const generationId = typeof obj.generation_id === "string" ? obj.generation_id : "";
  const companyCount = boundedInt(obj.company_count, 0, MAX_MANIFEST_FILES);
  const eventCount = boundedInt(obj.event_count, 0, MAX_MANIFEST_FILES * MAX_HISTORY);
  const latestEventDate = obj.latest_event_date === null ? null : validDate(obj.latest_event_date) ? obj.latest_event_date : undefined;
  if (!isCompanyIntelligenceGenerationId(generationId) || companyCount === null || eventCount === null || latestEventDate === undefined
    || (obj.status !== "ready" && obj.status !== "degraded" && obj.status !== "empty")) return null;
  const source = object(obj.source);
  const earnings = source && object(source.earnings_manifest);
  const txIndex = source && object(source.tx_index);
  const observed = earnings && object(earnings.observed_counts);
  const earningsGeneration = earnings && typeof earnings.generation_id === "string" ? earnings.generation_id : "";
  const txGeneration = txIndex && typeof txIndex.generation_id === "string" ? txIndex.generation_id : "";
  const txSchema = txIndex && requiredString(txIndex.schema, MAX_SCHEMA);
  if (!source || !exactKeys(source, ["earnings_manifest", "tx_index"])
    || !earnings || !exactKeys(earnings, ["generation_id", "observed_counts", "sha256"])
    || !observed || !exactKeys(observed, ["history_rows", "history_tickers", "score_rows", "score_tickers"])
    || !txIndex || !exactKeys(txIndex, ["schema", "generation_id", "sha256"])
    || !isCompanyIntelligenceGenerationId(earningsGeneration) || !validSha(earnings.sha256)
    || !isCompanyIntelligenceGenerationId(txGeneration) || !validSha(txIndex.sha256) || !txSchema) return null;
  const historyRows = boundedInt(observed.history_rows, 0, 100_000_000);
  const historyTickers = boundedInt(observed.history_tickers, 0, MAX_MANIFEST_FILES);
  const scoreRows = boundedInt(observed.score_rows, 0, 100_000_000);
  const scoreTickers = boundedInt(observed.score_tickers, 0, MAX_MANIFEST_FILES);
  const operational = object(obj.operational);
  const rejectedRows = operational && exactKeys(operational, ["history_rows_rejected"])
    ? boundedInt(operational.history_rows_rejected, 0, 100_000_000) : null;
  if (historyRows === null || historyTickers === null || scoreRows === null || scoreTickers === null || rejectedRows === null) return null;
  const filesRaw = object(obj.files);
  if (!filesRaw || Object.keys(filesRaw).length > MAX_MANIFEST_FILES) return null;
  const files: Record<string, CompanyIntelligenceManifestFile> = {};
  for (const [key, rawFile] of Object.entries(filesRaw)) {
    const match = /^companies\/([A-Z0-9.-]+)\.json$/.exec(key);
    const ticker = match ? normalizeCompanyIntelligenceSymbol(match[1]) : null;
    const file = object(rawFile);
    const bytes = file ? boundedInt(file.bytes, 0, COMPANY_INTELLIGENCE_MAX_R2_JSON_BYTES) : null;
    if (!ticker || key !== `companies/${ticker}.json` || !file || !validSha(file.sha256) || bytes === null) return null;
    files[key] = { sha256: file.sha256, bytes };
  }
  const warnings = normalizedStringArray(obj.warnings, MAX_WARNINGS, MAX_WARNING);
  if (!warnings) return null;
  return {
    schema: COMPANY_INTELLIGENCE_MANIFEST_SCHEMA,
    generation_id: generationId,
    generated_at: obj.generated_at,
    company_count: companyCount,
    event_count: eventCount,
    latest_event_date: latestEventDate,
    source: {
      earnings_manifest: {
        generation_id: earningsGeneration,
        observed_counts: { history_rows: historyRows, history_tickers: historyTickers, score_rows: scoreRows, score_tickers: scoreTickers },
        sha256: earnings.sha256,
      },
      tx_index: { schema: txSchema, generation_id: txGeneration, sha256: txIndex.sha256 },
    },
    files,
    status: obj.status,
    warnings,
    operational: { history_rows_rejected: rejectedRows },
  };
}

function error(code: CompanyIntelligenceErrorCode, message: string, retryable: boolean): CompanyIntelligenceResult {
  return { ok: false, state: "error", error: { code, message, retryable } };
}

function contextResult(context: CompanyIntelligenceContext): CompanyIntelligenceResult {
  return { ok: true, state: context.status, context };
}

function staleContext(context: CompanyIntelligenceContext): CompanyIntelligenceContext {
  return { ...context, status: "stale", history: [...context.history], warnings: [...context.warnings] };
}

function validateR2Base(base: string): string | null {
  try {
    const parsed = new URL(base);
    return parsed.protocol === "https:" && parsed.hostname === COMPANY_INTELLIGENCE_R2_HOST && !parsed.port
      && parsed.pathname === "/" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      ? parsed.toString().replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}

type FetchedJson = { kind: "ok"; raw: unknown; bytes: Uint8Array } | { kind: "missing" } | { kind: "failure" };

function isPinnedR2FinalUrl(requestedUrl: string, finalUrl: string): boolean {
  // Response.url is blank in our in-memory Response fixtures. Production fetch
  // supplies it; redirect:'error' plus this exact-origin/path check prevents an
  // upstream redirect or final URL from silently widening the fetch boundary.
  if (!finalUrl) return true;
  try {
    const requested = new URL(requestedUrl);
    const final = new URL(finalUrl);
    return final.protocol === "https:" && final.hostname === COMPANY_INTELLIGENCE_R2_HOST && !final.port
      && final.origin === requested.origin && final.pathname === requested.pathname
      && final.search === requested.search && final.hash === "";
  } catch {
    return false;
  }
}

async function boundedResponseBytes(response: Response, controller: AbortController): Promise<Uint8Array | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const advertised = Number(contentLength);
    if (!Number.isSafeInteger(advertised) || advertised < 0 || advertised > COMPANY_INTELLIGENCE_MAX_R2_JSON_BYTES) return null;
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
      if (total > COMPANY_INTELLIGENCE_MAX_R2_JSON_BYTES) {
        controller.abort();
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<FetchedJson> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: controller.signal });
    if (!isPinnedR2FinalUrl(url, response.url)) return { kind: "failure" };
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "failure" };
    try {
      const bytes = await boundedResponseBytes(response, controller);
      if (!bytes) return { kind: "failure" };
      return { kind: "ok", raw: JSON.parse(new TextDecoder().decode(bytes)), bytes };
    } catch {
      return { kind: "failure" };
    }
  } catch {
    return { kind: "failure" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string | null {
  try {
    const normalize = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(normalize);
      if (item !== null && typeof item === "object") {
        const source = item as Record<string, unknown>;
        const target: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort()) target[key] = normalize(source[key]);
        return target;
      }
      return item;
    };
    return JSON.stringify(normalize(value));
  } catch {
    return null;
  }
}

function rememberContext(key: string, ticker: string, context: CompanyIntelligenceContext, at: number): void {
  if (!contextCache.has(key) && contextCache.size >= MAX_CONTEXT_CACHE_ENTRIES) {
    const oldest = contextCache.keys().next().value as string | undefined;
    if (oldest) contextCache.delete(oldest);
  }
  contextCache.set(key, { data: context, at });
  if (!lastGoodContextByTicker.has(ticker) && lastGoodContextByTicker.size >= MAX_CONTEXT_CACHE_ENTRIES) {
    const oldestTicker = lastGoodContextByTicker.keys().next().value as string | undefined;
    if (oldestTicker) lastGoodContextByTicker.delete(oldestTicker);
  }
  lastGoodContextByTicker.set(ticker, { data: context, at });
}

async function loadManifest(base: string, signal?: AbortSignal): Promise<{ manifest: CompanyIntelligenceManifest; stale: boolean } | null | "invalid"> {
  const now = Date.now();
  if (manifestCache && now - manifestCache.at < MANIFEST_TTL_MS) return { manifest: manifestCache.data, stale: false };
  const fetched = await fetchJson(`${base}/company_intelligence/manifest.json`, signal);
  if (fetched.kind === "ok") {
    const manifest = normalizeCompanyIntelligenceManifest(fetched.raw);
    if (!manifest) return manifestCache ? { manifest: manifestCache.data, stale: true } : "invalid";
    manifestCache = { data: manifest, at: now };
    return { manifest, stale: false };
  }
  if (manifestCache) return { manifest: manifestCache.data, stale: true };
  return fetched.kind === "missing" ? null : null;
}

/**
 * Server-only R2 resolver used by the BFF. `base` must be the trusted R2_BASE
 * constant from upstreams.ts; it is still URL-validated to keep the helper safe in tests.
 */
export async function resolveCompanyIntelligenceFromR2(
  symbol: string,
  base: string,
  options: { signal?: AbortSignal } = {},
): Promise<ServerResolution> {
  const ticker = normalizeCompanyIntelligenceSymbol(symbol);
  if (!ticker) return error("invalid_symbol", "Invalid ticker", false);
  const safeBase = validateR2Base(base);
  if (!safeBase) return error("upstream_unavailable", "Company intelligence is unavailable", true);

  const manifestRead = await loadManifest(safeBase, options.signal);
  if (manifestRead === "invalid") return error("invalid_payload", "Company intelligence manifest is invalid", true);
  if (!manifestRead) return error("upstream_unavailable", "Company intelligence is unavailable", true);
  const { manifest, stale: manifestStale } = manifestRead;
  const fileKey = `companies/${ticker}.json`;
  const file = manifest.files[fileKey];
  if (!file) return error("not_found", "Company intelligence is not covered", false);
  const cacheKey = `${manifest.generation_id}:${ticker}`;
  const cached = contextCache.get(cacheKey);
  const lastGood = lastGoodContextByTicker.get(ticker);
  const now = Date.now();
  if (manifestStale) {
    return cached ? contextResult(staleContext(cached.data))
      : lastGood ? contextResult(staleContext(lastGood.data))
      : error("upstream_unavailable", "Company intelligence is temporarily unavailable", true);
  }
  if (cached && now - cached.at < CONTEXT_TTL_MS) return contextResult(cached.data);

  // Both segments were validated before interpolation. No R2 value controls a query or host.
  const contextUrl = `${safeBase}/company_intelligence/generations/${manifest.generation_id}/companies/${ticker}.json`;
  const fetched = await fetchJson(contextUrl, options.signal);
  if (fetched.kind === "missing") return lastGood ? contextResult(staleContext(lastGood.data))
    // Coverage was decided by manifest.files above. A generation-addressed
    // object disappearing after that declaration is a broken publication, not
    // a legitimate not-covered result for this ticker.
    : error("invalid_payload", "Company intelligence publication is incomplete", true);
  if (fetched.kind !== "ok") return cached ? contextResult(staleContext(cached.data))
    : lastGood ? contextResult(staleContext(lastGood.data))
    : error("upstream_unavailable", "Company intelligence is temporarily unavailable", true);
  const contentHash = await sha256Hex(fetched.bytes);
  if (fetched.bytes.byteLength !== file.bytes || contentHash !== file.sha256.toLowerCase()) {
    return cached ? contextResult(staleContext(cached.data))
      : lastGood ? contextResult(staleContext(lastGood.data))
      : error("invalid_payload", "Company intelligence payload failed its manifest receipt", true);
  }
  const context = normalizeCompanyIntelligence(fetched.raw, ticker, manifest.generation_id);
  if (!context) return cached ? contextResult(staleContext(cached.data))
    : lastGood ? contextResult(staleContext(lastGood.data))
    : error("invalid_payload", "Company intelligence payload is invalid", true);
  rememberContext(cacheKey, ticker, context, now);
  return contextResult(context);
}

/**
 * Resolve Company Intelligence and expose the exact producer receipts to a
 * server-side sidecar consumer. The browser-facing result remains unchanged.
 */
export async function resolveCompanyIntelligenceLineageFromR2(
  symbol: string,
  base: string,
  options: { signal?: AbortSignal } = {},
): Promise<CompanyIntelligenceLineageResolution> {
  const result = await resolveCompanyIntelligenceFromR2(symbol, base, options);
  if (!result.ok) return { result, lineage: null };
  const ticker = normalizeCompanyIntelligenceSymbol(symbol);
  const safeBase = validateR2Base(base);
  if (!ticker || !safeBase) {
    return { result: error("upstream_unavailable", "Company intelligence lineage is unavailable", true), lineage: null };
  }
  const manifestRead = await loadManifest(safeBase, options.signal);
  if (!manifestRead || manifestRead === "invalid") {
    return { result: error("invalid_payload", "Company intelligence lineage is invalid", true), lineage: null };
  }
  const { manifest } = manifestRead;
  const receipt = manifest.files[`companies/${ticker}.json`];
  const manifestJson = canonicalJson(manifest);
  if (!receipt || !manifestJson || manifest.generation_id !== result.context.generation_id) {
    return { result: error("invalid_payload", "Company intelligence lineage is not aligned", true), lineage: null };
  }
  let manifestSha = verifiedManifestReceiptCache?.generation_id === manifest.generation_id
    && Date.now() - verifiedManifestReceiptCache.at < MANIFEST_TTL_MS
    ? verifiedManifestReceiptCache.sha256 : null;
  if (!manifestSha) {
    const immutable = await fetchJson(`${safeBase}/company_intelligence/generations/${manifest.generation_id}/manifest.json`, options.signal);
    if (immutable.kind !== "ok") {
      return { result: error("invalid_payload", "Company intelligence immutable manifest is unavailable", true), lineage: null };
    }
    const immutableManifest = normalizeCompanyIntelligenceManifest(immutable.raw);
    if (!immutableManifest || canonicalJson(immutable.raw) !== manifestJson || immutableManifest.generation_id !== manifest.generation_id) {
      return { result: error("invalid_payload", "Company intelligence immutable manifest is not aligned", true), lineage: null };
    }
    manifestSha = await sha256Hex(immutable.bytes);
    verifiedManifestReceiptCache = { generation_id: manifest.generation_id, sha256: manifestSha, at: Date.now() };
  }
  return {
    result,
    lineage: {
      generation_id: manifest.generation_id,
      latest_event_id: result.context.latest_event_id,
      latest_event_call_date: result.context.latest_event?.call_date ?? null,
      context_sha256: receipt.sha256,
      manifest_sha256: manifestSha,
    },
  };
}

/** Client-side same-origin BFF call. It never exposes the R2 URL to a component. */
export async function getCompanyIntelligence(
  symbol: string,
  options: { signal?: AbortSignal; retryNonce?: number } = {},
): Promise<CompanyIntelligenceResult> {
  const ticker = normalizeCompanyIntelligenceSymbol(symbol);
  if (!ticker) return error("invalid_symbol", "Invalid ticker", false);
  const suffix = options.retryNonce === undefined ? "" : `?retry=${encodeURIComponent(String(options.retryNonce))}`;
  try {
    const response = await fetch(`/api/company-intelligence/${encodeURIComponent(ticker)}${suffix}`, {
      cache: "no-store",
      signal: options.signal,
      headers: { accept: "application/json", "cache-control": "no-store" },
    });
    let raw: unknown;
    try { raw = await response.json(); } catch { return error("upstream_unavailable", "Company intelligence returned malformed JSON", true); }
    const payload = object(raw);
    if (!payload) return error("upstream_unavailable", "Company intelligence returned malformed JSON", true);
    if (payload.ok === false && payload.state === "error") {
      const err = object(payload.error);
      const code = err?.code;
      const message = requiredString(err?.message, 300);
      const retryable = err?.retryable;
      if ((code === "invalid_symbol" || code === "not_found" || code === "upstream_unavailable" || code === "invalid_payload")
        && message && typeof retryable === "boolean") return error(code, message, retryable);
    }
    if (payload.ok === true && (payload.state === "ready" || payload.state === "partial" || payload.state === "stale" || payload.state === "not_covered")) {
      const context = normalizeCompanyIntelligence(payload.context, ticker);
      if (context && context.status === payload.state) return contextResult(context);
    }
    return error(response.status === 404 ? "not_found" : "upstream_unavailable", "Company intelligence returned an invalid response", response.status !== 404);
  } catch {
    return error("upstream_unavailable", "Company intelligence could not be reached", true);
  }
}

export type CompanyIntelligenceDisplayState = "available" | "partial" | "stale" | "not_covered" | "error";

export function companyIntelligenceDisplayState(result: CompanyIntelligenceResult): CompanyIntelligenceDisplayState {
  if (!result.ok) return "error";
  if (result.state === "ready") return "available";
  return result.state;
}

export function isCompanyIntelligenceAvailable(result: CompanyIntelligenceResult): result is Extract<CompanyIntelligenceResult, { ok: true }> {
  return result.ok && result.state !== "not_covered";
}

/** Test-only cache reset; production paths never call this. */
export function __resetCompanyIntelligenceCacheForTests(): void {
  manifestCache = null;
  verifiedManifestReceiptCache = null;
  contextCache.clear();
  lastGoodContextByTicker.clear();
}
