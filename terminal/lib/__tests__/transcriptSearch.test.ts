import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalTranscriptBodySha256,
  canonicalTranscriptSpanLocator,
  classifyTranscriptQaChapter,
  getRevisionVerifiedTranscript,
  isTranscriptSpanId,
  makeTranscriptSpan,
  normalizeTranscriptRevisionRoot,
  parseTranscriptSearchQuery,
  searchTickerTranscripts,
  TRANSCRIPT_REVISION_ROOT_URL,
} from "../transcriptSearch";

type Body = {
  schema: "mastermind.tx/v1";
  ticker: string;
  id: string;
  period: string;
  date: string | null;
  title: string;
  segments: Array<{ speaker: string; role: string; text: string }>;
};

function body(ticker: string, id: string, segments: Body["segments"]): Body {
  return {
    schema: "mastermind.tx/v1",
    ticker,
    id,
    period: `Q${id.slice(5)} FY${id.slice(0, 4)}`,
    date: "2026-07-31",
    title: `${ticker} Earnings Call`,
    segments,
  };
}

function gzipResponse(payload: unknown): Response {
  return new Response(gzipSync(JSON.stringify(payload)), { status: 200, headers: { "content-type": "application/gzip" } });
}

async function rootFor(bodies: readonly Body[], options: { omitRevision?: string; overrideRevision?: string } = {}) {
  const symbols: Record<string, string[]> = {};
  const revisions: Record<string, string> = {};
  const dates: Record<string, string> = {};
  for (const value of bodies) {
    symbols[value.ticker] ??= [];
    symbols[value.ticker].push(value.id);
    const pair = `${value.ticker}/${value.id}`;
    const hash = await canonicalTranscriptBodySha256(value);
    if (!hash) throw new Error("test environment has no WebCrypto SHA-256");
    if (options.omitRevision !== pair) revisions[pair] = options.overrideRevision && options.overrideRevision === pair ? "f".repeat(64) : hash;
    dates[pair] = "2026-07-31";
  }
  return {
    schema: "mastermind.tx-index/v1",
    generated_at: "2026-08-01T00:00:00Z",
    body_count: bodies.length,
    symbols,
    revisions,
    dates,
  };
}

function archiveFetch(root: unknown, bodies: readonly Body[]): typeof fetch {
  const byUrl = new Map(bodies.map((value) => [`/data/tx/${value.ticker}/${value.id}.json.gz`, value]));
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === TRANSCRIPT_REVISION_ROOT_URL) return new Response(JSON.stringify(root), { status: 200 });
    const value = byUrl.get(url);
    return value ? gzipResponse(value) : new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("revision-verified transcript retrieval", () => {
  it("uses the root revision receipt before accepting a body", async () => {
    const aapl = body("AAPL", "2026Q3", [{ speaker: "Operator", role: "Operator", text: "Our first question comes from Alex." }]);
    const root = await rootFor([aapl]);
    const fetcher = archiveFetch(root, [aapl]);

    const result = await getRevisionVerifiedTranscript("AAPL", "2026Q3", { fetcher });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.document.revision.body_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.document.transition_index).toBeNull();
      expect(result.document.qa_start_index).toBe(0);
    }
  });

  it("reports a root-advertised correction that no longer hashes as stale, never as coverage", async () => {
    const aapl = body("AAPL", "2026Q3", [{ speaker: "CEO", role: "CEO", text: "Prepared remarks." }]);
    const root = await rootFor([aapl], { overrideRevision: "AAPL/2026Q3" });
    const result = await getRevisionVerifiedTranscript("AAPL", "2026Q3", { fetcher: archiveFetch(root, [aapl]) });

    expect(result).toMatchObject({ status: "stale_revision", reason: "body_hash_mismatch" });
  });

  it("fails closed when an old body remains after a legitimate root correction", async () => {
    const prior = body("AAPL", "2026Q3", [{ speaker: "CEO", role: "CEO", text: "Prior release wording." }]);
    const corrected = body("AAPL", "2026Q3", [{ speaker: "CEO", role: "CEO", text: "Corrected release wording." }]);
    const root = await rootFor([corrected]);
    const result = await getRevisionVerifiedTranscript("AAPL", "2026Q3", { fetcher: archiveFetch(root, [prior]) });

    expect(result).toMatchObject({ status: "stale_revision", reason: "body_hash_mismatch" });
  });

  it("reports an archived pair without a root revision as stale_revision", async () => {
    const aapl = body("AAPL", "2026Q3", [{ speaker: "CEO", role: "CEO", text: "Prepared remarks." }]);
    const root = await rootFor([aapl], { omitRevision: "AAPL/2026Q3" });
    const result = await getRevisionVerifiedTranscript("AAPL", "2026Q3", { fetcher: archiveFetch(root, [aapl]) });

    expect(result).toMatchObject({ status: "stale_revision", reason: "root_revision_missing" });
  });

  it("recognises honest absence for BRK.B only from the valid root marker and does not fetch a body", async () => {
    const aapl = body("AAPL", "2026Q3", [{ speaker: "CEO", role: "CEO", text: "Prepared remarks." }]);
    const root = await rootFor([aapl]);
    const fetcher = archiveFetch(root, [aapl]);
    const result = await getRevisionVerifiedTranscript("BRK.B", "2026Q3", { fetcher });

    expect(result).toEqual({ status: "not_covered", ticker: "BRK.B", id: "2026Q3" });
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(1);
  });

  it("rejects a root with a detached revision receipt", async () => {
    const root = {
      schema: "mastermind.tx-index/v1",
      generated_at: "2026-08-01T00:00:00Z",
      symbols: { AAPL: ["2026Q3"] },
      revisions: { "AAPL/2026Q3": "a".repeat(64), "NVDA/2027Q1": "b".repeat(64) },
    };
    expect(normalizeTranscriptRevisionRoot(root)).toBeNull();
  });
});

describe("conservative Q&A classification", () => {
  it("keeps the handoff separate from the real AAPL, VRSN, and NVDA Q&A start", () => {
    const aapl = Array.from({ length: 33 }, (_, index) => ({ speaker: "CEO", role: "CEO", text: `Prepared remark ${index}.` }));
    aapl[0] = { speaker: "Operator", role: "Operator", text: "The question-and-answer session will follow prepared remarks." };
    aapl[30] = { speaker: "CEO", role: "CEO", text: "We have a bright future. Thank you all, and now Kevan and I will be happy to take your questions." };
    aapl[32] = { speaker: "Operator", role: "Operator", text: "Certainly. We will go ahead and take our first question from Amit." };
    expect(classifyTranscriptQaChapter(aapl)).toMatchObject({
      transition_index: 30,
      qa_start_index: 32,
      transition_reason: "explicit_transition",
      qa_start_reason: "operator_intake",
    });

    const vrsn = Array.from({ length: 17 }, (_, index) => ({ speaker: "CEO", role: "CEO", text: `Prepared remark ${index}.` }));
    vrsn[15] = { speaker: "CEO", role: "CEO", text: "This concludes our prepared remarks, now we'll open the call for your questions." };
    vrsn[16] = { speaker: "Operator", role: "Operator", text: "If you are using a speakerphone, please mute your line. Our first question comes from Rob Oliver." };
    expect(classifyTranscriptQaChapter(vrsn)).toMatchObject({ transition_index: 15, qa_start_index: 16, qa_start_reason: "operator_intake" });

    const nvda = Array.from({ length: 21 }, (_, index) => ({ speaker: "CFO", role: "CFO", text: `Prepared remark ${index}.` }));
    nvda[0] = { speaker: "Operator", role: "Operator", text: "At this time, I would like to welcome everyone. Questions and answers will follow the presentation." };
    nvda[19] = { speaker: "Toshiya Hari", role: "", text: "Thanks, Colette. We will now transition to Q&A. Operator, please poll for questions." };
    nvda[20] = { speaker: "Operator", role: "Operator", text: "Our first question comes from C.J. Muse." };
    expect(classifyTranscriptQaChapter(nvda)).toMatchObject({ transition_index: 19, qa_start_index: 20, qa_start_reason: "operator_intake" });
  });

  it("does not let an unconfirmed transition absorb a distant operator queue", () => {
    const segments = Array.from({ length: 8 }, (_, index) => ({ speaker: "CEO", role: "CEO", text: `Prepared remark ${index}.` }));
    segments[1] = { speaker: "CEO", role: "CEO", text: "We will now transition to Q&A." };
    segments[6] = { speaker: "Operator", role: "Operator", text: "Our first question comes from Alex." };
    expect(classifyTranscriptQaChapter(segments)).toEqual({
      transition_index: 1,
      qa_start_index: null,
      transition_reason: "explicit_transition",
      qa_start_reason: "none",
    });
  });
});

describe("revision-bound byte spans and exact lexical ranking", () => {
  it("creates opaque, canonical UTF-8 receipts with exact full-segment hashes", async () => {
    const text = "Café 数据 🚀 demand";
    const start = text.indexOf("数据");
    const end = start + "数据".length;
    const span = await makeTranscriptSpan({ ticker: "AAPL", id: "2026Q3", body_sha256: "a".repeat(64) }, 7, text, start, end);
    expect(span).toMatchObject({
      schema: "mastermind.tx-span/v1",
      document_key: "AAPL/2026Q3",
      start_byte: 6,
      end_byte: 12,
      segment_index: 7,
      segment_text_sha256: "a6e7578020c16bddf160f6070b1de7464599190fde3ba513a0fb982e5f6cc777",
    });
    expect(span && isTranscriptSpanId(span.span_id)).toBe(true);
    expect(span?.span_id).toBe("txs1_b6563935f043c2a5d972aed9a69013fdcaeb3a082b0660f303061934c8ad916d");
    expect(span && canonicalTranscriptSpanLocator({
      schema: "mastermind.tx-span-locator/v1",
      document_key: span.document_key,
      body_sha256: span.body_sha256,
      segment_index: span.segment_index,
      start_byte: span.start_byte,
      end_byte: span.end_byte,
      segment_text_sha256: span.segment_text_sha256,
    })).toContain('"document_key":"AAPL/2026Q3"');
    expect(await makeTranscriptSpan({ ticker: "AAPL", id: "2026Q3", body_sha256: "a".repeat(64) }, 7, text, text.indexOf("🚀") + 1, text.length)).toBeNull();
  });

  it("orders quoted/literal phrase matches before token coverage, then newest", async () => {
    const oldPhrase = body("AAPL", "2024Q4", [{ speaker: "CEO", role: "CEO", text: "Data center demand is accelerating." }]);
    const middleTokens = body("AAPL", "2026Q2", [{ speaker: "CEO", role: "CEO", text: "Data demand from a center is improving." }]);
    const newestTokens = body("AAPL", "2026Q3", [{ speaker: "CEO", role: "CEO", text: "Center demand for data is improving." }]);
    const bodies = [oldPhrase, middleTokens, newestTokens];
    const result = await searchTickerTranscripts("AAPL", '"data center"', { fetcher: archiveFetch(await rootFor(bodies), bodies) });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.hits.map((hit) => hit.transcript_id)).toEqual(["2024Q4", "2026Q3", "2026Q2"]);
      expect(result.hits[0].matches[0].kind).toBe("quoted_phrase");
      expect(result.hits[0].matches[0].span).toMatchObject({ document_key: "AAPL/2024Q4" });
    }
  });

  it("distinguishes Q&A transition hits from verified Q&A hits", async () => {
    const nvda = body("NVDA", "2027Q1", [
      { speaker: "CFO", role: "CFO", text: "Prepared comments." },
      { speaker: "CFO", role: "CFO", text: "We will now transition to Q&A about demand." },
      { speaker: "Operator", role: "Operator", text: "Our first question comes from Alex about demand." },
    ]);
    const result = await searchTickerTranscripts("NVDA", "demand", { fetcher: archiveFetch(await rootFor([nvda]), [nvda]) });

    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.hits.map((hit) => hit.section)).toEqual(["qa_transition", "qa"]);
  });

  it("keeps a literal phrase and exact tokens distinct in the search contract", () => {
    expect(parseTranscriptSearchQuery('pricing "data center"')).toEqual({
      raw: 'pricing "data center"',
      phrases: ["q:data center", "l:pricing"],
      tokens: ["pricing", "data", "center"],
    });
  });
});
