import { defineConfig } from "@playwright/test";

// Shared worktrees frequently run responsive suites in parallel. Allow each
// checkout to reserve its own port instead of silently reusing another tree's
// dev server (3108 remains the local/CI default).
const port = Number(process.env.TERMINAL_E2E_PORT || 3108);
const baseURL = `http://127.0.0.1:${port}`;
const companyIntelligenceSpec = /company-intelligence\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    // Keep the broad responsive suite fully parallel. The Company Intelligence
    // workspace has a cold Next route plus source fixtures and is intentionally
    // isolated below: twelve simultaneous cold starts have timed out locally
    // and in CI, while one viewport at a time is deterministic.
    { name: "desktop", testIgnore: companyIntelligenceSpec, use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", testIgnore: companyIntelligenceSpec, use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "mobile", testIgnore: companyIntelligenceSpec, use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    {
      name: "company-intelligence-desktop",
      testMatch: companyIntelligenceSpec,
      workers: 1,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "company-intelligence-tablet",
      testMatch: companyIntelligenceSpec,
      dependencies: ["company-intelligence-desktop"],
      workers: 1,
      use: { viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: "company-intelligence-mobile",
      testMatch: companyIntelligenceSpec,
      dependencies: ["company-intelligence-tablet"],
      workers: 1,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/terminal?symbol=NVDA`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // /analysis is normally member-gated. The page's local-only preview seam
      // keeps responsive visual tests focused on the workspace, not auth.
      ANALYSIS_LOCAL_PREVIEW: "1",
      TERMINAL_E2E_FIXTURE: "1",
      TERMINAL_E2E_EMAIL: "responsive@example.com",
      TERMINAL_E2E_ENTITLEMENT: "unlimited",
      FLOW_FIXTURE: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key",
    },
  },
});
