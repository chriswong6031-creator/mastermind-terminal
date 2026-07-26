// Multi-day surface replay (OEU T-B) — the data plane behind the session picker.
//
// Three things are locked here, all of them silent-failure classes:
//   1. ROUTING. The store now has six f-forms whose prefixes differ by a single character
//      (`surface:` / `surface_at:`, `surface_idx:` / `surface_idx_at:`). A mis-resolved key
//      does not throw — it falls through the backend to R2, misses, and returns null, which
//      renders as an empty field indistinguishable from "no data yet". So every form's
//      backend path and R2 key is asserted, and the near-miss pairs are asserted not to
//      collide with each other.
//   2. SESSION HONESTY in the fixture path. An archived read must serve the requested date
//      or nothing — never today's session wearing another day's label — and must refuse any
//      date the sessions index doesn't list, because R2 retention would have pruned it.
//   3. FALLBACK. Anything wrong with dates.json leaves the Terminal on today-only behaviour;
//      the picker is driven by isSurfaceDates, so that validator has to reject rather than
//      coerce.
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { isValidF, backendPath, r2Key, fixtureFor } from "@/lib/flowSource";
import { isSurfaceDates, isSurfaceIndex, isSurfaceFrame } from "@/lib/surfaceContract";

const DATES_FIXTURE = path.join(process.cwd(), "public", "data", "surface_dates_fixture.json");
const SURFACE_FIXTURE = path.join(process.cwd(), "public", "data", "surface_fixture.json");

const loadJson = async (p: string) =>
  JSON.parse(await fs.readFile(p, "utf8")) as Record<string, Record<string, unknown>>;

// The fixture's own live session, and the newest date behind it.
const LIVE_DATE = "2026-07-06";
const ARCHIVED_DATE = "2026-07-02";

describe("f-param validation — dated surface reads", () => {
  it("accepts the three new forms", () => {
    expect(isValidF("surface_dates:SPY")).toBe(true);
    expect(isValidF(`surface_idx_at:SPY:${ARCHIVED_DATE}`)).toBe(true);
    expect(isValidF(`surface_at:SPY:${ARCHIVED_DATE}:1030`)).toBe(true);
  });

  it("still accepts the legacy today-forms (they remain the LIVE read)", () => {
    expect(isValidF("surface_idx:SPY")).toBe(true);
    expect(isValidF("surface:SPY:1030")).toBe(true);
  });

  it("rejects each new form with its parameters missing", () => {
    expect(isValidF("surface_dates:")).toBe(false);
    expect(isValidF("surface_idx_at:")).toBe(false);
    expect(isValidF("surface_idx_at:SPY")).toBe(false); // no date segment
    expect(isValidF("surface_at:")).toBe(false);
    expect(isValidF(`surface_at:SPY:${ARCHIVED_DATE}`)).toBe(false); // no stamp segment
  });

  it("rejects a dated form with too many segments", () => {
    expect(isValidF(`surface_idx_at:SPY:${ARCHIVED_DATE}:1030`)).toBe(false);
    expect(isValidF(`surface_at:SPY:${ARCHIVED_DATE}:1030:extra`)).toBe(false);
  });
});

describe("routing — backend path", () => {
  it("maps every surface form to its own path", () => {
    expect(backendPath("surface_dates:SPY")).toBe("/api/flow/surface/SPY/dates");
    expect(backendPath(`surface_idx_at:SPY:${ARCHIVED_DATE}`))
      .toBe(`/api/flow/surface/SPY/${ARCHIVED_DATE}/idx`);
    expect(backendPath(`surface_at:SPY:${ARCHIVED_DATE}:1030`))
      .toBe(`/api/flow/surface/SPY/${ARCHIVED_DATE}/1030`);
    expect(backendPath("surface_idx:SPY")).toBe("/api/flow/surface/SPY/idx");
    expect(backendPath("surface:SPY:1030")).toBe("/api/flow/surface/SPY/1030");
  });
});

describe("routing — R2 keys", () => {
  it("matches the macro materializer's key layout", () => {
    // scripts/build_flow_surface.py R2_SURFACE_PREFIX + SURFACE_DATES_NAME.
    expect(r2Key("surface_dates:SPY")).toBe("live_flow/surface/SPY/dates.json");
    expect(r2Key(`surface_idx_at:SPY:${ARCHIVED_DATE}`))
      .toBe(`live_flow/surface/SPY/${ARCHIVED_DATE}/idx.json`);
    expect(r2Key(`surface_at:SPY:${ARCHIVED_DATE}:1030`))
      .toBe(`live_flow/surface/SPY/${ARCHIVED_DATE}/1030.json`);
  });

  it("leaves the legacy today-keys untouched", () => {
    expect(r2Key("surface_idx:SPY")).toBe("live_flow/surface/SPY/idx.json");
    expect(r2Key("surface:SPY:1030")).toBe("live_flow/surface/SPY/1030.json");
  });

  it("the near-miss prefixes never resolve to each other's key", () => {
    // `surface_idx_at:` must not be eaten by the `surface_idx:` branch, and `surface_at:`
    // must not be eaten by `surface:` — one wrong `startsWith` order and a dated read
    // silently serves today.
    expect(r2Key(`surface_idx_at:SPY:${ARCHIVED_DATE}`)).not.toBe(r2Key("surface_idx:SPY"));
    expect(r2Key(`surface_at:SPY:${ARCHIVED_DATE}:1030`)).not.toBe(r2Key("surface:SPY:1030"));
    expect(r2Key(`surface_idx_at:SPY:${ARCHIVED_DATE}`)).toContain(`/${ARCHIVED_DATE}/`);
    expect(r2Key(`surface_at:SPY:${ARCHIVED_DATE}:1030`)).toContain(`/${ARCHIVED_DATE}/`);
  });
});

describe("sessions fixture — surface_dates", () => {
  it("satisfies the contract validator (the picker's gate)", async () => {
    const doc = await fixtureFor("surface_dates:SPY");
    expect(isSurfaceDates(doc)).toBe(true);
  });

  it("lists the live session first and at least one date behind it", async () => {
    const doc = (await fixtureFor("surface_dates:SPY")) as { dates: string[]; latest: string };
    expect(doc.dates[0]).toBe(LIVE_DATE);
    expect(doc.latest).toBe(LIVE_DATE);
    expect(doc.dates).toContain(ARCHIVED_DATE);
    expect(doc.dates.length).toBeGreaterThan(1);
  });

  it("agrees with the surface fixture about which session is live", async () => {
    const surf = await loadJson(SURFACE_FIXTURE);
    expect(surf.SPY.session_date).toBe(LIVE_DATE);
  });

  it("an unknown root gets an empty list, not another root's sessions", async () => {
    const doc = (await fixtureFor("surface_dates:NOPE")) as { dates: string[]; latest: null };
    expect(doc.dates).toEqual([]);
    expect(doc.latest).toBeNull();
    // Still shaped like a sessions index, so the caller takes the "no sessions" branch
    // rather than the "malformed payload" one.
    expect(isSurfaceDates(doc)).toBe(true);
  });

  it("the fixture file's own dates are sorted newest-first", async () => {
    const all = await loadJson(DATES_FIXTURE);
    const dates = all.SPY.dates as string[];
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("archived index — surface_idx_at", () => {
  it("serves the requested session's date, not the fixture's own", async () => {
    const idx = (await fixtureFor(`surface_idx_at:SPY:${ARCHIVED_DATE}`)) as {
      date: string; stamps: string[]; asof: string;
    };
    expect(isSurfaceIndex(idx)).toBe(true);
    expect(idx.date).toBe(ARCHIVED_DATE);
    expect(idx.asof.slice(0, 10)).toBe(ARCHIVED_DATE);
    expect(idx.stamps.length).toBeGreaterThan(0);
  });

  it("a completed archived session carries the full stamp list", async () => {
    const today = (await fixtureFor("surface_idx:SPY")) as { stamps: string[] };
    const archived = (await fixtureFor(`surface_idx_at:SPY:${ARCHIVED_DATE}`)) as { stamps: string[] };
    expect(archived.stamps).toEqual(today.stamps);
  });

  it("refuses a date the sessions index does not list", async () => {
    // 2026-07-03 is deliberately absent (observed Independence Day holiday) — a session
    // R2 would never have retained must not materialise out of the fixture.
    const idx = (await fixtureFor("surface_idx_at:SPY:2026-07-03")) as { date: string; stamps: string[] };
    expect(idx.stamps).toEqual([]);
    expect(idx.date).toBe("");
  });

  it("refuses a malformed date rather than coercing it", async () => {
    const idx = (await fixtureFor("surface_idx_at:SPY:notadate")) as { stamps: string[] };
    expect(idx.stamps).toEqual([]);
  });

  it("leaves the today-path untouched", async () => {
    const idx = (await fixtureFor("surface_idx:SPY")) as { date: string };
    expect(idx.date).toBe(LIVE_DATE);
  });
});

describe("archived frame — surface_at", () => {
  it("truncates to the requested stamp and dates the frame to that session", async () => {
    const idx = (await fixtureFor(`surface_idx_at:SPY:${ARCHIVED_DATE}`)) as { stamps: string[] };
    const stamp = idx.stamps[9]; // the 10th frame of the day
    const frame = (await fixtureFor(`surface_at:SPY:${ARCHIVED_DATE}:${stamp}`)) as {
      time_steps: string[]; grids: Record<string, number[][]>; session_date: string; asof: string;
    };
    expect(isSurfaceFrame(frame)).toBe(true);
    expect(frame.time_steps.length).toBe(10);
    expect(frame.session_date).toBe(ARCHIVED_DATE);
    expect(frame.asof.slice(0, 10)).toBe(ARCHIVED_DATE);
    // Every metric row is cut to the same realized window — a ragged grid would paint
    // columns the session hadn't reached.
    for (const grid of Object.values(frame.grids)) {
      for (const row of grid) expect(row.length).toBe(10);
    }
  });

  it("the archived frame's field matches the same stamp on the today-path", async () => {
    // Same session content, different label: the fixture serves one canonical day under
    // every retained date, so a divergence here would mean the re-dating corrupted data.
    const stamp = "1030";
    const today = (await fixtureFor(`surface:SPY:${stamp}`)) as { grids: Record<string, number[][]> };
    const archived = (await fixtureFor(`surface_at:SPY:${ARCHIVED_DATE}:${stamp}`)) as {
      grids: Record<string, number[][]>;
    };
    expect(archived.grids).toEqual(today.grids);
  });

  it("refuses a date the sessions index does not list", async () => {
    const frame = (await fixtureFor("surface_at:SPY:2026-07-03:1030")) as {
      time_steps: string[]; price_levels: number[];
    };
    expect(frame.time_steps).toEqual([]);
    expect(frame.price_levels).toEqual([]);
  });

  it("an unknown root returns an empty frame, never a fallback root's field", async () => {
    const frame = (await fixtureFor(`surface_at:NOPE:${ARCHIVED_DATE}:1030`)) as {
      time_steps: string[]; grids: Record<string, number[][]>;
    };
    expect(frame.time_steps).toEqual([]);
    expect(frame.grids).toEqual({});
  });
});
