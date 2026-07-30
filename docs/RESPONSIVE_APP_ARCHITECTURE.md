# Responsive Terminal architecture and mobile-worktree retirement

Status: adopted 2026-07-29.

## Decision

Mastermind Terminal is one responsive Next.js application in `terminal/`. Desktop, tablet, and
mobile use the same routes, data sources, chart engine, indicator code, preferences, and release
train. Breakpoint-specific presentation is expected; a second mobile application is not.

This is normal for a rich web application, not something limited to static HTML. React and Next.js
are designed to share application logic while CSS media queries and small responsive components
adapt the interface to available space and input type.

The historical directory `/Users/chriswong/Documents/Cluade/charting-app-mobile` is not a separate
Git repository. Its `.git` file points back to the canonical repository as a Git worktree on the
old `feat/mobile-terminal-redesign` branch. That worktree existed to let development happen in
parallel; it was never an architectural requirement.

## Current-state audit

Audit date: 2026-07-29.

- Canonical release branch: `origin/master`.
- Legacy branch: `feat/mobile-terminal-redesign`, last source commit 2026-06-30.
- Divergence at audit time: legacy had 53 commits not patch-equivalent to master; master had 400
  newer commits.
- The current responsive shell on master already contains the mobile navigation, symbol bar,
  drawer, timeframe sheets, touch targets, safe-area padding, stable mobile viewport sizing,
  single-column chart behavior, and the 1h/2h/4h intraday route.
- Runtime files introduced by the old branch are present or superseded on master. In particular,
  its old `SettingsMenu` became the current `components/settings/` system, and its standalone
  `StrategyTester` backtest display is superseded by `components/fin/OracleDash`.
- The legacy worktree is source-clean outside generated market data, but it contains 1,688
  uncommitted data entries: 31 modified files and 1,657 untracked files under
  `terminal/public/data/`.

## Retirement rule

Do **not** delete the legacy directory in place while those uncommitted files exist. Deleting the
directory would destroy data that Git cannot restore.

Safe retirement is:

1. Classify the 1,688 data files as regenerated cache, data to publish, or data to archive.
2. Copy any non-regenerable output to an explicit archive outside the worktree and verify it.
3. Remove the worktree with `git worktree remove` only after it is clean.
4. Keep an archive tag for the legacy branch tip until one release cycle has passed, then delete
   the old branch if no missing behavior is reported.

Never delete the canonical repository or treat the worktree directory as an independent clone.

## Enforcement

- `AGENTS.md` and `terminal/AGENTS.md` require all future UI work to target the canonical app.
- `terminal/e2e/responsive.spec.ts` runs the real shell at 1440×900, 820×1180, and 390×844.
- CI checks the desktop/mobile chrome swap, chart visibility, mobile navigation and timeframe
  sheet, 4h availability, and horizontal overflow.
- Provider limits and timeframe correctness remain unit-tested separately; responsive UI tests
  should not duplicate business-logic assertions.
