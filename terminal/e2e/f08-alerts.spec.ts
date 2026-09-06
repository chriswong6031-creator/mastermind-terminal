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

const dataState = (page: Page, name: string) => page.locator(`[data-alerts-state="${name}"]`).first();

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
    // Production shape: the evaluator (ingest/alerts_engine.py Supa.fire) stamps `triggered` as
    // an object, never a bare boolean — this fixture must exercise that real shape (blocker 1).
    alerts: [{ id: "a1", symbol: "NVDA", active: false, created_at: "2026-08-01T00:00:00Z", condition: { type: "price", triggered: { at: "2026-09-05T09:41:00Z", value: 100, note: "crossed" } } }],
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
  await expect(page.getByText("尚无记录").first()).toBeVisible();
});

test("a zero-alert user gets calm copy, never 'cannot read'", async ({ page }) => {
  // Blocker: a successful read with zero rows (READ_OK_ZERO) is a count of 0, not an unknown —
  // this must render the calm "you are not watching anything yet" copy, never "cannot read".
  await setLang(page, "en");
  await installFixtures(page, {
    alerts: [], run: { lane: "alerts_engine", run_id: "r1", started_at: new Date().toISOString(), concluded_at: new Date().toISOString(), outcome: "success", lane_cadence_budget_s: 300 },
    runsState: "READ_OK", lastSuccessAt: new Date().toISOString(),
  });
  await page.goto("/alerts");
  await expect(page.locator('[data-monitor-state="watching"]')).toBeVisible({ timeout: 45_000 });
  await expect(dataState(page, "calm-empty")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("You are not watching anything yet.")).toBeVisible();
  await expect(page.getByText("cannot read")).toHaveCount(0);
});

test("create an alert through the real form, see it in the list, and delete it", async ({ page }) => {
  // Blocker: the create/manage surface must actually work end-to-end on the composed page —
  // the cockpit's inline create form is a SEPARATE component instance from the existing-alerts
  // management panel below it, so this also proves the cross-instance refresh (major: "see it
  // in the list" required a manual reload without it).
  await setLang(page, "en");
  let stored: Array<{ id: string; symbol: string; active: boolean; created_at: string; condition: unknown }> = [];
  await page.route("**/data/manifest.json**", (route) => route.fulfill({ json: MANIFEST }));
  await page.route("**/api/alerts", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      const created = { id: "created-1", symbol: body.symbol, active: true, created_at: new Date().toISOString(), condition: body.condition };
      stored = [created, ...stored];
      return route.fulfill({ json: { alert: created } });
    }
    if (req.method() === "DELETE") {
      const id = new URL(req.url()).searchParams.get("id");
      stored = stored.filter((a) => a.id !== id);
      return route.fulfill({ json: { ok: true, deleted: true } });
    }
    return route.fulfill({ json: { alerts: stored } });
  });
  await page.route("**/api/alerts/receipts", async (route) => route.fulfill({
    json: { run: null, runs_state: "READ_OK_ZERO", last_success_at: null, outbox: [], outbox_state: "READ_OK_ZERO" },
  }));
  await page.goto("/alerts");

  // Step 1: starts with none — the existing-alerts panel's own honest empty copy.
  await expect(page.getByText("No alerts yet", { exact: false })).toBeVisible({ timeout: 45_000 });

  // Step 2: create through the REAL form (default symbol NVDA, default condition needs no
  // value field) — never a direct API call standing in for the UI.
  await page.getByRole("button", { name: "Create alert" }).click();

  // Step 3: see it in the list (the separate management-panel instance), with visible text.
  const row = page.locator(".arow", { hasText: "NVDA" });
  await expect(row).toBeVisible({ timeout: 45_000 });
  await expect(row.getByText("Golden Oracle flips to BUY")).toBeVisible();

  // Step 4: delete it (two-step confirm), asserting the visible confirmation prompt too.
  await row.locator(".icbtn").click();
  await expect(row.getByText("Delete this alert?", { exact: false })).toBeVisible({ timeout: 45_000 });
  await row.locator(".arow-confirm .btn-danger").click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("No alerts yet", { exact: false })).toBeVisible({ timeout: 45_000 });
});

// --- Visual evidence crops (spec §9) -------------------------------------------------
// Deterministic fixture-driven crops for the PR body evidence matrix. Dark theme only
// (the shell has no light branch yet — see spec §6/§9). Run selectively:
//   npx playwright test e2e/f08-alerts.spec.ts -g "crop:"
const PROOF_DIR = "e2e/proof/f08-alerts";

const WATCHING_ALERT = {
  id: "a0", symbol: "NVDA", active: true, created_at: "2026-08-01T00:00:00Z",
  condition: { type: "price" },
};
const FIRED_ALERT = {
  id: "a1", symbol: "NVDA", active: false, created_at: "2026-08-01T00:00:00Z",
  // Production shape (see the "fired alert" test above) — never the bare-boolean shape alone.
  condition: { type: "price", triggered: { at: "2026-09-05T09:41:00Z", value: 100, note: "crossed" } },
};
const SENT_OUTBOX = [{
  alert_id: "a1", fire_event_id: "f1", status: "sent", attempts: 1, last_error: null,
  deliver_after: null, delivered_at: "2026-09-05T09:41:00Z", created_at: "2026-08-01T00:00:00Z",
  payload: {
    subject: "NVDA crossed your price line", summary_plain: "NVDA crossed your price line.",
    ticker: "NVDA", condition_plain: "Crossed your price line",
    evidence_url: "https://example.com/evidence/f1", fired_at: "2026-09-05T09:41:00Z",
  },
}];
const FRESH_RUN = {
  lane: "alerts_engine", run_id: "r1", started_at: new Date().toISOString(),
  concluded_at: new Date().toISOString(), outcome: "success", lane_cadence_budget_s: 300,
};
const STALE_RUN = {
  lane: "alerts_engine", run_id: "r0", started_at: "2020-01-01T00:00:00Z",
  concluded_at: "2020-01-01T00:05:00Z", outcome: "success", lane_cadence_budget_s: 300,
};

async function crop(page: Page, width: number, name: string) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  // Full-page, not viewport-only: the evidence matrix must show the cockpit AND the existing
  // management panel (pause/re-arm/delete affordances) below it — a viewport crop leaves the
  // management panel "below the frame" and unproven (blocker: zero visual evidence of it).
  await page.screenshot({ path: `${PROOF_DIR}/${name}.png`, fullPage: true });
}

for (const vp of [1440, 390] as const) {
  test(`crop: ${vp}-en-calm`, async ({ page }) => {
    // Blocker 2: calm is the watching-with-no-recent-fire state, distinct from the
    // fired-and-delivered state below — two crops from one fixture were the same PNG.
    await setLang(page, "en");
    await installFixtures(page, {
      alerts: [WATCHING_ALERT], run: FRESH_RUN, runsState: "READ_OK",
      lastSuccessAt: FRESH_RUN.concluded_at, outbox: [], outboxState: "READ_OK_ZERO",
    });
    await page.setViewportSize({ width: vp, height: vp === 390 ? 844 : 900 });
    await page.goto("/alerts");
    await expect(page.locator('[data-monitor-state="watching"]')).toBeVisible({ timeout: 45_000 });
    await crop(page, vp, `${vp}-en-calm`);
  });

  test(`crop: ${vp}-en-fired-delivery`, async ({ page }) => {
    await setLang(page, "en");
    await installFixtures(page, {
      alerts: [FIRED_ALERT], run: FRESH_RUN, runsState: "READ_OK",
      lastSuccessAt: FRESH_RUN.concluded_at, outbox: SENT_OUTBOX, outboxState: "READ_OK",
    });
    await page.setViewportSize({ width: vp, height: vp === 390 ? 844 : 900 });
    await page.goto("/alerts");
    await expect(page.locator('[data-monitor-state="watching"]')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-delivery="sent"]').first()).toBeVisible();
    await crop(page, vp, `${vp}-en-fired-delivery`);
  });

  test(`crop: ${vp}-en-degraded`, async ({ page }) => {
    await setLang(page, "en");
    await installFixtures(page, {
      alerts: [], run: STALE_RUN, runsState: "READ_OK", lastSuccessAt: STALE_RUN.concluded_at,
    });
    await page.setViewportSize({ width: vp, height: vp === 390 ? 844 : 900 });
    await page.goto("/alerts");
    await expect(page.locator('[data-monitor-state="degraded"]')).toBeVisible({ timeout: 45_000 });
    await crop(page, vp, `${vp}-en-degraded`);
  });

  test(`crop: ${vp}-en-drillback`, async ({ page }) => {
    await setLang(page, "en");
    await installFixtures(page, {
      alerts: [FIRED_ALERT], run: FRESH_RUN, runsState: "READ_OK",
      lastSuccessAt: FRESH_RUN.concluded_at, outbox: SENT_OUTBOX, outboxState: "READ_OK",
    });
    await page.setViewportSize({ width: vp, height: vp === 390 ? 844 : 900 });
    await page.goto("/alerts");
    await page.locator('[data-delivery="sent"]').first().click();
    await expect(page.locator('[data-alerts-state="drillback"]')).toBeVisible({ timeout: 45_000 });
    await crop(page, vp, `${vp}-en-drillback`);
  });

  test(`crop: ${vp}-zh-calm`, async ({ page }) => {
    await setLang(page, "zh");
    await installFixtures(page, {
      alerts: [FIRED_ALERT], run: FRESH_RUN, runsState: "READ_OK",
      lastSuccessAt: FRESH_RUN.concluded_at, outbox: SENT_OUTBOX, outboxState: "READ_OK",
    });
    await page.setViewportSize({ width: vp, height: vp === 390 ? 844 : 900 });
    await page.goto("/alerts");
    await expect(page.locator('[data-monitor-state="watching"]')).toBeVisible({ timeout: 45_000 });
    await crop(page, vp, `${vp}-zh-calm`);
  });

  test(`crop: ${vp}-zh-degraded`, async ({ page }) => {
    await setLang(page, "zh");
    await installFixtures(page, {
      alerts: [], run: STALE_RUN, runsState: "READ_OK", lastSuccessAt: STALE_RUN.concluded_at,
    });
    await page.setViewportSize({ width: vp, height: vp === 390 ? 844 : 900 });
    await page.goto("/alerts");
    await expect(page.locator('[data-monitor-state="degraded"]')).toBeVisible({ timeout: 45_000 });
    await crop(page, vp, `${vp}-zh-degraded`);
  });

  if (vp === 1440) {
    test(`crop: ${vp}-zh-drillback`, async ({ page }) => {
      await setLang(page, "zh");
      await installFixtures(page, {
        alerts: [FIRED_ALERT], run: FRESH_RUN, runsState: "READ_OK",
        lastSuccessAt: FRESH_RUN.concluded_at, outbox: SENT_OUTBOX, outboxState: "READ_OK",
      });
      await page.setViewportSize({ width: vp, height: 900 });
      await page.goto("/alerts");
      await page.locator('[data-delivery="sent"]').first().click();
      await expect(page.locator('[data-alerts-state="drillback"]')).toBeVisible({ timeout: 45_000 });
      await crop(page, vp, `${vp}-zh-drillback`);
    });

    test(`crop: ${vp}-en-calm-empty`, async ({ page }) => {
      await setLang(page, "en");
      await installFixtures(page, {
        alerts: [], run: FRESH_RUN, runsState: "READ_OK", lastSuccessAt: FRESH_RUN.concluded_at,
      });
      await page.setViewportSize({ width: vp, height: 900 });
      await page.goto("/alerts");
      await expect(page.locator('[data-alerts-state="calm-empty"]').first()).toBeVisible({ timeout: 45_000 });
      await crop(page, vp, `${vp}-en-calm-empty`);
    });

    test(`crop: ${vp}-en-no-coverage`, async ({ page }) => {
      await setLang(page, "en");
      await installFixtures(page, {
        alerts: [], run: { ...FRESH_RUN, unevaluable_n: 2 }, runsState: "READ_OK",
        lastSuccessAt: FRESH_RUN.concluded_at,
      });
      await page.setViewportSize({ width: vp, height: 900 });
      await page.goto("/alerts");
      await expect(page.locator('[data-alerts-state="no-coverage"]').first()).toBeVisible({ timeout: 45_000 });
      await crop(page, vp, `${vp}-en-no-coverage`);
    });

    test(`crop: ${vp}-en-unavailable`, async ({ page }) => {
      await setLang(page, "en");
      await installFixtures(page, { alertsStatus: 503, runsState: "READ_UNAVAILABLE" });
      await page.setViewportSize({ width: vp, height: 900 });
      await page.goto("/alerts");
      await expect(page.locator('[data-alerts-state="unavailable"]').first()).toBeVisible({ timeout: 45_000 });
      await crop(page, vp, `${vp}-en-unavailable`);
    });
  }
}
