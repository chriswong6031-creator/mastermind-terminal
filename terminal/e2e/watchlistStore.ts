import type { Page, TestInfo } from "@playwright/test";

/**
 * Give one test its own server-side watchlist store.
 *
 * Since W1b a signed-in TerminalShell mount migrates every non-`Default` `mm.wls` list into
 * `watchlists`, so any spec that SEEDS named lists also writes to the fixture store behind
 * `/api/watchlist` (lib/watchlistsFixtureDb.ts). That store is process-wide in the dev server,
 * while the suite is fullyParallel across three viewport projects — without a key per test, one
 * spec's deletes become another spec's re-inserts and the rail order stops being deterministic.
 *
 * Specs that seed nothing need no isolation: with only `Default` present the migration plans
 * nothing at all.
 */
// F9: `reuseExistingServer: !CI` means a second local run usually attaches to the FIRST run's
// dev server — and the fixture store is process-global, so without this nonce run N+1 inherits
// run N's rows and a clean branch fails on nothing. The module loads once per worker process, so
// the value is stable within a run and fresh across runs; `repeatEachIndex` separates --repeat-each
// copies of one title inside a single run, and `retry` separates a retry from the attempt it follows.
const RUN_NONCE = `${process.env.TEST_WORKER_INDEX ?? "0"}${Math.random().toString(36).slice(2, 8)}`;

export async function isolateWatchlistStore(page: Page, testInfo: TestInfo, baseURL?: string) {
  const key = `${testInfo.project.name}-${testInfo.title}-${testInfo.repeatEachIndex}-${testInfo.retry}-${RUN_NONCE}`
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 110);
  await page.context().addCookies([{
    name: "mm_e2e_wl",
    value: key,
    url: baseURL ?? "http://127.0.0.1:3108",
  }]);
  return key;
}
