import { describe, expect, it } from "vitest";
import { buildMatrixGrid } from "@/components/shared/StrikeExpiryMatrix";
import {
  MATRIX_DOC_SCHEMA,
  isMatrixDocForRoot,
  type MatrixDoc,
  type MatrixDocCell,
} from "@/components/gexdesk/matrixDoc";
import { buildMatrixUnusualRail } from "@/components/gexdesk/matrixUnusual";
import { fixtureFor } from "@/lib/flowSource";

const side = (
  ratio: number,
  status: "normal" | "unusual",
  overrides: Record<string, unknown> = {}
) => ({ ratio, median_vol_30d: 100, samples: 20, status, ...overrides });

const cell = (overrides: Record<string, unknown> = {}): MatrixDocCell => ({
  strike: 100,
  expiry: "2026-01-16",
  gex: 1,
  call_vol: 300,
  put_vol: 200,
  ...overrides,
} as MatrixDocCell);

const doc = (cells: unknown[]): MatrixDoc => ({
  schema: MATRIX_DOC_SCHEMA,
  root: "SPY",
  cells: cells as MatrixDocCell[],
});

describe("matrix envelope guard", () => {
  it("accepts only the expected schema, requested root, and cells array", () => {
    const valid = doc([cell()]);
    expect(isMatrixDocForRoot(valid, "spy")).toBe(true);
    expect(isMatrixDocForRoot({ ...valid, schema: "options_structure.matrix/v2" }, "SPY")).toBe(false);
    expect(isMatrixDocForRoot({ ...valid, root: "QQQ" }, "SPY")).toBe(false);
    expect(isMatrixDocForRoot({ ...valid, cells: {} }, "SPY")).toBe(false);
    expect(isMatrixDocForRoot(null, "SPY")).toBe(false);
  });
});

describe("exact-side unusual-volume rail", () => {
  it("pins the canonical 3x boundary without rounding a normal receipt into it", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(3, "unusual"), put: side(2.99, "normal") } }),
    ]));
    expect(model.state).toBe("flagged");
    expect(model.observedSides).toBe(2);
    expect(model.flags).toEqual([
      expect.objectContaining({
        strike: 100,
        expiry: "2026-01-16",
        sides: {
          call: expect.objectContaining({ availability: "eligible", status: "unusual", ratio: 3 }),
          put: expect.objectContaining({ availability: "eligible", status: "normal", ratio: 2.99 }),
        },
      }),
    ]);
  });

  it("withholds non-canonical ratio precision instead of displaying 3.00x NORMAL", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(2.999, "normal"), put: null } }),
    ]));
    expect(model).toMatchObject({
      state: "malformed",
      flags: [],
      observedSides: 0,
      malformedSides: 1,
    });
  });

  it("treats a published zero as eligible, while a missing side stays missing", () => {
    const zero = buildMatrixUnusualRail(doc([
      cell({ call_vol: 0, put_vol: undefined, unusual: { call: side(0, "normal"), put: null } }),
    ]));
    expect(zero).toMatchObject({ state: "clear", observedSides: 1, malformedSides: 0, flags: [] });

    const missingVolume = buildMatrixUnusualRail(doc([
      cell({ call_vol: undefined, unusual: { call: side(3.1, "unusual"), put: null } }),
    ]));
    expect(missingVolume).toMatchObject({ state: "malformed", observedSides: 0, malformedSides: 1, flags: [] });
  });

  it("keeps call and put eligibility independent", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({
        strike: 101,
        unusual: { call: side(1.5, "normal"), put: side(4.2, "unusual") },
      }),
      cell({
        strike: 100,
        unusual: { call: side(3.5, "unusual"), put: side(2, "normal") },
      }),
    ]));
    expect(model.observedSides).toBe(4);
    // Stable exact identity order, not descending ratio authority.
    expect(model.flags.map((f) => [
      f.strike,
      f.sides.call.availability === "eligible" ? f.sides.call.status : f.sides.call.availability,
      f.sides.put.availability === "eligible" ? f.sides.put.status : f.sides.put.availability,
    ])).toEqual([
      [100, "unusual", "normal"],
      [101, "normal", "unusual"],
    ]);

    const both = buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(3.1, "unusual"), put: side(3.2, "unusual") } }),
    ]));
    expect(both.flags).toHaveLength(1);
    expect(both.flags[0]?.sides).toEqual({
      call: expect.objectContaining({ availability: "eligible", status: "unusual", ratio: 3.1 }),
      put: expect.objectContaining({ availability: "eligible", status: "unusual", ratio: 3.2 }),
    });
  });

  it("orders flagged contracts by expiry then strike, never by ratio or input order", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({ strike: 90, expiry: "2026-02-20", unusual: { call: side(9, "unusual"), put: null } }),
      cell({ strike: 101, unusual: { call: side(8, "unusual"), put: null } }),
      cell({ strike: 100, unusual: { call: side(3, "unusual"), put: null } }),
    ]));
    expect(model.flags.map((f) => `${f.expiry}|${f.strike}`)).toEqual([
      "2026-01-16|100",
      "2026-01-16|101",
      "2026-02-20|90",
    ]);
  });

  it("keeps a valid flagged side while explicitly withholding its malformed sibling", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({
        unusual: {
          call: side(3.25, "unusual"),
          put: side(2, "normal", { samples: 31 }),
        },
      }),
    ]));
    expect(model).toMatchObject({ state: "flagged", observedSides: 1, malformedSides: 1 });
    expect(model.flags[0]?.sides).toEqual({
      call: expect.objectContaining({ availability: "eligible", status: "unusual", ratio: 3.25 }),
      put: { availability: "withheld" },
    });
  });

  it("refuses a clear claim when a normal side has an unreadable sibling", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({
        unusual: {
          call: side(2.5, "normal"),
          put: side(2, "normal", { samples: 31 }),
        },
      }),
    ]));
    expect(model).toMatchObject({
      state: "malformed",
      flags: [],
      observedSides: 1,
      malformedSides: 1,
    });
  });

  it("withholds malformed annotations instead of coercing them", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(Number.NaN, "unusual"), put: null } }),
      cell({ strike: 101, unusual: { call: side(3.1, "unusual", { median_vol_30d: 0 }), put: null } }),
      cell({ strike: 102, unusual: { call: side(3.1, "unusual", { samples: 9 }), put: null } }),
      cell({ strike: 103, unusual: { call: side(3.1, "unusual", { samples: 31 }), put: null } }),
      cell({ strike: 104, unusual: { call: side(3.1, "normal"), put: null } }),
      cell({ strike: 105, unusual: { call: { ...side(3.1, "unusual"), status: "hot" }, put: null } }),
      cell({ strike: 106, expiry: "2026-02-30", unusual: { call: side(3.1, "unusual"), put: null } }),
      cell({ strike: 107, call_vol: 3.5, unusual: { call: side(3.1, "unusual"), put: null } }),
      cell({ strike: 108, unusual: { call: null, put: null } }),
      cell({ strike: 109, unusual: { call: side(3.1, "unusual") } }),
    ]));
    expect(model).toMatchObject({ state: "malformed", observedSides: 0, malformedSides: 10, flags: [] });
  });

  it("does not collapse two exact contracts when the heatmap buckets their strikes together", () => {
    const cells = [
      cell({ strike: 90, call_vol: 1, unusual: null }),
      cell({ strike: 100, call_vol: 300, unusual: { call: side(3, "unusual"), put: null } }),
      cell({ strike: 101, call_vol: 400, unusual: { call: side(4, "unusual"), put: null } }),
      cell({ strike: 110, call_vol: 1, unusual: null }),
    ];
    const matrix = { ...doc(cells), spot: 100 };
    const heatmap = buildMatrixGrid({
      matrix,
      metric: "vol",
      spot: 100,
      windowPct: 20,
      maxRows: 5,
      maxCols: 1,
    })!;
    expect(heatmap.bucket).toBe(5);
    expect(heatmap.byKey.get("100|2026-01-16")?.call_vol).toBe(700);

    const exact = buildMatrixUnusualRail(matrix);
    expect(exact.flags.map((f) => f.strike)).toEqual([100, 101]);
    expect(exact.flags.every((f) =>
      f.sides.call.availability === "eligible" && f.sides.call.status === "unusual"
    )).toBe(true);
  });

  it("distinguishes unavailable, insufficient, clear, flagged, and malformed", () => {
    expect(buildMatrixUnusualRail(doc([cell()])).state).toBe("unavailable");
    expect(buildMatrixUnusualRail(doc([cell({ unusual: null })])).state).toBe("insufficient");
    expect(buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(2.5, "normal"), put: null } }),
    ])).state).toBe("clear");
    expect(buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(3, "unusual"), put: null } }),
    ])).state).toBe("flagged");
    expect(buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(2.9, "unusual"), put: null } }),
    ])).state).toBe("malformed");
  });

  it("quarantines a duplicate exact identity without retaining a first-wins flag", () => {
    const model = buildMatrixUnusualRail(doc([
      cell({ unusual: { call: side(3, "unusual"), put: null } }),
      cell({ unusual: { call: side(4, "unusual"), put: null } }),
    ]));
    expect(model.flags).toHaveLength(0);
    expect(model.observedSides).toBe(0);
    expect(model.malformedSides).toBe(2);

    const earlierMissing = buildMatrixUnusualRail(doc([
      cell({ unusual: null }),
      cell({ unusual: { call: side(4, "unusual"), put: null } }),
    ]));
    expect(earlierMissing).toMatchObject({
      state: "malformed",
      flags: [],
      observedSides: 0,
      malformedSides: 1,
    });
  });
});

describe("responsive fixture seam", () => {
  it("serves flagged, clear, and insufficient roots without changing the matrix schema", async () => {
    const spy = await fixtureFor("matrix:SPY") as MatrixDoc;
    const qqq = await fixtureFor("matrix:QQQ") as MatrixDoc;
    const iwm = await fixtureFor("matrix:IWM") as MatrixDoc;
    expect([spy.schema, qqq.schema, iwm.schema]).toEqual([
      MATRIX_DOC_SCHEMA,
      MATRIX_DOC_SCHEMA,
      MATRIX_DOC_SCHEMA,
    ]);
    const spyModel = buildMatrixUnusualRail(spy);
    expect(spyModel.state).toBe("flagged");
    expect(spyModel.flags.map((f) => f.strike)).toEqual([749, 750, 751]);
    expect(spyModel.flags.map((f) => [
      f.sides.call.availability === "eligible" ? f.sides.call.status : f.sides.call.availability,
      f.sides.put.availability === "eligible" ? f.sides.put.status : f.sides.put.availability,
    ])).toEqual([
      ["unusual", "normal"],
      ["normal", "unusual"],
      ["unusual", "unavailable"],
    ]);
    expect(buildMatrixUnusualRail(qqq).state).toBe("clear");
    expect(buildMatrixUnusualRail(iwm).state).toBe("insufficient");
  });
});
