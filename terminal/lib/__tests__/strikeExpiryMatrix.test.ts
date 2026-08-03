// StrikeExpiryMatrix — the ONE strike × expiry contract (masterplan §5.3).
//
// Before the merge, two surfaces drew the SAME `matrix:{ROOT}` payload two ways:
// the Positioning card painted MINUS gex as a dealer hedge on --flow-buy/--flow-sell,
// while the PRISM grid painted RAW gex on --up-rgb/--down-rgb. So one strike read
// green on one tab and red on the other, and the PRISM grid additionally INVERTED
// under html[data-updown="east"] — on a quantity that is not a price direction.
//
// These tests pin the law that ended it. Each one fails loudly if a future edit
// reintroduces either half of the defect.

import { describe, expect, it } from "vitest";
import {
  buildLevelBadgeMap,
  buildMatrixGrid,
  estimateStrikeStep,
  fmtMatrixCell,
  isSignedMetric,
  matrixCellTone,
  matrixCellValue,
  type MatrixMetric,
  type StrikeExpiryDoc,
} from "@/components/shared/StrikeExpiryMatrix";
import fixture from "@/public/data/matrix_fixture.json";

const SPY = (fixture as Record<string, unknown>).SPY as StrikeExpiryDoc & {
  levels: Record<string, number | null>;
};

describe("sign convention — hedge is MINUS gex, in $mn", () => {
  it("inverts the raw exposure sign and rescales whole dollars to millions", () => {
    // A dealer short +$5mn of gamma TRANSACTS -$5mn per +1% spot. The matrix ships
    // whole dollars; every surface speaks $mn.
    expect(matrixCellValue({ strike: 1, expiry: "x", gex: 5e6 }, "hedge")).toBe(-5);
    expect(matrixCellValue({ strike: 1, expiry: "x", gex: -5e6 }, "hedge")).toBe(5);
  });

  it("keeps a published zero as 0 and an absent field as null", () => {
    // 0 and null are different facts: "flat here" vs "not published".
    expect(matrixCellValue({ strike: 1, expiry: "x", gex: 0 }, "hedge")).toBe(0);
    expect(matrixCellValue({ strike: 1, expiry: "x", gex: null }, "hedge")).toBeNull();
    expect(matrixCellValue({ strike: 1, expiry: "x" }, "hedge")).toBeNull();
  });

  it("flattens the builder's {call, put} ΔOI object to a net", () => {
    expect(matrixCellValue({ strike: 1, expiry: "x", delta_oi: { call: 300, put: -100 } }, "doi")).toBe(200);
    expect(matrixCellValue({ strike: 1, expiry: "x", delta_oi: null }, "doi")).toBeNull();
  });
});

describe("colour law — a hedge is a transaction side, never a price direction", () => {
  it("paints signed hedge on the aggressor-side pair", () => {
    expect(matrixCellTone(12, "hedge")).toBe("var(--flow-buy)");
    expect(matrixCellTone(-12, "hedge")).toBe("var(--flow-sell)");
  });

  it("paints ΔOI on the neutral structure pair", () => {
    expect(matrixCellTone(12, "doi")).toBe("var(--brand-2)");
    expect(matrixCellTone(-12, "doi")).toBe("var(--ai)");
  });

  it("paints magnitudes on one neutral ramp, so they never look directional", () => {
    for (const m of ["oi", "vol"] as MatrixMetric[]) {
      expect(matrixCellTone(900, m)).toBe("var(--brand-2)");
      expect(matrixCellTone(-900, m)).toBe("var(--brand-2)");
    }
  });

  // THE regression gate. --up/--down (and their -rgb triplets) are redefined by
  // html[data-updown="east"]; the aggressor pair deliberately is not. If any metric
  // ever reaches for a direction token again, the zh east theme silently inverts a
  // dealer hedge — which is what the retired PRISM grid did.
  it("NEVER reaches for a direction token, at any sign, for any metric", () => {
    const metrics: MatrixMetric[] = ["hedge", "oi", "vol", "doi"];
    const tones = metrics.flatMap((m) => [matrixCellTone(7, m), matrixCellTone(-7, m), matrixCellTone(0, m)]);
    expect(tones.length).toBe(12);
    for (const tone of tones) {
      expect(tone, `east-flip leak: ${tone}`).not.toMatch(/--(up|down)\b/);
      expect(tone, `east-flip leak: ${tone}`).not.toMatch(/--(up|down)-rgb/);
    }
  });

  it("marks exactly the two signed metrics as signed", () => {
    expect(isSignedMetric("hedge")).toBe(true);
    expect(isSignedMetric("doi")).toBe(true);
    expect(isSignedMetric("oi")).toBe(false);
    expect(isSignedMetric("vol")).toBe(false);
  });
});

describe("cell formatting", () => {
  it("labels hedge in $mn/$bn with an explicit sign", () => {
    expect(fmtMatrixCell(112, "hedge")).toBe("+112M");
    expect(fmtMatrixCell(-1200, "hedge")).toBe("−1.2B");
    expect(fmtMatrixCell(1.24, "hedge")).toBe("+1.2M");
  });

  it("leaves magnitudes unsigned — a positive sign would imply a direction", () => {
    expect(fmtMatrixCell(2500, "oi")).toBe("2.5K");
    expect(fmtMatrixCell(2500, "doi")).toBe("+2.5K");
  });
});

describe("level badges — one level, one row", () => {
  const strikes = [762, 761, 760, 759, 758];

  it("badges the single nearest visible strike, not every strike within a step", () => {
    // The retired grid asked "any strike within step*1.2?" per row, which badged
    // 759/760/761 all WALL for one call wall on a $1 ladder.
    const map = buildLevelBadgeMap(strikes, { call_wall: 760 }, 1);
    expect([...map.entries()]).toEqual([[760, "levelWall"]]);
  });

  it("rounds to the nearest row when the level sits between strikes", () => {
    expect([...buildLevelBadgeMap(strikes, { call_wall: 760.4 }, 1).entries()]).toEqual([[760, "levelWall"]]);
    expect([...buildLevelBadgeMap(strikes, { call_wall: 760.6 }, 1).entries()]).toEqual([[761, "levelWall"]]);
  });

  it("drops a level that is off the visible grid rather than mislabelling a row", () => {
    expect(buildLevelBadgeMap(strikes, { call_wall: 900 }, 1).size).toBe(0);
  });

  it("resolves a shared row by precedence — flip outranks the rest", () => {
    const map = buildLevelBadgeMap(strikes, { call_wall: 760, gamma_flip: 760 }, 1);
    expect(map.get(760)).toBe("levelFlip");
  });

  it("gives the fixture's five levels exactly five badged rows", () => {
    const grid = buildMatrixGrid({ matrix: SPY, metric: "hedge", windowPct: 40, maxRows: 81 })!;
    const map = buildLevelBadgeMap(grid.strikes, SPY.levels, estimateStrikeStep(grid.strikes));
    expect(map.size).toBe(5);
    expect([...new Set(map.values())].sort()).toEqual([
      "levelFlip", "levelMagnet", "levelMaxPain", "levelSupport", "levelWall",
    ]);
  });
});

describe("expiry scope is anchored to the payload's session, never the wall clock", () => {
  // The fixture's session is 2026-07-10 and its near expiries are long past in real
  // time. A wall-clock filter (what the PRISM grid used) drops them all; the snapshot's
  // own 0DTE is a property of ITS session, exactly as the desk's expiry lens states.
  it("keeps the snapshot's own expiries however old the snapshot is", () => {
    const grid = buildMatrixGrid({ matrix: SPY, metric: "hedge", maxCols: 4 })!;
    expect(grid.sessionDate).toBe("2026-07-10");
    expect(grid.exps[0]).toBe("2026-07-10");
    expect(grid.exps.length).toBe(4);
  });

  it("resolves 0DTE against that session", () => {
    const grid = buildMatrixGrid({ matrix: SPY, metric: "hedge", scope: "0dte", maxCols: 8 })!;
    expect(grid.exps).toEqual(["2026-07-10"]);
  });

  it("never shows an expiry that already expired as of the session", () => {
    const stale: StrikeExpiryDoc = {
      ...SPY,
      _build_meta: { asof_date: "2026-07-15" },
    };
    const grid = buildMatrixGrid({ matrix: stale, metric: "hedge", maxCols: 20 })!;
    expect(grid.exps.every((e) => e >= "2026-07-15")).toBe(true);
  });
});

describe("grid construction", () => {
  it("keeps Positioning's defaults — ±8%, 41 rows, 14 cols, global scale, no Σ", () => {
    const grid = buildMatrixGrid({ matrix: SPY, metric: "hedge" })!;
    expect(grid.strikes.length).toBeLessThanOrEqual(41);
    expect(grid.exps.length).toBeLessThanOrEqual(14);
    expect(grid.perCol).toBeNull();
    expect(grid.sigma.size).toBe(0);
  });

  it("opts into per-column scales and the Σ column only when asked", () => {
    const grid = buildMatrixGrid({
      matrix: SPY, metric: "hedge", normalization: "column", withSigma: true, maxCols: 4, maxRows: 81, windowPct: 40,
    })!;
    expect(grid.perCol?.size).toBe(4);
    expect(grid.sigma.size).toBe(grid.strikes.length);
  });

  it("sums Σ over the visible expiries, and reports an unpublished strike as null not 0", () => {
    const doc: StrikeExpiryDoc = {
      _build_meta: { asof_date: "2026-01-01" },
      spot: 100,
      cells: [
        { strike: 100, expiry: "2026-01-02", gex: -3e6 },
        { strike: 100, expiry: "2026-01-03", gex: -1e6 },
        { strike: 101, expiry: "2026-01-02", gex: null },
      ],
    };
    const grid = buildMatrixGrid({ matrix: doc, metric: "hedge", withSigma: true })!;
    expect(grid.sigma.get(100)).toBe(4);   // (3 + 1) $mn of hedge
    expect(grid.sigma.get(101)).toBeNull(); // nothing published — not a confident zero
  });

  it("returns null for a cells-less payload so callers route to their empty state", () => {
    expect(buildMatrixGrid({ matrix: {}, metric: "hedge" })).toBeNull();
    expect(buildMatrixGrid({ matrix: null, metric: "hedge" })).toBeNull();
    expect(buildMatrixGrid({ matrix: { cells: [] }, metric: "hedge" })).toBeNull();
  });
});
