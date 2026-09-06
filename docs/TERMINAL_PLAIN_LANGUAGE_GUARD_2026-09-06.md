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

- **Regex detection, not AST.** Multi-line JSX text and line-spanning template
  literals are false negatives. An AST pass would need a TS parser dependency
  this packet may not add (`terminal/package.json` is out of scope).
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
