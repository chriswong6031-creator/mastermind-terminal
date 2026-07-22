import { describe, it, expect } from "vitest";
import { crossUps, crossDowns, crossUpsBelow, crossDownsAbove } from "../crossSignals";

// Index of every true in a boolean[] — makes the assertions read as "signal at bar N".
const hits = (arr: boolean[]) => arr.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

describe("crossUps / crossDowns — basic", () => {
  it("flags the bar where a rises above b", () => {
    //        0   1   2   3
    const a = [1, 1, 2, 3];
    const b = [2, 2, 1, 1];
    // i=2: prev 1<=2, now 2>1 → cross up at 2
    expect(hits(crossUps(a, b))).toEqual([2]);
    expect(hits(crossDowns(a, b))).toEqual([]);
  });

  it("flags the bar where a falls below b", () => {
    const a = [3, 3, 1, 0];
    const b = [1, 1, 2, 2];
    // i=2: prev 3>=1, now 1<2 → cross down at 2
    expect(hits(crossDowns(a, b))).toEqual([2]);
    expect(hits(crossUps(a, b))).toEqual([]);
  });

  it("index 0 never fires (no previous bar)", () => {
    expect(crossUps([5, 6], [1, 2])[0]).toBe(false);
    expect(crossDowns([1, 0], [5, 6])[0]).toBe(false);
  });
});

describe("equal-boundary (touch then break counts)", () => {
  it("prev equal then above → crossUp", () => {
    const a = [1, 2, 3]; // i=1: prev a0=1 == b0=1 (<=), now 2>1
    const b = [1, 1, 1];
    expect(hits(crossUps(a, b))).toEqual([1]);
  });

  it("prev equal then below → crossDown", () => {
    const a = [1, 0, -1]; // i=1: prev a0=1 == b0=1 (>=), now 0<1
    const b = [1, 1, 1];
    expect(hits(crossDowns(a, b))).toEqual([1]);
  });

  it("becoming equal is NOT a cross (needs strict > / <)", () => {
    const a = [0, 1]; // now a==b, not a>b
    const b = [1, 1];
    expect(hits(crossUps(a, b))).toEqual([]);
    const c = [2, 1]; // now a==b, not a<b
    const d = [1, 1];
    expect(hits(crossDowns(c, d))).toEqual([]);
  });
});

describe("null / NaN gaps suppress signals", () => {
  it("null on either side of either series → no cross", () => {
    // a would cross up at i=2, but b0 is null → suppressed
    expect(hits(crossUps([1, 1, 2], [2, null, 1]))).toEqual([]);
    // current value null → suppressed
    expect(hits(crossUps([1, 1, null], [2, 2, 1]))).toEqual([]);
    // NaN treated like null
    expect(hits(crossUps([1, 1, NaN], [2, 2, 1]))).toEqual([]);
    // undefined (ragged array) treated like null
    expect(hits(crossDowns([3, undefined, 1], [1, 1, 2]))).toEqual([]);
  });

  it("a valid cross AFTER a gap still fires", () => {
    //        0     1  2  3
    const a = [null, 1, 1, 3];
    const b = [null, 2, 2, 1];
    // i=1 has null prev → skip; i=3: prev 1<=2, now 3>1 → fire
    expect(hits(crossUps(a, b))).toEqual([3]);
  });
});

describe("threshold gating — both sides", () => {
  const k = [10, 10, 30, 60, 60, 90, 85]; // %K
  const d = [20, 20, 20, 20, 70, 70, 90]; // %D
  // raw crossUps: i=2 (10<=20 → 30>20). i=? none else.
  // raw crossDowns: i=4 (60>=20 → 60<70). i=6 (90>=90 → 85<90).

  it("crossUpsBelow gates on a[i] < below", () => {
    // cross up at i=2 with k=30. below=20 → 30<20 false → gated out.
    expect(hits(crossUpsBelow(k, d, 20))).toEqual([]);
    // below=50 → 30<50 true → kept.
    expect(hits(crossUpsBelow(k, d, 50))).toEqual([2]);
  });

  it("crossDownsAbove gates on a[i] > above", () => {
    // cross downs at i=4 (k=60) and i=6 (k=85). above=80 → 60>80 false, 85>80 true.
    expect(hits(crossDownsAbove(k, d, 80))).toEqual([6]);
    // above=50 → both kept.
    expect(hits(crossDownsAbove(k, d, 50))).toEqual([4, 6]);
  });

  it("gated variants still respect null gaps", () => {
    const kk = [10, 10, null, 60];
    const dd = [20, 20, 20, 20];
    expect(hits(crossUpsBelow(kk, dd, 50))).toEqual([]);
  });
});

describe("no-signal flat / parallel arrays", () => {
  it("identical arrays never cross", () => {
    const a = [1, 2, 3, 4];
    expect(hits(crossUps(a, a.slice()))).toEqual([]);
    expect(hits(crossDowns(a, a.slice()))).toEqual([]);
  });

  it("constant separation never crosses", () => {
    const a = [1, 2, 3, 4];
    const b = [5, 6, 7, 8]; // a always below b
    expect(hits(crossUps(a, b))).toEqual([]);
    expect(hits(crossDowns(a, b))).toEqual([]);
  });

  it("empty and single-element inputs are safe", () => {
    expect(crossUps([], [])).toEqual([]);
    expect(crossDowns([5], [1])).toEqual([false]);
    expect(crossUpsBelow([], [], 20)).toEqual([]);
  });

  it("length mismatch iterates the shorter overlap without throwing", () => {
    const a = [1, 1, 2, 3, 4];
    const b = [2, 2, 1]; // shorter
    // only indices 1,2 comparable; cross up at i=2
    expect(hits(crossUps(a, b))).toEqual([2]);
  });
});
