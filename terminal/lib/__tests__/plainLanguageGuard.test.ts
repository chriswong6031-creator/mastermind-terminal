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
    process.stdout.write(res.stdout);
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
    process.stdout.write(res2.stdout);
    process.stdout.write("\n--- end receipt ---\n");
    expect(res2.stdout).toContain("legacy (pre-existing, not blocking)");
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
});
