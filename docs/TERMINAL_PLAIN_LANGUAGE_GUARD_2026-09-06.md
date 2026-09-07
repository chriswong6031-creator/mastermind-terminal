# Terminal plain-language guard

Packet `B-PL-5` (lane `marketontology-b4-plain-language-guard`, wave B4). Owns
`terminal/scripts/check_plain_language.mjs`,
`terminal/lib/__tests__/plainLanguageGuard.test.ts`, and this doc.

## 1. What law this enforces

The Chairman frontend plain-language directive (2026-09-06) and the standing
Macro `CLAUDE.md` § Design banned-vocabulary rule: internal state/study names,
untranslated raw statistics, and raw slugs must never reach the screen. This
guard is the Terminal-side enforcement mechanism for that rule, mirroring the
macro-side `scripts/check_design_system.py`.

## 2. Blocking vs reporting (forward-only)

Every run is a **full census**: every `.tsx` file under `terminal/app`,
`terminal/components`, and `terminal/lib/i18n.tsx` is opened and scanned,
whether or not the current diff touches it — the diff is consulted only to
decide which *lines* count as added, never which *files* get opened. The
guard only **blocks** on a finding whose line was added by the current diff
against `origin/master` (or the diff supplied via `--diff-file`). Any other
finding — including one in a file the diff never touches at all — is still
surfaced, under the header `legacy (pre-existing, not blocking)`, but never
fails the run. This mirrors the macro precedent's `--mode enforce-added`: an
untouched legacy file can never turn a PR red just because the checker
learned a new rule, but its pre-existing violation is still visible in the
report. `--mode report` always exits 0 and prints the same full census
regardless of diff status.

## 3. Vocabulary

`PLAIN_VOCABULARY` at the top of `check_plain_language.mjs` is the single
declared source: `stateEnums` (token → `[en, zh]` phrase pairs), `studySlugs`,
`slugFields`, `statTokens`, `plainHelpers`, and `allowTokens`. Extend it there.

**Optional overlay:** if `terminal/lib/plainLabels.ts` exists in the scanned
tree, the guard reads it as text (never imports it — it is TypeScript and, as
of this writing, lives only on open PR #519, unmerged) and harvests
additional label keys/helper names into the working vocabulary; those
harvested names are then actually threaded into every "is this line already
routed through a plain-language helper" check (R3/R4/R5b), not merely counted
in the JSON `overlayTerms` field. If absent — the current state of this
tree, since #519 is unmerged — the guard prints a disclosed null (`vocabulary
overlay ABSENT: ...`) and every check runs on `PLAIN_VOCABULARY` alone, which
is a fresh, hardcoded, 74-term literal declared in this file rather than a
reuse of #519's vocabulary. "Reuse #519's vocabulary" is therefore a
forward-compatible design, not a completed integration: it activates
automatically the moment #519 merges, with no code change to this guard, but
does not hold today.

Note also that `hasPlainHelperOnLine` matches whole call names
(`\bregimeLabel\(`, `\bt\(`, …), never a bare substring — a substring match on
`"t("` would also match `.sort(`, `.at(`, `useEffect(`, `format(`, defeating
the "already routed" check on any line that happens to contain one of those.

### 3a. `isUserVisiblePosition` is AST-based, not a substring heuristic

Per the binding review ruling on this PR's round 1, "user-visible position"
is decided by parsing every scanned `.tsx` file with the repo's existing
`typescript` devDependency (`ts.createSourceFile`, zero new npm dependency)
and walking the AST. A position counts as visible **only** when it is one of:

- a `JsxText` node (non-whitespace) — plain text between JSX tags;
- a string literal that is a direct JSX child via `{"..."}` (its parent is a
  `JsxExpression` whose own parent is a `JsxElement`/`JsxFragment` — never an
  argument buried inside a call, so `t("marketCalm")`'s `"marketCalm"` key is
  correctly excluded: it is a lookup key, not the rendered text);
- a string literal that is the value of a `title` / `aria-label` /
  `placeholder` / `alt` JSX attribute, in either form (`alt="..."` or
  `alt={"..."}`);
- any string literal value inside a bilingual copy-dictionary file — a path
  matching `lib/**/*copy*.ts(x)`, or a file exporting a top-level
  declaration whose name ends in `_COPY`.

Everything else the AST walk touches — a bare identifier used as a
style/prop value (`style={{ color: LEGEND_ITEM }}`), an arrow function or a
`<=`/`>=` comparison in ordinary code, a string literal passed as a
translation *key* rather than rendered as text — produces no span and can
never be treated as visible. **R1 (`raw_state_enum`) is token-precise**: it
scans only the text *inside* these AST-derived spans, never a whole raw
line, so an UPPER_SNAKE identifier used as code on the same physical line as
real JSX text can no longer be mistaken for the visible text itself. This
replaced the prior `>[^<>]*<` substring check, which matched `=>`/`<=`
operators and any bare identifier sharing a line with markup — measured on
the real terminal tree (`node terminal/scripts/check_plain_language.mjs
--root . --diff-file empty.patch --json`, repo root as `--root`): the prior
heuristic produced 435 `raw_state_enum` findings tree-wide, almost all of
them style/prop identifiers (`LEGEND_ITEM`, `TH_STYLE`, `PAD_L`, `CALL_COLOR`,
…), never a declared state enum in a genuinely visible position; the
AST-based rewrite produces **0** `raw_state_enum` findings on the same tree
(no genuine visible-position state-enum usage exists there today — see
`terminal/lib/__tests__/plainLanguageGuard.test.ts` tests 11/12 for the
regression fixtures: false positives on `=>`/`<=`/an enum comparison in
code no longer fire, and a true JsxText positive still does).

R2 (`internal_study_slug`), R4 (`untranslated_stat_token`), and R5b
(`missing_zh` on a bare English literal) still reason at line granularity —
a line "is visible" iff at least one AST-derived span overlaps it
(`lineIsVisible`) — but that gate itself is now AST-driven rather than
regex-driven, so those rules also no longer flip "visible" on for a line
just because it contains an unrelated `=>`/`<=`. R3
(`raw_slug_interpolation`) never used the visibility gate and is unchanged.

## 4. CLI, exit codes, JSON contract

```
node terminal/scripts/check_plain_language.mjs                 # default: enforce-added vs origin/master
node terminal/scripts/check_plain_language.mjs --mode report   # full census, always exit 0
node terminal/scripts/check_plain_language.mjs --self-check    # prove each rule detects its own violation
node terminal/scripts/check_plain_language.mjs --json          # machine contract
```

| code | meaning |
|---|---|
| 0 | no blocking findings, or a disclosed fail-open (base ref unresolvable / no diff) |
| 1 | ≥1 blocking finding on a line the diff added |
| 2 | infrastructure fault: `--diff-file` supplied but unreadable, or `--root` unreadable (fails CLOSED, loud `::error`) |

`--json` prints `{version, mode, base, baseResolved, vocabulary, scannedFiles,
findings[], counts, nulls[]}`. Keys are the contract; additive changes only.
Each finding carries `path`, `line`, `rule`, `token`, `blocking`, `waived`,
`waiverReason`, `detail`, and a `suggestion` — never a bare boolean.

## 5. Waiver

A trailing `// plain-language-ok: <reason>` clears a finding's `blocking`
status **only when `<reason>` is non-empty**. The finding is still emitted
with `waived: true` and its `waiverReason` populated — a waiver is visible in
the report, never silent, so a reviewer can read and question it.

## 6. Running it

**Locally**, from the repo root: `node terminal/scripts/check_plain_language.mjs`.

**In CI**: no workflow or `package.json` change was needed. `.github/workflows/ci.yml`'s
`terminal` job already runs `npm test` (`vitest run`) inside `working-directory: terminal`,
and `terminal/vitest.config.ts` includes `lib/__tests__/**/*.test.ts` — so
`terminal/lib/__tests__/plainLanguageGuard.test.ts` runs on every PR for free,
spawning the checker against in-memory fixtures via `execFileSync`.

## 7. `--self-check`

`--self-check` feeds one fixture line per rule (R1–R5b) through the guard's
real `scanLines()` — the identical function `scanFile()` calls against real
files — with that line marked as added, and reports `<rule> detected` only
when the rule's own logic produced a matching blocking finding against it.
It is a real invocation of the production code path, not a re-typed proxy
regex, so it can only pass by the rule actually firing.

## 8. Known gaps (printed, not hidden)

- **Visibility detection is AST-based (§3a); the token/slug matching layered
  on top of it is still regex.** `isUserVisiblePosition` — and R1's
  token-precise span scan — use the real TS AST (`ts.createSourceFile`), so
  the `=>`/`<=`/bare-identifier false-positive class measured in review
  round 1 is fixed. What is still regex: R2/R4/R5b's own token/slug matching
  runs `RegExp.test` over the raw line text once that line is judged
  visible, and a multi-line `JsxText` node or a line-spanning template
  literal is a false negative for the line-based rules (R1 itself, being
  span-based rather than line-based, does not share this specific gap for
  its own rule, but a JsxText span that happens to straddle multiple lines
  is still walked as one node whose interior offsets are correctly mapped
  back to the right line via `sourceFile.getLineAndCharacterOfPosition`).
- **False positives on ordinary code remain possible.** `slugFields` includes
  generic names (`type`, `status`, `code`, `kind`) that also occur as
  legitimate non-slug fields (e.g. React's `.type`, an instrument's quote
  `.status`); `statTokens` includes short tokens (`oi`, `dte`) that can appear
  inside unrelated identifiers despite the `\b` word-boundary guard. A line
  that trips one of these on merit gets a real false positive, not a defect
  in the rule's mechanism — the intended escape hatch is a trailing
  `// plain-language-ok: <reason>` waiver (§5), which still surfaces the
  finding (never silent) but clears `blocking`. This tradeoff is inherited,
  not newly introduced by this fix pass, and narrowing `slugFields`/
  `statTokens` further is future work, not something this packet's owned
  files can resolve without either weakening real detection or adding a type-
  aware (AST) pass.
- **The zero-finding null is honest but still coarse.** A file with zero
  findings and zero user-visible ADDED lines gets `not evaluable — no new
  user-visible strings added` (accurate: there was nothing on the diff's
  side of this file to check). A file with visible added lines and zero
  findings is NOT given that null (it correctly has no `nulls` entry at
  all) — but the guard still cannot distinguish "genuinely compliant" from
  "missed by a rule gap" beyond the rules R1–R5b actually implement. That is
  a detection-coverage limit, not a misreported null.
- **CI base resolution is untested end-to-end against a real repo-wide diff.**
  `actions/checkout@v4` at default depth likely cannot resolve
  `origin/master` inside the `terminal` job, so the repo-wide `--since
  origin/master` path may always take the disclosed fail-open branch in CI.
  This is why the CI proof for this packet runs through the vitest suite's
  own `--diff-file` fixtures rather than a live repo-wide scan, and why the
  guard is a developer command + test suite today, not yet wired as a
  standalone PR-diff check in `.github/workflows/ci.yml`. Wiring it there
  (and confirming checkout depth) is out of this packet's owned paths
  (`terminal/scripts/check_plain_language.mjs`,
  `terminal/lib/__tests__/plainLanguageGuard.test.ts`, this doc) and needs a
  follow-up wiring packet rather than a silent scope expansion here. If
  checkout depth ever changes and full history becomes available, the
  `--since` path starts working with no code change; if it stays shallow,
  the disclosed fail-open is the correct, non-silent outcome — never a false
  green on a real violation.

## 9. Review fixes (round 2, PR #530)

The following blockers/majors from the review of head `6aaeb6f3` were fixed
in a follow-up commit and are each locked in by a regression test in
`plainLanguageGuard.test.ts`:

- **BLOCKER — overlay bare label KEYS were substring-matched.**
  `hasPlainHelperOnLine` matched every helper ending in `(` or `[` by whole
  name (`\bNAME\(`), but a bare identifier harvested from the `#519` overlay
  (e.g. a `TRUST_TIER_LABEL` key like `pro`) still fell through to
  `line.includes(h)` — an unbounded substring match. MEASURED: with the
  overlay present, `<div className="profile-card">{row.regime}</div>`
  stopped being flagged as `raw_slug_interpolation`, purely because `"pro"`
  is a substring of `"profile"`. Fixed: every bare (non-call, non-`LEX[`)
  overlay term is now matched with `\bTERM\b`. Test 13.
- **MAJOR — `R2 internal_study_slug` was a bare substring match.**
  `line.includes(slug)` fired on any English word containing a slug as a
  substring, e.g. `"lobe"` inside `"Globe"`. Fixed: `R2` now matches
  `\bslug\b`. Test 14.
- **BLOCKER — the i18n.tsx `LEX` arity check was comma-naive and
  single-line-only.** The old per-line regex captured everything between
  `[` and the first `]` and split it on every comma, so
  `commaEn: ["Hello, world"]` misread the comma inside the English string as
  a tuple-element boundary (miscounting arity), and required the whole
  `key: [...]` on one physical line, so a LEX entry whose array spans
  multiple lines was never matched at all — a silent miss, not a pass. Fixed
  with `findLexEntries()` (a quote-aware bracket-matching scan of the whole
  file, so a comma/`]` inside a string literal never splits or truncates an
  entry) and `splitTopLevelCommas()` (splits only on commas outside quotes).
  A newly-added multi-line or comma-containing LEX entry with a missing zh
  translation is now also counted toward `visibleAddedCount`, so the
  `zh_translation` null is never printed for a file whose added lines ARE
  new English LEX strings. Test 15.
- **MAJOR — the receipt printer replayed raw `::error`/`::warning` lines
  into a passing test's stdout**, which GitHub parses as run-level
  annotations regardless of the step's own exit code (this repo's own
  convention: "GitHub annotations must START the line"). Fixed:
  `plainLanguageGuard.test.ts` now indents each such line
  (`redactAnnotations()`) before printing the receipt in test 8, so the
  characters stay legible in the log without minting a phantom annotation.
- **MAJOR — `isUserVisiblePosition` false-positive class
  (`MAX_RETRY_COUNT`-in-a-comparison) was already fixed by the AST rewrite
  in §3a** (this doc, unchanged) at the time of this review pass — verified
  by direct reproduction against `6aaeb6f3`: a line with no JSX/string
  literal produces no visible span, so `R1` cannot fire on it. No further
  code change was needed for this item; it is recorded here because the
  review flagged it against the same head.
- **Not fixed in this pass (out of the owned paths for this packet):** the
  required check `Terminal typecheck + tests` was independently red on
  `terminal/e2e/marker-tooltip.spec.ts` (an unrelated, un-owned file) at
  head `6aaeb6f3`. Re-establishing a fresh, non-inherited CI proof for this
  PR's own head requires either a fix to that e2e spec (out of this
  packet's owned paths) or a fresh CI run demonstrating the red is
  base-inherited; neither can be completed by editing
  `check_plain_language.mjs` / `plainLanguageGuard.test.ts` / this doc alone.
  See the PR's "Review fixes" section for the current status of that item.
- **Not a code change:** the "single declared source" vs "#519 reuse"
  framing in §3 is unchanged by this pass — `PLAIN_VOCABULARY` remains the
  base declared source, with the `#519` overlay merged in additively once
  present, exactly as documented above (and now correctly enforced with
  whole-word matching per the first bullet). Re-litigating that design
  choice is out of scope for a review-fix pass.
