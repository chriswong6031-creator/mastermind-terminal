import { expect, test, type Locator, type Page } from "@playwright/test";

const TOOLBAR_DEFAULT_UNARMED_BUDGET_MS = 8_000;
const TOOLBAR_TEST_RESERVE_MS = 3_000;
const TOOLBAR_SETTLE_WAIT_MS = 4_000;
const TOOLBAR_ACTION_WAIT_MS = 2_000;
const TOOLBAR_EFFECT_SETTLE_MS = 1_500;
const toolbarDeadlines = new WeakMap<Page, number>();

type ToolbarMode = "full" | "overflow" | "compact";

type ToolbarSnapshot = {
  mode: ToolbarMode | null;
  revision: number | null;
  settled: boolean;
};

type DeadlineAwareTestInfo = ReturnType<typeof test.info> & {
  /** Pinned Playwright runner wall-clock start; guarded because it is not public API. */
  _startWallTime?: number;
};

export type ToolbarFailureReceipt = {
  what: string;
  mode: ToolbarMode | null;
  revision: number | null;
  settled: boolean;
  direct_visible: boolean;
  more_visible: boolean;
  more_enabled: boolean;
  overflow_open: boolean;
  done: boolean;
  budget_remaining_ms: number;
  page_closed: boolean;
};

export function formatToolbarFailure(
  code: "TOOLBAR_PAGE_CLOSED" | "TOOLBAR_NOT_SETTLED" | "TOOLBAR_ACTION_FAILED",
  receipt: ToolbarFailureReceipt,
): string {
  return `${code} ${JSON.stringify(receipt)}`;
}

/**
 * Bind every toolbar action on this page to one absolute deadline. The preferred path uses the
 * current test's actual wall-clock start and configured timeout, leaving a fixed reserve for
 * Playwright to report and tear down cleanly. A guarded short fallback is used if a future runner
 * stops exposing its start time; it never recreates the former 25-second per-action allowance.
 */
export function armToolbarJourneyDeadline(
  page: Page,
  testTimeoutMs: number,
  testStartedAtMs?: number,
): number {
  const now = Date.now();
  const validTimeout = Number.isFinite(testTimeoutMs) && testTimeoutMs > 0;
  const validStart = Number.isFinite(testStartedAtMs)
    && Number(testStartedAtMs) > 0
    && Number(testStartedAtMs) <= now;

  const fallbackBudget = validTimeout
    ? Math.min(TOOLBAR_DEFAULT_UNARMED_BUDGET_MS, Math.max(0, testTimeoutMs - TOOLBAR_TEST_RESERVE_MS))
    : TOOLBAR_DEFAULT_UNARMED_BUDGET_MS;
  const deadline = validTimeout && validStart
    ? Number(testStartedAtMs) + testTimeoutMs - TOOLBAR_TEST_RESERVE_MS
    : now + fallbackBudget;
  const bounded = Math.max(now, deadline);
  toolbarDeadlines.set(page, bounded);
  return bounded;
}

function toolbarDeadline(page: Page): number {
  const existing = toolbarDeadlines.get(page);
  if (existing != null) return existing;

  try {
    const timeout = test.info().timeout;
    const info = test.info() as DeadlineAwareTestInfo;
    return armToolbarJourneyDeadline(page, timeout, info._startWallTime);
  } catch {
    return armToolbarJourneyDeadline(
      page,
      TOOLBAR_DEFAULT_UNARMED_BUDGET_MS + TOOLBAR_TEST_RESERVE_MS,
    );
  }
}

function budgetRemaining(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function boundedTimeout(deadline: number, ceiling: number): number {
  return Math.max(0, Math.min(ceiling, budgetRemaining(deadline)));
}

function actionTimeout(deadline: number): number {
  return boundedTimeout(deadline, TOOLBAR_ACTION_WAIT_MS);
}

async function readToolbarSnapshot(page: Page): Promise<ToolbarSnapshot> {
  if (page.isClosed()) return { mode: null, revision: null, settled: false };
  return page.locator(".chart-tabs").first().evaluate((root): ToolbarSnapshot => {
    const rawMode = root.getAttribute("data-toolbar-mode");
    const mode: ToolbarMode | null = rawMode === "full"
      || rawMode === "overflow"
      || rawMode === "compact"
      ? rawMode
      : null;
    const rawRevision = root.getAttribute("data-toolbar-revision");
    const revision = rawRevision != null && /^\d+$/.test(rawRevision)
      ? Number(rawRevision)
      : null;
    return {
      mode,
      revision,
      settled: root.getAttribute("data-toolbar-settled") === "true",
    };
  }).catch((): ToolbarSnapshot => ({ mode: null, revision: null, settled: false }));
}

type ToolbarAction = {
  /** True iff the action has landed / the requested surface is open. */
  done: () => Promise<boolean>;
  /** The toolbar control whose committed visibility selects direct versus overflow. */
  control: Locator;
  /** Act on the committed direct control. */
  direct: (timeout: number) => Promise<void>;
  /** Act via the committed More menu. */
  overflow: (menu: Locator, timeout: number) => Promise<void>;
  what: string;
};

async function captureToolbarFailure(
  page: Page,
  opts: ToolbarAction,
  deadline: number,
): Promise<ToolbarFailureReceipt> {
  const pageClosed = page.isClosed();
  if (pageClosed) {
    return {
      what: opts.what,
      mode: null,
      revision: null,
      settled: false,
      direct_visible: false,
      more_visible: false,
      more_enabled: false,
      overflow_open: false,
      done: false,
      budget_remaining_ms: budgetRemaining(deadline),
      page_closed: true,
    };
  }

  const snapshot = await readToolbarSnapshot(page);
  const more = page.getByTestId("toolbar-more");
  const overflow = page.locator(".toolbar-overflow-pop.show");
  const [directVisible, moreVisible, moreEnabled, overflowOpen, done] = await Promise.all([
    opts.control.isVisible().catch(() => false),
    more.isVisible().catch(() => false),
    more.isEnabled().catch(() => false),
    overflow.isVisible().catch(() => false),
    opts.done().catch(() => false),
  ]);
  return {
    what: opts.what,
    mode: snapshot.mode,
    revision: snapshot.revision,
    settled: snapshot.settled,
    direct_visible: directVisible,
    more_visible: moreVisible,
    more_enabled: moreEnabled,
    overflow_open: overflowOpen,
    done,
    budget_remaining_ms: budgetRemaining(deadline),
    page_closed: false,
  };
}

async function failToolbar(
  page: Page,
  opts: ToolbarAction,
  deadline: number,
  code: "TOOLBAR_PAGE_CLOSED" | "TOOLBAR_NOT_SETTLED" | "TOOLBAR_ACTION_FAILED",
): Promise<never> {
  throw new Error(formatToolbarFailure(code, await captureToolbarFailure(page, opts, deadline)));
}

async function failToolbarActionUnlessDone(
  page: Page,
  opts: ToolbarAction,
  deadline: number,
): Promise<void> {
  const receipt = await captureToolbarFailure(page, opts, deadline);
  if (receipt.done) return;
  const code = receipt.page_closed ? "TOOLBAR_PAGE_CLOSED" : "TOOLBAR_ACTION_FAILED";
  throw new Error(formatToolbarFailure(code, receipt));
}

async function waitForSettledToolbar(
  page: Page,
  opts: ToolbarAction,
  deadline: number,
): Promise<ToolbarSnapshot> {
  if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");
  const timeout = boundedTimeout(deadline, TOOLBAR_SETTLE_WAIT_MS);
  if (timeout <= 0) return failToolbar(page, opts, deadline, "TOOLBAR_NOT_SETTLED");

  try {
    const handle = await page.waitForFunction(() => {
      const root = document.querySelector<HTMLElement>(".chart-tabs");
      if (!root || root.dataset.toolbarSettled !== "true") return false;
      const revision = root.dataset.toolbarRevision;
      const mode = root.dataset.toolbarMode;
      if (
        revision == null
        || !/^\d+$/.test(revision)
        || Number(revision) <= 0
        || (mode !== "full" && mode !== "overflow" && mode !== "compact")
      ) return false;
      return { mode, revision: Number(revision), settled: true };
    }, undefined, { timeout });
    const snapshot = await handle.jsonValue() as ToolbarSnapshot;
    await handle.dispose();
    return snapshot;
  } catch {
    if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");
    return failToolbar(page, opts, deadline, "TOOLBAR_NOT_SETTLED");
  }
}

/** Observe one already-issued action. This polls state only; it never repeats the product action. */
async function observeToolbarEffect(
  observed: () => Promise<boolean>,
  deadline: number,
): Promise<boolean> {
  if (await observed().catch(() => false)) return true;
  const timeout = boundedTimeout(deadline, TOOLBAR_EFFECT_SETTLE_MS);
  if (timeout <= 0) return observed().catch(() => false);

  try {
    await expect.poll(
      () => observed().catch(() => false),
      { timeout, intervals: [50, 100, 200, 300] },
    ).toBe(true);
    return true;
  } catch {
    return observed().catch(() => false);
  }
}

/**
 * Issue one real click, then trust the semantic state rather than the click promise alone. Under a
 * saturated browser, Playwright can time out while the event handler has already committed its
 * effect. Continuing from that observed effect is not a retry and never repeats the click.
 */
async function clickOnceAndObserve(
  page: Page,
  target: Locator,
  observed: () => Promise<boolean>,
  deadline: number,
): Promise<boolean> {
  if (await observed().catch(() => false)) return true;
  const timeout = actionTimeout(deadline);
  if (timeout <= 0) return false;

  let clickFailed = false;
  try {
    await target.click({ timeout });
  } catch {
    clickFailed = true;
  }

  if (page.isClosed()) return false;
  const landed = await observeToolbarEffect(observed, deadline);
  if (landed) return true;
  if (clickFailed) return false;
  return observed().catch(() => false);
}

async function openOverflow(page: Page, deadline: number, opts: ToolbarAction) {
  if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");

  const menu = page.locator(".toolbar-overflow-pop.show");
  const opened = await clickOnceAndObserve(
    page,
    page.getByTestId("toolbar-more"),
    () => menu.isVisible().catch(() => false),
    deadline,
  );
  if (!opened) return failToolbar(page, opts, deadline, "TOOLBAR_ACTION_FAILED");

  // The menu remembers its drill view. Walk back to the root before handing it to the action.
  const back = menu.locator(".toolbar-overflow-back");
  if (await back.isVisible().catch(() => false)) {
    const atRoot = await clickOnceAndObserve(
      page,
      back,
      async () => (await menu.isVisible().catch(() => false))
        && !(await back.isVisible().catch(() => false)),
      deadline,
    );
    if (!atRoot) return failToolbar(page, opts, deadline, "TOOLBAR_ACTION_FAILED");
  }
  return menu;
}

/**
 * Consume one committed adaptive-toolbar revision, choose one route, and act once. A second action
 * is allowed only when the toolbar proves that a newer committed revision replaced the first while
 * the click was in flight. Product/action failures on an unchanged revision are returned with a
 * concrete state receipt; they are never swallowed into a best-of-N poll.
 */
async function viaToolbar(page: Page, opts: ToolbarAction) {
  const deadline = toolbarDeadline(page);
  if (await opts.done()) return;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await waitForSettledToolbar(page, opts, deadline);
    if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");

    const timeout = actionTimeout(deadline);
    if (timeout <= 0) return failToolbarActionUnlessDone(page, opts, deadline);

    // Visibility is inspected only after the atomic committed receipt. If a newer revision moves
    // the control during the click, the post-action revision check permits exactly one recovery.
    const directVisible = await opts.control.isVisible().catch(() => false);
    try {
      if (directVisible) {
        await opts.direct(timeout);
      } else {
        await opts.overflow(await openOverflow(page, deadline, opts), timeout);
      }
    } catch {
      // A click promise may time out after its event already landed. Observe the promised effect
      // below before classifying it as a failure; never repeat the action on the same revision.
    }

    if (await observeToolbarEffect(opts.done, deadline)) return;
    if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");

    const afterAction = await readToolbarSnapshot(page);
    const revisionChanged = !afterAction.settled
      || afterAction.revision !== snapshot.revision
      || afterAction.mode !== snapshot.mode;
    if (attempt === 0 && revisionChanged) continue;

    await failToolbarActionUnlessDone(page, opts, deadline);
    return;
  }

  await failToolbarActionUnlessDone(page, opts, deadline);
}

function routeOnlyAction(page: Page, what: string, control: Locator): ToolbarAction {
  return {
    what,
    done: async () => false,
    control,
    direct: async () => {},
    overflow: async () => {},
  };
}

export async function toggleToolbarReplay(page: Page) {
  const direct = page.locator('[data-toolbar-action="replay"]');
  const deadline = toolbarDeadline(page);
  await waitForSettledToolbar(page, routeOnlyAction(page, "the Replay toggle", direct), deadline);
  if (await direct.isVisible()) {
    await direct.click({ timeout: actionTimeout(deadline) });
    return;
  }
  const menu = await openOverflow(page, deadline, routeOnlyAction(page, "the Replay toggle", direct));
  await menu.locator('[data-toolbar-menu-action="replay"]').click({ timeout: actionTimeout(deadline) });
}

export async function chooseToolbarSplit(page: Page, count: 1 | 2 | 4) {
  const seg = page.locator('[data-toolbar-action="split"]').getByRole("button", { name: String(count), exact: true });
  await viaToolbar(page, {
    what: `split ${count}`,
    // The split control renders in both menus, so ask the chart how many panes exist instead.
    done: async () => (await page.locator(".chart-wrap").count()) === count,
    control: seg,
    direct: (timeout) => seg.click({ timeout }),
    overflow: (menu, timeout) => menu.locator(".toolbar-overflow-group .seg")
      .getByRole("button", { name: String(count), exact: true })
      .click({ timeout }),
  });
}

/** Open the Saved-Layouts menu and return its body at any viewport. */
export async function openLayoutMenu(page: Page) {
  const directPop = page.locator('[data-toolbar-action="layouts"] .pop.show');
  const overflowPop = page.locator(".toolbar-overflow-pop.show");
  const control = page.locator('[data-toolbar-action="layouts"] > button');
  await viaToolbar(page, {
    what: "the Saved Layouts menu",
    done: async () => (await directPop.locator("[data-layout-save]").isVisible())
      || (await overflowPop.locator("[data-layout-save]").isVisible()),
    control,
    direct: (timeout) => control.click({ timeout }),
    overflow: (menu, timeout) => menu.locator('[data-toolbar-menu-action="layouts"]').click({ timeout }),
  });
  return (await directPop.locator("[data-layout-save]").isVisible()) ? directPop : overflowPop;
}

/** Flip pane Sync (only rendered with more than one pane), at any viewport. */
export async function toggleToolbarSync(page: Page) {
  const control = page.locator('[data-toolbar-action="sync"]');
  const before = await control.getAttribute("data-sync-on").catch(() => null);
  await viaToolbar(page, {
    what: "the Sync toggle",
    done: async () => (await control.getAttribute("data-sync-on").catch(() => null)) !== before,
    control,
    direct: (timeout) => control.click({ timeout }),
    overflow: (menu, timeout) => menu.locator('[data-toolbar-menu-action="sync"]').click({ timeout }),
  });
}

export async function runToolbarDetector(page: Page, label: string) {
  const direct = page.locator('[data-toolbar-action="detect"]');
  const deadline = toolbarDeadline(page);
  await waitForSettledToolbar(page, routeOnlyAction(page, `the ${label} detector`, direct), deadline);
  if (await direct.isVisible()) {
    await direct.locator(":scope > button").click({ timeout: actionTimeout(deadline) });
    await page.locator(".pop.show .menu-row").filter({ hasText: label })
      .click({ timeout: actionTimeout(deadline) });
    return;
  }
  const menu = await openOverflow(page, deadline, routeOnlyAction(page, `the ${label} detector`, direct));
  await menu.locator('[data-toolbar-menu-action="detect"]').click({ timeout: actionTimeout(deadline) });
  await menu.locator('[data-toolbar-menu-action^="detect-"]').filter({ hasText: label })
    .click({ timeout: actionTimeout(deadline) });
}
