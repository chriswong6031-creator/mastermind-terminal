import { describe, expect, it } from "vitest";
import { polygonLookbackDays } from "../intradaySources";

describe("polygonLookbackDays", () => {
  it("keeps every US hourly timeframe inside Polygon's aggregate limit", () => {
    expect(polygonLookbackDays(60, "us")).toBe(60);
    expect(polygonLookbackDays(120, "us")).toBe(60);
    expect(polygonLookbackDays(240, "us")).toBe(60);
  });

  it("uses a smaller hourly window for 24/7 crypto", () => {
    expect(polygonLookbackDays(60, "crypto")).toBe(30);
    expect(polygonLookbackDays(240, "crypto")).toBe(30);
  });

  it("preserves the existing minute windows", () => {
    expect(polygonLookbackDays(5, "us")).toBe(10);
    expect(polygonLookbackDays(30, "us")).toBe(25);
  });
});
