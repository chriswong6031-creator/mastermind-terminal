# OpenMarket Drawing System Review and Delivery Reconciliation

**Status:** Reconciled against the implementation in the shared delivery tree

**Audit date:** 2026-07-31

**Reference product:** [OpenMarket Chart](https://openmarket.xyz/chart/)

**Production status:** This memo records implementation parity. Merge,
deployment, and live verification are recorded in the delivery PR and operator
handoff so this artifact does not become a stale environment-status page.

## Scope and status language

This memo compares the supplied OpenMarket captures with the code currently
implemented in Mastermind Terminal. It is an implementation inventory, not a
claim that Terminal now contains OpenMarket's complete catalog or interaction
model.

Status terms are deliberately strict:

- **Delivered** — the capability exists end to end in the shared tree.
- **Partial** — a useful implementation exists, but one or more material
  OpenMarket behaviors are absent.
- **Deferred** — the capability is not implemented in this delivery.

“Delivered” here means delivered in the implementation being reviewed. It does
not mean production-verified until the final deployment checks are complete.

## Executive verdict

This delivery is a substantial drawing-system upgrade, not full OpenMarket
parity.

The shipped core is credible:

- one canonical 21-tool registry across seven families;
- registry-driven point, drag, multi-anchor, and path acquisition;
- one-shot versus pinned-repeat drawing;
- selectable drawings with visible and draggable anchors;
- whole-object movement, locking, duplication, styling, and deletion;
- per-symbol undo/redo history;
- Off, Weak, and Strong magnet controls;
- versioned drawing normalization and persistence-boundary validation;
- a glass desktop rail that becomes a horizontal responsive dock; and
- four additional chart presentations.

The remaining gap is equally important. Terminal does not ship OpenMarket's
full Gann, Elliott, advanced Fibonacci, pattern, curve, emoji, image, volume
profile, footprint, TPO, forecasting, or drawing-view systems. Several delivered
tools—especially Fibonacci, XABCD, long/short position, snapping, the property
inspector, and mobile editing—are strong first versions rather than feature
parity.

## Delivered 21-tool registry

`terminal/lib/drawingTools.ts` is now the canonical catalog for labels, icons,
creation cardinality, capabilities, defaults, and shortcuts. The sidebar and
creation controller consume this registry rather than carrying separate lists.

| Family | Count | Delivered tools |
|---|---:|---|
| Lines | 9 | Trend Line, Ray, Extended Line, Horizontal Line, Horizontal Ray, Vertical Line, Cross Line, Arrow, Parallel Channel |
| Fibonacci | 1 | Fibonacci Retracement |
| Shapes | 4 | Rectangle, Ellipse, Triangle, Path |
| Patterns | 1 | XABCD Pattern |
| Text & Notes | 1 | Text |
| Measure & Ranges | 3 | Measure, Price Range, Date Range |
| Forecasting | 2 | Long Position, Short Position |
| **Total** | **21** | Every durable `DrawKind` appears exactly once |

### Creation gestures

The controller derives acquisition behavior from the registry:

- **Single point:** Horizontal Line, Horizontal Ray, Vertical Line, Cross Line,
  and Text. Text opens an in-chart editor.
- **Two-point drag:** Trend Line, Ray, Extended Line, Arrow, Rectangle, Ellipse,
  Fibonacci Retracement, Measure, Price Range, and Date Range.
- **Multi-anchor:** Parallel Channel and Triangle use three anchors, XABCD uses
  five, and Long/Short Position use three.
- **Path:** samples a pointer path, caps it at 64 points, previews it while
  moving, and rejects sub-three-pixel accidental creation.
- **Precision measure:** `Shift + drag` creates Measure without first arming the
  tool.

Each committed drawing returns to the cursor by default. The sticky control or
double-clicking a family face keeps the tool armed for repeat creation.
`Escape` cancels pending geometry before deselecting, and the advertised
`Alt+T/H/V/R/X/M` shortcuts route through the same registry.

## Delivery status

| Capability | Status | What exists now | Honest boundary |
|---|---|---|---|
| Canonical 21-tool registry | **Delivered** | Seven registry-driven groups, complete `DrawKind` coverage, defaults, capabilities, icons, labels, and shortcuts | The OpenMarket long tail is intentionally not registered |
| Drawing controller and gestures | **Delivered** | Point, two-point drag, multi-anchor, path, preview, cancel, accidental-drag rejection, one-shot, and pinned repeat | It is still an inline controller inside `ChartPanel`, not a standalone state-machine module |
| Expanded line family | **Delivered** | Trend, Ray, Extended, Horizontal, Horizontal Ray, Vertical, Cross, Arrow, and Parallel Channel | No separate OpenMarket “Parallel Line” primitive beyond the three-anchor channel |
| Selection, hit testing, and anchors | **Partial** | Selected-object grips, per-anchor dragging, whole-object dragging, broad transparent line hit areas, locked-object protection | No spatial index, label/fill-region hit taxonomy, geometry-specific secondary handles, grouping, or long-press selection |
| Undo/redo history | **Delivered** | Per-symbol 100-snapshot undo/redo stacks, structural sharing for unchanged objects/anchors, rail buttons, `Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z`, and `Cmd/Ctrl+Y` | History is in memory and is not restored after reload |
| Contextual property inspector | **Partial** | Movable glass toolbar, quick and custom color, width, dash, text size, opacity, fill opacity, lock, duplicate, settings, and delete | Not fully schema-generated; no per-Fibonacci-level editor or independent position-zone editor |
| Off/Weak/Strong magnet | **Partial** | Off preserves continuous price; Weak uses an 8px desktop or 14px coarse-pointer radius; Strong always snaps to nearest active-bar OHLC; acquired targets show a halo | No hysteresis and no drawing-anchor, indicator, or named-structure candidates |
| Placement feedback | **Partial** | Live geometry preview, dashed cross-guides, anchor grips, snap halo, measurement pills, ratio labels, viewport-clamped pills, and wheel quick-color rotation while hovering a drawing | No visible endpoint-anchored palette |
| `Shift + drag` measure | **Delivered** | Direct chart gesture with bars, price delta, and percentage output | Does not yet expose every OpenMarket tick/value formatting option |
| Fibonacci Retracement | **Partial** | Direction-aware anchors, `0/.236/.382/.5/.618/.786/1/1.618`, ratio and price labels, colored bands, dashed spine, and draggable endpoints | Levels, colors, visibility, and fills are hard-coded rather than individually editable |
| Long/Short Position | **Partial** | Three draggable anchors, target/stop regions, target and stop labels, percentages, and risk/reward | No account size, quantity, amount/P&L model, directional validation, or independent zone styles |
| Price and Date ranges | **Partial** | Price Range and Date Range render with relevant deltas | Combined Date and Price Range is deferred |
| XABCD | **Partial** | Five-anchor acquisition, X/A/B/C/D labels, live leg ratios, fill, selection, and anchor editing | No named harmonic validation, projected construction legs, or Cypher/ABCD/Three Drives variants |
| Shapes, paths, and text | **Partial** | Rectangle, Ellipse, Triangle, pointer-sampled Path, and editable Text | No rotated rectangle, separate circle, brush, highlighter, arc, curve, double curve, anchored notes, or callouts |
| Versioned drawing validation | **Delivered** | Schema version 1, legacy normalization, bounded numeric styles, source migration, duplicate-ID and geometry validation, shared 500-object/2MB UTF-8 limits, non-destructive cap rejection, and fail-safe API replacement | This is schema and boundary validation, not proof of every persistence transport in production |
| Persistence lifecycle | **Partial** | Per-symbol guest local storage, signed-in API load/save, serialized 600ms debouncing, owner-scoped transition recovery outbox, leave/unmount flush, retry retention, normalized reload, fail-closed load tests, and a browser proof above Chromium's 64KB keepalive quota | No named drawing views, general offline queue, or completed authenticated production round trip |
| Visibility and scoped removal | **Delivered** | Global drawing visibility plus user, detected, and all-object removal scopes with an aggregate count badge | The badge is not split by scope and does not surface the pane-local detector count; there is no searchable drawing object tree or per-object hide control in the rail |
| Responsive dock | **Delivered** | Vertical glass desktop rail; horizontal, safe-area-aware dock below 860px; portalled mobile flyouts, pre-style palette, bottom inspector treatment, and 44px mobile controls | Full touch-workflow parity remains partial |
| Full mobile/tablet drawing workflow | **Partial** | Shared responsive markup, coarse-pointer snapping radius, scrollable dock, touch-sized menu rows, keyboard/focus containment, pointer-cancel rollback, and a passing three-viewport interaction suite | No long-press selection or physical-device virtual-keyboard geometry validation |
| Chart presentation additions | **Partial** | Hollow Candle, Line with Markers, Step Line, and Baseline join Candles, Heikin Ashi, Bars, Line, and Area | Volume Bars, Columns, High-Low, HLC Area, Volume Footprint, and TPO are deferred |
| Advanced OpenMarket catalog | **Deferred** | None claimed | Full inventory is listed explicitly below |

## Current editing and persistence behavior

### Selection and anchor editing

Every rendered drawing carries stable drawing and kind attributes. Selecting an
unlocked object exposes its data-space anchors as grips. Dragging a grip changes
only that anchor; dragging the object translates all anchors together across
bar indices and price. Pointer movement is animation-frame coalesced, while the
history and persistence callbacks occur at the end of an edit.

This is a meaningful improvement over the prior visual-only grips. It is not a
complete hit-test engine: hit regions still come from the SVG object tree, and
there is no spatial index or semantic distinction among labels, fills, bodies,
and derived geometry.

### History

The shell owns a bounded undo and redo stack per symbol. Create, handle move,
whole-object move, style, opacity/fill commit, lock, duplicate, delete, and clear
flow through the same collection update boundary. Undo and redo create a new
debounced persistence snapshot without recursively recording history.

The stack stores whole drawing collection arrays rather than typed commands,
but interactive normalization structurally shares every untouched object and
style-only anchor array. In the 500-by-64-anchor/100-edit forced-GC audit this
removed the prior 115.7 MB retained growth; the post-fix heap moved from
32.1 MB to 31.0 MB. This is adequate for the current cap, though a command
history would still be preferable for history inspection.

### Persistence validation

Every incoming local or remote collection passes through `normalizeDrawings`.
The schema preserves data-space points and now normalizes:

```text
schemaVersion, source, locked, hidden, z, opacity, extend,
color, fillColor, fillOpacity, width, dash, fontSize, text, metadata
```

The signed-in PUT boundary rejects malformed JSON, oversized UTF-8 payloads,
unsupported geometry, duplicate IDs, and partial-normalization saves. It stages
new rows before deleting the prior valid collection and removes the staged rows
if replacement fails. Only user-source drawings persist; detector and AI
objects remain separate.

Normalization and migration have automated tests. Browser-level tests prove
fail-closed load/retry behavior and a dense 32-by-64-point collection whose
request exceeds Chromium's keepalive quota; normal saves deliberately use an
ordinary serialized fetch rather than `keepalive`. A real authenticated
production save/reload cycle does not yet have completed evidence. Unsaved
account snapshots are mirrored in memory before debounce and written to an
identity-scoped local recovery outbox on logout/account change; only the same
account can replay and clear them after a successful PUT. Overall persistence
parity therefore remains partial rather than complete.

## Responsive implementation

The same drawing markup serves all supported viewports:

- **Desktop:** 52px vertical rail, registry flyouts, floating pre-style palette,
  and movable selected-object inspector.
- **Tablet and mobile below 860px:** horizontally scrollable bottom dock,
  safe-area offsets, bottom-anchored flyouts and style palette, horizontal
  history controls, and a bottom-positioned selected-object inspector.
- **Coarse pointers:** larger Weak-magnet acquisition radius and hover transforms
  disabled.

This is a delivered responsive dock, not a claim of complete touch parity. The
mobile controls meet the 44px contract and the 1440×900, 820×1180, and 390×844
interaction matrix passes. Long-press selection and physical-device
virtual-keyboard geometry remain open.

## Chart presentation update

Terminal now exposes nine chart presentations:

| Family | Implemented |
|---|---|
| Candles | Candles, Hollow Candle, Heikin Ashi |
| Bars | Bars |
| Lines | Line, Line with Markers, Step Line |
| Areas | Area, Baseline |

The four additions in this delivery are Hollow Candle, Line with Markers, Step
Line, and Baseline. They use native Lightweight Charts series/options rather
than drawing-layer approximations.

This remains partial relative to the supplied OpenMarket menu. Volume Bars,
Columns, High-Low, HLC Area, Volume Footprint, and Time Price Opportunity are
not implemented.

## Explicitly not shipped

The following OpenMarket capabilities must not be described as delivered or
implied by the 21-tool count.

### Advanced Fibonacci and Gann

- Fibonacci Trend, Fib Channel, Fib Time Zone, Fib Speed Resistance Fan,
  Trend-Based Fib Time, Fib Circles, Fib Spiral, Fib Speed Resistance Arcs,
  Fib Wedge, and Pitchfan
- Gann Box, Gann Square Fixed, Gann Square, and Gann Fan
- user-defined Fibonacci level sets and independent per-level styles

### Patterns, Elliott waves, and cycles

- Cypher, Head and Shoulders, ABCD, Triangle Pattern, and Three Drives
- Elliott Impulse, Correction, Triangle, Double Combo, and Triple Combo
- Cyclic Lines, Time Cycles, and Sine Line

XABCD is implemented, but it does not make the broader pattern or wave family
shipped.

### Forecasting, volume, and profile tools

- Forecast, Ghost Feed, Bar Pattern, and Sector
- Anchored VWAP
- Fixed Range Volume Profile
- Volume Footprint
- Time Price Opportunity
- combined Date and Price Range

### Freehand, geometry, arrows, and content

- Brush and Highlighter
- Rotated Rectangle and a distinct Circle tool
- Polyline, Arc, Curve, and Double Curve
- directional arrow marks, flag marks, and the stylized marker library
- anchored text, notes, anchored notes, callouts, price labels, price notes,
  signposts, and comments
- emoji and icon browsers
- image placement

Path, Arrow, Ellipse, Triangle, and Text are delivered slices; they are not the
full OpenMarket annotation catalog.

### Object and workspace management

- searchable drawing object tree
- per-object rename, hide, reorder, group, and duplicate-from-tree workflows
- persisted favorites
- persisted last-used family faces
- named drawing views
- save-current-drawings-as-view workflow
- combined indicator/drawing object manager with OpenMarket's category counts

The current rail provides global visibility and scoped clearing only.

### Remaining interaction depth

- snap hysteresis and candidates beyond active-bar OHLC
- geometry-specific secondary handles
- position amount, quantity, P&L, and account-risk calculations
- per-zone position styling
- per-level Fibonacci settings
- visible endpoint-anchored palette (wheel quick-color routing is delivered)
- full touch selection and virtual-keyboard-safe text editing

## Architecture reality

The delivery establishes the correct first boundary: one registry owns tool
identity, acquisition metadata, capabilities, defaults, icons, labels, and
shortcuts. Durable records remain in time/price data space and no screen-pixel
geometry is persisted.

The renderer and interaction controller are still concentrated in
`ChartPanel.shape()` and adjacent pointer handlers. There is no independent
tool-plugin interface, spatial hit-test index, or command-object history layer
yet. Future catalog growth should extract those layers before adding the
deferred Gann/Elliott/curve families; simply extending the renderer branch
indefinitely would recreate the scaling problem the registry solved for menus.

## Verification checklist

Completed against the shared tree:

- [x] TypeScript: `tsc --noEmit`
- [x] Registry, shortcut, normalization, and migration tests:
  `drawingTools.test.ts` — 12 passed
- [x] English/Chinese registry and drawing-control coverage:
  `drawingI18n.test.ts` — 4 passed
- [x] ESLint for the new registry, schema/API boundary, and sidebar files
- [x] Registry contains all 21 durable kinds exactly once
- [x] Code-path inspection confirms creation and rendering paths for all 21
- [x] Code-path inspection confirms anchor editing, history wiring, persistence
  normalization, responsive dock rules, and all four chart-type additions
- [x] Full Vitest corpus: 81 files, 1,625 passed, 4 todo
- [x] Responsive Playwright corpus: 56 passed, 22 intentional skips across
  1440×900, 820×1180, and 390×844
- [x] Adversarial drawing suite: real text double-click, vertical extended
  lines, styled Fibonacci, rigid edge drag, 64-point path cap, pointer-cancel
  rollback, live-rerender draft retention, non-destructive object-cap handling,
  fail-closed loading, and >64KB persistence transport
- [x] Production build: `next build`
- [x] Visual proof pack: `docs/verification/openmarket-drawing-studio/`
- [x] Extreme ceiling benchmark: 500 drawings × 64 anchors × 100 color edits,
  no retained heap growth after forced GC

Still required before claiming production completion or broad parity:

- [ ] Complete an authenticated production save/reload/delete round trip
- [ ] Verify virtual-keyboard geometry on a physical mobile device

## Final parity boundary

The correct claim for this delivery is:

> Mastermind now has a robust registry-driven 21-tool drawing foundation with
> editable anchors, history, validated persistence, responsive controls, and
> several OpenMarket-inspired flagship tools.

The incorrect claim is:

> Mastermind has complete OpenMarket drawing parity.

That second statement remains false until the explicitly deferred catalog and
the remaining partial interaction lanes are implemented and verified.
