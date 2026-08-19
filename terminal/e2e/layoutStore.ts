import type { Page, TestInfo } from "@playwright/test";

// Per-test isolation + fault injection for the saved-layout fixture store
// (lib/layoutsFixtureDb.ts), built the same way as e2e/watchlistStore.ts and for the same reasons:
// the store is process-global in the dev server while the suite runs fully parallel across three
// viewport projects, and `reuseExistingServer` means a local re-run usually attaches to the
// previous run's process.

const RUN_NONCE = `${process.env.TEST_WORKER_INDEX ?? "0"}${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_BASE = "http://127.0.0.1:3108";

const keyFor = (testInfo: TestInfo) =>
  `${testInfo.project.name}-${testInfo.title}-${testInfo.repeatEachIndex}-${testInfo.retry}-${RUN_NONCE}`
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 110);

export async function isolateLayoutStore(page: Page, testInfo: TestInfo, baseURL?: string) {
  const key = keyFor(testInfo);
  await page.context().addCookies([{ name: "mm_e2e_layouts", value: key, url: baseURL ?? DEFAULT_BASE }]);
  return key;
}

/**
 * Make one class of layout statement fail, the way a Supabase outage would.
 *
 * Production is never deliberately broken to prove an error state (delivery packet, "Production
 * proof"); the deterministic fixture transport fails on request instead.
 */
export async function injectLayoutFault(page: Page, fault: "list" | "save" | "delete" | "all" | "", baseURL?: string) {
  await page.context().addCookies([{ name: "mm_e2e_layout_fault", value: fault, url: baseURL ?? DEFAULT_BASE }]);
}

/** Render the workspace as a signed-out visitor — page prop AND `/api/layouts` both honour this. */
export async function renderAsGuest(page: Page, baseURL?: string) {
  await page.context().addCookies([{ name: "mm_e2e_guest", value: "1", url: baseURL ?? DEFAULT_BASE }]);
}
