/**
 * Server-only exact transcript retrieval for the Company Intelligence reader.
 *
 * The browser supplies no archive URL and never chooses a document path. It
 * supplies one to twelve CIE event identities paired with fiscal transcript
 * IDs; this module verifies that pairing, reads the committed `/data/tx` root
 * first, and accepts a body only when its canonical JSON hash equals the
 * root-advertised SHA-256. There is deliberately no semantic retrieval, model
 * call, Macro transcript index, or best-effort fallback.
 */

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  normalizeCompanySourceSearchTicker,
  normalizeTranscriptLiteralPhrase,
  type CompanySourceSearchResult,
  type CompanySourceSpan,
  type TranscriptSection,
} from "./companySourceSearch";
import {
  canonicalTranscriptBodySha256,
  classifyTranscriptQaChapter,
  makeTranscriptSpan,
  normalizeTranscriptRevisionRoot,
  normalizeTranscriptSearchId,
  type RevisionVerifiedTranscript,
  type TranscriptRevisionRef,
  type TranscriptRevisionRoot,
} from "./transcriptSearch";
import { normalizeTranscript } from "./fund";

export const COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN = "https://app.mastermind-x.com";
export const COMPANY_SOURCE_SEARCH_MAX_ROOT_BYTES = 4 * 1024 * 1024;
export const COMPANY_SOURCE_SEARCH_MAX_COMPRESSED_BODY_BYTES = 4 * 1024 * 1024;
export const COMPANY_SOURCE_SEARCH_MAX_DECOMPRESSED_BODY_BYTES = 12 * 1024 * 1024;
export const COMPANY_SOURCE_SEARCH_MAX_CALLS = 12;
export const COMPANY_SOURCE_SEARCH_MAX_SPANS = 60;

const ROOT_CACHE_TTL_MS = 30_000;
const BODY_CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 6_000;
const SAFE_EVENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256 = /^[a-f0-9]{64}$/;

type FetchLike = typeof fetch;

export interface CompanySourceSearchArchiveCall {
  event_id: string;
  transcript_id: string;
}

export interface CompanySourceSearchArchiveRequest {
  ticker: string;
  phrase: string;
  calls: readonly CompanySourceSearchArchiveCall[];
  mode: "search" | "compare";
  left_event_id?: string;
  right_event_id?: string;
}

type RootSnapshot = {
  root: TranscriptRevisionRoot;
  revision_id: string;
  indexed_at: string;
  at: number;
};

type ReadyBody = { document: RevisionVerifiedTranscript; event_id: string };
type BodyRead =
  | { kind: "ready"; body: ReadyBody }
  | { kind: "stale"; reason: string }
  | { kind: "unavailable"; message: string };

let rootCache: RootSnapshot | null = null;
const bodyCache = new Map<string, { document: RevisionVerifiedTranscript; at: number }>();

function error(ticker: string, query: string, message: string, retryable: boolean): CompanySourceSearchResult {
  return { state: "error", ticker, query, message, retryable };
}

function unavailable(ticker: string, query: string, message: string, retryable = true): CompanySourceSearchResult {
  return { state: "unavailable", ticker, query, message, retryable };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && Number.isFinite(new Date(value).getTime());
}

function isPinnedArchiveUrl(requested: string, final: string): boolean {
  // In-memory Response fixtures have no URL. Real Fetch responses always do;
  // redirect:'error' plus this strict check is the production redirect fence.
  if (!final) return true;
  try {
    const requestedUrl = new URL(requested);
    const finalUrl = new URL(final);
    return finalUrl.protocol === "https:"
      && finalUrl.origin === COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN
      && finalUrl.origin === requestedUrl.origin
      && finalUrl.pathname === requestedUrl.pathname
      && finalUrl.search === requestedUrl.search
      && !finalUrl.username
      && !finalUrl.password
      && !finalUrl.hash;
  } catch {
    return false;
  }
}

function validArchiveOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.origin === COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN
      && parsed.pathname === "/"
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

function linkAbort(parent: AbortSignal | undefined, controller: AbortController): () => void {
  const onAbort = () => controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });
  return () => parent?.removeEventListener("abort", onAbort);
}

async function readBounded(response: Response, maxBytes: number, controller: AbortController): Promise<Uint8Array | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        controller.abort();
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchBounded(
  url: string,
  maxBytes: number,
  fetcher: FetchLike,
  signal?: AbortSignal,
): Promise<{ kind: "ok"; bytes: Uint8Array } | { kind: "missing" } | { kind: "unavailable" }> {
  const controller = new AbortController();
  const detach = linkAbort(signal, controller);
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      redirect: "error",
      headers: { accept: "application/json, application/gzip", "accept-encoding": "identity", "cache-control": "no-store" },
      signal: controller.signal,
    });
    if (response.redirected || !isPinnedArchiveUrl(url, response.url)) return { kind: "unavailable" };
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "unavailable" };
    const bytes = await readBounded(response, maxBytes, controller);
    return bytes ? { kind: "ok", bytes } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timer);
    detach();
  }
}

async function gunzipBounded(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (bytes.byteLength < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || typeof globalThis.DecompressionStream !== "function") return null;
  try {
    const wire = new Uint8Array(bytes.byteLength);
    wire.set(bytes);
    const body = new Response(wire.buffer).body;
    if (!body) return null;
    const stream = body.pipeThrough(new globalThis.DecompressionStream("gzip"));
    return await readBounded(new Response(stream), COMPANY_SOURCE_SEARCH_MAX_DECOMPRESSED_BODY_BYTES, new AbortController());
  } catch {
    return null;
  }
}

async function loadRoot(fetcher: FetchLike, signal?: AbortSignal): Promise<RootSnapshot | "unavailable"> {
  const now = Date.now();
  if (rootCache && now - rootCache.at < ROOT_CACHE_TTL_MS) return rootCache;
  const origin = validArchiveOrigin(COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN);
  if (!origin) return "unavailable";
  const raw = await fetchBounded(`${origin}/data/tx/index.json`, COMPANY_SOURCE_SEARCH_MAX_ROOT_BYTES, fetcher, signal);
  if (raw.kind !== "ok") return "unavailable";
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw.bytes)); } catch { return "unavailable"; }
  const root = normalizeTranscriptRevisionRoot(payload);
  if (!root || !validTimestamp(root.generated_at)) return "unavailable";
  const rootSha = await canonicalTranscriptBodySha256(payload);
  if (!rootSha) return "unavailable";
  const snapshot: RootSnapshot = { root, revision_id: `txroot-${rootSha}`, indexed_at: root.generated_at, at: now };
  rootCache = snapshot;
  return snapshot;
}

function eventMatchesFiscalIdentity(ticker: string, eventId: string, transcriptId: string): boolean {
  if (!SAFE_EVENT.test(eventId) || !normalizeTranscriptSearchId(transcriptId)) return false;
  const year = transcriptId.slice(0, 4);
  const quarter = transcriptId.slice(5);
  const expectedCie = `cie_${createHash("sha256").update(`${ticker}|${year}|Q${quarter}`, "utf8").digest("hex").slice(0, 24)}`;
  // Canonical CIE ids are opaque, but are deterministically bound to the
  // selected fiscal call. Do not accept a presentation-friendly legacy id: a
  // source reader must use the same immutable event identity as the context.
  return eventId === expectedCie;
}

function normalizeCalls(ticker: string, calls: readonly CompanySourceSearchArchiveCall[]): CompanySourceSearchArchiveCall[] | null {
  if (!Array.isArray(calls) || calls.length < 1 || calls.length > COMPANY_SOURCE_SEARCH_MAX_CALLS) return null;
  const ids = new Set<string>();
  const transcripts = new Set<string>();
  const output: CompanySourceSearchArchiveCall[] = [];
  for (const call of calls) {
    const eventId = typeof call?.event_id === "string" ? call.event_id : "";
    const transcriptId = typeof call?.transcript_id === "string" ? call.transcript_id : "";
    if (!SAFE_EVENT.test(eventId) || !normalizeTranscriptSearchId(transcriptId)
      || ids.has(eventId) || transcripts.has(transcriptId)
      || !eventMatchesFiscalIdentity(ticker, eventId, transcriptId)) return null;
    ids.add(eventId);
    transcripts.add(transcriptId);
    output.push({ event_id: eventId, transcript_id: transcriptId });
  }
  return output;
}

function selectedRef(root: TranscriptRevisionRoot, ticker: string, transcriptId: string): TranscriptRevisionRef | null {
  return root.calls_by_ticker.get(ticker)?.find((entry) => entry.id === transcriptId) ?? null;
}

async function loadVerifiedBody(
  snapshot: RootSnapshot,
  ticker: string,
  call: CompanySourceSearchArchiveCall,
  fetcher: FetchLike,
  signal?: AbortSignal,
): Promise<BodyRead> {
  const revision = selectedRef(snapshot.root, ticker, call.transcript_id);
  if (!revision) return { kind: "stale", reason: "The committed archive does not contain this selected transcript revision." };
  if (!revision.body_sha256 || !SHA256.test(revision.body_sha256)) {
    return { kind: "stale", reason: "The committed archive entry has no advertised document revision." };
  }
  const cacheKey = `${snapshot.revision_id}:${ticker}/${revision.id}:${revision.body_sha256}`;
  const cached = bodyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < BODY_CACHE_TTL_MS) return { kind: "ready", body: { document: cached.document, event_id: call.event_id } };

  const origin = validArchiveOrigin(COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN);
  if (!origin) return { kind: "unavailable", message: "The transcript archive origin is unavailable." };
  const wire = await fetchBounded(
    `${origin}/data/tx/${encodeURIComponent(ticker)}/${encodeURIComponent(revision.id)}.json.gz`,
    COMPANY_SOURCE_SEARCH_MAX_COMPRESSED_BODY_BYTES,
    fetcher,
    signal,
  );
  if (wire.kind === "missing") return { kind: "stale", reason: "The root advertises this document, but the body is missing." };
  if (wire.kind !== "ok") return { kind: "unavailable", message: "A selected transcript body could not be reached." };
  const decoded = await gunzipBounded(wire.bytes);
  if (!decoded) return { kind: "stale", reason: "The selected transcript body is not a valid bounded gzip document." };
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)); } catch {
    return { kind: "stale", reason: "The selected transcript body is malformed." };
  }
  const transcript = normalizeTranscript(raw, ticker, revision.id);
  if (!transcript) return { kind: "stale", reason: "The selected transcript body fails its source contract." };
  const actualSha = await canonicalTranscriptBodySha256(raw);
  if (!actualSha || actualSha !== revision.body_sha256) {
    return { kind: "stale", reason: "The selected transcript body no longer matches the committed revision." };
  }
  const chapter = classifyTranscriptQaChapter(transcript.segments);
  const document: RevisionVerifiedTranscript = {
    transcript,
    revision,
    transition_index: chapter.transition_index,
    qa_start_index: chapter.qa_start_index,
    transition_reason: chapter.transition_reason,
    qa_start_reason: chapter.qa_start_reason,
  };
  if (!bodyCache.has(cacheKey) && bodyCache.size >= 256) bodyCache.delete(bodyCache.keys().next().value as string);
  bodyCache.set(cacheKey, { document, at: Date.now() });
  return { kind: "ready", body: { document, event_id: call.event_id } };
}

function sectionFor(document: RevisionVerifiedTranscript, segmentIndex: number): TranscriptSection {
  if (document.qa_start_index !== null && segmentIndex >= document.qa_start_index) return "qa";
  if (document.transition_index !== null || document.qa_start_index !== null) return "prepared";
  return "unknown";
}

function exactExcerpt(text: string, start: number, end: number): string {
  const left = Math.max(0, start - 112);
  const right = Math.min(text.length, end + 208);
  return `${left > 0 ? "…" : ""}${text.slice(left, right).trim()}${right < text.length ? "…" : ""}`;
}

async function literalSpans(item: ReadyBody, ticker: string, phrase: string, snapshot: RootSnapshot): Promise<CompanySourceSpan[]> {
  const output: CompanySourceSpan[] = [];
  const needle = phrase.toLocaleLowerCase();
  const { document, event_id } = item;
  for (let segmentIndex = 0; segmentIndex < document.transcript.segments.length; segmentIndex += 1) {
    const segment = document.transcript.segments[segmentIndex];
    const lower = segment.text.toLocaleLowerCase();
    let start = lower.indexOf(needle);
    while (start >= 0 && output.length < COMPANY_SOURCE_SEARCH_MAX_SPANS) {
      const end = start + phrase.length;
      const pointer = await makeTranscriptSpan(document.revision, segmentIndex, segment.text, start, end);
      if (!pointer) return [];
      output.push({
        span_id: pointer.span_id,
        event_id,
        transcript_id: document.transcript.id,
        ticker,
        document_sha256: document.revision.body_sha256!,
        segment_index: segmentIndex,
        start_byte: pointer.start_byte,
        end_byte: pointer.end_byte,
        segment_text_sha256: pointer.segment_text_sha256,
        speaker: segment.speaker,
        role: segment.role || null,
        section: sectionFor(document, segmentIndex),
        excerpt: exactExcerpt(segment.text, start, end),
        matched_text: segment.text.slice(start, end),
        receipt: {
          revision_id: snapshot.revision_id,
          document_sha256: document.revision.body_sha256!,
          indexed_at: snapshot.indexed_at,
          source_label: "Committed Mastermind transcript archive",
          source_url: `${COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN}/data/tx/${ticker}/${document.transcript.id}.json.gz`,
          verification: "verified",
        },
      });
      start = lower.indexOf(needle, end);
    }
    if (output.length >= COMPANY_SOURCE_SEARCH_MAX_SPANS) break;
  }
  return output;
}

function compareValid(calls: readonly CompanySourceSearchArchiveCall[], left: string | undefined, right: string | undefined): boolean {
  return typeof left === "string" && typeof right === "string" && left !== right
    && calls.length === 2 && calls.some((call) => call.event_id === left) && calls.some((call) => call.event_id === right);
}

/** Resolve one exact literal search or two-event comparison against the committed archive. */
export async function resolveCompanySourceSearchFromArchive(
  request: CompanySourceSearchArchiveRequest,
  options: { fetcher?: FetchLike; signal?: AbortSignal } = {},
): Promise<CompanySourceSearchResult> {
  const ticker = normalizeCompanySourceSearchTicker(request.ticker);
  const phrase = normalizeTranscriptLiteralPhrase(request.phrase);
  if (!ticker || !phrase) return error(ticker ?? "", phrase ?? "", "Enter a literal phrase up to 240 characters.", false);
  const calls = normalizeCalls(ticker, request.calls);
  if (!calls) return error(ticker, phrase, "Select one to twelve explicit, valid Company Intelligence transcript events.", false);
  if ((request.mode !== "search" && request.mode !== "compare") || (request.mode === "compare" && !compareValid(calls, request.left_event_id, request.right_event_id))) {
    return error(ticker, phrase, "Comparison requires exactly two distinct selected events.", false);
  }
  const fetcher = options.fetcher ?? fetch;
  const snapshot = await loadRoot(fetcher, options.signal);
  if (snapshot === "unavailable") return unavailable(ticker, phrase, "The committed transcript archive marker is unavailable.");
  if (!snapshot.root.calls_by_ticker.has(ticker)) {
    return { state: "not_covered", ticker, query: phrase, message: "The committed transcript archive does not cover this company." };
  }
  // Root-backed absence is the only legitimate not-covered branch. A requested
  // CIE event absent from a valid ticker root is never broadened to another call.
  if (calls.some((call) => !selectedRef(snapshot.root, ticker, call.transcript_id))) {
    return { state: "not_covered", ticker, query: phrase, message: "One or more selected Company Intelligence events have no committed transcript body." };
  }
  const reads = await Promise.all(calls.map((call) => loadVerifiedBody(snapshot, ticker, call, fetcher, options.signal)));
  const unreachable = reads.find((read): read is Extract<BodyRead, { kind: "unavailable" }> => read.kind === "unavailable");
  if (unreachable) return unavailable(ticker, phrase, unreachable.message);
  const stale = reads.find((read): read is Extract<BodyRead, { kind: "stale" }> => read.kind === "stale");
  if (stale) {
    return { state: "stale_revision", ticker, query: phrase, message: stale.reason, spans: [], corpus_revision: snapshot.revision_id };
  }
  const ready = reads as Array<Extract<BodyRead, { kind: "ready" }>>;
  const spans = (await Promise.all(ready.map((read) => literalSpans(read.body, ticker, phrase, snapshot))))
    .flat()
    .slice(0, COMPANY_SOURCE_SEARCH_MAX_SPANS);
  return {
    state: "ready",
    ticker,
    query: phrase,
    spans,
    searched_event_ids: calls.map((call) => call.event_id),
    corpus_revision: snapshot.revision_id,
  };
}

/** Test/E2E-only committed archive fixture; production never selects this fetcher. */
export function createCompanySourceSearchE2eFetch(): FetchLike {
  const documents = [
    {
      schema: "mastermind.tx/v1", ticker: "NVDA", id: "2026Q1", period: "Q1 FY2026", date: "2026-05-20", title: "NVIDIA Earnings Call Q1 FY2026",
      segments: [
        { speaker: "Jensen Huang", role: "Chief Executive Officer", text: "Data center demand remained broad across cloud, enterprise, and sovereign AI customers." },
        { speaker: "Colette Kress", role: "Chief Financial Officer", text: "We continue to see data center demand across our compute platforms and networking products." },
      ],
    },
    {
      schema: "mastermind.tx/v1", ticker: "NVDA", id: "2025Q4", period: "Q4 FY2025", date: "2026-02-19", title: "NVIDIA Earnings Call Q4 FY2025",
      segments: [
        { speaker: "Jensen Huang", role: "Chief Executive Officer", text: "Data center demand expanded as customers prepared new infrastructure deployments." },
      ],
    },
  ];
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === `${COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN}/data/tx/index.json`) {
      const revisions: Record<string, string> = {};
      const dates: Record<string, string> = {};
      for (const document of documents) {
        const sha = await canonicalTranscriptBodySha256(document);
        if (!sha) throw new Error("WebCrypto SHA-256 unavailable");
        revisions[`${document.ticker}/${document.id}`] = sha;
        dates[`${document.ticker}/${document.id}`] = document.date;
      }
      return new Response(JSON.stringify({
        schema: "mastermind.tx-index/v1", generated_at: "2026-08-01T12:00:00Z", body_count: documents.length,
        symbols: { NVDA: documents.map((document) => document.id) }, revisions, dates,
      }), { status: 200 });
    }
    const document = documents.find((candidate) => url === `${COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN}/data/tx/${candidate.ticker}/${candidate.id}.json.gz`);
    return document
      ? new Response(gzipSync(JSON.stringify(document)), { status: 200, headers: { "content-type": "application/gzip" } })
      : new Response("missing", { status: 404 });
  }) as FetchLike;
}

/** Test-only cache reset; no production caller may erase a verified document. */
export function __resetCompanySourceSearchArchiveCacheForTests(): void {
  rootCache = null;
  bodyCache.clear();
}
