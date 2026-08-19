import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * D3 + D4 — the Pine editor must not lose user-authored content, and must say which script it is
 * editing.
 *
 * Three defects, all provable only by leaving a script and coming back:
 *
 *   D3b  save() POSTed the new source successfully but never updated the editor's stored baseline.
 *        Switching scripts rehydrated the buffers from the ORIGINAL server props, so a save that
 *        had genuinely landed looked lost — and a subsequent save from that stale buffer would
 *        overwrite the real one.
 *   D3a  selection was a bare `setIdx(i)` and the switch effect then replaced the buffers, so an
 *        unsaved edit vanished on a single click with no Save/Discard/Cancel decision.
 *   D4   `?id=` was read once at mount; after that the visible script and the URL could disagree,
 *        so reloading or sharing the URL landed on a different script than the one on screen.
 *
 * Runs against the real page, the real editor and the real save route; only `saved_scripts` is a
 * fixture (lib/scriptsFixtureDb.ts, TERMINAL_E2E_FIXTURE only).
 */

const A = "Alpha Study";
const B = "Beta Study";

/** Own store per test — the three viewport projects share one dev server. */
async function isolateScripts(page: Page, testInfo: TestInfo, baseURL?: string) {
  const key = `${testInfo.project.name}-${testInfo.title}-${testInfo.retry}`
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 90);
  await page.context().addCookies([{
    name: "mm_e2e_scripts",
    value: key,
    url: baseURL ?? "http://127.0.0.1:3108",
  }]);
  return key;
}

const editor = (page: Page) => page.locator(".editor textarea");
const sideRow = (page: Page, name: string) => page.locator(".script-row", { hasText: name });
const console_ = (page: Page) => page.locator(".console");

async function openScripts(page: Page, testInfo: TestInfo, baseURL?: string, query = "") {
  await isolateScripts(page, testInfo, baseURL);
  await page.goto(`/scripts${query}`);
  await expect(editor(page)).toBeVisible({ timeout: 60_000 });
}

/** Replace the whole buffer — the editor is a controlled textarea. */
async function setSource(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

test.describe("D3b — a successful save becomes the editor's baseline", () => {
  test("edit → save → switch away → switch back keeps the SAVED source", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL);

    // Land on A and give it a distinctive edit.
    await sideRow(page, A).click();
    await expect(editor(page)).toHaveValue(/Alpha Study/);
    const EDITED = "//@version=6\nindicator(\"Alpha Study\")\nplot(close * 2) // A-PRIME\n";
    await setSource(page, EDITED);
    await expect(console_(page)).toContainText("unsaved changes");

    // Save, and assert the editor stops calling itself dirty.
    await page.getByRole("button", { name: /Save/ }).first().click();
    await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible({ timeout: 15_000 });
    await expect(console_(page)).not.toContainText("unsaved changes");

    // Leave and come back. THIS is where the save used to disappear.
    await sideRow(page, B).click();
    await expect(editor(page)).toHaveValue(/Beta Study/);
    await sideRow(page, A).click();
    await expect(editor(page)).toHaveValue(/A-PRIME/);
    // …and it is not merely displayed — the editor considers it stored, so a further switch is clean.
    await expect(console_(page)).not.toContainText("unsaved changes");
  });

  test("the saved source also survives a full reload (it really reached the store)", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL);

    await sideRow(page, A).click();
    await setSource(page, "//@version=6\nindicator(\"Alpha Study\")\nplot(hlc3) // PERSISTED\n");
    await page.getByRole("button", { name: /Save/ }).first().click();
    await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(editor(page)).toBeVisible({ timeout: 60_000 });
    await sideRow(page, A).click();
    await expect(editor(page)).toHaveValue(/PERSISTED/);
  });
});

test.describe("D3a — a dirty buffer is never discarded without a decision", () => {
  test("Keep editing cancels the switch and preserves the edit", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL);

    await sideRow(page, A).click();
    await setSource(page, "//@version=6\nindicator(\"Alpha Study\")\nplot(low) // UNSAVED\n");
    await sideRow(page, B).click();

    // A decision is REQUIRED — the old code just swapped the buffer.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(A);

    await dialog.getByRole("button", { name: /Keep editing/ }).click();
    await expect(dialog).toBeHidden();
    await expect(editor(page)).toHaveValue(/UNSAVED/);          // edit intact
    await expect(page.locator(".script-row.on")).toContainText(A); // still on A
  });

  test("a FAILED save keeps the edit and stays on the script", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL);

    await sideRow(page, A).click();
    await setSource(page, "//@version=6\nindicator(\"Alpha Study\")\nplot(low) // FRAGILE\n");

    // Break the save at the transport, the way a real outage would.
    await page.route("**/api/scripts/save", (route) => route.fulfill({ status: 500, body: "{}" }));

    await sideRow(page, B).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Save and switch/ }).click();

    // Staying put IS the safe outcome: nothing switched, nothing was lost, and it says so.
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Couldn't save/);
    await dialog.getByRole("button", { name: /Keep editing/ }).click();
    await expect(editor(page)).toHaveValue(/FRAGILE/);
    await expect(page.locator(".script-row.on")).toContainText(A);
  });

  test("Discard changes deliberately restores the stored source and switches", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL);

    await sideRow(page, A).click();
    await setSource(page, "//@version=6\nindicator(\"Alpha Study\")\nplot(low) // THROWAWAY\n");
    await sideRow(page, B).click();

    await page.getByRole("dialog").getByRole("button", { name: /Discard changes/ }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(editor(page)).toHaveValue(/Beta Study/);        // switched

    // Returning to A shows the STORED source — the discard was real, and only the edit was dropped.
    await sideRow(page, A).click();
    await expect(editor(page)).toHaveValue(/Alpha Study/);
    await expect(editor(page)).not.toHaveValue(/THROWAWAY/);
  });

  test("switching with a CLEAN buffer asks nothing", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL);

    await sideRow(page, A).click();
    await sideRow(page, B).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(editor(page)).toHaveValue(/Beta Study/);
  });
});

test.describe("D4 — the visible script and the ?id= deep link agree", () => {
  test("a deep link opens that script, and choosing another updates the URL", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL);

    // The URL names the visible script on ARRIVAL, before any switch — the list is ordered by
    // updated_at, so "whatever is first" is not a stable thing to share.
    await expect(editor(page)).toHaveValue(/Beta Study/);        // fixture: newest first
    const bId = new URL(page.url()).searchParams.get("id");
    expect(bId).toBeTruthy();

    // Selecting the OTHER script must move the URL with it — this is what used to drift.
    await sideRow(page, A).click();
    await expect(editor(page)).toHaveValue(/Alpha Study/);
    const aId = new URL(page.url()).searchParams.get("id");
    expect(aId).toBeTruthy();
    expect(aId).not.toBe(bId);

    // Reload lands on the SAME script the URL names, not on the first one.
    await page.reload();
    await expect(editor(page)).toBeVisible({ timeout: 60_000 });
    await expect(editor(page)).toHaveValue(/Alpha Study/);
    expect(new URL(page.url()).searchParams.get("id")).toBe(aId);

    // A fresh session opening the copied URL sees what the sharer saw.
    await page.goto(`/scripts?id=${encodeURIComponent(bId!)}`);
    await expect(editor(page)).toHaveValue(/Beta Study/);
  });

  test("URL mirroring preserves unrelated query params", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL, "?keep=yes");

    await sideRow(page, A).click();
    await expect(editor(page)).toHaveValue(/Alpha Study/);
    const url = new URL(page.url());
    expect(url.searchParams.get("keep")).toBe("yes");
    expect(url.searchParams.get("id")).toBeTruthy();
  });

  test("an unknown ?id= falls back predictably instead of blanking the editor", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Editor state is viewport-independent.");
    await openScripts(page, testInfo, baseURL, "?id=does-not-exist");
    // The first script, not an empty editor and not a crash…
    await expect(editor(page)).toHaveValue(/Study/);
    // …and the dangling id is REPAIRED rather than left naming nothing, so the URL never lies about
    // which script is on screen.
    await expect.poll(() => new URL(page.url()).searchParams.get("id")).not.toBe("does-not-exist");
  });
});
