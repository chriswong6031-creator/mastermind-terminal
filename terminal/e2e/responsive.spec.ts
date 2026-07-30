import { expect, test } from "@playwright/test";

test("the canonical Terminal shell works at its supported responsive widths", async ({ page }, testInfo) => {
  await page.goto("/terminal?symbol=NVDA");

  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".chart-body")).toBeVisible();

  const desktop = testInfo.project.name === "desktop";
  if (desktop) {
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".mobilebar")).toBeHidden();
    await expect(page.locator(".m-symbar")).toBeHidden();
  } else {
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".mobilebar")).toBeVisible();
    await expect(page.locator(".m-symbar")).toContainText("NVDA");

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".m-drawer.open")).toBeVisible();
    await page.mouse.click((page.viewportSize()?.width ?? 390) - 8, 100);
    await expect(page.locator(".m-drawer.open")).toBeHidden();

    await page.locator(".tfbtn-edit").click();
    await expect(page.locator(".msheet")).toBeVisible();
    await expect(page.locator(".msheet-row").filter({ hasText: /^4h/ })).toBeVisible();
  }

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-responsive.png`),
    fullPage: false,
  });
});
