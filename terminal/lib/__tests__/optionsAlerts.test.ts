import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import {
  evalGammaFlipCross,
  evalWallProximity,
  evalPremiumBurst,
  eval0dteShare,
  sessionSlopeStats,
  optAlertPreview,
  buildOptCondition,
  type GexState,
  type GexPayload,
  type TidePayload,
  type DtePayload,
} from "../optionsAlerts";

const DATA = path.join(process.cwd(), "public", "data");
const readFixture = async (name: string) => JSON.parse(await fs.readFile(path.join(DATA, name), "utf8"));

// ─── (a) gamma-flip cross ────────────────────────────────────────────────────
describe("evalGammaFlipCross — hysteresis state machine", () => {
  const gs = (spot: number, flip = 748.25): GexState => ({ root: "SPY", spot, gamma_flip: flip, asof: "2026-07-10T06:21Z" });
  const cond = { type: "opt_gamma_flip" as const, root: "SPY", band_pct: 0.05 };

  it("first observation arms without firing (records side)", () => {
    const r = evalGammaFlipCross(cond, gs(751.71), {});
    expect(r.fired).toBe(false);
    expect(r.nextState.side).toBe("above");
    expect(r.value).toBe(751.71);
  });

  it("below→above fires once with 'crossed above' + the level", () => {
    // clear the band decisively: 748.25 → 752 is +0.5% > 0.05% band.
    const r = evalGammaFlipCross(cond, gs(752), { side: "below" });
    expect(r.fired).toBe(true);
    expect(r.note).toContain("crossed above");
    expect(r.note).toContain("748.25");
    expect(r.note).toContain("long-gamma");
    expect(r.note).toContain("as of");
    expect(r.value).toBe(752);
    expect(r.nextState.side).toBe("above");
  });

  it("above→below fires 'crossed below'", () => {
    const r = evalGammaFlipCross(cond, gs(744), { side: "above" });
    expect(r.fired).toBe(true);
    expect(r.note).toContain("crossed below");
    expect(r.note).toContain("short-gamma");
    expect(r.nextState.side).toBe("below");
  });

  it("hysteresis: a spot inside the dead-band after a confirmed side does NOT flip or fire", () => {
    // prior side above; spot dips just below flip but within 0.05% band → hold "above".
    // 748.25 * 0.0005 = 0.374 → 748.0 is 0.033% below, inside the band.
    const r = evalGammaFlipCross(cond, gs(748.0), { side: "above" });
    expect(r.fired).toBe(false);
    expect(r.nextState.side).toBe("above"); // held, not flipped
  });

  it("repeated same-side evals do not refire", () => {
    const first = evalGammaFlipCross(cond, gs(752), { side: "below" });
    expect(first.fired).toBe(true);
    const again = evalGammaFlipCross(cond, gs(753), first.nextState);
    expect(again.fired).toBe(false);
    expect(again.nextState.side).toBe("above");
  });

  it("missing spot or flip → fired:null (cannot evaluate), state untouched", () => {
    expect(evalGammaFlipCross(cond, { root: "SPY", gamma_flip: 748.25 }, { side: "below" }).fired).toBeNull();
    expect(evalGammaFlipCross(cond, { root: "SPY", spot: 752 }, { side: "below" }).fired).toBeNull();
    const r = evalGammaFlipCross(cond, {}, { side: "below" });
    expect(r.fired).toBeNull();
    expect(r.note).toContain("unavailable");
    expect(r.nextState.side).toBe("below"); // preserved
  });
});

// ─── (b) wall proximity ──────────────────────────────────────────────────────
describe("evalWallProximity — enter/leave state machine", () => {
  // NVDA fixture shape: call_wall 150, put_wall 120, spot_ref varies.
  const gx = (spot: number): GexPayload => ({ root: "NVDA", spot_ref: spot, call_wall: 150, put_wall: 120, asof: "2026-07-05T16:05:00Z" });
  const cond = { type: "opt_wall_touch" as const, root: "NVDA", wall: "call" as const, within_pct: 0.25 };

  it("first observation while OUTSIDE arms (no fire)", () => {
    const r = evalWallProximity(cond, gx(135.7), {}); // 9.5% away
    expect(r.fired).toBe(false);
    expect(r.nextState.inside).toBe(false);
  });

  it("first observation while INSIDE arms (no fire — created near the wall must not fire)", () => {
    const r = evalWallProximity(cond, gx(149.9), {}); // inside 0.25%
    expect(r.fired).toBe(false);
    expect(r.nextState.inside).toBe(true);
  });

  it("ENTER (false→true) fires once, note says EOD", () => {
    const r = evalWallProximity(cond, gx(149.8), { inside: false }); // 0.133% away
    expect(r.fired).toBe(true);
    expect(r.note).toContain("EOD");
    expect(r.note).toContain("call wall");
    expect(r.note).toContain("150");
    expect(r.value).toBe(149.8);
    expect(r.nextState.inside).toBe(true);
  });

  it("staying inside does not refire", () => {
    const r = evalWallProximity(cond, gx(149.85), { inside: true });
    expect(r.fired).toBe(false);
    expect(r.nextState.inside).toBe(true);
  });

  it("leave then re-enter fires again", () => {
    const enter1 = evalWallProximity(cond, gx(149.8), { inside: false });
    expect(enter1.fired).toBe(true);
    const leave = evalWallProximity(cond, gx(145), enter1.nextState); // 3.3% away
    expect(leave.fired).toBe(false);
    expect(leave.nextState.inside).toBe(false);
    const enter2 = evalWallProximity(cond, gx(149.8), leave.nextState);
    expect(enter2.fired).toBe(true);
  });

  it("put wall reads put_wall", () => {
    const putCond = { type: "opt_wall_touch" as const, root: "NVDA", wall: "put" as const, within_pct: 0.25 };
    const r = evalWallProximity(putCond, gx(120.2), { inside: false }); // 0.167% from 120
    expect(r.fired).toBe(true);
    expect(r.note).toContain("put wall");
    expect(r.note).toContain("120");
  });

  it("missing wall → fired:null", () => {
    const r = evalWallProximity(cond, { root: "NVDA", spot_ref: 149.8, put_wall: 120 }, { inside: false });
    expect(r.fired).toBeNull();
    expect(r.note).toContain("unavailable");
  });
});

// ─── (c) premium burst ───────────────────────────────────────────────────────
describe("sessionSlopeStats — z-math on cumulative series", () => {
  it("hand-computed case: cumulative [0..5,20], window 1 → z ≈ 2.236", () => {
    const s = sessionSlopeStats([0, 1, 2, 3, 4, 5, 20], 1);
    expect(s.n).toBe(6);
    expect(s.mean).toBeCloseTo(3.333333, 5);
    expect(s.std).toBeCloseTo(5.217492, 5);
    expect(s.recentMean).toBe(15);
    expect(s.z).toBeCloseTo(2.236068, 5);
  });

  it("same series, window 3 → z ≈ 0.447 (below a 2σ gate)", () => {
    const s = sessionSlopeStats([0, 1, 2, 3, 4, 5, 20], 3);
    expect(s.z).toBeCloseTo(0.447214, 5);
  });

  it("flat cumulative series → std 0 → z NaN", () => {
    const s = sessionSlopeStats([5, 5, 5, 5, 5], 2);
    expect(s.std).toBe(0);
    expect(Number.isNaN(s.z)).toBe(true);
  });
});

describe("evalPremiumBurst — pace alert", () => {
  const cond = { type: "opt_premium_burst" as const, root: "SPY", leg: "ncp" as const, window_min: 1, z: 2 };
  // 12 minutes of a steady +1M/min cumulative slope, then one +15M spike minute.
  const steady = (): TidePayload => {
    const minutes = [];
    let v = 0;
    for (let i = 0; i < 12; i++) {
      minutes.push({ t: `09:${String(30 + i).padStart(2, "0")}`, ncp: v, npp: -v });
      v += 1_000_000;
    }
    return { minutes, asof: "2026-07-05T15:42:00Z", session_date: "2026-07-05" };
  };
  const withSpike = (): TidePayload => {
    const base = steady();
    const mins = base.minutes!.slice();
    const last = mins[mins.length - 1];
    mins.push({ t: "09:42", ncp: last.ncp + 15_000_000, npp: last.npp - 15_000_000 });
    return { ...base, minutes: mins };
  };

  it("an injected slope spike fires with z ≥ threshold and 'unusual pace'", () => {
    const r = evalPremiumBurst(cond, withSpike(), {});
    expect(r.fired).toBe(true);
    expect(r.note).toContain("unusual pace");
    expect(r.note).toContain("net-call premium");
    expect(r.note).toContain("intraday tape");
    expect(r.value).not.toBeNull();
    expect(Math.abs(r.value as number)).toBeGreaterThanOrEqual(2);
    expect(r.nextState.lastFiredT).toBe("09:42");
  });

  it("npp leg labels net-put premium", () => {
    const r = evalPremiumBurst({ ...cond, leg: "npp" }, withSpike(), {});
    // npp is the mirror (-v then -15M) — magnitude spike is symmetric, so it fires.
    expect(r.fired).toBe(true);
    expect(r.note).toContain("net-put premium");
  });

  it("a noisy-but-unremarkable slope does NOT fire (variance present, no spike)", () => {
    // Small deterministic jitter around +1M/min → std > 0 but the last minute is
    // NOT anomalous, so |z| < 2. (A perfectly constant slope is std 0 → the
    // 'flat tape' null branch, covered separately below.)
    const minutes = [];
    let v = 0;
    const step = [1_050_000, 950_000, 1_100_000, 900_000, 1_000_000, 1_050_000, 980_000, 1_020_000, 960_000, 1_040_000, 990_000, 1_010_000, 1_000_000];
    for (let i = 0; i < step.length; i++) {
      minutes.push({ t: `09:${String(30 + i).padStart(2, "0")}`, ncp: v, npp: -v });
      v += step[i];
    }
    const r = evalPremiumBurst(cond, { minutes, asof: "2026-07-05T15:42:00Z" }, {});
    expect(r.fired).toBe(false);
    expect(Math.abs(r.value as number)).toBeLessThan(2);
  });

  it("idempotent per identical latest stamp — refire is suppressed", () => {
    const spike = withSpike();
    const first = evalPremiumBurst(cond, spike, {});
    expect(first.fired).toBe(true);
    const again = evalPremiumBurst(cond, spike, first.nextState);
    expect(again.fired).toBe(false); // same latest T
  });

  it("too few points → fired:null", () => {
    const short: TidePayload = { minutes: [{ t: "09:30", ncp: 1, npp: -1 }, { t: "09:31", ncp: 2, npp: -2 }], asof: "x" };
    const r = evalPremiumBurst({ ...cond, window_min: 10 }, short, {});
    expect(r.fired).toBeNull();
    expect(r.note).toContain("not enough tape");
  });

  it("flat tape (std 0) → fired:null", () => {
    const minutes = [];
    for (let i = 0; i < 14; i++) minutes.push({ t: `09:${String(30 + i).padStart(2, "0")}`, ncp: 5_000_000, npp: -5_000_000 });
    const r = evalPremiumBurst(cond, { minutes, asof: "x" }, {});
    expect(r.fired).toBeNull();
    expect(r.note).toContain("flat tape");
  });
});

// ─── (d) 0DTE share ──────────────────────────────────────────────────────────
describe("eval0dteShare — 0DTE net-premium share", () => {
  const cond = { type: "opt_0dte_spike" as const, root: "SPY", share_pct: 55 };
  // Two buckets; 0d dominates at the latest stamp.
  const bigShare = (): DtePayload => ({
    asof: "2026-07-05T15:42:00Z",
    buckets: {
      "0d": [
        { t: "09:30", ncp: 100, npp: 50 },
        { t: "09:40", ncp: 8_000_000, npp: -1_000_000 },
      ],
      "1_7d": [
        { t: "09:30", ncp: 200, npp: 100 },
        { t: "09:40", ncp: 500_000, npp: -300_000 },
      ],
    },
  });

  it("a large 0d share fires", () => {
    // at 09:40: |8M|+|1M|=9M over 9M+0.8M=9.8M → 91.8% ≥ 55.
    const r = eval0dteShare(cond, bigShare(), {});
    expect(r.fired).toBe(true);
    expect(r.note).toContain("0DTE share");
    expect(r.note).toContain("10-min DTE tape");
    expect(r.value).toBeGreaterThanOrEqual(55);
    expect(r.nextState.lastFiredT).toBe("09:40");
  });

  it("a small 0d share does not fire", () => {
    const small: DtePayload = {
      asof: "x",
      buckets: {
        "0d": [{ t: "09:40", ncp: 100_000, npp: 0 }],
        "1_7d": [{ t: "09:40", ncp: 9_000_000, npp: 0 }],
      },
    };
    const r = eval0dteShare(cond, small, {});
    expect(r.fired).toBe(false); // ~1.1%
    expect(r.value).toBeLessThan(55);
  });

  it("absent '0d' bucket → fired:null (HONEST DISABLE, never fabricated)", () => {
    const no0d: DtePayload = { asof: "x", buckets: { "1_7d": [{ t: "09:40", ncp: 1, npp: 1 }] } };
    const r = eval0dteShare(cond, no0d, {});
    expect(r.fired).toBeNull();
    expect(r.note).toContain("0DTE split unavailable");
  });

  it("no buckets at all → fired:null", () => {
    expect(eval0dteShare(cond, {}, {}).fired).toBeNull();
    expect(eval0dteShare(cond, { buckets: {} }, {}).fired).toBeNull();
  });

  it("idempotent per stamp", () => {
    const big = bigShare();
    const first = eval0dteShare(cond, big, {});
    expect(first.fired).toBe(true);
    const again = eval0dteShare(cond, big, first.nextState);
    expect(again.fired).toBe(false);
  });
});

// ─── real-fixture smoke: each type parses the committed fixture shape ─────────
describe("real fixtures parse into each evaluator without throwing", () => {
  it("gexstate_fixture feeds gamma-flip (arms on first obs)", async () => {
    const gs = (await readFixture("gexstate_fixture.json")) as GexState;
    const r = evalGammaFlipCross({ type: "opt_gamma_flip", root: gs.root }, gs, {});
    // spot 751.71 ≥ flip 748.25 → side "above", arming
    expect(r.fired).toBe(false);
    expect(r.nextState.side).toBe("above");
  });

  it("gex_fixture[NVDA] feeds wall proximity", async () => {
    const all = (await readFixture("gex_fixture.json")) as Record<string, GexPayload>;
    const gx = all.NVDA;
    const r = evalWallProximity({ type: "opt_wall_touch", root: "NVDA", wall: "call" }, gx, {});
    // spot_ref 135.7 vs call_wall 150 → far outside → arms false, evaluable (not null)
    expect(r.fired).toBe(false);
    expect(r.value).toBe(gx.spot_ref);
  });

  it("tide_fixture feeds premium burst (evaluable — not null)", async () => {
    const tide = (await readFixture("tide_fixture.json")) as TidePayload;
    const r = evalPremiumBurst({ type: "opt_premium_burst", root: "SPY", leg: "ncp" }, tide, {});
    expect(r.fired).not.toBeNull(); // 390 cumulative minutes → z is computable
  });

  it("dte_fixture feeds 0DTE share (0d present → evaluable, not null)", async () => {
    const dte = (await readFixture("dte_fixture.json")) as DtePayload;
    const r = eval0dteShare({ type: "opt_0dte_spike", root: "SPY" }, dte, {});
    expect(r.fired).not.toBeNull(); // 0d bucket IS present
    expect(typeof r.value).toBe("number"); // real share (~8% on this fixture)
  });
});

// ─── UI helpers ──────────────────────────────────────────────────────────────
describe("optAlertPreview + buildOptCondition", () => {
  it("previews are plain-word and carry no banned vocabulary", () => {
    const banned = /\b(signal|buy|sell|validated)\b/i;
    for (const [kind, extra] of [
      ["opt_gamma_flip", {}],
      ["opt_wall_touch", { wall: "call", within_pct: 0.25 }],
      ["opt_premium_burst", { leg: "ncp" }],
      ["opt_0dte_spike", { share_pct: 55 }],
    ] as const) {
      const cond = buildOptCondition(kind, "SPY", extra as any);
      const en = optAlertPreview(cond, "en");
      const zh = optAlertPreview(cond, "zh");
      expect(en).toContain("SPY");
      expect(en).not.toMatch(banned);
      expect(zh).toContain("SPY");
      expect(zh).toMatch(/[一-鿿]/); // has Chinese
    }
  });

  it("buildOptCondition emits the fields each evaluator reads, root upper-cased", () => {
    expect(buildOptCondition("opt_gamma_flip", "spy", { band_pct: 0.1 })).toEqual({ type: "opt_gamma_flip", root: "SPY", band_pct: 0.1 });
    expect(buildOptCondition("opt_wall_touch", "qqq", { wall: "put", within_pct: 0.3 })).toEqual({ type: "opt_wall_touch", root: "QQQ", wall: "put", within_pct: 0.3 });
    expect(buildOptCondition("opt_premium_burst", "iwm", { leg: "npp", window_min: 15, z: 2.5 })).toEqual({ type: "opt_premium_burst", root: "IWM", leg: "npp", window_min: 15, z: 2.5 });
    expect(buildOptCondition("opt_0dte_spike", "spy", { share_pct: 60 })).toEqual({ type: "opt_0dte_spike", root: "SPY", share_pct: 60 });
  });

  it("omitted numeric params fall through to evaluator defaults (field absent in condition)", () => {
    const c = buildOptCondition("opt_gamma_flip", "SPY", {});
    expect(c).toEqual({ type: "opt_gamma_flip", root: "SPY" }); // no band_pct → evaluator uses 0.05
    // preview still renders defaults
    expect(optAlertPreview(c, "en")).toContain("crosses its gamma flip");
  });
});
