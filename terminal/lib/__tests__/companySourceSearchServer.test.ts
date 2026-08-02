import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalTranscriptBodySha256 } from "../transcriptSearch";
import {
  __resetCompanySourceSearchArchiveCacheForTests,
  COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN,
  COMPANY_SOURCE_SEARCH_MAX_ROOT_BYTES,
  resolveCompanySourceSearchFromArchive,
} from "../companySourceSearchServer";

type Body = {
  schema: "mastermind.tx/v1";
  ticker: string;
  id: string;
  period: string;
  date: string;
  title: string;
  segments: Array<{ speaker: string; role: string; text: string }>;
};

function body(id: string, segments: Body["segments"]): Body {
  return {
    schema: "mastermind.tx/v1", ticker: "NVDA", id, period: `Q${id.slice(5)} FY${id.slice(0, 4)}`,
    date: id === "2026Q1" ? "2026-05-20" : "2026-02-19", title: `NVDA ${id}`, segments,
  };
}

function cie(id: string): string {
  return `cie_${createHash("sha256").update(`NVDA|${id.slice(0, 4)}|Q${id.slice(5)}`, "utf8").digest("hex").slice(0, 24)}`;
}

async function rootFor(documents: readonly Body[], overrides: { omitSha?: string; badSha?: string } = {}) {
  const revisions: Record<string, string> = {};
  const dates: Record<string, string> = {};
  for (const document of documents) {
    const key = `${document.ticker}/${document.id}`;
    const sha = await canonicalTranscriptBodySha256(document);
    if (!sha) throw new Error("WebCrypto unavailable");
    if (overrides.omitSha !== key) revisions[key] = overrides.badSha === key ? "f".repeat(64) : sha;
    dates[key] = document.date;
  }
  return {
    schema: "mastermind.tx-index/v1",
    generated_at: "2026-08-01T12:00:00Z",
    body_count: documents.length,
    symbols: { NVDA: documents.map((document) => document.id) },
    revisions,
    dates,
  };
}

function archiveFetch(root: unknown, documents: readonly Body[], options: { rootHeaders?: HeadersInit; badFinal?: boolean; missingBody?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    expect(init).toEqual(expect.objectContaining({ cache: "no-store", redirect: "error" }));
    if (url === `${COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN}/data/tx/index.json`) {
      const response = new Response(JSON.stringify(root), { status: 200, headers: options.rootHeaders });
      if (options.badFinal) Object.defineProperty(response, "url", { value: "https://evil.example/data/tx/index.json" });
      return response;
    }
    if (options.missingBody) return new Response("missing", { status: 404 });
    const document = documents.find((entry) => url === `${COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN}/data/tx/${entry.ticker}/${entry.id}.json.gz`);
    return document
      ? new Response(gzipSync(JSON.stringify(document)), { status: 200, headers: { "content-type": "application/gzip" } })
      : new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
}

function request(ids: string[], phrase = "data center") {
  return {
    ticker: "NVDA",
    phrase,
    mode: "search" as const,
    calls: ids.map((id) => ({ event_id: cie(id), transcript_id: id })),
  };
}

afterEach(() => {
  __resetCompanySourceSearchArchiveCacheForTests();
  vi.restoreAllMocks();
});

describe("company source search archive boundary", () => {
  it("uses the root first, accepts only its advertised canonical body revision, and emits opaque byte spans", async () => {
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: "Café 数据 data center demand." }]);
    const fetcher = archiveFetch(await rootFor([document]), [document]);
    const result = await resolveCompanySourceSearchFromArchive(request(["2026Q1"]), { fetcher });

    expect(result).toMatchObject({ state: "ready", ticker: "NVDA", searched_event_ids: [cie("2026Q1")] });
    if (result.state === "ready") {
      expect(result.spans).toHaveLength(1);
      expect(result.spans[0]).toMatchObject({
        span_id: expect.stringMatching(/^txs1_[a-f0-9]{64}$/),
        start_byte: 13,
        end_byte: 24,
        segment_text_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(result.spans[0].receipt.revision_id).toMatch(/^txroot-[a-f0-9]{64}$/);
    }
    expect(vi.mocked(fetcher).mock.calls.map(([url]) => String(url))).toEqual([
      `${COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN}/data/tx/index.json`,
      `${COMPANY_SOURCE_SEARCH_ARCHIVE_ORIGIN}/data/tx/NVDA/2026Q1.json.gz`,
    ]);
  });

  it("keeps UTF-8 byte authority for matches beyond the shortened display excerpt", async () => {
    const prefix = "数".repeat(5_000);
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: `${prefix}data center demand.` }]);
    const result = await resolveCompanySourceSearchFromArchive(request(["2026Q1"]), {
      fetcher: archiveFetch(await rootFor([document]), [document]),
    });
    expect(result).toMatchObject({ state: "ready" });
    if (result.state === "ready") {
      expect(result.spans[0]).toMatchObject({ start_byte: 15_000, end_byte: 15_011 });
      expect(result.spans[0].excerpt.length).toBeLessThan(400);
    }
  });

  it("is literal only: token-only rearrangements do not become a hit", async () => {
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: "Center demand for data is different." }]);
    const result = await resolveCompanySourceSearchFromArchive(request(["2026Q1"]), { fetcher: archiveFetch(await rootFor([document]), [document]) });
    expect(result).toMatchObject({ state: "ready" });
    if (result.state === "ready") expect(result.spans).toEqual([]);
  });

  it("rejects invalid, duplicate, over-broad, legacy, and mismapped requested calls before I/O", async () => {
    const fetcher = vi.fn();
    await expect(resolveCompanySourceSearchFromArchive({ ...request(["2026Q1"]), calls: [] }, { fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toMatchObject({ state: "error", retryable: false });
    await expect(resolveCompanySourceSearchFromArchive({ ...request(["2026Q1"]), calls: Array.from({ length: 13 }, () => ({ event_id: cie("2026Q1"), transcript_id: "2026Q1" })) }, { fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toMatchObject({ state: "error", retryable: false });
    await expect(resolveCompanySourceSearchFromArchive({ ...request(["2026Q1"]), calls: [{ event_id: "cie_deadbeefdeadbeefdeadbeef", transcript_id: "2026Q1" }] }, { fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toMatchObject({ state: "error", retryable: false });
    await expect(resolveCompanySourceSearchFromArchive({ ...request(["2026Q1"]), calls: [{ event_id: "NVDA-2026Q1", transcript_id: "2026Q1" }] }, { fetcher: fetcher as unknown as typeof fetch }))
      .resolves.toMatchObject({ state: "error", retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns not_covered only after the root proves company or selected-call absence", async () => {
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: "Data center demand." }]);
    const fetcher = archiveFetch(await rootFor([document]), [document]);
    const absent = await resolveCompanySourceSearchFromArchive(request(["2025Q4"]), { fetcher });
    expect(absent).toMatchObject({ state: "not_covered" });
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(1);
  });

  it("reports an advertised missing/hash-mismatched body as stale_revision and an upstream failure as unavailable", async () => {
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: "Data center demand." }]);
    const missing = await resolveCompanySourceSearchFromArchive(request(["2026Q1"]), {
      fetcher: archiveFetch(await rootFor([document]), [document], { missingBody: true }),
    });
    expect(missing).toMatchObject({ state: "stale_revision" });

    __resetCompanySourceSearchArchiveCacheForTests();
    const mismatch = await resolveCompanySourceSearchFromArchive(request(["2026Q1"]), {
      fetcher: archiveFetch(await rootFor([document], { badSha: "NVDA/2026Q1" }), [document]),
    });
    expect(mismatch).toMatchObject({ state: "stale_revision" });

    __resetCompanySourceSearchArchiveCacheForTests();
    const unavailable = await resolveCompanySourceSearchFromArchive(request(["2026Q1"]), {
      fetcher: archiveFetch(await rootFor([document]), [document], { badFinal: true }),
    });
    expect(unavailable).toMatchObject({ state: "unavailable", retryable: true });
  });

  it("caps the committed root before JSON parsing and caches root/body by revision", async () => {
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: "Data center demand." }]);
    const root = await rootFor([document]);
    const oversized = await resolveCompanySourceSearchFromArchive(request(["2026Q1"]), {
      fetcher: archiveFetch(root, [document], { rootHeaders: { "content-length": String(COMPANY_SOURCE_SEARCH_MAX_ROOT_BYTES + 1) } }),
    });
    expect(oversized).toMatchObject({ state: "unavailable" });

    __resetCompanySourceSearchArchiveCacheForTests();
    const fetcher = archiveFetch(root, [document]);
    await expect(resolveCompanySourceSearchFromArchive(request(["2026Q1"]), { fetcher })).resolves.toMatchObject({ state: "ready" });
    await expect(resolveCompanySourceSearchFromArchive(request(["2026Q1"]), { fetcher })).resolves.toMatchObject({ state: "ready" });
    expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(2);
  });

  it("requires exactly two selected calls for compare", async () => {
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: "Data center demand." }]);
    const compare = await resolveCompanySourceSearchFromArchive({
      ...request(["2026Q1"]), mode: "compare", left_event_id: cie("2026Q1"), right_event_id: cie("2026Q1"),
    }, { fetcher: archiveFetch(await rootFor([document]), [document]) });
    expect(compare).toMatchObject({ state: "error", retryable: false });
  });

  it("allocates a capped result set fairly so a dense left call cannot starve the right call", async () => {
    const left = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: Array.from({ length: 60 }, () => "data center").join(" | ") }]);
    const right = body("2025Q4", [{ speaker: "CEO", role: "CEO", text: "One data center mention." }]);
    const calls = ["2026Q1", "2025Q4"].map((id) => ({ event_id: cie(id), transcript_id: id }));
    const result = await resolveCompanySourceSearchFromArchive({
      ticker: "NVDA",
      phrase: "data center",
      mode: "compare",
      calls,
      left_event_id: cie("2026Q1"),
      right_event_id: cie("2025Q4"),
    }, { fetcher: archiveFetch(await rootFor([left, right]), [left, right]) });

    expect(result).toMatchObject({
      state: "ready",
      truncated: true,
      match_count_by_event: { [cie("2026Q1")]: 60, [cie("2025Q4")]: 1 },
      count_capped_event_ids: [],
    });
    if (result.state === "ready") {
      expect(result.spans).toHaveLength(60);
      expect(result.spans.filter((span) => span.event_id === cie("2026Q1"))).toHaveLength(59);
      expect(result.spans.filter((span) => span.event_id === cie("2025Q4"))).toHaveLength(1);
    }
  });

  it("bounds pathological scans and marks the per-event count as a lower bound", async () => {
    const document = body("2026Q1", [{ speaker: "CEO", role: "CEO", text: Array.from({ length: 10_001 }, () => "aa").join(" | ") }]);
    const result = await resolveCompanySourceSearchFromArchive(request(["2026Q1"], "aa"), {
      fetcher: archiveFetch(await rootFor([document]), [document]),
    });

    expect(result).toMatchObject({
      state: "ready",
      match_count_by_event: { [cie("2026Q1")]: 10_000 },
      count_capped_event_ids: [cie("2026Q1")],
      truncated: true,
    });
    if (result.state === "ready") expect(result.spans).toHaveLength(60);
  });
});
