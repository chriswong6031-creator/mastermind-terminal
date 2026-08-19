import { expect, test, type Page } from "@playwright/test";
import { injectLayoutFault, isolateLayoutStore, renderAsGuest } from "./layoutStore";
import { isPhoneViewport } from "./phoneChrome";
import { openLayoutMenu } from "./terminalToolbar";

// Saved-layout integrity, in the browser, at all three contract viewports.
//
// Determinism comes from TERMINAL_E2E_FIXTURE (playwright.config.ts): `/api/layouts` serves the
// in-memory transport in lib/layoutsFixtureDb.ts, never live Supabase. That store enforces
// `unique (user_id, name)` itself, so the concurrency assertion below is about the DATABASE
// invariant rather than UI debouncing, and it can be made to fail on demand so outage states are
// provable without touching production.

const TERMINAL = "/terminal?symbol=NVDA";

const gotoTerminal = async (page: Page) => {
  await page.goto(TERMINAL);
  await expect(page.locator(".chart-wrap, .chart-host, canvas").first()).toBeVisible({ timeout: 45_000 });
};

/**
 * The Saved-Layouts MENU has no phone entry point today: ≤640px replaces the chart toolbar with the
 * roller strip + Analysis hub, and that hub's "Templates" tile is a ghost (no `action` — see
 * components/mobile/AnalysisHubSheet.tsx). Nothing in this wave changes that, so the menu specs run
 * where the menu exists (desktop + tablet) and say so instead of pretending to cover the phone.
 * The API-level contract below is viewport-independent and DOES run on all three.
 */
const skipWithoutLayoutMenu = (page: Page) =>
  test.skip(isPhoneViewport(page), "no phone entry point for Saved Layouts (Analysis-hub Templates tile is a ghost)");

/** Save through the real menu; `name` empty exercises the blank auto-name path. */
async function saveLayout(page: Page, name = "") {
  const menu = await openLayoutMenu(page);
  const input = menu.locator("[data-layout-save] input");
  await input.fill(name);
  await menu.locator("[data-layout-save-btn]").click();
  return menu;
}

/** The owner's layouts, read through the page so the request carries the store cookie. */
const inventory = (page: Page): Promise<{ id: string; name: string; config: Record<string, unknown> }[]> =>
  page.evaluate(async () => {
    const r = await fetch("/api/layouts", { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    return (await r.json()).layouts;
  });

test.describe("saved layouts", () => {
  test("a guest is never offered a Save that cannot succeed", async ({ page, baseURL }, testInfo) => {
    skipWithoutLayoutMenu(page);
    await isolateLayoutStore(page, testInfo, baseURL);
    await renderAsGuest(page, baseURL);

    // Any POST at all would be the bug: the old menu fired one straight into a guaranteed 401.
    const saveAttempts: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/layouts") && r.method() === "POST") saveAttempts.push(r.url()); });

    await gotoTerminal(page);
    const menu = await openLayoutMenu(page);

    await expect(menu.locator("[data-layout-save-btn]")).toBeDisabled();
    await expect(menu.locator("[data-layout-save] input")).toBeDisabled();
    // …and the sign-up path is offered as its own action rather than being absent.
    await expect(menu.locator("[data-layout-gate]")).toBeVisible();

    await menu.locator("[data-layout-gate]").click();
    await expect(page.locator(".undo-toast").filter({ hasText: /free account|免费账户/ })).toBeVisible();
    expect(saveAttempts).toEqual([]);
  });

  test("a signed-in save round-trips, and a blank name never overwrites another layout", async ({ page, baseURL }, testInfo) => {
    skipWithoutLayoutMenu(page);
    await isolateLayoutStore(page, testInfo, baseURL);
    await gotoTerminal(page);

    for (const _ of [1, 2, 3]) {
      const menu = await saveLayout(page);
      await expect(menu.locator('[data-layout-feedback="saved"]')).toBeVisible();
    }
    expect((await inventory(page)).map((l) => l.name).sort()).toEqual(["Layout 1", "Layout 2", "Layout 3"]);

    // Pin what "Layout 3" holds, delete "Layout 2", then blank-save again. Under the old
    // `layouts.length + 1` generator this regenerated "Layout 3" and overwrote it.
    const beforeConfig = JSON.stringify((await inventory(page)).find((l) => l.name === "Layout 3")!.config);
    const menu = await openLayoutMenu(page);
    await menu.locator('[data-layout-delete="Layout 2"]').click();
    await expect(menu.locator('[data-layout-row="Layout 2"]')).toHaveCount(0);

    await saveLayout(page);
    const savedAgain = await openLayoutMenu(page);
    await expect(savedAgain.locator('[data-layout-feedback="saved"]')).toBeVisible();

    const after = await inventory(page);
    expect(after.map((l) => l.name).sort()).toEqual(["Layout 1", "Layout 2", "Layout 3"]);
    expect(after).toHaveLength(3);
    expect(JSON.stringify(after.find((l) => l.name === "Layout 3")!.config)).toBe(beforeConfig);
  });

  test("concurrent saves of one name leave exactly one layout", async ({ page, baseURL }, testInfo) => {
    await isolateLayoutStore(page, testInfo, baseURL);
    await gotoTerminal(page);

    const statuses = await page.evaluate(async () => {
      const body = (mode: string) => JSON.stringify({ name: "Race", config: { schemaVersion: 2, tag: mode }, mode });
      const responses = await Promise.all(["create", "create", "overwrite"].map((mode) =>
        fetch("/api/layouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(mode) })));
      return responses.map((r) => r.status);
    });

    // One create wins, the other is refused by the unique index (409) — never a second row.
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect((await inventory(page)).filter((l) => l.name === "Race")).toHaveLength(1);
  });

  test("a save failure is visible and does not clear the typed name", async ({ page, baseURL }, testInfo) => {
    skipWithoutLayoutMenu(page);
    await isolateLayoutStore(page, testInfo, baseURL);
    await gotoTerminal(page);

    await injectLayoutFault(page, "save", baseURL);
    const menu = await saveLayout(page, "Swing");

    await expect(menu.locator('[data-layout-feedback="error"]')).toBeVisible();
    await expect(menu.locator('[data-layout-feedback="saved"]')).toHaveCount(0);
    await expect(menu.locator("[data-layout-save] input")).toHaveValue("Swing");
    expect(await inventory(page)).toHaveLength(0);

    // Retry once the store is healthy — the same click now really saves.
    await injectLayoutFault(page, "", baseURL);
    await menu.locator("[data-layout-save-btn]").click();
    await expect(menu.locator('[data-layout-feedback="saved"]')).toBeVisible();
    expect((await inventory(page)).map((l) => l.name)).toEqual(["Swing"]);
  });

  test("a failed delete rolls back and the layout stays visible", async ({ page, baseURL }, testInfo) => {
    skipWithoutLayoutMenu(page);
    await isolateLayoutStore(page, testInfo, baseURL);
    await gotoTerminal(page);
    const saved = await saveLayout(page, "Keeper");
    await expect(saved.locator('[data-layout-feedback="saved"]')).toBeVisible();

    await injectLayoutFault(page, "delete", baseURL);
    const menu = await openLayoutMenu(page);
    await menu.locator('[data-layout-delete="Keeper"]').click();

    await expect(menu.locator("[data-layout-delete-error]")).toBeVisible();
    await expect(menu.locator('[data-layout-row="Keeper"]')).toBeVisible();   // rolled back, not vanished
    expect((await inventory(page)).map((l) => l.name)).toEqual(["Keeper"]);
  });

  test("a read outage says unavailable, not 'no saved layouts'", async ({ page, baseURL }, testInfo) => {
    skipWithoutLayoutMenu(page);
    await isolateLayoutStore(page, testInfo, baseURL);
    await gotoTerminal(page);
    const saved = await saveLayout(page, "Swing");
    await expect(saved.locator('[data-layout-feedback="saved"]')).toBeVisible();

    await injectLayoutFault(page, "list", baseURL);
    await gotoTerminal(page);
    const menu = await openLayoutMenu(page);

    await expect(menu.locator('[data-layout-status="unavailable"]')).toBeVisible();
    await expect(menu.locator('[data-layout-status="empty"]')).toHaveCount(0);

    // Retry heals, and the library was never actually empty.
    await injectLayoutFault(page, "", baseURL);
    await menu.locator("[data-layout-retry]").click();
    await expect(menu.locator('[data-layout-row="Swing"]')).toBeVisible();
  });
});
