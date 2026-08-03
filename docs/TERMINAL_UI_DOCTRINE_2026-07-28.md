# Terminal UI Doctrine — Institutional SaaS pass (2026-07-28)

**Binding spec for every builder agent on this wave.** Commissioned reference: the Macro
Dashboard / landing design framework. Reference files (absolute paths, read-only):

- `/Users/chriswong/Documents/Cluade/Macro Dashboard/templates/theme.css` — token truth
- `/Users/chriswong/Documents/Cluade/Macro Dashboard/templates/dashboard.html.j2` — the
  `body.page-macro` layer (panel/rail/type-ramp system; the newer, deliberate scale)
- `/Users/chriswong/Documents/Cluade/Macro Dashboard/scripts/build_vector.py` — `_GLOBE_HUB_CSS`
  landing glass/segment/accent patterns
- House files: `terminal/app/globals.css` (locked v5 + v6 tokens), `terminal/app/fin.css`,
  `terminal/app/observatory.css`, `terminal/DESIGN_OBSERVATORY.md`

Per repo law the commissioned reference wins over house idiom **for look**, but four Terminal
laws are structural and survive every restyle:

1. **Numerals**: Inter (`var(--font-num)`) + `font-variant-numeric:tabular-nums` on every
   numeral site. NEVER mono for financial numerals (mono = `--font-code`, character-cell
   surfaces only). The `font:` shorthand resets `font-variant-numeric` — re-declare it.
2. **Direction colors**: `var(--up)` / `var(--down)` / `var(--buy)` / `var(--sell)` ONLY —
   never hex, never `rgba(38,194,129,…)` / `rgba(240,86,107,…)` literals (they break
   `html[data-updown="east"]`). Tints via `color-mix(in srgb, var(--up) N%, transparent)`.
   Health ≠ direction: `--warn` / `--signal` / `--danger` never flip; don't use them for
   direction, don't use up/down for health.
3. **i18n**: every user-visible string is `pick(zh, "EN", "中文")` (fin pages) or a LEX
   `t()` key (shell). Reworded copy ships BOTH languages. zh must never leak into EN and
   vice versa.
4. **Dark-only**: the Terminal is `data-theme="dark"` hard-coded. Do not add light-theme
   rules; do not import the macro light block.

## What "the framework" transfers (the gap this wave closes)

| Macro/landing signature | Terminal translation (this wave) |
|---|---|
| Panels: 14px radius, `--pad` 20px, layered shadow (`--ms`) | `--r-card:14px`, card padding 16/18px, `--shadow-card` |
| Section `h2` with 3px gradient rail + hairline rule | `.fin-sec-h.rail` / `.rule` + per-section `--rail` color |
| Uppercase tracked eyebrow labels | `.fin-eyebrow` (10px/700/.14em, `--muted`) |
| Universal tint formula (one `--c` → bg/text/border via color-mix) | `.fin-tag` + retrofit of every hardcoded-rgba chip |
| Deliberate type ramp (10 steps, no ad-hoc px) | use v6 `--fs-*` tokens exclusively in new/edited rules |
| 4px spacing grid (`--sp-1..8`) | defined for real in globals v7 (kills the undefined-token trap) |
| Brand-tinted active states (landing `hub-seg`, macro navbtn) | pills/tabs/toggles `.on` = brand tint, not white fill |
| Hover lift + accent glow, `.14–.22s`, reduced-motion respected | interactive cards/rows only; `--t-fast`/`--ease-out` |
| Honest chrome: as-of / source / freshness on every data surface | `.fin-asof` row on every data section |

Explicitly NOT transferred: mono numerals, light theme, macro's `--up/--down` hues
(terminal keeps `#26c281/#f0566b` — wired into canvas RGB math), aurora ambience on the
Analyst pane (chart stays the hero; the options hub keeps its existing `.obs-ambient`).

## Foundation layer (already implemented by the orchestrator — DO NOT re-add)

New tokens in `globals.css` (v7 block, additive):

```css
--sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px; --sp-8:32px;
--r-card:14px; --r-tile:10px;
--shadow-card:inset 0 1px 0 rgba(255,255,255,.045),0 1px 1px rgba(0,0,0,.22),0 12px 28px -18px rgba(0,0,0,.5);
--shadow-2:0 8px 24px rgba(0,0,0,.45);
--shadow-3:0 18px 44px -14px rgba(0,0,0,.6);
--rail:var(--brand);
```

New/updated primitives in `fin.css` foundation block:

- `.fin-card` → `border-radius:var(--r-card); padding:var(--sp-4) 18px; box-shadow:var(--shadow-card)`
- `.fin-eyebrow` → `font:700 var(--fs-micro)/1 var(--font-ui); letter-spacing:.14em; text-transform:uppercase; color:var(--muted)`
- `.fin-sec-h.rail::before` → 3px×16px rounded gradient bar from `var(--rail)`
- `.fin-sec-h.rule` → hairline bottom border + padding
- `.fin-tag` → the tint formula: `color:var(--c); background:color-mix(in srgb,var(--c,var(--muted)) 12%,transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c,var(--muted)) 30%,transparent)`; set `--c` per state (`--up`, `--down`, `--warn`, `--brand-2`, `--muted`)
- `.fin-tab.on`, `.fin-toggle button.on`, `.fin-tf-pill.on` → brand-tinted active
  (`color:var(--brand-2); background:color-mix(in srgb,var(--brand) 17%,transparent);
  inset 1px ring at 36%`) replacing the white fill
- `.fin-row:hover` → `background:var(--panel-2)` (tables finally answer the cursor)
- `.fin-cell-head` → uppercase + `.06em` tracking micro header
- `.fin-empty` → radius `--r-tile`, roomier padding, `.fin-empty-why` caption slot
- `.fin-asof` → generalized provenance row (10.5px, `--muted`), optional `.fin-asof .dot`
  live dot (`var(--up)`, pulsing, reduced-motion aware)
- East-mode bugfix retrofits (hardcoded rgba → color-mix): `.fin-chip.up/.down`,
  `.fin-adv-flag.up/.down`, `.sig-context-chip`

## Component recipes (copy these exactly)

**Section header** (every major section on every page):

```tsx
<div className="fin-sec">
  <div className="fin-eyebrow">{pick(zh, "VALUATION", "估值")}</div>
  <div className="fin-sec-h rail rule" style={{ "--rail": "var(--brand)" } as React.CSSProperties}>
    {pick(zh, "Valuation history", "估值历史")}
  </div>
  <div className="fin-sec-cap">{pick(zh, "…caption…", "…说明…")}</div>
  …content…
  <div className="fin-asof">{pick(zh, `Source · as of ${d}`, `数据源 · 截至 ${d}`)}</div>
</div>
```

Rail color semantics: brand = neutral/analytical, `var(--up)`/`var(--down)` ONLY when the
section itself is directional (e.g. verdict hero), `var(--warn)` for caution/disclaimer
sections. Eyebrow is optional where the tab title already says it — never duplicate the
exact same word in eyebrow + title.

**State chip**: `<span className="fin-tag" style={{ "--c": "var(--up)" }}>Bullish</span>` —
never a new bespoke chip class, never rgba literals.

**Empty state** (per the options-review findings, an empty state must explain itself):

```tsx
<div className="fin-empty fin-empty-lg">
  <svg className="fin-empty-icon">…</svg>
  <div className="fin-empty-title">{pick(zh, "No dividends on record", "无股息记录")}</div>
  <div className="fin-empty-why">{pick(zh, "COIN has never declared a dividend.", "COIN 从未宣派股息。")}</div>
</div>
```

The `why` line states WHICH of: market closed / dataset building / no qualifying rows /
not covered for this symbol — from data already in the component. Never a bare "No data".

**Loading**: skeletons (`.fin-skel*`) for every async block. Never an unexplained blank.

## Hard do-nots (any violation = the change is reverted)

- No logic, data-shape, fetch, route, or state-management changes. Styling, markup
  structure, class names, and copy only. If a visual fix seems to require logic, STOP and
  report back instead.
- No new dependencies, no CSS-in-JS, no Tailwind utility sprays in JSX (`className="flex
  gap-2 …"` is not this codebase's idiom) — semantic classes in the owned CSS block.
- No edits outside your assigned files/CSS block (file ownership list is in your brief).
  fin.css lane-block comments are real ownership markers — append inside your block only.
- No new fonts, no new hues, no gradients beyond the rail/skeleton/existing recipes, no
  glow-spam: one accent per surface.
- Never remove: `pick()` wrappers, `.num`/tabular declarations, `aria-*`/roles,
  `prefers-reduced-motion` guards, mobile `@media` blocks (extend them instead),
  `--font-num` on numerals.
- Don't touch `--r`, `--r-md`, `--r-lg` global values (locked v5 — the chart shell uses
  them). New rounding rides the new tokens.
- Keep every existing class name that tests or other components reference — additive
  classes, not renames. (`grep` before deleting anything.)
- Numbers right-aligned in tables; labels left; headers uppercase micro. Sticky first
  column keeps its `background:var(--panel)`.

## Definition of done (each builder reports)

1. `npx tsc --noEmit` clean for the touched files (run it).
2. Every touched section: EN + zh strings both present; no hardcoded direction colors
   (grep `#26c281|#f0566b|38,194,129|240,86,107` in your diff = must be zero).
3. A list of: files changed, sections restyled, copy reworded (en/zh pairs), any
   pre-existing bug found (report, don't fix outside styling scope).
4. No console `key`/hydration warnings introduced (dev-render the page if feasible).

## CSS-patch protocol (how builders ship styles)

Shared CSS files (`globals.css`, `fin.css`, `observatory.css`, `onboarding.css`) are
**orchestrator-owned this wave**. Builders NEVER edit them. Rules:

1. First, restyle by APPLYING the foundation primitives (classes above + existing
   families) in your TSX markup. Most of the look comes from markup, not new CSS.
2. Where a genuinely new/changed rule is needed, put a fenced block at the END of your
   final report:
   ```
   /* CSS PATCH — <your lane> — target: fin.css <lane block name> */
   .fin-xyz{…}
   ```
   One block per target file. Selector prefixes must stay inside your family
   (`.fin-…`, `.obs-…`). The orchestrator splices and reconciles all patches serially.
3. Inline `style={{}}` in the options suite: you MAY edit inline style values in your
   own TSX (that code's existing idiom) — radii/spacing/colors to doctrine values, using
   `var(--…)` tokens. Prefer swapping repeated inline clusters to an existing `.obs-*`
   class when one already matches; do not invent new classes without a CSS PATCH block.

## Surface map (worktree = origin/master, routes after the (shell) regroup)

- **`/analysis`** — `components/workspaces/AnalysisWorkspace.tsx` mounts
  `components/fin/MegaPane.tsx` (tab owner; 11 tabs: overview, statements, statistics,
  dividends, earnings, revenue, seasonals, forecast ["Analyst"], technicals, insider,
  lab). Pages in `components/fin/*`; SVG kit `components/fin/FinCharts.tsx` (frozen
  prop API); right-rail sibling `components/StockAnalysis.tsx` (`.sa-*`, out of scope
  this wave except where a brief says otherwise).
- **`/options`** — `components/workspaces/OptionsWorkspace.tsx` drives
  `components/OptionsHubView.tsx` (shell + inline tabs: tape, tide, tickers, screener +
  topbar) which lazy-loads: `components/flowdesk/*` (Desk), `components/gexdesk/*`
  (GEX), `components/shared/StrikeExpiryMatrix.tsx` + `components/gexdesk/{ExposureMatrix,MatrixConfluence,HeatSeekerCard}.tsx`
  (the ex-PRISM surfaces, merged into Exposure by §5.3 — `components/prism/*` is retired),
  `components/prophet/*` (Prophet),
  `components/surface/*` (Surface). Shared chrome: `components/chrome/WorkspaceTabs.tsx`.
- Shared primitives: `components/ui/{ArcGauge,RingGauge,Tip,MobileSheet}.tsx`.
- Out of scope: chart shell (`ChartPanel`, toolbars), `/discover` (heatmap/screener),
  `/portfolio`, `/alerts`, `/scripts`, onboarding, login.

## Mobile preservation (from the wave3 overhaul — break nothing)

- Canonical breakpoint **860px**; grid→flex collapse uses DIRECT-CHILD selectors
  (`.app2>.topbar` etc.) — do not change DOM depth of shell chrome.
- `MegaPane` dual-mode: `.fin-pane--workspace` positioning override lives ONLY in the
  `min-width:861px` block. Below 861 it's a fixed full-screen overlay.
- nth-child column-hiding at ≤640px is column-order-coupled (`.scr-table table.scr`
  etc.) — DO NOT reorder table columns.
- Keep: 40px tap-target floors, 10/11px font floors, `dvh/svh` heights,
  `touch-action`/`overscroll-behavior` containment, safe-area insets,
  `@media (hover:hover)` gating.
