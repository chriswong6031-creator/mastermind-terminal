import { expect, test, type Locator, type Page } from "@playwright/test";

const TOOLBAR_DEFAULT_UNARMED_BUDGET_MS = 8_000;
const TOOLBAR_INVOCATION_BUDGET_MS = 12_000;
const TOOLBAR_TEST_RESERVE_MS = 3_000;
const TOOLBAR_SETTLE_WAIT_MS = 4_000;
const TOOLBAR_EFFECT_SETTLE_MS = 1_500;
const TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS = 2_000;

type ToolbarMode = "full" | "overflow" | "compact";
type ToolbarSnapshot = { mode: ToolbarMode | null; revision: number | null; settled: boolean };
type DeadlineAwareTestInfo = ReturnType<typeof test.info> & { _startWallTime?: number };
type ToolbarAction = {
  done: () => Promise<boolean>;
  control: Locator;
  direct: (timeout: number) => Promise<void>;
  overflow: (menu: Locator, timeout: number) => Promise<void>;
  what: string;
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

type ToolbarFailureCode = "TOOLBAR_PAGE_CLOSED" | "TOOLBAR_NOT_SETTLED" | "TOOLBAR_ACTION_FAILED";

export function formatToolbarFailure(code: ToolbarFailureCode, receipt: ToolbarFailureReceipt): string {
  return `${code} ${JSON.stringify(receipt)}`;
}

/** One fresh finite deadline per exported toolbar intent, capped by the owning test. */
export function armToolbarJourneyDeadline(testTimeoutMs: number, testStartedAtMs?: number): number {
  const now = Date.now();
  const validTimeout = Number.isFinite(testTimeoutMs) && testTimeoutMs > 0;
  const validStart = Number.isFinite(testStartedAtMs)
    && Number(testStartedAtMs) > 0
    && Number(testStartedAtMs) <= now;
  if (validTimeout && validStart) {
    const testBound = Number(testStartedAtMs) + testTimeoutMs - TOOLBAR_TEST_RESERVE_MS;
    return Math.min(now + TOOLBAR_INVOCATION_BUDGET_MS, testBound);
  }
  const fallbackBudget = validTimeout
    ? Math.min(TOOLBAR_DEFAULT_UNARMED_BUDGET_MS, Math.max(0, testTimeoutMs - TOOLBAR_TEST_RESERVE_MS))
    : TOOLBAR_DEFAULT_UNARMED_BUDGET_MS;
  return now + fallbackBudget;
}

function toolbarJourneyDeadline(): number {
  try {
    const timeout = test.info().timeout;
    const info = test.info() as DeadlineAwareTestInfo;
    return armToolbarJourneyDeadline(timeout, info._startWallTime);
  } catch {
    return armToolbarJourneyDeadline(TOOLBAR_DEFAULT_UNARMED_BUDGET_MS + TOOLBAR_TEST_RESERVE_MS);
  }
}

function budgetRemaining(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function boundedTimeout(deadline: number, ceiling: number): number {
  return Math.max(0, Math.min(ceiling, budgetRemaining(deadline)));
}

export function allocateToolbarStage(
  remainingMs: number,
  requestedFutureReserveMs: number,
): { currentMs: number; futureMs: number } {
  const remaining = Math.max(0, Math.floor(remainingMs));
  if (remaining === 0) return { currentMs: 0, futureMs: 0 };

  // A fixed future reserve can exceed the real test-bound budget late in a long scenario. The old
  // helper then refused to issue the current click even while several usable seconds remained.
  // Preserve the requested reserve when the invocation can afford it; otherwise split the remaining
  // budget evenly so the current stage and its declared continuation can both make progress.
  const requested = Math.max(0, Math.floor(requestedFutureReserveMs));
  const futureMs = Math.min(requested, Math.floor(remaining / 2));
  return { currentMs: remaining - futureMs, futureMs };
}

function actionTimeout(deadline: number, reserveAfterMs = TOOLBAR_EFFECT_SETTLE_MS): number {
  return allocateToolbarStage(budgetRemaining(deadline), reserveAfterMs).currentMs;
}

/**
 * Toolbar controls mutate local React state; none of these actions navigates. Keep Playwright's real
 * actionability checks, but do not let its post-click navigation watcher consume this intent's
 * bounded budget after the browser event has already landed. Semantic state remains the authority.
 */
function clickLocalToolbarControl(target: Locator, timeout: number): Promise<void> {
  return target.click({ timeout, noWaitAfter: true });
}

async function readToolbarSnapshot(page: Page): Promise<ToolbarSnapshot> {
  if (page.isClosed()) return { mode: null, revision: null, settled: false };
  return page.locator(".chart-tabs").first().evaluate((root): ToolbarSnapshot => {
    const rawMode = root.getAttribute("data-toolbar-mode");
    const mode = rawMode === "full" || rawMode === "overflow" || rawMode === "compact" ? rawMode : null;
    const rawRevision = root.getAttribute("data-toolbar-revision");
    const revision = rawRevision != null && /^\d+$/.test(rawRevision) ? Number(rawRevision) : null;
    return { mode, revision, settled: root.getAttribute("data-toolbar-settled") === "true" };
  }).catch(() => ({ mode: null, revision: null, settled: false }));
}

async function captureToolbarFailure(
  page: Page,
  opts: ToolbarAction,
  deadline: number,
): Promise<ToolbarFailureReceipt> {
  if (page.isClosed()) {
    return {
      what: opts.what, mode: null, revision: null, settled: false,
      direct_visible: false, more_visible: false, more_enabled: false,
      overflow_open: false, done: false, budget_remaining_ms: budgetRemaining(deadline),
      page_closed: true,
    };
  }
  const snapshot = await readToolbarSnapshot(page);
  const more = page.getByTestId("toolbar-more");
  const [directVisible, moreVisible, moreEnabled, overflowOpen, done] = await Promise.all([
    opts.control.isVisible().catch(() => false),
    more.isVisible().catch(() => false),
    more.isEnabled().catch(() => false),
    page.locator(".toolbar-overflow-pop.show").isVisible().catch(() => false),
    opts.done().catch(() => false),
  ]);
  return {
    what: opts.what, mode: snapshot.mode, revision: snapshot.revision, settled: snapshot.settled,
    direct_visible: directVisible, more_visible: moreVisible, more_enabled: moreEnabled,
    overflow_open: overflowOpen, done, budget_remaining_ms: budgetRemaining(deadline),
    page_closed: false,
  };
}

async function failToolbar(
  page: Page,
  opts: ToolbarAction,
  deadline: number,
  code: ToolbarFailureCode,
): Promise<never> {
  throw new Error(formatToolbarFailure(code, await captureToolbarFailure(page, opts, deadline)));
}

async function failToolbarActionUnlessDone(page: Page, opts: ToolbarAction, deadline: number): Promise<void> {
  const receipt = await captureToolbarFailure(page, opts, deadline);
  if (receipt.done) return;
  throw new Error(formatToolbarFailure(
    receipt.page_closed ? "TOOLBAR_PAGE_CLOSED" : "TOOLBAR_ACTION_FAILED",
    receipt,
  ));
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
      if (!revision || !/^\d+$/.test(revision) || Number(revision) <= 0) return false;
      if (mode !== "full" && mode !== "overflow" && mode !== "compact") return false;
      return { mode, revision: Number(revision), settled: true };
    }, undefined, { timeout });
    const snapshot = await handle.jsonValue() as ToolbarSnapshot;
    await handle.dispose();
    return snapshot;
  } catch {
    return failToolbar(
      page,
      opts,
      deadline,
      page.isClosed() ? "TOOLBAR_PAGE_CLOSED" : "TOOLBAR_NOT_SETTLED",
    );
  }
}

/** Poll semantic state only; never repeat the already-issued product action. */
async function observeToolbarEffect(
  observed: () => Promise<boolean>,
  deadline: number,
  reserveAfterMs = 0,
): Promise<boolean> {
  if (await observed().catch(() => false)) return true;
  const observationBudget = allocateToolbarStage(
    budgetRemaining(deadline),
    reserveAfterMs,
  ).currentMs;
  const timeout = Math.min(TOOLBAR_EFFECT_SETTLE_MS, observationBudget);
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

async function clickOnceAndObserve(
  page: Page,
  target: Locator,
  observed: () => Promise<boolean>,
  deadline: number,
  reserveAfterMs = 0,
): Promise<boolean> {
  if (await observed().catch(() => false)) return true;
  const timeout = actionTimeout(deadline, TOOLBAR_EFFECT_SETTLE_MS + reserveAfterMs);
  if (timeout <= 0) return false;
  let clickFailed = false;
  try { await clickLocalToolbarControl(target, timeout); } catch { clickFailed = true; }
  if (page.isClosed()) return false;
  if (await observeToolbarEffect(observed, deadline, reserveAfterMs)) return true;
  if (clickFailed) return false;
  return observed().catch(() => false);
}

async function openOverflow(
  page: Page,
  deadline: number,
  opts: ToolbarAction,
  remainingMenuActions = 1,
): Promise<Locator> {
  if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");
  const menu = page.locator(".toolbar-overflow-pop.show");
  const opened = await clickOnceAndObserve(
    page,
    page.getByTestId("toolbar-more"),
    () => menu.isVisible().catch(() => false),
    deadline,
    (remainingMenuActions + 1) * TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS,
  );
  if (!opened) return failToolbar(
    page,
    opts,
    deadline,
    page.isClosed() ? "TOOLBAR_PAGE_CLOSED" : "TOOLBAR_ACTION_FAILED",
  );
  const back = menu.locator(".toolbar-overflow-back");
  if (await back.isVisible().catch(() => false)) {
    const atRoot = await clickOnceAndObserve(
      page,
      back,
      async () => (await menu.isVisible().catch(() => false))
        && !(await back.isVisible().catch(() => false)),
      deadline,
      remainingMenuActions * TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS,
    );
    if (!atRoot) return failToolbar(
      page,
      opts,
      deadline,
      page.isClosed() ? "TOOLBAR_PAGE_CLOSED" : "TOOLBAR_ACTION_FAILED",
    );
  }
  return menu;
}

async function viaToolbar(page: Page, opts: ToolbarAction): Promise<void> {
  const deadline = toolbarJourneyDeadline();
  if (await opts.done()) return;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await waitForSettledToolbar(page, opts, deadline);
    if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");
    const timeout = actionTimeout(deadline);
    if (timeout <= 0) return failToolbarActionUnlessDone(page, opts, deadline);
    const directVisible = await opts.control.isVisible().catch(() => false);
    try {
      if (directVisible) {
        await opts.direct(timeout);
      } else {
        const menu = await openOverflow(page, deadline, opts);
        const overflowTimeout = actionTimeout(deadline);
        if (overflowTimeout <= 0) return failToolbarActionUnlessDone(page, opts, deadline);
        await opts.overflow(menu, overflowTimeout);
      }
    } catch { /* observe the one click's semantic effect below */ }
    if (await observeToolbarEffect(opts.done, deadline)) return;
    if (page.isClosed()) return failToolbar(page, opts, deadline, "TOOLBAR_PAGE_CLOSED");
    const after = await readToolbarSnapshot(page);
    const revisionChanged = !after.settled
      || after.revision !== snapshot.revision
      || after.mode !== snapshot.mode;
    if (attempt === 0 && revisionChanged) continue;
    return failToolbarActionUnlessDone(page, opts, deadline);
  }
  return failToolbarActionUnlessDone(page, opts, deadline);
}

function routeOnlyAction(what: string, control: Locator): ToolbarAction {
  return { what, done: async () => false, control, direct: async () => {}, overflow: async () => {} };
}

export async function toggleToolbarReplay(page: Page): Promise<void> {
  const direct = page.locator('[data-toolbar-action="replay"]');
  const opts = routeOnlyAction("the Replay toggle", direct);
  const deadline = toolbarJourneyDeadline();
  await waitForSettledToolbar(page, opts, deadline);
  if (await direct.isVisible()) {
    await clickLocalToolbarControl(direct, actionTimeout(deadline));
    return;
  }
  const menu = await openOverflow(page, deadline, opts);
  await clickLocalToolbarControl(
    menu.locator('[data-toolbar-menu-action="replay"]'),
    actionTimeout(deadline),
  );
}

export async function chooseToolbarSplit(page: Page, count: 1 | 2 | 4): Promise<void> {
  const seg = page.locator('[data-toolbar-action="split"]').getByRole("button", { name: String(count), exact: true });
  await viaToolbar(page, {
    what: `split ${count}`,
    done: async () => (await page.locator(".chart-wrap").count()) === count,
    control: seg,
    direct: (timeout) => clickLocalToolbarControl(seg, timeout),
    overflow: (menu, timeout) => clickLocalToolbarControl(
      menu.locator(".toolbar-overflow-group .seg")
        .getByRole("button", { name: String(count), exact: true }),
      timeout,
    ),
  });
}

export async function openLayoutMenu(page: Page): Promise<Locator> {
  const directPop = page.locator('[data-toolbar-action="layouts"] .pop.show');
  const overflowPop = page.locator(".toolbar-overflow-pop.show");
  const control = page.locator('[data-toolbar-action="layouts"] > button');
  await viaToolbar(page, {
    what: "the Saved Layouts menu",
    done: async () => (await directPop.locator("[data-layout-save]").isVisible())
      || (await overflowPop.locator("[data-layout-save]").isVisible()),
    control,
    direct: (timeout) => clickLocalToolbarControl(control, timeout),
    overflow: (menu, timeout) => clickLocalToolbarControl(
      menu.locator('[data-toolbar-menu-action="layouts"]'),
      timeout,
    ),
  });
  return (await directPop.locator("[data-layout-save]").isVisible()) ? directPop : overflowPop;
}

export async function toggleToolbarSync(page: Page): Promise<void> {
  const control = page.locator('[data-toolbar-action="sync"]');
  const before = await control.getAttribute("data-sync-on").catch(() => null);
  await viaToolbar(page, {
    what: "the Sync toggle",
    done: async () => (await control.getAttribute("data-sync-on").catch(() => null)) !== before,
    control,
    direct: (timeout) => clickLocalToolbarControl(control, timeout),
    overflow: (menu, timeout) => clickLocalToolbarControl(
      menu.locator('[data-toolbar-menu-action="sync"]'),
      timeout,
    ),
  });
}

export async function runToolbarDetector(page: Page, label: string): Promise<void> {
  const direct = page.locator('[data-toolbar-action="detect"]');
  const opts = routeOnlyAction(`the ${label} detector`, direct);
  const deadline = toolbarJourneyDeadline();
  await waitForSettledToolbar(page, opts, deadline);
  if (await direct.isVisible()) {
    await clickLocalToolbarControl(
      direct.locator(":scope > button"),
      actionTimeout(deadline, TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS),
    );
    await clickLocalToolbarControl(
      page.locator(".pop.show .menu-row").filter({ hasText: label }),
      actionTimeout(deadline),
    );
    return;
  }
  const menu = await openOverflow(page, deadline, opts, 2);
  await clickLocalToolbarControl(
    menu.locator('[data-toolbar-menu-action="detect"]'),
    actionTimeout(deadline, TOOLBAR_FOLLOWUP_ACTION_RESERVE_MS),
  );
  await clickLocalToolbarControl(
    menu.locator('[data-toolbar-menu-action^="detect-"]').filter({ hasText: label }),
    actionTimeout(deadline),
  );
}
