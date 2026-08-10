import { describe, expect, it } from "vitest";
import {
  selectPutCallOiHistory,
  summarizePutCallOiHistory,
} from "@/lib/optionsPutCallHistory";

describe("selectPutCallOiHistory", () => {
  it("derives only put OI divided by call OI and sorts by source date", () => {
    const points = selectPutCallOiHistory([
      { date: "2026-08-08", call_oi: 400, put_oi: 300 },
      { date: "2026-08-06", call_oi: 200, put_oi: 250 },
      { date: "2026-08-07", call_oi: 100, put_oi: 200 },
    ]);

    expect(points.map((point) => point.date)).toEqual([
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ]);
    expect(points.map((point) => point.ratio)).toEqual([1.25, 2, 0.75]);
  });

  it("keeps invalid denominators as gaps and never coerces them to zero", () => {
    const points = selectPutCallOiHistory([
      { date: "2026-08-03", call_oi: 100, put_oi: 80 },
      { date: "2026-08-04", call_oi: 0, put_oi: 90 },
      { date: "2026-08-05", call_oi: -10, put_oi: 100 },
      { date: "2026-08-06", call_oi: Number.NaN, put_oi: 110 },
      { date: "2026-08-07", call_oi: 120, put_oi: -1 },
      { date: "2026-08-08", call_oi: 100, put_oi: 130 },
    ]);

    expect(points.map((point) => point.ratio)).toEqual([0.8, null, null, null, null, 1.3]);
    expect(summarizePutCallOiHistory(points)).toMatchObject({
      validSessionCount: 2,
      low: 0.8,
      high: 1.3,
      latest: { date: "2026-08-08", ratio: 1.3 },
    });
  });

  it("rejects invalid dates and non-numeric contract values", () => {
    const points = selectPutCallOiHistory([
      null,
      { date: "2026-02-30", call_oi: 100, put_oi: 110 },
      { date: "not-a-date", call_oi: 100, put_oi: 110 },
      { date: "2026-08-01", call_oi: "100", put_oi: 110 },
      { date: "2026-08-02", call_oi: 100, put_oi: "110" },
    ]);

    expect(points).toHaveLength(2);
    expect(points.every((point) => point.ratio == null)).toBe(true);
    expect(summarizePutCallOiHistory(points)).toEqual({
      validSessionCount: 0,
      latest: null,
      low: null,
      high: null,
    });
  });

  it("uses the last source row for a repeated session date", () => {
    const points = selectPutCallOiHistory([
      { date: "2026-08-07", call_oi: 100, put_oi: 200 },
      { date: "2026-08-07T21:00:00Z", call_oi: 200, put_oi: 100 },
    ]);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ date: "2026-08-07", ratio: 0.5 });
  });
});
