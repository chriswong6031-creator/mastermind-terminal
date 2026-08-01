import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeTranscript } from "../fund";
import { getTickerTranscriptIndex, normalizeTickerTranscriptIndex } from "../transcripts";

const call = (id: string) => ({
  id,
  period: `Q${id.slice(5)} FY${id.slice(0, 4)}`,
  date: "2026-07-31",
  title: "AAPL Earnings Call",
  url: `/data/tx/AAPL/${id}.json.gz`,
  bytes: 123,
  segment_count: 42,
  speaker_count: 8,
  speakers: ["Jane Doe", "Alex Smith"],
  word_count: 1200,
  qa_start: 20,
  has_qa: true,
  source: "DefeatBeta",
});

afterEach(() => vi.restoreAllMocks());

describe("ticker transcript index", () => {
  it("validates enriched metadata, sorts, and drops unsafe rows", () => {
    const out = normalizeTickerTranscriptIndex({
      schema: "mastermind.tx-symbol-index/v1",
      generated_at: "2026-08-01T00:00:00Z",
      ticker: "AAPL",
      calls: [
        call("2026Q2"),
        { id: "bad", period: "bad", url: "https://evil.example/x", bytes: 2 },
        call("2026Q3"),
      ],
    }, "AAPL");

    expect(out?.n).toBe(2);
    expect(out?.calls.map((item) => item.id)).toEqual(["2026Q3", "2026Q2"]);
    expect(out?.calls[0]).toMatchObject({ segment_count: 42, has_qa: true, qa_start: 20 });
  });

  it("rejects unknown envelopes and ticker mismatches", () => {
    expect(normalizeTickerTranscriptIndex({ schema: "other", calls: [] }, "AAPL")).toBeNull();
    expect(normalizeTickerTranscriptIndex({
      schema: "mastermind.tx-symbol-index/v1", ticker: "NVDA", calls: [],
    }, "AAPL")).toBeNull();
    expect(normalizeTickerTranscriptIndex(null, "AAPL")).toBeNull();
  });

  it("uses the global commit marker to prove genuine no coverage", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schema: "mastermind.tx-index/v1", generated_at: "2026-08-01T00:00:00Z", symbols: { NVDA: ["2026Q3"] },
      }), { status: 200 }));

    await expect(getTickerTranscriptIndex("AAPL")).resolves.toEqual({ status: "not_found" });
  });

  it("accepts ticker metadata only when it matches the global commit generation", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schema: "mastermind.tx-symbol-index/v1",
        generated_at: "2026-08-01T00:00:00Z",
        ticker: "AAPL",
        calls: [call("2026Q3")],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schema: "mastermind.tx-index/v1",
        generated_at: "2026-08-01T00:00:00Z",
        symbols: { AAPL: ["2026Q3"] },
      }), { status: 200 }));

    const result = await getTickerTranscriptIndex("AAPL");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.source).toBe("symbol");
  });

  it("falls back to global IDs when ticker metadata is rebuilding", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schema: "mastermind.tx-index/v1", generated_at: "2026-08-01T00:00:00Z", symbols: { AAPL: ["2026Q2", "2026Q3"] },
      }), { status: 200 }));

    const result = await getTickerTranscriptIndex("AAPL");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.source).toBe("global");
      expect(result.index.calls.map((item) => item.id)).toEqual(["2026Q3", "2026Q2"]);
      expect(result.warning).toContain("rebuilding");
    }
  });

  it("reports an archive error instead of converting a missing commit marker to empty", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));

    const result = await getTickerTranscriptIndex("AAPL", { retryNonce: 7 });
    expect(result).toEqual({ status: "error", message: "Archive commit marker is missing" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("?retry=7");
  });
});

describe("transcript body validation", () => {
  const body = {
    schema: "mastermind.tx/v1",
    ticker: "AAPL",
    id: "2026Q3",
    period: "Q3 FY2026",
    date: null,
    title: "AAPL Earnings Call",
    segments: [{ speaker: "Jane Doe", role: "CEO", text: "Prepared remarks." }],
  };

  it("accepts the exact envelope and nullable date", () => {
    expect(normalizeTranscript(body, "AAPL", "2026Q3")).toEqual(body);
  });

  it("rejects a mismatched ticker or malformed segment before rendering", () => {
    expect(normalizeTranscript({ ...body, ticker: "NVDA" }, "AAPL", "2026Q3")).toBeNull();
    expect(normalizeTranscript({ ...body, segments: [{ speaker: "Jane", text: "Hi" }] }, "AAPL", "2026Q3")).toBeNull();
  });
});
