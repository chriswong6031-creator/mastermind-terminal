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

  it("anchors the verdict on the newest marker the engine did not refuse (pending counts)", () => {
    // A fresh pending BUY is a real, unrefused cross event — it IS the current read; the
    // old behavior hid it behind a 41d-old SELL (the stale-verdict disease this fixes).
    const v = oracleVerdict(
      "SELL",
      sliceOf("SELL", [
        { ts: "2026-06-03", type: "SELL", price: 205.1 },
        { ts: "2026-07-13", type: "BUY", price: 314.86, quality: "pending" },
      ]),
      false,
      NOW,
    );
    expect(v.raw).toBe("BUY");
    expect(v.sub).toBe("Jul 13 · 1d ago");
    expect(v.note).toContain("@ 314.86");
    expect(v.note).toContain("pending");
  });

  it("a regime_blocked tail NEVER anchors the verdict (META incident shape)", () => {
    // META 2026-07-15 live shape: blocked REBUY + blocked BUY after the May SELL rendered
    // as a full-authority green "Buy · Jul 6" for a signal the engine explicitly refused.
    const v = oracleVerdict(
      "SELL",
      sliceOf("BUY", [
        { ts: "2026-05-04", type: "SELL", price: 612.31 },
        { ts: "2026-05-26", type: "REBUY", price: 634.7, quality: "regime_blocked" },
        { ts: "2026-07-06", type: "BUY", price: 603.12, quality: "regime_blocked", quality_reason: "bear_block: monthly-bear & below-200 & 2W-not-bull" },
      ]),
      false,
      NOW,
    );
    expect(v.raw).toBe("SELL");          // the newest UNREFUSED marker
    expect(v.sub).toContain("May 4");    // dated from the SELL, not the blocked BUY
    expect(v.label).not.toBe("Buy");
  });

  it("a fresh RECLAIM renders as a soft (unscored) Re-entry verdict", () => {
    const v = oracleVerdict(
      "SELL", // scored manifest lane still says SELL — expected, must NOT note lane disagreement
      sliceOf("RECLAIM", [
        { ts: "2026-06-08", type: "SELL", price: 290.55 },
        { ts: "2026-07-13", type: "RECLAIM", price: 327.5, quality: "reclaim", quality_reason: "trend reclaimed the 2026-06-08 sell level" },
      ]),
      false,
      NOW,
    );
    expect(v.label).toBe("Re-entry");
    expect(v.raw).toBe("RECLAIM");
    expect(v.color).toBe("var(--buy)");
    expect(v.soft).toBe(true);
    expect(v.sub).toBe("Jul 13 · 1d ago");
    expect(v.note).toContain("unscored");
    expect(v.note).toContain("reclaimed");
    expect(v.note).not.toContain("lanes disagree");
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

describe("oracleVerdict — stance-first render when the event is history", () => {
  // The five 2026-07-15 ground-truth state shapes (see docs/ORACLE_DESK_DIAGNOSIS).
  const stSlice = (state: Record<string, unknown>, signals: Sig[]) => ({ indicator: { state, signals } });

  it("AAPL shape: stale SELL + strong_bull flat state → Strong-uptrend stance, SELL demoted to a dated echo", () => {
    const v = oracleVerdict(
      "SELL",
      stSlice(
        { last_signal: "SELL", last_scored_signal: "SELL", position_hint: "flat", strong_bull: true, overbought: false, weeklyBull: true, above200: true },
        [{ ts: "2026-06-08", type: "SELL", price: 290.55 }],
      ),
      false, NOW, "UPTREND",
    );
    expect(v.stance).toBe(true);
    expect(v.label).toBe("Strong uptrend — awaiting pullback entry");
    expect(v.color).toBe("var(--up)");
    expect(v.dim).toBe(false);
    expect(v.sub).toBe("● Sell · Jun 8 · 36d ago");   // the event stays visible, dated
    expect(v.note).toContain("not a trade signal");
  });

  it("blocked tail rides the stance tooltip as 'blocked — not an entry'", () => {
    const v = oracleVerdict(
      "SELL",
      stSlice(
        { last_signal: "BUY", last_scored_signal: "SELL", position_hint: "flat", strong_bull: false, overbought: true, weeklyBull: true, above200: true },
        [
          { ts: "2026-05-04", type: "SELL", price: 612.31 },
          { ts: "2026-07-06", type: "BUY", price: 603.12, quality: "regime_blocked" },
        ],
      ),
      false, NOW,
    );
    expect(v.stance).toBe(true);
    expect(v.label).toBe("Extended — don't chase");
    expect(v.color).toBe("var(--warn)");              // caution: non-flipping accent
    expect(v.note).toContain("blocked — not an entry");
  });

  it("MSFT shape: flat below-200 weak state → Downtrend stance on --down", () => {
    const v = oracleVerdict(
      "SELL",
      stSlice(
        { last_signal: "SELL", last_scored_signal: "SELL", position_hint: "flat", strong_bull: false, overbought: false, weeklyBull: true, above200: false },
        [{ ts: "2026-06-08", type: "SELL", price: 403.41 }],
      ),
      false, NOW, "DOWNTREND",
    );
    expect(v.stance).toBe(true);
    expect(v.label).toBe("Downtrend — stand aside");
    expect(v.color).toBe("var(--down)");
  });

  it("long + strong_bull stale state → Hold — long bias", () => {
    const v = oracleVerdict(
      "BUY",
      stSlice(
        { last_signal: "BUY", last_scored_signal: "BUY", position_hint: "long", strong_bull: true, overbought: false, weeklyBull: true, above200: true },
        [{ ts: "2026-04-09", type: "BUY", price: 321.12 }],
      ),
      false, NOW,
    );
    expect(v.stance).toBe(true);
    expect(v.label).toBe("Hold — long bias");
    expect(v.sub).toContain("● Buy · Apr 9");
  });

  it("a bare {last_signal} legacy state has no regime to stand on → dated dim render, no stance", () => {
    const v = oracleVerdict("SELL", slice("SELL", "2026-06-03", 205.1), false, NOW);
    expect(v.stance).toBeUndefined();
    expect(v.dim).toBe(true);
    expect(v.label).toBe("Sell");
  });

  it("zh stance strings ship", () => {
    const v = oracleVerdict(
      "SELL",
      stSlice(
        { last_signal: "SELL", last_scored_signal: "SELL", position_hint: "flat", strong_bull: true, overbought: false, weeklyBull: true, above200: true },
        [{ ts: "2026-06-08", type: "SELL", price: 290.55 }],
      ),
      true, NOW, "UPTREND",
    );
    expect(v.label).toBe("强势上行 — 等回调买点");
    expect(v.note).toContain("非交易信号");
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
    // the desk score is name_score.potential_score = dip-entry readiness — labeled honestly
    // (it is NOT conviction: MSFT scores 70 while below its 200d BECAUSE it is washed out)
    expect(v.note).toContain("dip-entry readiness 9/100");
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

  it("NEUTRAL with a known entry posture renders the posture, not a blank Neutral", () => {
    // The five 2026-07-13 Mag7 leans all read dir=NEUTRAL band=neutral — an entry-timing
    // read the old card rendered as an opinion-shaped "Neutral".
    const cases: Array<[string, string]> = [
      ["await_confluence", "Awaiting confluence"],
      ["wait_pullback", "Wait for pullback"],
      ["bounce_wait", "Bounce unconfirmed — wait"],
    ];
    for (const [entry, label] of cases) {
      const v = deskVerdict(intel({ dir: "NEUTRAL", band: "neutral", entry, score: 42 }), false, NOW);
      expect(v.label).toBe(label);
      expect(v.color).toBe("var(--signal)");
      expect(v.raw).toBe("NEUTRAL");
      expect(v.note).toContain("entry-timing read");
      expect(v.note).toContain("dip-entry readiness 42/100");
    }
    // unknown entry vocab still falls through to Neutral (no invented posture)
    expect(deskVerdict(intel({ dir: "NEUTRAL", band: "neutral", entry: "mystery" }), false, NOW).label).toBe("Neutral");
    // zh posture
    expect(deskVerdict(intel({ dir: "NEUTRAL", band: "neutral", entry: "await_confluence" }), true, NOW).label).toBe("等待共振触发");
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
