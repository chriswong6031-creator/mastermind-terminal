import { describe, expect, it } from "vitest";
import { backendPath, fixtureFor, isValidF, r2Key } from "@/lib/flowSource";

describe("levels.v1 flow source", () => {
  it("accepts safe roots and rejects traversal or malformed roots", () => {
    expect(isValidF("levels:SPY")).toBe(true);
    expect(isValidF("levels:BRK.B")).toBe(true);
    expect(isValidF("levels:")).toBe(false);
    expect(isValidF("levels:spy")).toBe(false);
    expect(isValidF("levels:../../admin")).toBe(false);
    expect(isValidF("levels:SPY/other")).toBe(false);
  });

  it("maps the backend and public R2 planes independently", () => {
    expect(backendPath("levels:SPY")).toBe("/api/hub/levels/SPY");
    expect(r2Key("levels:SPY")).toBe("levels/SPY.json");
    expect(r2Key("levels:SPY")).not.toBe(r2Key("gex:SPY"));
  });

  it("serves a matching fixture and never substitutes a different root", async () => {
    const spy = await fixtureFor("levels:SPY");
    expect(spy.schema).toBe("levels.v1");
    expect(spy.root).toBe("SPY");
    expect(Array.isArray(spy.nodes)).toBe(true);
    expect((spy.nodes as unknown[]).length).toBeGreaterThan(0);
    expect(await fixtureFor("levels:NVDA")).toEqual({});
  });
});
