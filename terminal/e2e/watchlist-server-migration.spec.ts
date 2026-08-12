import { expect, test, type Page } from "@playwright/test";
import { isolateWatchlistStore } from "./watchlistStore";

// W1b acceptance: `mm.wls` named lists become SERVER-BACKED for a signed-in user, via a one-time
// additive migration that is safe to run twice and never touches `Default`.
//
// Determinism comes from TERMINAL_E2E_FIXTURE (playwright.config.ts) — the API route serves the
// in-memory transport in lib/watchlistsFixtureDb.ts, never live Supabase — plus a per-test
// `mm_e2e_wl` store (e2e/watchlistStore.ts), so the parallel viewport projects cannot see each
// other's writes.

const MIGRATED_KEY = "mm.wls.migrated.v1";

// Local Default is a REORDERED SUBSET of the server's seeded six. That makes the TRAP-1 assertion
// exact: the reconcile has no local-only row to heal, so any change to the server's Default would
// have to have come from the migration — which is precisely what must never happen.
const SEED = {
  lists: {
    Default: [
      { symbol: "MSFT", section: "Equities" },
      { symbol: "AAPL", section: "Equities" },
    ],
    "Gold Miners": [
      { symbol: "NEM", section: "Miners" },
      { symbol: "AEM", section: "Miners" },
    ],
    Space: [{ symbol: "RKLB", section: "Growth" }],
  },
  active: "Gold Miners",
  meta: {
    "Gold Miners": { sections: ["Miners"], collapsed: [] },
    Space: { sections: ["Growth"], collapsed: [] },
  },
};

const SERVER_DEFAULT = ["BTC-USD", "ETH-USD", "NVDA", "AAPL", "MSFT", "QQQ"];

type ServerList = { id: string; name: string; position: number; symbols: { symbol: string; section: string; position: number }[] };

/** Read the owner's inventory through the page so the request carries the store cookie. */
const inventory = (page: Page): Promise<ServerList[]> => page.evaluate(async () => {
  const response = await fetch("/api/watchlist", { headers: { Accept: "application/json" } });
  const payload = await response.json();
  return payload.lists as ServerList[];
});

const marker = (page: Page) => page.evaluate((key) => {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}, MIGRATED_KEY);

const named = (lists: ServerList[], name: string) => lists.find((list) => list.name === name);
const symbolsOf = (lists: ServerList[], name: string) => named(lists, name)?.symbols.map((row) => row.symbol) ?? null;

async function boot(page: Page) {
  await page.goto("/terminal?symbol=AAPL");
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  // The migration completes asynchronously after mount; the marker is its receipt.
  await expect.poll(() => marker(page), { timeout: 30_000 }).toEqual({ "Gold Miners": true, Space: true });
}

test.beforeEach(async ({ page, baseURL }, testInfo) => {
  await isolateWatchlistStore(page, testInfo, baseURL);
  await page.addInitScript((seed) => localStorage.setItem("mm.wls", JSON.stringify(seed)), SEED);
});

test("one-time migration is additive, per-list, and run-twice identical", async ({ page }) => {
  await boot(page);

  const first = await inventory(page);
  expect(first.map((list) => list.name)).toEqual(["Default", "Gold Miners", "Space"]);
  // Created after the existing rows, never renumbering them.
  expect(first.map((list) => list.position)).toEqual([0, 1, 2]);
  expect(symbolsOf(first, "Gold Miners")).toEqual(["NEM", "AEM"]);
  expect(symbolsOf(first, "Space")).toEqual(["RKLB"]);
  // Local `section` survives the trip.
  expect(named(first, "Gold Miners")!.symbols.map((row) => row.section)).toEqual(["Miners", "Miners"]);
  expect(named(first, "Space")!.symbols.map((row) => row.section)).toEqual(["Growth"]);

  // TRAP-1: `Default` is reconciled by the mount effect alone. The migration must not have added,
  // removed or reordered a single row on the server's Default.
  expect(symbolsOf(first, "Default")).toEqual(SERVER_DEFAULT);
  // ...and the local cache still holds the user's own Default order (their two rows first, then
  // the server rows they did not have) — the TRAP-1 reconcile, unchanged by W1b.
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("mm.wls") || "{}");
    return (saved.lists?.Default ?? []).map((row: { symbol: string }) => row.symbol);
  })).toEqual(["MSFT", "AAPL", "BTC-USD", "ETH-USD", "NVDA", "QQQ"]);

  // RUN TWICE: reload re-runs the whole effect against the same local state.
  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => inventory(page), { timeout: 30_000 }).toEqual(first);

  // ...and a THIRD time with the marker wiped, proving idempotency comes from merge-by-name +
  // insert-missing rather than from the marker alone.
  await page.evaluate((key) => localStorage.removeItem(key), MIGRATED_KEY);
  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => marker(page), { timeout: 30_000 }).toEqual({ "Gold Miners": true, Space: true });
  expect(await inventory(page)).toEqual(first);
});

test("a partially-recorded marker retries only the lists it does not name", async ({ page }) => {
  await boot(page);
  const complete = await inventory(page);

  // Simulate the previous run having failed on "Space" only: drop its server list and its marker
  // entry, keep "Gold Miners" recorded. The next mount must re-create Space and leave Gold Miners
  // exactly as it is.
  const spaceId = named(complete, "Space")!.id;
  await page.evaluate(async ({ key, listId }) => {
    localStorage.setItem(key, JSON.stringify({ "Gold Miners": true }));
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteList", listId }),
    });
  }, { key: MIGRATED_KEY, listId: spaceId });
  expect(await inventory(page)).toHaveLength(2);

  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => marker(page), { timeout: 30_000 }).toEqual({ "Gold Miners": true, Space: true });

  const healed = await inventory(page);
  expect(healed.map((list) => list.name)).toEqual(["Default", "Gold Miners", "Space"]);
  expect(symbolsOf(healed, "Space")).toEqual(["RKLB"]);
  // Gold Miners was skipped by the marker — no duplicate row, no re-inserted symbol.
  expect(named(healed, "Gold Miners")).toEqual(named(complete, "Gold Miners"));
  expect(symbolsOf(healed, "Default")).toEqual(SERVER_DEFAULT);
});

test("a server-only list is kept, and a symbol edit on a NAMED list now reaches the server", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The bulk context menu is a desktop pointer workflow.");
  await boot(page);

  // A list this browser has never seen (another device made it) must survive the migration.
  await page.evaluate(async () => {
    const created = await (await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createList", name: "From Phone" }),
    })).json();
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", listId: created.list.id, symbols: ["ASTS"], section: "Growth" }),
    });
  });
  await page.evaluate((key) => localStorage.removeItem(key), MIGRATED_KEY);
  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => marker(page), { timeout: 30_000 }).toEqual({ "Gold Miners": true, Space: true });
  expect(symbolsOf(await inventory(page), "From Phone")).toEqual(["ASTS"]);

  // Before W1b a delete on a non-Default list was localStorage-only; it must now reach the server.
  await expect(page.locator(".wl-select")).toContainText("Gold Miners");
  await page.locator('[data-watchlist-symbol="AEM"]').click();
  await page.locator('[data-watchlist-symbol="AEM"]').click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Selected ticker actions" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /Delete 1 symbol/ }).click();

  await expect.poll(async () => symbolsOf(await inventory(page), "Gold Miners"), { timeout: 15_000 }).toEqual(["NEM"]);
  // Scoped: the sibling lists are untouched by that write.
  const after = await inventory(page);
  expect(symbolsOf(after, "Space")).toEqual(["RKLB"]);
  expect(symbolsOf(after, "Default")).toEqual(SERVER_DEFAULT);
});
