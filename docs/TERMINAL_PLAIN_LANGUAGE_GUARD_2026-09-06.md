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

The guard only **blocks** on a finding whose line was added by the current
diff against `origin/master` (or the diff supplied via `--diff-file`). Any
other finding in a touched file is still surfaced, under the header
`legacy (pre-existing, not blocking)`, but never fails the run. This mirrors
the macro precedent's `--mode enforce-added`: an untouched legacy file can
never turn a PR red just because the checker learned a new rule. `--mode
report` always exits 0 and prints a full census regardless of diff status.

## 3. Vocabulary

`PLAIN_VOCABULARY` at the top of `check_plain_language.mjs` is the single
declared source: `stateEnums` (token → `[en, zh]` phrase pairs), `studySlugs`,
`slugFields`, `statTokens`, `plainHelpers`, and `allowTokens`. Extend it there.

**Optional overlay:** if `terminal/lib/plainLabels.ts` exists in the scanned
tree, the guard reads it as text (never imports it — it is TypeScript and, as
of this writing, lives only on open PR #519) and harvests additional label
keys/helper names into the working vocabulary. If absent, the guard prints a
disclosed null (`vocabulary overlay ABSENT: ...`) and continues on the
declared vocabulary alone. Its absence or presence never changes exit
semantics on its own.

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

## 7. Known gaps (printed, not hidden)

- **Regex detection, not AST.** Multi-line JSX text and line-spanning template
  literals are false negatives. An AST pass would need a TS parser dependency
  this packet may not add (`terminal/package.json` is out of scope).
- **CI base resolution is untested end-to-end.** `actions/checkout@v4` at
  default depth likely cannot resolve `origin/master` inside the `terminal`
  job, so the repo-wide `--since origin/master` path may always take the
  disclosed fail-open branch in CI. This is why the CI proof for this packet
  runs through the vitest suite's own `--diff-file` fixtures rather than a
  live repo-wide scan. If checkout depth ever changes and full history
  becomes available, the `--since` path starts working with no code change;
  if it stays shallow, the disclosed fail-open is the correct, non-silent
  outcome — never a false green on a real violation.
