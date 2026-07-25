import { describe, it, expect } from "vitest";
import {
  isSurfaceIndex,
  isSurfaceFrame,
  checkIndexFilesContract,
  levelStep,
  gridMaxAbs,
  buildHeatBars,
  filterFrameToRange,
  toPerMinute,
  rebaseOffOpen,
  toAbsolute,
  composeSessionSeries,
  topExpiriesForStrike,
  type SurfaceIndex,
  type SurfaceFrame,
  type SessionPoint,
  type MatrixCell,
} from "@/lib/surfaceContract";
import type { Time } from "lightweight-charts";

const IDX: SurfaceIndex = {
  date: "2026-07-06",
  stamps: ["0931", "0941", "0951"],
  latest: "0951",
  cadenceSec: 600,
};

const FRAME: SurfaceFrame = {
  spot: 100,
  price_levels: [90, 95, 100, 105, 110],
  time_steps: ["09:31", "09:41", "09:51"],
  grids: {
    netprem: [
      [1, 2, 3], // level 90
      [-1, -2, -3], // 95
      [0, 5, 10], // 100
      [4, 4, 4], // 105
      [0, 0, -8], // 110
    ],
  },
  asof: "2026-07-06T13:51:00Z",
  cadence: "10-min",
};

describe("contract validators", () => {
  it("accepts a well-formed index / frame", () => {
    expect(isSurfaceIndex(IDX)).toBe(true);
    expect(isSurfaceFrame(FRAME)).toBe(true);
  });
  it("rejects malformed shapes", () => {
    expect(isSurfaceIndex({ date: "x", stamps: "no" })).toBe(false);
    expect(isSurfaceIndex(null)).toBe(false);
    expect(isSurfaceFrame({ price_levels: [1], grids: {} })).toBe(false); // missing asof/cadence/time_steps
  });
});

describe("checkIndexFilesContract — idx stamps ↔ files", () => {
  it("ok when files exactly match stamps and latest is the last", () => {
    const r = checkIndexFilesContract(IDX, ["0931", "0941", "0951"]);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.latestOk).toBe(true);
  });
  it("flags a stamp with no file (missing)", () => {
    const r = checkIndexFilesContract(IDX, ["0931", "0951"]);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["0941"]);
  });
  it("flags a file the index doesn't list (extra)", () => {
    const r = checkIndexFilesContract(IDX, ["0931", "0941", "0951", "1001"]);
    expect(r.ok).toBe(false);
    expect(r.extra).toEqual(["1001"]);
  });
  it("flags a latest that isn't the last stamp", () => {
    const bad: SurfaceIndex = { ...IDX, latest: "0941" };
    const r = checkIndexFilesContract(bad, ["0931", "0941", "0951"]);
    expect(r.latestOk).toBe(false);
    expect(r.ok).toBe(false);
  });
  it("empty index requires latest === null", () => {
    const empty: SurfaceIndex = { date: "2026-07-06", stamps: [], latest: null, cadenceSec: 600 };
    expect(checkIndexFilesContract(empty, []).ok).toBe(true);
    expect(checkIndexFilesContract({ ...empty, latest: "0931" }, []).latestOk).toBe(false);
  });
});

describe("levelStep / gridMaxAbs", () => {
  it("median step of evenly-spaced levels", () => {
    expect(levelStep([90, 95, 100, 105, 110])).toBe(5);
  });
  it("degenerate inputs fall back to 1", () => {
    expect(levelStep([100])).toBe(1);
    expect(levelStep([])).toBe(1);
  });
  it("gridMaxAbs is the max magnitude across the grid", () => {
    expect(gridMaxAbs(FRAME.grids.netprem)).toBe(10);
    expect(gridMaxAbs([[0, 0], [0, 0]])).toBe(0);
  });
  it("gridMaxAbs ignores non-finite", () => {
    expect(gridMaxAbs([[Infinity, 3], [NaN, -4]])).toBe(4);
  });
});

const anchor = (hhmm: string): Time => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) as unknown as Time; // deterministic minute-index anchor for tests
};

describe("buildHeatBars", () => {
  it("emits one bar per time step, each with a cell per level", () => {
    const bars = buildHeatBars(FRAME, "netprem", anchor);
    expect(bars).toHaveLength(3);
    expect(bars[0].cells).toHaveLength(5);
    // cell half-height = step/2 = 2.5, so level 100 → [97.5, 102.5]
    const mid = bars[0].cells[2];
    expect(mid.low).toBeCloseTo(97.5);
    expect(mid.high).toBeCloseTo(102.5);
    // amount = grid[levelIdx][timeIdx]; grid[2][0] = 0, grid[2][1] = 5
    expect(bars[0].cells[2].amount).toBe(0);
    expect(bars[1].cells[2].amount).toBe(5);
    expect(bars[2].cells[4].amount).toBe(-8);
  });
  it("returns [] for a missing metric or empty grid", () => {
    expect(buildHeatBars(FRAME, "gamma", anchor)).toEqual([]);
    expect(buildHeatBars({ ...FRAME, time_steps: [] }, "netprem", anchor)).toEqual([]);
  });
});

describe("filterFrameToRange — spot ± q", () => {
  it("narrows levels and grid rows in lockstep", () => {
    const f = filterFrameToRange(FRAME, 100, 5); // keep 95..105
    expect(f.price_levels).toEqual([95, 100, 105]);
    expect(f.grids.netprem).toHaveLength(3);
    expect(f.grids.netprem[0]).toEqual([-1, -2, -3]); // the level-95 row
    expect(f.grids.netprem[2]).toEqual([4, 4, 4]); // the level-105 row
  });
  it("q <= 0 returns the frame unchanged", () => {
    expect(filterFrameToRange(FRAME, 100, 0)).toBe(FRAME);
  });
  it("an empty window returns the frame unchanged (never blanks the pane)", () => {
    expect(filterFrameToRange(FRAME, 1000, 1)).toBe(FRAME);
  });
});

// ── Session-flow rebase math ────────────────────────────────────────────────

const CUM: SessionPoint[] = [
  { t: "09:30", call: 100, put: -50 },
  { t: "09:31", call: 250, put: -120 },
  { t: "09:32", call: 400, put: -90 },
];

describe("toPerMinute", () => {
  it("differences a cumulative series (first point kept)", () => {
    expect(toPerMinute(CUM)).toEqual([
      { t: "09:30", call: 100, put: -50 },
      { t: "09:31", call: 150, put: -70 },
      { t: "09:32", call: 150, put: 30 },
    ]);
  });
  it("empty → empty", () => {
    expect(toPerMinute([])).toEqual([]);
  });
});

describe("rebaseOffOpen", () => {
  it("subtracts the 9:30 open; first point becomes 0/0", () => {
    expect(rebaseOffOpen(CUM)).toEqual([
      { t: "09:30", call: 0, put: 0 },
      { t: "09:31", call: 150, put: -70 },
      { t: "09:32", call: 300, put: -40 },
    ]);
  });
  it("empty → empty", () => {
    expect(rebaseOffOpen([])).toEqual([]);
  });
});

describe("toAbsolute", () => {
  it("takes magnitude of both legs", () => {
    expect(toAbsolute(CUM)).toEqual([
      { t: "09:30", call: 100, put: 50 },
      { t: "09:31", call: 250, put: 120 },
      { t: "09:32", call: 400, put: 90 },
    ]);
  });
});

describe("composeSessionSeries — fixed order permin → offOpen → absolute", () => {
  it("cumulative + no toggles = passthrough copy", () => {
    const s = composeSessionSeries(CUM, { mode: "cumulative", offOpen: false, absolute: false });
    expect(s).toEqual(CUM);
    expect(s).not.toBe(CUM); // defensive copy
  });
  it("per-min", () => {
    const s = composeSessionSeries(CUM, { mode: "permin", offOpen: false, absolute: false });
    expect(s[1]).toEqual({ t: "09:31", call: 150, put: -70 });
  });
  it("cumulative + off-open", () => {
    const s = composeSessionSeries(CUM, { mode: "cumulative", offOpen: true, absolute: false });
    expect(s[0]).toEqual({ t: "09:30", call: 0, put: 0 });
    expect(s[2]).toEqual({ t: "09:32", call: 300, put: -40 });
  });
  it("off-open then absolute (order matters: rebase first, then magnitude)", () => {
    const s = composeSessionSeries(CUM, { mode: "cumulative", offOpen: true, absolute: true });
    // rebase makes 09:32 put = -40, absolute → 40
    expect(s[2]).toEqual({ t: "09:32", call: 300, put: 40 });
  });
});

// ── Ladder hover: per-expiry breakdown ──────────────────────────────────────

const CELLS: MatrixCell[] = [
  { strike: 750, expiry: "2026-07-06", gex: 600 },
  { strike: 750, expiry: "2026-07-10", gex: -300 },
  { strike: 750, expiry: "2026-07-17", gex: 100 },
  { strike: 750, expiry: "2026-07-24", gex: 0 }, // dropped (zero)
  { strike: 755, expiry: "2026-07-06", gex: 999 }, // different strike
];

describe("topExpiriesForStrike", () => {
  it("returns top-N expiries by |gex| with shares summing to 1", () => {
    const top = topExpiriesForStrike(CELLS, 750);
    expect(top.map((e) => e.exp)).toEqual(["2026-07-06", "2026-07-10", "2026-07-17"]);
    expect(top[0].gex).toBe(600);
    // shares are |gex| / Σ|gex| over kept (non-zero) cells: 600/(600+300+100)=0.6
    expect(top[0].share).toBeCloseTo(0.6);
    expect(top[1].share).toBeCloseTo(0.3);
    expect(top[2].share).toBeCloseTo(0.1);
    expect(top.reduce((s, e) => s + e.share, 0)).toBeCloseTo(1);
  });
  it("drops zero / non-finite cells", () => {
    const top = topExpiriesForStrike(CELLS, 750);
    expect(top.find((e) => e.exp === "2026-07-24")).toBeUndefined();
  });
  it("respects the N cap", () => {
    expect(topExpiriesForStrike(CELLS, 750, 2)).toHaveLength(2);
  });
  it("preserves the sign of gex (negative expiries kept, ranked by magnitude)", () => {
    const top = topExpiriesForStrike(CELLS, 750);
    expect(top[1]).toMatchObject({ exp: "2026-07-10", gex: -300 });
  });
  it("returns [] for an unknown strike, empty, or null cells", () => {
    expect(topExpiriesForStrike(CELLS, 999)).toEqual([]);
    expect(topExpiriesForStrike([], 750)).toEqual([]);
    expect(topExpiriesForStrike(null, 750)).toEqual([]);
    expect(topExpiriesForStrike(undefined, 750)).toEqual([]);
  });
});
