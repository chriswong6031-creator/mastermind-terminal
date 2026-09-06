// @vitest-environment jsdom
//
// Component coverage for the research-management (RMS) lens rail (packet B-F11-2),
// added per Meta-CEO B ruling r3 on PR #520 round-2 review finding M2: the rail's
// selector module (rmsViews.ts) had unit tests, but ZERO rendered-UI coverage — the
// tablist roving behavior, the lens-memory key, the empty states, the typed
// not-connected condition state, and the bounded hydration flow were all untested.
// This mounts the real `ThesisWorkspace` component in jsdom (no @testing-library —
// this repo has none installed; a direct react-dom/client + act mount keeps the
// dependency footprint at zero net new runtime packages) with a stubbed `fetch`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ThesisWorkspace from "@/components/workspaces/ThesisWorkspace";
import type { ThesisDetail, ThesisSubjectRef, ThesisSummary, ThesisVersion } from "@/lib/theses";
import { THESIS_CONTENT_SCHEMA, THESIS_SUBJECT_SCHEMA } from "@/lib/theses";

// No @testing-library/react in this repo — mounting directly via react-dom/client
// needs this flag so React's `act()` recognizes the environment (otherwise it only
// warns; every assertion below still runs against the real, flushed DOM).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function subject(key: string, display: string): ThesisSubjectRef {
  return {
    schema: THESIS_SUBJECT_SCHEMA,
    kind: "issuer",
    owner: "data_os.security_master",
    key,
    identityState: "resolved",
    display,
  };
}

function content(overrides: Partial<ThesisVersion["content"]> = {}): ThesisVersion["content"] {
  return {
    schema: THESIS_CONTENT_SCHEMA,
    title: "t",
    statement: "s",
    catalysts: [],
    falsifiers: [],
    risks: [],
    horizon: "unspecified",
    effectiveAt: null,
    revisionNote: null,
    ...overrides,
  };
}

function detailFor(s: ThesisSummary, overrides: Partial<ThesisVersion["content"]> = {}): ThesisDetail {
  const current: ThesisVersion = {
    id: `${s.id}-v${s.currentVersion}`,
    thesisId: s.id,
    version: s.currentVersion,
    previousVersion: s.currentVersion > 1 ? s.currentVersion - 1 : null,
    transition: "create",
    lifecycleState: s.lifecycleState,
    subject: s.subject,
    content: content(overrides),
    clientRequestId: `cr-${s.id}`,
    systemRecordedAt: s.updatedAt,
    effectiveAt: null,
  };
  return { ...s, createdAt: "2026-01-01T00:00:00.000Z", current, history: [], historyTruncated: false };
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** Fetch stub over the real `/api/theses` contract (list / ?id= / ?ids=). */
function installFetch(theses: ThesisSummary[], details: Map<string, ThesisDetail>) {
  const idsCalls: string[][] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw, "https://x.test");
    if (url.pathname !== "/api/theses") return jsonResponse({ error: "not_found" }, 404);
    const ids = url.searchParams.getAll("ids");
    if (ids.length > 0) {
      idsCalls.push(ids);
      const batch: ThesisDetail[] = [];
      const missing: string[] = [];
      for (const id of ids) {
        const d = details.get(id);
        if (d) batch.push(d);
        else missing.push(id);
      }
      return jsonResponse({ batch, missing });
    }
    const id = url.searchParams.get("id");
    if (id) {
      const d = details.get(id);
      return d ? jsonResponse({ thesis: d }) : jsonResponse({ error: "thesis_not_found" }, 404);
    }
    return jsonResponse({ theses, truncated: false });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, idsCalls };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(props: { ownerKey: string }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ThesisWorkspace ownerKey={props.ownerKey} />);
  });
  await flush();
  return container;
}

beforeEach(() => {
  // Node 26 registers its OWN experimental global `localStorage`/`sessionStorage`
  // getters (which throw/warn without --localstorage-file). Vitest's jsdom
  // environment only overwrites a global key that already exists on Node's
  // globalThis if that key is in its own (pre-Node-localStorage) allowlist, so on
  // this Node version `window.localStorage` silently resolves to Node's broken
  // stub instead of jsdom's real Storage — force it back to jsdom's own instance.
  const dom = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom;
  if (dom) {
    Object.defineProperty(window, "localStorage", { value: dom.window.localStorage, configurable: true, writable: true });
    Object.defineProperty(window, "sessionStorage", { value: dom.window.sessionStorage, configurable: true, writable: true });
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
  if (!window.matchMedia) {
    // jsdom does not implement matchMedia; onLensKeyDown only reads `.matches`.
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function tabs(el: HTMLElement): HTMLButtonElement[] {
  return Array.from(el.querySelectorAll('[data-testid="thesis-lens-rail"] [role="tab"]'));
}

describe("ThesisWorkspace lens rail (B-F11-2, M2)", () => {
  it("tablist: roving tabIndex, and Home/End jump to the first/last lens", async () => {
    const t1: ThesisSummary = { id: "t1", currentVersion: 1, lifecycleState: "active", subject: subject("AAA", "Alpha Co"), title: "Alpha", updatedAt: "2026-09-01T00:00:00.000Z" };
    installFetch([t1], new Map());
    const el = await mount({ ownerKey: "owner-tablist" });

    const initial = tabs(el);
    expect(initial.map((b) => b.dataset.view)).toEqual(["coverage", "ideas", "theses", "reviews", "catalysts", "risks", "notes"]);
    // default view is "theses": only its tab is in the roving tab order.
    expect(initial.find((b) => b.dataset.view === "theses")!.tabIndex).toBe(0);
    expect(initial.filter((b) => b.dataset.view !== "theses").every((b) => b.tabIndex === -1)).toBe(true);
    expect(initial.find((b) => b.dataset.view === "theses")!.getAttribute("aria-selected")).toBe("true");

    const list = el.querySelector('[role="tablist"]')!;
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    });
    let current = tabs(el);
    expect(current.find((b) => b.dataset.view === "coverage")!.getAttribute("aria-selected")).toBe("true");
    expect(current.find((b) => b.dataset.view === "coverage")!.tabIndex).toBe(0);

    await act(async () => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    });
    current = tabs(el);
    expect(current.find((b) => b.dataset.view === "notes")!.getAttribute("aria-selected")).toBe("true");
    expect(current.find((b) => b.dataset.view === "notes")!.tabIndex).toBe(0);
  });

  it("lens memory: selecting a lens persists mm.thesis.lens.v1:<ownerKey>, and a remount restores it", async () => {
    const t1: ThesisSummary = { id: "t1", currentVersion: 1, lifecycleState: "active", subject: subject("AAA", "Alpha Co"), title: "Alpha", updatedAt: "2026-09-01T00:00:00.000Z" };
    installFetch([t1], new Map());
    const ownerKey = "owner-memory";
    let el = await mount({ ownerKey });

    const coverageTab = tabs(el).find((b) => b.dataset.view === "coverage")!;
    await act(async () => {
      coverageTab.click();
    });
    expect(window.localStorage.getItem(`mm.thesis.lens.v1:${ownerKey}`)).toBe("coverage");

    // Remount fresh (new root, same owner + same storage) — the lens-restore effect
    // must read the persisted key back.
    await act(async () => root!.unmount());
    container?.remove();
    installFetch([t1], new Map());
    el = await mount({ ownerKey });
    expect(tabs(el).find((b) => b.dataset.view === "coverage")!.getAttribute("aria-selected")).toBe("true");
  });

  it("Coverage → subject filter: the Theses lens names the subject (never 'Everything you have written'), and a labeled chip clears it (M3)", async () => {
    const alphaA: ThesisSummary = { id: "a1", currentVersion: 1, lifecycleState: "active", subject: subject("AAA", "Alpha Co"), title: "Alpha thesis one", updatedAt: "2026-09-02T00:00:00.000Z" };
    const alphaB: ThesisSummary = { id: "a2", currentVersion: 1, lifecycleState: "active", subject: subject("AAA", "Alpha Co"), title: "Alpha thesis two", updatedAt: "2026-09-01T00:00:00.000Z" };
    const beta: ThesisSummary = { id: "b1", currentVersion: 1, lifecycleState: "active", subject: subject("BBB", "Beta Co"), title: "Beta thesis", updatedAt: "2026-08-30T00:00:00.000Z" };
    installFetch([alphaA, alphaB, beta], new Map());
    const el = await mount({ ownerKey: "owner-subject-filter" });

    // Unfiltered Theses lens carries the generic "everything" sentence.
    expect(el.querySelector(".lensWhat, [class*='lensWhat']")?.textContent).toBe("Everything you have written.");

    const coverageTab = tabs(el).find((b) => b.dataset.view === "coverage")!;
    await act(async () => coverageTab.click());
    const alphaRow = Array.from(el.querySelectorAll('[data-testid="thesis-list-pane"] button')).find((b) =>
      b.textContent?.includes("Alpha Co"),
    ) as HTMLButtonElement;
    expect(alphaRow).toBeTruthy();
    await act(async () => alphaRow.click());

    // Clicking a Coverage row jumps to Theses, filtered to that subject.
    expect(tabs(el).find((b) => b.dataset.view === "theses")!.getAttribute("aria-selected")).toBe("true");
    const rows = Array.from(el.querySelectorAll('[data-testid="thesis-list-pane"] .thesisList button, [data-testid="rms-lens-panel"] button'));
    expect(rows.some((b) => b.textContent?.includes("Alpha thesis one"))).toBe(true);
    expect(rows.some((b) => b.textContent?.includes("Beta thesis"))).toBe(false);
    expect(el.querySelector("[class*='lensWhat']")?.textContent).toBe("Only what you have written about Alpha Co.");
    expect(el.querySelector("[class*='lensWhat']")?.textContent).not.toBe("Everything you have written.");

    const chip = el.querySelector('[data-testid="rms-subject-chip"]') as HTMLButtonElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent).toBe("Alpha Co · Show everything");

    await act(async () => chip.click());
    expect(el.querySelector('[data-testid="rms-subject-chip"]')).toBeNull();
    expect(el.querySelector("[class*='lensWhat']")?.textContent).toBe("Everything you have written.");
    const clearedRows = Array.from(el.querySelectorAll('[data-testid="rms-lens-panel"] button'));
    expect(clearedRows.some((b) => b.textContent?.includes("Beta thesis"))).toBe(true);
  });

  it("every lens renders its own empty state when there is nothing to show", async () => {
    installFetch([], new Map());
    const el = await mount({ ownerKey: "owner-empty" });

    const expectedEmpty: Record<string, string> = {
      coverage: "Nothing is covered yet. Write a thesis and its subject appears here.",
      ideas: "Nothing new is waiting. Every thesis has been revisited at least once.",
      theses: "No theses yet. Start with a view you could be wrong about.",
      reviews: "Nothing is waiting for a second look.",
      catalysts: "No catalysts written down in the theses loaded here.",
      risks: "No risks written down in the theses loaded here.",
      notes: "No revision notes yet. They appear when you save a change and say why.",
    };
    for (const [view, text] of Object.entries(expectedEmpty)) {
      const tab = tabs(el).find((b) => b.dataset.view === view)!;
      await act(async () => {
        tab.click();
      });
      const empty = el.querySelector('[data-testid="rms-empty"]');
      expect(empty, `expected an empty state for lens "${view}"`).not.toBeNull();
      expect(empty!.textContent).toBe(text);
    }
  });

  it("condition line: with no monitor reader wired, it renders the typed not-connected sentence (M1) — never a transient-error word", async () => {
    const t1: ThesisSummary = { id: "t1", currentVersion: 1, lifecycleState: "active", subject: subject("AAA", "Alpha Co"), title: "Alpha", updatedAt: "2026-09-01T00:00:00.000Z" };
    installFetch([t1], new Map([["t1", detailFor(t1)]]));
    const el = await mount({ ownerKey: "owner-condition" });

    const row = el.querySelector('[data-testid="thesis-list-pane"] .thesisList button, [data-testid="thesis-list-pane"] button') as HTMLButtonElement | null;
    // Select the one thesis row in the (default) Theses lens.
    const thesesButtons = Array.from(el.querySelectorAll('[data-testid="thesis-list-pane"] button')).filter(
      (b) => b.textContent?.includes("Alpha"),
    ) as HTMLButtonElement[];
    expect(thesesButtons.length).toBeGreaterThan(0);
    await act(async () => {
      thesesButtons[0].click();
    });
    await flush();

    const cond = el.querySelector('[data-testid="thesis-condition"]');
    expect(cond).not.toBeNull();
    expect(cond!.getAttribute("data-source")).toBe("unavailable");
    expect(cond!.textContent).toBe("Condition checks are not connected yet.");
    expect(cond!.textContent).not.toMatch(/unavailable|error|failed/i);
    void row;
  });

  it("bounded hydration: active-only budget (m5), one automatic batch of 10, a second only on 'Show 10 more', and knowable counts once complete (m1)", async () => {
    const active = Array.from({ length: 12 }, (_, i) =>
      ({
        id: `h${i}`,
        currentVersion: 2,
        lifecycleState: "active" as const,
        subject: subject("AAA", "Alpha Co"),
        title: `Thesis ${i}`,
        updatedAt: new Date(2026, 0, i + 1).toISOString(),
      }) satisfies ThesisSummary,
    );
    // m5 (round-2 review): 3 non-active theses, dated NEWER than every active one, so a
    // budget that is not filtered to "active" would spend hydration slots on them first
    // (selectHydrationIds sorts newest-first) — and catalystRows never surfaces a line
    // for a non-active thesis, so those slots would add zero rows while still advancing
    // the scope sentence. They carry no catalysts fixture content either way.
    const inactive: ThesisSummary[] = [
      { id: "arc1", currentVersion: 1, lifecycleState: "archived", subject: subject("AAA", "Alpha Co"), title: "Archived one", updatedAt: "2026-09-05T00:00:00.000Z" },
      { id: "arc2", currentVersion: 1, lifecycleState: "archived", subject: subject("AAA", "Alpha Co"), title: "Archived two", updatedAt: "2026-09-04T00:00:00.000Z" },
      { id: "inv1", currentVersion: 1, lifecycleState: "invalidated", subject: subject("AAA", "Alpha Co"), title: "Invalidated one", updatedAt: "2026-09-03T00:00:00.000Z" },
    ];
    const all = [...inactive, ...active];
    const details = new Map(all.map((s) => [s.id, detailFor(s, s.lifecycleState === "active" ? { catalysts: [`cat-${s.id}`] } : {})]));
    const { idsCalls } = installFetch(all, details);
    const el = await mount({ ownerKey: "owner-hydration" });

    const catalystsTab = tabs(el).find((b) => b.dataset.view === "catalysts")!;
    // m1: before hydration completes, the content-lens count is unknowable.
    expect(catalystsTab.querySelector("[class*='lensCount']")?.textContent).toBe("—");
    await act(async () => {
      catalystsTab.click();
    });
    await flush();

    expect(idsCalls.length).toBe(1);
    expect(idsCalls[0].length).toBe(10);
    // Every id in the first automatic batch is one of the 12 ACTIVE theses — none of
    // the 3 newer non-active ones — and the scope denominator is 12, not 15.
    expect(idsCalls[0].every((id) => active.some((s) => s.id === id))).toBe(true);
    expect(el.querySelector('[data-testid="rms-scope"]')?.textContent).toBe("Showing lines from 10 of your 12 theses.");
    expect(catalystsTab.querySelector("[class*='lensCount']")?.textContent).toBe("—");

    // Switching lenses away and back must NOT re-trigger an automatic batch (M4: one
    // automatic batch, ever, per mount — not "once per lens").
    await act(async () => {
      tabs(el).find((b) => b.dataset.view === "risks")!.click();
    });
    await flush();
    await act(async () => {
      tabs(el).find((b) => b.dataset.view === "catalysts")!.click();
    });
    await flush();
    expect(idsCalls.length).toBe(1);

    const showMore = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Show 10 more") as HTMLButtonElement;
    expect(showMore).toBeTruthy();
    await act(async () => {
      showMore.click();
    });
    await flush();

    expect(idsCalls.length).toBe(2);
    expect(idsCalls[1].length).toBe(2);
    const allRequested = new Set([...idsCalls[0], ...idsCalls[1]]);
    expect(allRequested.size).toBe(12);
    expect([...allRequested].every((id) => active.some((s) => s.id === id))).toBe(true);
    expect(el.querySelector('[data-testid="rms-scope"]')?.textContent).toBe("Showing lines from all 12 of your theses.");
    expect(Array.from(el.querySelectorAll("button")).some((b) => b.textContent === "Show 10 more")).toBe(false);
    // m1: scope is now complete, so the catalysts count is exactly knowable (one
    // catalyst per active thesis, none from the 3 non-active ones).
    expect(tabs(el).find((b) => b.dataset.view === "catalysts")!.querySelector("[class*='lensCount']")?.textContent).toBe("12");
  });

  it("bounded hydration: an all-missing first batch never chains a second automatic fetch (M4)", async () => {
    // Reproduces the exact round-2 trigger: hydratedDetails stays at size 0 because
    // every id in the batch comes back `missing` (e.g. concurrently deleted rows) — the
    // bug was that `missingIds` growing re-fired the effect and chained further
    // automatic batches until scope completed.
    const active = Array.from({ length: 12 }, (_, i) =>
      ({
        id: `m${i}`,
        currentVersion: 1,
        lifecycleState: "active" as const,
        subject: subject("AAA", "Alpha Co"),
        title: `Thesis ${i}`,
        updatedAt: new Date(2026, 0, i + 1).toISOString(),
      }) satisfies ThesisSummary,
    );
    const { idsCalls } = installFetch(active, new Map()); // empty details map => every id comes back `missing`
    const el = await mount({ ownerKey: "owner-hydration-missing" });

    await act(async () => {
      tabs(el).find((b) => b.dataset.view === "catalysts")!.click();
    });
    await flush();
    await flush();
    await flush();

    expect(idsCalls.length).toBe(1);
  });
});
