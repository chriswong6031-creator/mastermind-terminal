// appShellAnalysisZIndex.test.ts — review ruling (PR #490, MAJOR item 3): the raised
// `.mobilebar` z-index that keeps the mobile "Menu" hamburger hit-testable above the
// Company Intelligence full-screen overlay must be SCOPED to the Analysis workspace, not a
// global chrome change — `.mobilebar` is the shared top bar for every AppShell route
// (Discover/Options/Scripts/Alerts/Portfolio/Admin), and only /analysis can render the
// colliding `.fin-pane--workspace` overlay (components/workspaces/AnalysisWorkspace.tsx).
//
// Source-scan style (matches lib/__tests__/suiteAlerts.test.ts): this repo has no React
// render-test harness for components/, so markup contracts are pinned by reading the real
// files, the same way the app ships them. The z-index/offset CSS contract below (review
// round-4, MAJOR 1) is instead parsed through a real CSS engine — see that describe block's
// header comment for why a text regex over the source was rejected.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { JSDOM } from "jsdom";

const GLOBALS_CSS = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
const FIN_CSS = readFileSync(join(__dirname, "..", "..", "app", "fin.css"), "utf8");
const OBSERVATORY_CSS = readFileSync(join(__dirname, "..", "..", "app", "observatory.css"), "utf8");
const COMPANY_INTEL_CSS = readFileSync(join(__dirname, "..", "..", "app", "company-intelligence.css"), "utf8");
const APP_SHELL_TSX = readFileSync(join(__dirname, "..", "..", "components", "chrome", "AppShell.tsx"), "utf8");

// ── real-CSSOM helpers (review round-4, MAJOR 1 measurement fix) ──
// jsdom's `document.styleSheets` runs the actual browser CSS parser — it is immune to the
// whitespace/comment/rule-reordering that breaks a text regex, and every value read below
// comes from the parsed `CSSStyleDeclaration` (the same interface `getComputedStyle` returns),
// not from scraping source text. jsdom does not evaluate `@media` against a real viewport for
// `getComputedStyle` (verified: no headless-browser support in this environment, and the
// house rule for this PR forbids running Playwright locally), so this reads the parsed media
// condition's own `max-width` value and reasons about applicability explicitly instead of
// pretending a fake viewport size — a narrower but honest substitute for the Playwright
// measurement this pass could not run locally.
interface FlatRule {
  selectorText: string;
  style: CSSStyleDeclaration;
  mediaConditions: string[];
}

function parseStylesheet(css: string): CSSRule[] {
  // `@import url(tailwindcss)` has no base URL to resolve against in a bare jsdom document;
  // jsdom reports that as an async console error but does not stop parsing the rest of the
  // sheet (verified against the real file). Stripped here since this test never needs it.
  const withoutImports = css.replace(/@import[^;]+;/g, "");
  const dom = new JSDOM(`<!doctype html><html><head><style>${withoutImports}</style></head><body></body></html>`);
  const sheet = dom.window.document.styleSheets[0];
  return sheet ? Array.from(sheet.cssRules) : [];
}

function flattenRules(rules: CSSRule[], mediaConditions: string[] = []): FlatRule[] {
  const out: FlatRule[] = [];
  for (const rule of rules) {
    if (rule.constructor.name === "CSSMediaRule") {
      const mediaRule = rule as unknown as { conditionText?: string; media: { mediaText: string }; cssRules: CSSRule[] };
      const condition = mediaRule.conditionText || mediaRule.media.mediaText;
      out.push(...flattenRules(Array.from(mediaRule.cssRules), [...mediaConditions, condition]));
    } else if (rule.constructor.name === "CSSStyleRule") {
      const styleRule = rule as unknown as { selectorText: string; style: CSSStyleDeclaration };
      out.push({ selectorText: styleRule.selectorText, style: styleRule.style, mediaConditions });
    }
  }
  return out;
}

/** The smallest `max-width:Npx` breakpoint named across a rule's media conditions, or null. */
function maxWidthPx(mediaConditions: string[]): number | null {
  let smallest: number | null = null;
  for (const condition of mediaConditions) {
    const match = condition.match(/max-width:\s*(\d+)px/);
    if (match) {
      const value = Number(match[1]);
      if (smallest === null || value < smallest) smallest = value;
    }
  }
  return smallest;
}

const GLOBALS_RULES = flattenRules(parseStylesheet(GLOBALS_CSS));
const FIN_RULES = flattenRules(parseStylesheet(FIN_CSS));
const OBSERVATORY_RULES = flattenRules(parseStylesheet(OBSERVATORY_CSS));
const ALL_RULES = [...GLOBALS_RULES, ...FIN_RULES];

/**
 * Minimal CSS specificity calculator for the plain selectors this file compares (no attribute
 * selectors, no pseudo-elements beyond `::before`/`::after`, no `:is()`/`:where()`). Returns
 * [id-count, class/attr/pseudo-class-count, element/pseudo-element-count] the same way the CSS
 * cascade spec defines it, so two selectors' priority can be compared directly instead of
 * guessed at from reading the source.
 */
function specificity(selector: string): [number, number, number] {
  let ids = 0, classes = 0, elements = 0;
  for (const part of selector.split(/\s+|>|\+|~/).filter(Boolean)) {
    for (const token of part.match(/(#[\w-]+)|(\.[\w-]+)|(:{1,2}[\w-]+)|(^\*$)|([a-zA-Z][\w-]*)/g) || []) {
      if (token.startsWith("#")) ids++;
      else if (token.startsWith(".") || token.startsWith(":")) classes++;
      else if (token !== "*") elements++;
    }
  }
  return [ids, classes, elements];
}

function higherOrEqual(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true; // exactly equal
}

describe("AppShell analysis-only mobilebar z-index scoping", () => {
  it("keeps the shared .mobilebar rule at its historical z-index (every non-analysis route)", () => {
    const baseRule = GLOBALS_RULES.find((r) => r.selectorText === ".mobilebar" && r.mediaConditions.length === 0);
    expect(baseRule, ".mobilebar base rule not found in globals.css").toBeTruthy();
    expect(baseRule!.style.getPropertyValue("z-index")).toBe("30");
  });

  it("raises .mobilebar above .fin-pane's overlay (z-index:90) ONLY inside .analysis-route", () => {
    const scopedRule = GLOBALS_RULES.find((r) => r.selectorText === ".analysis-route .mobilebar");
    expect(scopedRule, ".analysis-route .mobilebar rule not found in globals.css").toBeTruthy();
    expect(scopedRule!.style.getPropertyValue("z-index")).toBe("95");
  });

  it("AppShell applies the analysis-route class only when the route is /analysis", () => {
    // Review round 3, minor 3: the previous assertion pinned the exact template-literal source
    // (backtick spacing, quote style, ternary formatting) rather than the behavior it exists to
    // guard — an equivalent refactor of the same logic would fail it for no functional reason.
    // Assert the three facts that actually matter instead: the app2 root's className is a
    // template literal, it can contain "analysis-route", and that inclusion is gated on
    // `path.startsWith("/analysis")` — however the expression around it is formatted.
    const rootClassName = APP_SHELL_TSX.match(/className=\{`[^`]*app2[^`]*`\}/);
    expect(rootClassName, "app2 root className template literal not found in AppShell.tsx").not.toBeNull();
    expect(rootClassName![0]).toContain("analysis-route");
    expect(rootClassName![0]).toMatch(/path\.startsWith\(\s*["']\/analysis["']\s*\)/);
  });
});

describe("AppShell analysis-only fin-pane offset, parsed via real CSSOM (review round 3 MAJOR 1, round-4 measurement fix)", () => {
  // Raising .mobilebar to z-index:95 (above) stopped it from being covered by .fin-pane's
  // z-index:90 overlay, but at <=860px .fin-pane--workspace falls back to .fin-pane's base
  // inset:0 (app/fin.css), so the pane's OWN header now painted directly under the mobilebar
  // instead of being covered by it. Fix: push the pane down by the mobilebar's own height so
  // the two never share the same strip of the viewport, independent of z-index.
  //
  // Round-4 review: the round-3 version of this test matched a hand-written text regex
  // against the raw CSS source — it could not detect a cascade/specificity/media-application
  // problem, only whether two numbers written as source text happened to be equal. This
  // version reads the values through jsdom's real CSS parser (document.styleSheets), the same
  // CSSStyleDeclaration interface getComputedStyle exposes, and reasons explicitly about which
  // rules apply at <=860px via each rule's own parsed media condition.
  it("offsets .analysis-route .fin-pane--workspace by exactly .mobilebar's real height, scoped to <=860px", () => {
    const mobilebarBase = GLOBALS_RULES.find((r) => r.selectorText === ".mobilebar" && r.mediaConditions.length === 0);
    expect(mobilebarBase, ".mobilebar base rule not found in globals.css").toBeTruthy();
    const mobilebarHeight = mobilebarBase!.style.getPropertyValue("height");
    expect(mobilebarHeight, ".mobilebar has no height declaration").toMatch(/^\d+px$/);

    const offsetRule = ALL_RULES.find(
      (r) => r.selectorText === ".analysis-route .fin-pane--workspace" && r.style.getPropertyValue("top"),
    );
    expect(
      offsetRule,
      "no '.analysis-route .fin-pane--workspace{top:...}' rule found in globals.css or fin.css",
    ).toBeTruthy();

    const breakpoint = maxWidthPx(offsetRule!.mediaConditions);
    expect(breakpoint, `offset rule's media condition ${JSON.stringify(offsetRule!.mediaConditions)} names no max-width`).not.toBeNull();
    expect(breakpoint).toBeLessThanOrEqual(860);

    expect(offsetRule!.style.getPropertyValue("top")).toBe(mobilebarHeight);
  });

  it("does not give .fin-pane--workspace a top offset outside .analysis-route, in EITHER stylesheet", () => {
    // Review round-4, minor: the round-3 version of this guard scanned only globals.css, but
    // every OTHER `.fin-pane--workspace` declaration (the >860px desktop override) actually
    // lives in app/fin.css — so it could never fail for the reason it claimed to guard against.
    // Scanning the parsed rules from both files closes that hole.
    const unscopedOffsets = ALL_RULES.filter(
      (r) =>
        /(^|[^-\w])\.fin-pane--workspace($|[^-\w])/.test(r.selectorText) &&
        !r.selectorText.includes(".analysis-route") &&
        r.style.getPropertyValue("top"),
    );
    expect(unscopedOffsets.map((r) => r.selectorText)).toEqual([]);
  });

  // Review round-4 minor: the 52px offset is a flat literal, not `calc(52px + env(safe-area-inset-top))`
  // — deliberately, not by oversight. `.mobilebar` also gets `padding-top:env(safe-area-inset-top)`
  // on this same breakpoint, but under global `box-sizing:border-box` (asserted below) padding is
  // absorbed INSIDE the declared `height`, so `.mobilebar`'s real on-screen height stays exactly its
  // declared height regardless of the device's safe-area inset — adding the inset again to the pane
  // offset would OVER-space the two elements. This pins the assumption so a change to global
  // box-sizing (the one thing that would make it wrong) fails a test instead of silently reopening
  // a gap or overlap on notched devices.
  it("relies on global border-box sizing so the offset stays exact even with .mobilebar's safe-area padding-top", () => {
    const universalBorderBox = GLOBALS_RULES.find(
      (r) => r.selectorText === "*" && r.style.getPropertyValue("box-sizing") === "border-box",
    );
    expect(
      universalBorderBox,
      "global '*{box-sizing:border-box}' rule not found — the fin-pane offset assumes .mobilebar's safe-area padding-top is absorbed inside its declared height, not added on top of it",
    ).toBeTruthy();
  });
});

describe(".analysis-route .mobilebar really outranks the ambient-background reset", () => {
  // The round-5/6 real-browser measurement (terminal/e2e/tools/measure-analysis-mobilebar-
  // stacking.mjs, artifacts in terminal/e2e/proof/mobilebar-stacking/) recorded `.mobilebar`'s
  // BEFORE (origin/master) computed z-index as 1, not the 30 its own base rule above declares.
  // That is real: app/observatory.css's `.obs-ambient > *{z-index:1}` resets every direct child
  // of the ambient wrapper, ties `.mobilebar`'s specificity exactly, and wins on source order —
  // a rule a plain `grep mobilebar` search can never find, since its selector text never
  // contains that string. This pins the two CSS facts that make the whole chain true, so a
  // future edit that quietly breaks either one (rather than the z-index numbers a text regex
  // could still catch) fails here instead of only in a browser nobody happened to check.
  const obsAmbientChildReset = OBSERVATORY_RULES.find(
    (r) => r.selectorText === ".obs-ambient > *" && r.mediaConditions.length === 0,
  );

  it("app/observatory.css still declares the .obs-ambient > * z-index:1 reset this reasoning depends on", () => {
    expect(obsAmbientChildReset, ".obs-ambient > * rule not found in app/observatory.css").toBeTruthy();
    expect(obsAmbientChildReset!.style.getPropertyValue("z-index")).toBe("1");
  });

  it(".analysis-route .mobilebar's specificity beats .obs-ambient > * outright (wins regardless of source order)", () => {
    expect(obsAmbientChildReset).toBeTruthy();
    const scopedRule = GLOBALS_RULES.find((r) => r.selectorText === ".analysis-route .mobilebar");
    expect(scopedRule, ".analysis-route .mobilebar rule not found in globals.css").toBeTruthy();
    const scoped = specificity(scopedRule!.selectorText);
    const reset = specificity(obsAmbientChildReset!.selectorText);
    expect(
      higherOrEqual(scoped, reset) && JSON.stringify(scoped) !== JSON.stringify(reset),
      `.analysis-route .mobilebar specificity ${JSON.stringify(scoped)} must exceed .obs-ambient > * specificity ${JSON.stringify(reset)} — a tie or a loss would mean the analysis fix no longer reliably outranks the ambient reset`,
    ).toBe(true);
  });

  it("documents (does not merely assume) that bare .mobilebar ties .obs-ambient > * on specificity — that tie is exactly why origin/master's computed value is 1, not 30", () => {
    expect(obsAmbientChildReset).toBeTruthy();
    const baseRule = GLOBALS_RULES.find((r) => r.selectorText === ".mobilebar" && r.mediaConditions.length === 0);
    expect(baseRule).toBeTruthy();
    expect(specificity(baseRule!.selectorText)).toEqual(specificity(obsAmbientChildReset!.selectorText));
  });
});

// Reviewer BLOCKER: `Terminal typecheck + tests` failed at head 790b759c on a real desktop-
// width layout defect (`.ci-workspace`/`.ci-lenses` overlap in e2e/company-intelligence.spec.ts),
// and the reviewer separately flagged the committed 1440x900 before/after crop pair as showing
// an unexplained layout break (nav rail relocated, `.fin-pane--workspace` moved from a
// grid-column box to a full-width stacked box). Root cause for both: AppShell.tsx's outer
// `.app2` route wrapper reused the exact class name `analysis-shell`, which already belongs to
// AnalysisWorkspace's own INNER content wrapper (`main2 ws-shell analysis-shell`) and is scoped
// by app/company-intelligence.css's `.analysis-shell{display:flex;flex-direction:column;
// overflow:hidden}` — a rule meant for that one inner element. Both selectors tie on
// specificity (one class each), and because company-intelligence.css loads after this file in
// the page's CSS chunk order, its `display:flex` won and replaced `.app2`'s own
// `display:grid` (declared in this file: `.app2{display:grid;grid-template-columns:60px
// minmax(0,1fr);...}`) site-wide on /analysis — exactly the kind of layout break the crop pair
// showed, and a plausible cause of the sticky `.ci-lenses`/`.ci-workspace` geometry the CI spec
// checks (an `overflow:hidden` ancestor changes which element is the nearest scrolling ancestor
// a `position:sticky` descendant resolves against). Fixed by renaming the outer wrapper's route
// class to `analysis-route`, which cannot match company-intelligence.css's `.analysis-shell`
// selector. This block pins that fix with a real getComputedStyle cascade (not a string
// comparison) so a future rename back to `analysis-shell` — or any other name that happens to
// collide with a future company-intelligence.css single-class rule — fails here instead of
// only in a browser nobody happened to check.
describe("AppShell's outer .app2 route class does not collide with company-intelligence.css's own single-class rules", () => {
  it("AppShell's app2 root className literal is not (and does not contain as a bare token) 'analysis-shell'", () => {
    const rootClassName = APP_SHELL_TSX.match(/className=\{`[^`]*app2[^`]*`\}/);
    expect(rootClassName, "app2 root className template literal not found in AppShell.tsx").not.toBeNull();
    expect(rootClassName![0]).not.toMatch(/\banalysis-shell\b/);
  });

  it("real getComputedStyle: .app2.analysis-route keeps display:grid — company-intelligence.css's .analysis-shell{display:flex} rule does not match it", () => {
    const css = `${GLOBALS_CSS.replace(/@import[^;]+;/g, "")}\n${COMPANY_INTEL_CSS}`;
    const dom = new JSDOM(
      `<!doctype html><html><head><style>${css}</style></head><body><div id="t" class="app2 obs obs-ambient analysis-route"></div></body></html>`,
    );
    const el = dom.window.document.getElementById("t")!;
    const computed = dom.window.getComputedStyle(el);
    expect(computed.display).toBe("grid");
    expect(computed.overflow).not.toBe("hidden");
  });

  it("documents the collision this fix removes: the SAME markup with the old class name really did lose the grid (guards against a future revert)", () => {
    const css = `${GLOBALS_CSS.replace(/@import[^;]+;/g, "")}\n${COMPANY_INTEL_CSS}`;
    const dom = new JSDOM(
      `<!doctype html><html><head><style>${css}</style></head><body><div id="t" class="app2 obs obs-ambient analysis-shell"></div></body></html>`,
    );
    const el = dom.window.document.getElementById("t")!;
    const computed = dom.window.getComputedStyle(el);
    // This is the bug, reproduced directly: reusing "analysis-shell" on .app2 really does let
    // company-intelligence.css's inner-only rule override the shared grid layout.
    expect(computed.display).toBe("flex");
  });

  it("company-intelligence.css's .analysis-shell rule (scoped to AnalysisWorkspace's own inner wrapper) is unchanged — this fix moved the OUTER wrapper's class, not this rule", () => {
    const COMPANY_INTEL_RULES = flattenRules(parseStylesheet(COMPANY_INTEL_CSS));
    const rule = COMPANY_INTEL_RULES.find((r) => r.selectorText === ".analysis-shell");
    expect(rule, ".analysis-shell rule not found in app/company-intelligence.css").toBeTruthy();
    expect(rule!.style.getPropertyValue("display")).toBe("flex");
  });
});
