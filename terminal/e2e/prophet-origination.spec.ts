/**
 * Prophet reconstruction disclosure — the real surface, not a server-rendered string.
 *
 * The macro builder marks a plan it rebuilt after an outage with `origination_note`,
 * a finished EN/ZH chip plus an optional receipt. This spec proves the Terminal draws
 * the row's own words, draws NOTHING on a live plan, and keeps the chip subordinate to
 * the plan it annotates — at all three house viewports, in both languages.
 *
 * Copy is never asserted against a literal written here: every expected string is read
 * out of the fixture, which is itself a transcript of the producer's output. A test
 * that hard-coded the wording would just be a second place for it to drift.
 *
 * Run with PROPHET_EVIDENCE=1 to also write the PR crops to
 * docs/pr-crops/prophet-origination-disclosure/.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface OriginationNote {
  en: string;
  zh: string;
  tip_en?: string;
  tip_zh?: string;
}

interface FixturePlan {
  id: string;
  asset: string;
  origination_note?: OriginationNote;
}

const FIXTURE_FILE = path.join(process.cwd(), "test-fixtures", "prophet_reconstructed_fixture.json");
const CROP_DIR = path.join(process.cwd(), "..", "docs", "pr-crops", "prophet-origination-disclosure");
const EVIDENCE = process.env.PROPHET_EVIDENCE === "1";

let fixture: { plans: FixturePlan[] };

test.beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE_FILE, "utf8")) as { plans: FixturePlan[] };
  if (EVIDENCE) mkdirSync(CROP_DIR, { recursive: true });
});

function planFor(asset: string): FixturePlan {
  const plan = fixture.plans.find((p) => p.asset === asset);
  if (!plan) throw new Error(`fixture is missing the ${asset} row`);
  return plan;
}

/** The card for one ticker in the signal stream. */
function card(page: Page, asset: string): Locator {
  return page.locator(".obs-prophet-signal").filter({ hasText: asset }).first();
}

async function openProphet(page: Page, lang: "en" | "zh"): Promise<void> {
  // Predicate rather than a glob: the `?` in `/api/flow?f=…` is ambiguous in URL globs.
  await page.route(
    (url) => url.pathname === "/api/flow" && url.searchParams.get("f") === "prophet_idx",
    async (route) => { await route.fulfill({ json: fixture }); },
  );
  await page.goto("/options?tab=prophet");
  await expect(card(page, "UBER")).toBeVisible({ timeout: 20_000 });
  if (lang === "zh") {
    // The house switch: LangProvider re-reads the attribute on every `mm:lang`.
    await page.evaluate(() => {
      window.localStorage.setItem("mm.lang", "zh");
      document.documentElement.setAttribute("data-lang", "zh");
      window.dispatchEvent(new CustomEvent("mm:lang"));
    });
  }
}

for (const lang of ["en", "zh"] as const) {
  test(`Prophet marks a reconstructed plan with the row's own ${lang} disclosure`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await openProphet(page, lang);

    const rebuilt = planFor("UBER");
    const note = rebuilt.origination_note!;
    const chipCopy = lang === "zh" ? note.zh : note.en;
    const tipCopy = (lang === "zh" ? note.tip_zh : note.tip_en)!;

    const rebuiltCard = card(page, "UBER");
    const chip = rebuiltCard.locator(".obs-tag", { hasText: chipCopy });
    await expect(chip).toHaveCount(1);
    await expect(chip).toBeVisible();

    // The control: a live plan is untouched. Absence is the whole safety property.
    const liveCard = card(page, "NVDA");
    await expect(liveCard).toBeVisible();
    await expect(liveCard.locator(".obs-tag", { hasText: chipCopy })).toHaveCount(0);

    // The internal name of the event never reaches a reader, in either tier.
    await expect(page.locator("body")).not.toContainText("outage_backfill");

    // SUBORDINATE, MEASURED. The chip must read quieter than the direction badge it
    // sits under — smaller and lighter, and wearing the neutral token rather than a
    // directional or warning one. "Quiet" is a claim; these are the numbers behind it.
    const tone = await chip.evaluate((el) => {
      const cs = getComputedStyle(el);
      const root = getComputedStyle(document.documentElement);
      const resolve = (token: string) => root.getPropertyValue(token).trim();
      return {
        fontSize: parseFloat(cs.fontSize),
        fontWeight: Number(cs.fontWeight),
        color: cs.color,
        muted: resolve("--muted"),
        down: resolve("--down"),
        warn: resolve("--warn"),
      };
    });
    const badge = await rebuiltCard.locator(".obs-tag").first().evaluate((el) => ({
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      fontWeight: Number(getComputedStyle(el).fontWeight),
    }));
    expect(tone.fontSize).toBeLessThan(badge.fontSize);
    expect(tone.fontWeight).toBeLessThan(badge.fontWeight);
    expect(tone.color).not.toBe(tone.down);
    expect(tone.color).not.toBe(tone.warn);

    // Tier 2 — the receipt, through the house tooltip primitive.
    await chip.hover();
    const tip = page.locator('[role="tooltip"]');
    await expect(tip).toContainText(tipCopy, { timeout: 5_000 });

    if (EVIDENCE) {
      // The chip is captured at every viewport (the house 3-viewport rule); the
      // receipt and the two control cases are the same pixels at every width, so
      // desktop carries them once rather than three near-identical times.
      const stem = `${testInfo.project.name}-${lang}`;
      const isDesktop = testInfo.project.name === "desktop";
      if (isDesktop) {
        const cardBox = await rebuiltCard.boundingBox();
        const tipBox = await tip.boundingBox();
        if (cardBox && tipBox) {
          const left = Math.max(0, Math.min(cardBox.x, tipBox.x) - 12);
          const top = Math.max(0, Math.min(cardBox.y, tipBox.y) - 12);
          const right = Math.max(cardBox.x + cardBox.width, tipBox.x + tipBox.width) + 12;
          const bottom = Math.max(cardBox.y + cardBox.height, tipBox.y + tipBox.height) + 12;
          await page.screenshot({
            path: path.join(CROP_DIR, `${stem}-receipt.png`),
            clip: { x: left, y: top, width: right - left, height: bottom - top },
          });
        }
      }
      await page.mouse.move(0, 0);
      await expect(tip).toHaveCount(0);
      await rebuiltCard.screenshot({ path: path.join(CROP_DIR, `${stem}-chip.png`) });
      if (isDesktop) {
        await liveCard.screenshot({ path: path.join(CROP_DIR, `${stem}-control-live-plan.png`) });
        await card(page, "PLTR").screenshot({ path: path.join(CROP_DIR, `${stem}-no-receipt.png`) });
      }
    }
  });
}

test("a reconstructed plan with no receipt shows the chip and promises no hover", async ({ page }) => {
  test.setTimeout(60_000);
  await openProphet(page, "en");

  // Fail-soft, matching the producer: an undatable row ships the chip alone. A hover
  // affordance over nothing to hover is a promise the card cannot keep — so this chip
  // keeps the card's own `pointer` (the whole card is selectable) and never claims
  // `help`, which is this repo's "there is a receipt here" tell.
  const undated = planFor("PLTR");
  const chip = card(page, "PLTR").locator(".obs-tag", { hasText: undated.origination_note!.en });
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveCSS("cursor", "pointer");

  const dated = card(page, "UBER").locator(".obs-tag", { hasText: planFor("UBER").origination_note!.en });
  await expect(dated).toHaveCSS("cursor", "help");
});
