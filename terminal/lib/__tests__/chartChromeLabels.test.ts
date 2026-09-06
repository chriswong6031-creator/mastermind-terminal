import { describe, expect, it } from "vitest";
import { daysHeld, daysToExpiry, volAboveOi } from "@/lib/plainAbbrev";

describe("daysToExpiry", () => {
  it("expands the abbreviation in both languages", () => {
    const en = daysToExpiry(7, "en");
    const zh = daysToExpiry(7, "zh");
    expect(en.trim().length).toBeGreaterThan(0);
    expect(zh.trim().length).toBeGreaterThan(0);
    expect(en).toContain("days to expiry");
    expect(en).toContain("7");
    expect(zh).toContain("7");
    expect(en.toLowerCase()).not.toContain("dte");
    expect(en).not.toContain("d ");
    expect(en).not.toContain(">OI");
    expect(zh.toLowerCase()).not.toContain("dte");
    expect(zh).not.toContain("d ");
    expect(zh).not.toContain(">OI");
  });
});

describe("daysHeld", () => {
  it("keeps the count and spells out days", () => {
    const en = daysHeld(3, "en");
    const zh = daysHeld(3, "zh");
    expect(en.trim().length).toBeGreaterThan(0);
    expect(zh.trim().length).toBeGreaterThan(0);
    expect(en).toContain("3");
    expect(en.toLowerCase()).toContain("days");
    expect(zh).toContain("3");
    expect(en.toLowerCase()).not.toContain("dte");
    expect(en).not.toContain("d ");
    expect(en).not.toContain(">OI");
  });
});

describe("volAboveOi", () => {
  it("spells volume and open interest in both languages", () => {
    const en = volAboveOi("en");
    const zh = volAboveOi("zh");
    expect(en.trim().length).toBeGreaterThan(0);
    expect(zh.trim().length).toBeGreaterThan(0);
    expect(en.toLowerCase()).toContain("open interest");
    expect(en.toLowerCase()).not.toContain("dte");
    expect(en).not.toContain("d ");
    expect(en).not.toContain(">OI");
    expect(zh).not.toContain(">OI");
    expect(zh.toLowerCase()).not.toContain("dte");
  });
});
