// mscGlance tests (R3.2/R3.3) — the glance-tier parse/convention layer plus the
// flowSource pins for the new `gexstate_index` literal f-param (aggTrend.test pattern).
import { describe, it, expect } from "vitest";
import {
  parseGlanceIndex,
  parseGlanceState,
  normRegime,
  REGIME_RANK,
  REGIME_COLORS,
} from "../mscGlance";
import { isValidF, backendPath, r2Key, fixtureFor } from "../flowSource";

const row = (over: Record<string, unknown> = {}) => ({
  spot: 100,
  net_gex_bn: 1.5,
  gamma_regime: "PIN",
  stability_pct: 80,
  gamma_flip: 97,
  dist_to_flip_pct: -3,
  call_wall: 110,
  put_wall: 90,
  asof: "2026-08-01",
  ...over,
});

describe("parseGlanceIndex", () => {
  it("parses rows, uppercases roots, carries per-row asof", () => {
    const idx = parseGlanceIndex({
      schema: "options_structure.gex_state_index/v1",
      asof: "2026-08-01T20:00:00+00:00",
      rows: { nvda: row(), SPY: row({ gamma_regime: "TREND", asof: "2026-07-30" }) },
    });
    expect(idx).not.toBeNull();
    expect(idx!.nRoots).toBe(2);
    expect(idx!.rows.get("NVDA")!.regime).toBe("PIN");
    expect(idx!.rows.get("SPY")!.regime).toBe("TREND");
    expect(idx!.rows.get("SPY")!.asofDate).toBe("2026-07-30");
    expect(idx!.asofDate).toBe("2026-08-01");
  });

  it("degrades to null for {} / wrong shapes / all-noise rows (degrade-to-absent law)", () => {
    expect(parseGlanceIndex({})).toBeNull();
    expect(parseGlanceIndex(null)).toBeNull();
    expect(parseGlanceIndex({ rows: "x" })).toBeNull();
    expect(parseGlanceIndex({ rows: { A: { gamma_regime: "??" } } })).toBeNull();
  });

  it("unknown regime strings normalise to UNKNOWN, never crash", () => {
    expect(normRegime("cascade")).toBe("CASCADE");
    expect(normRegime("weird")).toBe("UNKNOWN");
    expect(normRegime(7)).toBe("UNKNOWN");
  });
});

describe("parseGlanceState (per-root form)", () => {
  it("accepts a matching root and rejects another root's payload", () => {
    expect(parseGlanceState({ root: "SPY", ...row() }, "SPY")!.gammaFlip).toBe(97);
    expect(parseGlanceState({ root: "SPY", ...row() }, "NVDA")).toBeNull();
  });
});

describe("convention tables", () => {
  it("rank orders structural risk PIN→CASCADE (the gexStrings grouping doctrine)", () => {
    expect(REGIME_RANK.PIN).toBeLessThan(REGIME_RANK.TRANSITION);
    expect(REGIME_RANK.TRANSITION).toBeLessThan(REGIME_RANK.CASCADE);
    expect(REGIME_RANK.UNKNOWN).toBe(-1);
  });
  it("colour table covers every regime and stays on semantic tokens", () => {
    for (const k of ["PIN", "DRIFT", "RANGE", "TRANSITION", "TREND", "CASCADE", "UNKNOWN"]) {
      expect(REGIME_COLORS[k]).toMatch(/^var\(--/);
    }
  });
});

describe("flowSource: gexstate_index literal f", () => {
  it("validates the literal and nothing adjacent", () => {
    expect(isValidF("gexstate_index")).toBe(true);
    expect(isValidF("gexstate_index:SPY")).toBe(false);
    expect(isValidF("gexstate:_index")).toBe(false); // underscore is not a root
    expect(isValidF("gexstate_")).toBe(false);
  });
  it("routes to the gex_state _index key on both lanes", () => {
    expect(backendPath("gexstate_index")).toBe("/api/hub/gexstate/_index");
    expect(r2Key("gexstate_index")).toBe("options_structure/gex_state/_index.json");
  });
  it("never collides with any per-root gexstate mapping", () => {
    expect(backendPath("gexstate_index")).not.toBe(backendPath("gexstate:SPY"));
    expect(r2Key("gexstate_index")).not.toBe(r2Key("gexstate:SPY"));
  });
  it("fixture serves an index-shaped payload the parser accepts", async () => {
    const raw = await fixtureFor("gexstate_index");
    const idx = parseGlanceIndex(raw);
    expect(idx).not.toBeNull();
    expect(idx!.rows.get("NVDA")!.regime).toBe("TREND");
    expect(idx!.rows.get("TSLA")!.regime).toBe("CASCADE");
  });
});
