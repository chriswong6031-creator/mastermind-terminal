/**
 * Prophet `phase="overtime"` display vocabulary, on all three surfaces that draw a
 * phase — the stream card, the analysis header, the confidence panel.
 *
 * WHAT CHANGED AND WHY. `overtime` was labelled "Overtime / 超时", which reads as a
 * normal live plan that simply ran past its intended holding period. Under Prophet's
 * actual closure contract that is not the state the enum reaches: the reachable open
 * state is the stale / no-closing-print case — the declared window elapsed while the
 * close-or-current price frame stayed unavailable or unreconciled. The vocabulary is
 * now "Window Elapsed / 窗口已到期" (macro Q2 ruling), and the sentence saying which
 * of the two halves the reader is looking at rides as the chip's accessible name.
 *
 * THE WIRE ENUM IS NOT RENAMED. Every assertion below routes through the internal
 * value `overtime`, on both the flat and the nested shape, and the fixture ships that
 * key verbatim. A rename upstream would fail these tests, which is the point.
 *
 * NO LOCAL ACTION FALLBACK. The stale-frame safety contract publishes
 * recommended_action=null, and the Terminal must show NO action chip rather than
 * substituting Trim / Wait / Hold of its own. That is asserted as the absence of the
 * whole action vocabulary from the rendered panel, not merely of the chip's label —
 * a fallback that reached for any enum member would have to say one of those words.
 *
 * The fresh control row in the same fixture pins the other half: a normal plan's three
 * surfaces are untouched by all of this. (The byte-level version of that claim lives in
 * prophetOriginationDisclosure.test.ts, whose card/panel snapshots cover a live plan and
 * would break on any drift here.)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignalCard, planPhase, planRecommendedAction } from "@/components/prophet/SignalCard";
import type { PlanSummary } from "@/components/prophet/SignalCard";
import { AnalysisPanel } from "@/components/prophet/ProphetView";
import { ConfidencePanel } from "@/components/prophet/ConfidencePanel";
import type { ConfidenceComponents } from "@/components/prophet/ConfidencePanel";
import { getProphetStr, makeProphetT } from "@/components/prophet/prophetStrings";
import type { Lang } from "@/lib/i18n";

// `daysActive()` reads Date.now() and feeds the card's min-hold bar — freeze it so the
// render is a function of the fixture alone.
const NOW = new Date("2026-08-13T12:00:00.000Z");

const FIXTURE = path.join(process.cwd(), "test-fixtures", "prophet_stale_frame_fixture.json");

interface ProphetIndex {
  plans: PlanSummary[];
}

let stale: PlanSummary;
let fresh: PlanSummary;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const index: ProphetIndex = JSON.parse(await readFile(FIXTURE, "utf8"));
  stale = index.plans.find((p) => p.id === "LRN-BULL-20260605")!;
  fresh = index.plans.find((p) => p.id === "BA-BULL-20260806")!;
});

afterEach(() => {
  vi.useRealTimers();
});

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

/** The confidence column, wired exactly as ProphetView wires it. */
function renderConfidence(plan: PlanSummary, lang: Lang): string {
  const state = plan.state as
    | { components?: ConfidenceComponents | null; change_reason?: string | null }
    | null
    | undefined;
  return renderToStaticMarkup(
    createElement(ConfidencePanel, {
      confidence: plan.management_confidence ?? null,
      components: state?.components ?? null,
      phase: planPhase(plan),
      change_reason: state?.change_reason ?? null,
      recommended_action: planRecommendedAction(plan),
      lang,
    }),
  );
}

/** Every surface that draws a phase, for one plan in one language. */
function renderAll(plan: PlanSummary, lang: "en" | "zh"): Record<string, string> {
  return {
    card: renderCard(plan, lang),
    panel: renderPanel(plan, lang),
    confidence: renderConfidence(plan, lang),
  };
}

const LABEL = { en: "Window Elapsed", zh: "窗口已到期" } as const;
const RETIRED = { en: "Overtime", zh: "超时" } as const;

/**
 * The full recommended-action vocabulary. A local fallback cannot avoid printing one of
 * these, so asserting the whole set is absent is what proves nothing was substituted.
 * Read from the string table rather than transcribed, so a re-worded action cannot slip
 * past a stale literal here.
 */
const ACTION_KEYS = [
  "actionWait",
  "actionEnter",
  "actionHold",
  "actionTrim",
  "actionTrail",
  "actionExit",
  "actionInvalidated",
] as const;

describe("the fixture is a stale-frame overtime plan on the wire", () => {
  it("carries the internal enum `overtime` on both shapes", () => {
    expect(stale.phase).toBe("overtime");
    expect(stale.state?.phase).toBe("overtime");
    expect(planPhase(stale)).toBe("overtime");
  });

  it("publishes no recommended action and no price frame", () => {
    expect(planRecommendedAction(stale)).toBeNull();
    expect(stale.last_price ?? null).toBeNull();
    expect(stale.what_to_do_now ?? null).toBeNull();
  });
});

describe.each(["en", "zh"] as const)("stale-frame plan in %s", (lang) => {
  it("says Window Elapsed on all three surfaces", () => {
    const rendered = renderAll(stale, lang);
    for (const [surface, html] of Object.entries(rendered)) {
      expect(html, `${surface} lost the phase label`).toContain(LABEL[lang]);
    }
  });

  it("has retired the Overtime wording everywhere", () => {
    const rendered = renderAll(stale, lang);
    for (const [surface, html] of Object.entries(rendered)) {
      expect(html, `${surface} still says ${RETIRED[lang]}`).not.toContain(RETIRED[lang]);
    }
  });

  it("states the meaning: window elapsed AND the price frame is unavailable", () => {
    // Not a literal written here — the sentence lives once, in the string table.
    const why = getProphetStr(lang, "phaseOvertimeWhy");
    const rendered = renderAll(stale, lang);
    for (const [surface, html] of Object.entries(rendered)) {
      expect(html, `${surface} explains nothing`).toContain(why);
    }
    // The explanation is the chip's accessible name, never a title= (CI-guarded).
    expect(rendered.card).not.toContain("title=");
    expect(rendered.panel).not.toContain("title=");
    expect(rendered.confidence).not.toContain("title=");
  });

  it("instructs no current action — no chip, no local fallback verb", () => {
    const html = renderConfidence(stale, lang);
    expect(html).not.toContain(getProphetStr(lang, "actionLabel"));
    for (const key of ACTION_KEYS) {
      expect(html, `substituted ${key}`).not.toContain(getProphetStr(lang, key));
    }
  });

  it("draws no What To Do Now block when the payload suppressed it", () => {
    // Asserted on the block's own class, not on its heading: `obs-prophet-section-primary`
    // is worn by exactly one node in the panel, so this cannot be satisfied by a
    // reworded label — nor tripped by prose that happens to name the section.
    expect(renderPanel(stale, lang)).not.toContain("obs-prophet-section-primary");
    expect(renderPanel(stale, lang)).not.toContain(getProphetStr(lang, "briefLabel"));
  });

  it("keeps the other language out of the view", () => {
    const other = lang === "en" ? "zh" : "en";
    const rendered = renderAll(stale, lang);
    for (const [surface, html] of Object.entries(rendered)) {
      expect(html, `${surface} leaked ${other}`).not.toContain(LABEL[other]);
      expect(html, `${surface} leaked ${other}`).not.toContain(getProphetStr(other, "phaseOvertimeWhy"));
    }
  });
});

describe.each(["en", "zh"] as const)("fresh plan in %s is untouched", (lang) => {
  it("still shows its own phase and its recommended action", () => {
    const rendered = renderAll(fresh, lang);
    const phaseLabel = getProphetStr(lang, "phaseTriggered");
    for (const [surface, html] of Object.entries(rendered)) {
      expect(html, `${surface} lost the phase label`).toContain(phaseLabel);
    }
    expect(rendered.confidence).toContain(getProphetStr(lang, "actionLabel"));
    expect(rendered.confidence).toContain(getProphetStr(lang, "actionHold"));
    expect(rendered.panel).toContain(getProphetStr(lang, "briefLabel"));
  });

  it("carries no phase explanation — the label speaks for itself", () => {
    const rendered = renderAll(fresh, lang);
    for (const [surface, html] of Object.entries(rendered)) {
      expect(html, `${surface} explained a phase that needs none`).not.toContain(getProphetStr(lang, "phaseOvertimeWhy"));
    }
  });
});
