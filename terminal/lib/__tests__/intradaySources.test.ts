import { describe, expect, it } from "vitest";
import { polygonLookbackDays, polygonUsSessionBaseMinutes } from "../intradaySources";

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

describe("polygonUsSessionBaseMinutes", () => {
  it("uses boundary-aligned source aggregates without provider-built hourly bars", () => {
    expect(polygonUsSessionBaseMinutes(1)).toBe(1);
    expect(polygonUsSessionBaseMinutes(2)).toBe(1);
    expect(polygonUsSessionBaseMinutes(3)).toBe(1);
    expect(polygonUsSessionBaseMinutes(10)).toBe(5);
    expect(polygonUsSessionBaseMinutes(15)).toBe(15);
    expect(polygonUsSessionBaseMinutes(45)).toBe(15);
    expect(polygonUsSessionBaseMinutes(60)).toBe(30);
    expect(polygonUsSessionBaseMinutes(240)).toBe(30);
  });
});
