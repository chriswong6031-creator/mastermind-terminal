import { describe, it, expect } from "vitest";
import { oracleVerdict, deskVerdict, ORACLE_STALE_DAYS, anchorSignal, signalKnownTs, SOFT_Q } from "../signalVerdict";

// Frozen "today" so ages are deterministic: 2026-07-14 (the NVDA/GOOGL stale-Sell incident date).
const NOW = Date.parse("2026-07-14T21:00:00Z");

type Sig = { ts: string; known_ts?: string | null; type?: string; price?: number | null; quality?: string | null; quality_reason?: string | null; scored?: boolean | null };

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
    expect(v.sub).toBe("Jun 3");
    expect(v.dim).toBe(true);
    expect(v.note).toContain("@ 205.1");
    expect(v.note).toContain("timing overlay");
  });

  it("keeps a fresh signal at full strength, dated", () => {
    const v = oracleVerdict("BUY", slice("BUY", "2026-07-10"), false, NOW);
    expect(v.dim).toBe(false);
    expect(v.sub).toBe("Jul 10");
    expect(v.color).toBe("var(--buy)");
  });

  it("uses the availability date for Costco while preserving the 3D chart date", () => {
    const cost = {
      ts: "2026-07-24",
      known_ts: "2026-07-28",
      type: "BUY",
      price: 966.58,
      quality: "take",
    };
    const v = oracleVerdict(
      "BUY",
      sliceOf("BUY", [cost]),
      false,
      Date.parse("2026-07-29T21:00:00Z"),
    );
    expect(signalKnownTs(cost)).toBe("2026-07-28");
    expect(v.sub).toBe("Jul 28");
    expect(v.dim).toBe(false);
    expect(v.note).toContain("@ 966.58");
  });

  it("falls back to the chart date for legacy slices without known_ts", () => {
    expect(signalKnownTs({ ts: "2026-07-24" })).toBe("2026-07-24");
    expect(signalKnownTs({ ts: "2026-07-24", known_ts: "not-a-date" })).toBe("2026-07-24");
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
    expect(v.sub).toBe("Jul 13");
    expect(v.note).toContain("@ 314.86");
    expect(v.note).toContain("pending");
  });

  it("a regime_blocked tail NEVER anchors as the event — a fresh one renders the amber blocked-entry caution", () => {
    // META 2026-07-15 live shape: blocked REBUY + blocked BUY after the May SELL once
    // rendered as a full-authority green "Buy · Jul 6" for a signal the engine explicitly
    // refused. Since the 600547.SS washout fix the fresh refused trigger is surfaced
    // first-class — but as an amber caution that can never read as a Buy.
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
    expect(v.raw).toBe("BLOCKED_ENTRY"); // never the event type — no consumer can anchor on it
    expect(v.label).toBe("Entry trigger — regime-blocked");
    expect(v.label).not.toBe("Buy");
    expect(v.color).toBe("var(--signal)"); // amber caution rung, never green
    expect(v.soft).toBe(true);             // hollow glyph — no scored authority
    expect(v.sub).toBe("Jul 6");           // dated from the refused trigger
    expect(v.dim).toBe(false);
    expect(v.note).toContain("not an entry");
    expect(v.note).toContain("bear_block: monthly-bear & below-200 & 2W-not-bull");
    expect(v.note).toContain("@ 603.12");
    expect(v.note).toContain("last signal: Sell · May 4 @ 612.31");
  });

  it("a STALE regime_blocked tail keeps the old contract: never anchors, dated render from the unrefused marker", () => {
    const v = oracleVerdict(
      "SELL",
      sliceOf("BUY", [
        { ts: "2026-02-04", type: "SELL", price: 612.31 },
        { ts: "2026-04-06", type: "BUY", price: 603.12, quality: "regime_blocked" }, // 99d old at NOW
      ]),
      false,
      NOW,
    );
    expect(v.raw).toBe("SELL");
    expect(v.sub).toContain("Feb 4");
    expect(v.label).toBe("Sell");
  });

  it("a fresh scored RECLAIM renders as a hollow Re-entry verdict (reclaim lane)", () => {
    // reclaim_lane promoted 2026-07-16: the marker is scored, but the glyph stays hollow
    // (the solid star is reserved for the classic confluence entries).
    const v = oracleVerdict(
      "RECLAIM",
      sliceOf("RECLAIM", [
        { ts: "2026-06-08", type: "SELL", price: 290.55 },
        { ts: "2026-07-13", type: "RECLAIM", price: 327.5, scored: true, quality: "reclaim", quality_reason: "trend reclaimed the 2026-06-08 sell level" },
      ]),
      false,
      NOW,
    );
    expect(v.label).toBe("Re-entry");
    expect(v.raw).toBe("RECLAIM");
    expect(v.color).toBe("var(--buy)");
    expect(v.soft).toBe(true);                     // hollow glyph law, scored or not
    expect(v.sub).toBe("Jul 13");
    expect(v.note).toContain("scored reclaim lane");
    expect(v.note).not.toContain("unscored");
    expect(v.note).toContain("reclaimed");
  });

  it("a legacy pre-promotion RECLAIM (scored:false) keeps the unscored annotation", () => {
    const v = oracleVerdict(
      "SELL", // the scored manifest lane still says SELL — expected, must NOT note lane disagreement
      sliceOf("RECLAIM", [
        { ts: "2026-06-08", type: "SELL", price: 290.55 },
        { ts: "2026-07-13", type: "RECLAIM", price: 327.5, scored: false, quality: "reclaim" },
      ]),
      false,
      NOW,
    );
    expect(v.label).toBe("Re-entry");
    expect(v.soft).toBe(true);
    expect(v.note).toContain("unscored");
    expect(v.note).toContain("not in the track record");
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
    expect(v.label).toBe("卖出");
    expect(v.sub).toContain("6月");
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
    expect(v.sub).toBeNull();                              // no rendered echo — the stance IS the read
    expect(v.note).toContain("last signal: Sell · Jun 8"); // the event survives as tooltip context
    expect(v.note).toContain("not a trade signal");
  });

  it("a FRESH blocked tail takes primary over the stance; the stance demotes to tooltip context", () => {
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
    expect(v.label).toBe("Entry trigger — regime-blocked");
    expect(v.color).toBe("var(--signal)");
    expect(v.soft).toBe(true);
    expect(v.note).toContain("current stance: Extended — don't chase");
    expect(v.note).toContain("not an entry");
  });

  it("a STALE blocked tail rides the stance tooltip as 'blocked — not an entry' (original contract)", () => {
    const v = oracleVerdict(
      "SELL",
      stSlice(
        { last_signal: "BUY", last_scored_signal: "SELL", position_hint: "flat", strong_bull: false, overbought: true, weeklyBull: true, above200: true },
        [
          { ts: "2026-02-04", type: "SELL", price: 612.31 },
          { ts: "2026-04-06", type: "BUY", price: 603.12, quality: "regime_blocked" }, // 99d old
        ],
      ),
      false, NOW,
    );
    expect(v.stance).toBe(true);
    expect(v.label).toBe("Extended — don't chase");
    expect(v.color).toBe("var(--warn)");              // caution: non-flipping accent
    expect(v.note).toContain("blocked — not an entry");
  });

  it("600547.SS washout shape: fresh bear_block'd BUY at the low + stale SELL + downtrend state → amber blocked-entry primary", () => {
    // The 2026-08-02 diagnosis case verbatim: the engine fired the entry trigger at the
    // washout low and vetoed it; the panel used to show only "Downtrend — stand aside".
    const v = oracleVerdict(
      "SELL",
      stSlice(
        { last_signal: "BUY", last_scored_signal: "SELL", last_scored_ts: "2026-02-05", position_hint: "flat", strong_bull: false, overbought: true, weeklyBull: false, above200: false },
        [
          { ts: "2026-02-05", type: "SELL", price: 45.55 },
          { ts: "2026-07-01", known_ts: "2026-07-03", type: "BUY", price: 25.8896, quality: "regime_blocked", quality_reason: "bear_block: monthly-bear & below-200 & 2W-not-bull" },
        ],
      ),
      false, Date.parse("2026-07-15T21:00:00Z"), "DOWNTREND",
    );
    expect(v.label).toBe("Entry trigger — regime-blocked");
    expect(v.color).toBe("var(--signal)");
    expect(v.sub).toBe("Jul 3");                       // availability date, not the chart date
    expect(v.note).toContain("bear_block");
    expect(v.note).toContain("current stance: Downtrend — stand aside");
    expect(v.note).toContain("last signal: Sell · Feb 5 @ 45.55");
  });

  it("zh blocked-entry strings ship", () => {
    const v = oracleVerdict(
      "SELL",
      stSlice(
        { last_signal: "BUY", last_scored_signal: "SELL", position_hint: "flat", strong_bull: false, overbought: false, weeklyBull: false, above200: false },
        [
          { ts: "2026-02-05", type: "SELL", price: 45.55 },
          { ts: "2026-07-03", type: "BUY", price: 25.89, quality: "regime_blocked" },
        ],
      ),
      true, Date.parse("2026-07-15T21:00:00Z"), "DOWNTREND",
    );
    expect(v.label).toBe("买点触发 — 趋势闸拦截");
    expect(v.note).toContain("非入场信号");
    expect(v.note).toContain("当前姿态");
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
    expect(v.sub).toBeNull();
    expect(v.note).toContain("last signal: Buy · Apr 9");
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

describe("anchorSignal — the shared scored-lane anchor rule", () => {
  const sigs: Sig[] = [
    { ts: "2026-06-01", type: "BUY", quality: "take" },
    { ts: "2026-06-20", type: "SELL", quality: "take" },
    { ts: "2026-07-01", type: "BUY", quality: "regime_blocked" },
    { ts: "2026-07-10", type: "BUY", quality: "regime_blocked" },
  ];

  it("anchors on the newest unrefused signal and reports the newest refused tail", () => {
    const { anchor, blockedTail } = anchorSignal(sigs);
    expect(anchor?.ts).toBe("2026-06-20");
    expect(blockedTail?.ts).toBe("2026-07-10");
  });

  it("maxTs bounds the scan (replay: a future signal never anchors)", () => {
    expect(anchorSignal(sigs, "2026-06-10").anchor?.ts).toBe("2026-06-01");
    // blocked markers past the bound don't surface as a tail either
    expect(anchorSignal(sigs, "2026-06-30").blockedTail).toBe(null);
  });

  it("skips undated / typeless entries and handles missing input", () => {
    expect(anchorSignal([{ ts: "2026-07-01" }, { type: "BUY" } as Sig]).anchor).toBe(null);
    expect(anchorSignal(null).anchor).toBe(null);
    expect(anchorSignal([]).blockedTail).toBe(null);
  });

  it("all-refused history yields no anchor (chip renders — / rail falls back)", () => {
    const { anchor, blockedTail } = anchorSignal(sigs.slice(2));
    expect(anchor).toBe(null);
    expect(blockedTail?.ts).toBe("2026-07-10");
  });

  it("SOFT_Q stays the engine's three soft qualities (renderSignals + oracleVerdict share it)", () => {
    expect([...SOFT_Q].sort()).toEqual(["block", "pending", "regime_blocked"]);
  });
});

// ── the fresh-anchor asymmetry (operator report 2026-08-05) ────────────────────────────────
// 601696.SS rendered "Entry trigger — regime-blocked" while 300363.SZ, in the same engine
// state (flat, entries refused by the regime gate), rendered a plain "Sell". The only
// difference was the age of the older sell: a stale anchor let the caution branch speak, a
// fresh one returned before it could. A refused entry NEWER than the anchor is now disclosed
// either way — as the primary read when the anchor is stale, on the sub-line when it is not.
describe("oracleVerdict — a live blocked entry is disclosed under a fresh anchor too", () => {
  const blocked = { ts: "2026-07-10", type: "BUY", price: 11.83, quality: "regime_blocked",
                    quality_reason: "bear_block: monthly-bear & below-200 & 2W-not-bull" };

  it("rides on the sub-line when a FRESH sell anchors the card", () => {
    // sell 6d old (fresh) with a refused entry 4d later — the case that used to vanish
    const v = oracleVerdict("SELL", sliceOf("SELL", [
      { ts: "2026-07-06", type: "SELL", price: 11.88 },
      blocked,
    ]), false, NOW);
    expect(v.raw).toBe("SELL");                 // the scored truth still anchors the card
    expect(v.label).toBe("Sell");
    expect(v.blocked).toBe(true);
    expect(v.sub).toContain("Jul 6");           // anchor date kept
    expect(v.sub).toContain("entry blocked");   // …and the refusal rides with it
    expect(v.sub).toContain("Jul 10");
    expect(v.note).toContain("blocked by the regime gate — not an entry");
    expect(v.note).toContain("bear_block");
  });

  it("is the PRIMARY read when the anchor is stale — unchanged contract", () => {
    const v = oracleVerdict("SELL", sliceOf("SELL", [
      { ts: "2026-05-20", type: "SELL", price: 11.88 },   // 55d — stale
      blocked,
    ]), false, NOW);
    expect(v.raw).toBe("BLOCKED_ENTRY");
    expect(v.label).toBe("Entry trigger — regime-blocked");
    expect(v.blocked).toBe(true);
    expect(v.sub).toBe("Jul 10");
  });

  it("says nothing when the refusal is itself stale — no invented caution", () => {
    const v = oracleVerdict("SELL", sliceOf("SELL", [
      { ts: "2026-07-08", type: "SELL", price: 15.87 },
      { ts: "2026-05-01", type: "BUY", price: 15.76, quality: "regime_blocked" },  // older than the anchor
    ]), false, NOW);
    expect(v.raw).toBe("SELL");
    expect(v.blocked).toBeFalsy();
    expect(v.sub).toBe("Jul 8");
  });

  it("never lets a refused SELL masquerade as a blocked entry", () => {
    const v = oracleVerdict("BUY", sliceOf("BUY", [
      { ts: "2026-07-06", type: "BUY", price: 10 },
      { ts: "2026-07-10", type: "SELL", price: 11, quality: "regime_blocked" },
    ]), false, NOW);
    expect(v.blocked).toBeFalsy();
    expect(v.sub).toBe("Jul 6");
  });

  it("carries the disclosure in Chinese too", () => {
    const v = oracleVerdict("SELL", sliceOf("SELL", [
      { ts: "2026-07-06", type: "SELL", price: 11.88 },
      blocked,
    ]), true, NOW);
    expect(v.blocked).toBe(true);
    expect(v.sub).toContain("入场被拦截");
    expect(v.note).toContain("被趋势闸拦截");
  });
});
