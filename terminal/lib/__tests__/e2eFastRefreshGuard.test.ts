import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ── THE TWO ONE-LINE BYPASSES THAT PUT THE FLAKE BACK ─────────────────────────────────────────
//
// e2e/fixtures.ts withholds `next dev`'s no-op build broadcasts, without which the dev server
// re-renders whichever page another worker is mid-gesture on — the cause of the rotating CI
// failures diagnosed on 2026-08-21 (the full account, and the measurements, are in that file).
// e2e/warmup.setup.ts compiles the suite's surfaces up front so no test waits out a cold build.
//
// Both are opt-in, and both fail OPEN — which is why they are pinned here rather than left to
// review. A spec written with `import { test } from "@playwright/test"` compiles, runs, and passes
// locally against a warm server; it has simply opted that one file back into the flake, and the
// next slow CI run picks it as the victim. A route the specs reach but the warm-up misses is built
// mid-run instead of up front. Playwright has no global beforeEach to enforce the import from, so
// `npm test` enforces it — seconds after a spec is written, and long before the responsive job.

const E2E = path.resolve(__dirname, "..", "..", "e2e");
const specs = readdirSync(E2E).filter((f) => f.endsWith(".spec.ts"));
const source = (f: string) => readFileSync(path.join(E2E, f), "utf8");
const warmup = readFileSync(path.join(E2E, "warmup.setup.ts"), "utf8");
const config = readFileSync(path.resolve(__dirname, "..", "..", "playwright.config.ts"), "utf8");

// Top-level `import … from "…"` only. Inline `import("@playwright/test").Page` type positions are
// left alone deliberately: they name a type, they never produce a runtime fixture.
const importsFrom = (src: string, mod: string) =>
  new RegExp(String.raw`^import[^;]*?from "${mod}"`, "m").test(src);

describe("responsive e2e specs run against a pre-compiled dev server", () => {
  it("finds the specs (a rename must not turn this guard into a no-op)", () => {
    expect(specs.length).toBeGreaterThan(40);
  });

  it("takes `test` from e2e/fixtures.ts in every spec", () => {
    const missing = specs.filter((f) => !importsFrom(source(f), String.raw`\./fixtures`));
    expect(missing).toEqual([]);
  });

  it("leaves no spec importing the raw Playwright fixture", () => {
    const raw = specs.filter((f) => importsFrom(source(f), "@playwright/test"));
    expect(raw).toEqual([]);
  });

  it("warms every route the specs navigate to", () => {
    // The specs are the authority on what has to be warm. Anything they `goto` that the warm-up
    // does not visit is compiled mid-run — which is the defect this all exists to remove.
    const visited = new Set<string>();
    for (const file of specs) {
      // The whole path, not just its first segment: /embed/chart and /embed are different routes
      // and only one of them compiles the chart the specs assert on.
      for (const [, route] of source(file).matchAll(/goto\(\s*[`"](\/[a-z][a-z0-9/-]*)/g)) visited.add(route);
    }
    expect(visited.size).toBeGreaterThan(4);
    expect([...visited].filter((route) => !warmup.includes(`"${route}`))).toEqual([]);
  });

  it("still routes the socket through the filter rather than around it", () => {
    // What the filter DOES is tested for real in e2eHmrFilter.test.ts. What cannot be tested there
    // is that it is still wired up — and that the socket still reaches the actual dev server, since
    // Turbopack delivers next/dynamic chunks over it and a blackholed socket leaves every lazily
    // mounted surface on its skeleton forever.
    const fixtures = readFileSync(path.join(E2E, "fixtures.ts"), "utf8");
    expect(fixtures).toContain(String.raw`routeWebSocket(/\/_next\/webpack-hmr/`);
    expect(fixtures).toContain("connectToServer()");
    expect(fixtures).toContain("createHmrFilter()");
  });

  it("keeps the warm-up ahead of every project that runs specs", () => {
    // A project without the dependency starts against a cold server, and its first tests are the
    // ones that pay for the compiles — in front of everyone else's open pages.
    const projects = [...config.matchAll(/name: "([a-z-]+)"/g)].map(([, name]) => name);
    const runsSpecs = projects.filter((name) => name !== "warmup");
    expect(runsSpecs.length).toBeGreaterThan(4);
    for (const name of runsSpecs) {
      const block = config.slice(config.indexOf(`name: "${name}"`));
      expect(block.slice(0, block.indexOf("}")), `project ${name}`).toContain("dependencies:");
    }
  });
});
