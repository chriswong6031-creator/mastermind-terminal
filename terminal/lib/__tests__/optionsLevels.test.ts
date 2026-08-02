// optionsLevels.test.ts — R3.1 chart-overlay derivation. Pins the honesty-critical
// behaviours: root-mismatch rejection (never another ticker's levels on this chart),
// profile-crossing flip preference, abs-gamma yielding to a coinciding wall, EM band
// optionality, and the staleness counter the legend note reads.
import { describe, it, expect } from "vitest";
import {
  deriveOptLevels,
  pickRootPayload,
  sessionsOldEt,
  type OptLevel,
} from "../optionsLevels";

const byKey = (levels: OptLevel[]) =>
  Object.fromEntries(levels.map((l) => [l.key, l.price]));

const gexFull = {
  schema: "options_hub.gex/v1",
  root: "NVDA",
  asof: "2026-07-31T23:05:00Z",
  spot_ref: 135.7,
  net_gex_bn: -1.24,
  gamma_flip: 130.0,
  call_wall: 150.0,
  put_wall: 120.0,
  by_strike: [
    { strike: 120, gamma_net: -40, gamma_call: 5, gamma_put: -45 },
    { strike: 135, gamma_net: 10, gamma_call: 60, gamma_put: -50 },
    { strike: 150, gamma_net: 30, gamma_call: 35, gamma_put: -5 },
  ],
};

const movesFull = {
  schema: "options_hub.moves/v1",
  root: "NVDA",
  expected_move: { band_mult: 1.96, horizon_days: 1.0, pct: 3.62, lo: 130.8, hi: 140.6 },
};

describe("pickRootPayload", () => {
  it("unwraps a root-keyed envelope", () => {
    expect(pickRootPayload({ NVDA: gexFull }, "NVDA")).toMatchObject({ root: "NVDA" });
  });
  it("accepts a bare payload", () => {
    expect(pickRootPayload(gexFull, "NVDA")).toMatchObject({ spot_ref: 135.7 });
  });
  it("rejects another root's data wearing this root's slot", () => {
    expect(pickRootPayload({ root: "SPY", call_wall: 620 }, "NVDA")).toBeNull();
  });
  it("rejects null / non-object", () => {
    expect(pickRootPayload(null, "NVDA")).toBeNull();
    expect(pickRootPayload("x", "NVDA")).toBeNull();
  });
});

describe("sessionsOldEt", () => {
  it("same day → 0", () => {
    expect(sessionsOldEt("2026-07-31", "2026-07-31")).toBe(0);
  });
  it("Friday → Monday counts one weekday", () => {
    expect(sessionsOldEt("2026-07-31", "2026-08-03")).toBe(1);
  });
  it("a full week spans five weekdays", () => {
    expect(sessionsOldEt("2026-07-24", "2026-07-31")).toBe(5);
  });
  it("garbage / future dates → 0", () => {
    expect(sessionsOldEt("not-a-date", "2026-07-31")).toBe(0);
    expect(sessionsOldEt("2026-08-05", "2026-07-31")).toBe(0);
  });
});

describe("deriveOptLevels", () => {
  it("derives walls, flip, abs-gamma and the EM band from full payloads", () => {
    const r = deriveOptLevels(gexFull, movesFull, "NVDA");
    expect(r.status).toBe("ok");
    expect(byKey(r.levels)).toEqual({
      call_wall: 150.0,
      put_wall: 120.0,
      gamma_flip: 130.0,
      abs_gamma: 135, // 60+50 gross at 135 beats 50 at 120 and 40 at 150
      em_lo: 130.8,
      em_hi: 140.6,
    });
    expect(r.asofDate).toBe("2026-07-31");
    expect(r.spot).toBe(135.7);
    expect(r.netGexBn).toBe(-1.24);
    expect(r.signed).toBe(true); // walls/flip drawn → Tier-B disclosure rides
  });

  it("EM-only (partial publish: moves lane landed, gex lane empty) is Tier A — not signed", () => {
    const m = { ...movesFull, asof: "2026-07-23" };
    const r = deriveOptLevels({}, m, "NVDA");
    expect(r.status).toBe("ok");
    expect(r.levels.map((l) => l.key).sort()).toEqual(["em_hi", "em_lo"]);
    expect(r.signed).toBe(false); // no dealer-signed level → no "signed estimate" label
    expect(r.asofDate).toBe("2026-07-23"); // provenance falls back to the moves build
  });

  it("prefers the profile crossing nearest spot over the scalar flip", () => {
    const g = {
      ...gexFull,
      gamma_flip: 90.0, // stale scalar — must lose
      profile: { grid: [100, 140], gamma_bn: [-1, 1], crossings: [100.0, 133.0] },
    };
    const r = deriveOptLevels(g, null, "NVDA");
    expect(byKey(r.levels).gamma_flip).toBe(133.0); // |133−135.7| < |100−135.7|
  });

  it("falls back to the scalar when crossings are absent or unusable", () => {
    const g = { ...gexFull, profile: { grid: [], gamma_bn: [], crossings: [] } };
    expect(byKey(deriveOptLevels(g, null, "NVDA").levels).gamma_flip).toBe(130.0);
    const g2 = { ...gexFull, profile: null };
    expect(byKey(deriveOptLevels(g2, null, "NVDA").levels).gamma_flip).toBe(130.0);
  });

  it("abs-gamma yields to a wall at the same strike (no doubled axis label)", () => {
    const g = {
      ...gexFull,
      by_strike: [
        { strike: 150, gamma_net: 90, gamma_call: 95, gamma_put: -5 }, // argmax == call wall
        { strike: 135, gamma_net: 10, gamma_call: 30, gamma_put: -20 },
      ],
    };
    const keys = deriveOptLevels(g, null, "NVDA").levels.map((l) => l.key);
    expect(keys).not.toContain("abs_gamma");
    expect(keys).toContain("call_wall");
  });

  it("missing moves drops only the EM band", () => {
    const r = deriveOptLevels(gexFull, null, "NVDA");
    expect(r.status).toBe("ok");
    const keys = r.levels.map((l) => l.key);
    expect(keys).not.toContain("em_lo");
    expect(keys).not.toContain("em_hi");
    expect(keys).toContain("call_wall");
  });

  it("rejects an inverted or degenerate EM band", () => {
    const m = { ...movesFull, expected_move: { lo: 141, hi: 130 } };
    const keys = deriveOptLevels(gexFull, m, "NVDA").levels.map((l) => l.key);
    expect(keys).not.toContain("em_lo");
  });

  it("empty payload / unknown root → honest empty (prod's fetch-and-tolerate contract)", () => {
    expect(deriveOptLevels({}, null, "ZZZQ").status).toBe("empty");
    expect(deriveOptLevels(null, null, "NVDA").status).toBe("empty");
  });

  it("another root's payload → empty, never cross-labelled levels", () => {
    expect(deriveOptLevels({ ...gexFull, root: "SPY" }, null, "NVDA").status).toBe("empty");
  });

  it("drops non-numeric / non-positive levels instead of drawing garbage", () => {
    const g = { ...gexFull, call_wall: "150", put_wall: 0, gamma_flip: NaN, by_strike: [], profile: null };
    const r = deriveOptLevels(g, null, "NVDA");
    expect(r.status).toBe("empty");
    expect(r.levels).toEqual([]);
  });

  it("non-timestamp asof reads as null, not a fake date", () => {
    const g = { ...gexFull, asof: "yesterday-ish" };
    expect(deriveOptLevels(g, null, "NVDA").asofDate).toBeNull();
  });
});
