// THROWAWAY visual-evidence capture for packet B-F11-2 (research-management lens rail).
// Not part of the committed suite — produces the dark/EN+ZH/1440x390 crops named in the
// frozen spec §9. Deleted after crops are extracted; never merged. Run with:
//   npx playwright test e2e/_rms_crops.spec.ts --project=desktop --project=mobile
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isolateWatchlistStore } from "./watchlistStore";

const proofDir = path.join(process.cwd(), "e2e/proof/f11-rms");
mkdirSync(proofDir, { recursive: true });

async function prepare(page: Page, testInfo: TestInfo, baseURL: string | undefined, zh: boolean) {
  const storeKey = await isolateWatchlistStore(page, testInfo, baseURL);
  await page.addInitScript((useZh) => {
    localStorage.setItem("mm.lang", useZh ? "zh" : "en");
    document.documentElement?.setAttribute("data-lang", useZh ? "zh" : "en");
    document.documentElement?.setAttribute("lang", useZh ? "zh-CN" : "en");
  }, zh);
  return storeKey;
}

async function createThesis(page: Page, title: string, requestId: string, symbol: string, extra: Partial<{
  catalysts: string[]; risks: string[]; revisionNote: string | null;
}> = {}) {
  const response = await page.request.post("/api/theses", { data: {
    action: "create", clientRequestId: requestId,
    subject: {
      schema: "mastermind.thesis-subject-ref/v1", kind: "issuer", owner: "terminal.analysis_symbol",
      key: symbol, identityState: "listing_scoped", listing: { symbol, mic: null, securityId: null },
      companyId: null, display: `${symbol} · listing scoped`,
    },
    content: {
      schema: "mastermind.thesis-content/v1", title, statement: `${title} statement`,
      catalysts: extra.catalysts ?? [], falsifiers: [], risks: extra.risks ?? [],
      horizon: "unspecified", effectiveAt: null, revisionNote: extra.revisionNote ?? null,
    },
  } });
  expect(response.status()).toBe(201);
  return (await response.json()).thesisId as string;
}

function run(zh: boolean) {
  test(`rms lens rail crops ${zh ? "zh" : "en"}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const mobile = testInfo.project.name === "mobile";
    if (testInfo.project.name !== "desktop" && testInfo.project.name !== "mobile") { test.skip(); return; }
    await prepare(page, testInfo, baseURL, zh);

    await createThesis(page, "NVDA operating leverage", randomUUID(), "NVDA", { catalysts: ["Data-center revenue compounds", "Software mix expands"], risks: ["Customer concentration"], revisionNote: "Refined the mechanism." });
    await createThesis(page, "AMD share gain thesis", randomUUID(), "AMD", { catalysts: ["Server share gains"], risks: ["Pricing pressure"] });
    await createThesis(page, "TSM leadership", randomUUID(), "TSM");

    const shot = (name: string) => page.screenshot({ path: path.join(proofDir, `${zh ? "zh" : "en"}-${mobile ? "390" : "1440"}-${name}.png`), fullPage: false });

    await page.goto("/analysis?view=theses");
    await expect(page.getByTestId("thesis-workspace")).toBeVisible({ timeout: 20000 });
    if (mobile) await page.getByRole("button", { name: zh ? "全部标的" : "Back to list" }).click().catch(() => {});
    await expect(page.getByTestId("thesis-lens-rail")).toBeVisible();

    await page.getByTestId("thesis-lens-rail").getByRole("tab", { name: zh ? "全部论点" : "Theses" }).click();
    await shot("theses");

    if (!mobile) {
      await page.getByTestId("thesis-lens-rail").getByRole("tab", { name: zh ? "覆盖范围" : "Coverage" }).click();
      await shot("coverage");
    }

    const lineTab = mobile ? (zh ? "催化因素" : "Catalysts") : (zh ? "风险" : "Risks");
    await page.getByTestId("thesis-lens-rail").getByRole("tab", { name: lineTab }).click();
    await page.getByTestId("rms-lens-panel").locator("[data-testid='rms-line-row'], [data-testid='rms-scope']").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await shot(mobile ? "catalysts" : "risks");

    if (!mobile) {
      await page.getByTestId("thesis-lens-rail").getByRole("tab", { name: zh ? "修订记录" : "Notes" }).click();
      await page.waitForTimeout(500);
      await shot("notes");
      await expect(page.getByTestId("thesis-condition")).toBeVisible();
      await shot("condition-unavailable");
    } else {
      await page.getByTestId("thesis-lens-rail").getByRole("tab", { name: zh ? "值得复看" : "Worth a look" }).click();
      await page.waitForTimeout(500);
      await shot("reviews");
    }
  });
}
run(false);
run(true);

function runUnavailable(zh: boolean) {
  test(`rms store-unavailable crop ${zh ? "zh" : "en"}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    if (testInfo.project.name !== "mobile") { test.skip(); return; }
    await prepare(page, testInfo, baseURL, zh);
    await page.context().addCookies([{ name: "mm_e2e_fault", value: "theses_read", url: baseURL ?? "http://127.0.0.1:3108" }]);
    await page.goto("/analysis?view=theses");
    await expect(page.getByTestId("rms-unavailable")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(proofDir, `${zh ? "zh" : "en"}-390-unavailable.png`) });
  });
}
runUnavailable(false);
runUnavailable(true);
