import { expect, test, type Page } from "@playwright/test";
import { crosshairLabelHalf } from "@/lib/priceTagPlacement";

// The last-price badge is a DOM overlay on the right scale; the crosshair's price label is painted
// on the axis canvas UNDER it. Before this contract the badge covered the label outright, so the
// hovered price — the whole point of the crosshair — was unreadable at the last-price level.
const LABEL_HALF = crosshairLabelHalf(12);   // shipped axis font

type TagGeom = { anchor: number; wrapTop: number; wrapLeft: number; wrapWidth: number; top: number; boxTop: number; boxBottom: number };

async function tagGeom(page: Page): Promise<TagGeom | null> {
  return page.evaluate(() => {
    const tag = document.querySelector(".mm-ptag") as HTMLElement | null;
    if (!tag || tag.style.display === "none") return null;
    const wrap = tag.parentElement!.getBoundingClientRect();
    const r = tag.getBoundingClientRect();
    const cd = tag.querySelector(".mm-ptag-cd") as HTMLElement | null;
    const cdRect = cd && cd.style.display !== "none" ? cd.getBoundingClientRect() : null;
    return {
      anchor: parseFloat(tag.style.top),
      wrapTop: wrap.top, wrapLeft: wrap.left, wrapWidth: wrap.width,
      top: parseFloat(tag.style.top),
      boxTop: Math.min(r.top, cdRect?.top ?? r.top) - wrap.top,
      boxBottom: Math.max(r.bottom, cdRect?.bottom ?? r.bottom) - wrap.top,
    };
  });
}

test("the last-price badge yields the axis to the crosshair's price label", async ({ page }) => {
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await tagGeom(page))?.anchor ?? 0, { timeout: 45_000 }).toBeGreaterThan(0);

  const rest = (await tagGeom(page))!;
  const crossY = rest.anchor;                                   // hover dead-on the last price
  const x = rest.wrapLeft + rest.wrapWidth * 0.55;              // inside the plot, clear of the axis

  // 1. the crosshair sitting on the last price pushes the badge fully clear of the label box
  await page.mouse.move(x, rest.wrapTop + crossY - 40);
  await page.mouse.move(x, rest.wrapTop + crossY);
  await expect.poll(async () => (await tagGeom(page))?.top ?? 0, { timeout: 10_000 }).toBeGreaterThan(rest.anchor);
  const dodged = (await tagGeom(page))!;
  const labelTop = crossY - LABEL_HALF, labelBottom = crossY + LABEL_HALF;
  expect(dodged.boxTop >= labelBottom || dodged.boxBottom <= labelTop).toBe(true);

  // 2. a crosshair that never touched the badge leaves it on the price
  await page.mouse.move(x, rest.wrapTop + crossY - 80);
  await expect.poll(async () => (await tagGeom(page))?.top ?? 0, { timeout: 10_000 }).toBe(rest.anchor);
});
