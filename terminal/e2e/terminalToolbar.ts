import { expect, type Page } from "@playwright/test";

async function openOverflow(page: Page) {
  const menu = page.locator(".toolbar-overflow-pop.show");
  if (!(await menu.isVisible())) await page.getByTestId("toolbar-more").click();
  await expect(menu).toBeVisible();
  return menu;
}

export async function toggleToolbarReplay(page: Page) {
  const direct = page.locator('[data-toolbar-action="replay"]');
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const menu = await openOverflow(page);
  await menu.locator('[data-toolbar-menu-action="replay"]').click();
}

export async function chooseToolbarSplit(page: Page, count: 1 | 2 | 4) {
  const direct = page.locator('[data-toolbar-action="split"]')
    .getByRole("button", { name: String(count), exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const menu = await openOverflow(page);
  await menu.locator(".toolbar-overflow-group .seg")
    .getByRole("button", { name: String(count), exact: true })
    .click();
  await expect(menu).toBeHidden();
}

export async function runToolbarDetector(page: Page, label: string) {
  const direct = page.locator('[data-toolbar-action="detect"]');
  if (await direct.isVisible()) {
    await direct.locator(":scope > button").click();
    await page.locator(".pop.show .menu-row").filter({ hasText: label }).click();
    return;
  }
  const menu = await openOverflow(page);
  await menu.locator('[data-toolbar-menu-action="detect"]').click();
  await menu.locator('[data-toolbar-menu-action^="detect-"]').filter({ hasText: label }).click();
}
