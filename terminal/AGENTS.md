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

## Chart law (hand-rolled SVG)
Every inline SVG data chart MUST build on `components/charts/svgChart.ts` (useChartWidth,
niceTicks, padDomain, thinByPixelGap). Concretely: 1:1 pixel-space viewBox from a measured
container — never `preserveAspectRatio="none"` on a data chart (it distorts strokes) and never
a fixed-unit viewBox that caps the plot; domains take finite/positive-filtered values with
padding, zero unioned only when the series straddles it; axis labels thin by PIXEL GAP at
their mapped positions (never `i % n` on a value-mapped axis); tick formatting derives
precision from the step so two ticks can't render identically. The v7b wave fixed five charts
that each violated several of these — do not hand-roll a sixth way.

## Verification law (what "done" means)
- A user-facing flow is NOT done until a fresh incognito end-to-end pass succeeds with zero manual workarounds — no reload-to-recover. If you hit a race and work around it, the bug is yours to fix, not to route around.
- Every UI PR carries its verification artifact in the body: screenshots/crops of each step and state (light + dark + zh via the LEX i18n tuples — zh strings must never leak into the EN view, and vice versa).
- A spawned child builder does not self-merge a flagship first pass; it returns the PR and artifacts to the commissioning main session. The main session reviews them and completes the merge plus git-gated live deployment in the same task unless the operator explicitly requests a hold or a genuine check is red.

## Repo facts
Next.js 16 + Supabase; entitlements authority = macro-api (`profiles.is_pro` is a UI hint only); i18n via LEX `[en, zh]` tuples in `lib/i18n.tsx`; tests = vitest, golden fixtures in `lib/__tests__/fixtures/`. The main checkout is often on another agent's branch — ALWAYS `git worktree add` off `origin/master`; never touch the main checkout's git state.

## Responsive product contract
- This directory is one responsive Next.js application. Desktop, tablet, and mobile share routes,
  data fetching, chart logic, indicator logic, and settings; breakpoint-specific chrome is allowed,
  a separate mobile implementation is not.
- A user-facing change is incomplete until `npm run test:e2e:responsive` passes at the repository's
  three contract viewports (1440×900, 820×1180, 390×844). Preserve safe-area handling, mobile
  navigation/sheets, usable touch targets, and zero horizontal document overflow.
- Never target the retired `feat/mobile-terminal-redesign` branch or `charting-app-mobile`
  worktree. They are historical recovery references only; canonical work starts from
  `origin/master`.
<!-- END:mastermind-agent-laws -->
