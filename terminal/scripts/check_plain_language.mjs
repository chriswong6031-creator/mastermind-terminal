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
// Node 20 ESM. Uses the repo's existing `typescript` devDependency
// (terminal/package.json) for AST-based user-visible-position detection —
// see isUserVisiblePosition below; no other npm dependency is added.
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
import ts from "typescript";

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

// Attribute names whose string-literal value is a genuine user-visible
// position (title text / accessible name / placeholder copy / alt text).
// Deliberately NOT the old regex's broader list (label/sublabel/caption/
// heading/tooltip/emptyText/children/`>...<`) — the ruling scopes this to
// exactly these four attributes plus JsxText/JSX-child string literals plus
// bilingual copy dictionaries; a bare style/data attribute holding an
// UPPER_SNAKE identifier (e.g. `style={LEGEND_ITEM}`) is source code, not
// visible text, and must never count.
const VISIBLE_ATTR_NAMES = new Set(["title", "aria-label", "placeholder", "alt"]);

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

// A file counts as a "bilingual copy dictionary" (whose string literal
// VALUES are all treated as user-visible, per the ruling) when either its
// path matches lib/**/*copy*.ts(x) or it has a top-level exported
// declaration whose name ends in `_COPY`.
function isCopyDictFile(relPath, sourceFile) {
  const norm = relPath.replace(/\\/g, "/");
  if (/(^|\/)lib\/.*copy.*\.tsx?$/i.test(norm)) return true;
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isVariableStatement(node)) {
      const isExported = (node.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && /_COPY$/.test(decl.name.text)) {
            found = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

// isUserVisiblePosition (AST-based): the set of AST node kinds treated as a
// genuine user-visible position, per the binding ruling on Terminal #530 —
//   - JsxText nodes (non-whitespace)
//   - string literals that are direct JSX children (`{"..."}` as a child of
//     a JsxElement/JsxFragment, not as an argument to a call inside one)
//   - string literals that are `{...}` expression VALUES of a
//     title/aria-label/placeholder/alt JSX attribute (or the bare string
//     literal form, `alt="..."`)
//   - string literal values inside a bilingual copy dictionary file
//     (isCopyDictFile above)
// Everything else — a bare identifier used as a style/prop value
// (`style={LEGEND_ITEM}`), a string literal passed as an i18n KEY
// (`t("marketCalm")` — "marketCalm" is a lookup key, not display text), a
// comparison or arrow function in ordinary code (`=>`, `<=`) — is walked by
// the AST but never produces a span, so it can never be mistaken for a
// visible position. This replaces the old `>[^<>]*<` substring heuristic,
// which matched `=>`/`<=` operators and any bare identifier sharing a line
// with real JSX markup.
function computeVisibleSpans(sourceFile, relPath) {
  const spans = [];
  const copyDict = isCopyDictFile(relPath, sourceFile);
  const isStringy = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
  const addSpan = (node) => spans.push({ start: node.getStart(sourceFile), end: node.getEnd() });

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (node.text.trim().length > 0) addSpan(node);
    } else if (isStringy(node)) {
      const parent = node.parent;
      if (parent && ts.isJsxExpression(parent)) {
        const grandparent = parent.parent;
        if (grandparent && (ts.isJsxElement(grandparent) || ts.isJsxFragment(grandparent))) {
          addSpan(node); // `{"..."}` as a direct JSX child
        } else if (grandparent && ts.isJsxAttribute(grandparent)) {
          const attrName = grandparent.name.getText(sourceFile).toLowerCase();
          if (VISIBLE_ATTR_NAMES.has(attrName)) addSpan(node); // `attr={"..."}`
        }
      } else if (parent && ts.isJsxAttribute(parent)) {
        const attrName = parent.name.getText(sourceFile).toLowerCase();
        if (VISIBLE_ATTR_NAMES.has(attrName)) addSpan(node); // `attr="..."`
      } else if (copyDict) {
        addSpan(node); // any string literal value inside a *_COPY dictionary file
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return spans;
}

// Line-level visibility check for the rules that still reason per raw line
// (R2/R4/R5b): a line "is visible" iff at least one AST-derived visible span
// overlaps its character range. Coarser than R1's token-precise span check
// (see scanLines below) but still strictly AST-driven — no more `>...<`
// substring matching, so `=>`/`<=` and bare identifiers on an otherwise-JSX
// line no longer flip this true on their own.
function lineIsVisible(spans, sourceFile, lineNo) {
  const lineStarts = sourceFile.getLineStarts();
  const idx = lineNo - 1;
  if (idx < 0 || idx >= lineStarts.length) return false;
  const start = lineStarts[idx];
  const end = idx + 1 < lineStarts.length ? lineStarts[idx + 1] : sourceFile.end;
  return spans.some((s) => s.start < end && s.end > start);
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
    if (h.endsWith("[")) {
      const name = h.slice(0, -1);
      return new RegExp(`\\b${escapeRegExp(name)}\\[`).test(line);
    }
    // Bare identifier harvested from the #519 overlay (e.g. a label-map KEY
    // like "pro"/"technical"): must match as a WHOLE WORD, never a
    // substring -- line.includes("pro") also matches "profile-card",
    // silently suppressing R3/R4 on any line containing that substring.
    // MEASURED on terminal/components/Probe.tsx: with the overlay present,
    // {row.regime} inside a profile-card div stopped being flagged.
    return new RegExp(`\\b${escapeRegExp(h)}\\b`).test(line);
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

  // ts.createSourceFile is lenient (produces error nodes rather than
  // throwing) on malformed input, so a scanned .tsx file always yields a
  // sourceFile; spans is simply empty if nothing qualifies as visible.
  const sourceFile = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const spans = computeVisibleSpans(sourceFile, relPath);

  let visibleAddedCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    if (added.has(lineNo) && lineIsVisible(spans, sourceFile, lineNo)) visibleAddedCount += 1;
  }

  // R1: raw_state_enum — token-precise. Scans ONLY the text inside genuinely
  // visible AST spans (never a whole line), so an UPPER_SNAKE identifier
  // used as a style/prop value or inside a comparison/arrow expression on
  // the same line as real JSX text can never be mistaken for the visible
  // text itself (the exact false-positive class the review measured on
  // VolSkewPanel.tsx / HeatmapTable.tsx / OptionsHubView.tsx).
  const enumRe = /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/g;
  for (const span of spans) {
    const spanText = text.slice(span.start, span.end);
    enumRe.lastIndex = 0;
    let m;
    while ((m = enumRe.exec(spanText))) {
      const token = m[1];
      if (PLAIN_VOCABULARY.allowTokens.includes(token)) continue;
      const absOffset = span.start + m.index;
      const lineNo = sourceFile.getLineAndCharacterOfPosition(absOffset).line + 1;
      const rawLine = lines[lineNo - 1] ?? "";
      const waiverReason = parseWaiver(rawLine);
      findings.push(mkFinding(relPath, lineNo, "raw_state_enum", token,
        "raw state enum in a user-visible position", suggestionForEnum(token),
        added.has(lineNo), waiverReason));
    }
  }

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine;
    const visible = lineIsVisible(spans, sourceFile, lineNo);
    const waiverReason = parseWaiver(line);

    // R2: internal_study_slug -- whole-word match only. The old
    // `line.includes(slug)` bare substring test also fired on ordinary
    // English words containing a slug as a substring, e.g. "lobe" inside
    // "Globe" (MEASURED: <span>Globe</span> blocked as
    // internal_study_slug "lobe").
    for (const slug of PLAIN_VOCABULARY.studySlugs) {
      const slugRe = new RegExp(`\\b${escapeRegExp(slug)}\\b`);
      if (slugRe.test(line) && visible) {
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

    // R5b: general files — English literal in a user-visible position with
    // no zh routing. (R5a — the i18n.tsx LEX-arity check — runs in a
    // separate multi-line-safe pass below, not per raw line.)
    if (!isI18n) {
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

  // R5a: LEX arity / zh-parity for terminal/lib/i18n.tsx — a dedicated
  // multi-line-safe, quote-aware pass over the whole file text, replacing
  // the old per-line `^...:\s*\[([^\]]*)\]` regex, which (a) split the
  // tuple on EVERY comma — so `["Hello, world"]` misread the literal comma
  // inside the English string as a tuple-element boundary — and (b)
  // required the whole `key: [...]` on ONE physical line, so a LEX entry
  // whose array spans multiple lines was never matched at all (a silent
  // miss, not a pass).
  if (isI18n) {
    for (const entry of findLexEntries(text)) {
      const parts = splitTopLevelCommas(entry.inner);
      const zh = parts[1] ? stripQuotes(parts[1]) : "";
      const entryLines = Array.from(
        { length: entry.endLine - entry.startLine + 1 },
        (_, k) => entry.startLine + k
      );
      const entryAdded = entryLines.some((ln) => added.has(ln));
      // A new LEX entry IS added user-visible copy — count it so the
      // zh_translation null (main(), "no new user-visible strings added")
      // is never printed for a file whose added lines ARE new English
      // strings routed through LEX (the AST visible-span check does not
      // classify a bare array-literal string as a visible position, which
      // produced exactly that false null).
      if (entryAdded) visibleAddedCount += 1;
      if (parts.length < 2 || zh === "") {
        const waiverReason2 = parseWaiver(lines[entry.startLine - 1] ?? "");
        findings.push(mkFinding(relPath, entry.startLine, "missing_zh", "LEX",
          "LEX entry has arity < 2 or an empty zh translation",
          "add a non-empty zh translation as the tuple's second element",
          entryAdded, waiverReason2));
      }
    }
  }

  return { findings, visibleAddedCount };
}

// Split a LEX tuple's inner text (e.g. `"Hello, world", "..."`) on commas
// that are NOT inside a quoted string. A naive `str.split(",")` misreads a
// comma inside the English/zh string content itself as a tuple-element
// boundary.
function splitTopLevelCommas(str) {
  const parts = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      cur += ch;
      if (ch === "\\") { i += 1; cur += str[i] ?? ""; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim().length > 0) parts.push(cur.trim());
  return parts;
}

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, "");
}

// Find every `KEY: [ ... ]` LEX entry in i18n.tsx, wherever it starts and
// however many lines its array spans — quote-aware bracket matching so a
// `]`/`,` inside a string literal never truncates or splits the entry.
function findLexEntries(text) {
  const entries = [];
  const startRe = /^[ \t]*[A-Za-z0-9_]+\s*:\s*\[/gm;
  let m;
  while ((m = startRe.exec(text))) {
    const bracketIdx = m.index + m[0].length - 1; // index of the '['
    let depth = 1;
    let i = bracketIdx + 1;
    let quote = null;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "[") {
        depth += 1;
      } else if (ch === "]") {
        depth -= 1;
      }
      i += 1;
    }
    const inner = text.slice(bracketIdx + 1, i - 1);
    const startLine = text.slice(0, m.index).split("\n").length;
    const endLine = startLine + inner.split("\n").length - 1;
    entries.push({ startLine, endLine, inner });
  }
  return entries;
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
function runSelfCheck() {
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
    const results = runSelfCheck();
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
