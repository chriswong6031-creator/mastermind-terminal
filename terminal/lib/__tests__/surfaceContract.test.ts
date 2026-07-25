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
  metricEnabled,
  expiryPanelState,
  buildStrikeSeries,
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

// ─── B3 regression: non-uniform price_levels must paint SOLID ────────────────
// The renderer (lib/heatSeries) builds its pixel grid from the UNION of every cell
// boundary in a bar and gives each cell the row starting at its `low`. So the field is
// gapless only when the cells tile the band exactly: contiguous (cell[i].high ===
// cell[i+1].low) and non-overlapping, which makes |union| === cells + 1 === rows + 1.
//
// The pre-fix construction gave every cell the SAME half-height (the MEDIAN level gap),
// so a non-uniform ladder produced overlapping cells AND a union with more rows than
// cells — the surplus rows were never written and showed as transparent stripes.
const NONUNIFORM: SurfaceFrame = {
  spot: 110,
  // gaps: 5,5,10,10 → median 10. Pre-fix every cell was ±5 regardless of its real gap.
  price_levels: [100, 105, 110, 120, 130],
  time_steps: ["09:31", "09:41"],
  grids: {
    netprem: [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ],
  },
  asof: "2026-07-06T13:31:00Z",
  cadence: "10-min",
  session_date: "2026-07-06",
};

describe("buildHeatBars — non-uniform price_levels tile solid (B3)", () => {
  it("emits contiguous, non-overlapping cells: cell[i].high === cell[i+1].low", () => {
    const cells = buildHeatBars(NONUNIFORM, "netprem", anchor)[0].cells;
    expect(cells).toHaveLength(5);
    for (let i = 0; i < cells.length - 1; i++) {
      expect(cells[i].high).toBeCloseTo(cells[i + 1].low, 10);
      expect(cells[i].high).toBeGreaterThan(cells[i].low);
    }
  });

  it("boundary union has exactly cells+1 entries, so every row is owned by a cell", () => {
    const cells = buildHeatBars(NONUNIFORM, "netprem", anchor)[0].cells;
    const union = new Set<number>();
    for (const c of cells) { union.add(c.low); union.add(c.high); }
    // rows = union - 1; one row per cell means no unpainted stripe.
    expect(union.size).toBe(cells.length + 1);
  });

  it("sizes each band by its own local gap, not the median gap", () => {
    const cells = buildHeatBars(NONUNIFORM, "netprem", anchor)[0].cells;
    // 110 sits between a 5-wide gap below and a 10-wide gap above → [107.5, 115]
    expect(cells[2].low).toBeCloseTo(107.5);
    expect(cells[2].high).toBeCloseTo(115);
    // edge levels extend by half their single neighbouring gap
    expect(cells[0].low).toBeCloseTo(97.5);
    expect(cells[4].high).toBeCloseTo(135);
  });

  it("keeps the uniform-ladder geometry unchanged (no regression)", () => {
    const cells = buildHeatBars(FRAME, "netprem", anchor)[0].cells;
    const union = new Set<number>();
    for (const c of cells) { union.add(c.low); union.add(c.high); }
    expect(union.size).toBe(cells.length + 1);
    expect(cells[2].low).toBeCloseTo(97.5);
    expect(cells[2].high).toBeCloseTo(102.5);
  });

  it("survives a degenerate single-level ladder", () => {
    const one: SurfaceFrame = { ...NONUNIFORM, price_levels: [100], grids: { netprem: [[1, 2]] } };
    const cells = buildHeatBars(one, "netprem", anchor)[0].cells;
    expect(cells).toHaveLength(1);
    expect(cells[0].high).toBeGreaterThan(cells[0].low);
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

// ── Greek metric enablement (feature-detection) ─────────────────────────────

describe("metricEnabled — feature-detect a metric grid on a frame", () => {
  const withGex: SurfaceFrame = {
    ...FRAME,
    grids: { netprem: FRAME.grids.netprem, gex: [[1, -1, 2], [0, 3, -4], [0, 0, 0], [1, 1, 1], [0, 0, 0]] },
  };
  it("enabled when the frame carries a non-empty grid for the key", () => {
    expect(metricEnabled(FRAME, "netprem")).toBe(true);
    expect(metricEnabled(withGex, "gex")).toBe(true);
  });
  it("DISABLED when the key is missing (the greek tab stays off until the snapshotter ships)", () => {
    expect(metricEnabled(FRAME, "gex")).toBe(false);
    expect(metricEnabled(FRAME, "vanna")).toBe(false);
    expect(metricEnabled(FRAME, "charm")).toBe(false);
  });
  it("disabled for a null/undefined frame or an empty grid", () => {
    expect(metricEnabled(null, "netprem")).toBe(false);
    expect(metricEnabled(undefined, "gex")).toBe(false);
    expect(metricEnabled({ ...FRAME, grids: { gex: [] } }, "gex")).toBe(false);
    expect(metricEnabled({ ...FRAME, grids: { gex: [[]] } }, "gex")).toBe(false);
  });
});

// ── Strike intraday-evolution series (drill modal) ──────────────────────────

describe("buildStrikeSeries — one strike's session series + replay truncation", () => {
  // FRAME grid[2] (level 100) = [0, 5, 10] over time_steps 09:31/09:41/09:51.
  it("full series when the replay stamp is at (or past) the head", () => {
    const s = buildStrikeSeries(FRAME, 2, "netprem", null);
    expect(s.strike).toBe(100);
    expect(s.points).toEqual([
      { t: "09:31", v: 0 },
      { t: "09:41", v: 5 },
      { t: "09:51", v: 10 },
    ]);
    expect(s.nowT).toBe("09:51");
    expect(s.nowValue).toBe(10);
    expect(s.total).toBe(3);
  });
  it("TRUNCATES to the scrubbed stamp (left of NOW = realized only)", () => {
    const s = buildStrikeSeries(FRAME, 2, "netprem", 1); // scrubbed to the 2nd column
    expect(s.points).toEqual([
      { t: "09:31", v: 0 },
      { t: "09:41", v: 5 },
    ]);
    expect(s.nowT).toBe("09:41"); // NOW marker follows the scrubber, not the head
    expect(s.nowValue).toBe(5);
    expect(s.total).toBe(3); // "N snapshots" reflects the FULL day, not the truncation
  });
  it("first stamp → single realized point", () => {
    const s = buildStrikeSeries(FRAME, 2, "netprem", 0);
    expect(s.points).toEqual([{ t: "09:31", v: 0 }]);
    expect(s.nowT).toBe("09:31");
  });
  it("an out-of-range index falls back to the full realized series", () => {
    expect(buildStrikeSeries(FRAME, 2, "netprem", 99).points).toHaveLength(3);
    expect(buildStrikeSeries(FRAME, 2, "netprem", -1).points).toHaveLength(3);
  });
  it("negative-strike row (level 110 = [0,0,-8]) keeps its sign", () => {
    const s = buildStrikeSeries(FRAME, 4, "netprem", null);
    expect(s.nowValue).toBe(-8);
  });
  it("empty (no points) for a missing metric grid or empty frame — never fabricated", () => {
    const g = buildStrikeSeries(FRAME, 2, "gex", null);
    expect(g.points).toEqual([]);
    expect(g.strike).toBe(100); // strike still resolved from price_levels
    expect(buildStrikeSeries(null, 0, "netprem", null).points).toEqual([]);
    expect(buildStrikeSeries({ ...FRAME, time_steps: [] }, 2, "netprem", null).points).toEqual([]);
  });
  it("coerces a non-finite cell to 0 (no NaN leaks into the chart)", () => {
    const f: SurfaceFrame = { ...FRAME, grids: { netprem: [[NaN, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]] } };
    expect(buildStrikeSeries(f, 0, "netprem", null).points[0]).toEqual({ t: "09:31", v: 0 });
  });
});

// ─── B4: the expiry breakdown must not caption present-time shares "at NOW" ──
// The matrix is fetched once per root (no stamp in the key), so it always describes the
// present. Scrubbed back, there is nothing stamp-consistent to show — so the panel has to
// withdraw and say so rather than quietly relabelling today's split as a past moment's.
describe("expiryPanelState — point-in-time gate for the drill modal (B4)", () => {
  it("omits the section entirely when the matrix has no cells for this strike", () => {
    expect(expiryPanelState(0, true)).toBe("none");
    expect(expiryPanelState(0, false)).toBe("none");
  });

  it("shows the bars only at the head of the replay", () => {
    expect(expiryPanelState(3, true)).toBe("live");
  });

  it("withdraws the bars the moment the user scrubs back", () => {
    expect(expiryPanelState(3, false)).toBe("stale");
    expect(expiryPanelState(1, false)).toBe("stale");
  });

  it("never returns `live` while replayed, for any cell count", () => {
    for (const n of [1, 2, 5, 50]) expect(expiryPanelState(n, false)).not.toBe("live");
  });

  it("treats a negative/garbage count as nothing to show", () => {
    expect(expiryPanelState(-1, true)).toBe("none");
  });
});
