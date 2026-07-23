<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mastermind-agent-laws (added 2026-07-23 after the onboarding-flow postmortem) -->
# Mastermind Terminal — agent laws

## Model routing
Opus builds and reviews code. Design choices are judgment work — made in the session's main loop (or an Opus designer agent), never delegated to Sonnet; builders only implement fully-specified designs (exact markup/classes handed to them). Sonnet = mechanical non-code sweeps only; Haiku = trivial extraction.

## Design law (user-facing surfaces)
- The design system is REAL and locked: `app/globals.css` (Terminal v5) + `app/observatory.css` (`.obs` scope) — read them and `DESIGN_OBSERVATORY.md` before styling anything. New surfaces match the v5 idiom unless the commissioning brief pins a different reference — then the reference files WIN over house idiom.
- Reference images must be actual files (committed under `design_refs/` or given as absolute paths). If a brief describes a look only in words, STOP and ask for the files before designing.
- Pin the design (exact markup/CSS) before fanning out any builder agents.

## Verification law (what "done" means)
- A user-facing flow is NOT done until a fresh incognito end-to-end pass succeeds with zero manual workarounds — no reload-to-recover. If you hit a race and work around it, the bug is yours to fix, not to route around.
- Every UI PR carries its verification artifact in the body: screenshots/crops of each step and state (light + dark + zh via the LEX i18n tuples — zh strings must never leak into the EN view, and vice versa).
- Flagship surfaces (auth, onboarding, billing, anything the operator will demo) do NOT self-merge on the first pass — post the PR with artifacts and wait for review.

## Repo facts
Next.js 16 + Supabase; entitlements authority = macro-api (`profiles.is_pro` is a UI hint only); i18n via LEX `[en, zh]` tuples in `lib/i18n.tsx`; tests = vitest, golden fixtures in `lib/__tests__/fixtures/`. The main checkout is often on another agent's branch — ALWAYS `git worktree add` off `origin/master`; never touch the main checkout's git state.
<!-- END:mastermind-agent-laws -->
