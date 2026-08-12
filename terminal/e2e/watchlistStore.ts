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
 * The retry index is part of the key too, so a retried test never inherits the failed run's rows.
 * Specs that seed nothing need no isolation: with only `Default` present the migration plans
 * nothing at all.
 */
export async function isolateWatchlistStore(page: Page, testInfo: TestInfo, baseURL?: string) {
  const key = `${testInfo.project.name}-${testInfo.title}-${testInfo.retry}`
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 90);
  await page.context().addCookies([{
    name: "mm_e2e_wl",
    value: key,
    url: baseURL ?? "http://127.0.0.1:3108",
  }]);
  return key;
}
