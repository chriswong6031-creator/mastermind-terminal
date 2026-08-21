import { test as base } from "@playwright/test";
import { createHmrFilter } from "./hmrFilter";

/**
 * The suite's `test` — Playwright's, plus one thing: Fast Refresh cannot fire inside it.
 *
 * Not a spec file: Playwright's default testMatch only collects *.spec.ts, so this module is
 * imported, never run.
 *
 * ── WHY THE GATE WAS UNTRUSTWORTHY ───────────────────────────────────────────────────────────
 *
 * `webServer` runs `next dev`, and its dev server broadcasts a `building`/`built` pair to EVERY
 * connected page on essentially every request it serves — including requests that changed nothing.
 * Measured on 2026-08-21 against a WARM server: twelve tests produced 158 such pairs in 51
 * seconds, all carrying the same compilation hash and no errors. They are no-ops, but the page
 * does not know that: `built` drives handleHotUpdate(), so each pair re-renders the tree and
 * refetches the RSC payload of whatever page happens to be open.
 *
 * In a fullyParallel run that means one worker's page traffic re-renders the page ANOTHER worker
 * is mid-gesture on. A re-render mid-interaction is not a slow UI, it is a DIFFERENT UI: server
 * props snap back to their initial values while client state (an open dialog, a drag in flight, a
 * chart's developing candle) survives, so the page reaches a combination no user can. That is what
 * the CI failures were. In run 32402339583 the Pine editor's D3a spec died with the "Unsaved
 * changes" scrim up while the textarea underneath held the CLEAN stored source; its trace shows
 * two rebuild cycles landing inside the test, and the click it was blocked on retried 57 times —
 * it would have failed at any timeout, because the state it needed had been destroyed rather than
 * delayed. Seven of the ten CI failure traces gathered that day carry the same mid-test rebuild,
 * and the victims rotate because the victim is whichever test is mid-gesture when another worker
 * loads a page.
 *
 * Nobody saw it locally because the failure needs two workers on one dev server and enough load to
 * widen the window; `reuseExistingServer: !CI` also means a developer's server has long since
 * compiled everything. Reproduced locally at CI's worker count on a cold cache: 2 failed, 1 flaky.
 *
 * ── WHAT THIS DOES, AND WHY NOT SOMETHING BLUNTER ────────────────────────────────────────────
 *
 * e2e/hmrFilter.ts withholds a `building`/`built` pair ONLY when nothing passed between the two —
 * exactly the no-op case, since such a pair has nothing for the page to apply. Measured: an idle
 * page saw 24 Fast Refresh cycles while another context browsed, and ZERO with this in place, on
 * both a warm and a cold server.
 *
 * The "only when nothing passed between them" part is not fastidiousness, it is the whole safety
 * argument, and it was learned twice. Blackholing the socket outright breaks the suite: the same
 * socket carries Turbopack's `turbopack-connected` / `turbopack-message` traffic, and without it
 * every next/dynamic surface — the Analysis workspace, the Options tabs — sits on its skeleton
 * forever. Withholding EVERY clean `built` breaks it more subtly, which is worse: a lazily-built
 * chunk arrives as `turbopack-message` and is applied when the following `built` lands, so
 * suppressing that `built` leaves the surface unmounted whenever the chunk was not already on
 * disk. That shipped for one CI run and turned the Pine editor's four specs into "the editor never
 * appeared" — green only because retries covered it.
 *
 * A `built` carrying errors or warnings is always forwarded, so a genuine compile failure reaches
 * the page and the overlay instead of turning into a mystery timeout.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.routeWebSocket(/\/_next\/webpack-hmr/, (ws) => {
      const server = ws.connectToServer();
      const filter = createHmrFilter();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        for (const frame of filter(message)) ws.send(frame);
      });
    });
    await use(context);
  },

  // The tripwire. The filter above is matched against a shape Next owns, so a Next upgrade could
  // rename these frames and hand the flake back silently — the perturbation leaves no trace in the
  // failure it causes, which is why it went undiagnosed for so long: you get "element not found",
  // or a count short by one, and nothing points at hot reload. If this annotation ever appears,
  // the filter has stopped matching. Do not reach for a timeout; fix the filter.
  page: async ({ page }, use, testInfo) => {
    let rebuilds = 0;
    page.on("console", (message) => {
      if (message.text().startsWith("[Fast Refresh] rebuilding")) rebuilds += 1;
    });
    await use(page);
    if (rebuilds > 0) {
      testInfo.annotations.push({
        type: "fast-refresh",
        description: `${rebuilds} rebuild(s) re-rendered this page mid-test — e2e/fixtures.ts is no longer withholding them`,
      });
    }
  },
});

// `expect`, `devices`, `Page`, `Locator`, `TestInfo` … re-exported unchanged. The explicit `test`
// above shadows the star-exported one, so a spec that imports from here cannot get the raw fixture
// by accident.
export * from "@playwright/test";
