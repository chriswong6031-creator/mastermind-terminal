// intradayFixture — the FLOW_FIXTURE-only candle path that lets the Surface pane draw a price
// series in dev (no market-data key, empty history store). These tests lock the two properties the
// fixture exists for: candles land on the SAME time axis as the heat columns, and on the SAME
// synthetic price scale as the surface fixture's price_levels. Plus determinism — screenshots of
// the fixture surface must not churn between runs.
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { intradayFixture } from "@/lib/flowSource";
import { sessionEpoch } from "@/lib/intradayShared";

const SURFACE = path.join(process.cwd(), "public", "data", "surface_fixture.json");
const loadSurface = async () =>
  JSON.parse(await fs.readFile(SURFACE, "utf8")) as Record<string, Record<string, unknown>>;

// These bars use the app's DISPLAY-EPOCH convention (lib/intradayShared sessionEpoch, matching
// etDisplay for real Polygon bars): the market-local wall clock read AS IF it were UTC, which is
// what makes Lightweight-Charts label the axis with the session clock. So the assertions below read
// the epoch back in UTC — reading it in America/New_York would (correctly) be off by the ET offset.

/** epoch → "HH:MM" as rendered on the chart axis (UTC). */
const axisHHMM = (epoch: number) => new Date(epoch * 1000).toISOString().slice(11, 16);

/** epoch → "YYYY-MM-DD" as rendered on the chart axis (UTC). */
const axisDate = (epoch: number) => new Date(epoch * 1000).toISOString().slice(0, 10);

describe("intradayFixture — surface-derived dev candles", () => {
  it("returns null for a root with no surface fixture (caller falls through to the real path)", async () => {
    expect(await intradayFixture("QQQ", "5m")).toBeNull();
    expect(await intradayFixture("", "5m")).toBeNull();
  });

  it("puts the 5m series on the fixture's session window, on the axis the heat field uses", async () => {
    const surf = await loadSurface();
    const spy = surf.SPY;
    const times = spy.time_steps as string[];
    const bars = (await intradayFixture("SPY", "5m"))!;

    expect(bars.length).toBe(times.length);
    expect(axisDate(bars[0][0])).toBe(spy.session_date);
    expect(axisHHMM(bars[0][0])).toBe(times[0]);                        // 09:31
    expect(axisHHMM(bars[bars.length - 1][0])).toBe(times[times.length - 1]); // 15:56
  });

  it("shares the heat field's epochs exactly, so candles and field cannot drift apart", async () => {
    // The regression this guards (B11): the pane used to anchor heat columns to the TRUE UTC
    // instant while candle feeds emit display epochs, putting the field 4h (EDT) off its own
    // candles and labelling the 09:31 column "13:31".
    const surf = await loadSurface();
    const spy = surf.SPY;
    const times = spy.time_steps as string[];
    const date = spy.session_date as string;
    const bars = (await intradayFixture("SPY", "5m"))!;
    for (let i = 0; i < times.length; i++) {
      expect(bars[i][0]).toBe(sessionEpoch(date, times[i]));
    }
  });

  it("is ascending and epoch-unique", async () => {
    const bars = (await intradayFixture("SPY", "5m"))!;
    for (let i = 1; i < bars.length; i++) expect(bars[i][0]).toBeGreaterThan(bars[i - 1][0]);
    expect(new Set(bars.map((b) => b[0])).size).toBe(bars.length);
  });

  it("tracks the surface fixture's own price scale and keeps OHLC coherent", async () => {
    const surf = await loadSurface();
    const spy = surf.SPY;
    const spotPath = spy.spot_path as number[];
    const levels = spy.price_levels as number[];
    const bars = (await intradayFixture("SPY", "5m"))!;

    // closes ARE the spot path — one price scale for field + candles
    expect(bars.map((b) => b[4])).toEqual(spotPath.map((v) => Math.round(v * 100) / 100));
    for (const b of bars) {
      expect(b[4]).toBeGreaterThanOrEqual(Math.min(...levels));
      expect(b[4]).toBeLessThanOrEqual(Math.max(...levels));
      expect(b[2]).toBeGreaterThanOrEqual(Math.max(b[1], b[4])); // high ≥ body
      expect(b[3]).toBeLessThanOrEqual(Math.min(b[1], b[4]));    // low ≤ body
      expect(b[5]).toBeGreaterThan(0);                            // volume
    }
  });

  it("is deterministic — no Math.random, so repeat runs are byte-identical", async () => {
    expect(await intradayFixture("SPY", "5m")).toEqual(await intradayFixture("SPY", "5m"));
  });

  it("resamples upward for coarser tfs and leaves sub-5m as the 5m series", async () => {
    const five = (await intradayFixture("SPY", "5m"))!;
    const fifteen = (await intradayFixture("SPY", "15m"))!;
    const one = (await intradayFixture("SPY", "1m"))!;

    expect(fifteen.length).toBeLessThan(five.length);
    expect(fifteen[0][0] % 900).toBe(0);            // buckets align to the 15-min clock
    expect(fifteen[0][4]).toBe(five[2][4]);         // bucket close = last 5m close in it
    expect(one).toEqual(five);                      // no finer granularity to synthesize
  });
});
