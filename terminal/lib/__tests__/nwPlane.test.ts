import { describe, expect, it } from "vitest";
import {
  cortexTone,
  isStalePlane,
  liqLabel,
  prettyToken,
  verdictTone,
  volLabel,
} from "../nwPlane";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-10T12:00:00Z");

describe("isStalePlane", () => {
  it("honors the producer's stale flag", () => {
    expect(isStalePlane({ stale: true, asof: "2026-07-10" }, NOW)).toBe(true);
  });
  it("fresh asof within 4 days is not stale", () => {
    expect(isStalePlane({ stale: false, asof: "2026-07-08" }, NOW)).toBe(false);
  });
  it("asof older than 4 days is stale (Mastermind bot convention)", () => {
    expect(isStalePlane({ stale: false, asof: "2026-07-01" }, NOW)).toBe(true);
    // boundary: exactly 4 days old is still fresh
    expect(isStalePlane({ stale: false, asof: "2026-07-06" }, NOW - (NOW % DAY))).toBe(false);
  });
  it("accepts full ISO asof timestamps", () => {
    expect(isStalePlane({ asof: "2026-07-09T22:00:00Z" }, NOW)).toBe(false);
    expect(isStalePlane({ asof: "2026-06-30T22:00:00Z" }, NOW)).toBe(true);
  });
  it("missing/garbled asof falls back to the stale flag only", () => {
    expect(isStalePlane({}, NOW)).toBe(false);
    expect(isStalePlane({ asof: "not-a-date" }, NOW)).toBe(false);
  });
});

describe("tones", () => {
  it("maps verdicts to display tones", () => {
    expect(verdictTone("RISK_ON")).toBe("up");
    expect(verdictTone("RISK_OFF")).toBe("down");
    expect(verdictTone("NEUTRAL")).toBe("warn");
    expect(verdictTone("SOMETHING_NEW")).toBe("muted");
    expect(verdictTone(undefined)).toBe("muted");
  });
  it("maps cortex status to display tones", () => {
    expect(cortexTone("ok")).toBe("up");
    expect(cortexTone("degraded")).toBe("warn");
    expect(cortexTone("error")).toBe("down");
    expect(cortexTone(undefined)).toBe("muted");
  });
});

describe("labels", () => {
  it("prettifies snake_case tokens", () => {
    expect(prettyToken("stress_liquidity_expansion")).toBe("Stress Liquidity Expansion");
    expect(prettyToken(undefined)).toBe("—");
  });
  it("translates known tokens and falls back to prettified English", () => {
    expect(volLabel("normalizing", "en")).toBe("Normalizing");
    expect(volLabel("normalizing", "zh")).toBe("回归正常");
    expect(volLabel("brand_new_state", "zh")).toBe("Brand New State");
    expect(liqLabel("stress_liquidity_expansion", "en")).toBe("Stress Expansion");
    expect(liqLabel("stress_liquidity_expansion", "zh")).toBe("压力式扩张");
    expect(liqLabel("expanding", "zh")).toBe("扩张");
  });
});
