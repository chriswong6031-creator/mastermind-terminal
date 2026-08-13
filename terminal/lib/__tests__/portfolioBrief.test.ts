import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type PortfolioBrief,
  orderedSections,
  pickLang,
  sectionTitle,
  stateForResponse,
  uncoveredNotice,
  weightingLabel,
  populationDisclosure,
  SECTION_ORDER,
} from "@/lib/portfolioBrief";

// ─────────────────────────────────────────────────────────────────────────────
// Pure render-selection logic for the "Your book today" brief panel
// (lib/portfolioBrief.ts). The desk composes the brief upstream and sends complete,
// pre-localized sentences in BOTH languages; this module only *selects* the active
// language string and maps HTTP status → UI state. These tests pin that selection,
// the canonical section ordering, the stale/uncovered handling, and the 403→teaser map.
//
// LOCATION NOTE: vitest.config.ts includes ONLY "lib/__tests__/**/*.test.ts".
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(__dirname, "fixtures", "portfolio_brief");
function loadBrief(name: string): PortfolioBrief {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name + ".json"), "utf8"));
}

const brief = loadBrief("concentrated_semis");

// ── Fixture is a valid portfolio_brief.v1 ──────────────────────────────────────

describe("fixture: portfolio_brief.v1 shape", () => {
  it("carries the schema tag and the expected book counts", () => {
    expect(brief.schema).toBe("portfolio_brief.v1");
    expect(brief.book.n).toBe(9);
    expect(brief.book.covered).toBe(8);
    expect(brief.book.uncovered).toEqual(["FOO"]);
  });

  it("every headline and line carries BOTH languages (non-empty)", () => {
    expect(brief.headline.en.length).toBeGreaterThan(0);
    expect(brief.headline.zh.length).toBeGreaterThan(0);
    for (const s of brief.sections) {
      expect(s.title_en.length).toBeGreaterThan(0);
      expect(s.title_zh.length).toBeGreaterThan(0);
      for (const l of s.lines) {
        expect(l.en.length).toBeGreaterThan(0);
        expect(l.zh.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── Language selection: render verbatim, never re-compose ───────────────────────

describe("pickLang / sectionTitle / weightingLabel", () => {
  it("picks the EN string in English", () => {
    expect(pickLang(brief.headline, "en")).toBe(brief.headline.en);
    expect(pickLang(brief.sections[0].lines[0], "en")).toBe(brief.sections[0].lines[0].en);
  });

  it("picks the ZH string in Chinese", () => {
    expect(pickLang(brief.headline, "zh")).toBe(brief.headline.zh);
    expect(pickLang(brief.sections[0].lines[0], "zh")).toBe(brief.sections[0].lines[0].zh);
  });

  it("section titles switch language", () => {
    const s = brief.sections[0];
    expect(sectionTitle(s, "en")).toBe(s.title_en);
    expect(sectionTitle(s, "zh")).toBe(s.title_zh);
  });

  it("weighting label switches language", () => {
    expect(weightingLabel(brief.weighting, "en")).toBe("by cost basis");
    expect(weightingLabel(brief.weighting, "zh")).toBe("按成本权重");
  });

  it("returns the string unchanged — no truncation of a composed fact", () => {
    // A composed sentence must survive selection byte-for-byte.
    const en = pickLang(brief.sections[0].lines[0], "en");
    expect(en).toContain("41% of your book is Technology");
    expect(en.endsWith("thinner than it looks.")).toBe(true);
  });
});

// ── Canonical section ordering ─────────────────────────────────────────────────

describe("orderedSections", () => {
  it("re-asserts the canonical desk order regardless of payload order", () => {
    // The fixture ships sections as [exposure, earnings, signals, filings] — deliberately
    // out of canonical order. The panel must render them exposure→signals→earnings→filings.
    const keys = orderedSections(brief).map((s) => s.key);
    expect(keys).toEqual(["exposure", "signals", "earnings", "filings"]);
  });

  it("orders every known key by SECTION_ORDER", () => {
    const full: PortfolioBrief = {
      ...brief,
      sections: [...SECTION_ORDER].reverse().map((key) => ({
        key,
        title_en: key,
        title_zh: key,
        lines: [{ en: "x", zh: "x" }],
      })),
    };
    expect(orderedSections(full).map((s) => s.key)).toEqual([...SECTION_ORDER]);
  });

  it("drops sections with no lines (a silent hole, not a fact)", () => {
    const withEmpty: PortfolioBrief = {
      ...brief,
      sections: [
        { key: "exposure", title_en: "E", title_zh: "E", lines: [{ en: "a", zh: "啊" }] },
        { key: "regime", title_en: "R", title_zh: "R", lines: [] },
      ],
    };
    expect(orderedSections(withEmpty).map((s) => s.key)).toEqual(["exposure"]);
  });

  it("keeps unknown keys after known ones, in original order (forward-compatible)", () => {
    const withUnknown: PortfolioBrief = {
      ...brief,
      sections: [
        { key: "newfangled", title_en: "N", title_zh: "N", lines: [{ en: "z", zh: "z" }] },
        { key: "exposure", title_en: "E", title_zh: "E", lines: [{ en: "a", zh: "a" }] },
        { key: "another", title_en: "A", title_zh: "A", lines: [{ en: "b", zh: "b" }] },
      ],
    };
    expect(orderedSections(withUnknown).map((s) => s.key)).toEqual([
      "exposure",
      "newfangled",
      "another",
    ]);
  });
});

// ── Honest-null uncovered notice ───────────────────────────────────────────────

describe("uncoveredNotice", () => {
  it("names the uncovered tickers when the book has any", () => {
    expect(uncoveredNotice(brief)).toEqual({ tickers: ["FOO"] });
  });

  it("returns null when every held name is covered (no empty disclosure)", () => {
    const covered: PortfolioBrief = {
      ...brief,
      book: { n: 9, covered: 9, uncovered: [] },
    };
    expect(uncoveredNotice(covered)).toBeNull();
  });
});

// ── HTTP status → UI state mapping ─────────────────────────────────────────────

describe("stateForResponse", () => {
  it("200 → ready, carrying the parsed brief", () => {
    const s = stateForResponse(200, brief);
    expect(s.kind).toBe("ready");
    if (s.kind === "ready") expect(s.brief.schema).toBe("portfolio_brief.v1");
  });

  it("401 → hidden (guest; the page already handles guests)", () => {
    expect(stateForResponse(401, { error: "unauthenticated" }).kind).toBe("hidden");
  });

  it("403 → teaser, reading the tier from the body", () => {
    const free = stateForResponse(403, { error: "pro_required", tier: "free" });
    expect(free).toEqual({ kind: "teaser", tier: "free" });
    const insider = stateForResponse(403, { error: "pro_required", tier: "insider" });
    expect(insider).toEqual({ kind: "teaser", tier: "insider" });
  });

  it("403 with no/unknown tier → teaser with null tier", () => {
    expect(stateForResponse(403, { error: "pro_required" })).toEqual({ kind: "teaser", tier: null });
    expect(stateForResponse(403, { error: "pro_required", tier: "platinum" })).toEqual({
      kind: "teaser",
      tier: null,
    });
    expect(stateForResponse(403, null)).toEqual({ kind: "teaser", tier: null });
  });

  it("503 → unavailable (one quiet line; never blocks the book)", () => {
    expect(stateForResponse(503, { error: "gateway_unreachable" }).kind).toBe("unavailable");
  });

  it("502 / 500 / 0 (network) → unavailable", () => {
    expect(stateForResponse(502, null).kind).toBe("unavailable");
    expect(stateForResponse(500, null).kind).toBe("unavailable");
    expect(stateForResponse(0, null).kind).toBe("unavailable");
  });
});

// ── The stale flag is preserved on the payload for the view to caution on ───────

describe("stale handling", () => {
  it("fixture is fresh; a stale copy flips the flag the view reads", () => {
    expect(brief.stale).toBe(false);
    const staleBrief: PortfolioBrief = { ...brief, stale: true };
    expect(staleBrief.stale).toBe(true);
    // The view keys its muted "data as of {asof}" caution off exactly this flag.
  });
});

// ── Population disclosure (packet amendment A8) ─────────────────────────────────
//
// The defect this closes shipped in production: a page titled Portfolio rendering WATCHLIST
// symbols, with this brief above it composed from a third population, and nothing on screen
// saying which set any number described. The panel now states the page's population, and flags
// the case where the desk's own reported book size proves it read a different set.

describe("populationDisclosure", () => {
  it("reports what the PAGE renders, and the desk's own count alongside it", () => {
    const disclosure = populationDisclosure({ kind: "positions", count: brief.book.n }, brief);
    expect(disclosure.kind).toBe("positions");
    expect(disclosure.count).toBe(brief.book.n);
    expect(disclosure.briefCount).toBe(brief.book.n);
    expect(disclosure.mismatch).toBe(false);
  });

  it("flags a genuine population gap in BOTH directions", () => {
    expect(populationDisclosure({ kind: "positions", count: brief.book.n + 3 }, brief).mismatch).toBe(true);
    expect(populationDisclosure({ kind: "positions", count: Math.max(0, brief.book.n - 1) }, brief).mismatch).toBe(true);
  });

  it("treats an absent or unusable book count as UNKNOWN, never as agreement", () => {
    // No payload at all (loading / teaser / unavailable): nothing to compare, so no claim.
    const none = populationDisclosure({ kind: "positions", count: 4 }, null);
    expect(none.briefCount).toBeNull();
    expect(none.mismatch).toBe(false);

    // A payload whose book count is missing or non-finite must not manufacture a mismatch —
    // "we cannot tell" and "they agree" are rendered the same way only because neither may
    // accuse the desk of reading the wrong names.
    for (const n of [undefined, null, "6", Number.NaN] as unknown[]) {
      const odd = { ...brief, book: { ...brief.book, n } } as unknown as PortfolioBrief;
      const disclosure = populationDisclosure({ kind: "positions", count: 4 }, odd);
      expect(disclosure.briefCount).toBeNull();
      expect(disclosure.mismatch).toBe(false);
    }
  });

  it("carries the watchlist_union mode for any surface that renders an equal-weighted list", () => {
    // The Terminal has no such surface after W5 — the label exists so a future one cannot ship
    // silent, which is exactly what A8 forbids.
    const disclosure = populationDisclosure({ kind: "watchlist_union", count: 12 }, brief);
    expect(disclosure.kind).toBe("watchlist_union");
    expect(disclosure.count).toBe(12);
  });

  it("counts zero as a real population, not as a missing one", () => {
    const empty = populationDisclosure({ kind: "positions", count: 0 }, brief);
    expect(empty.count).toBe(0);
    expect(empty.mismatch).toBe(brief.book.n !== 0);
  });
});
