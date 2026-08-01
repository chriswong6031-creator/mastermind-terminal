# OpenMarket Drawing System — Current Implementation Reconciliation

**Status:** Current reconciliation; merged baseline plus an explicitly marked
unmerged follow-up overlay

**Mastermind baseline:** merged `origin/master` at `10d920de4ece75e861e1ebafae9678498cc3c4cf`

**Current follow-up tree:** `claude/openmarket-parity-reconciliation-20260731`
(working-tree implementation; not yet merged or production-verified)

**Audit date:** 2026-07-31

**Reference product:** [OpenMarket Chart](https://openmarket.xyz/chart/)

## Source boundary

This memo reconciles three different kinds of evidence:

1. OpenMarket's first-party
   [Drawing Tools guide](https://openmarket.xyz/learn/charting/drawing-tools),
   including its catalog, toolbar, favorites, Stay, magnet, lock, visibility,
   removal, keyboard, Replay, and multi-chart behavior;
2. the supplied OpenMarket captures and the live first-party chart menu/runtime;
3. the implementation and automated contracts in Mastermind Terminal.

The Drawing Tools guide is the primary specification for this comparison. Its
nine groups and 99 named tools define the catalog, while its interaction
sections define behaviors such as hover/touch flyouts, double-click pinning,
Brush/Highlighter auto-repeat, draggable favorites, Off/Weak/Strong magnet,
global lock/visibility/removal, keyboard dismissal, and creation restrictions
during Replay or multi-chart layouts. Live observation and supplied captures
fill visual details that the guide does not quantify.

OpenMarket's separate [Data API documentation](https://openmarket.xyz/docs/index.md)
is authoritative only where this memo discusses data products such as
[Volume Profile](https://openmarket.xyz/docs/rest/volume-profile.md) and
[TPO / Market Profile](https://openmarket.xyz/docs/rest/tpo.md); it is not the
source for the drawing catalog or toolbar behavior.

This file records code capability. Deployment and live-production evidence
belong in the delivery pull request and operator handoff; this memo does not
infer either from a merged commit.

## Status language

- **Registered** — present in the canonical registry and durable `DrawKind`
  union.
- **Renderer-covered** — assigned to an explicit renderer family and accepted
  by the creation/persistence contracts.
- **Interaction-verified** — exercised directly by a focused unit or browser
  test, not merely reachable through a menu.
- **Delivered** — an end-to-end baseline exists for the stated scope.
- **Delivered in branch** — implemented and interaction-verified in the current
  follow-up tree, but not yet merged, deployed, or live-verified.
- **Partial** — useful behavior exists, but material reference behavior,
  settings, fidelity, or verification is absent.
- **Not implemented** — no current product workflow exists.

Registered and renderer-covered do **not** mean semantically identical to
OpenMarket. A generalized renderer can draw a credible Gann, Elliott, harmonic,
or forecasting object without reproducing every reference formula, constraint,
label, setting, and editing rule.

## Executive verdict

Mastermind now exposes the exact 99-tool comparison catalog across nine
registry-driven groups. All 99 tools have durable identities, creation metadata,
localized labels, defaults, capability declarations, persistence validation,
and an explicit renderer-family assignment. The same registry drives the
desktop rail and responsive dock.

That is **catalog coverage**, not complete OpenMarket parity. The implementation
has strong shared creation, selection, styling, history, persistence, and
responsive foundations, plus direct interaction proofs for flagship geometry,
freehand input, pane-anchored notes, and media placement. It does not yet have
reference-grade semantic and settings depth for every advanced tool, a spatial
hit-test engine, drawing views/object management, or every OpenMarket chart
presentation.

The honest current claim is:

> Mastermind has a 99-tool, nine-group OpenMarket-aligned drawing catalog with
> complete registry and renderer-family coverage, plus verified flagship
> workflows. Full per-tool semantic and interaction parity is still partial.

## Historical 21-tool checkpoint

Commit `8f5b583c` represented the earlier 21-tool, seven-group foundation. Its
inventory is superseded by the 99-tool expansion completed in `f90ded24` and
merged in `10d920de`. The number 21 is historical and must not be used to
describe the current product.

## Current follow-up wave — validated branch, release pending

The current reconciliation branch adds a second fidelity wave on top of the
merged `10d920de` baseline. These changes were inspected in source and exercised
by focused unit and browser contracts in this working tree. Until the branch
merges, deploys, and passes live verification, they must be described as
**delivered in branch**, not as merged, shipped, or OpenMarket-parity complete.

### Tool-specific analytics

- **Regression Trend:** least-squares close-price regression, residual standard
  deviation bands, Pearson correlation, and an on-chart `R` / sigma readout.
- **Anchored VWAP:** cumulative typical-price VWAP using actual positive volume,
  online volume-weighted variance, and visible plus/minus one, two, and three
  standard-deviation bands.
- **Fixed Range Volume Profile:** candle-range-overlap volume allocation across
  24 price bins, point of control, and an outward-growing 70% value area.
- **Ghost Feed:** deterministic scenario candles that follow the user's control
  path while inheriting noise and wick scale from recent realized volatility.

These are materially stronger semantics than the merged generalized renderers.
They still do not prove identical exchange aggregation, formulas, defaults,
settings, or output to OpenMarket.

### Professional creation and editing interactions

- two-anchor tools support drag placement and stationary click-then-click
  placement;
- holding Shift constrains applicable endpoints to the nearest 45-degree screen
  angle before magnet snapping;
- whole-object movement applies one boundary-clamped bar delta to every anchor;
- Command/Ctrl-drag clones an unlocked drawing, while Command/Ctrl+C and
  Command/Ctrl+V provide a chart-local drawing clipboard;
- right-click cancels an armed or pending tool, and Escape gives an open
  portalled drawing menu first refusal before retiring the tool or selection.

The pure regression/AVWAP/profile/Ghost Feed and interaction helpers have
focused unit coverage in the branch. Their professional creation/editing paths
also have focused desktop browser coverage and pass within the exact shared
desktop/tablet/mobile responsive suite.

### Settings and workspace controls

The branch contains settings helpers and inspector UI for all 24 Fibonacci
slots: every ratio value, visibility state, and color is editable, with reverse
and ratio/price/both label preferences consumed by the renderer. Position tools
accept account value and risk as either a percentage or a fixed money amount,
then render the resulting risk budget and quantity. The selected-object quick
bar shows the current color, two persisted recent colors, and a full color
picker. The branch also contains a persisted, draggable favorites strip,
separate desktop/compact positions, per-family
last-used faces, global drawing lock/unlock, clearer Stay-versus-per-tool-pin
behavior, freehand keep-active behavior, and drawing/indicator cleanup scopes.

The workspace controls are now shell-wired and localized in this branch.
Favorites can be starred from every family menu, appear in a draggable,
horizontally scrollable glass strip, retain separate desktop and compact
positions, and can be hidden from the rail, close button, or context menu.
Normal tools remain one-shot, double-click pins one tool until Escape,
right-click, or another tool; Brush and Highlighter remain armed after every
stroke without turning on the global Stay preference. The magnet face toggles
Off and Weak while its split arrow opens all three modes. Command/Ctrl+Alt+H
hides drawings, global lock/unlock is history-aware, and cleanup exposes user,
detected, all-drawing, indicator, and whole-workspace scopes with counts where
the shell owns an exact count.

Replay now retires creation, blocks the Shift-measure shortcut, and makes
existing drawings read-only while it is active. Multi-chart layouts retire and
disable creation but preserve editing of existing marks, matching the narrower
documented restriction. The active pane now reports its transient detector count
to the shell, so the cleanup menu's detected count and disable state follow the
pane-local detector lifecycle. Detect and clear commands carry their dispatch
pane identity, so activating another pane cannot replay a stale command there.
Playwright coverage passed for the registry/precision controls, favorites,
lifecycle/safety, freehand persistence, and mobile collision surface
at 1440×900, 820×1180, and 390×844. The exact responsive suite, full unit suite,
TypeScript check, and production build all pass locally. CI, merge, deployment,
and live production verification are still pending, so these remain branch
capability, not a production claim. Broader per-family settings and
reference-level semantic fidelity remain separate open work.

## Canonical 99-tool catalog

`terminal/lib/drawingTools.ts` is the catalog authority. It contains exactly
the same 99 durable identities declared by `terminal/lib/drawings.ts`.

| Group | Count | Registered tools |
|---|---:|---|
| Lines, Channels & Pitchforks | 17 | Trend Line, Ray, Info Line, Extended Line, Trend Angle, Horizontal Line, Horizontal Ray, Vertical Line, Cross Line, Parallel Line, Regression Trend, Flat Top/Bottom, Disjoint Channel, Pitchfork, Schiff Pitchfork, Modified Schiff Pitchfork, Inside Pitchfork |
| Fibonacci & Gann | 15 | Fibonacci Retracement, Fibonacci Trend, Fib Channel, Fib Time Zone, Fib Speed Resistance Fan, Trend-Based Fib Time, Fib Circles, Fib Spiral, Fib Speed Resistance Arcs, Fib Wedge, Pitchfan, Gann Box, Gann Square Fixed, Gann Square, Gann Fan |
| Patterns, Elliott Waves & Cycles | 14 | XABCD Pattern, Cypher Pattern, Head and Shoulders, ABCD Pattern, Triangle Pattern, Three Drives Pattern, Elliott Impulse Wave, Elliott Correction Wave, Elliott Triangle Wave, Elliott Double Combo, Elliott Triple Combo, Cyclic Lines, Time Cycles, Sine Line |
| Forecasting, Volume & Ranges | 12 | Long Position, Short Position, Forecast, Ghost Feed, Bar Pattern, Sector, Anchored VWAP, Fixed Range Volume Profile, Price Range, Date Range, Date and Price Range, Measure |
| Freehand | 3 | Brush, Highlighter, Path |
| Shapes & Curves | 9 | Rectangle, Rotated Rectangle, Ellipse, Circle, Triangle, Polyline, Arc, Curve, Double Curve |
| Arrows & Stylized Paths | 17 | Arrow Marker, Arrow, Arrow Mark Left, Arrow Mark Right, Arrow Mark Top, Arrow Mark Bottom, Flag Mark, Momentum, Flow, Emphasis, Whisper, Subtle, Divergence, Journey, Fork, 3 Paths, Burj |
| Text, Notes, Labels & Content | 10 | Text, Anchored Text, Note, Anchored Note, Callout, Price Label, Price Note, Signpost, Comment, Image |
| Emoji & Icons | 2 | Emoji, Icon |
| **Total** | **99** | Every durable `DrawKind` appears exactly once |

### Creation contracts

The registry declares five acquisition modes:

- **One point:** axis lines, marks, anchored VWAP, text/notes/labels, emoji, and
  icons place from one chart or pane anchor.
- **Two-point drag:** ordinary lines, ranges, circles, many advanced studies,
  and image placement commit on pointer-up.
- **Fixed multi-anchor:** channels, pitchforks, patterns, waves, triangles, and
  other geometry require three to seven anchors.
- **Variable multi-anchor:** Path, Polyline, and Ghost Feed accumulate segments
  and finish by double-click; coarse pointers can finish by repeating the last
  endpoint within a larger tolerance.
- **Freehand:** Brush and Highlighter sample a pointer stroke, bounded to 64
  durable points.

Some economical two-point gestures materialize additional editable semantic
handles after capture. Current examples are Long/Short Position, Curve, Double
Curve, Divergence, Journey, Fork, 3 Paths, and Burj. Anchored Text and Anchored
Note persist normalized pane coordinates so they remain fixed during chart
pan/zoom.

One-shot creation returns ordinary tools to the cursor. Double-click pins one
ordinary tool for repeat creation until Escape, right-click, or another tool;
Brush and Highlighter always stay armed after a stroke, matching the documented
exception without mutating the persisted global Stay preference. Tool commits
carry an activation identity so a stale pointer-up from an older activation
cannot disarm or mutate a newly selected tool. Replay retires creation and makes
existing drawings read-only; multi-chart layouts retire creation while
preserving existing-object editing.

## Delivery matrix

| Capability | Status | Current implementation | Honest boundary |
|---|---|---|---|
| Exact catalog and durable schema | **Delivered** | 99 tools in nine groups; registry IDs and durable kinds match exactly | Catalog equality alone says nothing about per-tool mathematical fidelity |
| Responsive catalog reachability | **Delivered** | Registry order and all 99 menu entries are asserted at 1440×900, 820×1180, and 390×844 | Physical-device and landscape-notch validation remain separate work |
| Renderer coverage | **Delivered** | Every `DrawKind` has an exhaustive renderer-family assignment | Several advanced tools share generalized family primitives; direct golden visual/formula proofs do not exist for all 99 |
| Creation state machine | **Delivered** | One-point, drag, fixed multi-point, variable multi-point, and freehand flows; preview, cancel, pointer-cancel rollback, one-shot, and pinned repeat | The controller remains concentrated in `ChartPanel`, not a standalone plugin/state-machine package |
| Selection and editing | **Partial** | Merged anchor grips, semantic handles, movement, lock, duplicate, style, and delete; current branch adds rigid boundary-clamped drag, click-then-click placement, Shift-angle constraint, command-drag clone, and copy/paste | SVG-tree hit testing remains; no spatial index, grouping, long-press selection, or complete fill/label/body hit taxonomy |
| Contextual inspector | **Partial** | The quick bar exposes current plus two recent colors, a full picker, width, dash, font size, opacity, fill opacity, lock, duplicate, settings, and delete; the branch adds a user-facing 24-slot Fibonacci level editor and percent-or-money account/risk position controls | No complete schema-generated editor, independent position-zone styles, or advanced settings surface for every family |
| History | **Delivered** | Per-symbol bounded undo/redo, keyboard shortcuts, structural sharing, and persistence after history changes | History is collection-snapshot based and is not restored after reload |
| Placement feedback | **Delivered** | Live previews, cross-guides, grips, snap halo, measurement/ratio pills, and a visible pointer-following quick-color palette | Palette behavior is directly covered for representative tools, not every geometry family |
| Off/Weak/Strong magnet | **Partial** | Weak radius and Strong nearest-OHLC snapping with visible acquisition feedback; the face toggles Off/Weak and its split arrow exposes all modes | No hysteresis or drawing-anchor, indicator-value, or named-structure candidates |
| Fibonacci and Gann family | **Partial** | All 15 catalog tools render through fib, grid, time, fan, radial, or Gann families; Fibonacci Retracement consumes all 24 editable ratio values, visibility/color states, reverse, and ratio/price/both label preferences | Complete reference-formula and per-family settings verification remain open; most advanced family members still use shared rules |
| Patterns, waves, and cycles | **Partial** | All 14 identities have fixed-anchor contracts, labels, editing, persistence, and pattern/cycle rendering | No harmonic-name validation, ratio enforcement, wave-rule validation, or per-tool visual goldens |
| Forecasting and position tools | **Partial** | Merged Long/Short regions, Forecast, Ghost Feed, Bar Pattern, and Sector geometry; the branch adds deterministic volatility-scaled Ghost Feed candles and account/quantity calculations from percentage or fixed-money risk | No brokerage/account integration, live amount/P&L workflow, directional validation, or evidence that scenario generation matches OpenMarket |
| Anchored VWAP, Regression Trend, and Fixed Range Volume Profile | **Partial** | The branch adds volume-weighted AVWAP with deviation bands, least-squares regression with `R`/sigma, and overlap-allocated profile bins with POC/value area | Local chart bars and local formulas do not establish parity with OpenMarket's aggregation, settings, or documented Data API products |
| Range and Measure tools | **Delivered** | Price, Date, combined Date and Price, and Shift+drag Measure display relevant deltas | Formatting and settings do not expose every reference option |
| Freehand, shapes, curves, arrows | **Delivered** | All catalog identities are creatable, editable, styleable where applicable, and durable; Brush/Highlighter and segmented Path have direct browser proofs | Advanced curve/stylized-path semantics use shared construction rules rather than per-tool reference specifications |
| Text, notes, labels, emoji, icon, image | **Delivered** | Editable text-bearing tools, pane anchors, choice pickers, bounded image upload, rendering, and persistence | Image is embedded in the drawing payload; there is no external media library or drawing-template system |
| Persistence safety | **Partial** | Guest storage, authenticated API load/save, serialized debounce, fail-closed loading, same-owner recovery outbox, empty-state tombstones, 500-object/2MB limits, and non-destructive object-501 rejection | No general offline queue, named drawing views, or authenticated production round-trip evidence in this memo |
| Drawing visibility and removal | **Partial** | Merged global visibility and user/detected/all removal; the branch adds history-aware global lock/unlock, Command/Ctrl+Alt+H visibility, active-pane detector counts, and drawing/indicator/everything cleanup scopes | Separate ChartBus AI objects remain outside the pane-local detector count; no searchable drawing object tree, per-object rail visibility, rename, reorder, or grouping workflow |
| Replay and multi-chart safety | **Delivered in branch** | Replay retires creation, selection, handles, inspectors, keyboard edits, and Shift-measure; grids with more than one chart disable creation while preserving existing-object editing | Focused browser coverage exists, but this is not a merged or production-verified claim yet |
| Mobile/tablet workflow | **Partial** | One responsive product, portalled compact menus, touch-sized rows, coarse-pointer completion, collision control, pointer-cancel rollback, and a safe-area-clamped favorites strip | Long-press selection and physical-device virtual-keyboard geometry remain unverified; landscape-notch and real-device testing remain open |
| Chart presentations | **Partial** | Candles, Hollow Candle, Heikin Ashi, Bars, Line, Line with Markers, Step Line, Area, and Baseline | Volume Bars, Columns, High-Low, HLC Area, Volume Footprint, and TPO presentation modes are not implemented |
| Drawing workspace management | **Partial** | The branch adds star affordances across all family menus, persisted favorites, a draggable/scrollable responsive strip, show/hide/context-close controls, and separate desktop/compact placement, verified at all three responsive widths | No named drawing views, save-as-view, drawing templates, searchable object tree, rename, reorder, grouping, or combined manager |

## What the 99-tool renderer does and does not prove

The exhaustive renderer map in
`terminal/lib/drawing-engine/geometry.ts` is an important engineering contract:
adding a durable kind without a renderer family becomes a type/test failure.
Families share bounded SVG primitives for lines, channels, pitchforks,
Fibonacci grids/time/radial studies, fans, Gann studies, patterns, cycles,
positions, forecasts, ranges, freehand paths, shapes, curves, marks,
annotations, and media.

This is deliberately different from claiming 99 independent, reference-perfect
engines. For example:

- harmonic and Elliott objects render their construction and labels but do not
  validate market-theory rules;
- several Fibonacci/Gann tools derive from shared ratios and geometry without a
  complete per-tool settings surface;
- forecasting drawings remain user-authored constructions; the branch's Ghost
  Feed adds deterministic scenario candles, not a predictive model;
- the branch's Anchored VWAP, Regression Trend, and Fixed Range Volume Profile
  use local chart bars and documented local formulas rather than proving
  equivalent exchange aggregation or reference settings;
- stylized paths have distinct identities and editable semantic handles, but
  not a published OpenMarket geometry specification to verify against.

The correct next fidelity test is a per-tool fixture matrix containing reference
anchors, expected derived geometry, labels, settings mutations, hit regions,
and screenshots at multiple price/time scales. Registry count and menu
screenshots cannot substitute for that test.

## Persistence and ownership reality

All incoming local and remote collections pass through normalization. The
current schema preserves time/price anchors and bounded styles while accepting
all 99 durable kinds. Persisted drawing collections preserve source tags so
user-authored and detector-generated marks can be filtered without conflating
them; ChartBus AI objects remain outside that durable collection.

The signed-in path is fail-closed: a failed load does not convert an unknown
remote state into a destructive empty save. Saves are serialized and coalesced.
Unsaved account snapshots are captured before logout/account transition in an
identity-scoped outbox, including an explicit empty collection used as a
clear-all tombstone; only the same account can replay and clear that snapshot.
Changing drawing owner also remounts the imperative chart renderer so native
pointer listeners and in-flight drafts cannot cross the account/guest boundary.

The hard limits remain 500 objects per symbol and 2,000,000 UTF-8 bytes. Images
are restricted to PNG/JPEG/WebP, 700 KB, 4096×4096, and 12 megapixels before
their data URL is accepted. Capacity overflow rejects the new object rather
than evicting an existing drawing.

## Responsive implementation

Desktop, tablet, and mobile use the same `terminal/` implementation:

- desktop presents a vertical glass rail, hover labels, clamped flyouts, a
  pointer-following quick palette, a movable selected-object inspector, and a
  draggable favorites strip;
- tablet/mobile below 860px use a horizontal safe-area-aware dock, portalled
  menus, a compact style surface, touch-sized controls, a bottom inspector, and
  separately persisted/clamped compact favorites placement;
- coarse pointers receive larger finishing/snap tolerances and avoid
  hover-dependent behavior.

Automated responsive contracts cover registry reachability and representative
editing workflows at 1440×900, 820×1180, and 390×844. They do not replace a
physical-device pass for landscape notches, long-press behavior, or virtual
keyboard resizing.

## Chart presentation boundary

Terminal currently exposes nine chart presentations:

| Family | Implemented |
|---|---|
| Candles | Candles, Hollow Candle, Heikin Ashi |
| Bars | Bars |
| Lines | Line, Line with Markers, Step Line |
| Areas | Area, Baseline |

OpenMarket's public API docs confirm that Volume Profile and TPO data products
exist, but API availability is not a Terminal chart presentation. Volume Bars,
Columns, High-Low, HLC Area, Volume Footprint, and TPO remain absent from the
chart-type menu. Fixed Range Volume Profile is a delivered drawing tool and
must not be confused with those missing presentation modes.

## Remaining work before a full-parity claim

1. Build per-tool semantic fixtures and visual/formula goldens for every
   advanced Fibonacci, Gann, harmonic, Elliott, cycle, curve, and stylized tool.
2. Extend schema-driven settings beyond the delivered 24-slot Fibonacci
   Retracement and percent-or-money account/risk controls: add independent
   position-zone styling plus complete family-specific inputs for advanced tools.
3. Replace SVG-tree-only hit testing with indexed, geometry-aware regions and
   add grouping plus drawing-object management.
4. Add drawing views, templates, searchable object management, rename/reorder,
   grouping, and save/restore workflows beyond the verified favorites strip.
5. Expand snapping with hysteresis, drawing anchors, indicator values, and named
   structures.
6. Complete physical-device validation for touch selection, virtual keyboards,
   landscape safe areas, focus transitions, and reduced motion.
7. Add the missing chart presentations separately from the drawing registry.
8. Complete and record an authenticated production save/reload/delete cycle.

## Architecture reality

The catalog, durable schema, and renderer-family map are now explicit shared
boundaries. Geometry is stored in data space, except for intentionally
pane-anchored annotations whose normalized pane coordinates are stored in
metadata.

The interaction and SVG renderer remain concentrated in `ChartPanel.tsx`.
There is no independent tool-plugin interface, spatial hit-test index, or
command-object history layer. Future semantic depth should extract those
boundaries instead of adding more per-tool conditionals to the chart monolith.

## Evidence

### Merged baseline at `10d920de`

| Evidence | What it establishes |
|---|---|
| `terminal/lib/__tests__/drawingTools.test.ts` | Exact 99 tools/nine groups, durable coverage, creation contracts, semantic-handle counts, capabilities, shortcuts, and legacy normalization |
| `terminal/lib/__tests__/drawingGeometry.test.ts` | Exhaustive renderer-family map, Fibonacci slots/defaults, and semantic-point materialization |
| `terminal/lib/__tests__/drawingI18n.test.ts` | English and Chinese labels for every group/tool and the new interaction copy |
| `terminal/lib/__tests__/drawingOutbox.test.ts` | Account isolation, corrupt-state fail-closed behavior, and empty-collection tombstones |
| `terminal/lib/__tests__/drawingOwnerLifecycle.test.ts` | Account-to-guest renderer boundary and same-owner stability |
| `terminal/e2e/drawing-system.spec.ts` | Responsive 99-tool menu, interaction chrome, lifecycle/history, adversarial editing, freehand/segmented input, pane annotations, media persistence, payload limits, object-501 rejection, and fail-closed loads |
| `terminal/lib/drawing-engine/geometry.ts` | Exhaustive family mapping for every durable kind; this is coverage, not a per-tool fidelity proof |

Baseline-focused reconciliation rerun: five Vitest files, 28 tests passed.

### Current follow-up branch validation

| Gate | Result |
|---|---|
| Exact registry-to-memo parser | 99 registry tools, 99 documented tools, no missing, extra, or duplicate names |
| Full unit suite | 87 files; 1,673 tests passed; four explicit todos |
| Exact responsive browser suite | 123 cases across desktop, tablet, and mobile; 79 passed and 44 viewport-inapplicable cases intentionally skipped |
| Professional drawing browser contract | Six desktop passes, including analytical settings, Replay hard lock, responsive focus continuity, source-scoped cleanup, and pane-targeted detector commands |
| TypeScript | Full no-emit check passed |
| Production build | Passed |
| Patch hygiene | `git diff --check` passed |

CI, authenticated production round trip, physical-device validation, merge,
deployment, and live verification remain delivery gates. The older 21-tool
visual proof pack remains historical evidence and must not be presented as proof
of the 99-tool system.

## Final parity boundary

Correct:

> Mastermind has the full 99-tool comparison catalog and renderer-family
> coverage, with robust shared editing, persistence, and responsive foundations.

Incorrect:

> Mastermind reproduces every OpenMarket drawing's formulas, settings,
> interactions, object-management workflow, and chart presentation.

The first statement is supported by the merged registry and automated
contracts. The second remains false until the remaining semantic, settings,
workspace, responsive-device, and presentation lanes are implemented and
verified.
