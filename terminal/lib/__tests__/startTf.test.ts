/**
 * Startup timeframe (Settings → Terminal → "Default timeframe on open").
 *
 * Contracts under test:
 *   1. Ships as 3D — a user who never touches the setting opens on 3D.
 *   2. A saved choice is honoured verbatim.
 *   3. Junk (absent / non-string / unparseable / not-a-timeframe) reads as 3D
 *      rather than propagating a bad value into the chart.
 *   4. resolveStartTf demotes a timeframe the landing symbol's market can't
 *      serve (intraday on .TO) to D instead of opening the intraday empty state.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  START_TF_KEY, DEFAULT_START_TF, TF_CANONICAL_ORDER,
  readStartTf, writeStartTf, resolveStartTf, mobileTimeframeOptions,
} from "@/lib/startTf";

// Minimal localStorage stand-in — the module only uses getItem/setItem.
function stubStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  return store;
}

// Mirrors TerminalShell.functionalSet: daily-derived TFs always; intraday only for
// intraday-capable markets (.TO / "ca" is daily-only).
const DAILY = ["D", "2D", "3D", "W", "2W", "1M", "3M"];
const INTRADAY = ["1m", "5m", "15m", "30m", "1h", "2h", "4h"];
const US_FUNCTIONAL = new Set([...DAILY, ...INTRADAY]);
const CA_FUNCTIONAL = new Set(DAILY);

describe("startTf", () => {
  let store: Map<string, string>;
  beforeEach(() => { store = stubStorage(); });
  afterEach(() => { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; });

  it("ships as 3D when nothing is saved", () => {
    expect(DEFAULT_START_TF).toBe("3D");
    expect(readStartTf()).toBe("3D");
  });

  it("round-trips every offered timeframe", () => {
    for (const tf of TF_CANONICAL_ORDER) {
      writeStartTf(tf);
      expect(readStartTf()).toBe(tf);
    }
  });

  it("writes JSON, matching the load() idiom the rest of the Terminal reads with", () => {
    writeStartTf("W");
    expect(store.get(START_TF_KEY)).toBe('"W"');
  });

  it("falls back to 3D on junk", () => {
    for (const bad of ['"4D"', '""', "null", "42", "{}", "not json"]) {
      store.set(START_TF_KEY, bad);
      expect(readStartTf()).toBe("3D");
    }
  });

  it("resolves a saved daily timeframe unchanged on every market", () => {
    expect(resolveStartTf("W", US_FUNCTIONAL)).toBe("W");
    expect(resolveStartTf("W", CA_FUNCTIONAL)).toBe("W");
    expect(resolveStartTf("3D", CA_FUNCTIONAL)).toBe("3D");
  });

  it("keeps an intraday choice on an intraday-capable market", () => {
    expect(resolveStartTf("5m", US_FUNCTIONAL)).toBe("5m");
    expect(resolveStartTf("1h", US_FUNCTIONAL)).toBe("1h");
  });

  it("demotes an intraday choice to D where intraday isn't served (.TO)", () => {
    for (const tf of INTRADAY) expect(resolveStartTf(tf, CA_FUNCTIONAL)).toBe("D");
  });

  it("resolves junk to the 3D default, not to D", () => {
    expect(resolveStartTf(undefined, US_FUNCTIONAL)).toBe("3D");
    expect(resolveStartTf("4D", US_FUNCTIONAL)).toBe("3D");
    expect(resolveStartTf(5, US_FUNCTIONAL)).toBe("3D");
  });

  it("gives the phone wheel every functional granular interval, independent of favourites", () => {
    expect(mobileTimeframeOptions(US_FUNCTIONAL, "3D")).toEqual([
      "1m", "5m", "15m", "30m", "1h", "2h", "4h", "D", "2D", "3D", "W", "2W", "1M", "3M",
    ]);
  });

  it("includes entitled second bars and excludes intervals the active market cannot load", () => {
    const realtimeUs = new Set([...US_FUNCTIONAL, "1s", "5s", "15s", "30s"]);
    expect(mobileTimeframeOptions(realtimeUs, "D").slice(0, 5)).toEqual(["1s", "5s", "15s", "30s", "1m"]);
    expect(mobileTimeframeOptions(CA_FUNCTIONAL, "3D")).toEqual(DAILY);
  });

  it("retains the controlled current value during a cross-market transition", () => {
    expect(mobileTimeframeOptions(CA_FUNCTIONAL, "5m")).toEqual(["5m", ...DAILY]);
  });
});
