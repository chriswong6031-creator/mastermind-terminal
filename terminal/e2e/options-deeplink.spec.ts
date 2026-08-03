import { test, expect } from "@playwright/test";

/**
 * Regression: /options?tab=X deep-links must land on the requested tab on a
 * COLD load. The tab used to seed via a post-mount window.location.search →
 * setState hop (react-hooks/set-state-in-effect) that intermittently left the
 * workspace on the default Tape tab. The fix derives the tab synchronously
 * from useSearchParams — /options is always dynamically rendered, so the
 * SERVER response itself marks the requested pill selected and hydration
 * starts on it.
 *
 * Two layers, so a regression back to any client-side hop cannot hide behind
 * retries/timeouts:
 *  1. the raw SSR HTML (no JS at all) must carry the selection;
 *  2. the hydrated page must keep it, with the URL preserved.
 */

// `prism` exercises the §5.3 retired-tab alias: HUB_KEY maps it onto the
// Exposure desk (page key `gex`), and the URL keeps the original ?tab=prism
// (GexDeskView reads it to open on the matrix view).
const CASES = [
  { query: "volatility", pill: "volatility" },
  { query: "prism", pill: "gex" },
] as const;

for (const { query, pill } of CASES) {
  test(`/options?tab=${query} activates the ${pill} tab on cold load`, async ({ page }, testInfo) => {
    test.setTimeout(60_000); // first hit may pay the dev-server route compile

    // 1) Server-rendered selection. WorkspaceTabs renders one role=tab button
    //    per pill as id="wtab-<key>" with aria-selected — assert on the raw
    //    payload before any hydration can run.
    const res = await page.request.get(`/options?tab=${query}`);
    expect(res.ok()).toBe(true);
    const html = await res.text();
    const pillTag = (key: string) => {
      const m = html.match(new RegExp(`<button[^>]*id="wtab-${key}"[^>]*>`));
      expect(m, `pill wtab-${key} present in SSR HTML`).not.toBeNull();
      return m![0];
    };
    expect(pillTag(pill)).toContain('aria-selected="true"');
    expect(pillTag("tape")).toContain('aria-selected="false"');

    // 2) Hydrated cold load: the requested pill is (and stays) the active one.
    await page.goto(`/options?tab=${query}`);
    await expect(page.locator(`#wtab-${pill}`)).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    await expect(page.locator("#wtab-tape")).toHaveAttribute("aria-selected", "false");
    await expect(page).toHaveURL(new RegExp(`/options\\?tab=${query}$`));
    await page.screenshot({
      path: testInfo.outputPath(`${testInfo.project.name}-options-deeplink-${query}.png`),
      fullPage: false,
    });
  });
}
