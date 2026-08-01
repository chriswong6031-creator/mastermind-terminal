import SwiftUI
import UIKit

/// §3.5 items 1–7 — the Analysis hub, reached from the chart toolbar's `•••`.
///
/// Chrome (§3.5.1): a `Theme.panel2` (`#1C1C1E`) tool sheet with a grabber, a 20 pt Bold
/// title, the ⌀30 circular close (`#313136` fill, `#A0A0A8` glyph) and a 16 pt content
/// inset. Row 1 is a 2-up `TVGhostButton` at 55.7 pt — **outline, transparent fill** (C6
/// resolved the "filled `#2C2C2E`" claim in `spec-chart.md` §2.4 as wrong). A full-bleed
/// 1 pt `#4A4A4A` divider follows: §3.5.3's only edge-to-edge line. Then the
/// TOOLS / INFO / MORE captions over `TVTile` grids at the §2.10 metrics (2-col 180.7 pt
/// / gutter 8.3; 3-col 117.3 pt / gutter 9; 72 pt tall, r 12), with the §3.5.7 red dot on
/// Alerts and Save.
///
/// Every control here is a **placeholder affordance**: the structure is TV's, but chart
/// tooling — indicators, drawings, chart type, the object tree, layout persistence — is
/// rendered and computed by the web Terminal per `AGENTS.md`, so each tile answers with
/// the app's existing "Not in this alpha" notice rather than pretending to act. None of
/// them can push a published Terminal surface today; when one can, it swaps its `action`
/// and nothing else about this file changes.
///
/// Deliberately **not** shipped from §3.5: the "Trade with your broker" gradient CTA
/// (§3.5.4) — broker connectivity is excluded from the alpha, and a dead affordance that
/// implies a trading path is the one placeholder we should not draw.
struct AnalysisHubSheet: View {
    var lang: String = "en"
    let onClose: () -> Void

    @State private var showsPlaceholderNotice = false

    var body: some View {
        ZStack {
            // Nested sheets never lighten (§1.2): this stays `#1C1C1E` over whatever
            // presented it, and depth is signalled by the peeking scrim alone.
            Theme.panel2.ignoresSafeArea()

            // A10 recommends always opening at the top regardless of entry point — a plain
            // ScrollView does exactly that.
            ScrollView {
                VStack(spacing: 0) {
                    TVSheetHeader(
                        title: L10n.t("Analysis hub", lang),
                        closeStyle: .circle,
                        inset: TVSpace.s4,
                        closeAccessibilityLabel: L10n.t("Close", lang),
                        onClose: onClose
                    )

                    layoutRow
                    // §3.5.3 — the only full-bleed line in the sheet.
                    TVHairline.sheet()
                        .padding(.top, TVSpace.s5)

                    toolsSection
                    infoSection
                    moreSection
                }
                .padding(.bottom, TVSpace.s7)
            }
        }
        .presentationDetents([.large])
        // The kit draws TV's grabber (36.7 × 5.3 pt, 8 pt below the top edge); the system
        // indicator would double it.
        .presentationDragIndicator(.hidden)
        .presentationBackground(Theme.panel2)
        .alert(
            Text(L10n.t("Not in this alpha", lang)),
            isPresented: $showsPlaceholderNotice
        ) {
            Button(L10n.t("OK", lang), role: .cancel) { showsPlaceholderNotice = false }
        } message: {
            Text(L10n.t("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.", lang))
        }
    }

    // MARK: - §3.5.2 ghost row

    private var layoutRow: some View {
        LazyVGrid(columns: TVGrid.columns(2), spacing: TVGrid.rowGap) {
            TVGhostButton(title: L10n.t("Layout setup", lang), icon: "square.grid.2x2") { placeholder() }
            // TV labels this "Manage <layout name>"; we have no named layouts yet.
            TVGhostButton(title: L10n.t("Manage layout", lang), icon: "slider.horizontal.3") { placeholder() }
        }
        .padding(.horizontal, TVGrid.margin)
        .padding(.top, 18)
    }

    // MARK: - §3.5.5/§3.5.6 tile grids

    private var toolsSection: some View {
        VStack(spacing: 0) {
            TVSectionCaption(text: L10n.t("Tools", lang))

            LazyVGrid(columns: TVGrid.columns(2), spacing: TVGrid.rowGap) {
                tile("chart.xyaxis.line", L10n.t("Indicators", lang))
                tile("scribble.variable", L10n.t("Drawings", lang))
                // §3.5.7 — the red dot rides Alerts and Save.
                tile("bell", L10n.t("Alerts", lang), badge: true)
                tile("square.and.arrow.down", L10n.t("Save", lang), badge: true)
            }
            .padding(.horizontal, TVGrid.margin)

            LazyVGrid(columns: TVGrid.columns(3), spacing: TVGrid.rowGap) {
                tile("rectangle.stack", L10n.t("Templates", lang))
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
                tile("info.circle", L10n.t("Symbol details", lang))
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

    /// The placeholder contract: acknowledge the touch, then show the app's existing
    /// alpha-scope notice. No tile silently swallows a tap.
    private func placeholder() {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        showsPlaceholderNotice = true
    }
}
