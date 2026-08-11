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
  date_en?: string;
  date_zh?: string;
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

/** The CENTER column — the detail panel for whichever plan is selected. */
function panel(page: Page): Locator {
  return page.locator(".obs-prophet-analysis");
}

/** Select a plan and wait for the panel to actually be showing it. */
async function openPlan(page: Page, asset: string): Promise<void> {
  await card(page, asset).click();
  await expect(panel(page).getByText(asset, { exact: true }).first()).toBeVisible();
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

// ── The detail panel ──────────────────────────────────────────────────────────
//
// The card marks the pick for a reader who is scanning. The panel is where that reader
// stops and reads, so the disclosure stops being a chip with the receipt behind a hover
// and becomes a dated line with the receipt in the open — and it moves ABOVE the trade
// geometry, because the rail, the phase and the phase-keyed brief are all timed from
// the origination date. This spec proves both the copy and that ordering on the real
// surface, at every house viewport.

for (const lang of ["en", "zh"] as const) {
  test(`Prophet's detail panel discloses the reconstruction in ${lang}, above the geometry`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await openProphet(page, lang);
    await openPlan(page, "UBER");

    const note = planFor("UBER").origination_note!;
    const clause = lang === "zh" ? note.zh : note.en;
    const stamp = (lang === "zh" ? note.date_zh : note.date_en)!;
    const receipt = (lang === "zh" ? note.tip_zh : note.tip_en)!;

    const disclosure = panel(page).locator(".obs-prophet-origination");
    await expect(disclosure).toHaveCount(1);
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toContainText(clause);
    await expect(disclosure).toContainText(stamp);
    // Tier 2 in the open: the receipt is READ here, not hovered for. A reader who has
    // opened the plan has already asked the question the card's tooltip answers.
    await expect(disclosure).toContainText(receipt);
    await expect(page.locator("body")).not.toContainText("outage_backfill");

    // The other language never leaks into this one.
    await expect(disclosure).not.toContainText(lang === "zh" ? note.en : note.zh);

    // PLACEMENT, MEASURED. The whole argument for putting it here rather than at the
    // foot is that every window below it is timed from this date — so it has to be
    // above the rail, and below the ticker it belongs to.
    const noteBox = (await disclosure.boundingBox())!;
    const railBox = (await panel(page).locator('[data-testid="geometry-rail"]').boundingBox())!;
    const tickerBox = (await panel(page).getByText("UBER", { exact: true }).first().boundingBox())!;
    expect(noteBox.y).toBeGreaterThan(tickerBox.y);
    expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(railBox.y);

    // QUIET, MEASURED. Provenance is context, not an alarm: the clause runs a step
    // below the plan's own ink and the note is nowhere near the ticker in size, and
    // neither line may wear a directional or warning token.
    const tone = await disclosure.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      const lines = Array.from(el.querySelectorAll("span, p")) as HTMLElement[];
      return {
        sizes: lines.map((n) => parseFloat(getComputedStyle(n).fontSize)),
        colors: lines.map((n) => getComputedStyle(n).color),
        down: root.getPropertyValue("--down").trim(),
        warn: root.getPropertyValue("--warn").trim(),
      };
    });
    const tickerSize = await panel(page)
      .getByText("UBER", { exact: true })
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(tone.sizes.length).toBeGreaterThanOrEqual(3); // clause + stamp + receipt
    for (const size of tone.sizes) expect(size).toBeLessThan(tickerSize / 2);
    for (const color of tone.colors) {
      expect(color).not.toBe(tone.down);
      expect(color).not.toBe(tone.warn);
    }

    // The control: selecting a live plan leaves the panel exactly as it always was.
    await openPlan(page, "NVDA");
    await expect(panel(page).locator(".obs-prophet-origination")).toHaveCount(0);
    await expect(panel(page)).not.toContainText(clause);

    if (EVIDENCE) {
      const stem = `${testInfo.project.name}-${lang}`;
      await panel(page).screenshot({ path: path.join(CROP_DIR, `${stem}-panel-control-live-plan.png`) });
      await openPlan(page, "UBER");
      await panel(page).screenshot({ path: path.join(CROP_DIR, `${stem}-panel.png`) });

      // The header-plus-note crop is a page clip, so the region has to be ON SCREEN
      // first — at 390px the centre column is stacked below the stream and a clip
      // reaching past the viewport silently returns a half-cut disclosure.
      await panel(page).evaluate((el) => { el.scrollTop = 0; });
      await panel(page).scrollIntoViewIfNeeded();
      const box = (await disclosure.boundingBox())!;
      const head = (await panel(page).locator("> div").first().boundingBox())!;
      const vp = page.viewportSize()!;
      const top = Math.max(0, head.y - 8);
      await page.screenshot({
        path: path.join(CROP_DIR, `${stem}-panel-disclosure.png`),
        clip: {
          x: Math.max(0, head.x - 8),
          y: top,
          width: Math.min(Math.max(head.width, box.width) + 16, vp.width - Math.max(0, head.x - 8)),
          height: Math.min(box.y + box.height + 8 - top, vp.height - top),
        },
      });
      // A clip the viewport truncated would quietly ship a cut-off disclosure as
      // evidence, which is worse than no evidence.
      expect(box.y + box.height + 8).toBeLessThanOrEqual(vp.height);
      if (testInfo.project.name === "desktop") {
        await openPlan(page, "PLTR");
        await panel(page).locator(".obs-prophet-origination")
          .screenshot({ path: path.join(CROP_DIR, `${stem}-panel-no-receipt.png`) });
      }
    }
  });
}

test("the panel's disclosure shows the clause alone when the row has no receipt", async ({ page }) => {
  test.setTimeout(60_000);
  await openProphet(page, "en");
  await openPlan(page, "PLTR");

  // Fail-soft, exactly as the producer is: an undatable row ships the clause and
  // nothing else. No stamp, no receipt paragraph, and no empty shell standing in.
  const undated = planFor("PLTR").origination_note!;
  const disclosure = panel(page).locator(".obs-prophet-origination");
  await expect(disclosure).toHaveCount(1);
  await expect(disclosure).toHaveText(undated.en);
  await expect(disclosure.locator("p")).toHaveCount(0);

  // The dated row is the contrast — same block, three lines of content.
  await openPlan(page, "UBER");
  const dated = planFor("UBER").origination_note!;
  await expect(disclosure).toContainText(dated.date_en!);
  await expect(disclosure.locator("p")).toHaveCount(1);
});

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
