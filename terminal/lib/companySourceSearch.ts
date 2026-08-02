/**
 * Exact transcript search is deliberately a narrow, source-first boundary.
 *
 * The producer owns discovery, corpus revision and span verification.  The
 * Terminal may render only a closed envelope containing opaque, revision-bound
 * spans.  It does not run semantic retrieval, infer a narrative, or attempt to
 * repair a stale revision in the browser.
 */

export const COMPANY_SOURCE_SEARCH_SCHEMA = "mastermind.company-source-search/v1" as const;

export type CompanySourceSearchState = "ready" | "not_covered" | "stale_revision" | "error";
export type TranscriptSection = "prepared" | "qa" | "unknown";

export interface CompanySourceSearchEvent {
  event_id: string;
  label: string;
  call_date: string;
  transcript_id: string | null;
}

export interface CompanySourceSearchReceipt {
  /** Producer generation that binds the exact source-document revision. */
  revision_id: string;
  document_sha256: string;
  indexed_at: string;
  source_label: string;
  source_url: string | null;
  verification: "verified" | "stale_revision";
}

export interface CompanySourceSpan {
  /** Opaque server-issued identity. Never construct this in UI code. */
  span_id: string;
  event_id: string;
  transcript_id: string;
  ticker: string;
  document_sha256: string;
  segment_index: number;
  char_start: number;
  char_end: number;
  speaker: string;
  role: string | null;
  section: TranscriptSection;
  excerpt: string;
  matched_text: string;
  receipt: CompanySourceSearchReceipt;
}

export interface CompanySourceSearchReady {
  state: "ready";
  ticker: string;
  query: string;
  spans: CompanySourceSpan[];
  searched_event_ids: string[];
  corpus_revision: string;
}

export interface CompanySourceSearchNotCovered {
  state: "not_covered";
  ticker: string;
  query: string;
  message: string;
}

export interface CompanySourceSearchStaleRevision {
  state: "stale_revision";
  ticker: string;
  query: string;
  message: string;
  spans: CompanySourceSpan[];
  corpus_revision: string;
}

export interface CompanySourceSearchError {
  state: "error";
  ticker: string;
  query: string;
  message: string;
  retryable: boolean;
}

export type CompanySourceSearchResult =
  | CompanySourceSearchReady
  | CompanySourceSearchNotCovered
  | CompanySourceSearchStaleRevision
  | CompanySourceSearchError;

export interface CompanySourceSearchRequest {
  ticker: string;
  phrase: string;
  event_ids: string[];
  signal?: AbortSignal;
}

export interface CompanySourceCompareRequest extends CompanySourceSearchRequest {
  left_event_id: string;
  right_event_id: string;
}

/** Adapter seam for the revision-verified producer index (CEI-T02). */
export interface CompanySourceSearchAdapter {
  search(request: CompanySourceSearchRequest): Promise<CompanySourceSearchResult>;
  compare(request: CompanySourceCompareRequest): Promise<CompanySourceSearchResult>;
}

type JsonRecord = Record<string, unknown>;

const SAFE_TICKER = /^[A-Z0-9](?:[A-Z0-9.-]{0,14}[A-Z0-9])?$/;
const SAFE_EVENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_TRANSCRIPT = /^\d{4}Q[1-4]$/;
const SAFE_SHA256 = /^[a-f0-9]{64}$/;
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,159}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_PHRASE = 240;
const MAX_SPANS = 60;
const MAX_EXCERPT = 2_400;
const MAX_TEXT = 1_200;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function string(value: unknown, max = MAX_TEXT): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && value.length <= 64 && ISO_TIMESTAMP.test(value) && Number.isFinite(new Date(value).getTime())
    ? value
    : null;
}

function safeUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value || value.length > 2_048 || /[\\\r\n]/.test(value)) return null;
  if (value.startsWith("/")) return value.startsWith("/data/tx/") && !value.includes("..") ? value : null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? value : null;
  } catch {
    return null;
  }
}

/**
 * A query remains a literal string. Quotes are an ergonomics affordance only:
 * they are removed as a matching delimiter, never translated into a fuzzy or
 * semantic query language.
 */
export function normalizeTranscriptLiteralPhrase(value: string): string | null {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact || compact.length > MAX_PHRASE) return null;
  const quoted = compact.length >= 2
    && ((compact.startsWith('"') && compact.endsWith('"')) || (compact.startsWith("'") && compact.endsWith("'")))
    ? compact.slice(1, -1).trim()
    : compact;
  return quoted && quoted.length <= MAX_PHRASE ? quoted : null;
}

export function normalizeCompanySourceSearchTicker(value: string): string | null {
  const ticker = value.trim().toUpperCase();
  return SAFE_TICKER.test(ticker) && !ticker.includes("..") ? ticker : null;
}

function normalizeReceipt(raw: unknown): CompanySourceSearchReceipt | null {
  const value = record(raw);
  if (!value) return null;
  const revision_id = string(value.revision_id, 160);
  const document_sha256 = string(value.document_sha256, 64);
  const indexed_at = timestamp(value.indexed_at);
  const source_label = string(value.source_label, 160);
  const source_url = safeUrl(value.source_url);
  const verification = value.verification;
  if (!revision_id || !SAFE_REVISION.test(revision_id) || !document_sha256 || !SAFE_SHA256.test(document_sha256)
    || !indexed_at || !source_label || (value.source_url !== null && !source_url)
    || (verification !== "verified" && verification !== "stale_revision")) return null;
  return { revision_id, document_sha256, indexed_at, source_label, source_url, verification };
}

function normalizeSpan(raw: unknown, ticker: string, phrase: string): CompanySourceSpan | null {
  const value = record(raw);
  if (!value) return null;
  const span_id = string(value.span_id, 320);
  const event_id = string(value.event_id, 160);
  const transcript_id = string(value.transcript_id, 16);
  const candidateTicker = string(value.ticker, 16)?.toUpperCase();
  const document_sha256 = string(value.document_sha256, 64);
  const segment_index = integer(value.segment_index, 0, 1_000_000);
  const char_start = integer(value.char_start, 0, MAX_EXCERPT);
  const char_end = integer(value.char_end, 1, MAX_EXCERPT);
  const speaker = string(value.speaker, 240);
  const role = value.role === null ? null : string(value.role, 240);
  const section = value.section;
  const excerpt = string(value.excerpt, MAX_EXCERPT);
  const matched_text = string(value.matched_text, MAX_PHRASE);
  const receipt = normalizeReceipt(value.receipt);
  if (!span_id || !event_id || !SAFE_EVENT.test(event_id) || !transcript_id || !SAFE_TRANSCRIPT.test(transcript_id)
    || candidateTicker !== ticker || !document_sha256 || !SAFE_SHA256.test(document_sha256)
    || segment_index === null || char_start === null || char_end === null || char_end <= char_start
    || !speaker || (value.role !== null && !role) || !excerpt || !matched_text || !receipt
    || (section !== "prepared" && section !== "qa" && section !== "unknown")
    || receipt.document_sha256 !== document_sha256
    || !excerpt.toLocaleLowerCase().includes(matched_text.toLocaleLowerCase())
    || !matched_text.toLocaleLowerCase().includes(phrase.toLocaleLowerCase())
  ) return null;
  return {
    span_id,
    event_id,
    transcript_id,
    ticker,
    document_sha256,
    segment_index,
    char_start,
    char_end,
    speaker,
    role,
    section,
    excerpt,
    matched_text,
    receipt,
  };
}

function normalizeEventIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 24) return null;
  const ids = value.map((id) => string(id, 160)).filter((id): id is string => !!id && SAFE_EVENT.test(id));
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}

/** Closed parser for producer output. Invalid envelopes never reach a reader. */
export function normalizeCompanySourceSearchResult(raw: unknown, tickerInput: string, phraseInput: string): CompanySourceSearchResult | null {
  const ticker = normalizeCompanySourceSearchTicker(tickerInput);
  const phrase = normalizeTranscriptLiteralPhrase(phraseInput);
  const value = record(raw);
  if (!ticker || !phrase || !value || value.schema !== COMPANY_SOURCE_SEARCH_SCHEMA || value.ticker !== ticker || value.query !== phrase) return null;
  const state = value.state;
  if (state === "not_covered") {
    const message = string(value.message, 600);
    return message ? { state, ticker, query: phrase, message } : null;
  }
  if (state === "error") {
    const message = string(value.message, 600);
    return message && typeof value.retryable === "boolean" ? { state, ticker, query: phrase, message, retryable: value.retryable } : null;
  }
  if (state !== "ready" && state !== "stale_revision") return null;
  const corpus_revision = string(value.corpus_revision, 160);
  const spansRaw = value.spans;
  const searched_event_ids = normalizeEventIds(value.searched_event_ids);
  if (!corpus_revision || !SAFE_REVISION.test(corpus_revision) || !Array.isArray(spansRaw) || spansRaw.length > MAX_SPANS || !searched_event_ids) return null;
  const spans = spansRaw.map((span) => normalizeSpan(span, ticker, phrase));
  if (spans.some((span) => !span) || new Set(spans.map((span) => span!.span_id)).size !== spans.length) return null;
  const safeSpans = spans as CompanySourceSpan[];
  // One query envelope must represent one producer corpus revision.  A mixed
  // result set could compare text from incompatible document snapshots.
  if (safeSpans.some((span) => span.receipt.revision_id !== corpus_revision)) return null;
  if (state === "ready" && safeSpans.some((span) => span.receipt.verification !== "verified")) return null;
  if (state === "stale_revision" && safeSpans.some((span) => span.receipt.verification !== "stale_revision")) return null;
  if (state === "ready") return { state, ticker, query: phrase, spans: safeSpans, searched_event_ids, corpus_revision };
  const message = string(value.message, 600);
  return message ? { state, ticker, query: phrase, message, spans: safeSpans, corpus_revision } : null;
}

function errorResult(ticker: string, phrase: string, message: string, retryable: boolean): CompanySourceSearchError {
  return { state: "error", ticker, query: phrase, message, retryable };
}

async function requestProducer(
  request: CompanySourceSearchRequest | CompanySourceCompareRequest,
  mode: "search" | "compare",
): Promise<CompanySourceSearchResult> {
  const ticker = normalizeCompanySourceSearchTicker(request.ticker);
  const phrase = normalizeTranscriptLiteralPhrase(request.phrase);
  if (!ticker || !phrase) return errorResult(ticker ?? "", phrase ?? "", "Enter a literal phrase to search.", false);
  const params = new URLSearchParams({ q: phrase, mode });
  for (const event_id of request.event_ids) if (SAFE_EVENT.test(event_id)) params.append("event", event_id);
  if (mode === "compare") {
    const compare = request as CompanySourceCompareRequest;
    if (!SAFE_EVENT.test(compare.left_event_id) || !SAFE_EVENT.test(compare.right_event_id)) {
      return errorResult(ticker, phrase, "Select two valid events to compare.", false);
    }
    params.set("left", compare.left_event_id);
    params.set("right", compare.right_event_id);
  }
  try {
    const response = await fetch(`/api/company-source-search/${encodeURIComponent(ticker)}?${params.toString()}`, {
      cache: "no-store",
      signal: request.signal,
    });
    if (response.status === 404) return { state: "not_covered", ticker, query: phrase, message: "A revision-verified transcript span index is not published for this company yet." };
    if (!response.ok) return errorResult(ticker, phrase, `Source search request failed (${response.status}).`, response.status >= 500);
    const normalized = normalizeCompanySourceSearchResult(await response.json(), ticker, phrase);
    return normalized ?? errorResult(ticker, phrase, "Source search returned an invalid verification envelope.", true);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return errorResult(ticker, phrase, "Source search could not be reached.", true);
  }
}

/** Browser adapter used in production. The API is supplied by the producer lane. */
export const browserCompanySourceSearchAdapter: CompanySourceSearchAdapter = {
  search: (request) => requestProducer(request, "search"),
  compare: (request) => requestProducer(request, "compare"),
};

/**
 * Tiny deterministic fixture adapter for unit/e2e/visual work only.  It is not
 * selected by the app and it carries an explicit fixture receipt so test text
 * can never be mistaken for published research.
 */
export function createFixtureCompanySourceSearchAdapter(): CompanySourceSearchAdapter {
  const documents = [
    {
      event_id: "NVDA-2026Q1", transcript_id: "2026Q1", segment_index: 18, speaker: "Jensen Huang", role: "Chief Executive Officer", section: "prepared" as const,
      text: "Data center demand remained broad across cloud, enterprise, and sovereign AI customers.",
    },
    {
      event_id: "NVDA-2026Q1", transcript_id: "2026Q1", segment_index: 27, speaker: "Colette Kress", role: "Chief Financial Officer", section: "qa" as const,
      text: "We continue to see data center demand across our compute platforms and networking products.",
    },
    {
      event_id: "NVDA-2025Q4", transcript_id: "2025Q4", segment_index: 14, speaker: "Jensen Huang", role: "Chief Executive Officer", section: "prepared" as const,
      text: "Data center demand expanded as customers prepared new infrastructure deployments.",
    },
  ];
  const make = async (request: CompanySourceSearchRequest, compare = false): Promise<CompanySourceSearchResult> => {
    const ticker = normalizeCompanySourceSearchTicker(request.ticker);
    const phrase = normalizeTranscriptLiteralPhrase(request.phrase);
    if (!ticker || !phrase) return errorResult(ticker ?? "", phrase ?? "", "Enter a literal phrase to search.", false);
    if (ticker !== "NVDA") return { state: "not_covered", ticker, query: phrase, message: "Fixture coverage is limited to NVDA." };
    const eventIds = compare
      ? [((request as CompanySourceCompareRequest).left_event_id), ((request as CompanySourceCompareRequest).right_event_id)]
      : request.event_ids;
    const sha = "f".repeat(64);
    const revision = "fixture-revision-20260801";
    const spans = documents
      .filter((document) => eventIds.length === 0 || eventIds.includes(document.event_id))
      .flatMap((document) => {
        const match = document.text.toLocaleLowerCase().indexOf(phrase.toLocaleLowerCase());
        if (match < 0) return [];
        const receipt: CompanySourceSearchReceipt = {
          revision_id: revision,
          document_sha256: sha,
          indexed_at: "2026-08-01T12:00:00Z",
          source_label: "Local interface fixture — not published research",
          source_url: `/data/tx/NVDA/${document.transcript_id}.json.gz`,
          verification: "verified",
        };
        return [{
          span_id: `fixture:${document.event_id}:${document.segment_index}:${match}:${match + phrase.length}`,
          event_id: document.event_id,
          transcript_id: document.transcript_id,
          ticker,
          document_sha256: sha,
          segment_index: document.segment_index,
          char_start: match,
          char_end: match + phrase.length,
          speaker: document.speaker,
          role: document.role,
          section: document.section,
          excerpt: document.text,
          matched_text: document.text.slice(match, match + phrase.length),
          receipt,
        } satisfies CompanySourceSpan];
      });
    return { state: "ready", ticker, query: phrase, spans, searched_event_ids: [...new Set(eventIds)], corpus_revision: revision };
  };
  return { search: (request) => make(request), compare: (request) => make(request, true) };
}
