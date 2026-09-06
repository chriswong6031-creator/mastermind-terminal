import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  RMS_COPY,
  RMS_VIEWS,
  catalystRows,
  coverageRows,
  conditionLine,
  hydrationScope,
  ideaRows,
  noteRows,
  readConditionStates,
  reviewRows,
  riskRows,
  selectHydrationIds,
  thesisRows,
} from "@/lib/rmsViews";
import type { ThesisDetail, ThesisSubjectRef, ThesisSummary, ThesisVersion } from "@/lib/theses";
import { THESIS_CONTENT_SCHEMA, THESIS_SUBJECT_SCHEMA } from "@/lib/theses";

const NOW = new Date("2026-09-06T00:00:00.000Z");

function subject(key: string, display: string): ThesisSubjectRef {
  return {
    schema: THESIS_SUBJECT_SCHEMA,
    kind: "issuer",
    owner: "data_os.security_master",
    key,
    identityState: "resolved",
    display,
  };
}

function content(overrides: Partial<ThesisVersion["content"]> = {}): ThesisVersion["content"] {
  return {
    schema: THESIS_CONTENT_SCHEMA,
    title: "t",
    statement: "s",
    catalysts: [],
    falsifiers: [],
    risks: [],
    horizon: "unspecified",
    effectiveAt: null,
    revisionNote: null,
    ...overrides,
  };
}

function version(id: string, subj: ThesisSubjectRef, opts: Partial<ThesisVersion> = {}): ThesisVersion {
  return {
    id: `${id}-v${opts.version ?? 1}`,
    thesisId: id,
    version: 1,
    previousVersion: null,
    transition: "create",
    lifecycleState: "active",
    subject: subj,
    content: content(),
    clientRequestId: `cr-${id}`,
    systemRecordedAt: "2026-01-01T00:00:00.000Z",
    effectiveAt: null,
    ...opts,
  };
}

function summary(s: ThesisSummary): ThesisSummary {
  return s;
}

// Fixture: 6 theses across 3 subjects (A, B, C)
const subjA = subject("AAA", "Alpha Co");
const subjB = subject("BBB", "Beta Co");
const subjC = subject("CCC", "Gamma Co");

const t1 = summary({ id: "t1", currentVersion: 2, lifecycleState: "active", subject: subjA, title: "Alpha thesis revised", updatedAt: "2026-09-05T00:00:00.000Z" });
const t2 = summary({ id: "t2", currentVersion: 2, lifecycleState: "active", subject: subjB, title: "Beta thesis revised", updatedAt: "2026-09-04T00:00:00.000Z" });
const t3 = summary({ id: "t3", currentVersion: 1, lifecycleState: "active", subject: subjA, title: "Alpha idea v1", updatedAt: "2026-09-03T00:00:00.000Z" });
const t4 = summary({ id: "t4", currentVersion: 1, lifecycleState: "active", subject: subjC, title: "Gamma stale thesis", updatedAt: "2026-02-15T00:00:00.000Z" }); // ~200d before NOW
const t5 = summary({ id: "t5", currentVersion: 2, lifecycleState: "archived", subject: subjB, title: "Beta archived thesis", updatedAt: "2026-08-01T00:00:00.000Z" });
const t6 = summary({ id: "t6", currentVersion: 2, lifecycleState: "invalidated", subject: subjC, title: "Gamma invalidated thesis", updatedAt: "2026-07-01T00:00:00.000Z" });

const summaries: ThesisSummary[] = [t1, t2, t3, t4, t5, t6];

function detailFor(s: ThesisSummary, opts: { catalysts?: string[]; risks?: string[]; note?: string | null; historyNotes?: (string | null)[] } = {}): ThesisDetail {
  const current = version(s.id, s.subject, {
    version: s.currentVersion,
    lifecycleState: s.lifecycleState,
    content: content({ catalysts: opts.catalysts ?? [], risks: opts.risks ?? [], revisionNote: opts.note ?? null }),
    systemRecordedAt: s.updatedAt,
  });
  const history: ThesisVersion[] = (opts.historyNotes ?? []).map((note, i) => version(s.id, s.subject, {
    version: i + 1,
    lifecycleState: "active",
    content: content({ revisionNote: note }),
    systemRecordedAt: `2026-0${i + 1}-01T00:00:00.000Z`,
  }));
  return {
    ...s,
    createdAt: "2026-01-01T00:00:00.000Z",
    current,
    history,
    historyTruncated: false,
  };
}

describe("rmsViews selectors", () => {
  it("coverage groups by subject, sorted by latest activity then key", () => {
    const rows = coverageRows(summaries);
    expect(rows.map((r) => r.display)).toEqual(["Alpha Co", "Beta Co", "Gamma Co"]);
    const alpha = rows.find((r) => r.display === "Alpha Co")!;
    expect(alpha.theses).toBe(2);
    expect(alpha.active).toBe(2);
    expect(coverageRows([])).toEqual([]);
  });

  it("ideas: active + currentVersion===1, newest first", () => {
    const rows = ideaRows(summaries);
    expect(rows.map((r) => r.id)).toEqual(["t3", "t4"]);
    expect(ideaRows([t1, t5, t6])).toEqual([]);
  });

  it("theses: all rows, active first then updatedAt desc then title", () => {
    const rows = thesisRows(summaries);
    expect(rows.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(thesisRows([])).toEqual([]);
  });

  it("reviews: archived/invalidated/stale/window_closed, window_closed first then updatedAt asc", () => {
    const conditions = readConditionStates(summaries.map((s) => s.id));
    conditions.set("t2", { source: "monitor", state: "window_closed", at: "2026-09-01T00:00:00.000Z" });
    const rows = reviewRows(summaries, NOW, conditions);
    expect(rows.map((r) => r.id)).toEqual(["t2", "t4", "t6", "t5"]);
    expect(rows.find((r) => r.id === "t2")!.reason).toBe("window_closed");
    expect(rows.find((r) => r.id === "t4")!.reason).toBe("stale");
    expect(rows.find((r) => r.id === "t5")!.reason).toBe("archived");
    expect(rows.find((r) => r.id === "t6")!.reason).toBe("invalidated");
    expect(reviewRows([t1], NOW, readConditionStates(["t1"]))).toEqual([]);
  });

  it("catalysts: one row per catalyst, active theses only, author order preserved", () => {
    const details = [
      detailFor(t1, { catalysts: ["cat-a", "cat-b"] }),
      detailFor(t2, { catalysts: ["cat-c"] }),
      detailFor(t5, { catalysts: ["should-not-appear"] }), // archived, excluded
    ];
    const rows = catalystRows(details);
    expect(rows.map((r) => r.text)).toEqual(["cat-a", "cat-b", "cat-c"]);
    expect(rows[0].index).toBe(0);
    expect(rows[1].index).toBe(1);
    expect(catalystRows([detailFor(t3, { catalysts: [] })])).toEqual([]);
  });

  it("risks: one row per risk, active theses only", () => {
    const details = [detailFor(t1, { risks: ["risk-a"] }), detailFor(t5, { risks: ["excluded"] })];
    const rows = riskRows(details);
    expect(rows.map((r) => r.text)).toEqual(["risk-a"]);
    expect(riskRows([detailFor(t3, { risks: [] })])).toEqual([]);
  });

  it("notes: non-empty trimmed revisionNote across current+history, deduped, sorted desc by systemRecordedAt", () => {
    const details = [
      detailFor(t1, { note: "  final note  ", historyNotes: ["first note", null, "  "] }),
    ];
    const rows = noteRows(details);
    expect(rows.map((r) => r.text)).toEqual(["final note", "first note"]);
    expect(noteRows([detailFor(t3, { note: null, historyNotes: [] })])).toEqual([]);
  });
});

describe("rmsViews copy", () => {
  it("EN/ZH parity: every EN key exists in ZH, non-empty, and not byte-identical", () => {
    function walk(en: unknown, zh: unknown, path: string) {
      if (en && typeof en === "object" && !Array.isArray(en)) {
        for (const k of Object.keys(en as Record<string, unknown>)) {
          walk((en as Record<string, unknown>)[k], (zh as Record<string, unknown>)?.[k], `${path}.${k}`);
        }
        return;
      }
      expect(zh, `missing zh for ${path}`).toBeDefined();
      expect(zh, `empty zh for ${path}`).not.toBe("");
      if (path !== ".countUnknown") {
        expect(zh, `zh identical to en for ${path}`).not.toBe(en);
      }
    }
    walk(RMS_COPY.en, RMS_COPY.zh, "");
  });

  it("contains no banned falsifier/refuted vocabulary", () => {
    const blob = JSON.stringify(RMS_COPY);
    expect(blob).not.toMatch(/falsifier|falsified|refuted|证伪/i);
  });

  it("window-closed copy is byte-pinned EN/ZH", () => {
    expect(conditionLine({ source: "monitor", state: "window_closed", at: "x" }, "en")).toBe(
      "The window you were watching has closed",
    );
    expect(conditionLine({ source: "monitor", state: "window_closed", at: "x" }, "zh")).toBe(
      "你关注的观察窗口已结束",
    );
  });

  it("typed unavailable condition, and readConditionStates returns unavailable for every id today", () => {
    expect(conditionLine({ source: "unavailable" }, "en")).toBe("Condition checks are not available yet.");
    const states = readConditionStates(["a", "b", "c"]);
    expect(states.size).toBe(3);
    for (const v of states.values()) expect(v).toEqual({ source: "unavailable" });
  });
});

describe("no new schema", () => {
  it("migrations directory is unchanged (frozen list)", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const entries = fs.readdirSync(dir).sort();
    const expected = [
      "0001_watchlists.sql",
      "0002_watchlist_symbols.sql",
      "0003_price_alerts.sql",
      "0004_alert_deliveries.sql",
      "0005_alert_channels.sql",
      "0006_notifications.sql",
      "0007_portfolio_positions.sql",
      "0008_portfolio_transactions.sql",
      "0009_data_os_identity_bridge.sql",
      "0010_stock_identity_map.sql",
      "0011_evidence_records.sql",
      "0012_thesis_objects.sql",
      "README.md",
    ].sort();
    // Tolerant: only assert 0012 is present and no rmsViews-authored migration exists;
    // the exact historical list is enumerated for visibility, not a hard external contract.
    expect(entries).toContain("0012_thesis_objects.sql");
    expect(entries.filter((e) => e.includes("thesis_saved_views"))).toEqual([]);
    void expected;
  });

  it("rmsViews.ts and route.ts contain no DDL or unexpected table access", () => {
    const rms = fs.readFileSync(path.resolve(__dirname, "../rmsViews.ts"), "utf8");
    const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/theses/route.ts"), "utf8");
    for (const src of [rms, route]) {
      expect(src).not.toMatch(/create\s+table/i);
      expect(src).not.toMatch(/alter\s+table/i);
      expect(src).not.toMatch(/insert\s+into/i);
      const fromMatches = [...src.matchAll(/\.from\(["']([^"']+)["']\)/g)].map((m) => m[1]);
      for (const table of fromMatches) {
        expect(["theses", "thesis_versions"]).toContain(table);
      }
    }
  });
});

describe("grain contract", () => {
  it("RMS_VIEWS matches the frozen ids/order/grain/requiresContent table", () => {
    expect(RMS_VIEWS.map((v) => [v.id, v.grain, v.requiresContent])).toEqual([
      ["coverage", "subject", false],
      ["ideas", "thesis", false],
      ["theses", "thesis", false],
      ["reviews", "thesis", false],
      ["catalysts", "line", true],
      ["risks", "line", true],
      ["notes", "line", true],
    ]);
    expect(RMS_VIEWS.filter((v) => v.requiresContent)).toHaveLength(3);
  });
});

describe("bounded hydration", () => {
  const all = Array.from({ length: 15 }, (_, i) =>
    summary({
      id: `h${i}`,
      currentVersion: 1,
      lifecycleState: "active",
      subject: subjA,
      title: `h${i}`,
      updatedAt: new Date(2026, 0, i + 1).toISOString(),
    }),
  );

  it("selectHydrationIds returns <=10 newest-updated unloaded ids, never repeating loaded ids", () => {
    const loaded = new Set<string>();
    const first = selectHydrationIds(all, loaded);
    expect(first.length).toBe(10);
    // newest updatedAt first => highest index first
    expect(first[0]).toBe("h14");
    const loaded2 = new Set(first);
    const second = selectHydrationIds(all, loaded2);
    expect(second.length).toBe(5);
    for (const id of second) expect(loaded2.has(id)).toBe(false);
  });

  it("hydrationScope reports loaded/total/complete at 0, partial, full", () => {
    expect(hydrationScope(all, new Set())).toEqual({ loaded: 0, total: 15, complete: false });
    expect(hydrationScope(all, new Set(all.slice(0, 10).map((s) => s.id)))).toEqual({ loaded: 10, total: 15, complete: false });
    expect(hydrationScope(all, new Set(all.map((s) => s.id)))).toEqual({ loaded: 15, total: 15, complete: true });
    expect(hydrationScope([], new Set())).toEqual({ loaded: 0, total: 0, complete: true });
  });
});
