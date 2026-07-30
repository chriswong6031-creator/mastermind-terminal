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

Do not stop at a local commit or open PR. The only holds are an explicit operator
request to hold, a genuine failing check, or a real deployment blocker. Direct
working-tree rsync/scp is not a deployment; production builds only merged master.

When an operating standard changes, update the repository's `AGENTS.md`,
`CLAUDE.md`, and any nested agent guide together so Codex and every Claude account
inherit the same rule.
