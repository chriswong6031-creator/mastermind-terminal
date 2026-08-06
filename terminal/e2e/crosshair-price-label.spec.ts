import { expect, test, type Page } from "@playwright/test";
import { crosshairLabelHalf } from "@/lib/priceTagPlacement";

// The last-price badge is a DOM overlay on the right scale; the crosshair's price label is painted
// on the axis canvas UNDER it. Before this contract the badge covered the label outright, so the
// hovered price — the whole point of the crosshair — was unreadable at the last-price level.
const LABEL_HALF = crosshairLabelHalf(12);   // shipped axis font

type Dodge = { crossY: number | null; tagTop: number | null };
type Box = { top: number; bottom: number };

// The crosshair is canvas-drawn and its coordinate lives in a ref: a synthetic pointer move gives
// the test no signal that it REGISTERED, so waiting on a timeout raced (a CI tablet run read the
// badge one frame before the crosshair landed). __mmCrosshairDodge exposes the two numbers the
// placement is computed from, so every assertion below waits for the state it is asserting about.
const dodgeState = (page: Page): Promise<Dodge> =>
  page.evaluate(() => (window as Window & { __mmCrosshairDodge?: () => Dodge }).__mmCrosshairDodge?.()
    ?? { crossY: null, tagTop: null });

// Occupied band of the badge in pane space — the union of the badge and its countdown caption,
// which the shell rule lifts out of the badge's own box.
async function tagBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const tag = document.querySelector<HTMLElement>(".mm-ptag")!;
    const wrapTop = tag.parentElement!.getBoundingClientRect().top;
    const r = tag.getBoundingClientRect();
    const cd = tag.querySelector<HTMLElement>(".mm-ptag-cd");
    const rc = cd && cd.style.display !== "none" ? cd.getBoundingClientRect() : null;
    return {
      top: Math.min(r.top, rc?.top ?? r.top) - wrapTop,
      bottom: Math.max(r.bottom, rc?.bottom ?? r.bottom) - wrapTop,
    };
  });
}

async function chartGeom(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>(".mm-ptag")!.parentElement!.getBoundingClientRect();
    return { wrapTop: wrap.top, wrapLeft: wrap.left, wrapWidth: wrap.width };
  });
}

test("the last-price badge yields the axis to the crosshair's price label", async ({ page }) => {
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await dodgeState(page)).tagTop ?? 0, { timeout: 45_000 }).toBeGreaterThan(0);

  const geom = await chartGeom(page);
  const x = geom.wrapLeft + geom.wrapWidth * 0.55;              // inside the plot, clear of the axis
  const offChart = () => page.mouse.move(geom.wrapLeft + 4, 4); // above the pane → crosshair cleared

  // Anchors are re-measured with the crosshair CLEARED rather than reused across steps: a quote
  // landing mid-test moves the last price (and with it the badge) by a few pixels, which an
  // absolute comparison would read as a dodge that never happened.
  await offChart();
  await expect.poll(async () => (await dodgeState(page)).crossY, { timeout: 10_000 }).toBeNull();
  const anchor = (await dodgeState(page)).tagTop!;

  // 1. the crosshair sitting on the last price pushes the badge fully clear of the label box.
  //    Nudge until the move registers — one synthetic move can land while the pane is still
  //    settling, and a repeat to the SAME coordinate fires no event at all.
  await expect.poll(async () => {
    await page.mouse.move(x, geom.wrapTop + anchor - 40);
    await page.mouse.move(x, geom.wrapTop + anchor);
    const s = await dodgeState(page);
    return s.crossY != null && Math.abs(s.crossY - anchor) <= 2 ? "on-price" : "not-yet";
  }, { timeout: 20_000, intervals: [250, 500, 500, 1000] }).toBe("on-price");

  await expect.poll(async () => (await dodgeState(page)).tagTop ?? 0, { timeout: 10_000 }).toBeGreaterThan(anchor);
  const box = await tagBox(page);
  const cross = (await dodgeState(page)).crossY!;
  expect(box.top >= cross + LABEL_HALF || box.bottom <= cross - LABEL_HALF).toBe(true);

  // 2. a crosshair that never touched the badge leaves it on the price.
  //    Move AWAY from the badge in whichever direction the pane has room: at 390×844 the last
  //    price sits ~80px from the pane top, so a fixed "80px above" walks off the pane entirely,
  //    clears the crosshair, and asserts nothing.
  await offChart();
  await expect.poll(async () => (await dodgeState(page)).crossY, { timeout: 10_000 }).toBeNull();
  const anchorNow = (await dodgeState(page)).tagTop!;
  const away = anchorNow > 120 ? -80 : 80;                    // ≫ the 27px collision band either way
  await expect.poll(async () => {
    await page.mouse.move(x, geom.wrapTop + anchorNow + away * 0.5);
    await page.mouse.move(x, geom.wrapTop + anchorNow + away);
    const s = await dodgeState(page);
    return s.crossY != null && Math.abs(s.crossY - anchorNow) > 40 ? "clear-of-badge" : "not-yet";
  }, { timeout: 20_000, intervals: [250, 500, 500, 1000] }).toBe("clear-of-badge");
  expect(Math.abs(((await dodgeState(page)).tagTop ?? -999) - anchorNow)).toBeLessThanOrEqual(1);
});
