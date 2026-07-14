import { describe, it, expect } from "vitest";
import { oracleVerdict, deskVerdict, ORACLE_STALE_DAYS } from "../signalVerdict";

// Frozen "today" so ages are deterministic: 2026-07-14 (the NVDA/GOOGL stale-Sell incident date).
const NOW = Date.parse("2026-07-14T21:00:00Z");

function slice(lastSignal: string, ts: string, price = 100) {
  return { indicator: { signals: [{ ts, type: lastSignal, price }], state: { last_signal: lastSignal } } };
}

describe("oracleVerdict — age, dimming, provenance", () => {
  it("dates and dims a stale slice verdict (NVDA incident shape: SELL 41d old)", () => {
    const v = oracleVerdict("SELL", slice("SELL", "2026-06-03", 205.1), false, NOW);
    expect(v.raw).toBe("SELL");
    expect(v.label).toBe("Sell");
    expect(v.sub).toBe("Jun 3 · 41d ago");
    expect(v.dim).toBe(true);
    expect(v.note).toContain("@ 205.1");
    expect(v.note).toContain("timing overlay");
  });

  it("keeps a fresh signal at full strength, dated", () => {
    const v = oracleVerdict("BUY", slice("BUY", "2026-07-10"), false, NOW);
    expect(v.dim).toBe(false);
    expect(v.sub).toBe("Jul 10 · 4d ago");
    expect(v.color).toBe("var(--buy)");
  });

  it("dim boundary sits at ORACLE_STALE_DAYS calendar days", () => {
    // 2026-06-23 → 21d on NOW: at the threshold, still live
    expect(oracleVerdict("BUY", slice("BUY", "2026-06-23"), false, NOW).dim).toBe(false);
    // 2026-06-22 → 22d: past it, dimmed
    expect(oracleVerdict("BUY", slice("BUY", "2026-06-22"), false, NOW).dim).toBe(true);
    expect(ORACLE_STALE_DAYS).toBe(21);
  });

  it("manifest-only verdict (no slice) renders undated and dimmed — never full-strength", () => {
    const v = oracleVerdict("SELL", null, false, NOW);
    expect(v.label).toBe("Sell");
    expect(v.sub).toBe("undated");
    expect(v.dim).toBe(true);
  });

  it("prefers the slice lane over the manifest and flags lane disagreement", () => {
    // Live incident shape: manifest inherited SELL from a dead run; slice lane says REBUY.
    const v = oracleVerdict("SELL", slice("REBUY", "2026-02-17", 187.67), false, NOW);
    expect(v.raw).toBe("REBUY");
    expect(v.dim).toBe(true); // 147d old — dated, dimmed
    expect(v.note).toContain("lanes disagree");
    expect(v.note).toContain("SELL");
  });

  it("no verdict anywhere → em-dash, not dimmed styling noise", () => {
    const v = oracleVerdict(null, null, false, NOW);
    expect(v.label).toBe("—");
    expect(v.raw).toBeNull();
    expect(v.dim).toBe(false);
  });

  it("zh variant localizes the sub-line", () => {
    const v = oracleVerdict("SELL", slice("SELL", "2026-06-03"), true, NOW);
    expect(v.sub).toContain("41天前");
  });
});

describe("deskVerdict — entry-timing honesty mapping", () => {
  const intel = (
    lean: { dir?: string; band?: string; entry?: string; score?: number },
    asof: string | null = "2026-07-10",
    aj?: { verdict?: string },
  ) => ({
    tape: { ai_lean: lean, asof },
    cards: aj ? { ai_judgment: aj } : {},
  });

  it('band=low BEAR with a non-exit entry renders "No setup" in neutral, with the as-of date', () => {
    // Live incident shape: NVDA dir=BEAR score=9 band=low entry=bounce_wait, asof Fri 07-10.
    const v = deskVerdict(intel({ dir: "BEAR", band: "low", entry: "bounce_wait", score: 9 }), false, NOW);
    expect(v.label).toBe("No setup");
    expect(v.raw).toBe("NO_SETUP");
    expect(v.color).toBe("var(--muted)");
    expect(v.sub).toBe("as of Jul 10 · 4d");
    expect(v.note).toContain("not a short call");
    expect(v.note).toContain("conviction 9/100");
  });

  it("entry=exit / entry=topping keep the real Bearish label", () => {
    for (const entry of ["exit", "topping"]) {
      const v = deskVerdict(intel({ dir: "BEAR", band: "low", entry }), false, NOW);
      expect(v.label).toBe("Bearish");
      expect(v.color).toBe("var(--sell)");
    }
  });

  it("legacy BEAR without band/entry fields stays Bearish (no unsupported softening)", () => {
    const v = deskVerdict(intel({ dir: "BEAR" }), false, NOW);
    expect(v.label).toBe("Bearish");
    expect(v.raw).toBe("BEAR");
  });

  it("BULL and missing-lean behavior unchanged", () => {
    expect(deskVerdict(intel({ dir: "BULL", band: "high", entry: "buy_now" }), false, NOW).label).toBe("Bullish");
    expect(deskVerdict(null, false, NOW).label).toBe("Neutral");
    expect(deskVerdict(null, true, NOW).label).toBe("中性");
  });

  it("flags sources-disagree when ai_judgment reads constructive under a real BEAR", () => {
    const v = deskVerdict(
      intel({ dir: "BEAR", band: "low", entry: "exit" }, "2026-07-10", { verdict: "Constructive — building a base" }),
      false,
      NOW,
    );
    expect(v.label).toBe("Bearish");
    expect(v.note).toContain("sources disagree");
  });

  it('zh "No setup" variant', () => {
    const v = deskVerdict(intel({ dir: "BEAR", band: "low", entry: "bounce_wait", score: 8 }), true, NOW);
    expect(v.label).toBe("无买点");
    expect(v.sub).toContain("数据截至");
  });
});
