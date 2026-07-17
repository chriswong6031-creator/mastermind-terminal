import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { makeNearestBarIndex } from "../barSnap";

// ── reference implementation: the OLD ChartPanel near() linear scan, verbatim semantics ──
// (first strictly-smaller distance wins → earlier bar on ties; 9e8ms tolerance; NaN never matches)
function nearLinear(times: ReadonlyArray<string | number>, iso: string): string | number | null {
  let b: string | number | null = null, bd = 1e18;
  const x = new Date(iso + "T00:00:00Z").getTime();
  times.forEach((y) => {
    const dd = Math.abs(new Date(String(y) + "T00:00:00Z").getTime() - x);
    if (dd < bd) { bd = dd; b = y; }
  });
  return bd < 9e8 ? b : null;
}

const snapNew = (times: ReadonlyArray<string | number>, iso: string): string | number | null => {
  const i = makeNearestBarIndex(times)(iso);
  return i >= 0 ? times[i] : null;
};

// ── real data: AAPL daily bars + slice signals (checked-in fixtures) ──
const DATA = join(process.cwd(), "public", "data");
const aaplDates: string[] = (JSON.parse(readFileSync(join(DATA, "AAPL.json"), "utf8")).bars as unknown[][])
  .map((b) => String(b[0]));
const aaplSigTs: string[] = (JSON.parse(readFileSync(join(DATA, "AAPL.slice.json"), "utf8"))
  .indicator.signals as { ts: string }[]).map((s) => s.ts.slice(0, 10));

// weekly bar times exactly as ChartPanel.resampleTf produces them for tf="W":
// ISO-week buckets, each bucket keeps the LAST daily date it saw.
function weeklyTimes(dates: string[]): string[] {
  const isoWeek = (d: string) => { const dt = new Date(d + "T00:00:00Z"); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };
  const out: string[] = []; let key: string | null = null;
  for (const d of dates) { const k = isoWeek(d); if (k !== key) { out.push(d); key = k; } else out[out.length - 1] = d; }
  return out;
}

describe("makeNearestBarIndex — parity with the old linear near()", () => {
  it("matches on AAPL weekly for every real slice signal (the resolveSigMarks hot path)", () => {
    const wk = weeklyTimes(aaplDates);
    expect(wk.length).toBeGreaterThan(200);
    for (const ts of aaplSigTs) {
      expect(snapNew(wk, ts), `signal ${ts}`).toBe(nearLinear(wk, ts));
    }
  });

  it("matches on AAPL daily + weekly for a dense synthetic date sweep (incl. out-of-range)", () => {
    const wk = weeklyTimes(aaplDates);
    const first = Date.parse(aaplDates[0] + "T00:00:00Z");
    const last = Date.parse(aaplDates[aaplDates.length - 1] + "T00:00:00Z");
    for (let t = first - 30 * 86400_000; t <= last + 30 * 86400_000; t += 3 * 86400_000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      expect(snapNew(aaplDates, iso), `daily ${iso}`).toBe(nearLinear(aaplDates, iso));
      expect(snapNew(wk, iso), `weekly ${iso}`).toBe(nearLinear(wk, iso));
    }
  });

  it("keeps the EARLIER bar on an exact distance tie (the old scan's strict <)", () => {
    const times = ["2026-01-05", "2026-01-13"]; // query 01-09 is 4d from each
    expect(nearLinear(times, "2026-01-09")).toBe("2026-01-05");
    expect(snapNew(times, "2026-01-09")).toBe("2026-01-05");
  });

  it("honors the 9e8ms (~10.4d) snap tolerance on both sides", () => {
    const times = ["2026-01-01"];
    expect(snapNew(times, "2026-01-11")).toBe("2026-01-01");  // 10d — inside
    expect(snapNew(times, "2026-01-12")).toBe(null);          // 11d — outside
    expect(snapNew(times, "2025-12-22")).toBe("2026-01-01");  // 10d before — inside
    expect(snapNew(times, "2025-12-21")).toBe(null);          // 11d before — outside
    expect(nearLinear(times, "2026-01-12")).toBe(null);       // reference agrees
  });

  it("resolves nothing on intraday (numeric epoch-second) bar sets, like the old scan", () => {
    const intraday = [1751234400, 1751235300, 1751236200];
    expect(snapNew(intraday, "2026-06-30")).toBe(null);
    expect(nearLinear(intraday, "2026-06-30")).toBe(null);
  });

  it("handles empty sets and unparseable queries", () => {
    expect(snapNew([], "2026-01-01")).toBe(null);
    expect(snapNew(["2026-01-01"], "not-a-date")).toBe(null);
  });
});
