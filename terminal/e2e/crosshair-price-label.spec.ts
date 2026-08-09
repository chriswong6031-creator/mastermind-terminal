import { expect, test, type Page } from "@playwright/test";
import { crosshairLabelHalf } from "@/lib/priceTagPlacement";
import { settled } from "./settle";

// The last-price badge is a DOM overlay on the right scale; the crosshair's price label is painted
// on the axis canvas UNDER it. Before this contract the badge covered the label outright, so the
// hovered price — the whole point of the crosshair — was unreadable at the last-price level.
const LABEL_HALF = crosshairLabelHalf(12);   // shipped axis font

type Box = { top: number; bottom: number };
/** The dodge coordinates PLUS the badge's occupied band, read together — see `shot`. */
type Shot = { crossY: number | null; tagTop: number | null } & Box;

// The crosshair is canvas-drawn and its coordinate lives in a ref: a synthetic pointer move gives
// the test no signal that it REGISTERED, so waiting on a timeout raced (a CI tablet run read the
// badge one frame before the crosshair landed). __mmCrosshairDodge exposes the two numbers the
// placement is computed from, so every assertion below waits for the state it is asserting about.
//
// Both of those numbers and the badge's occupied band come back from ONE evaluate. Read separately
// they straddled frames, and the pane can drop a crosshair between two reads (see the nudge note in
// the test): the band would then be measured against a coordinate that no longer existed, and
// `crossY` would arrive null into arithmetic that silently produces NaN comparisons.
//
// The band is the union of the badge and its countdown caption, which the shell rule lifts out of
// the badge's own box.
const shot = (page: Page): Promise<Shot> => page.evaluate(() => {
  const dodge = (window as Window & { __mmCrosshairDodge?: () => { crossY: number | null; tagTop: number | null } })
    .__mmCrosshairDodge?.() ?? { crossY: null, tagTop: null };
  const tag = document.querySelector<HTMLElement>(".mm-ptag")!;
  const wrapTop = tag.parentElement!.getBoundingClientRect().top;
  const r = tag.getBoundingClientRect();
  const cd = tag.querySelector<HTMLElement>(".mm-ptag-cd");
  const rc = cd && cd.style.display !== "none" ? cd.getBoundingClientRect() : null;
  return {
    ...dodge,
    top: Math.min(r.top, rc?.top ?? r.top) - wrapTop,
    bottom: Math.max(r.bottom, rc?.bottom ?? r.bottom) - wrapTop,
  };
});

// "Stopped moving", to the pixel: the dodge displaces the badge by ~27px, so a pixel of slack is far
// inside the signal and absorbs the anchor drifting under a quote that lands mid-test.
const stillAt = (a: Shot, b: Shot) =>
  a.crossY === b.crossY && Math.abs((a.tagTop ?? 0) - (b.tagTop ?? 0)) <= 1;

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
  await expect.poll(async () => (await shot(page)).tagTop ?? 0, { timeout: 45_000 }).toBeGreaterThan(0);

  const geom = await chartGeom(page);
  const x = geom.wrapLeft + geom.wrapWidth * 0.55;              // inside the plot, clear of the axis
  const offChart = () => page.mouse.move(geom.wrapLeft + 4, 4); // above the pane → crosshair cleared

  // Anchors are re-measured with the crosshair CLEARED rather than reused across steps: a quote
  // landing mid-test moves the last price (and with it the badge) by a few pixels, which an
  // absolute comparison would read as a dodge that never happened.
  await offChart();
  await expect.poll(async () => (await shot(page)).crossY, { timeout: 10_000 }).toBeNull();
  const anchor = (await shot(page)).tagTop!;

  // The pane can DROP a crosshair it has already registered. Sampled under a throttled main thread,
  // `crossY` goes null a few hundred ms after the pointer lands — with no pointer event behind it —
  // and the badge re-renders back onto the price:
  //
  //     crossY  [122, 122, null, null, … null]      tagTop [149, 149, 122, 122, … 122]
  //
  // and it never comes back: the 1s badge tick re-runs the placement against a coordinate that is
  // now null, so only another pointer move restores the dodge. So the nudge is not just for LANDING
  // the crosshair; it has to keep running until the dodged state repeats. Waiting longer was never
  // the fix — the flake reported the badge back at EXACTLY the anchor, which is a dodge that had
  // been undone, not one still in flight. A repeat move to the SAME coordinate fires no event at
  // all, hence the two-step nudge.
  const nudgeTo = (y: number, via: number) => async () => {
    await page.mouse.move(x, geom.wrapTop + via);
    await page.mouse.move(x, geom.wrapTop + y);
  };

  // 1. the crosshair sitting on the last price pushes the badge fully clear of the label box.
  const onPrice = await settled({
    drive: nudgeTo(anchor, anchor - 40),
    read: () => shot(page),
    ok: (s) => s.crossY != null && Math.abs(s.crossY - anchor) <= 2,
    same: stillAt,
    message: "the crosshair should settle on the last price",
  });
  expect(onPrice.tagTop ?? 0).toBeGreaterThan(anchor);
  expect(onPrice.top >= onPrice.crossY! + LABEL_HALF || onPrice.bottom <= onPrice.crossY! - LABEL_HALF).toBe(true);

  // 2. a crosshair that never touched the badge leaves it on the price.
  //    Move AWAY from the badge in whichever direction the pane has room: at 390×844 the last
  //    price sits ~80px from the pane top, so a fixed "80px above" walks off the pane entirely,
  //    clears the crosshair, and asserts nothing.
  await offChart();
  await expect.poll(async () => (await shot(page)).crossY, { timeout: 10_000 }).toBeNull();
  const anchorNow = (await shot(page)).tagTop!;
  const away = anchorNow > 120 ? -80 : 80;                    // ≫ the 27px collision band either way
  // A crosshair the pane has dropped ALSO leaves the badge on the price, so this step settles on a
  // reading that still carries a live coordinate well clear of the badge — otherwise "the badge did
  // not move" would pass for the wrong reason, proving nothing about the collision rule.
  const clearOfBadge = await settled({
    drive: nudgeTo(anchorNow + away, anchorNow + away * 0.5),
    read: () => shot(page),
    ok: (s) => s.crossY != null && Math.abs(s.crossY - anchorNow) > 40,
    same: stillAt,
    message: "the crosshair should settle clear of the badge",
  });
  expect(Math.abs((clearOfBadge.tagTop ?? -999) - anchorNow)).toBeLessThanOrEqual(1);
});
