import { describe, it, expect } from "vitest";
import { findSpotRowIndex, SPOT_ROW_ATTR } from "@/components/gexdesk/StrikeLadder";

/**
 * StrikeLadder's auto-center effect used to locate the spot row by scanning each row's
 * rendered textContent for the "▶" marker glyph. Any change to the marker — a different
 * glyph, an icon, moving it out of the row — silently disabled auto-centering with no
 * test or type-level coupling to catch it. `findSpotRowIndex` replaces that scan with a
 * stable data-hook lookup; these tests use plain duck-typed objects (no jsdom) so the
 * lookup stays a pure, DOM-free unit like the rest of lib/.
 */

/** Minimal duck-typed stand-in for a DOM Element — only `getAttribute` is needed. */
function fakeEl(attrs: Record<string, string>): { getAttribute(name: string): string | null } {
  return { getAttribute: (name: string) => (name in attrs ? attrs[name] : null) };
}

describe("findSpotRowIndex — stable data-hook, not the marker glyph", () => {
  it("finds the row carrying the spot data-hook", () => {
    const rows = [fakeEl({}), fakeEl({ [SPOT_ROW_ATTR]: "1" }), fakeEl({})];
    expect(findSpotRowIndex(rows)).toBe(1);
  });

  it("returns -1 when no row carries the hook", () => {
    const rows = [fakeEl({}), fakeEl({}), fakeEl({})];
    expect(findSpotRowIndex(rows)).toBe(-1);
  });

  it("returns -1 on an empty collection", () => {
    expect(findSpotRowIndex([])).toBe(-1);
  });

  it("REGRESSION: a row whose textContent contains the OLD marker glyph but lacks the data-hook is NOT matched", () => {
    // Proves the lookup no longer depends on the glyph at all — a future restyle (a
    // different glyph, an icon, moving the marker out of the row) cannot silently
    // disable this query the way the textContent scan could.
    const rows = [
      { getAttribute: () => null, textContent: "751.00 ▶" } as unknown as {
        getAttribute(name: string): string | null;
      },
      fakeEl({ [SPOT_ROW_ATTR]: "1" }),
    ];
    expect(findSpotRowIndex(rows)).toBe(1);
  });

  it("ignores a row whose data-hook attribute is present but not the expected value", () => {
    const rows = [fakeEl({ [SPOT_ROW_ATTR]: "0" }), fakeEl({ [SPOT_ROW_ATTR]: "true" })];
    expect(findSpotRowIndex(rows)).toBe(-1);
  });

  it("finds the FIRST matching row when (unexpectedly) more than one carries the hook", () => {
    const rows = [fakeEl({}), fakeEl({ [SPOT_ROW_ATTR]: "1" }), fakeEl({ [SPOT_ROW_ATTR]: "1" })];
    expect(findSpotRowIndex(rows)).toBe(1);
  });
});
