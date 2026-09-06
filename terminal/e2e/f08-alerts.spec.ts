import { expect, test, type Page } from "@playwright/test";

/**
 * B-F08-3 — deterministic, fixture-driven responsive spec for the /alerts cockpit.
 * No network dependency, no timing race: every wait is an expect(...).toBeVisible().
 * Pattern follows e2e/alerts-failure-states.spec.ts.
 */

test.setTimeout(90_000);

const MANIFEST = { symbols: { NVDA: { name: "NVIDIA", last: 182.5 } } };

async function setLang(page: Page, lang: "en" | "zh") {
  await page.addInitScript((l) => {
    localStorage.setItem("mm.lang", l);
    document.documentElement.setAttribute("data-lang", l);
  }, lang);
}

async function installFixtures(page: Page, opts: {
  alerts?: unknown[]; alertsStatus?: number;
  run?: unknown; runsState?: string; lastSuccessAt?: string | null;
  outbox?: unknown[]; outboxState?: string;
}) {
  await page.route("**/data/manifest.json**", (route) => route.fulfill({ json: MANIFEST }));
  await page.route("**/api/alerts", async (route) => {
    if (opts.alertsStatus && opts.alertsStatus !== 200) {
      return route.fulfill({ status: opts.alertsStatus, json: { error: "alerts unavailable" } });
    }
    return route.fulfill({ json: { alerts: opts.alerts ?? [] } });
  });
  await page.route("**/api/alerts/receipts", async (route) => route.fulfill({
    json: {
      run: opts.run ?? null,
      runs_state: opts.runsState ?? "READ_OK_ZERO",
      last_success_at: opts.lastSuccessAt ?? null,
      outbox: opts.outbox ?? [],
      outbox_state: opts.outboxState ?? "READ_OK_ZERO",
    },
  }));
}

const dataState = (page: Page, name: string) => page.locator(`[data-alerts-state="${name}"]`);

test("calm requires a recent successful run receipt", async ({ page }) => {
  await setLang(page, "en");
  await installFixtures(page, {
    alerts: [],
    run: { lane: "alerts_engine", run_id: "r1", started_at: new Date().toISOString(), concluded_at: new Date().toISOString(), outcome: "success", lane_cadence_budget_s: 300 },
    runsState: "READ_OK",
    lastSuccessAt: new Date().toISOString(),
  });
  await page.goto("/alerts");
  await expect(page.locator('[data-monitor-state="watching"]')).toBeVisible({ timeout: 45_000 });
});

test("monitoring degraded when the evaluator is stopped", async ({ page }) => {
  await setLang(page, "en");
  await installFixtures(page, {
    alerts: [],
    run: { lane: "alerts_engine", run_id: "r1", started_at: "2020-01-01T00:00:00Z", concluded_at: "2020-01-01T00:05:00Z", outcome: "success", lane_cadence_budget_s: 300 },
    runsState: "READ_OK",
    lastSuccessAt: "2020-01-01T00:05:00Z",
  });
  await page.goto("/alerts");
  await expect(page.locator('[data-monitor-state="degraded"]')).toBeVisible({ timeout: 45_000 });
});

test("outage state renders unavailable, never a lie about zero", async ({ page }) => {
  await setLang(page, "en");
  await installFixtures(page, { alertsStatus: 503, runsState: "READ_UNAVAILABLE" });
  await page.goto("/alerts");
  await expect(dataState(page, "unavailable")).toBeVisible({ timeout: 45_000 });
});

test("fired alert with no outbox row renders pending, never delivered", async ({ page }) => {
  await setLang(page, "en");
  await installFixtures(page, {
    alerts: [{ id: "a1", symbol: "NVDA", active: false, created_at: "2026-08-01T00:00:00Z", condition: { type: "price", triggered: true } }],
    run: { lane: "alerts_engine", run_id: "r1", started_at: new Date().toISOString(), concluded_at: new Date().toISOString(), outcome: "success", lane_cadence_budget_s: 300 },
    runsState: "READ_OK", lastSuccessAt: new Date().toISOString(), outbox: [], outboxState: "READ_OK_ZERO",
  });
  await page.goto("/alerts");
  await expect(page.locator('[data-delivery="pending"]').first()).toBeVisible({ timeout: 45_000 });
});

test("ZH language renders ZH monitor copy", async ({ page }) => {
  await setLang(page, "zh");
  await installFixtures(page, { alerts: [], runsState: "READ_OK_ZERO" });
  await page.goto("/alerts");
  await expect(page.locator('[data-monitor-state="never_ran"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("尚无记录")).toBeVisible();
});
