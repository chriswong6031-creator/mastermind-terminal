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
  DEFAULT_MAX_COLS,
  DEFAULT_MAX_ROWS,
  DEFAULT_WINDOW_PCT,
  buildLevelBadgeMap,
  buildMatrixGrid,
  estimateStrikeStep,
  fmtMatrixCell,
  isSignedMetric,
  matrixCellBg,
  matrixCellTone,
  matrixCellValue,
  type MatrixMetric,
  type StrikeExpiryDoc,
} from "@/components/shared/StrikeExpiryMatrix";
import { mergeMatrixLevels } from "@/components/gexdesk/matrixDoc";
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
  // The exported constants ARE Positioning's contract — assert them directly. Asserting
  // `strikes.length <= 41` would pass just as happily if a future edit narrowed the
  // default window to ±1%, which is exactly the drift this test exists to catch.
  it("keeps Positioning's defaults — ±8%, 41 rows, 14 cols, global scale, no Σ", () => {
    expect(DEFAULT_WINDOW_PCT).toBe(8);
    expect(DEFAULT_MAX_ROWS).toBe(41);
    expect(DEFAULT_MAX_COLS).toBe(14);
    const grid = buildMatrixGrid({ matrix: SPY, metric: "hedge" })!;
    expect(grid.perCol).toBeNull();
    expect(grid.sigma.size).toBe(0);
  });

  it("pins the exact cell fill string at a known scale", () => {
    // sqrt(1) * 78 = 78.0% of the buy tone; the alpha curve and the token are both
    // load-bearing, so pin the whole produced string rather than a substring.
    expect(matrixCellBg(10, { hi: 10, lo: 0 }, "hedge")).toBe(
      "color-mix(in srgb, var(--flow-buy) 78.0%, transparent)"
    );
    // sqrt(0.25) * 78 = 39.0%, negative side.
    expect(matrixCellBg(-2.5, { hi: 10, lo: 0 }, "hedge")).toBe(
      "color-mix(in srgb, var(--flow-sell) 39.0%, transparent)"
    );
    // Floor: a non-zero cell never fades below 4% or it reads as "no data".
    expect(matrixCellBg(0.0001, { hi: 1e9, lo: 0 }, "hedge")).toBe(
      "color-mix(in srgb, var(--flow-buy) 4.0%, transparent)"
    );
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

// ─── F3: the levels merge (matrixDoc.mergeMatrixLevels) ───────────────────────
//
// This is the "one levels provenance" half of §5.3 and it had ZERO coverage. Worse, the
// fixtures could not have proven it: matrix_fixture and gexstate_fixture both carry
// gamma_flip 748.25, so BOTH merge orderings produce the identical badge — a live-desk
// screenshot showing FLIP@748 is vacuous as evidence. Every case below is DIVERGENT.
describe("mergeMatrixLevels — gex_state wins the flip, the matrix wins the rest", () => {
  // The measured defect this guard exists for (2026-08-01): the matrix builder's levels
  // block still ships the retired cumulative-by-strike estimator, which put SPY's flip at
  // 594.28 against a spot of 741.69 while gex_state's spot-grid flip was sane.
  it("prefers gex_state's flip over the matrix's retired estimator", () => {
    const merged = mergeMatrixLevels(
      { levels: { gamma_flip: 594.28 } },
      { gamma_flip: 748.25 }
    );
    expect(merged.gamma_flip).toBe(748.25);
  });

  it("falls back to the matrix flip only when gex_state has none", () => {
    expect(mergeMatrixLevels({ levels: { gamma_flip: 594.28 } }, null).gamma_flip).toBe(594.28);
    expect(mergeMatrixLevels({ levels: { gamma_flip: 594.28 } }, {}).gamma_flip).toBe(594.28);
    expect(mergeMatrixLevels({ levels: { gamma_flip: 594.28 } }, { gamma_flip: null }).gamma_flip).toBe(594.28);
  });

  it("reports no flip when neither source has one", () => {
    expect(mergeMatrixLevels({ levels: {} }, {}).gamma_flip).toBeNull();
    expect(mergeMatrixLevels(null, null).gamma_flip).toBeNull();
  });

  // Every NON-flip level is strike-resolved in the matrix, so the matrix wins there —
  // the opposite ordering from the flip. Divergent values prove which side won.
  it("prefers the MATRIX for walls, support, magnet and max pain", () => {
    const merged = mergeMatrixLevels(
      { levels: { call_wall: 760, put_support: 740, hvl: 750, max_pain: 745 } },
      { call_wall: 999, put_wall: 111, hvl: 222, magnet: 333 }
    );
    expect(merged.call_wall).toBe(760);
    expect(merged.put_support).toBe(740);
    expect(merged.hvl).toBe(750);
    expect(merged.max_pain).toBe(745);
  });

  // gex_state names it `put_wall`; every matrix surface calls it `put_support`.
  it("remaps gex_state's put_wall onto put_support when the matrix has none", () => {
    expect(mergeMatrixLevels({ levels: {} }, { put_wall: 741 }).put_support).toBe(741);
    expect(mergeMatrixLevels(null, { put_wall: 741 }).put_support).toBe(741);
  });

  it("walks the hvl → magnet chain on the gex_state side", () => {
    expect(mergeMatrixLevels({ levels: {} }, { hvl: 750, magnet: 999 }).hvl).toBe(750);
    expect(mergeMatrixLevels({ levels: {} }, { magnet: 999 }).hvl).toBe(999);
    expect(mergeMatrixLevels({ levels: {} }, { hvl: null, magnet: 999 }).hvl).toBe(999);
  });

  // max_pain has no gex_state twin at all — it must not silently borrow another field.
  it("never invents max_pain from gex_state", () => {
    expect(mergeMatrixLevels({ levels: {} }, { magnet: 333, call_wall: 760 }).max_pain).toBeNull();
  });

  it("survives a doc with no levels block at all", () => {
    expect(mergeMatrixLevels({}, { gamma_flip: 748.25 })).toEqual({
      call_wall: null, put_support: null, hvl: null, gamma_flip: 748.25, max_pain: null,
    });
  });
});

// ─── F6: the strike-window chips must produce DIFFERENT grids on a PROD ladder ─
//
// The thin fixture (40 strikes over ±4.7%) cannot show this: every window swallows the
// whole ladder, so all chips agree and a fixture-based test would pass on a broken set.
// Real SPY publishes ~281 strikes at $1 spacing over roughly ±19% — build that.
describe("strike-window chips diverge on a production-shaped ladder", () => {
  const SPOT = 750;
  const prodLadder: StrikeExpiryDoc = {
    _build_meta: { asof_date: "2026-01-02" },
    spot: SPOT,
    cells: Array.from({ length: 281 }, (_, i) => ({
      strike: 610 + i,                 // 610 … 890  ($1 spacing, ~±18.7% of spot)
      expiry: "2026-01-16",
      gex: (i % 7) * 1e6 - 3e6,
    })),
  };

  const gridFor = (windowPct: number) =>
    buildMatrixGrid({ matrix: prodLadder, metric: "hedge", windowPct, maxRows: 81, maxCols: 4 })!;

  it("gives ±3% native $1 rows inside the row budget", () => {
    const g = gridFor(3);
    expect(g.bucket).toBe(1);
    expect(g.strikes.length).toBeLessThanOrEqual(81);
    expect(g.strikes.length).toBeGreaterThan(40);
  });

  it("produces three genuinely different grids for ±3 / ±6 / ±12", () => {
    const shapes = [3, 6, 12].map((p) => {
      const g = gridFor(p);
      return `${g.bucket}@${g.strikes.length}`;
    });
    // Measured: 1@45, 2.5@37, 2.5@73 — three distinct (bucket, rows) pairs.
    expect(new Set(shapes).size, `grids collapsed: ${shapes.join(", ")}`).toBe(3);
  });

  // Row count is deliberately NOT monotonic in the window: a narrower window earns a
  // FINER bucket, so ±3% draws MORE rows (45 native $1) than ±6% (37 at $2.5). The
  // monotonic quantity is the price span covered, asserted below — not the row count.
  it("trades row resolution for reach as the window widens", () => {
    expect(gridFor(3).bucket).toBeLessThan(gridFor(6).bucket);
    expect(gridFor(3).strikes.length).toBeGreaterThan(gridFor(6).strikes.length);
  });

  it("widens the covered price span monotonically", () => {
    const spans = [3, 6, 12].map((p) => {
      const k = gridFor(p).strikes;
      return Math.max(...k) - Math.min(...k);
    });
    expect(spans[0]).toBeLessThan(spans[1]);
    expect(spans[1]).toBeLessThan(spans[2]);
  });

  // THE regression this replaces: ±20% and ±40% both exceeded the ladder's own ±18.7%
  // span, so both clamped to the whole ladder and rendered the identical grid.
  it("shows why the retired ±20/±40 pair was one picture, not two", () => {
    const a = gridFor(20);
    const b = gridFor(40);
    expect(a.bucket).toBe(b.bucket);
    expect(a.strikes.length).toBe(b.strikes.length);
  });
});
