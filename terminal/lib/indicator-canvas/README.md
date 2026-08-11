# IndicatorCanvas — builder brief (W0, premium suites program)

Frozen contract: `types.ts` (read it first, in full). Program docs:
`docs/PREMIUM_INDICATOR_SUITE_MASTERPLAN_2026-07-28.md` (§5–§8, §11) and
`docs/PREMIUM_INDICATOR_VISUAL_DESIGN_BIBLE_2026-07-28.md` (per-module visual specs — your module's
section is your visual acceptance bar). UI doctrine: `docs/TERMINAL_UI_DOCTRINE_2026-07-28.md`.

## Architecture (who does what)

- **Module** (`terminal/lib/suites/<suite>/<module>.ts`): pure `ModuleCompute` over bars+settings →
  `ModuleResult` (prims/candlePaint/tooltips/events). No DOM, no chart imports, no CSS reads, no
  Date.now/Math.random. Deterministic → unit-testable.
- **Host** (`host.ts`): merges module defaults, splits `indParams[suiteKey]`'s flat
  `"<mod>.<field>"` keys per module, resolves `SuiteColors` from CSS tokens once, runs enabled+
  entitled modules, memoizes per (suite, symbol, tf, barsLen:lastT, paramsHash, tier), applies
  MAX_PRIMS caps, returns a `SuiteRenderBundle`.
- **Renderer** (`render.ts`): draws `Prim[]` into the existing indicator SVG overlay each frame via
  a `CoordMapper` ChartPanel provides. Culling: skip prims fully outside `[i0-2, i1+2]`; clamp
  zone/line x to the viewport with ±40px slack (do NOT drop a zone whose i1 is far left of view).
  Density: honor `minPxPerBar`. Tooltips: elements carrying `tooltipId` are marked `data-ic-tip`
  and NOTHING in the layer is ever made hit-testable — `pointer-events:none` covers the whole
  overlay. Hover/tap is resolved in JS by delegated listeners on the chart wrapper, which measure
  the `data-ic-tip` elements (intersected with their `g[clip-path]` window, so a clipped-invisible
  prim cannot ghost-hit) and raise/hide one shared HTML tooltip div. `pointer-events:auto` on a
  prim is FORBIDDEN and is not a smaller version of this: the lightweight-charts canvas is a
  sibling subtree of the overlay, so a hit-testable prim deletes pan, wheel-zoom and crosshair over
  its own footprint. `lib/markerTooltip.ts` carries the full argument and the shared helpers.
- **ChartPanel integration** (done by the main session, not by builder agents): builds the mapper
  from `logicalToCoordinate`/`priceToCoordinate`, calls the renderer inside `renderIndOverlays()`,
  applies candlePaint via the `applyRibbonCandleColors` pattern, forwards events.

## Laws (violations fail review)

1. **Colors**: modules use `ctx.colors.*` ONLY — zero hex/rgba literals in module files. Renderer
   may use rgba() only to apply alpha to a passed color. Direction = `up/down` (flips under
   `html[data-updown="east"]`); aggressor volume = `flowBuy/flowSell` (never flips); exhaustion =
   `warn`. Do not use candle colors for non-directional chrome.
2. **Typography**: renderer text uses `var(--font-num)` for numerals, `var(--font-ui)` otherwise;
   sizes from the `--fs-*` ramp (label default 10px). `font-variant-numeric: tabular-nums`.
3. **Alpha discipline**: zone fills ≤0.18, bgshade ≤0.10 (renderer clamps — but emit sane values).
   The chart must stay readable with every module on.
4. **Density**: an SMC chart that prints everything is unusable. Respect each module's `showLast`-
   style settings; emit `minPxPerBar` on dense chrome (per-zone stat chips etc.).
5. **i18n**: field labels are plain English (registry precedent). On-chart label text that is
   user-language-sensitive takes `ctx.lang` (keep chart microcopy language-neutral where possible:
   "BOS", "CHoCH", "▲ 72%", "TP1 ✓" need no translation).
6. **Determinism**: same inputs → same output. No wall-clock, no randomness, no module-level
   mutable state that leaks across calls.
7. **Perf**: single pass over bars where possible; no O(n²) over full history (pivot scans bounded
   by lookback windows). Target <10ms for 5k bars per module.

## File ownership (W0)

| File | Owner |
|---|---|
| `types.ts` (frozen), `README.md`, ChartPanel/TerminalShell/IndicatorsModal edits, `suites/registry.ts` final | main session |
| `render.ts` | renderer agent |
| `host.ts`, `candlePaint.ts` | host agent |
| `components/IndicatorSettings.tsx` + settings CSS + `--flow-buy/--flow-sell` tokens | settings agent |
| `suites/structure/pivots.ts`, `suites/structure/marketStructure.ts` | market-structure agent |
| `suites/structure/orderBlocks.ts` | order-blocks agent |
| `suites/structure/fvg.ts` | fvg agent |
| `lib/pine-engine/runtime.ts` warning honesty | pine agent |
| `lib/__tests__/suiteModules.test.ts` | tests agent (stage 2) |

Do not edit files you do not own. If a contract gap blocks you, note it in your report — do not
change `types.ts`.
