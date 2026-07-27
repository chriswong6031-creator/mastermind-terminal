// The macro intraday leg (Yahoo v8 chart) and the routing that reaches it.
//
// Before this leg existed, every macro symbol fell through classify()'s "us" default into
// Polygon's stocks aggregates under its literal Yahoo ticker — "CL=F" is not a ticker that
// market has, so the response was empty and the chart printed "No intraday data for CL=F on
// 1h" forever. Two things are locked here:
//
//   1. THE ROUTE. A macro symbol reaches query2.finance.yahoo.com; a plain US equity still
//      reaches api.polygon.io. The second half is the regression guard — a future edit that
//      widens the macro branch must not quietly take NVDA off Polygon.
//   2. THE DISPLAY-EPOCH CONVENTION. Bars come back as [displayEpoch, o, h, l, c, v] where
//      displayEpoch is the symbol's HOME-market wall clock read AS IF it were UTC (see
//      localDisplay / macroDisplayTz / sessionEpoch) — ET for the US rows, Tokyo for ^N225,
//      London for ^FTSE. Emitting the true UTC instant instead would plot every macro series
//      hours away from its own time axis; emitting ET for ALL of them put the Tokyo session
//      at 20:00–02:00 on its own axis.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIntraday, fetchYahooMacroIntraday } from "@/lib/intradaySources";

/** Epoch SECONDS for a UTC wall-clock instant (what Yahoo puts in `timestamp[]`). */
const utcSec = (y: number, mo: number, d: number, h: number, mi: number) =>
  Date.UTC(y, mo - 1, d, h, mi) / 1000;

/**
 * The expected DISPLAY epoch for an ET wall clock — i.e. the ET components rebuilt as UTC.
 * Written out longhand rather than derived from the source so the test pins the convention
 * instead of mirroring the implementation.
 */
const etDisplaySec = (y: number, mo: number, d: number, h: number, mi: number) =>
  Date.UTC(y, mo - 1, d, h, mi) / 1000;

/**
 * The expected DISPLAY epoch for a MARKET-LOCAL wall clock — the local components rebuilt as UTC.
 * Numerically the same function as etDisplaySec (both just rebuild wall-clock components as UTC);
 * the separate name is the point — the LABEL says WHICH market's clock the expectation pins.
 */
const localDisplaySec = (y: number, mo: number, d: number, h: number, mi: number) =>
  Date.UTC(y, mo - 1, d, h, mi) / 1000;

type Row = [number, number | null, number | null, number | null, number | null, number | null];

/** A real-shaped v8 chart body: parallel arrays under indicators.quote[0]. */
function chartBody(rows: Row[], symbol = "CL=F") {
  return {
    chart: {
      result: [
        {
          meta: { symbol, currency: "USD", hasPrePostMarketData: false },
          timestamp: rows.map((r) => r[0]),
          indicators: {
            quote: [
              {
                open: rows.map((r) => r[1]),
                high: rows.map((r) => r[2]),
                low: rows.map((r) => r[3]),
                close: rows.map((r) => r[4]),
                volume: rows.map((r) => r[5]),
              },
            ],
          },
        },
      ],
      error: null,
    },
  };
}

let calls: string[];
let realFetch: typeof globalThis.fetch;

/** Install a fetch spy that answers every request with `body` (status 200 unless given). */
function serve(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(async (url: any) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as any;
}

beforeEach(() => {
  calls = [];
  realFetch = globalThis.fetch;
  process.env.POLYGON_API_KEY = "test-key";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("fetchYahooMacroIntraday — parsing a v8 chart payload", () => {
  it("emits [displayEpoch, o, h, l, c, v] with the ET wall clock as the epoch", async () => {
    // 13:30 UTC on 2026-07-27 is 09:30 EDT.
    serve(
      chartBody([
        [utcSec(2026, 7, 27, 13, 30), 65.1, 65.4, 65.0, 65.25, 1200],
        [utcSec(2026, 7, 27, 13, 35), 65.25, 65.6, 65.2, 65.55, 900],
      ]),
    );
    const bars = await fetchYahooMacroIntraday("CL=F", "5m");
    expect(bars).toEqual([
      [etDisplaySec(2026, 7, 27, 9, 30), 65.1, 65.4, 65.0, 65.25, 1200],
      [etDisplaySec(2026, 7, 27, 9, 35), 65.25, 65.6, 65.2, 65.55, 900],
    ]);
  });

  it("skips the null-close entries Yahoo pads non-trading slots with", async () => {
    // A bare Number.isFinite(+x) would turn each null into a $0 print, because +null === 0.
    serve(
      chartBody([
        [utcSec(2026, 7, 27, 13, 30), 65.1, 65.4, 65.0, 65.25, 1200],
        [utcSec(2026, 7, 27, 13, 35), null, null, null, null, null],
        [utcSec(2026, 7, 27, 13, 40), 65.5, 65.7, 65.4, 65.6, 800],
      ]),
    );
    const bars = await fetchYahooMacroIntraday("CL=F", "5m");
    // The padded 09:35 slot is DROPPED, not emitted as a $0 bar.
    expect(bars.map((b) => b[0])).toEqual([
      etDisplaySec(2026, 7, 27, 9, 30),
      etDisplaySec(2026, 7, 27, 9, 40),
    ]);
    expect(bars.map((b) => b[4])).toEqual([65.25, 65.6]);
  });

  it("falls back to the close for a missing open/high/low rather than dropping the bar", async () => {
    serve(chartBody([[utcSec(2026, 7, 27, 13, 30), null, null, null, 65.25, null]]));
    const bars = await fetchYahooMacroIntraday("CL=F", "5m");
    expect(bars).toEqual([[etDisplaySec(2026, 7, 27, 9, 30), 65.25, 65.25, 65.25, 65.25, 0]]);
  });

  it("returns an honest empty array for a 200 with no bars", async () => {
    serve({ chart: { result: [], error: null } });
    expect(await fetchYahooMacroIntraday("CL=F", "5m")).toEqual([]);
  });

  it("throws on an upstream non-200 so the route can say the feed is unavailable", async () => {
    serve({ chart: { result: null, error: { code: "Not Found" } } }, 404);
    await expect(fetchYahooMacroIntraday("CL=F", "5m")).rejects.toThrow("yahoo 404");
  });
});

describe("fetchYahooMacroIntraday — interval and range selection", () => {
  const urlFor = async (tf: string) => {
    calls.length = 0;
    serve(chartBody([]));
    await fetchYahooMacroIntraday("CL=F", tf);
    return calls[0];
  };

  it("fetches an exactly-native timeframe natively", async () => {
    for (const [tf, iv] of [["1m", "1m"], ["2m", "2m"], ["5m", "5m"], ["15m", "15m"], ["30m", "30m"], ["1h", "60m"]]) {
      const url = await urlFor(tf);
      expect(url, tf).toContain(`interval=${iv}&`);
    }
  });

  it("fetches the largest native interval that divides a non-native timeframe", async () => {
    // 3m has no native divisor above 1m (2 does not divide 3); 10m←5m, 45m←15m, 2h/3h/4h←60m.
    for (const [tf, iv] of [["3m", "1m"], ["10m", "5m"], ["45m", "15m"], ["2h", "60m"], ["3h", "60m"], ["4h", "60m"]]) {
      const url = await urlFor(tf);
      expect(url, tf).toContain(`interval=${iv}&`);
    }
  });

  it("asks for the history window each base interval actually serves", async () => {
    expect(await urlFor("1m")).toContain("range=5d");
    expect(await urlFor("2m")).toContain("range=5d");
    expect(await urlFor("5m")).toContain("range=1mo");
    expect(await urlFor("30m")).toContain("range=1mo");
    expect(await urlFor("1h")).toContain("range=3mo");
    expect(await urlFor("4h")).toContain("range=3mo");
  });

  it("URL-encodes the symbol so '=' and '^' survive the path segment", async () => {
    serve(chartBody([]));
    await fetchYahooMacroIntraday("CL=F", "5m");
    expect(calls[0]).toContain("/v8/finance/chart/CL%3DF?");
    calls.length = 0;
    await fetchYahooMacroIntraday("^GSPC", "5m");
    expect(calls[0]).toContain("/v8/finance/chart/%5EGSPC?");
  });
});

describe("fetchYahooMacroIntraday — resampling a non-native timeframe", () => {
  it("aggregates 5m base bars into 10m buckets aligned to the local clock", async () => {
    serve(
      chartBody([
        [utcSec(2026, 7, 27, 13, 30), 65.0, 65.4, 64.9, 65.2, 100],   // 09:30 ET ┐ 09:30 bucket
        [utcSec(2026, 7, 27, 13, 35), 65.2, 65.8, 65.1, 65.7, 200],   // 09:35 ET ┘
        [utcSec(2026, 7, 27, 13, 40), 65.7, 65.9, 65.3, 65.4, 300],   // 09:40 ET ┐ 09:40 bucket
        [utcSec(2026, 7, 27, 13, 45), 65.4, 66.2, 65.35, 66.1, 400],  // 09:45 ET ┘
      ]),
    );
    const bars = await fetchYahooMacroIntraday("CL=F", "10m");
    expect(calls[0]).toContain("interval=5m");   // base fetched natively, coarsened locally
    expect(bars).toEqual([
      [etDisplaySec(2026, 7, 27, 9, 30), 65.0, 65.8, 64.9, 65.7, 300],
      [etDisplaySec(2026, 7, 27, 9, 40), 65.7, 66.2, 65.3, 66.1, 700],
    ]);
  });
});

describe("fetchYahooMacroIntraday — international indices plot on their HOME market clock", () => {
  // Every macro symbol used to be stamped with the ET reading, which put a Tokyo session on the
  // axis at 20:00–02:00 and let Day Trade Mode paint US RTH bands over it. Each index now carries
  // ITS market's wall clock, exactly like the Tencent CN/HK legs.
  it("stamps ^N225 with the Tokyo clock (00:00 UTC = 09:00 JST)", async () => {
    serve(chartBody([[utcSec(2026, 7, 27, 0, 0), 41000, 41200, 40900, 41100, 0]], "^N225"));
    const bars = await fetchYahooMacroIntraday("^N225", "5m");
    expect(bars).toEqual([[localDisplaySec(2026, 7, 27, 9, 0), 41000, 41200, 40900, 41100, 0]]);
  });

  it("stamps ^HSI with the Hong Kong clock (01:30 UTC = 09:30 HKT)", async () => {
    serve(chartBody([[utcSec(2026, 7, 27, 1, 30), 25000, 25100, 24950, 25050, 0]], "^HSI"));
    const bars = await fetchYahooMacroIntraday("^HSI", "5m");
    expect(bars[0][0]).toBe(localDisplaySec(2026, 7, 27, 9, 30));
  });

  // IST is UTC+5:30. A whole-hour offset assumption anywhere in the chain would land this bar
  // at 09:00 or 10:00 — half an hour off its own opening print.
  it("carries India's half-hour offset (04:00 UTC = 09:30 IST)", async () => {
    serve(chartBody([[utcSec(2026, 7, 27, 4, 0), 82000, 82300, 81900, 82150, 0]], "^BSESN"));
    const bars = await fetchYahooMacroIntraday("^BSESN", "5m");
    expect(bars[0][0]).toBe(localDisplaySec(2026, 7, 27, 9, 30));
  });

  // The offset is a real DST lookup, not a stored constant: London is UTC+1 in July and UTC+0 in
  // January, and the FTSE opens at 08:00 local in both.
  it("follows ^FTSE across the BST/GMT boundary", async () => {
    serve(chartBody([[utcSec(2026, 7, 27, 7, 0), 9100, 9120, 9090, 9110, 0]], "^FTSE"));
    expect((await fetchYahooMacroIntraday("^FTSE", "5m"))[0][0])
      .toBe(localDisplaySec(2026, 7, 27, 8, 0));   // BST, UTC+1
    serve(chartBody([[utcSec(2026, 1, 15, 8, 0), 9000, 9020, 8990, 9010, 0]], "^FTSE"));
    expect((await fetchYahooMacroIntraday("^FTSE", "5m"))[0][0])
      .toBe(localDisplaySec(2026, 1, 15, 8, 0));   // GMT, UTC+0
  });

  // ^GSPTSE is deliberately UNMAPPED, not overlooked: Toronto trades the same Eastern wall clock
  // as New York (09:30–16:00), so the TSX composite belongs on the ET axis with the US rows.
  it("leaves ^GSPTSE on the ET axis (13:30 UTC = 09:30 in Toronto and New York alike)", async () => {
    serve(chartBody([[utcSec(2026, 7, 27, 13, 30), 27000, 27100, 26950, 27050, 0]], "^GSPTSE"));
    const bars = await fetchYahooMacroIntraday("^GSPTSE", "5m");
    expect(bars[0][0]).toBe(localDisplaySec(2026, 7, 27, 9, 30));
  });

  // resample() buckets on the DISPLAY epoch, so a local-clock stamp buckets on the local clock
  // for free — 10m buckets open at 09:00 and 09:10 Tokyo, not on an ET boundary.
  it("buckets a resampled ^N225 timeframe on the Tokyo clock", async () => {
    serve(
      chartBody([
        [utcSec(2026, 7, 27, 0, 0), 41000, 41200, 40900, 41100, 100],    // 09:00 JST ┐ 09:00 bucket
        [utcSec(2026, 7, 27, 0, 5), 41100, 41400, 41050, 41350, 200],    // 09:05 JST ┘
        [utcSec(2026, 7, 27, 0, 10), 41350, 41500, 41300, 41320, 300],   // 09:10 JST ┐ 09:10 bucket
        [utcSec(2026, 7, 27, 0, 15), 41320, 41600, 41200, 41550, 400],   // 09:15 JST ┘
      ], "^N225"),
    );
    const bars = await fetchYahooMacroIntraday("^N225", "10m");
    expect(calls[0]).toContain("interval=5m");   // base fetched natively, coarsened locally
    expect(bars).toEqual([
      [localDisplaySec(2026, 7, 27, 9, 0), 41000, 41400, 40900, 41350, 300],
      [localDisplaySec(2026, 7, 27, 9, 10), 41350, 41600, 41200, 41550, 700],
    ]);
  });
});

describe("fetchIntraday — which upstream a symbol reaches", () => {
  it("routes CL=F to the Yahoo macro leg and produces bars", async () => {
    serve(
      chartBody([
        [utcSec(2026, 7, 27, 13, 30), 65.1, 65.4, 65.0, 65.25, 1200],
        [utcSec(2026, 7, 27, 14, 30), 65.3, 65.9, 65.2, 65.8, 1500],
      ]),
    );
    const bars = await fetchIntraday("CL=F", "1h", false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("query2.finance.yahoo.com/v8/finance/chart/");
    expect(calls[0]).not.toContain("polygon.io");
    expect(bars).toEqual([
      [etDisplaySec(2026, 7, 27, 9, 30), 65.1, 65.4, 65.0, 65.25, 1200],
      [etDisplaySec(2026, 7, 27, 10, 30), 65.3, 65.9, 65.2, 65.8, 1500],
    ]);
  });

  it("routes ^GSPC, EURUSD=X and DX-Y.NYB to the same leg", async () => {
    for (const sym of ["^GSPC", "^TNX", "EURUSD=X", "DX-Y.NYB"]) {
      calls.length = 0;
      serve(chartBody([[utcSec(2026, 7, 27, 13, 30), 1, 1, 1, 1, 0]], sym));
      await fetchIntraday(sym, "5m", false);
      expect(calls[0], sym).toContain("query2.finance.yahoo.com");
    }
  });

  // REGRESSION GUARD: the macro branch runs before classify(), so a careless widening of
  // isMacroSymbol would silently take ordinary US equities off Polygon.
  it("still sends a plain US equity to Polygon", async () => {
    serve({ results: [] });
    await fetchIntraday("NVDA", "5m", false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("api.polygon.io/v2/aggs/ticker/NVDA/");
    expect(calls[0]).not.toContain("yahoo.com");
  });

  it("keeps overnight macro bars regardless of the ext flag", async () => {
    // 03:00 UTC = 23:00 ET the previous evening — inside a crude session, outside US RTH.
    // Polygon's leg drops those minutes when ext=false; the macro leg must not, or a futures
    // chart would lose most of its day.
    serve(
      chartBody([
        [utcSec(2026, 7, 27, 3, 0), 64.8, 65.0, 64.7, 64.95, 500],
        [utcSec(2026, 7, 27, 14, 0), 65.1, 65.4, 65.0, 65.25, 1200],
      ]),
    );
    const bars = await fetchIntraday("CL=F", "5m", false);
    expect(bars).toHaveLength(2);
    expect(bars[0][0]).toBe(etDisplaySec(2026, 7, 26, 23, 0));
  });

  it("applies the shared tail — ascending, de-duplicated, capped at 1200 bars", async () => {
    const t = utcSec(2026, 7, 27, 13, 30);
    serve(
      chartBody([
        [t + 600, 3, 3, 3, 3, 30],
        [t, 1, 1, 1, 1, 10],
        [t + 600, 9, 9, 9, 9, 90],   // duplicate epoch — first one after the sort wins
        [t + 300, 2, 2, 2, 2, 20],
      ]),
    );
    const bars = await fetchIntraday("CL=F", "5m", false);
    expect(bars.map((b) => b[0])).toEqual([
      etDisplaySec(2026, 7, 27, 9, 30),
      etDisplaySec(2026, 7, 27, 9, 35),
      etDisplaySec(2026, 7, 27, 9, 40),
    ]);
  });

  it("caps a long macro history at the last 1200 bars", async () => {
    const t0 = utcSec(2026, 7, 27, 0, 0);
    const rows: Row[] = [];
    for (let i = 0; i < 1500; i++) rows.push([t0 + i * 60, 1, 1, 1, 1 + i, 1]);
    serve(chartBody(rows));
    const bars = await fetchIntraday("CL=F", "1m", false);
    expect(bars).toHaveLength(1200);
    expect(bars[bars.length - 1][4]).toBe(1500);
  });

  it("returns [] for a non-intraday timeframe without calling any upstream", async () => {
    serve(chartBody([]));
    expect(await fetchIntraday("CL=F", "D", false)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  // FRED daily series print ONCE A DAY. They match no macro shape, so they fell through
  // classify()'s "us" default into Polygon's stocks aggregates under a ticker that market has
  // never carried — spending a paid API call to receive an empty result set. The honest answer
  // is "No intraday data", and it costs nothing to give.
  it("returns [] for a FRED daily series without calling any upstream", async () => {
    serve(chartBody([]));
    for (const sym of ["DFII10", "DFII5", "T10YIE", "T5YIE"]) {
      calls.length = 0;
      expect(await fetchIntraday(sym, "1h", false), sym).toEqual([]);
      expect(calls, sym).toHaveLength(0);
    }
  });

  // REGRESSION GUARD, the other half: the daily-only branch must not swallow anything else.
  it("still sends a plain US equity to Polygon after the daily-only branch", async () => {
    serve({ results: [] });
    await fetchIntraday("NVDA", "5m", false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("api.polygon.io/v2/aggs/ticker/NVDA/");
  });

  it("still sends a macro symbol to the Yahoo leg after the daily-only branch", async () => {
    serve(chartBody([[utcSec(2026, 7, 27, 13, 30), 1, 1, 1, 1, 0]], "^TNX"));
    await fetchIntraday("^TNX", "5m", false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("query2.finance.yahoo.com");
  });
});
