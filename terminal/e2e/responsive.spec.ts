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
    await page.keyboard.press("Escape");
    await expect(page.locator(".msheet")).toBeHidden();
  }

  const settingsButton = desktop
    ? page.locator(".topbar button.avatar")
    : page.locator(".mobilebar button.avatar");
  await settingsButton.click();
  const settingsDialog = page.getByRole("dialog", { name: "Terminal" });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole("tab", { name: "Terminal" })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-terminal-settings.png`),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(settingsDialog).toBeHidden();

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

test("a Pro-equivalent entitlement can add every premium suite", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One viewport is sufficient for the shared entitlement contract.");

  await page.goto("/terminal?symbol=NVDA");
  await page.getByRole("button", { name: "Indicators", exact: true }).click();

  const modal = page.locator(".imodal");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".li-lock")).toHaveCount(0);

  const structure = modal.locator(".li").filter({ hasText: "Structure Core" });
  await structure.click();
  await expect(structure).toHaveClass(/\bon\b/);
});
