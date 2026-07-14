import { describe, it, expect } from "vitest";
import { oracleVerdict, deskVerdict, ORACLE_STALE_DAYS } from "../signalVerdict";

// Frozen "today" so ages are deterministic: 2026-07-14 (the NVDA/GOOGL stale-Sell incident date).
const NOW = Date.parse("2026-07-14T21:00:00Z");

type Sig = { ts: string; type?: string; price?: number | null; quality?: string | null; quality_reason?: string | null };

function sliceOf(lastSignal: string, signals: Sig[]) {
  return { indicator: { signals, state: { last_signal: lastSignal } } };
}
function slice(lastSignal: string, ts: string, price = 100) {
  return sliceOf(lastSignal, [{ ts, type: lastSignal, price }]);
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

  it("dates the verdict from the newest marker of the MATCHING type, not the raw tail", () => {
    // Tail carries a soft marker of another type (AAPL live shape: pending BUY after SELLs).
    const v = oracleVerdict(
      "SELL",
      sliceOf("SELL", [
        { ts: "2026-06-03", type: "SELL", price: 205.1 },
        { ts: "2026-07-13", type: "BUY", price: 314.86, quality: "pending" },
      ]),
      false,
      NOW,
    );
    expect(v.raw).toBe("SELL");
    expect(v.sub).toBe("Jun 3 · 41d ago"); // NOT Jul 13
    expect(v.note).toContain("@ 205.1"); // NOT 314.86
  });

  it("annotates engine-flagged soft signals (quality pending/block) in the tooltip", () => {
    const v = oracleVerdict(
      "BUY",
      sliceOf("BUY", [{ ts: "2026-07-13", type: "BUY", price: 314.86, quality: "pending", quality_reason: "pending confirmation" }]),
      false,
      NOW,
    );
    expect(v.label).toBe("Buy");
    expect(v.dim).toBe(false); // fresh — dimming stays age-driven; quality rides the note
    expect(v.note).toContain("pending confirmation");
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

  it('band=low BEAR with a MISSING entry also renders "No setup" (upstream emits BEAR on band alone)', () => {
    const v = deskVerdict(intel({ dir: "BEAR", band: "low", score: 12 }), false, NOW);
    expect(v.label).toBe("No setup");
    expect(v.raw).toBe("NO_SETUP");
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

  it("a stale tape as-of dims the desk half too (symmetric with the oracle threshold)", () => {
    // 43 days old — would only ship if the intel cron stalled; must not render full-strength.
    const stale = deskVerdict(intel({ dir: "BEAR", band: "low", entry: "bounce_wait" }, "2026-06-01"), false, NOW);
    expect(stale.label).toBe("No setup");
    expect(stale.dim).toBe(true);
    const fresh = deskVerdict(intel({ dir: "BULL", band: "high", entry: "buy_now" }, "2026-07-13"), false, NOW);
    expect(fresh.dim).toBe(false);
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
