/**
 * Prophet reconstruction disclosure — the chip a rebuilt plan carries, and the
 * byte-identity pin for every plan that was not rebuilt.
 *
 * CONTRACT (macro repo, engine/prophet_bridge.py + scripts/build_prophet.py):
 *   A plan row rebuilt after the 2026-08-09 outage carries
 *     origination_mode: "outage_backfill_<date>"
 *     origination_note: { en, zh, tip_en?, tip_zh?, date_en?, date_zh? }
 *   A live plan carries NEITHER KEY AT ALL. The builder writes both only inside
 *   an `is_reconstructed(plan)` branch, so the absent case is the state of every
 *   plan on the board today.
 *
 * THE ABSENT CASE IS PINNED BY SNAPSHOT, NOT BY A "does not contain" ASSERTION.
 * `__snapshots__/prophetOriginationDisclosure.test.ts.snap` was generated from the
 * SignalCard as it stood BEFORE the disclosure shipped; the absent-case tests below
 * therefore fail on any markup drift at all, not merely on a leaked chip.
 *
 * The rendered copy is never asserted against a literal written here — it is asserted
 * to be the row's own string. Wording lives upstream, in one place, on purpose.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignalCard, planOriginationNote } from "@/components/prophet/SignalCard";
import type { OriginationNote, PlanSummary } from "@/components/prophet/SignalCard";
import type { Lang } from "@/lib/i18n";

// `daysActive()` reads Date.now(), and the min-hold bar's width is derived from it —
// without a frozen clock the snapshot would re-baseline itself every midnight.
const NOW = new Date("2026-08-10T12:00:00.000Z");

/** A live plan: exactly the shape the board carries today, with NO origination keys. */
const LIVE_PLAN: PlanSummary = {
  id: "UBER-BULL-20260623",
  asset: "UBER",
  direction: "BULL",
  archetype: "Recovery",
  entry: 74.43,
  targets: [86.25, 98.07],
  invalidation: 66.55,
  horizon_days: 45,
  min_hold_days: 10,
  _signal_date: "2026-06-23",
  option_contract: null,
  phase: "pre_trigger",
  management_confidence: 68,
  recommended_action: "wait",
  last_price: 78.1,
};

function renderCard(plan: PlanSummary, lang: Lang): string {
  return renderToStaticMarkup(
    createElement(SignalCard, { plan, lang, selected: false, onSelect: () => {} }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The producer's real output, transcribed from the macro repo
 * (`engine/prophet_bridge.py`: RECONSTRUCTED_CHIP / RECONSTRUCTED_RECEIPT_*).
 *
 * This is FIXTURE DATA standing in for a row, not copy this repo owns. Nothing here
 * is imported by the component — it arrives over the wire on the plan.
 */
const PRODUCER_NOTE: OriginationNote = {
  en: "Reconstructed after an outage",
  zh: "系统中断后补记",
  tip_en:
    "The nightly run that would have made this pick didn't finish that weekend. It was"
    + " rebuilt afterwards from the data as it stood on 9 Aug 2026, and its windows are"
    + " timed from that date. Rebuilt picks are marked, and counted on their own in the"
    + " record.",
  tip_zh:
    "那个周末的夜间选股没能跑完。它是事后按 2026年8月9日 当时的数据重新算出来的，各个时间窗口都从这一天"
    + "起算。补记的选股都有标注，成绩记录里也单独计数。",
  date_en: "9 Aug 2026",
  date_zh: "2026年8月9日",
};

const RECONSTRUCTED_PLAN: PlanSummary = {
  ...LIVE_PLAN,
  id: "UBER-BULL-20260809",
  origination_mode: "outage_backfill_2026_08_09",
  origination_note: PRODUCER_NOTE,
};

describe("SignalCard without origination fields renders exactly as before", () => {
  it("is byte-identical to the pre-disclosure card in English", () => {
    expect(renderCard(LIVE_PLAN, "en")).toMatchSnapshot();
  });

  it("is byte-identical to the pre-disclosure card in Chinese", () => {
    expect(renderCard(LIVE_PLAN, "zh")).toMatchSnapshot();
  });

  it("draws no chip when the note is explicitly null", () => {
    const nulled: PlanSummary = { ...LIVE_PLAN, origination_note: null };
    expect(renderCard(nulled, "en")).toBe(renderCard(LIVE_PLAN, "en"));
  });

  it("draws no chip for a row carrying only the machine tag", () => {
    // The producer never writes one without the other, but the chip is the note's
    // job: a mode with no finished copy must not invent any.
    const modeOnly: PlanSummary = { ...LIVE_PLAN, origination_mode: "outage_backfill_2026_08_09" };
    expect(renderCard(modeOnly, "en")).toBe(renderCard(LIVE_PLAN, "en"));
  });
});

describe("SignalCard with origination fields shows the row's own disclosure", () => {
  it("renders the row's English chip copy verbatim", () => {
    const html = renderCard(RECONSTRUCTED_PLAN, "en");
    expect(html).toContain(PRODUCER_NOTE.en);
    expect(html).not.toContain(PRODUCER_NOTE.zh);
  });

  it("renders the row's Chinese chip copy verbatim", () => {
    const html = renderCard(RECONSTRUCTED_PLAN, "zh");
    expect(html).toContain(PRODUCER_NOTE.zh);
    expect(html).not.toContain(PRODUCER_NOTE.en);
  });

  it("adds the chip and nothing else to the card", () => {
    // The disclosure must not disturb the plan above it. Strip the one new node and
    // the card is the live card again, byte for byte.
    const html = renderCard(RECONSTRUCTED_PLAN, "en");
    // `[\s\S]` rather than the dotAll flag — tsconfig targets below es2018.
    const stripped = html.replace(/<div style="display:flex;margin-top:8px[^"]*">[\s\S]*?<\/div>/, "");
    expect(stripped).toBe(renderCard({ ...LIVE_PLAN, id: RECONSTRUCTED_PLAN.id }, "en"));
  });

  it("passes the row's copy straight through instead of looking anything up", () => {
    // A sentinel that exists in no lexicon in this repo. If it reaches the DOM, the
    // component is rendering row data — which is the whole contract.
    const sentinel = "⟪row-supplied disclosure sentinel⟫";
    const plan: PlanSummary = {
      ...RECONSTRUCTED_PLAN,
      origination_note: { en: sentinel, zh: sentinel },
    };
    expect(renderCard(plan, "en")).toContain(sentinel);
    expect(renderCard(plan, "zh")).toContain(sentinel);
  });

  it("offers the hover affordance only when the row shipped a receipt", () => {
    expect(renderCard(RECONSTRUCTED_PLAN, "en")).toContain("cursor:help");
    // Fail-soft, matching the producer: an undatable row ships the chip with no
    // receipt, so the card must not promise a hover it cannot answer.
    const noReceipt: PlanSummary = {
      ...RECONSTRUCTED_PLAN,
      origination_note: { en: PRODUCER_NOTE.en, zh: PRODUCER_NOTE.zh },
    };
    const html = renderCard(noReceipt, "en");
    expect(html).toContain(PRODUCER_NOTE.en);
    expect(html).not.toContain("cursor:help");
  });

  it("never renders the internal name of the event", () => {
    for (const lang of ["en", "zh"] as const) {
      const html = renderCard(RECONSTRUCTED_PLAN, lang);
      expect(html).not.toContain("outage_backfill");
      expect(html).not.toContain("origination_mode");
    }
  });
});

describe("planOriginationNote resolves the row's copy per language", () => {
  it("returns null for a live plan", () => {
    expect(planOriginationNote(LIVE_PLAN, "en")).toBeNull();
    expect(planOriginationNote(LIVE_PLAN, "zh")).toBeNull();
  });

  it("returns the English pair for lang=en and the Chinese pair for lang=zh", () => {
    expect(planOriginationNote(RECONSTRUCTED_PLAN, "en")).toEqual({
      chip: PRODUCER_NOTE.en,
      tip: PRODUCER_NOTE.tip_en,
    });
    expect(planOriginationNote(RECONSTRUCTED_PLAN, "zh")).toEqual({
      chip: PRODUCER_NOTE.zh,
      tip: PRODUCER_NOTE.tip_zh,
    });
  });

  it("returns a null tip when the producer could not date the row", () => {
    const plan: PlanSummary = {
      ...RECONSTRUCTED_PLAN,
      origination_note: { en: PRODUCER_NOTE.en, zh: PRODUCER_NOTE.zh },
    };
    expect(planOriginationNote(plan, "en")).toEqual({ chip: PRODUCER_NOTE.en, tip: null });
    expect(planOriginationNote(plan, "zh")).toEqual({ chip: PRODUCER_NOTE.zh, tip: null });
  });
});
