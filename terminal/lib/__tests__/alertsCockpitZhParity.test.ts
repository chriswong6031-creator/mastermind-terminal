// @vitest-environment jsdom
//
// Minor 4 (round-6 review of PR #517): the ZH page rendered raw English condition text
// ("Crossed your price line") through the `condition_plain` passthrough — the evaluator's own
// fired-event payload is EN-only, and the pre-fix code used it unconditionally for both
// languages. `verdictText` (lib/alertsView.ts) fixes the pure decision and has its own unit
// tests (alertsView.test.ts). THIS test proves the fix holds through the real render path — the
// same fixtures the e2e crop suite uses (e2e/f08-alerts.spec.ts FIRED_ALERT/SENT_OUTBOX,
// WATCHING_ALERT, unevaluable_n) mounted through the real AlertsCockpit + AlertDetail components
// in a real ZH-language tree (LangProvider) — for every module the fired-event payload can reach:
// the activity timeline row, the drillback detail dialog it opens into, the watching list, and
// the no-coverage / recent-activity (zero-rows) modules (also covering Minor 3's new moduleHead).
//
// Scope: assertions are scoped to the cockpit's own `[data-alerts-module]`/`[data-cockpit-state]`
// subtrees, never the whole page — `#alerts-manage` (`NewAlertPanel`, the pre-existing
// create-alert form from components/AlertsView.tsx) is a separate, out-of-scope surface this PR
// does not own or touch, and is deliberately excluded from these checks (see prior review rounds'
// "outside this round's owned scope" precedent).
//
// No @testing-library/react in this repo (vitest.config.ts's `include` is
// lib/__tests__/**/*.test.ts only) — react-dom/client's createRoot + react's act, per the
// BrainWidget/AlertTimeline/alertsCockpitNoCoverageActivity precedent.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import React from "react";
import AlertsCockpit from "@/components/alerts/AlertsCockpit";
import { LangProvider } from "@/lib/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Every ticker used in this fixture set ("NVDA") is 4 letters — a run of 5+ consecutive ASCII
// letters can only be leaked English prose, never a ticker or a number. Checked per DOM TEXT
// NODE, never on a whole subtree's concatenated `.textContent` — two adjacent sibling spans
// (e.g. the timeline row's own `.subject` "NVDA" immediately followed by its `.verdict` "NVDA
// price below 150") concatenate with no separator in `.textContent`, which would falsely read as
// one long run ("NVDANVDA...") even though nothing is actually wrong. A single real English
// sentence, in contrast, always lives inside ONE element as one text node, so checking node-by-
// node still catches it.
function longestAsciiLetterRun(text: string): string {
  const matches = text.match(/[A-Za-z]+/g) ?? [];
  return matches.reduce((longest, m) => (m.length > longest.length ? m : longest), "");
}
const MAX_TICKER_LETTERS = 4;
function assertNoLeakedEnglish(root: Element, where: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    const worst = longestAsciiLetterRun(text);
    expect(
      worst.length,
      `${where}: text node "${text}" contains ASCII-letter run "${worst}" (${worst.length} chars) — looks like leaked English, not a ticker/number`,
    ).toBeLessThanOrEqual(MAX_TICKER_LETTERS);
  }
}

// Matches e2e/f08-alerts.spec.ts's FIRED_ALERT/SENT_OUTBOX exactly (the fixture behind the
// zh-calm and zh-drillback crops this round regenerates).
const FIRED_ALERT = {
  id: "a1", symbol: "NVDA", active: false, created_at: "2026-08-01T00:00:00Z",
  condition: { type: "price", op: "below", value: 150, triggered: { at: "2026-09-05T09:41:00Z", value: 100, note: "crossed" } },
};
const SENT_OUTBOX = [{
  alert_id: "a1", fire_event_id: "f1", status: "sent", attempts: 1, last_error: null,
  deliver_after: null, delivered_at: "2026-09-05T09:41:00Z", created_at: "2026-08-01T00:00:00Z",
  payload: {
    subject: "NVDA crossed your price line", summary_plain: "NVDA crossed your price line.",
    ticker: "NVDA", condition_plain: "Crossed your price line",
    evidence_url: "https://example.com/evidence/f1", fired_at: "2026-09-05T09:41:00Z",
  },
}];
const WATCHING_ALERT = {
  id: "a0", symbol: "NVDA", active: true, created_at: "2026-08-01T00:00:00Z",
  condition: { type: "price", op: "above", value: 200 },
};
const NOW_ISO = new Date().toISOString();
const FRESH_RUN = {
  lane: "alerts_engine", run_id: "r1", started_at: NOW_ISO, concluded_at: NOW_ISO,
  outcome: "success", lane_cadence_budget_s: 300,
};

describe("AlertsCockpit — ZH render never leaks English condition text (minor 4, round-6 review)", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    document.documentElement.setAttribute("data-lang", "zh");
    realFetch = globalThis.fetch;
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = undefined;
    container.remove();
    document.documentElement.removeAttribute("data-lang");
    globalThis.fetch = realFetch;
  });

  function mockFetch(alerts: unknown[], receipts: Record<string, unknown>) {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.startsWith("/api/alerts/receipts")) return { ok: true, status: 200, json: async () => receipts } as Response;
      if (url.startsWith("/api/alerts")) return { ok: true, status: 200, json: async () => ({ alerts }) } as Response;
      // Every other endpoint (NewAlertPanel's own entitlement/manifest reads, /api/me, ...) is
      // honestly "unavailable" — matching alertsCockpitNoCoverageActivity.test.ts's own fetch
      // stub; this test asserts nothing about that out-of-scope surface either way.
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof globalThis.fetch;
  }

  async function mount() {
    await act(async () => {
      root = createRoot(container);
      root!.render(React.createElement(LangProvider, null, React.createElement(AlertsCockpit, { email: "test@example.com" })));
    });
    // Flush the two sequential awaited fetches inside AlertsCockpit's own `load()`, plus the
    // LangProvider effect that reads the `data-lang` attribute set in beforeEach.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  }

  it("fired + delivered fixture (the exact e2e zh-calm/zh-drillback fixture): timeline row and drillback dialog are both English-free", async () => {
    mockFetch([FIRED_ALERT], {
      run: FRESH_RUN, runs_state: "READ_OK", last_success_at: FRESH_RUN.concluded_at,
      last_success_state: "READ_OK", outbox: SENT_OUTBOX, outbox_state: "READ_OK",
    });
    await mount();

    const timeline = container.querySelector('[data-alerts-module="recent-activity"]');
    expect(timeline).not.toBeNull();
    assertNoLeakedEnglish(timeline!, "timeline row");
    expect(timeline!.textContent).not.toContain("Crossed");

    const deliveryRow = container.querySelector('[data-delivery="sent"]') as HTMLElement | null;
    expect(deliveryRow).not.toBeNull();
    await act(async () => { deliveryRow!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    const dialog = container.querySelector('[data-cockpit-state="drillback"]');
    expect(dialog).not.toBeNull();
    assertNoLeakedEnglish(dialog!, "drillback dialog");
    expect((dialog!.textContent ?? "").toLowerCase()).not.toContain("crossed your price line");
  });

  it("watching-only fixture (no fired rows): the watching-list module is English-free", async () => {
    mockFetch([WATCHING_ALERT], {
      run: FRESH_RUN, runs_state: "READ_OK", last_success_at: FRESH_RUN.concluded_at,
      last_success_state: "READ_OK", outbox: [], outbox_state: "READ_OK_ZERO",
    });
    await mount();
    const watchingList = container.querySelector('[data-alerts-module="watching-list"]');
    expect(watchingList).not.toBeNull();
    assertNoLeakedEnglish(watchingList!, "watching-list module");
  });

  it("no-coverage + zero-rows fixture: CouldNotWatch and the new recent-activity module are both English-free, and the new module carries the same moduleHead label treatment as its siblings (minor 3)", async () => {
    mockFetch([WATCHING_ALERT], {
      run: { ...FRESH_RUN, unevaluable_n: 1 }, runs_state: "READ_OK", last_success_at: FRESH_RUN.concluded_at,
      last_success_state: "READ_OK", outbox: [], outbox_state: "READ_OK_ZERO",
    });
    await mount();
    const noCoverage = container.querySelector('[data-alerts-module="no-coverage"]');
    const activity = container.querySelector('[data-alerts-module="recent-activity"]');
    expect(noCoverage).not.toBeNull();
    expect(activity).not.toBeNull();
    assertNoLeakedEnglish(noCoverage!, "no-coverage module");
    assertNoLeakedEnglish(activity!, "recent-activity (no-coverage, zero rows) module");
    expect(activity!.textContent).toContain("近期活动");
  });
});
