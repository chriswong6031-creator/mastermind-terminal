// terminal/lib/__tests__/plainLanguageGuard.test.ts
//
// Vitest suite = CI host + fixtures + receipt printer for
// terminal/scripts/check_plain_language.mjs (packet B-PL-5).
//
// The suite SPAWNS the checker (execFileSync) rather than importing it —
// terminal/tsconfig.json does not include .mjs, so importing an untyped
// .mjs from a .ts suite under moduleResolution: "bundler" risks TS2307.
// Precedent for __dirname in these suites: terminal/lib/__tests__/plainLabelsCallSites.test.ts.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Defuses the checker's own `::error`/`::warning`/`::notice` GitHub
// workflow-command syntax before replaying it into THIS (successful)
// test's stdout. GitHub mints a run-level annotation from ANY
// `::error`/`::warning` line that starts a step's log, regardless of that
// step's own exit code (see this repo's own convention, "GitHub
// annotations must START the line") -- an unmodified replay of the
// checker's receipt (test 8 below) mints a phantom failing annotation
// naming a fixture path that does not exist in the repo, from a PASSING
// `npm test` step. Indenting each line defeats the "starts the line"
// requirement while keeping every character legible in the receipt.
function redactAnnotations(s: string): string {
  return s.replace(/^(::(?:error|warning|notice))/gm, "  $1");
}

const scriptPath = join(__dirname, "../../scripts/check_plain_language.mjs");

function run(args: string[], opts: { input?: string } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      input: opts.input,
    });
    return { status: 0, stdout };
  } catch (e: any) {
    return { status: e.status ?? 1, stdout: (e.stdout ?? "").toString() + (e.stderr ?? "").toString() };
  }
}

function makeFixtureRoot() {
  const root = mktempRoot();
  mkdirSync(join(root, "terminal/components"), { recursive: true });
  mkdirSync(join(root, "terminal/lib"), { recursive: true });
  return root;
}

function mktempRoot() {
  return mkdtempSync(join(tmpdir(), "plg-"));
}

function unifiedDiffFor(relPath: string, content: string, addedLineNumbers: number[]) {
  const lines = content.split("\n");
  const hunkStart = addedLineNumbers.length ? Math.min(...addedLineNumbers) : 1;
  const count = lines.length;
  let body = "";
  lines.forEach((l, i) => {
    const lineNo = i + 1;
    body += (addedLineNumbers.includes(lineNo) ? "+" : " ") + l + "\n";
  });
  return `diff --git a/${relPath} b/${relPath}\n--- a/${relPath}\n+++ b/${relPath}\n@@ -${hunkStart},0 +1,${count} @@\n${body}`;
}

describe("check_plain_language.mjs", () => {
  it("1. flags a synthetic bad string on added lines", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/Bad.tsx";
    const content = [
      "export function Bad({ row }: any) {",
      "  return (",
      "    <div>",
      "      <b>BOTTOM_WATCH</b>",
      "      <span>{row.regime}</span>",
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [4, 5]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);

    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(1);
    const jsonLine = res.stdout.trim().split("\n").pop()!;
    const parsed = JSON.parse(jsonLine);
    expect(parsed.counts.blocking).toBeGreaterThanOrEqual(2);
    for (const f of parsed.findings.filter((x: any) => x.blocking)) {
      expect(typeof f.path).toBe("string");
      expect(Number.isInteger(f.line)).toBe(true);
      expect(typeof f.rule).toBe("string");
      expect(f.suggestion).toBeTruthy();
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("2. passes a synthetic good string", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/Good.tsx";
    const content = [
      "export function Good({ row, t, lang }: any) {",
      "  return (",
      "    <div>",
      "      <span>{regimeLabel(t, row.regime, lang)}</span>",
      '      <span>{t("marketCalm")}</span>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [4, 5]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);

    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(0);
    const jsonLine = res.stdout.trim().split("\n").pop()!;
    const parsed = JSON.parse(jsonLine);
    expect(parsed.counts.blocking).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it("3. reports a legacy (untouched) offending line without failing the run", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/Legacy.tsx";
    const content = [
      "export function Legacy() {",
      "  return <div><b>BOTTOM_WATCH</b></div>;",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    // Diff touches the file (so it's scanned) but does NOT mark the offending line as added.
    const diff = unifiedDiffFor(relPath, content, [1]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);

    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("legacy (pre-existing, not blocking)");
    rmSync(root, { recursive: true, force: true });
  });

  it("3b. reports an offending line in a file the diff never touches at all (full census)", () => {
    const root = makeFixtureRoot();
    // Untouched.tsx never appears in the diff in any form — no +++ header,
    // no hunk. A scanner keyed off the diff's own touched-file list would
    // never open it, and would report zero legacy findings.
    const untouchedRelPath = "terminal/components/Untouched.tsx";
    const untouchedContent = [
      "export function Untouched() {",
      "  return <div><b>BOTTOM_WATCH</b></div>;",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, untouchedRelPath), untouchedContent);

    // The diff touches a completely different file.
    const otherRelPath = "terminal/components/Other.tsx";
    const otherContent = ["export function Other() {", "  return <div />;", "}", ""].join("\n");
    writeFileSync(join(root, otherRelPath), otherContent);
    const diff = unifiedDiffFor(otherRelPath, otherContent, [1]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);

    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    expect(parsed.scannedFiles).toBeGreaterThanOrEqual(2);
    const legacyHit = parsed.findings.find(
      (f: any) => f.path === untouchedRelPath && f.rule === "raw_state_enum" && !f.blocking
    );
    expect(legacyHit).toBeTruthy();
    rmSync(root, { recursive: true, force: true });
  });

  it("4. EN/ZH parity: missing zh in LEX entry and unrouted English literal both block", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/lib/i18n.tsx";
    const content = [
      "export const LEX: Record<string, [string, string]> = {",
      '  newThing: ["Market is calm"],',
      "};",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff1 = unifiedDiffFor(relPath, content, [2]);
    const diffFile1 = join(root, "diff1.patch");
    writeFileSync(diffFile1, diff1);
    const res1 = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile1, "--json"]);
    expect(res1.status).toBe(1);
    const parsed1 = JSON.parse(res1.stdout.trim().split("\n").pop()!);
    expect(parsed1.findings.some((f: any) => f.rule === "missing_zh" && f.blocking)).toBe(true);

    const relPath2 = "terminal/components/Literal.tsx";
    const content2 = ["export function L() {", "  return <h2>Market is calm today</h2>;", "}", ""].join("\n");
    writeFileSync(join(root, relPath2), content2);
    const diff2 = unifiedDiffFor(relPath2, content2, [2]);
    const diffFile2 = join(root, "diff2.patch");
    writeFileSync(diffFile2, diff2);
    const res2 = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile2, "--json"]);
    expect(res2.status).toBe(1);
    const parsed2 = JSON.parse(res2.stdout.trim().split("\n").pop()!);
    expect(parsed2.findings.some((f: any) => f.rule === "missing_zh" && f.blocking)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("5. --self-check proves each rule detects its own violation", () => {
    const root = makeFixtureRoot();
    const res = run(["--self-check", "--root", root]);
    expect(res.status).toBe(0);
    for (const rule of ["R1", "R2", "R3", "R4", "R5a", "R5b"]) {
      expect(res.stdout).toContain(`${rule} detected`);
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("6. unreadable --diff-file fails CLOSED", () => {
    const root = makeFixtureRoot();
    const res = run(["--root", root, "--diff-file", join(root, "does-not-exist.patch")]);
    expect(res.status).toBe(2);
    expect(res.stdout).toContain("::error title=plain-language::");
    rmSync(root, { recursive: true, force: true });
  });

  it("7. unresolvable base fails OPEN and discloses it", () => {
    const root = makeFixtureRoot();
    const res = run(["--root", root, "--since", "no/such/ref"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("::warning title=plain-language::");
    expect(res.stdout).toContain("nothing can block");
    rmSync(root, { recursive: true, force: true });
  });

  it("8. receipt printer: prints the checker's full human block for bad + legacy fixtures", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/Bad.tsx";
    const content = ["export function Bad() {", "  return <b>BOTTOM_WATCH</b>;", "}", ""].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [2]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile]);
    process.stdout.write("\n--- plain-language guard receipt: flagged fixture ---\n");
    process.stdout.write(redactAnnotations(res.stdout));
    process.stdout.write("\n--- end receipt ---\n");
    expect(res.stdout).toContain("BOTTOM_WATCH");

    const relPath2 = "terminal/components/Legacy2.tsx";
    const content2 = ["export function Legacy2() {", "  return <b>BOTTOM_WATCH</b>;", "}", ""].join("\n");
    writeFileSync(join(root, relPath2), content2);
    const diff2 = unifiedDiffFor(relPath2, content2, [1]);
    const diffFile2 = join(root, "diff2.patch");
    writeFileSync(diffFile2, diff2);
    const res2 = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile2]);
    process.stdout.write("\n--- plain-language guard receipt: legacy fixture ---\n");
    process.stdout.write(redactAnnotations(res2.stdout));
    process.stdout.write("\n--- end receipt ---\n");
    expect(res2.stdout).toContain("legacy (pre-existing, not blocking)");
    rmSync(root, { recursive: true, force: true });
  });

  it("10. a bare substring match on a helper name (.sort(/useEffect() does not defeat R3/R5b", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/Sneaky.tsx";
    const content = [
      "export function Sneaky({ rows }: any) {",
      "  return <div>{rows.sort((a: any, b: any) => a - b) && <h2>Market is calm today</h2>}</div>;",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [2]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    expect(parsed.counts.blocking).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true });

    const root2 = makeFixtureRoot();
    const relPath2 = "terminal/components/Sneaky2.tsx";
    const content2 = [
      "export function Sneaky2({ row }: any) {",
      "  return <div>{useEffect(() => {})}<span>{row.regime}</span></div>;",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root2, relPath2), content2);
    const diff2 = unifiedDiffFor(relPath2, content2, [2]);
    const diffFile2 = join(root2, "diff.patch");
    writeFileSync(diffFile2, diff2);
    const res2 = run(["--mode", "enforce-added", "--root", root2, "--diff-file", diffFile2, "--json"]);
    expect(res2.status).toBe(1);
    const parsed2 = JSON.parse(res2.stdout.trim().split("\n").pop()!);
    expect(parsed2.findings.some((f: any) => f.rule === "raw_slug_interpolation" && f.blocking)).toBe(true);
    rmSync(root2, { recursive: true, force: true });
  });

  it("11. AST visibility: `=>`, `<=`, and an enum comparison in code never fire raw_state_enum", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/CodeOnly.tsx";
    // Every line below was constructed to defeat the OLD `>[^<>]*<` substring
    // heuristic (an arrow function and a `<=` comparison, each sharing a
    // line with real angle-bracket JSX) and the old line-level `visible`
    // gate (an UPPER_SNAKE token used as a style/prop value and as a bare
    // string comparison, neither of which is a JsxText/string-JSX-child/
    // title-aria-placeholder-alt attribute value). None of these are a
    // genuine user-visible position, so R1 must never fire on any of them.
    const content = [
      "export function CodeOnly({ rows, row }: any) {",
      "  const filtered = rows.filter((r: any) => r.value <= THRESHOLD_MAX);",
      "  if (row.status === \"BOTTOM_WATCH\") { /* internal branch, not rendered */ }",
      "  return <div style={{ color: LEGEND_ITEM }}>{filtered.length}</div>;",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [2, 3, 4]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);

    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    const enumFindings = parsed.findings.filter((f: any) => f.rule === "raw_state_enum");
    expect(enumFindings).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it("12. AST visibility: a true positive in JsxText still blocks raw_state_enum", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/TruePositive.tsx";
    const content = [
      "export function TruePositive() {",
      "  return (",
      "    <div>",
      "      <span>BOTTOM_WATCH</span>",
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [4]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);

    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    const hit = parsed.findings.find(
      (f: any) => f.rule === "raw_state_enum" && f.token === "BOTTOM_WATCH" && f.blocking
    );
    expect(hit).toBeTruthy();
    rmSync(root, { recursive: true, force: true });
  });

  it("9. --json contract shape is stable", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/Good.tsx";
    const content = ["export function Good() {", '  return <span>{t("hi")}</span>;', "}", ""].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [2]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--root", root, "--diff-file", diffFile, "--json"]);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    expect(Object.keys(parsed).sort()).toEqual(
      ["version", "mode", "base", "baseResolved", "vocabulary", "scannedFiles", "findings", "counts", "nulls"].sort()
    );
    expect(typeof parsed.vocabulary.overlayPresent).toBe("boolean");
    expect(Array.isArray(parsed.nulls)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("13. overlay-harvested bare label KEYS are whole-word matches, not substrings (PR #530 review BLOCKER 1)", () => {
    const root = makeFixtureRoot();
    writeFileSync(
      join(root, "terminal/lib/plainLabels.ts"),
      [
        'export const TRUST_TIER_LABEL: Record<string, [string, string]> = {',
        '  pro: ["Pro", "专业版"],',
        '  free: ["Free", "免费"],',
        "};",
        "export function regimeLabel(t: any, v: string) { return v; }",
        "",
      ].join("\n")
    );
    const relPath = "terminal/components/Probe.tsx";
    const content = [
      "export function Probe({ row }: any) {",
      '  return <div className="profile-card">{row.regime}</div>;',
      "}",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [2]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    expect(parsed.vocabulary.overlayPresent).toBe(true);
    // "profile-card" contains the harvested overlay key "pro" as a bare
    // substring — the guard must NOT treat that as a plain-helper routing
    // for the untranslated `row.regime` interpolation on the same line.
    expect(
      parsed.findings.some((f: any) => f.rule === "raw_slug_interpolation" && f.token === "regime" && f.blocking)
    ).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("14. R2 internal_study_slug matches whole words only, not English words containing a slug (PR #530 review MAJOR)", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/G.tsx";
    const content = ["export function G() {", "  return <span>Globe</span>;", "}", ""].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [2]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    // "Globe" contains the study slug "lobe" as a bare substring — plain
    // English must never be flagged as an internal_study_slug.
    expect(parsed.findings.length).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it("15. LEX arity check is comma-in-string-safe and multi-line-safe (PR #530 review BLOCKER 2)", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/lib/i18n.tsx";
    const content = [
      "export const LEX: Record<string, [string, string]> = {",
      '  commaEn: ["Hello, world"],',
      "  multi: [",
      '    "Only english",',
      "  ],",
      "};",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [2, 3, 4, 5]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    const missingZh = parsed.findings.filter((f: any) => f.rule === "missing_zh" && f.blocking);
    // Both the comma-containing single-line entry AND the multi-line entry
    // must be caught — the old naive `.split(",")` + single-line regex
    // caught neither.
    expect(missingZh.length).toBe(2);
    // No false null: the file DID have new user-visible strings added.
    expect(parsed.nulls.find((n: any) => n.path === relPath)).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });

  it("16. copy-dict spans cover VALUES, never object KEYS or import specifiers (PR #530 round-2 review BLOCKER 1)", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/components/__p2/Dict.tsx";
    mkdirSync(join(root, "terminal/components/__p2"), { recursive: true });
    // Exact reviewer-constructed probe: a *_COPY object whose KEY is a raw
    // state enum (the enum being mapped FROM, never display text) and whose
    // VALUE is a URL containing an unrelated UPPER_SNAKE path segment.
    const content = [
      'import { helper } from "./ASSET_MAP_helper";',
      "export const MARKET_COPY = {",
      '  "BOTTOM_WATCH": "Watching for a bottom",',
      '  "chart_url": "https://cdn.example.com/ASSET_MAP/v1.png",',
      "};",
      "void helper;",
      "",
    ].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [1, 2, 3, 4, 5, 6]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    // The KEY "BOTTOM_WATCH" must never be flagged — it is the object's KEY
    // (the raw enum being translated FROM), not a copy-dict VALUE. Before
    // this fix every string literal in a *_COPY file was swept in,
    // including quoted keys.
    expect(parsed.findings.some((f: any) => f.token === "BOTTOM_WATCH")).toBe(false);
    // The import module specifier must never be scanned as copy either,
    // even though it textually contains "ASSET_MAP_helper".
    expect(parsed.findings.some((f: any) => f.path === relPath && f.line === 1)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("17. a .ts (not .tsx) file under terminal/lib/ matching *copy* is actually scanned (PR #530 round-2 review BLOCKER 2)", () => {
    const root = makeFixtureRoot();
    const relPath = "terminal/lib/marketCopy.ts";
    const content = ['export const MARKET_COPY = { a: "BOTTOM_WATCH" };', ""].join("\n");
    writeFileSync(join(root, relPath), content);
    const diff = unifiedDiffFor(relPath, content, [1]);
    const diffFile = join(root, "diff.patch");
    writeFileSync(diffFile, diff);
    const res = run(["--mode", "enforce-added", "--root", root, "--diff-file", diffFile, "--json"]);
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stdout.trim().split("\n").pop()!);
    // Before this fix, listScanFiles() never opened a plain .ts file at
    // all (walk() only pushes .tsx), so this file's raw enum VALUE was
    // silently invisible to the guard — scannedFiles never included it.
    const hit = parsed.findings.find(
      (f: any) => f.path === relPath && f.rule === "raw_state_enum" && f.token === "BOTTOM_WATCH" && f.blocking
    );
    expect(hit).toBeTruthy();
    rmSync(root, { recursive: true, force: true });
  });
});
