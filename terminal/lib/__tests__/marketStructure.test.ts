import { describe, it, expect } from "vitest";
import {
  aggregate,
  signSensitivity,
  scenarioGrid,
  emFrame,
  topology,
  expiryConcentration,
  buildMarketStructure,
  guardedFlip,
  isPlausibleFlip,
  TILT_FRAGILE_ABS,
  REACHABLE_EM,
  type MscStrikeRow,
  type MscExpiryRow,
} from "../marketStructure";

// A tiny hand-computable book: call gamma +, put gamma −, net = call + put.
const ROWS: MscStrikeRow[] = [
  { strike: 90, gamma_net: -30, gamma_call: 10, gamma_put: -40, vanna_net: 5, charm_net: -2, delta_net: -100 },
  { strike: 100, gamma_net: 40, gamma_call: 60, gamma_put: -20, vanna_net: 15, charm_net: 3, delta_net: 200 },
  { strike: 110, gamma_net: 20, gamma_call: 30, gamma_put: -10, vanna_net: 10, charm_net: 1, delta_net: 50 },
];
// callAbs = 100, putAbs = 70, gamma = 30, vanna = 30, charm = 2, delta = 150

describe("aggregate", () => {
  it("sums each greek and both gross gamma sides", () => {
    const a = aggregate(ROWS);
    expect(a.gammaMn).toBe(30);
    expect(a.callAbsMn).toBe(100);
    expect(a.putAbsMn).toBe(70);
    expect(a.vannaMn).toBe(30);
    expect(a.charmMn).toBe(2);
    expect(a.deltaMn).toBe(150);
    expect(a.nStrikes).toBe(3);
  });

  it("keeps Σ gamma_net consistent with gamma_call + gamma_put", () => {
    const a = aggregate(ROWS);
    expect(a.callAbsMn - a.putAbsMn).toBeCloseTo(a.gammaMn, 10);
  });

  it("reports an absent lens as null rather than zero", () => {
    const bare: MscStrikeRow[] = [{ strike: 1, gamma_net: 1, gamma_call: 1, gamma_put: 0 }];
    const a = aggregate(bare);
    expect(a.vannaMn).toBeNull();
    expect(a.charmMn).toBeNull();
    expect(a.deltaMn).toBeNull();
  });

  it("flags a windowed ladder only when the uncut count exceeds what was summed", () => {
    expect(aggregate(ROWS, 12).windowed).toBe(true);
    expect(aggregate(ROWS, 3).windowed).toBe(false);
    expect(aggregate(ROWS).windowed).toBe(false);
    expect(aggregate(ROWS).nStrikesFull).toBeNull();
  });

  it("ignores non-finite values instead of poisoning the sum", () => {
    const dirty = [
      ...ROWS,
      { strike: 120, gamma_net: NaN, gamma_call: NaN, gamma_put: NaN } as MscStrikeRow,
    ];
    const a = aggregate(dirty);
    expect(a.gammaMn).toBe(30);
    expect(Number.isFinite(a.callAbsMn)).toBe(true);
  });

  it("handles an empty ladder", () => {
    const a = aggregate([]);
    expect(a.gammaMn).toBe(0);
    expect(a.nStrikes).toBe(0);
  });
});

describe("signSensitivity", () => {
  it("computes tilt, critical weight and the convention curve", () => {
    const s = signSensitivity(aggregate(ROWS));
    // tilt = (100 − 70) / 170
    expect(s.tilt).toBeCloseTo(30 / 170, 10);
    // w* = putAbs / callAbs
    expect(s.criticalWeight).toBeCloseTo(0.7, 10);
    // net(+1) is the published convention and must equal Σ gamma_net
    expect(s.naiveNetMn).toBe(30);
    expect(s.curve.find((p) => p.w === 1)!.netMn).toBe(30);
    expect(s.curve.find((p) => p.w === 0)!.netMn).toBe(-70);
    expect(s.curve.find((p) => p.w === -1)!.netMn).toBe(-170);
  });

  it("net(w) crosses zero exactly at the critical weight", () => {
    const s = signSensitivity(aggregate(ROWS));
    const w = s.criticalWeight!;
    expect(w * s.callAbsMn - s.putAbsMn).toBeCloseTo(0, 10);
  });

  it("calls a knife-edge book fragile and a lopsided book robust", () => {
    const knife = aggregate([
      { strike: 1, gamma_net: 2, gamma_call: 101, gamma_put: -99 },
    ]);
    const s1 = signSensitivity(knife);
    expect(Math.abs(s1.tilt!)).toBeLessThan(TILT_FRAGILE_ABS);
    expect(s1.verdict).toBe("fragile");

    const lopsided = aggregate([
      { strike: 1, gamma_net: 90, gamma_call: 100, gamma_put: -10 },
    ]);
    expect(signSensitivity(lopsided).verdict).toBe("robust");
  });

  it("marks a put-dominated book robust because no plausible weight makes it long gamma", () => {
    const putHeavy = aggregate([
      { strike: 1, gamma_net: -80, gamma_call: 20, gamma_put: -100 },
    ]);
    const s = signSensitivity(putHeavy);
    expect(s.criticalWeight!).toBeGreaterThan(1);
    expect(s.verdict).toBe("robust");
    // every sampled weight leaves the book short gamma
    expect(s.curve.every((p) => p.netMn < 0)).toBe(true);
  });

  it("returns unknown with no gamma at all", () => {
    const s = signSensitivity(aggregate([]));
    expect(s.tilt).toBeNull();
    expect(s.criticalWeight).toBeNull();
    expect(s.verdict).toBe("unknown");
  });
});

describe("scenarioGrid", () => {
  it("returns the negative of the dealer delta change (hedge is the mirror)", () => {
    const g = scenarioGrid(aggregate(ROWS), { dsPct: [1], dVolPts: [0], dtDays: 0 });
    // gamma 30 $mn per +1% ⇒ dealer delta +30 ⇒ they must SELL 30
    expect(g.cells[0][0]).toBeCloseTo(-30, 10);
  });

  it("is flat at the origin cell", () => {
    const g = scenarioGrid(aggregate(ROWS), { dsPct: [0], dVolPts: [0], dtDays: 0 });
    expect(g.cells[0][0]).toBe(0);
  });

  it("adds the vanna and charm terms in the same $mn unit", () => {
    const g = scenarioGrid(aggregate(ROWS), { dsPct: [2], dVolPts: [3], dtDays: 5 });
    // −(30·2 + 30·3 + 2·5) = −160
    expect(g.cells[0][0]).toBeCloseTo(-160, 10);
  });

  it("is antisymmetric in the spot axis when vanna and time are held at zero", () => {
    const g = scenarioGrid(aggregate(ROWS), { dsPct: [-2, 2], dVolPts: [0], dtDays: 0 });
    expect(g.cells[0][0]).toBeCloseTo(-g.cells[0][1], 10);
  });

  it("reports the colour-scale anchor and lens availability", () => {
    const g = scenarioGrid(aggregate(ROWS));
    expect(g.maxAbs).toBeGreaterThan(0);
    expect(g.hasVanna).toBe(true);
    expect(g.hasCharm).toBe(true);
    expect(g.charmPerDayMn).toBeCloseTo(-2, 10);
    expect(g.cells).toHaveLength(g.dVolPts.length);
    expect(g.cells[0]).toHaveLength(g.dsPct.length);
  });

  it("treats a missing lens as contributing nothing, and says so", () => {
    const bare = aggregate([{ strike: 1, gamma_net: 10, gamma_call: 10, gamma_put: 0 }]);
    const g = scenarioGrid(bare, { dsPct: [1], dVolPts: [5], dtDays: 3 });
    expect(g.hasVanna).toBe(false);
    expect(g.hasCharm).toBe(false);
    expect(g.charmPerDayMn).toBeNull();
    expect(g.cells[0][0]).toBeCloseTo(-10, 10);
  });
});

describe("emFrame", () => {
  const moves = {
    expected_move: { band_mult: 2, horizon_days: 1, pct: 4, lo: 96, hi: 104 },
    calibration: { contained_rate: 0.94, n_sessions: 2397, ci: [0.93, 0.95] },
  };

  it("divides the published band by its multiplier to get 1σ", () => {
    const f = emFrame(100, [], moves);
    expect(f.emPct1sig).toBeCloseTo(2, 10);
    expect(f.emAbs1sig).toBeCloseTo(2, 10);
    expect(f.bandMult).toBe(2);
  });

  it("expresses each level as a distance in expected moves", () => {
    const f = emFrame(100, [{ key: "call_wall", price: 103 }, { key: "put_wall", price: 94 }], moves);
    const cw = f.levels.find((l) => l.key === "call_wall")!;
    expect(cw.distEm).toBeCloseTo(1.5, 10);
    expect(cw.side).toBe("above");
    expect(cw.distPct).toBeCloseTo(3, 10);
    const pw = f.levels.find((l) => l.key === "put_wall")!;
    expect(pw.distEm).toBeCloseTo(3, 10);
    expect(pw.side).toBe("below");
  });

  it("marks levels beyond the reachability horizon", () => {
    const f = emFrame(100, [{ key: "near", price: 101 }, { key: "far", price: 120 }], moves);
    expect(f.levels.find((l) => l.key === "near")!.reachable).toBe(true);
    expect(f.levels.find((l) => l.key === "far")!.reachable).toBe(false);
    // boundary is inclusive
    const edge = emFrame(100, [{ key: "edge", price: 100 + REACHABLE_EM * 2 }], moves);
    expect(edge.levels[0].reachable).toBe(true);
  });

  it("orders levels nearest-first", () => {
    const f = emFrame(
      100,
      [{ key: "far", price: 120 }, { key: "near", price: 101 }, { key: "mid", price: 105 }],
      moves,
    );
    expect(f.levels.map((l) => l.key)).toEqual(["near", "mid", "far"]);
  });

  it("drops levels with no price instead of rendering a hole", () => {
    const f = emFrame(100, [{ key: "a", price: null }, { key: "b", price: 101 }], moves);
    expect(f.levels.map((l) => l.key)).toEqual(["b"]);
  });

  it("carries the containment calibration through", () => {
    const f = emFrame(100, [], moves);
    expect(f.containedRate).toBeCloseTo(0.94, 10);
    expect(f.nSessions).toBe(2397);
    expect(f.ci).toEqual([0.93, 0.95]);
  });

  it("degrades to nulls without a moves payload rather than inventing a band", () => {
    const f = emFrame(100, [{ key: "cw", price: 110 }], null);
    expect(f.emPct1sig).toBeNull();
    expect(f.emAbs1sig).toBeNull();
    expect(f.levels[0].distEm).toBeNull();
    expect(f.levels[0].reachable).toBeNull();
    // the percent distance is still honest without a band
    expect(f.levels[0].distPct).toBeCloseTo(10, 10);
  });

  it("degrades without a spot too", () => {
    const f = emFrame(null, [{ key: "cw", price: 110 }], moves);
    expect(f.levels[0].distPct).toBeNull();
    expect(f.levels[0].distEm).toBeNull();
    expect(f.levels[0].side).toBe("at");
  });
});

describe("topology", () => {
  it("finds the absolute-gamma strike from magnitudes only", () => {
    const t = topology(ROWS);
    // |60| + |−20| = 80 at strike 100 beats 50 at 90 and 40 at 110
    expect(t.absGammaStrike).toBe(100);
    expect(t.absGammaMn).toBe(80);
    expect(t.totalAbsMn).toBe(170);
    expect(t.concentrationShare).toBeCloseTo(80 / 170, 10);
  });

  it("ranks strikes largest-first with shares that sum sensibly", () => {
    const t = topology(ROWS);
    expect(t.topStrikes.map((s) => s.strike)).toEqual([100, 90, 110]);
    const total = t.topStrikes.reduce((a, s) => a + s.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("does not depend on the dealer sign convention", () => {
    const flipped = ROWS.map((r) => ({
      ...r,
      gamma_call: -r.gamma_call,
      gamma_put: -r.gamma_put,
      gamma_net: -r.gamma_net,
    }));
    expect(topology(flipped).absGammaStrike).toBe(topology(ROWS).absGammaStrike);
    expect(topology(flipped).totalAbsMn).toBeCloseTo(topology(ROWS).totalAbsMn, 10);
  });

  it("returns nulls for an empty ladder", () => {
    const t = topology([]);
    expect(t.absGammaStrike).toBeNull();
    expect(t.concentrationShare).toBeNull();
    expect(t.topStrikes).toEqual([]);
  });
});

describe("expiryConcentration", () => {
  const EXPS: MscExpiryRow[] = [
    { exp: "2026-08-21", gamma_net: 10, delta_net: 40 },
    { exp: "2026-08-07", gamma_net: 60, delta_net: 200 },
    { exp: "2026-08-14", gamma_net: -30, delta_net: -60 },
  ];

  it("sorts by date rather than trusting payload order", () => {
    expect(expiryConcentration(EXPS).nextExp).toBe("2026-08-07");
  });

  it("computes the front-expiry share of gross gamma", () => {
    const e = expiryConcentration(EXPS);
    // gross = 60 + 30 + 10 = 100
    expect(e.gammaSharePct).toBeCloseTo(60, 10);
    expect(e.concentrated).toBe(true);
  });

  it("previews the book with the front expiration removed", () => {
    const e = expiryConcentration(EXPS);
    expect(e.currentNetMn).toBe(40);
    expect(e.postExpiryNetMn).toBe(-20);
    expect(e.signFlipsOnExpiry).toBe(true);
  });

  it("does not flag a sign flip when the regime survives expiry", () => {
    const calm: MscExpiryRow[] = [
      { exp: "2026-08-07", gamma_net: 10 },
      { exp: "2026-08-14", gamma_net: 90 },
    ];
    const e = expiryConcentration(calm);
    expect(e.signFlipsOnExpiry).toBe(false);
    expect(e.concentrated).toBe(false);
    expect(e.postExpiryNetMn).toBe(90);
  });

  it("has no post-expiry preview with a single expiration", () => {
    const e = expiryConcentration([{ exp: "2026-08-07", gamma_net: 5 }]);
    expect(e.postExpiryNetMn).toBeNull();
    expect(e.signFlipsOnExpiry).toBe(false);
    expect(e.gammaSharePct).toBeCloseTo(100, 10);
  });

  it("returns an honest empty for no expirations", () => {
    const e = expiryConcentration(null);
    expect(e.nExp).toBe(0);
    expect(e.nextExp).toBeNull();
    expect(e.gammaSharePct).toBeNull();
  });

  it("reports a delta share only when the lens is present", () => {
    expect(expiryConcentration([{ exp: "2026-08-07", gamma_net: 5 }]).deltaSharePct).toBeNull();
    expect(expiryConcentration(EXPS).deltaSharePct).not.toBeNull();
  });
});

describe("guardedFlip / isPlausibleFlip", () => {
  it("keeps a flip that sits near spot", () => {
    expect(isPlausibleFlip(752.2, 750.72)).toBe(true);
    expect(guardedFlip(752.2, 750.72)).toBe(752.2);
  });

  it("drops the measured live SPY and QQQ defects", () => {
    // Published 2026-08-01: SPY 275.0 against spot 741.69, QQQ 249.8 against 683.55.
    expect(isPlausibleFlip(275.0, 741.69)).toBe(false);
    expect(guardedFlip(275.0, 741.69)).toBeNull();
    expect(guardedFlip(249.8, 683.55)).toBeNull();
  });

  it("documents the guard's known blind spot: SPX and NVDA survive it", () => {
    // These are ALSO wrong upstream but sit inside ±20%, so the guard cannot catch them.
    // The real repair is MSC R1.1 — this test exists so the limitation stays visible.
    expect(isPlausibleFlip(8676.93, 7437.63)).toBe(true);
    expect(isPlausibleFlip(219.55, 195.04)).toBe(true);
  });

  it("is symmetric about spot and inclusive at the boundary", () => {
    expect(isPlausibleFlip(120, 100)).toBe(true);
    expect(isPlausibleFlip(80, 100)).toBe(true);
    expect(isPlausibleFlip(120.01, 100)).toBe(false);
    expect(isPlausibleFlip(79.99, 100)).toBe(false);
  });

  it("treats missing or nonsensical inputs as not drawable", () => {
    expect(guardedFlip(null, 100)).toBeNull();
    expect(guardedFlip(100, null)).toBeNull();
    expect(guardedFlip(100, 0)).toBeNull();
    expect(guardedFlip(NaN, 100)).toBeNull();
    expect(guardedFlip(100, -5)).toBeNull();
  });
});

describe("buildMarketStructure", () => {
  it("assembles every block from one pass over the payload", () => {
    const ms = buildMarketStructure({
      byStrike: ROWS,
      byExpiry: [{ exp: "2026-08-07", gamma_net: 30 }],
      byStrikeFullN: 40,
      spot: 100,
      levels: [{ key: "call_wall", price: 110 }],
      moves: { expected_move: { band_mult: 2, pct: 4, horizon_days: 1 } },
    });
    expect(ms.agg.windowed).toBe(true);
    expect(ms.sign.naiveNetMn).toBe(30);
    expect(ms.topology.absGammaStrike).toBe(100);
    expect(ms.expiry.nextExp).toBe("2026-08-07");
    expect(ms.em.levels[0].distEm).toBeCloseTo(5, 10);
    expect(ms.scenario.cells.length).toBeGreaterThan(0);
  });

  it("survives a completely empty payload", () => {
    const ms = buildMarketStructure({
      byStrike: null,
      byExpiry: null,
      spot: null,
      levels: [],
      moves: null,
    });
    expect(ms.sign.verdict).toBe("unknown");
    expect(ms.topology.absGammaStrike).toBeNull();
    expect(ms.expiry.nExp).toBe(0);
    expect(ms.em.levels).toEqual([]);
  });
});
