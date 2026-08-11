/**
 * Prophet reconstruction disclosure on BOTH surfaces that draw a plan — the chip on the
 * stream card and the dated note in the detail panel — plus the pin, on each, for every
 * plan that was not rebuilt.
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
 * `__snapshots__/prophetOriginationDisclosure.test.ts.snap` holds the CARD as it stood
 * BEFORE the disclosure shipped; the absent-case tests below therefore fail on any
 * markup drift at all, not merely on a leaked chip.
 * (One deliberate re-pin since: the zh entry's P&L suffix, previously the hardcoded
 * English "vs plan", became 较计划 when that label was routed through prophetStrings —
 * the sole delta from the pre-disclosure render.)
 *
 * The PANEL snapshots could not be taken before the fact — AnalysisPanel was not
 * exported until the disclosure needed it — so they are a drift detector from here on,
 * and the zero-regression claim rests on `soleInsertion` instead: the note-bearing
 * panel must equal the plain panel with ONE contiguous run inserted, which no amount of
 * unrelated movement elsewhere can satisfy. (The component diff agrees: every line of
 * the pre-existing render path is untouched.)
 *
 * The rendered copy is never asserted against a literal written here — it is asserted
 * to be the row's own string. Wording lives upstream, in one place, on purpose.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignalCard, planOriginationNote } from "@/components/prophet/SignalCard";
import type { OriginationNote, PlanSummary } from "@/components/prophet/SignalCard";
import { AnalysisPanel } from "@/components/prophet/ProphetView";
import { makeProphetT } from "@/components/prophet/prophetStrings";
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

function renderPanel(plan: PlanSummary, lang: "en" | "zh"): string {
  return renderToStaticMarkup(
    createElement(AnalysisPanel, { plan, lang, t: makeProphetT(lang) }),
  );
}

/**
 * The markup with React's entity escaping undone, so a copy assertion can be written
 * against the producer's actual sentence. The receipt contains an apostrophe ("didn't"),
 * which reaches the DOM as `&#x27;` — asserting on the escaped form would make the test
 * a transcript of React's escaper rather than of the row's words.
 */
function readable(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The panel plan carries every content block the detail view can draw — rail geometry,
 * the brief, the profit rows, a thesis. The disclosure has to slot into a FULL panel
 * without moving any of it, so a bare plan would be a test that proves nothing.
 *
 * Deliberately not LIVE_PLAN itself: the card snapshots are byte-pinned against that
 * object, and this one exists so the panel's needs can never drift them.
 */
const PANEL_PLAN: PlanSummary = {
  ...LIVE_PLAN,
  state: {
    phase: "triggered_pre_t1",
    management_confidence: 68,
    recommended_action: "hold",
    geometry: { dist_to_stop_r: 1.4, dist_to_t1_r: 0.8, horizon_pct_used: 42 },
  },
  phase: "triggered_pre_t1",
  what_to_do_now: ["Hold the position.", "Trail the stop to break-even."],
  what_to_do_now_zh: ["继续持有。", "把止损上移到成本价。"],
  profit_plan: [
    { level: 86.25, label: "T1", action: "Trim a third.", status: "PENDING" },
    { level: 98.07, label: "T2", action: "Trim again.", status: "PENDING" },
  ],
  profit_plan_zh: [
    { level: 86.25, label: "T1", action: "减仓三分之一。", status: "PENDING" },
    { level: 98.07, label: "T2", action: "再次减仓。", status: "PENDING" },
  ],
  // Cast: `thesis` reaches the panel on the wire but is not on PlanSummary yet — the
  // panel reads it through the same local cast, so the fixture matches the runtime.
  ...({ thesis: "Rideshare margins are re-rating. Dealer positioning is light above T1." } as object),
};

/**
 * The single contiguous run of markup that `withNote` adds to `without`, proved to be
 * contiguous: everything before it and everything after it must reassemble `without`
 * exactly. A regex strip could delete the right node and quietly tolerate a second,
 * unrelated change elsewhere in the panel; this cannot.
 */
function soleInsertion(withNote: string, without: string): string {
  let head = 0;
  while (head < without.length && withNote[head] === without[head]) head++;
  let tail = 0;
  while (
    tail < without.length - head &&
    withNote[withNote.length - 1 - tail] === without[without.length - 1 - tail]
  ) tail++;
  // The untouched panel is exactly the head plus the tail — nothing else moved.
  expect(without.slice(0, head) + without.slice(without.length - tail)).toBe(without);
  return withNote.slice(head, withNote.length - tail);
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

/** The same rebuilt row, on the fully-populated panel plan. */
const RECONSTRUCTED_PANEL_PLAN: PlanSummary = {
  ...PANEL_PLAN,
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

// ── AnalysisPanel — the detail view (CENTER column) ───────────────────────────
//
// The card marks a rebuilt pick for a reader who is scanning. This panel is where the
// same reader stops and reads, so the disclosure that is one chip on the card becomes
// a dated line plus the receipt in the open — and, because every window in the panel
// is measured from the origination date, it sits ABOVE the geometry rail rather than
// under the thesis. What must NOT change is the panel for the other plans.

describe("AnalysisPanel without origination fields renders exactly as today", () => {
  it("is unchanged in English", () => {
    expect(renderPanel(PANEL_PLAN, "en")).toMatchSnapshot();
  });

  it("is unchanged in Chinese", () => {
    expect(renderPanel(PANEL_PLAN, "zh")).toMatchSnapshot();
  });

  it("emits no disclosure container at all — not an empty one", () => {
    for (const lang of ["en", "zh"] as const) {
      const html = renderPanel(PANEL_PLAN, lang);
      expect(html).not.toContain("obs-prophet-origination");
      // The note's own rule, specifically — the thesis block has a hairline of its own,
      // so asserting on the token alone would be a test of the wrong element.
      expect(html).not.toContain("padding-top:10px;border-top:1px solid var(--hairline)");
      expect(html).not.toContain(PRODUCER_NOTE.en);
      expect(html).not.toContain(PRODUCER_NOTE.zh);
    }
  });

  it("draws nothing when the note is explicitly null", () => {
    const nulled: PlanSummary = { ...PANEL_PLAN, origination_note: null };
    expect(renderPanel(nulled, "en")).toBe(renderPanel(PANEL_PLAN, "en"));
  });

  it("draws nothing for a row carrying only the machine tag", () => {
    const modeOnly: PlanSummary = {
      ...PANEL_PLAN,
      origination_mode: "outage_backfill_2026_08_09",
    };
    expect(renderPanel(modeOnly, "en")).toBe(renderPanel(PANEL_PLAN, "en"));
  });
});

describe("AnalysisPanel with origination fields shows the row's own disclosure", () => {
  it("renders the row's English clause, datestamp and receipt inline", () => {
    const html = readable(renderPanel(RECONSTRUCTED_PANEL_PLAN, "en"));
    expect(html).toContain(PRODUCER_NOTE.en);
    expect(html).toContain(PRODUCER_NOTE.date_en);
    expect(html).toContain(PRODUCER_NOTE.tip_en);
    // The receipt is READABLE here, not hidden behind a second hover. The card already
    // carries the tooltip for the reader who has not opened the plan.
    expect(html).not.toContain("cursor:help");
    for (const zh of [PRODUCER_NOTE.zh, PRODUCER_NOTE.tip_zh, PRODUCER_NOTE.date_zh]) {
      expect(html).not.toContain(zh);
    }
  });

  it("renders the row's Chinese clause, datestamp and receipt inline", () => {
    const html = readable(renderPanel(RECONSTRUCTED_PANEL_PLAN, "zh"));
    expect(html).toContain(PRODUCER_NOTE.zh);
    expect(html).toContain(PRODUCER_NOTE.date_zh);
    expect(html).toContain(PRODUCER_NOTE.tip_zh);
    for (const en of [PRODUCER_NOTE.en, PRODUCER_NOTE.tip_en, PRODUCER_NOTE.date_en]) {
      expect(html).not.toContain(en);
    }
  });

  it("adds one contiguous block and disturbs nothing else in the panel", () => {
    for (const lang of ["en", "zh"] as const) {
      const inserted = soleInsertion(
        renderPanel(RECONSTRUCTED_PANEL_PLAN, lang),
        renderPanel({ ...PANEL_PLAN, id: RECONSTRUCTED_PANEL_PLAN.id }, lang),
      );
      expect(inserted).toContain("obs-prophet-origination");
      expect(inserted).toContain(lang === "zh" ? PRODUCER_NOTE.zh : PRODUCER_NOTE.en);
    }
  });

  it("places the disclosure above the geometry rail, not below the thesis", () => {
    // The reason the panel diverges from the card: the rail, the phase the profit rows
    // are keyed to, and the brief keyed to that phase are all timed from this date. A
    // disclosure underneath them arrives after the numbers it explains.
    const html = renderPanel(RECONSTRUCTED_PANEL_PLAN, "en");
    const note   = html.indexOf("obs-prophet-origination");
    const ticker = html.indexOf(RECONSTRUCTED_PANEL_PLAN.asset);
    const rail   = html.indexOf("obs-prophet-geometry");
    expect(ticker).toBeGreaterThanOrEqual(0);
    expect(rail).toBeGreaterThan(0);
    expect(note).toBeGreaterThan(ticker);
    expect(note).toBeLessThan(rail);
  });

  it("shows the clause alone when the producer could not date the row", () => {
    const undated: PlanSummary = {
      ...RECONSTRUCTED_PANEL_PLAN,
      origination_note: { en: PRODUCER_NOTE.en, zh: PRODUCER_NOTE.zh },
    };
    const html = renderPanel(undated, "en");
    expect(html).toContain(PRODUCER_NOTE.en);
    // No stamp and no receipt — and no empty span or stray margin standing in for them.
    expect(html).not.toContain(PRODUCER_NOTE.date_en);
    expect(html).not.toContain("tabular-nums;color:var(--muted)\"></span>");
    expect(html).not.toContain("<p style=\"margin:5px 0 0");
  });

  it("passes the row's copy straight through instead of looking anything up", () => {
    const sentinel = "⟪row-supplied panel disclosure sentinel⟫";
    const stamp = "⟪row-supplied datestamp⟫";
    const plan: PlanSummary = {
      ...RECONSTRUCTED_PANEL_PLAN,
      origination_note: { en: sentinel, zh: sentinel, date_en: stamp, date_zh: stamp },
    };
    for (const lang of ["en", "zh"] as const) {
      const html = renderPanel(plan, lang);
      expect(html).toContain(sentinel);
      expect(html).toContain(stamp);
    }
  });

  it("never renders the internal name of the event", () => {
    for (const lang of ["en", "zh"] as const) {
      const html = renderPanel(RECONSTRUCTED_PANEL_PLAN, lang);
      expect(html).not.toContain("outage_backfill");
      expect(html).not.toContain("origination_mode");
    }
  });
});
