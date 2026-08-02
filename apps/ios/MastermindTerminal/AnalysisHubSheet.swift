import SwiftUI
import UIKit

/// §3.5 items 1–8 — the Analysis hub, reached from the chart toolbar's `•••`.
///
/// Chrome (§3.5.1): a `Theme.panel2` (`#1C1C1E`) tool sheet with a grabber, a 20 pt Bold
/// title, the ⌀30 circular close (`#313136` fill, `#A0A0A8` glyph) and a 16 pt content
/// inset. Rows 1 and 2 are `TVGhostButton` at 55.7 pt — **outline, transparent fill**
/// (§3.5.2/C6 resolved the "filled `#2C2C2E`" claim in `spec-chart.md` §2.4 as wrong for
/// BOTH rows). A full-bleed 1 pt `#4A4A4A` divider follows: §3.5.3's only edge-to-edge
/// line. Then the TOOLS / INFO / MORE captions over `TVTile` grids at the §2.10 metrics
/// (2-col 180.7 pt / gutter 8.3; 3-col 117.3 pt / gutter 9; 72 pt tall, r 12), with the
/// §3.5.7 red dot on Alerts and Save.
///
/// R2.2 deleted the §3.5.4 "Trade with your broker" gradient CTA outright. It was drawn
/// to spec and inert, but the alpha ships no broker connectivity of any kind, and a
/// trading affordance that cannot trade is the one placeholder the sheet should not
/// carry. There is no CTA between the divider and TOOLS.
///
/// Inventory is the reference's, in the reference's order (§3.5.6 + `spec-chart.md` §2.4):
/// TOOLS = Indicators · Compare · Alerts · Bar Replay, then the 3-up Indicator templates ·
/// Chart type · Object tree; INFO = Symbol details · Financials · Forecast · Technicals;
/// MORE = Pine Editor · Siri shortcut. **Drawings is deliberately absent** — the reference
/// keeps drawing tools behind the chart toolbar's pencil, not in the hub.
///
/// Presentation (§3.5 / `spec-chart.md` §2.4): the hub opens at ~60 % of the screen and
/// swipes up to full, so the chart stays visible behind the first detent. The detents live
/// on this view rather than on the `.sheet` call site — SwiftUI resolves
/// `presentationDetents` from the presented content, which keeps the host screen's file
/// untouched.
///
/// Chart tooling is rendered and computed by the web Terminal per `AGENTS.md`, so a tile
/// is real exactly when the web has a surface to open. Indicators and Compare (R2.2) hand
/// the request back over the bridge — `openPanel` opens the page's own modal, so there is
/// still one implementation of the indicator picker — and Symbol details opens the native
/// detail sheet. The rest answer with the app's existing "Not in this alpha" notice rather
/// than pretending to act; when one of them gains a published Terminal surface it swaps
/// its `action` and nothing else about this file changes.
struct AnalysisHubSheet: View {
    var lang: String = "en"
    /// Optional host override for the Symbol-details tile. **Default `nil`**, so the
    /// existing `AnalysisHubSheet(lang:onClose:)` call site compiles unchanged.
    ///
    /// * `nil` (shipping default): the hub stacks `PreviewSheet` over itself for the
    ///   chart's current symbol — TV's own card-stack idiom (§3.5.8: detail surfaces
    ///   "stack a sheet over the sheet", the hub's top edge peeking above it), and closing
    ///   the detail returns to the hub exactly as the reference does.
    /// * non-`nil`: the hub closes itself and hands the symbol to the host, which owns the
    ///   presentation. One-line wiring for a host that would rather own the sheet.
    var onSymbolDetails: ((String) -> Void)? = nil
    /// IPAD-10 / §4-A20.5. In regular width the host presents this as a `.fullScreenCover`,
    /// because `presentationDetents` are silently discarded there. The surface then has no
    /// drag-to-resize behind it, so the grabber — which advertises exactly that — is
    /// suppressed and the circular close is the only dismissal. Default `false` keeps every
    /// compact call site byte-identical.
    var isFullScreen = false
    /// R2.2 — "open one of the page's own modals": `"indicators"` | `"compare"`. The host
    /// dismisses the hub and posts `openPanel`. Default `nil` keeps every existing call
    /// site compiling, and leaves both tiles as placeholders when no host handles them.
    var onOpenPanel: ((String) -> Void)? = nil
    /// DEBUG capture only (`-mmHubFull`): start at the `.large` detent instead of the 60 %
    /// one. Both detents stay installed, so the drag still works in the captured state.
    var startsExpanded = false
    let onClose: () -> Void

    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var watchlists: WatchlistStore

    @State private var showsPlaceholderNotice = false
    /// Non-nil while the stacked symbol-detail sheet is up (the `onSymbolDetails == nil`
    /// path). `PreviewItem` is the same identity token the watchlist uses.
    @State private var detail: PreviewItem?
    /// ANIM-23: set alongside `detail = nil` and consumed in `onDismiss`, so the hub's own
    /// close never races the detail sheet's dismissal animation.
    @State private var closesAfterDetail = false
    /// R2.2 — the live detent, so `.resizes` has something to drive and `-mmHubFull` has
    /// somewhere to start.
    @State private var detent: PresentationDetent = .fraction(0.6)

    var body: some View {
        ZStack {
            // Nested sheets never lighten (§1.2): this stays `#1C1C1E` over whatever
            // presented it, and depth is signalled by the peeking scrim alone.
            Theme.panel2.ignoresSafeArea()

            // A10 recommends always opening at the top regardless of entry point — a plain
            // ScrollView does exactly that.
            ScrollView {
                // §6 rule 2 + §4-A20.17: on a regular-width cover the grids are the same
                // measured cells in a bounded, centred column — never 834 pt of stretched
                // 2-up tiles. The §3.5.3 divider is deliberately left OUTSIDE the wrapper:
                // it is the sheet's one edge-to-edge line, and a rule that stops at the
                // column edge is a different component from the one measured.
                VStack(spacing: 0) {
                    TVSheetHeader(
                        title: L10n.t("Analysis hub", lang),
                        closeStyle: .circle,
                        showsGrabber: !isFullScreen,
                        inset: TVSpace.s4,
                        closeAccessibilityLabel: L10n.t("Close", lang),
                        onClose: onClose
                    )
                    .tvReadableWidth()

                    layoutRow.tvReadableWidth()
                    fileRow.tvReadableWidth()
                    // §3.5.3 — the only full-bleed line in the sheet.
                    TVHairline.sheet()
                        .padding(.top, TVSpace.s5)

                    toolsSection.tvReadableWidth()
                    infoSection.tvReadableWidth()
                    moreSection.tvReadableWidth()
                }
                .padding(.bottom, TVSpace.s7)
            }
        }
        // §3.5 / `spec-chart.md` §2.4: opens partial (~60 %), swipes up to full. Applied
        // only where the system honours it — see `isFullScreen`.
        .presentationDetents(
            isFullScreen ? [.large] : [.fraction(0.6), .large],
            selection: $detent
        )
        // R2.2 — `.scrolls` reserved every downward drag for the ScrollView, so the sheet
        // could only be grown by the ~30 pt grabber band and TV's "drag the body up to
        // full" never worked. `.resizes` gives the drag to the sheet until it reaches
        // `.large`, after which the ScrollView takes it — which is TV's behaviour.
        .presentationContentInteraction(.resizes)
        // The selection must be a member of the installed set, so the one-detent
        // (`isFullScreen`) case moves with it.
        .onAppear { if startsExpanded || isFullScreen { detent = .large } }
        // The kit draws TV's grabber (36.7 × 5.3 pt, 8 pt below the top edge); the system
        // indicator would double it.
        .presentationDragIndicator(.hidden)
        .presentationBackground(Theme.panel2)
        // The stacked detail follows the hub's own presentation class: a sheet over a sheet
        // in compact, a cover over a cover in regular (where detents are discarded anyway).
        .sheet(item: detailBinding(fullScreen: false), onDismiss: dismissDetail, content: detailCard)
        .fullScreenCover(item: detailBinding(fullScreen: true), onDismiss: dismissDetail, content: detailCard)
        .alert(
            Text(L10n.t("Not in this alpha", lang)),
            isPresented: $showsPlaceholderNotice
        ) {
            Button(L10n.t("OK", lang), role: .cancel) { showsPlaceholderNotice = false }
        } message: {
            Text(L10n.t("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.", lang))
        }
    }

    // MARK: - Stacked symbol detail (§3.5.8)

    private func detailBinding(fullScreen: Bool) -> Binding<PreviewItem?> {
        Binding(
            get: { fullScreen == isFullScreen ? detail : nil },
            set: { detail = $0 }
        )
    }

    private func detailCard(_ item: PreviewItem) -> some View {
        PreviewSheet(symbol: item.symbol, isFullScreen: isFullScreen) {
            // The widget's ⤢: drop the detail AND the hub — the chart underneath is
            // already this symbol, so there is nothing further to route.
            closesAfterDetail = true
            detail = nil
        }
        // Same presentation the watchlist's detail sheet uses (spec-symbol-detail.md §2B),
        // for the same measured reason — see `PreviewSheetPresentation`.
        .presentationDetents([PreviewSheetPresentation.detent])
        .presentationDragIndicator(.hidden)
    }

    /// ANIM-23: the hub closes only once the detail card is off screen.
    private func dismissDetail() {
        guard closesAfterDetail else { return }
        closesAfterDetail = false
        onClose()
    }

    // MARK: - §3.5.2 ghost rows

    /// Row 1 — 2-up "Layout setup" / "Manage <name>".
    private var layoutRow: some View {
        LazyVGrid(columns: TVGrid.columns(2), spacing: TVGrid.rowGap) {
            TVGhostButton(title: L10n.t("Layout setup", lang), icon: "square.grid.2x2") { placeholder() }
            TVGhostButton(title: manageTitle, icon: "slider.horizontal.3") { placeholder() }
        }
        .padding(.horizontal, TVGrid.margin)
        .padding(.top, 18)
    }

    /// Row 2 — 3-up "New" / "Save" / "Open", same 55.7 pt ghost cell as row 1 (§3.5.2).
    /// Save carries the §3.5.7 unsaved-changes dot.
    private var fileRow: some View {
        LazyVGrid(columns: TVGrid.columns(3), spacing: TVGrid.rowGap) {
            // "New watchlist", which are different labels) — zh falls back to English.
            TVGhostButton(title: L10n.t("New", lang), icon: "plus") { placeholder() }
            TVGhostButton(title: L10n.t("Save", lang), icon: "square.and.arrow.down") { placeholder() }
                .overlay(alignment: .top) { saveDot }
            TVGhostButton(title: openTitle, icon: "folder") { placeholder() }
        }
        .padding(.horizontal, TVGrid.margin)
        .padding(.top, TVGrid.rowGap)
    }

    /// §3.5.7's dot rides the **icon's** top-right corner, and `TVGhostButton` exposes no
    /// badge slot (TVKit is not this round's file). The offset is derived, not guessed: the
    /// cell is 55.7 pt tall around a centred 15 pt icon + 4 pt gap + ~20 pt label, so the
    /// icon's top edge sits ≈8 pt down and its right edge ≈7.5 pt right of centre; C24
    /// wants the dot centred on that corner with ~1 pt overhang. A `.top`-aligned ⌀6 dot
    /// starts centred at (0, 3), so the corner lands at (+7.5, +4.3).
    private var saveDot: some View {
        TVBadgeDot()
            .offset(x: 7.5, y: 4)
    }

    /// TV labels this "Manage <layout name>". We have no named chart layouts, and the
    /// nearest real, user-owned name the shell holds is the active watchlist — so the
    /// button says what it would actually manage instead of inventing a layout name.
    private var manageTitle: String {
        String(format: L10n.t("Manage %@", lang), watchlists.active.name)
    }

    /// TV's label is a bare "Open". L10n's table already binds the key `"Open"` to 开盘 —
    /// the *opening price* on the symbol sheet — so reusing it would tell a Chinese reader
    /// this button shows an opening price.
    // English "Open" rather than the wrong translation.
    private var openTitle: String {
        let localized = L10n.t("Open layout", lang)
        return localized == "Open layout" ? "Open" : localized
    }

    // MARK: - §3.5.5/§3.5.6 tile grids

    private var toolsSection: some View {
        VStack(spacing: 0) {
            TVSectionCaption(text: L10n.t("Tools", lang))

            LazyVGrid(columns: TVGrid.columns(2), spacing: TVGrid.rowGap) {
                panelTile("chart.xyaxis.line", L10n.t("Indicators", lang), panel: "indicators")
                panelTile("plus.square.on.square", L10n.t("Compare", lang), panel: "compare")
                // §3.5.7 — the red dot rides Alerts and Save.
                tile("bell", L10n.t("Alerts", lang), badge: true)
                tile("play.rectangle", L10n.t("Bar Replay", lang))
            }
            .padding(.horizontal, TVGrid.margin)

            LazyVGrid(columns: TVGrid.columns(3), spacing: TVGrid.rowGap) {
                // "Templates" is the shorter, older label); falls back to English.
                tile("rectangle.stack", L10n.t("Indicator templates", lang))
                tile("chart.bar.xaxis", L10n.t("Chart type", lang))
                tile("list.bullet.indent", L10n.t("Object tree", lang))
            }
            .padding(.horizontal, TVGrid.margin)
            .padding(.top, TVGrid.rowGap)
        }
    }

    private var infoSection: some View {
        VStack(spacing: 0) {
            TVSectionCaption(text: L10n.t("Info", lang))

            LazyVGrid(columns: TVGrid.columns(2), spacing: TVGrid.rowGap) {
                // The one live tile in the hub: it opens the real symbol-detail sheet for
                // the chart's current symbol.
                TVTile(icon: "info.circle", title: L10n.t("Symbol details", lang)) {
                    openSymbolDetails()
                }
                tile("chart.pie", L10n.t("Financials", lang))
                tile("chart.line.uptrend.xyaxis", L10n.t("Forecast", lang))
                tile("speedometer", L10n.t("Technicals", lang))
            }
            .padding(.horizontal, TVGrid.margin)
        }
    }

    private var moreSection: some View {
        VStack(spacing: 0) {
            TVSectionCaption(text: L10n.t("More", lang))

            LazyVGrid(columns: TVGrid.columns(2), spacing: TVGrid.rowGap) {
                tile("curlybraces", L10n.t("Pine Editor", lang))
                tile("sparkles", L10n.t("Siri shortcut", lang))
            }
            .padding(.horizontal, TVGrid.margin)
        }
    }

    private func tile(_ icon: String, _ title: String, badge: Bool = false) -> some View {
        TVTile(icon: icon, title: title, showsBadge: badge) { placeholder() }
            .accessibilityHint(L10n.t("Not in this alpha", lang))
    }

    /// R2.2 — a tile that hands the request to the page: close the hub so the chart is
    /// unobstructed, then ask the web to open its own modal. Without a host to take it
    /// (the default `onOpenPanel == nil`) the tile stays an honest placeholder.
    @ViewBuilder
    private func panelTile(_ icon: String, _ title: String, panel: String) -> some View {
        if let onOpenPanel {
            TVTile(icon: icon, title: title) {
                UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                onOpenPanel(panel)
            }
        } else {
            tile(icon, title)
        }
    }

    /// Symbol details, for real. `model.symbol` is the chart's current symbol (ChartScreen
    /// mirrors the bridge into it), so the detail sheet always matches what is on screen.
    private func openSymbolDetails() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        let symbol = model.symbol
        if let onSymbolDetails {
            onClose()
            onSymbolDetails(symbol)
        } else {
            detail = PreviewItem(symbol: symbol)
        }
    }

    /// The placeholder contract: acknowledge the touch, then show the app's existing
    /// alpha-scope notice. No tile silently swallows a tap.
    private func placeholder() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        showsPlaceholderNotice = true
    }
}
