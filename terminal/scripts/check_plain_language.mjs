#!/usr/bin/env node
// terminal/scripts/check_plain_language.mjs
//
// Plain-language guard for the Terminal: forward-only check that raw state
// enums, internal study/organ slugs, and untranslated statistic tokens do not
// reach a user-visible position.
//
// Direct port of the macro precedent `scripts/check_design_system.py`
// (--mode enforce-added forward-only mechanic, ANNOTATION_CAP, disclosed
// fail-open/fail-closed semantics) — read at
// /Users/chriswong/Documents/Cluade/macro-main/scripts/check_design_system.py.
// Packet B-PL-5 (lane marketontology-b4-plain-language-guard).
//
// Node 20 ESM, zero npm dependencies.
//
// Scanning model (full census, forward-only blocking — same shape as the
// macro precedent): every file under SCAN_GLOBS/EXTRA_FILES is scanned on
// every run, regardless of whether the diff touches it. A finding on a line
// the diff marks as ADDED is `blocking`; the same finding on a pre-existing
// line is reported as `legacy` and never fails the run. This is what lets an
// untouched file's pre-existing violation surface (visibility) without
// retroactively blocking code nobody in this PR wrote.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ANNOTATION_CAP = 10;

export const PLAIN_VOCABULARY = {
  stateEnums: {
    BOTTOM_WATCH: ["Watching for a bottom", "关注筑底"],
    CATALYST_WINDOW: ["Catalyst window open", "催化剂窗口"],
    QUIET_ACCUMULATION: ["Quiet accumulation", "悄然吸筹"],
    REPEAT_HITTER: ["Repeat buyer", "重复买家"],
    SIZE_VS_OI: ["Large vs open interest", "大单对比未平仓"],
    MULTI_LEG: ["Multi-leg trade", "多腿交易"],
    DELAYED_15M: ["15-minute delayed", "延迟15分钟"],
  },
  studySlugs: [
    "trust_tier", "event-edge", "msc_regime", "mscRegime", "flowScore", "gexdesk",
    "prophet", "oracle", "conductor", "synapse", "lobe", "tripwire", "falsifier",
    "quiet_accumulation", "bottom_watch",
  ],
  slugFields: [
    "state", "regime", "status", "tier", "slug", "code", "kind", "category", "type",
    "bucket", "classification", "verdict", "urgency",
  ],
  statTokens: [
    "iv_rank", "ivr", "gex", "dex", "vanna", "charm", "dte", "oi", "pcr", "rv30", "hv20",
    "atr14", "zscore", "z_score", "pctl", "yoy", "qoq", "ttm", "cagr",
  ],
  // Names of helper calls / lookups that mean "this line already routes its
  // text through the plain-language layer". Consumers must match these as
  // whole call names (`\bNAME\(`), never as a bare substring — a substring
  // match on e.g. "t(" also matches `sort(`, `useEffect(`, `.at(`, `count(`.
  plainHelpers: [
    "trustTierLabel(", "regimeLabel(", "planTierLabel(", "classicCategoryLabel(",
    "macroChipLabel(", "mappedOrNeutral(", "notClassified(", "t(", "tPlain(", "pick(", "LEX[",
  ],
  allowTokens: ["RSI", "MACD", "ETF", "NAV", "AI", "API", "USD", "HKD", "CNY"],
};

const SCAN_GLOBS = ["terminal/app", "terminal/components"];
const EXTRA_FILES = ["terminal/lib/i18n.tsx"];
const EXCLUDE_RE = /(__tests__|\.test\.|\/e2e\/|\.d\.ts$|terminal\/scripts\/)/;

function findRepoRoot() {
  // repo root resolved from import.meta.url: terminal/scripts/<this file> -> repo root is two up.
  return join(HERE, "..", "..");
}

// terminal/lib/plainLabels.ts (packet #519) is an OPTIONAL, forward-compatible
// vocabulary overlay: if/when it lands on this tree, its exported label maps
// and helper function names are harvested and merged into the terms the
// guard treats as "already routed". Until #519 merges, `existsSync` below is
// false, `overlay.present` is false, and every declared term lives in
// PLAIN_VOCABULARY alone — that is the single declared source acceptance (2)
// requires, with or without the overlay.
function loadOverlay(root) {
  const p = join(root, "terminal/lib/plainLabels.ts");
  const result = { present: false, terms: [] };
  if (!existsSync(p)) return result;
  try {
    const text = readFileSync(p, "utf8");
    result.present = true;
    const helperNames = [];
    const constRe = /export\s+const\s+(TRUST_TIER_LABEL|CLASSIC_INDICATOR_CATEGORIES|PLAN_TIER_TKEY)\b[^{]*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = constRe.exec(text))) {
      const body = m[2];
      const keyRe = /^\s*["']?([A-Za-z0-9_]+)["']?\s*:/gm;
      let km;
      while ((km = keyRe.exec(body))) helperNames.push(km[1]);
    }
    const fnRe = /export\s+function\s+([A-Za-z0-9_]+)\s*\(/g;
    while ((m = fnRe.exec(text))) helperNames.push(`${m[1]}(`);
    result.terms = helperNames;
  } catch {
    // unreadable overlay is treated as absent, never a hard failure — it is optional.
    result.present = false;
  }
  return result;
}

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function listScanFiles(root) {
  const files = [];
  for (const g of SCAN_GLOBS) walk(join(root, g), files);
  for (const f of EXTRA_FILES) {
    const p = join(root, f);
    if (existsSync(p)) files.push(p);
  }
  return files.filter((f) => !EXCLUDE_RE.test(f.replace(/\\/g, "/")));
}

// Parse unified diff `@@` hunks into { path -> Set(addedLineNo) }.
function parseAddedLineNumbers(diffText) {
  const addedLines = new Map();
  let curPath = null;
  let newLineNo = null;
  const lines = diffText.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      let p = line.slice(4).trim();
      if (p === "/dev/null") { curPath = null; continue; }
      if (p.startsWith("b/")) p = p.slice(2);
      curPath = p;
      if (!addedLines.has(curPath)) addedLines.set(curPath, new Set());
      continue;
    }
    if (line.startsWith("@@")) {
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) newLineNo = parseInt(m[1], 10);
      continue;
    }
    if (curPath == null || newLineNo == null) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.get(curPath).add(newLineNo);
      newLineNo += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      // removed line: does not consume a new-line number
    } else {
      newLineNo += 1;
    }
  }
  return addedLines;
}

function isUserVisiblePosition(line) {
  if (/>[^<>]*<\/?[a-zA-Z]/.test(line) || />[^<>]+</.test(line)) return true;
  if (/\b(label|title|sublabel|placeholder|aria-label|caption|heading|tooltip|emptyText|alt|children)\s*[:=]/.test(line)) return true;
  if (/\bLEX\s*[.\[]/.test(line)) return true;
  return false;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A "plain helper on this line" match must be a whole call/lookup name, never
// a bare substring — `line.includes("t(")` also matches `.sort(`, `.at(`,
// `useEffect(`, `format(`, `count(`, defeating R3/R5b on any line that
// happens to contain those. Every helper ending in "(" is matched as
// `\bNAME\(`; a helper like "LEX[" (no trailing paren) is matched literally.
function hasPlainHelperOnLine(line, overlayTerms) {
  const all = [...PLAIN_VOCABULARY.plainHelpers, ...overlayTerms];
  return all.some((h) => {
    if (h.endsWith("(")) {
      const name = h.slice(0, -1);
      return new RegExp(`\\b${escapeRegExp(name)}\\(`).test(line);
    }
    return line.includes(h);
  });
}

function suggestionForEnum(token) {
  const pair = PLAIN_VOCABULARY.stateEnums[token];
  if (pair) {
    return `say "${pair[0]}" / "${pair[1]}" (route via regimeLabel(t, value, lang) from @/lib/plainLabels)`;
  }
  return `<no plain phrase declared for ${token} — add one to PLAIN_VOCABULARY.stateEnums, or route through lib/plainLabels.ts>`;
}

function parseWaiver(line) {
  const m = /\/\/\s*plain-language-ok:\s*(.+)\s*$/.exec(line);
  if (!m) return null;
  const reason = m[1].trim();
  return reason.length > 0 ? reason : null;
}

// Real rule bodies, operating on in-memory text — shared by scanFile (reads
// from disk) and runSelfCheck (feeds a fixture string directly, so the
// self-check exercises the same code path CI runs, not a re-typed proxy).
function scanLines(relPath, text, addedLines, overlayTerms) {
  const lines = text.split("\n");
  const added = addedLines.get(relPath) || new Set();
  const findings = [];
  const isI18n = relPath.endsWith("terminal/lib/i18n.tsx");
  let visibleAddedCount = 0;

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine;
    const visible = isUserVisiblePosition(line);
    const waiverReason = parseWaiver(line);
    if (visible && added.has(lineNo)) visibleAddedCount += 1;

    // R1: raw_state_enum
    const enumRe = /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/g;
    let m;
    while ((m = enumRe.exec(line))) {
      const token = m[1];
      if (PLAIN_VOCABULARY.allowTokens.includes(token)) continue;
      if (!visible) continue;
      findings.push(mkFinding(relPath, lineNo, "raw_state_enum", token,
        "raw state enum in a user-visible position", suggestionForEnum(token),
        added.has(lineNo), waiverReason));
    }

    // R2: internal_study_slug
    for (const slug of PLAIN_VOCABULARY.studySlugs) {
      if (line.includes(slug) && visible) {
        findings.push(mkFinding(relPath, lineNo, "internal_study_slug", slug,
          "internal study/organ slug in a user-visible position",
          `<no plain phrase declared for ${slug} — add one to PLAIN_VOCABULARY, or route through lib/plainLabels.ts>`,
          added.has(lineNo), waiverReason));
      }
    }

    // R3: raw_slug_interpolation — JSX interpolation of a slugFields field, no plain helper on line
    for (const field of PLAIN_VOCABULARY.slugFields) {
      const interpRe = new RegExp(`\\{[^}]*\\.${field}\\}`);
      if (interpRe.test(line) && !hasPlainHelperOnLine(line, overlayTerms)) {
        findings.push(mkFinding(relPath, lineNo, "raw_slug_interpolation", field,
          `raw "${field}" field interpolated with no plain-language helper on the same line`,
          `route through a plainLabels helper (e.g. regimeLabel/classicCategoryLabel) or lib/i18n t()`,
          added.has(lineNo), waiverReason));
      }
    }

    // R4: untranslated_stat_token — rendered as visible text, no gloss/LEX key on line
    for (const tok of PLAIN_VOCABULARY.statTokens) {
      const tokRe = new RegExp(`\\b${tok}\\b`, "i");
      if (tokRe.test(line) && visible && !hasPlainHelperOnLine(line, overlayTerms)) {
        findings.push(mkFinding(relPath, lineNo, "untranslated_stat_token", tok,
          "untranslated raw statistic token rendered as visible text",
          `add a gloss via lib/i18n t("${tok}") or an inline explanatory label`,
          added.has(lineNo), waiverReason));
      }
    }

    // R5a/R5b: only in i18n.tsx (LEX arity) or general (english literal not routed)
    if (isI18n) {
      const lexEntryRe = /^\s*[A-Za-z0-9_]+\s*:\s*\[([^\]]*)\]/;
      const lm = lexEntryRe.exec(line);
      if (lm) {
        const parts = lm[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        const zh = parts[1] ? parts[1].replace(/^["']|["']$/g, "") : "";
        if (parts.length < 2 || zh === "") {
          findings.push(mkFinding(relPath, lineNo, "missing_zh", "LEX",
            "LEX entry has arity < 2 or an empty zh translation",
            "add a non-empty zh translation as the tuple's second element",
            added.has(lineNo), waiverReason));
        }
      }
    } else {
      const enLitRe = /[">]\s*([A-Za-z][A-Za-z' -]{5,})\s*[<"]/;
      const lm = enLitRe.exec(line);
      if (lm && visible) {
        const words = lm[1].trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
        const latinWords = words.filter((w) => /^[A-Za-z'-]+$/.test(w));
        if (latinWords.length >= 2 && lm[1].trim().length >= 6 && !hasPlainHelperOnLine(line, overlayTerms)) {
          findings.push(mkFinding(relPath, lineNo, "missing_zh", lm[1].trim(),
            "added English literal in a user-visible position with no zh routing (t(/tPlain(/pick(/LEX[)",
            `route through t()/tPlain()/pick() with a LEX entry carrying an [en, zh] pair`,
            added.has(lineNo), waiverReason));
        }
      }
    }
  });

  return { findings, visibleAddedCount };
}

function scanFile(root, absPath, addedLines, overlayTerms) {
  const relPath = relative(root, absPath).replace(/\\/g, "/");
  const text = readFileSync(absPath, "utf8");
  return scanLines(relPath, text, addedLines, overlayTerms);
}

function mkFinding(path, line, rule, token, detail, suggestion, addedFlag, waiverReason) {
  const blockingRaw = addedFlag;
  const waived = blockingRaw && waiverReason != null;
  return {
    path, line, rule, token,
    blocking: blockingRaw && !waived,
    waived, waiverReason: waiverReason ?? null,
    detail, suggestion,
  };
}

function formatHuman(findings, header) {
  const out = [];
  if (header) out.push(header);
  for (const f of findings) {
    out.push(`${f.path}:${f.line}: ${f.rule}: "${f.token}" — ${f.detail}`);
    out.push(`  ${f.suggestion}`);
  }
  return out.join("\n");
}

function resolveDiff({ diffFile, since, root }) {
  if (diffFile) {
    let text;
    try {
      text = diffFile === "-" ? readFileSync(0, "utf8") : readFileSync(diffFile, "utf8");
    } catch (e) {
      return { error: `--diff-file supplied but unreadable: ${diffFile} (${e.message})` };
    }
    return { text, baseResolved: true };
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", since], { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    return { text: "", baseResolved: false };
  }
  try {
    const text = execFileSync(
      "git",
      ["diff", "--unified=0", `${since}...HEAD`, "--", "terminal/app", "terminal/components", "terminal/lib/i18n.tsx"],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    return { text, baseResolved: true };
  } catch (e) {
    return { text: "", baseResolved: false };
  }
}

function selfCheckFixtures() {
  return {
    R1: { relPath: "fixture.tsx", code: "const x = <span>BOTTOM_WATCH</span>;", rule: "raw_state_enum" },
    R2: { relPath: "fixture.tsx", code: "const x = <span>trust_tier</span>;", rule: "internal_study_slug" },
    R3: { relPath: "fixture.tsx", code: "const x = <span>{row.regime}</span>;", rule: "raw_slug_interpolation" },
    R4: { relPath: "fixture.tsx", code: "const x = <span>iv_rank</span>;", rule: "untranslated_stat_token" },
    R5a: { relPath: "terminal/lib/i18n.tsx", code: '  newThing: ["Market is calm"],', rule: "missing_zh" },
    R5b: { relPath: "fixture.tsx", code: "const x = <h2>Market is calm today</h2>;", rule: "missing_zh" },
  };
}

// Real invocation: each fixture line is fed through the SAME scanLines() the
// production scan uses (not a re-typed regex proxy), with that one line
// marked as added — so a rule only reports "detected" if the guard's actual
// rule logic, on its actual code path, flags the fixture as blocking.
function runSelfCheck(root) {
  const fixtures = selfCheckFixtures();
  const results = {};
  for (const [rule, fx] of Object.entries(fixtures)) {
    const addedLines = new Map([[fx.relPath, new Set([1])]]);
    const { findings } = scanLines(fx.relPath, fx.code, addedLines, []);
    results[rule] = findings.some((f) => f.rule === fx.rule && f.blocking);
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const opts = { mode: "enforce-added", since: "origin/master", diffFile: null, root: null, json: false, selfCheck: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--mode") opts.mode = args[++i];
    else if (a === "--since") opts.since = args[++i];
    else if (a === "--diff-file") opts.diffFile = args[++i];
    else if (a === "--root") opts.root = args[++i];
    else if (a === "--json") opts.json = true;
    else if (a === "--self-check") opts.selfCheck = true;
  }

  const root = opts.root ? opts.root : findRepoRoot();
  if (opts.root && !existsSync(opts.root)) {
    process.stdout.write(`::error title=plain-language::--root supplied but unreadable: ${opts.root}\n`);
    process.exit(2);
  }

  if (opts.selfCheck) {
    const results = runSelfCheck(root);
    for (const [rule, ok] of Object.entries(results)) {
      process.stdout.write(`${rule} ${ok ? "detected" : "NOT detected"}\n`);
    }
    process.exit(0);
  }

  const overlay = loadOverlay(root);
  const declaredTerms =
    Object.keys(PLAIN_VOCABULARY.stateEnums).length +
    PLAIN_VOCABULARY.studySlugs.length +
    PLAIN_VOCABULARY.slugFields.length +
    PLAIN_VOCABULARY.statTokens.length +
    PLAIN_VOCABULARY.plainHelpers.length +
    PLAIN_VOCABULARY.allowTokens.length;

  if (!overlay.present) {
    process.stdout.write(
      `plain-language guard — vocabulary overlay ABSENT: terminal/lib/plainLabels.ts not present on this tree; using the ${declaredTerms} declared terms only.\n`
    );
  }

  const diffResult = resolveDiff({ diffFile: opts.diffFile, since: opts.since, root });
  if (diffResult.error) {
    process.stdout.write(`::error title=plain-language::${diffResult.error}\n`);
    process.exit(2);
  }
  if (!diffResult.baseResolved) {
    process.stdout.write(
      `::warning title=plain-language::base ref '${opts.since}' is not resolvable in this checkout (shallow clone?) — no line counts as added, so nothing can block. Pass --diff-file with the PR's own diff.\n`
    );
    if (opts.json) {
      console.log(JSON.stringify({
        version: 1, mode: opts.mode, base: opts.since, baseResolved: false,
        vocabulary: { declaredTerms, overlaySource: "terminal/lib/plainLabels.ts", overlayPresent: overlay.present, overlayTerms: overlay.terms.length },
        scannedFiles: 0, findings: [], counts: { blocking: 0, legacyReported: 0, waived: 0 }, nulls: [],
      }));
    }
    process.exit(0);
  }

  const addedLines = parseAddedLineNumbers(diffResult.text);
  // Full census: every file under SCAN_GLOBS/EXTRA_FILES is scanned on every
  // run, not only the files the diff touches — this is what lets a legacy
  // (completely untouched) file's pre-existing violation be reported.
  // `addedLines` (from the diff) is what decides which findings are
  // `blocking` vs `legacy`; it never decides which files get opened.
  const scanFiles = listScanFiles(root);

  let allFindings = [];
  const nulls = [];
  for (const f of scanFiles) {
    const { findings, visibleAddedCount } = scanFile(root, f, addedLines, overlay.terms);
    if (findings.length === 0 && visibleAddedCount === 0) {
      // Honest null: this file had no user-visible ADDED lines at all, so
      // "no findings" cannot be hiding a missed zh-parity check — there was
      // nothing on the diff's side of this file to check in the first place.
      nulls.push({ axis: "zh_translation", path: relative(root, f).replace(/\\/g, "/"), value: "not evaluable — no new user-visible strings added" });
    }
    allFindings = allFindings.concat(findings);
  }

  const blocking = allFindings.filter((f) => f.blocking);
  const legacy = allFindings.filter((f) => !f.blocking && !f.waived);
  const waived = allFindings.filter((f) => f.waived);

  if (opts.json) {
    console.log(JSON.stringify({
      version: 1,
      mode: opts.mode,
      base: opts.since,
      baseResolved: true,
      vocabulary: { declaredTerms, overlaySource: "terminal/lib/plainLabels.ts", overlayPresent: overlay.present, overlayTerms: overlay.terms.length },
      scannedFiles: scanFiles.length,
      findings: allFindings,
      counts: { blocking: blocking.length, legacyReported: legacy.length, waived: waived.length },
      nulls,
    }));
    process.exit(blocking.length > 0 ? 1 : 0);
  }

  if (opts.mode === "report") {
    process.stdout.write(formatHuman(allFindings, "plain-language guard — full census (report mode)"));
    process.stdout.write("\n");
    process.exit(0);
  }

  // enforce-added mode
  if (blocking.length > 0) {
    process.stdout.write(`::error title=plain-language::${blocking.length} blocking plain-language finding(s) on newly added lines\n`);
  }
  const capped = blocking.slice(0, ANNOTATION_CAP);
  for (const f of capped) {
    process.stdout.write(`::error title=plain-language::${f.path}:${f.line}: ${f.rule}: "${f.token}" — ${f.suggestion}\n`);
  }
  if (blocking.length > 0) {
    process.stdout.write(formatHuman(blocking, "blocking (added lines)"));
    process.stdout.write("\n");
  }
  if (legacy.length > 0) {
    process.stdout.write(formatHuman(legacy, "legacy (pre-existing, not blocking)"));
    process.stdout.write("\n");
  }
  if (waived.length > 0) {
    process.stdout.write(formatHuman(waived, "waived (plain-language-ok)"));
    process.stdout.write("\n");
  }
  for (const n of nulls) {
    process.stdout.write(`null: ${n.axis} @ ${n.path}: ${n.value}\n`);
  }
  process.exit(blocking.length > 0 ? 1 : 0);
}

main();
