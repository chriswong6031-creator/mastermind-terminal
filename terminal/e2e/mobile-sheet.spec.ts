import { expect, test, type Page } from "@playwright/test";

async function openTerminal(page: Page) {
  await page.addInitScript(() => {
    const readyWindow = window as Window & { __mmMobileSheetReady?: boolean };
    readyWindow.__mmMobileSheetReady = false;
    window.addEventListener("mm:terminal-visual-ready", () => {
      readyWindow.__mmMobileSheetReady = true;
    }, { once: true });
  });
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  await expect.poll(
    () => page.evaluate(() =>
      Boolean((window as Window & { __mmMobileSheetReady?: boolean }).__mmMobileSheetReady)),
    { message: "the interactive Terminal should finish hydrating", timeout: 15_000 },
  ).toBe(true);
}

test("mobile sheet is labelled, contains focus, and restores its trigger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "MobileSheet is rendered only at responsive widths.");
  await openTerminal(page);

  const trigger = page.locator(".tfbtn-edit");
  await trigger.focus();
  await trigger.click();

  const sheet = page.getByRole("dialog", { name: "Timeframe" });
  await expect(sheet).toBeVisible();
  const titleId = await sheet.getAttribute("aria-labelledby");
  expect(titleId).toBeTruthy();
  await expect(sheet.locator(".msheet-title")).toHaveAttribute("id", titleId!);
  await expect(sheet.locator(".msheet-title")).toHaveText("Timeframe");
  await expect(sheet).toBeFocused();

  // The timeframe sheet currently has no native tab stops. Tab must therefore
  // stay on the dialog instead of leaking into the chart behind it.
  await page.keyboard.press("Tab");
  await expect(sheet).toBeFocused();
  await trigger.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(sheet).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("reduced-motion swipe cancellation resets cleanly and dismissal is immediate", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "MobileSheet is rendered only at responsive widths.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTerminal(page);

  const trigger = page.locator(".tfbtn-edit");
  await trigger.focus();
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Timeframe" });
  const handle = sheet.locator("[data-handle='1']");
  await expect(sheet).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const startY = box!.y + box!.height / 2;
  const pointer = {
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
    clientX: box!.x + box!.width / 2,
    clientY: startY,
    button: 0,
    buttons: 1,
  };

  await handle.dispatchEvent("pointerdown", pointer);
  await sheet.dispatchEvent("pointermove", { ...pointer, clientY: startY + 54 });
  await expect.poll(() => sheet.evaluate((element) => element.style.transform))
    .toBe("translateY(54px)");
  await sheet.dispatchEvent("pointercancel", { ...pointer, clientY: startY + 54, buttons: 0 });
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate((element) => element.style.transform)).toBe("");

  await handle.dispatchEvent("pointerdown", { ...pointer, pointerId: 8 });
  await sheet.dispatchEvent("pointermove", { ...pointer, pointerId: 8, clientY: startY + 120 });
  await sheet.dispatchEvent("pointerup", {
    ...pointer,
    pointerId: 8,
    clientY: startY + 120,
    buttons: 0,
  });
  await expect(sheet).toBeHidden({ timeout: 200 });
  await expect(trigger).toBeFocused();
});
