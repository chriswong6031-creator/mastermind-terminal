# Mastermind Terminal — Wave 2: Five-Workspace IA Re-org (2026-07-19)

Operator-approved follow-on to Wave 1 (`docs/MM_TERMINAL_WAVE1_REVAMP_2026-07-19.md`).
Goal (assessment §"Reduce the product to five primary workspaces"): navigate by JOB, not by
internal model name. The current 8-item rail (Chart, Analyst, Screener, Scripts, Portfolio,
Alerts, Options, Heatmap) + an 11-tab Options hub displays organizational history; a
professional user thinks "find → analyze → automate → review".

## The five workspaces

| Workspace | URL | Job | Contents (sub-tabs, in order) |
|---|---|---|---|
| **Chart** | `/terminal` | analyze one name deeply | unchanged — the stable center (own shell, chart toolbar, rail, in-shell fundamentals MegaPane) |
| **Discover** | `/discover?tab=…` | find setups | `screener` Stock Screener (ex-/screener) · `heatmap` Heatmap (ex-/heatmap) · `leaders` Leaders (ex-flow tab) · `radar` Leader Radar (ex-flow tab) |
| **Research** | `/research?tab=…` | market/options intelligence | `tape` Options Tape · `desk` Flow Desk · `tide` Tide · `tickers` Tickers · `vol` Options Screener (ex-flow "screener"/vol) · `gex` GEX · `prism` PRISM · `prophet` Prophet · `fundamentals` → deep-links `/terminal?pane=overview` (cross-jump, labeled) |
| **Automate** | `/automate?tab=…` | set-and-forget | `alerts` Alerts (ex-/alerts) · `scripts` Pine Scripts (ex-/scripts) |
| **Portfolio** | `/portfolio` | review holdings/conviction | unchanged content |

Naming rules: plain-word tab labels; proprietary names (GEX/PRISM/Prophet) survive as tab
labels only WITH their existing zh translations — never as top-level destinations. The
"Screener" collision resolves by label: Discover › **Stock Screener** vs Research ›
**Options Screener**. The old "Analyst" rail item disappears (fundamentals reachable from
the chart rail, "Open full analysis", and Research › fundamentals).

## Architecture

1. **One shared chrome** — `components/chrome/AppShell.tsx` (generalization of Wave-1's
   FlowChrome: `{ title, children }`, .app2 grid + MobileNav + topbar/BrandLockup + AppNav +
   lang toggle) owned by a route-group layout `app/(shell)/layout.tsx`. Every non-chart
   route mounts content-only inside it. This completes the Wave-1 P1 (chrome was
   hand-duplicated in 8+ views): ScreenerView / AlertsView / PortfolioView / AdminView /
   heatmap / scripts views are stripped to content-only.
2. **Workspace sub-nav** — one `WorkspaceTabs` component (v6 pill idiom, `?tab=` driven,
   `router.replace` shallow updates, keyboard accessible, per-workspace tab registry).
   Heavy tabs stay lazy: the OptionsHubView engine already lazy-loads each tab view —
   preserve that (mount-on-first-visit, keep-mounted-after).
3. **OptionsHubView parameterization** — it becomes the Research workspace engine:
   `allowedTabs` prop + tab state lifted to the URL (`?tab=`); `leaders`/`radar` render
   under Discover via the same lazy components (extracted mount points, shared data hooks
   untouched). No rewrite of tab content.
4. **Redirect contract** (next.config `redirects()`, permanent):
   `/screener → /discover?tab=screener` · `/heatmap → /discover?tab=heatmap` ·
   `/alerts → /automate?tab=alerts` · `/scripts → /automate?tab=scripts` ·
   `/flow?tab=leaders|radar → /discover?tab=…` (query `has` matchers) ·
   `/flow` (+ any other tab) `→ /research` with query passthrough.
   Old page directories are DELETED (redirects own the URLs). Bookmarks, the macro
   dashboard's cross-links, and `?v=2` cache-busted heatmap links all keep working.
5. **AppNav** — five items + AI: Chart · Discover · Research · Automate · Portfolio.
   New glyphs: Discover = radar/compass, Research = flask/microscope-style (keep line
   style, 1.7 stroke), Automate = bolt/loop, Portfolio = existing pie. `TOP` stays the
   single source of truth; MobileNav derives from it (unchanged contract). Active-key
   logic: path-prefix per workspace; the `mm:pane-state` Analyst special-case is deleted.
6. **i18n** — new keys (discover/research/automate + tab labels) EN+ZH in lib/i18n dict,
   following existing key style. No translated text in `title=`.
7. **Auth/user plumbing** — old pages passed `email` to views; the (shell) layout resolves
   the user ONCE (same supabase pattern the old pages used) and passes it down. Admin stays
   off-nav (direct URL only) but gains the shared shell.

## Non-goals (unchanged this wave)

/terminal internals · MegaPane · login/landing · /x/[slug] · admin content · any tab's
internal features. This is navigation + shell + routing ONLY; zero feature regressions.

## Verification gates

tsc + vitest green · every old URL redirects correctly (curl matrix) · all 13 destination
tabs render under the new workspaces (live walk) · mobile drawer mirrors the five
workspaces · lang toggle + east flip intact · no route renders without chrome · Research
tab deep-links (`/research?tab=gex`) land on the right tab cold.
