# Mastermind Terminal — shared agent operating rules

This repository and Macro Dashboard are operated by multiple Claude accounts and
Codex sessions. Repository files are the durable, shared source of instructions;
promises or “memory” recorded only inside one chat do not carry to another session.

## Required context at the start of every task

1. Read `terminal/AGENTS.md` and `terminal/CLAUDE.md` in full before changing the
   Next.js application.
2. Search the Claude project memory index at
   `~/.claude/projects/-Users-chriswong-Documents-Cluade-charting-app/memory/MEMORY.md`
   and open the relevant entries. Delivery work must include
   `git-flow-commit-pr-merge-habit`, `prod-repo-is-stale`, and `deploy-topology`.
3. Treat `/Users/chriswong/Documents/Cluade/Macro Dashboard` as the connected
   dashboard/backend repository. Authentication, subscriptions, data contracts,
   APIs, Caddy routes, and deployment changes may require checking both repos.

## Workspace and git

- The canonical project home is `/Users/chriswong/Documents/Cluade`.
- Never create project work in `~/.codex/worktrees`, `/private/tmp`, or another
  Codex-only location. Never use a `codex/` branch for these repositories.
- The primary checkout is shared and commonly dirty. Do not change its files or git
  state. Fetch `origin/master`, then create a fresh worktree under this repository's
  `.claude/worktrees/<task>/` using a `claude/<task>` branch.
- Never reuse a squash/merge-completed branch and never use the repo-global stash.

## One responsive Terminal

- `terminal/` is the only product implementation for desktop, tablet, and mobile. Do not create
  device-specific repositories, long-lived mobile branches, duplicated API routes, or separate
  business-logic implementations.
- `feat/mobile-terminal-redesign` and the historical `charting-app-mobile` worktree are retired
  development artifacts, not delivery targets. New work starts from `origin/master`.
- Every user-facing Terminal change must be verified at 1440×900 desktop, 820×1180 tablet, and
  390×844 mobile. Run `npm run test:e2e:responsive` from `terminal/`; update the shared responsive
  shell and test together when behavior intentionally changes.

## Native app shells (`apps/`)

- The installable iPhone/iPad/macOS apps (later Windows/Android) are thin native hosts around the
  Terminal, governed by `docs/NATIVE_APPS_ALPHA_MASTERPLAN_2026-07-30.md`.
- Native code under `apps/` may implement presentation and OS integration only: navigation chrome,
  lists/sheets rendering data fetched from published Terminal HTTP APIs (`/api/*`, `/data/*`),
  OS features (share, keychain, haptics), and WebView hosting of Terminal routes in shell mode.
- Native code must never re-implement chart rendering, indicator/signal math, entitlement logic,
  or any analysis; those live only in `terminal/` and its backends. If a native screen needs data
  that no published API provides, add the API to `terminal/` first.
- The Options suite is excluded from every installable alpha surface (feature manifest + webview
  route policy) while remaining untouched on the web.
- Native binaries are build artifacts, never VPS deploys; the web delivery chain is unchanged.

## Definition of done

For every substantive, verified change, complete the full delivery chain without
asking the operator to finish it:

1. commit;
2. push;
3. open a pull request against `master`;
4. check CI and resolve genuine failures;
5. merge and delete the remote branch;
6. deploy the merged `origin/master` through the git-gated
   `/opt/terminal/terminal-build.sh`;
7. verify the expected marker and behavior on `https://app.mastermind-x.com`.

The operator granted standing authorization on 2026-07-30 for this entire
commit → push → PR → CI → merge → production deploy → live verification chain.
Do not wait for a separate request to commit, push, merge, or deploy.

Do not stop at a local commit or open PR. The only holds are an explicit operator
request to hold, a genuine failing check, or a real deployment blocker. Direct
working-tree rsync/scp is not a deployment; production builds only merged master.
If a later step is blocked, first commit and push the completed work to a
recoverable remote branch, then report the exact blocker. Never leave completed
work only as uncommitted changes in a session.

## Merge-on-green controller

- After opening a non-draft pull request that is ready to ship, add the
  `merge-on-green` label and arm GitHub native auto-merge with
  `gh pr merge --auto --squash --delete-branch`. `master` protects the exact three
  CI checks, so this is a real server-side wait. Use `hold` or `do-not-merge` as
  an explicit veto and never combine either with auto-merge.
- `.github/workflows/merge-on-green.yml` is the repository fallback for sessions
  interrupted while CI runs. It requires the latest instance of all three CI jobs
  to succeed, refreshes stale heads onto current `master` and waits for fresh CI,
  refuses forks/drafts/conflicts, SHA-pins the squash merge, and deletes the remote
  branch. It is the orphaned-PR fallback and defense-in-depth behind native
  auto-merge, not a second definition of green.
- `merge-blocked` means the latest required CI is red or the branch has a real
  conflict. Fix the head; do not use an admin bypass. The controller removes the
  label automatically after the new head is green.
- The controller moves only the merge wait off the interactive session. The
  initiating session still owns the git-gated production deployment and live
  verification required above; an armed PR is not a completed delivery.
- If branch protection or any required-check context is changed, update this
  section, `.github/workflows/merge-on-green.yml`, and the controller tests in the
  same PR. Disabling protection makes native auto-merge unsafe again.

When an operating standard changes, update the repository's `AGENTS.md`,
`CLAUDE.md`, and any nested agent guide together so Codex and every Claude account
inherit the same rule.
