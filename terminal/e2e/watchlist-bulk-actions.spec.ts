import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isolateWatchlistStore } from "./watchlistStore";

const SEED = {
  lists: {
    Default: [],
    "Bulk Test": [
      { symbol: "AAPL", section: "Core" },
      { symbol: "MSFT", section: "Core" },
      { symbol: "NVDA", section: "Growth" },
      { symbol: "AMD", section: "Growth" },
    ],
  },
  active: "Bulk Test",
  meta: {
    Default: { sections: [], collapsed: [] },
    "Bulk Test": { sections: ["Core", "Growth", "Archive"], collapsed: [] },
  },
};

async function boot(page: Page, testInfo: TestInfo, baseURL?: string) {
  // W1b: "Bulk Test" is a non-Default list, so a signed-in mount now migrates it into the server
  // store behind /api/watchlist. Give each test its own store or the parallel matrix's deletes and
  // re-inserts reorder this rail (see e2e/watchlistStore.ts).
  await isolateWatchlistStore(page, testInfo, baseURL);
  await page.addInitScript((seed) => localStorage.setItem("mm.wls", JSON.stringify(seed)), SEED);
  await page.goto("/terminal?symbol=AAPL");
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".wl-select")).toContainText("Bulk Test");
  await expect(page.locator(".wl-row")).toHaveCount(4);
}

const row = (page: Page, symbol: string) => page.locator(`[data-watchlist-symbol="${symbol}"]`);

test("Shift and Cmd/Ctrl select rows without breaking ordinary chart navigation", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The sortable rail is desktop chrome.");
  await boot(page, testInfo, baseURL);

  await row(page, "MSFT").click();
  await expect(page.locator(".mm-ptag-sym")).toHaveText("MSFT");
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveCount(0);

  await row(page, "AAPL").click();
  await row(page, "NVDA").click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveText("3 tickers selected");
  await expect(page.locator(".wl-row[aria-selected='true']")).toHaveCount(3);
  await expect(page.locator(".mm-ptag-sym")).toHaveText("AAPL");

  await row(page, "AMD").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveText("4 tickers selected");
  await row(page, "MSFT").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveText("3 tickers selected");
  await expect(row(page, "MSFT")).toHaveAttribute("aria-selected", "false");

  await row(page, "NVDA").focus();
  await page.keyboard.press("Shift+F10");
  const keyboardMenu = page.getByRole("menu", { name: "Selected ticker actions" });
  await expect(keyboardMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(keyboardMenu).toBeHidden();
  await expect(row(page, "NVDA")).toBeFocused();
});

test("right-click moves, deletes, and creates a watchlist from the selected symbols", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Context menu is a desktop pointer workflow.");
  await boot(page, testInfo, baseURL);

  await row(page, "AAPL").click();
  await row(page, "NVDA").click({ modifiers: ["Shift"] });
  await row(page, "NVDA").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Selected ticker actions" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("3 tickers selected");

  await menu.getByRole("menuitem", { name: "Move to section" }).click();
  await menu.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveCount(0);
  for (const symbol of ["AAPL", "MSFT", "NVDA"]) {
    await expect(row(page, symbol)).toHaveAttribute("data-watchlist-section", "Archive");
  }
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("mm.wls") || "{}");
    return saved.lists["Bulk Test"].filter((item: { section: string }) => item.section === "Archive").length;
  })).toBe(3);

  await row(page, "AAPL").click({ modifiers: ["ControlOrMeta"] });
  await row(page, "NVDA").click({ modifiers: ["ControlOrMeta"] });
  await row(page, "NVDA").click({ button: "right" });
  await page.getByRole("menu", { name: "Selected ticker actions" })
    .getByRole("menuitem", { name: "Create new watchlist" }).click();
  await page.locator("#wl-bulk-name").fill("Winners");
  await page.getByRole("menu", { name: "Selected ticker actions" }).getByRole("button", { name: "Create" }).click();
  await expect(page.locator(".wl-select")).toContainText("Winners");
  await expect(row(page, "AAPL")).toBeVisible();
  await expect(row(page, "NVDA")).toBeVisible();
  await expect(row(page, "MSFT")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("mm.wls") || "{}");
    return saved.lists.Winners?.map((item: { symbol: string }) => item.symbol) ?? [];
  })).toEqual(["AAPL", "NVDA"]);

  await row(page, "AAPL").click({ modifiers: ["ControlOrMeta"] });
  await row(page, "NVDA").click({ modifiers: ["ControlOrMeta"] });
  await row(page, "NVDA").click({ button: "right" });
  await page.getByRole("menu", { name: "Selected ticker actions" })
    .getByRole("menuitem", { name: "Delete 2 symbols" }).click();
  await expect(page.locator(".wl-row")).toHaveCount(0);
});

test("a row can be dragged out of its original section into an empty section", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The sortable rail is desktop chrome.");
  await boot(page, testInfo, baseURL);

  const source = row(page, "AMD");
  await expect(page.getByRole("button", { name: "Drag AMD" })).toBeVisible();
  const target = page.locator('[data-watchlist-section-header="Archive"]');
  await expect(source).toHaveAttribute("data-watchlist-section", "Growth");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const from = await source.boundingBox();
  const handleBox = await page.getByRole("button", { name: "Drag AMD" }).boundingBox();
  const to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(handleBox).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2 + 10, { steps: 3 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(source).toHaveAttribute("data-watchlist-section", "Archive");
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("mm.wls") || "{}");
    return saved.lists["Bulk Test"].find((item: { symbol: string }) => item.symbol === "AMD")?.section;
  })).toBe("Archive");
});

// W1b: bulk move and bulk delete used to sync ONLY when the active list was "Default" — on any
// named list they were localStorage-only, so the same account on another device never saw them.
// The same two gestures must now reach the server list "Bulk Test" migrated into on mount.
test("bulk move and bulk delete on a NAMED list reach the server", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Context menu is a desktop pointer workflow.");
  await boot(page, testInfo, baseURL);

  const serverList = async (name: string) => page.evaluate(async (listName) => {
    const payload = await (await fetch("/api/watchlist", { headers: { Accept: "application/json" } })).json();
    const list = payload.lists.find((row: { name: string }) => row.name === listName);
    return list ? list.symbols.map((row: { symbol: string; section: string }) => [row.symbol, row.section]) : null;
  }, name);

  // The mount migration carried the local list up verbatim — order and sections included.
  await expect.poll(() => serverList("Bulk Test"), { timeout: 30_000 }).toEqual([
    ["AAPL", "Core"], ["MSFT", "Core"], ["NVDA", "Growth"], ["AMD", "Growth"],
  ]);

  // A plain click sets the anchor without selecting (see the first test in this file); Shift then
  // takes the range — the same two-gesture idiom the existing coverage uses.
  await row(page, "AAPL").click();
  await row(page, "MSFT").click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveText("2 tickers selected");
  await row(page, "MSFT").click({ button: "right" });
  await page.getByRole("menu", { name: "Selected ticker actions" })
    .getByRole("menuitem", { name: "Move to section" }).click();
  await page.getByRole("menu", { name: "Selected ticker actions" })
    .getByRole("menuitem", { name: "Archive" }).click();
  await expect.poll(() => serverList("Bulk Test"), { timeout: 15_000 }).toEqual([
    ["AAPL", "Archive"], ["MSFT", "Archive"], ["NVDA", "Growth"], ["AMD", "Growth"],
  ]);

  await row(page, "NVDA").click();
  await row(page, "AMD").click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveText("2 tickers selected");
  await row(page, "AMD").click({ button: "right" });
  await page.getByRole("menu", { name: "Selected ticker actions" })
    .getByRole("menuitem", { name: "Delete 2 symbols" }).click();
  await expect.poll(() => serverList("Bulk Test"), { timeout: 15_000 }).toEqual([
    ["AAPL", "Archive"], ["MSFT", "Archive"],
  ]);
  // Scoped to the targeted list: Default is a different row set and must be untouched.
  expect(await serverList("Default")).toHaveLength(6);
});

test("smaller viewports retain the mobile watchlist surface without desktop bulk chrome leaking", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "Desktop behavior is covered above.");
  await boot(page, testInfo, baseURL);
  await expect(page.locator(".rail .wl-board")).toBeHidden();
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
});
