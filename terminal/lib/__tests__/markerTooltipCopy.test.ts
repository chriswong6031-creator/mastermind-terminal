import { describe, expect, it } from "vitest";
import { markerTooltipCopy, opportunityMarkerGlyph, retroOverrideCopy, RETRO_RULE_DATE } from "../signalVerdict";

// The chart marker's hover/tap tooltip. Until the marker-tooltip repair these strings had never
// rendered for anyone — the signal layer is `pointer-events:none` — so they lived as hand-rolled
// ENGLISH literals inside ChartPanel's render loop, unreachable by any test but an e2e one and
// invisible to the bilingual-UI law because nobody could read them. This suite is the unit-level
// contract they never had: every class, both languages, asserted verbatim.

const CTX = { group_id: "uranium_miners", peer_dd: -0.388, name: "Uranium miners", name_zh: "铀矿商" };
const REASON = "bear_block: monthly-bear & below-200 & 2W-not-bull";

const blocked = { t: "2026-04-29", type: "BUY", quality: "regime_blocked", blocked: true, reason: REASON };
const candidate = { ...blocked, t: "2026-05-25", overrideCandidate: true, overrideCtx: CTX };
const overrideTake = { t: "2026-07-09", type: "BUY", quality: "override_take", overrideTake: true, overrideCtx: CTX };
const reclaimTake = { ...overrideTake, t: "2026-07-30", quality: "reclaim_override_take", reclaimWaived: true };
const retro = { ...blocked, t: "2026-06-15", retro: true, retroCtx: CTX };
const stop = { t: "2026-07-01", type: "SELL", basis: "structure_stop", stopLevel: 11.2 };

describe("markerTooltipCopy — English", () => {
  it("says NOT AN ENTRY for a refused entry, and names the veto", () => {
    expect(markerTooltipCopy(blocked, false)).toBe(
      `2026-04-29 · BUY blocked by the regime gate — not an entry — ${REASON}`);
  });

  it("keeps the refusal FIRST on a washout candidate — the washout is context, not a green light", () => {
    const s = markerTooltipCopy(candidate, false)!;
    expect(s).toBe(
      `2026-05-25 · BUY blocked by the regime gate — not an entry — ${REASON}`
      + " · Washout override candidate — Uranium miners −38% from highs");
    // the ordering claim, asserted as ordering rather than as a whole string, so it survives a
    // reword: a reader must meet "not an entry" before they meet the washout.
    expect(s.indexOf("not an entry")).toBeLessThan(s.indexOf("Washout override candidate"));
  });

  it("says a washout-override ENTRY entered, and that most still stop out", () => {
    expect(markerTooltipCopy(overrideTake, false)).toBe(
      "2026-07-09 · BUY — Washout override entry — Uranium miners −38% from highs"
      + " · the regime gate would refuse this — the deep group washout is the one reason it stands"
      + " · most still stop out — the stop is the protection");
  });

  it("names the WAIVED LEG on a keeper reclaim waiver — the 200-day, not the regime gate", () => {
    const s = markerTooltipCopy(reclaimTake, false)!;
    expect(s).toContain("Reclaim waived — entry");
    expect(s).toContain("never reclaimed the 200-day");
    expect(s).toContain("most still stop out");
    expect(s).not.toContain("the regime gate would refuse this");
  });

  it("says the retro re-mark is NOT a call the product made, and dates the rule", () => {
    const s = markerTooltipCopy(retro, false)!;
    expect(s).toBe(
      `2026-06-15 · BUY — Would have entered under today's rule — Uranium miners`
      + ` · re-marked under the current rule (${RETRO_RULE_DATE})`
      + " — the system refused this live, so it is not a call we made");
    // it must never borrow either ENTRY class's claim — the two are drawn identically on the chart,
    // so this sentence is the only thing distinguishing a counterfactual from a real entry.
    expect(s).not.toContain("Washout override entry");
    expect(s).not.toContain("Reclaim waived — entry");
  });

  it("says a structure stop broke the swing low, not momentum", () => {
    expect(markerTooltipCopy(stop, false)).toBe(
      "2026-07-01 · structure stop — the daily close broke the prior swing low at 11.2, not a momentum exit");
  });

  it("names keeper soft marks as distinct starter states", () => {
    expect(markerTooltipCopy({ t: "2026-07-02", type: "BUY", quality: "pending" }, false))
      .toBe("2026-07-02 · BUY (starter — awaiting confirmation)");
    expect(markerTooltipCopy({ t: "2026-07-03", type: "BUY", quality: "block" }, false))
      .toBe("2026-07-03 · BUY (starter — confirmation filter failed)");
  });

  it("gives a plain scored entry NO tooltip — the pill already says it", () => {
    expect(markerTooltipCopy({ t: "2026-07-05", type: "BUY", quality: "take" }, false)).toBeNull();
    expect(markerTooltipCopy({ t: "2026-07-05", type: "BUY" }, false)).toBeNull();
  });

  it("keeps reversal-watch receipts distinct from Prophet in copy and glyph", () => {
    const reversal = {
      t: "2026-08-05", type: "PROPHET", source: "reversal_watch",
      rank: 19, returnPct: 4.4,
    };
    expect(markerTooltipCopy(reversal, false)).toBe(
      "2026-08-05 · Reversal-watch candidate receipt — not a trade plan · rank #19 · +4.4%");
    expect(opportunityMarkerGlyph(reversal.source)).toBe("R");
    expect(opportunityMarkerGlyph("prophet_board")).toBe("P");
  });
});

describe("markerTooltipCopy — 中文", () => {
  // A marker without a `quality_reason`, because the engine's reason is a raw latin diagnostic
  // slug that is passed through untranslated by design — including it would make every
  // "is this really translated" assertion below vacuous.
  const noReason = <T extends { reason?: string }>(m: T) => ({ ...m, reason: undefined });

  it("translates every class rather than shipping English into the zh view", () => {
    for (const [label, mark] of [
      ["blocked", noReason(blocked)],
      ["candidate", noReason(candidate)],
      ["override_take", overrideTake],
      ["reclaim_override_take", reclaimTake],
      ["retro", noReason(retro)],
      ["structure stop", stop],
      ["soft", { t: "2026-07-02", type: "BUY", quality: "pending" }],
    ] as const) {
      const s = markerTooltipCopy(mark, true)!;
      expect(s, `${label} should render in zh`).toBeTruthy();
      // No English PROSE. `BUY`/`RECLAIM` are the emitter's signal types and appear on the chart
      // glyph itself in both languages, so latin runs are checked case-sensitively on lowercase —
      // the same shape signalVerdict's own zh assertions use.
      expect(s, `${label} still carries English prose`).not.toMatch(/[a-z]{4,}/);
    }
  });

  it("uses the group's OWN zh name, not the English one flattened onto it", () => {
    // The latent bug this guards: ChartPanel flattens `override_ctx` to an English `overrideGroup`
    // for the marker geometry. Routing the copy through the ctx is what lets a zh reader see 铀矿商.
    expect(markerTooltipCopy(candidate, true)).toContain("铀矿商");
    expect(markerTooltipCopy(retro, true)).toContain("铀矿商");
    expect(markerTooltipCopy(candidate, true)).not.toContain("Uranium miners");
  });

  it("says 非入场信号 first on a candidate — the refusal outranks the washout in zh too", () => {
    const s = markerTooltipCopy(candidate, true)!;
    expect(s.indexOf("非入场信号")).toBeLessThan(s.indexOf("深度洗盘例外候选"));
  });

  it("dates the retro rule in full-width brackets and keeps the counterfactual plain", () => {
    const s = markerTooltipCopy(retro, true)!;
    expect(s).toContain(`（${RETRO_RULE_DATE}）`);
    expect(s).toContain("当时系统并未入场");
    // 中文 closes a full-width bracket straight onto the dash — a space there is english-shaped
    expect(s).toContain(`（${RETRO_RULE_DATE}）—`);
  });

  it("does not run two bracket groups together on a soft mark", () => {
    const s = markerTooltipCopy({ t: "2026-07-02", type: "BUY", quality: "pending", reason: REASON }, true)!;
    expect(s).toBe(`2026-07-02 · BUY — 试仓 — 等待确认（${REASON}）`);
    expect(s).not.toContain("）（");
  });
});

describe("retroOverrideCopy rule date", () => {
  it("is OPT-IN — an undated call is byte-identical to what shipped", () => {
    // The card's Tier-2 notes call it without a date and their copy must not move.
    expect(retroOverrideCopy(CTX, false).notes[0])
      .toBe("re-marked under the current rule — the system refused this live, so it is not a call we made");
    expect(retroOverrideCopy(CTX, true).notes[0])
      .toBe("事后按当前规则重标 — 当时系统并未入场，这不是当时的判断");
  });

  it("inserts the date without disturbing the sentence around it", () => {
    expect(retroOverrideCopy(CTX, false, "2026-08-10").notes[0])
      .toBe("re-marked under the current rule (2026-08-10) — the system refused this live, so it is not a call we made");
    expect(retroOverrideCopy(CTX, true, "2026-08-10").notes[0])
      .toBe("事后按当前规则重标（2026-08-10）— 当时系统并未入场，这不是当时的判断");
  });

  it("leaves the glance line and the track-record note alone in both languages", () => {
    for (const zh of [false, true]) {
      const bare = retroOverrideCopy(CTX, zh);
      const dated = retroOverrideCopy(CTX, zh, "2026-08-10");
      expect(dated.line).toBe(bare.line);
      expect(dated.notes.slice(1)).toEqual(bare.notes.slice(1));
    }
  });
});
