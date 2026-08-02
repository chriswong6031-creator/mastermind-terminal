import SwiftUI
import UIKit

/// R2.1 — the Drawings sheet, reached from the chart toolbar's pencil.
///
/// Anatomy measured from the operator's captures `IMG_2366–2368.PNG` (TV iOS, MSFT, the
/// Trend lines / Gann and fibonacci / Patterns tabs of the same sheet):
///
/// * grabber, then a **34 pt** title on the leading edge with the ⌀30 circular close
///   opposite it — this sheet uses the large title, not the 20 pt `TVSheetTitle` the
///   Analysis hub wears;
/// * the filled `TVSearchField` pill, 20 pt under the title;
/// * a horizontally-scrollable category row 20 pt under the field: the selected pill is
///   filled and bold, the unselected ones are bare grey text at the same weight — that is
///   `DrawingsCategoryPill`, and it is deliberately neither `TVNavPill` (every pill
///   filled) nor `TVSegmentedPill` (selected pill *inverts* to white);
/// * a 3-column tile grid at the §2.10 metrics (117.3 pt cell, 9 pt gutter, 16 pt
///   margin — all three read straight off `IMG_2366`), rows 12 pt apart, each tile a
///   centred line-art glyph over a centred label that wraps to two lines.
///
/// **The inventory is the page's.** `tools` arrives over the bridge from the renderer's
/// own registry (`terminal/lib/drawingTools.ts`) — per `AGENTS.md` no engine tool list
/// may be restated natively, so this file contains no tool names, only a glyph table and
/// the taxonomy labels. A tool the web does not ship simply is not here; there are no
/// dead tiles. Picking one posts `setDrawTool(id)` and dismisses.
///
/// Favorites is **ours, not the payload's**: TV's star-favoriting is out of scope for v1,
/// so the first tab lists the last nine tools used from this device (`mm.drawRecents`,
/// the same key and cap the mobile web strip uses, though the two stores are separate —
/// native cannot read the page's `localStorage`).
struct DrawingsSheet: View {
    /// The page's drawing-tool registry, in the page's order.
    let tools: [ShellDrawTool]
    var lang: String = "en"
    /// Posts `setDrawTool(id)`; the host also dismisses.
    let onPick: (ShellDrawTool) -> Void
    let onClose: () -> Void

    /// Measured on `IMG_2366`: tile ink 37→305 px of a 920-wide render of the 1206 px
    /// capture, i.e. the §2.10 three-up cell; the row pitch reads 80 pt, so a 70 pt cell
    /// under the 12 pt Drawings/Chart-type row gap — one point off, and the gap is the
    /// shared token.
    private enum Metrics {
        static let tileHeight: CGFloat = 70
        static let glyphInk: CGFloat = 22
        /// `IMG_2366`'s "Trend Line" label measures 57.6 pt wide, which is ~11.6 pt type —
        /// two-line labels ("Trend-Based Fib Extension") are why TV drops below the 15 pt
        /// `TVTile` label, and 12 pt is the nearest whole point to the measurement.
        static let label = Font.system(size: 12, weight: .medium)
        static let titleTop: CGFloat = 12
        static let searchTop: CGFloat = TVSpace.s5
        static let categoryTop: CGFloat = TVSpace.s5
        static let gridTop: CGFloat = TVSpace.s6
    }

    /// The last nine tool ids picked here, most-recent first. Stored as one string so the
    /// whole list rides a single `@AppStorage` key.
    @AppStorage("mm.drawRecents") private var recentsRaw = ""
    @State private var query = ""
    @State private var categoryIndex = 0

    var body: some View {
        ZStack {
            Theme.panel2.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                TVSearchField(
                    placeholder: L10n.t("Search", lang),
                    text: $query,
                    variant: .filled
                )
                .padding(.top, Metrics.searchTop)

                // While a query is live the grid searches the WHOLE inventory, so the
                // category row would be lying about what is on screen — it goes away
                // until the field is cleared.
                if isSearching {
                    grid(visibleTools)
                        .padding(.top, Metrics.gridTop)
                } else {
                    categoryRow
                        .padding(.top, Metrics.categoryTop)
                    grid(visibleTools)
                        .padding(.top, Metrics.gridTop)
                }
            }
        }
        // ~92 % of the screen over the chart (the capture's sheet top edge), which on iOS
        // is the `.large` detent; drag-down or the ✕ dismisses.
        // IMG_2366 measures TV's sheet opening at ~62% (top edge y≈989/2622) with the
        // chart alive above it; dragging expands to full. Same verb as the Analysis hub.
        .presentationDetents([.fraction(0.62), .large])
        .presentationContentInteraction(.resizes)
        // The kit draws TV's grabber; the system indicator would double it.
        .presentationDragIndicator(.hidden)
        .presentationBackground(Theme.panel2)
    }

    // MARK: - Chrome

    private var header: some View {
        VStack(spacing: 0) {
            TVGrabber()
            HStack(spacing: TVSpace.s3) {
                Text(L10n.t("Drawings", lang))
                    .font(TVType.largeTitle)
                    .foregroundStyle(Theme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                TVCloseButton(
                    style: .circle,
                    accessibilityLabel: L10n.t("Close", lang),
                    action: onClose
                )
            }
            .padding(.horizontal, TVGrid.margin)
            .padding(.top, Metrics.titleTop)
        }
    }

    private var categoryRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: DrawingsCategoryPill.gutter) {
                ForEach(Array(categories.enumerated()), id: \.element.id) { index, category in
                    DrawingsCategoryPill(
                        title: category.title,
                        isSelected: index == selectedCategoryIndex
                    ) {
                        categoryIndex = index
                    }
                }
            }
            .padding(.horizontal, TVGrid.margin)
        }
        .frame(height: DrawingsCategoryPill.height)
    }

    @ViewBuilder
    private func grid(_ shown: [ShellDrawTool]) -> some View {
        if shown.isEmpty {
            VStack {
                Spacer(minLength: TVSpace.s7)
                Text(emptyMessage)
                    .font(TVType.rowSecondary)
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, TVSpace.s7)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVGrid(columns: TVGrid.columns(3), spacing: TVGrid.chartTypeRowGap) {
                    ForEach(shown) { tool in
                        DrawToolTile(
                            icon: DrawToolGlyph.name(for: tool),
                            title: L10n.t(tool.label, lang),
                            height: Metrics.tileHeight,
                            glyphInk: Metrics.glyphInk,
                            labelFont: Metrics.label
                        ) {
                            pick(tool)
                        }
                    }
                }
                .padding(.horizontal, TVGrid.margin)
                .padding(.bottom, TVSpace.s7)
            }
        }
    }

    private var emptyMessage: String {
        if isSearching { return L10n.t("No results", lang) }
        if tools.isEmpty { return L10n.t("Drawing tools load with the chart.", lang) }
        // The Favorites tab before anything has been used.
        return L10n.t("Tools you use appear here.", lang)
    }

    // MARK: - Taxonomy

    private struct Category: Identifiable {
        let id: String
        let title: String
        let tools: [ShellDrawTool]
    }

    private var isSearching: Bool {
        !query.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// A stale index survives a payload that arrives after the sheet opened, so the read
    /// is always clamped rather than trusted.
    private var selectedCategoryIndex: Int {
        min(max(categoryIndex, 0), max(categories.count - 1, 0))
    }

    /// Favorites first (ours), then the payload's families in the CAPTURED tab order —
    /// Tools · Trend lines · Gann and fibonacci · Patterns (`IMG_2366–2368`). The payload
    /// arrives in registry order instead (lines first), and the tab strip is measured
    /// anatomy, so the strip is what wins. A family the taxonomy does not know keeps its
    /// payload position, after the ones it does. Tool order *inside* a tab is never
    /// touched: that is the registry's.
    private var categories: [Category] {
        var out = [Category(id: "favorites", title: L10n.t("Favorites", lang), tools: favorites)]
        var seen = Set<String>()
        var families: [String] = []
        for tool in tools {
            let key = DrawToolTaxonomy.normalize(tool.group)
            // A group the page itself calls "favorites" would duplicate our first tab.
            guard key != "favorites", !seen.contains(key) else { continue }
            seen.insert(key)
            families.append(key)
        }
        let ordered = families.enumerated().sorted { lhs, rhs in
            let left = DrawToolTaxonomy.rank(lhs.element)
            let right = DrawToolTaxonomy.rank(rhs.element)
            return left == right ? lhs.offset < rhs.offset : left < right
        }
        for (_, key) in ordered {
            let members = tools.filter { DrawToolTaxonomy.normalize($0.group) == key }
            guard let first = members.first else { continue }
            out.append(
                Category(
                    id: key,
                    title: DrawToolTaxonomy.title(for: first.group, lang: lang),
                    tools: members
                )
            )
        }
        return out
    }

    private var favorites: [ShellDrawTool] {
        recents.compactMap { id in tools.first { $0.id == id } }
    }

    private var visibleTools: [ShellDrawTool] {
        guard isSearching else {
            let list = categories
            return list.isEmpty ? [] : list[selectedCategoryIndex].tools
        }
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        return tools.filter {
            L10n.t($0.label, lang).lowercased().contains(needle)
                || $0.label.lowercased().contains(needle)
                || $0.id.lowercased().contains(needle)
        }
    }

    // MARK: - Recents

    private var recents: [String] {
        recentsRaw.split(separator: "\u{1F}").map(String.init)
    }

    private func pick(_ tool: ShellDrawTool) {
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        var next = recents.filter { $0 != tool.id }
        next.insert(tool.id, at: 0)
        recentsRaw = next.prefix(9).joined(separator: "\u{1F}")
        onPick(tool)
    }
}

// MARK: - Category pill

/// Measured on `IMG_2366`: 17 pt Bold label, ~10 pt of horizontal padding, a 26.7 pt
/// capsule, 9 pt between pills. Selected fills `Theme.pill` and inks `Theme.text`;
/// unselected draws no plate at all and inks `Theme.text2`.
struct DrawingsCategoryPill: View {
    let title: String
    var isSelected = false
    let action: () -> Void

    static let height: CGFloat = 26.7
    static let gutter: CGFloat = 9

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(isSelected ? Theme.text : Theme.text2)
                .lineLimit(1)
                .padding(.horizontal, 10)
                .frame(height: Self.height)
                .background(isSelected ? Theme.pill : Color.clear, in: Capsule())
        }
        .buttonStyle(TVPressStyle(.tile))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

// MARK: - Tile

/// The Drawings cell. Not `TVTile`: that cell is 72 pt around a 15 pt glyph and a
/// single-line 15 pt label, and this grid needs the larger mark and a two-line label.
struct DrawToolTile: View {
    let icon: String
    let title: String
    var height: CGFloat = 70
    var glyphInk: CGFloat = 22
    var labelFont: Font = .system(size: 12, weight: .medium)
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: glyphInk, weight: .light))
                    .foregroundStyle(Theme.text)
                Text(title)
                    .font(labelFont)
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
            }
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                Theme.panel3,
                in: RoundedRectangle(cornerRadius: TVRadius.tile, style: .continuous)
            )
        }
        .buttonStyle(TVPressStyle(.tile))
    }
}

// MARK: - Taxonomy labels

/// The five families in the captures, resolved from whatever key the page sends.
///
/// Matching is by shape rather than by an exact string so a `trendlines` / `trend-lines` /
/// `Trend lines` spelling change on the web cannot silently produce an untitled tab; an
/// unrecognised family still gets a tab, captioned with the page's own word.
enum DrawToolTaxonomy {
    static func normalize(_ group: String) -> String {
        group.lowercased().filter { $0.isLetter || $0.isNumber }
    }

    /// Tab position in the capture: Tools · Trend lines · Gann and fibonacci · Patterns.
    /// An unknown family sorts last and keeps its payload order there.
    static func rank(_ normalized: String) -> Int {
        if normalized == "tools" { return 0 }
        if normalized.contains("trend") || normalized.contains("line") { return 1 }
        if normalized.contains("gann") || normalized.contains("fib") { return 2 }
        if normalized.contains("pattern") { return 3 }
        return 4
    }

    static func title(for group: String, lang: String) -> String {
        let key = normalize(group)
        if key.isEmpty { return L10n.t("Tools", lang) }
        if key.contains("favo") { return L10n.t("Favorites", lang) }
        if key.contains("trend") || key.contains("line") { return L10n.t("Trend lines", lang) }
        if key.contains("gann") || key.contains("fib") { return L10n.t("Gann and fibonacci", lang) }
        if key.contains("pattern") { return L10n.t("Patterns", lang) }
        if key == "tools" { return L10n.t("Tools", lang) }
        let english = group.prefix(1).uppercased() + group.dropFirst()
        return L10n.t(english, lang)
    }
}

// MARK: - Glyphs

/// SF Symbol per tool id, with a family fallback.
///
/// TV draws bespoke line art for every tool; SF carries no equivalent for most of them,
/// and inventing ~100 vector marks is not this round's work. The rule (§1.8) is that a
/// mark SF does not carry ships as a vector — so these are chosen for *shape agreement*
/// with the capture (a line tool reads as a line, an area tool as an area) and the family
/// fallback keeps an unmapped tool from rendering as a hole.
enum DrawToolGlyph {
    static func name(for tool: ShellDrawTool) -> String {
        if let exact = table[tool.id] { return exact }
        let key = DrawToolTaxonomy.normalize(tool.group)
        if key.contains("gann") || key.contains("fib") { return "chart.bar.doc.horizontal" }
        if key.contains("pattern") { return "point.topleft.down.to.point.bottomright.curvepath" }
        if key.contains("trend") || key.contains("line") { return "line.diagonal" }
        return "scribble"
    }

    private static let table: [String: String] = [
        // Lines
        "trendline": "line.diagonal",
        "ray": "arrow.up.right",
        "infoline": "arrow.up.right.square",
        "extendedline": "line.diagonal",
        "trendangle": "angle",
        "hline": "arrow.left.and.right",
        "horizontalray": "arrow.right",
        "vline": "arrow.up.and.down",
        "crossline": "plus",
        "channel": "equal",
        "regressiontrend": "chart.line.uptrend.xyaxis",
        "flattopbottom": "rectangle.compress.vertical",
        "disjointchannel": "line.3.horizontal.decrease",
        "pitchfork": "tuningfork",
        "schiffpitchfork": "tuningfork",
        "modifiedschiffpitchfork": "tuningfork",
        "insidepitchfork": "tuningfork",
        // Fibonacci / Gann
        "fib": "line.3.horizontal",
        "fibtrend": "chart.line.uptrend.xyaxis",
        "fibchannel": "line.3.horizontal.decrease",
        "fibtimezone": "calendar",
        "fibspeedresistancefan": "fanblades",
        "trendbasedfibtime": "clock.arrow.circlepath",
        "fibcircles": "circle.circle",
        "fibspiral": "hurricane",
        "fibspeedresistancearcs": "wave.3.up",
        "fibwedge": "triangle",
        "pitchfan": "fanblades",
        "gannbox": "square.grid.3x3",
        "gannsquarefixed": "squareshape.split.3x3",
        "gannsquare": "square.grid.3x3",
        "gannfan": "fanblades",
        // Patterns
        "xabcd": "point.topleft.down.to.point.bottomright.curvepath",
        "cypher": "point.topleft.down.to.point.bottomright.curvepath",
        "headandshoulders": "chart.bar",
        "abcd": "diamond",
        "trianglepattern": "triangle",
        "threedrives": "waveform.path",
        "elliottimpulse": "waveform.path.ecg",
        "elliottcorrection": "waveform.path.ecg",
        "elliotttriangle": "waveform.path.ecg",
        "elliottdoublecombo": "waveform.path.ecg",
        "elliotttriplecombo": "waveform.path.ecg",
        "cycliclines": "lines.measurement.vertical",
        "timecycles": "arrow.triangle.2.circlepath",
        "sineline": "wave.3.forward",
        // Forecasting / measurement
        "longposition": "arrow.up.forward.square",
        "shortposition": "arrow.down.forward.square",
        "forecast": "chart.xyaxis.line",
        "ghostfeed": "chart.bar.doc.horizontal",
        "barpattern": "chart.bar",
        "sector": "chart.pie",
        "anchoredvwap": "chart.line.uptrend.xyaxis",
        "fixedrangevolumeprofile": "chart.bar.xaxis",
        "pricerange": "arrow.up.and.down.square",
        "daterange": "arrow.left.and.right.square",
        "dateandpricerange": "square.dashed",
        "measure": "ruler",
        // Freehand
        "brush": "paintbrush.pointed",
        "highlighter": "highlighter",
        "path": "scribble.variable",
        // Shapes
        "rect": "rectangle",
        "rotatedrect": "rectangle.portrait",
        "ellipse": "oval",
        "circle": "circle",
        "triangle": "triangle",
        "polyline": "scribble",
        "arc": "wave.3.up",
        "curve": "point.topleft.down.to.point.bottomright.curvepath",
        "doublecurve": "point.topleft.down.to.point.bottomright.curvepath",
        // Arrows
        "arrowmarker": "arrow.up.right",
        "arrow": "arrow.right",
        "arrowmarkleft": "arrow.left",
        "arrowmarkright": "arrow.right",
        "arrowmarktop": "arrow.up",
        "arrowmarkbottom": "arrow.down",
        "flagmark": "flag",
        // Annotation
        "text": "textformat",
        "anchoredtext": "text.append",
        "note": "note.text",
        "anchorednote": "note.text",
        "callout": "bubble.left",
        "pricelabel": "tag",
        "pricenote": "tag.square",
        "signpost": "signpost.right",
        "comment": "bubble.right",
        "image": "photo",
        "emoji": "face.smiling",
        "icon": "star",
    ]
}
