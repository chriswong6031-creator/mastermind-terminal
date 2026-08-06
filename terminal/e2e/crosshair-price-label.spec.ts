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

  const geom = (await tagGeom(page))!;
  const x = geom.wrapLeft + geom.wrapWidth * 0.55;              // inside the plot, clear of the axis
  const offChart = () => page.mouse.move(geom.wrapLeft + 4, 4); // above the pane → crosshair cleared

  // Anchors are re-measured with the crosshair CLEARED rather than reused across steps: a quote
  // landing mid-test moves the last price (and with it the badge) by a few pixels, which an
  // absolute comparison would read as a dodge that never happened.
  await offChart();
  const anchor = (await tagGeom(page))!.top;

  // 1. the crosshair sitting on the last price pushes the badge fully clear of the label box
  await page.mouse.move(x, geom.wrapTop + anchor - 40);
  await page.mouse.move(x, geom.wrapTop + anchor);
  await expect.poll(async () => (await tagGeom(page))?.top ?? 0, { timeout: 10_000 }).toBeGreaterThan(anchor);
  const dodged = (await tagGeom(page))!;
  expect(dodged.boxTop >= anchor + LABEL_HALF || dodged.boxBottom <= anchor - LABEL_HALF).toBe(true);

  // 2. a crosshair that never touched the badge leaves it on the price
  await offChart();
  const anchorNow = (await tagGeom(page))!.top;
  await page.mouse.move(x, geom.wrapTop + anchorNow - 80);
  await expect.poll(async () => Math.abs(((await tagGeom(page))?.top ?? -999) - anchorNow), { timeout: 10_000 })
    .toBeLessThanOrEqual(1);
});
