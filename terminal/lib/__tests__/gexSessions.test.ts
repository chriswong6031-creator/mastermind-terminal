// Dated GEX-ladder replay (R0.10) — the data plane behind the Exposure desk's date picker.
//
// Same three silent-failure classes the surface-sessions suite locks, one plane over:
//   1. ROUTING. `gex_at:`/`gex_dates:` differ from the live `gex:` read by one character
//      (4th char `_` vs `:`). A mis-resolved key does not throw — it falls through the
//      backend to R2, misses, and returns null, rendering as an empty ladder
//      indistinguishable from "no data yet". Every form's backend path and R2 key is
//      asserted, and the near-miss pairs are asserted not to collide.
//   2. SESSION HONESTY in the fixture path. An archived read must serve the requested
//      date or nothing — never today's ladder wearing an archived label — and must refuse
//      a date the sessions index doesn't list: that is exactly what a prod accrual hole
//      (2026-07-18 / 07-20 style 404) resolves to, and the UI's missing-session state
//      hangs off it.
//   3. FALLBACK. Anything wrong with dates.json leaves the desk on live-only behaviour;
//      the dropdown is gated by isGexDates, so the validator must reject rather than
//      coerce.
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { isValidF, backendPath, r2Key, fixtureFor } from "@/lib/flowSource";
import { isGexDates, gexSessionOf } from "@/lib/gexSessions";

const DATES_FIXTURE = path.join(process.cwd(), "public", "data", "gex_dates_fixture.json");
const GEX_FIXTURE = path.join(process.cwd(), "public", "data", "gex_fixture.json");

const loadJson = async (p: string) =>
  JSON.parse(await fs.readFile(p, "utf8")) as Record<string, Record<string, unknown>>;

// The gex fixture's own live session, one archived date behind it, and the deliberate
// accrual hole (a history[] session the dates index does NOT list).
const LIVE_DATE = "2026-07-10";
const ARCHIVED_DATE = "2026-07-02";
const HOLE_DATE = "2026-07-07";

describe("f-param validation — dated gex reads", () => {
  it("accepts the two new forms", () => {
    expect(isValidF("gex_dates:SPY")).toBe(true);
    expect(isValidF(`gex_at:SPY:${ARCHIVED_DATE}`)).toBe(true);
  });

  it("still accepts the legacy live form (it remains the LIVE read)", () => {
    expect(isValidF("gex:SPY")).toBe(true);
  });

  it("rejects each new form with its parameters missing", () => {
    expect(isValidF("gex_dates:")).toBe(false);
    expect(isValidF("gex_at:")).toBe(false);
    expect(isValidF("gex_at:SPY")).toBe(false); // no date segment
  });

  it("rejects a dated form with too many segments", () => {
    expect(isValidF(`gex_at:SPY:${ARCHIVED_DATE}:extra`)).toBe(false);
  });
});

describe("routing — backend path", () => {
  it("maps every gex form to its own path", () => {
    expect(backendPath("gex_dates:SPY")).toBe("/api/hub/gex_history/SPY/dates");
    expect(backendPath(`gex_at:SPY:${ARCHIVED_DATE}`))
      .toBe(`/api/hub/gex_history/SPY/${ARCHIVED_DATE}`);
    expect(backendPath("gex:SPY")).toBe("/api/hub/gex/SPY");
  });
});

describe("routing — R2 keys", () => {
  it("matches the macro hub's key layout (WP-GEX-SNAPSHOTS)", () => {
    // options_hub/gex_history/{ROOT}/{DATE}.json — verified live on public R2
    // (SPY 2026-07-17 → 07-30) 2026-07-31; dates.json is the index the macro side adds.
    expect(r2Key("gex_dates:SPY")).toBe("options_hub/gex_history/SPY/dates.json");
    expect(r2Key(`gex_at:SPY:${ARCHIVED_DATE}`))
      .toBe(`options_hub/gex_history/SPY/${ARCHIVED_DATE}.json`);
  });

  it("leaves the legacy live key untouched", () => {
    expect(r2Key("gex:SPY")).toBe("options_hub/gex/SPY.json");
  });

  it("the near-miss prefixes never resolve to each other's key", () => {
    expect(r2Key(`gex_at:SPY:${ARCHIVED_DATE}`)).not.toBe(r2Key("gex:SPY"));
    expect(r2Key(`gex_at:SPY:${ARCHIVED_DATE}`)).toContain("/gex_history/");
    expect(r2Key("gex_dates:SPY")).toContain("/gex_history/");
    // And the dated family must never be eaten by the live `gex:` branch.
    expect(r2Key(`gex_at:SPY:${ARCHIVED_DATE}`)).not.toContain("options_hub/gex/");
  });
});

describe("sessions fixture — gex_dates", () => {
  it("satisfies the contract validator (the dropdown's gate)", async () => {
    const doc = await fixtureFor("gex_dates:SPY");
    expect(isGexDates(doc)).toBe(true);
  });

  it("lists the live session first and at least one date behind it", async () => {
    const doc = (await fixtureFor("gex_dates:SPY")) as { dates: string[]; latest: string };
    expect(doc.dates[0]).toBe(LIVE_DATE);
    expect(doc.latest).toBe(LIVE_DATE);
    expect(doc.dates).toContain(ARCHIVED_DATE);
    expect(doc.dates.length).toBeGreaterThan(1);
  });

  it("agrees with the gex fixture about which session is live", async () => {
    const gex = await loadJson(GEX_FIXTURE);
    expect(gexSessionOf(gex.SPY.asof)).toBe(LIVE_DATE);
  });

  it("models the accrual hole: a history[] session the index does not list", async () => {
    const gex = await loadJson(GEX_FIXTURE);
    const historyDates = (gex.SPY.history as { date: string }[]).map((h) => h.date);
    expect(historyDates).toContain(HOLE_DATE);
    const doc = (await fixtureFor("gex_dates:SPY")) as { dates: string[] };
    expect(doc.dates).not.toContain(HOLE_DATE);
  });

  it("an unknown root gets an empty list, not another root's sessions", async () => {
    const doc = (await fixtureFor("gex_dates:NOPE")) as { dates: string[]; latest: null };
    expect(doc.dates).toEqual([]);
    expect(doc.latest).toBeNull();
    // Still shaped like a sessions index, so the caller takes the "no sessions" branch
    // rather than the "malformed payload" one.
    expect(isGexDates(doc)).toBe(true);
  });

  it("the fixture file's own dates are sorted newest-first", async () => {
    const all = await loadJson(DATES_FIXTURE);
    const dates = all.SPY.dates as string[];
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("archived ladder — gex_at", () => {
  it("serves the requested session's date, not the fixture's own", async () => {
    const doc = (await fixtureFor(`gex_at:SPY:${ARCHIVED_DATE}`)) as {
      asof: string; by_strike: unknown[];
    };
    expect(gexSessionOf(doc.asof)).toBe(ARCHIVED_DATE);
    expect(doc.by_strike.length).toBeGreaterThan(0);
  });

  it("the archived ladder is the canonical ladder — re-dating must not corrupt data", async () => {
    const live = (await fixtureFor("gex:SPY")) as Record<string, unknown>;
    const archived = (await fixtureFor(`gex_at:SPY:${ARCHIVED_DATE}`)) as Record<string, unknown>;
    expect(archived.by_strike).toEqual(live.by_strike);
    expect(archived.by_expiry).toEqual(live.by_expiry);
    expect(archived.net_gex_bn).toEqual(live.net_gex_bn);
  });

  it("history[] is cut to sessions settled by the archived date (no future knowledge)", async () => {
    const archived = (await fixtureFor(`gex_at:SPY:${ARCHIVED_DATE}`)) as {
      history: { date: string }[];
    };
    expect(archived.history.length).toBeGreaterThan(0);
    for (const h of archived.history) expect(h.date <= ARCHIVED_DATE).toBe(true);
  });

  it("refuses a date the sessions index does not list — the accrual hole", async () => {
    // 2026-07-07 exists in the scalar history[] but was never published as a dated
    // snapshot — precisely the prod 07-18/07-20 hole class. {} is what a 404 resolves
    // to, and the UI's honest missing-session state hangs off it.
    const doc = await fixtureFor(`gex_at:SPY:${HOLE_DATE}`);
    expect(doc).toEqual({});
  });

  it("refuses a malformed date rather than coercing it", async () => {
    expect(await fixtureFor("gex_at:SPY:notadate")).toEqual({});
  });

  it("an unknown root returns an empty payload, never a fallback root's ladder", async () => {
    expect(await fixtureFor(`gex_at:NOPE:${ARCHIVED_DATE}`)).toEqual({});
  });

  it("leaves the live path untouched", async () => {
    const live = (await fixtureFor("gex:SPY")) as { asof: string; history: unknown[] };
    expect(gexSessionOf(live.asof)).toBe(LIVE_DATE);
    expect(live.history.length).toBe(6); // full scalar history, uncut
  });
});

describe("isGexDates — validator rejects rather than coerces", () => {
  it("rejects wrong-order, wrong-latest and non-date entries", () => {
    const base = { root: "SPY", dates: ["2026-07-10", "2026-07-02"], latest: "2026-07-10" };
    expect(isGexDates(base)).toBe(true);
    expect(isGexDates({ ...base, dates: ["2026-07-02", "2026-07-10"], latest: "2026-07-02" })).toBe(false);
    expect(isGexDates({ ...base, latest: "2026-07-02" })).toBe(false);
    expect(isGexDates({ ...base, dates: ["2026-07-10", "notadate"] })).toBe(false);
    expect(isGexDates({ ...base, root: undefined })).toBe(false);
    expect(isGexDates({ root: "SPY", dates: [], latest: null })).toBe(true);
    expect(isGexDates({ root: "SPY", dates: [], latest: "2026-07-10" })).toBe(false);
    expect(isGexDates(null)).toBe(false);
  });

  it("gexSessionOf handles both live shapes (bare date + full ISO)", () => {
    expect(gexSessionOf("2026-07-30")).toBe("2026-07-30"); // hub plane, verified live
    expect(gexSessionOf("2026-07-10T20:15:00Z")).toBe("2026-07-10"); // fixture vintage
    expect(gexSessionOf("")).toBeNull();
    expect(gexSessionOf(null)).toBeNull();
  });
});
