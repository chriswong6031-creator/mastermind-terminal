/**
 * quadBoard — Market Structure Core W3.
 *
 * The properties pinned here are the ones whose failure is invisible on screen: a
 * hedging sign that disagrees with the W1 chart beside it, a delta axis that files the
 * wings on the wrong side, and a scatter point plotted at a default coordinate that a
 * reader would take for a historical extreme.
 */
import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  deriveQuadrant,
  floatingStrike,
  quadBoard,
  type DeltaBucketRow,
  type QuadPayload,
  type QuadRow,
} from "@/lib/quadBoard";
import { hedgeProfile } from "@/lib/marketStructure";

// ─── Floating strike ─────────────────────────────────────────────────────────────────

const BUCKETS: DeltaBucketRow[] = [
  { lo: 0.0, hi: 0.05, gamma_net: -10, delta_net: 5, vanna_net: 1, charm_net: -0.5, n: 40 },
  { lo: 0.45, hi: 0.5, gamma_net: 200, delta_net: 60, vanna_net: 9, charm_net: -3, n: 120 },
  { lo: 0.5, hi: 0.55, gamma_net: -320, delta_net: 70, vanna_net: 12, charm_net: -4, n: 130 },
  { lo: 0.95, hi: 1.0, gamma_net: 15, delta_net: 90, vanna_net: 2, charm_net: -1, n: 30 },
];

describe("floatingStrike", () => {
  it("reports the hedging requirement, i.e. the negative of the dealer position", () => {
    const f = floatingStrike(BUCKETS, "gamma");
    expect(f.buckets.map((b) => b.hedgeMn)).toEqual([10, -200, 320, -15]);
  });

  it("uses the SAME sign convention as the W1 by-strike chart", () => {
    // These two charts sit on one tab. A sign that flipped between them would read as a
    // fact about the book rather than an inconsistency in our code.
    const strikeRows = [{ strike: 100, gamma_net: 200, gamma_call: 0, gamma_put: 0 }];
    const byStrike = hedgeProfile(strikeRows, "gamma", 100);
    const byDelta = floatingStrike([{ lo: 0.45, hi: 0.5, gamma_net: 200 }], "gamma");
    expect(Math.sign(byDelta.buckets[0].hedgeMn)).toBe(Math.sign(byStrike.rows[0].hedgeMn));
  });

  it("switches lens without re-sorting or losing buckets", () => {
    for (const g of ["gamma", "delta", "vanna", "charm"] as const) {
      const f = floatingStrike(BUCKETS, g);
      expect(f.buckets).toHaveLength(4);
      expect(f.buckets.map((b) => b.lo)).toEqual([0, 0.45, 0.5, 0.95]);
    }
  });

  it("finds the band carrying the most weight", () => {
    const f = floatingStrike(BUCKETS, "gamma");
    expect(f.peak?.lo).toBe(0.5);
    expect(f.maxAbsMn).toBe(320);
  });

  it("totals the whole book under the chosen lens", () => {
    expect(floatingStrike(BUCKETS, "gamma").totalMn).toBe(10 - 200 + 320 - 15);
  });

  it("orders buckets by delta whatever order they arrive in", () => {
    const shuffled = [...BUCKETS].reverse();
    expect(floatingStrike(shuffled, "gamma").buckets.map((b) => b.lo)).toEqual(
      [0, 0.45, 0.5, 0.95],
    );
  });

  it("normalises negative zero at the source", () => {
    // −0 formats as "−0.0", which reads as a small short position rather than none.
    const f = floatingStrike([{ lo: 0.5, hi: 0.55, gamma_net: 0 }], "gamma");
    expect(Object.is(f.buckets[0].hedgeMn, -0)).toBe(false);
    expect(f.buckets[0].hedgeMn).toBe(0);
  });

  it("skips buckets with no value for the chosen lens rather than reading them as zero", () => {
    const f = floatingStrike(
      [{ lo: 0.5, hi: 0.55, gamma_net: 100 }, { lo: 0.55, hi: 0.6, delta_net: 5 }],
      "gamma",
    );
    expect(f.buckets).toHaveLength(1);
  });

  it("is empty, not thrown, on absent or malformed input", () => {
    for (const bad of [null, undefined, [], [{}], [{ lo: 0.5 }]]) {
      const f = floatingStrike(bad as DeltaBucketRow[], "gamma");
      expect(f.buckets).toEqual([]);
      expect(f.peak).toBeNull();
    }
  });

  it("labels bands the way the wings are actually quoted", () => {
    expect(bucketLabel({ lo: 0.7, hi: 0.75 })).toBe("70–75Δ");
    expect(bucketLabel({ lo: 0, hi: 0.05 })).toBe("0–5Δ");
  });
});

// ─── Quad board ──────────────────────────────────────────────────────────────────────

function row(root: string, g: number, v: number, extra: Partial<QuadRow> = {}): QuadRow {
  return {
    root,
    gamma_pctile: g,
    vanna_pctile: v,
    quadrant: deriveQuadrant(g, v),
    n_days: 2400,
    ...extra,
  };
}

/** The real 2026-07-30 board, abridged — index complex low-gamma/high-vanna. */
const REAL: QuadPayload = {
  schema: "options_hub.quad/v1",
  asof: "2026-07-30",
  min_history_days: 250,
  skipped: ["GLD", "TLT"],
  rows: [
    row("IWM", 2.9, 98.4, { gamma_bn: -2.8963, vanna_bn: 1.2147, extreme: true }),
    row("SPY", 12.5, 99.6, { gamma_bn: -8.1023, vanna_bn: 6.178, extreme: true }),
    row("AAPL", 73.8, 67.5, { gamma_bn: 0.8765, vanna_bn: 0.289 }),
    row("MSFT", 99.6, 98.2, { gamma_bn: 1.9604, vanna_bn: 0.5423, extreme: true }),
  ],
};

describe("quadBoard", () => {
  it("keeps every valid row and sorts by the gamma axis", () => {
    const b = quadBoard(REAL);
    expect(b.rows.map((r) => r.root)).toEqual(["IWM", "SPY", "AAPL", "MSFT"]);
    expect(b.asof).toBe("2026-07-30");
    expect(b.minHistoryDays).toBe(250);
  });

  it("surfaces extremes most-extreme-first", () => {
    // On the real board SPY and MSFT tie on the furthest single axis (both 49.6 from
    // the middle). The tiebreak is total stretch, so MSFT — extreme on BOTH axes —
    // leads, and the order does not depend on publisher iteration order.
    const b = quadBoard(REAL);
    expect(b.extremes.map((r) => r.root)).toEqual(["MSFT", "SPY", "IWM"]);
  });

  it("ranks extremes deterministically whatever order they arrive in", () => {
    const fwd = quadBoard(REAL).extremes.map((r) => r.root);
    const rev = quadBoard({ ...REAL, rows: [...REAL.rows!].reverse() }).extremes.map((r) => r.root);
    expect(rev).toEqual(fwd);
  });

  it("counts the corners for the legend", () => {
    const b = quadBoard(REAL);
    expect(b.counts.amplify_volsens).toBe(2); // IWM, SPY
    expect(b.counts.dampen_volsens).toBe(2); // AAPL, MSFT
    expect(b.counts.amplify_stable).toBe(0);
  });

  it("shows which roots were dropped for thin history rather than omitting them", () => {
    expect(quadBoard(REAL).skipped).toEqual(["GLD", "TLT"]);
  });

  it("drops a row missing a coordinate instead of plotting it at a default", () => {
    // A point defaulted to (0,0) claims a root sits at BOTH historical floors — the
    // single most actionable corner on the chart, and entirely fabricated.
    const b = quadBoard({
      rows: [
        row("OK", 50, 50),
        { root: "NOG", vanna_pctile: 50, n_days: 300 } as unknown as QuadRow,
        { root: "NOV", gamma_pctile: 50, n_days: 300 } as unknown as QuadRow,
      ],
    });
    expect(b.rows.map((r) => r.root)).toEqual(["OK"]);
  });

  it("rejects a percentile outside 0..100", () => {
    const b = quadBoard({ rows: [row("BAD", 140, 50), row("NEG", 50, -3), row("OK", 50, 50)] });
    expect(b.rows.map((r) => r.root)).toEqual(["OK"]);
  });

  it("derives the quadrant when the payload omits it", () => {
    const b = quadBoard({
      rows: [{ root: "X", gamma_pctile: 10, vanna_pctile: 90, n_days: 300 } as QuadRow],
    });
    expect(b.rows[0].quadrant).toBe("amplify_volsens");
  });

  it("names the four hedging regimes, matching the publisher", () => {
    expect(deriveQuadrant(10, 10)).toBe("amplify_stable");
    expect(deriveQuadrant(10, 90)).toBe("amplify_volsens");
    expect(deriveQuadrant(90, 10)).toBe("dampen_stable");
    expect(deriveQuadrant(90, 90)).toBe("dampen_volsens");
    expect(deriveQuadrant(50, 50)).toBe("dampen_volsens");
  });

  it("is empty, not thrown, on absent input", () => {
    for (const bad of [null, undefined, {}, { rows: [] }, { rows: "nope" }]) {
      const b = quadBoard(bad as QuadPayload);
      expect(b.rows).toEqual([]);
      expect(b.extremes).toEqual([]);
    }
  });
});

// ─── The percentile window ───────────────────────────────────────────────────────────
//
// Measured defect, caught by looking at the first render: dealer exposure scales with
// the underlying (gamma with S², vanna and charm with S), so a nine-year rank partly
// measures how much the market GREW. The first build put 20 of 23 roots above the 85th
// vanna percentile and left two of the four corners empty. The publisher now ranks
// within a trailing year; the board must show the reader which window that was.

describe("percentile window disclosure", () => {
  it("carries the window through so the axis can be labelled", () => {
    const b = quadBoard({ ...REAL, pctile_window_days: 252 });
    expect(b.pctileWindowDays).toBe(252);
  });

  it("reports null rather than assuming a window the payload did not state", () => {
    expect(quadBoard(REAL).pctileWindowDays).toBeNull();
    expect(quadBoard({ rows: [] }).pctileWindowDays).toBeNull();
  });
});
