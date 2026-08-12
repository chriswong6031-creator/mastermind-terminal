import { expect, test, type Locator, type Page } from "@playwright/test";

const SEED = {
  lists: {
    Default: [],
    "Bulk Test": [
      { symbol: "AAPL", section: "Core" },
      { symbol: "MSFT", section: "Core" },
      { symbol: "NVDA", section: "Growth" },
      { symbol: "AMD", section: "Growth" },
    ],
    Other: [],
  },
  active: "Bulk Test",
  meta: {
    Default: { sections: [], collapsed: [] },
    "Bulk Test": { sections: ["Core", "Growth", "Archive"], collapsed: [] },
    Other: { sections: [], collapsed: [] },
  },
};

async function boot(page: Page) {
  await page.addInitScript((seed) => {
    if (!localStorage.getItem("mm.wls")) localStorage.setItem("mm.wls", JSON.stringify(seed));
  }, SEED);
  await page.goto("/terminal?symbol=AAPL");
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".wl-select")).toContainText("Bulk Test");
  await expect(page.locator(".wl-row")).toHaveCount(4);
}

const row = (page: Page, symbol: string) => page.locator(`[data-watchlist-symbol="${symbol}"]`);

async function dragRow(page: Page, symbol: string, target: Locator, targetBias = 0.5) {
  const from = await row(page, symbol).locator(".tk").boundingBox();
  expect(from).not.toBeNull();
  await page.mouse.move(from!.x + Math.min(from!.width / 2, 24), from!.y + from!.height / 2);
  await page.mouse.down();
  await expect(page.locator("body")).not.toHaveClass(/rail-resizing/);
  await page.mouse.move(from!.x + Math.min(from!.width / 2, 24), from!.y + from!.height / 2 + 9, { steps: 3 });
  // Under a parallel browser load the PointerSensor activation and React's
  // dragging class can land a frame after the final activation move. Wait for
  // that observable boundary before sending target moves; otherwise CDP can
  // deliver the entire second gesture before dnd-kit has installed its active
  // listeners, producing no onDragEnd at all.
  await expect(row(page, symbol)).toHaveClass(/dragging/);
  const to = await target.boundingBox();
  expect(to).not.toBeNull();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height * targetBias, { steps: 12 });
  await page.waitForTimeout(120);
  const settled = await target.boundingBox();
  expect(settled).not.toBeNull();
  await page.mouse.move(settled!.x + settled!.width / 2, settled!.y + settled!.height * targetBias, { steps: 4 });
  await page.mouse.up();
  await expect(row(page, symbol)).not.toHaveClass(/dragging/);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function dragSection(page: Page, section: string, target: Locator) {
  const handle = page.getByRole("button", { name: `Drag section ${section}` });
  await page.locator(`[data-watchlist-section-header="${section}"]`).evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  const from = await handle.boundingBox();
  expect(from).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await expect(page.locator("body")).not.toHaveClass(/rail-resizing/);
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2 + 9, { steps: 3 });
  await expect(page.locator(`[data-watchlist-section-header="${section}"].dragging`)).toBeVisible();
  const to = await target.boundingBox();
  expect(to).not.toBeNull();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
  await page.waitForTimeout(120);
  const settled = await target.boundingBox();
  expect(settled).not.toBeNull();
  await page.mouse.move(settled!.x + settled!.width / 2, settled!.y + settled!.height * 0.75, { steps: 4 });
  await page.mouse.up();
}

async function microDrag(page: Page, target: Locator, deltaY = 12) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 3 });
  await page.mouse.up();
}

test("Shift and Cmd/Ctrl select rows without breaking ordinary chart navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The sortable rail is desktop chrome.");
  await boot(page);

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

test("right-click moves, deletes, and creates a watchlist from the selected symbols", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Context menu is a desktop pointer workflow.");
  await boot(page);

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

test("a single ticker has TradingView-style actions plus our move and new-list actions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Context menus are desktop chrome.");
  await boot(page);

  await row(page, "MSFT").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Selected ticker actions" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("MSFT");
  for (const label of [
    "Flag / unflag MSFT", "Unflag all symbols", "Add MSFT to watchlist", "Add MSFT to compare",
    "Add note for MSFT", "Financials", "Move to section", "Create new watchlist", "Add section", "Add symbol", "Delete symbol",
  ]) await expect(menu).toContainText(label);
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveCount(0);

  await menu.getByRole("button", { name: "Flag color 1" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mm.flags") || "{}").MSFT)).toBe("#f23645");

  await row(page, "MSFT").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Add note for MSFT" }).click();
  await page.locator("#wl-symbol-note").fill("Wait for the earnings retest");
  await menu.getByRole("button", { name: "Save" }).click();
  await expect(row(page, "MSFT").locator(".wl-note-mark")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mm.symbolNotes") || "{}").MSFT)).toBe("Wait for the earnings retest");

  await row(page, "MSFT").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Add MSFT to watchlist" }).click();
  await menu.getByRole("menuitem", { name: "Other" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mm.wls") || "{}").lists.Other?.map((item: { symbol: string }) => item.symbol))).toEqual(["MSFT"]);

  await row(page, "MSFT").click({ button: "right" });
  await page.getByRole("menu", { name: "Selected ticker actions" }).getByRole("menuitem", { name: "Add MSFT to compare" }).click();
  await expect(page.locator(".cmp-badge")).toHaveText("1");

  await row(page, "MSFT").click({ button: "right" });
  await page.getByRole("menu", { name: "Selected ticker actions" }).getByRole("menuitem", { name: /Financials/ }).click();
  await expect(page.getByRole("region", { name: /Microsoft Corp · Overview/ })).toBeVisible();
});

test("adding and removing section dividers preserves the ordered symbol stream", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Section menus are desktop chrome.");
  await boot(page);

  await row(page, "MSFT").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Selected ticker actions" });
  await menu.getByRole("menuitem", { name: "Add section" }).click();
  await page.locator("#wl-bulk-name").fill("Mega Caps");
  await menu.getByRole("button", { name: "Create" }).click();
  await expect(page.locator('[data-watchlist-section-header="Mega Caps"]')).toBeVisible();
  await expect(row(page, "MSFT")).toHaveAttribute("data-watchlist-section", "Mega Caps");
  await expect(row(page, "AAPL")).toHaveAttribute("data-watchlist-section", "Core");

  const growth = page.locator('[data-watchlist-section-header="Growth"]');
  await growth.click({ button: "right" });
  const sectionMenu = page.getByRole("menu", { name: "Section actions for Growth" });
  await sectionMenu.getByRole("menuitem", { name: "Remove section" }).click();
  await expect(page.locator('[data-watchlist-section-header="Growth"]')).toHaveCount(0);
  await expect(page.locator(".wl-row")).toHaveCount(4);
  await expect(row(page, "NVDA")).toHaveAttribute("data-watchlist-section", "Mega Caps");
  await expect(row(page, "AMD")).toHaveAttribute("data-watchlist-section", "Mega Caps");

  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-watchlist-section-header="Growth"]')).toHaveCount(0);
  await expect(page.locator(".wl-row")).toHaveCount(4);
  await expect(row(page, "NVDA")).toHaveAttribute("data-watchlist-section", "Mega Caps");
});

test("removing the first divider creates an unsectioned run instead of deleting or regrouping symbols", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Section menus are desktop chrome.");
  await boot(page);

  await page.locator('[data-watchlist-section-header="Core"]').click({ button: "right" });
  await page.getByRole("menu", { name: "Section actions for Core" }).getByRole("menuitem", { name: "Remove section" }).click();
  await expect(page.locator('[data-watchlist-section-header="Core"]')).toHaveCount(0);
  await expect(page.locator(".wl-row")).toHaveCount(4);
  await expect(row(page, "AAPL")).toHaveAttribute("data-watchlist-section", "");
  await expect(row(page, "MSFT")).toHaveAttribute("data-watchlist-section", "");
  await expect.poll(() => page.locator(".wl-row").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["AAPL", "MSFT", "NVDA", "AMD"]);
});

test("section dividers collapse, rename, reorder downward, and remain non-destructive", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Section controls are desktop chrome.");
  await boot(page);

  await microDrag(page, page.getByRole("button", { name: "Drag section Core" }));
  await expect.poll(() => page.locator("[data-watchlist-section-header]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-section-header")))).toEqual(["Core", "Growth", "Archive"]);

  const growth = page.locator('[data-watchlist-section-header="Growth"]');
  await growth.locator(".wl-sec-toggle").click();
  await expect(row(page, "NVDA")).toBeHidden();
  await growth.locator(".wl-sec-toggle").click();
  await expect(row(page, "NVDA")).toBeVisible();

  await page.locator('[data-watchlist-section-header="Archive"]').click({ button: "right" });
  const sectionMenu = page.getByRole("menu", { name: "Section actions for Archive" });
  await sectionMenu.getByRole("menuitem", { name: "Rename section" }).click();
  await page.locator("#wl-section-rename").fill("Later");
  await sectionMenu.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-watchlist-section-header="Later"]')).toBeVisible();

  await dragSection(page, "Core", page.locator('[data-watchlist-section-header="Growth"]'));
  await expect.poll(() => page.locator("[data-watchlist-section-header]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-section-header")))).toEqual(["Growth", "Core", "Later"]);
  await expect.poll(() => page.locator(".wl-row").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["NVDA", "AMD", "AAPL", "MSFT"]);

  await page.locator('[data-watchlist-section-header="Core"]').click({ button: "right" });
  await page.getByRole("menu", { name: "Section actions for Core" }).getByRole("menuitem", { name: "Remove section" }).click();
  await expect.poll(() => page.locator(".wl-row").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["NVDA", "AMD", "AAPL", "MSFT"]);
  await expect(row(page, "AAPL")).toHaveAttribute("data-watchlist-section", "Growth");

  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.locator(".wl-row").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["NVDA", "AMD", "AAPL", "MSFT"]);
});

test("renaming a watchlist preserves its empty and collapsed section dividers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Named-list controls are desktop chrome.");
  await boot(page);

  await page.locator('[data-watchlist-section-header="Growth"] .wl-sec-toggle').click();
  await expect(row(page, "NVDA")).toBeHidden();
  await page.locator(".wl-select").click();
  page.once("dialog", (dialog) => dialog.accept("Renamed List"));
  await page.locator(".wl-list-row").filter({ hasText: "Bulk Test" }).locator('[title="Rename"]').click();

  await expect(page.locator(".wl-select")).toContainText("Renamed List");
  await expect(page.locator('[data-watchlist-section-header="Archive"]')).toBeVisible();
  await expect(row(page, "NVDA")).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mm.wls") || "{}").meta["Renamed List"])).toEqual({
    sections: ["Core", "Growth", "Archive"],
    collapsed: ["Growth"],
  });

  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".wl-select")).toContainText("Renamed List");
  await expect(page.locator('[data-watchlist-section-header="Archive"]')).toBeVisible();
  await expect(row(page, "NVDA")).toBeHidden();
});

test("the full ticker row freely reorders and crosses sections without selecting text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The sortable rail is desktop chrome.");
  await boot(page);

  const source = row(page, "AMD");
  const target = page.locator('[data-watchlist-section-header="Archive"]');
  await expect(source).toHaveAttribute("data-watchlist-section", "Growth");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  expect(await source.evaluate((element) => getComputedStyle(element).userSelect)).toBe("none");

  await microDrag(page, row(page, "AAPL").locator(".tk"));
  await expect.poll(() => page.locator('[data-watchlist-section="Core"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["AAPL", "MSFT"]);

  await row(page, "MSFT").click();
  await expect(page.locator(".mm-ptag-sym")).toHaveText("MSFT");

  await dragRow(page, "AAPL", row(page, "MSFT"));
  await expect.poll(() => page.locator('[data-watchlist-section="Core"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["MSFT", "AAPL"]);

  await dragRow(page, "AAPL", row(page, "NVDA"), 0.25);
  await expect.poll(() => page.locator('[data-watchlist-section="Growth"]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["AAPL", "NVDA", "AMD"]);

  await dragRow(page, "AMD", target);

  await expect(source).toHaveAttribute("data-watchlist-section", "Archive");
  await dragRow(page, "NVDA", page.locator(".wl-root-drop"));
  await expect(row(page, "NVDA")).toHaveAttribute("data-watchlist-section", "");
  await expect(page.locator(".mm-ptag-sym")).toHaveText("MSFT");
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("mm.wls") || "{}");
    return saved.lists["Bulk Test"];
  })).toEqual([
    { symbol: "NVDA", section: "" },
    { symbol: "MSFT", section: "Core" },
    { symbol: "AAPL", section: "Growth" },
    { symbol: "AMD", section: "Archive" },
  ]);

  await page.reload();
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.locator(".wl-row").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-watchlist-symbol")))).toEqual(["NVDA", "MSFT", "AAPL", "AMD"]);
});

test("smaller viewports retain the mobile watchlist surface without desktop bulk chrome leaking", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "Desktop behavior is covered above.");
  await boot(page);
  await expect(page.locator(".rail .wl-board")).toBeHidden();
  await expect(page.locator("[data-testid='watchlist-selection-count']")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
});
