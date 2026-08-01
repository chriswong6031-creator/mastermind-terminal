import SwiftUI
import UIKit

/// §2.18 `TVChartToolbar` — the chart tab's bottom strip, and the TV signature
/// interaction: symbol and interval live in compact wheels whose drag rolls the values and
/// hot-swaps the chart on every detent (§3.3 item 9 — "commits live per drag-frame, not on
/// release"). Tapping the SELECTED symbol chamber opens search — TV's verb; there is
/// deliberately no separate search button.
///
/// Measured chrome (§2.18): **51.7 pt** tall, fill pure `#000000`, a hairline above *and*
/// below, both labels **26 pt Bold pure white** (the only pure-white text in the app,
/// §1.3) with the previous/next wheel values ghosted above and below at ~40 % opacity and
/// reduced scale at rest — the "keep scrolling" affordance. Right cluster, left → right:
/// pencil · magnet · `•••` (+ red dot) · vertical divider · undo · fullscreen, all white
/// stroke on a 28 pt target (§1.8).
///
/// Pencil / magnet / undo are placeholder affordances: correctly-styled controls that
/// acknowledge the touch and do nothing (drawing, snap and undo all live in the chart
/// renderer, which per `AGENTS.md` stays in `terminal/`). `•••` presents the Analysis hub.
struct RollerStrip: View {
    /// §2.18: measured 739.3 → 791.0 pt.
    static let height: CGFloat = 51.7
    /// §2.18 measured x-bands: symbol ink from 13.3 pt, interval ink from 96.7 pt.
    static let symbolLeading: CGFloat = 13.3
    static let symbolWidth: CGFloat = 83.4
    static let intervalWidth: CGFloat = 54

    let symbols: [String]
    let timeframes: [String]
    @Binding var symbolIndex: Int
    @Binding var timeframeIndex: Int
    let onSymbol: (String) -> Void
    let onTimeframe: (String) -> Void
    let onTapSymbol: () -> Void
    var lang: String = "en"
    /// §2.18 — the `•••` icon carries the universal red dot while the hub holds unseen items.
    var showsMoreBadge: Bool = true
    var onMore: () -> Void = {}
    var onFullscreen: () -> Void = {}

    var body: some View {
        HStack(spacing: 0) {
            // Symbol first, interval second — TV's order and their measured x-bands. The
            // labels are the leading edge of the bar: nothing sits to their left.
            WheelColumn(
                items: symbols,
                selection: $symbolIndex,
                width: Self.symbolWidth,
                accessibilityName: L10n.t("Symbol", lang),
                onPick: onSymbol,
                onCenterTap: onTapSymbol
            )
            .padding(.leading, Self.symbolLeading)

            WheelColumn(
                items: timeframes,
                selection: $timeframeIndex,
                width: Self.intervalWidth,
                accessibilityName: L10n.t("Interval", lang),
                onPick: onTimeframe,
                onCenterTap: nil
            )

            Spacer(minLength: 0)

            iconCluster
        }
        .frame(height: Self.height)
        .background(Theme.bg)
        // C19: the rules that bracket the toolbar are a true single device pixel, not the
        // 1 pt sheet weight — shipping 1 pt here is a visible, wrong-looking delta.
        .overlay(alignment: .top) { TVHairline.hair() }
        .overlay(alignment: .bottom) { TVHairline.hair() }
    }

    /// Sized so the whole strip still fits a 375 pt device without the trailing icon
    /// clipping: 5 × 28 pt targets + 5 gaps + the divider = 180 pt against a 151 pt
    /// left block.
    private var iconCluster: some View {
        HStack(spacing: 5) {
            ToolbarIcon(
                glyph: .symbol("pencil"),
                label: L10n.t("Draw", lang),
                isPlaceholder: true,
                lang: lang
            )
            // §2.18's "magnet": TV's snap mark is two congruent chevrons offset on the
            // diagonal, not SF's symmetric `chevron.up.chevron.down` sort control.
            ToolbarIcon(
                glyph: .magnet,
                label: L10n.t("Magnet", lang),
                isPlaceholder: true,
                lang: lang
            )
            ToolbarIcon(
                glyph: .symbol("ellipsis"),
                label: L10n.t("More", lang),
                showsBadge: showsMoreBadge,
                lang: lang,
                action: onMore
            )

            Rectangle()
                .fill(Theme.line)
                .frame(width: 1, height: 24)
                .padding(.horizontal, 3)
                .accessibilityHidden(true)

            ToolbarIcon(
                glyph: .symbol("arrow.uturn.backward"),
                label: L10n.t("Undo", lang),
                isPlaceholder: true,
                lang: lang
            )
            ToolbarIcon(
                glyph: .symbol("arrow.up.left.and.arrow.down.right"),
                label: L10n.t("Full screen", lang),
                lang: lang,
                action: onFullscreen
            )
        }
        .padding(.trailing, 8)
    }
}

// MARK: - toolbar icons

/// §1.8: 28 pt target, white stroke, no fill, never tinted. Placeholders answer the touch
/// with a soft impact and a press state, then do nothing — TV's structure without a lie
/// about what the alpha ships.
private struct ToolbarIcon: View {
    enum Glyph {
        case symbol(String)
        /// §2.18 magnet/snap — no SF equivalent, so it ships as a vector (§1.8's rule for
        /// TV marks that SF does not carry).
        case magnet
    }

    let glyph: Glyph
    let label: String
    var isPlaceholder = false
    var showsBadge = false
    var lang = "en"
    var action: () -> Void = {}

    var body: some View {
        Button {
            if isPlaceholder {
                UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            }
            action()
        } label: {
            ink
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .tvBadgeDot(showsBadge)
                .contentShape(Rectangle())
        }
        .buttonStyle(ToolbarIconStyle())
        .accessibilityLabel(label)
        .accessibilityHint(isPlaceholder ? L10n.t("Not in this alpha", lang) : "")
    }

    @ViewBuilder
    private var ink: some View {
        switch glyph {
        case .symbol(let name):
            Image(systemName: name)
                .font(.system(size: 20, weight: .light))
        case .magnet:
            // Matched to the neighbouring 20 pt `.light` SF glyphs: same ink height, same
            // 1.6 pt stroke, round caps and joins.
            MagnetSnapGlyph()
                .stroke(style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                .frame(width: 19, height: 11)
        }
    }
}

/// Two congruent chevrons offset on the diagonal: one pointing up in the lower-left
/// overlapping one pointing down in the upper-right (§2.18, matched to the TV reference).
private struct MagnetSnapGlyph: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        func chevron(_ points: [(CGFloat, CGFloat)]) {
            let mapped = points.map {
                CGPoint(x: rect.minX + $0.0 * rect.width, y: rect.minY + $0.1 * rect.height)
            }
            path.move(to: mapped[0])
            path.addLine(to: mapped[1])
            path.addLine(to: mapped[2])
        }
        chevron([(0.00, 0.98), (0.32, 0.32), (0.64, 0.98)])
        chevron([(0.36, 0.02), (0.68, 0.68), (1.00, 0.02)])
        return path
    }
}

private struct ToolbarIconStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.45 : 1)
    }
}

// MARK: - the value wheels

private enum WheelMetrics {
    /// §1.3 toolbar symbol / interval.
    static let fontSize: CGFloat = 26
    /// Pitch that puts the ghost ink inside the 51.7 pt strip while leaving the 26 pt
    /// centre row uncrowded (ghost ink lands 18.3–29.7 pt from centre, cropped at 25.85).
    static let rowHeight: CGFloat = 24
    /// §2.18 — neighbours at rest.
    static let ghostOpacity: CGFloat = 0.4
    static let ghostScale: CGFloat = 0.62
    /// Rows rendered on each side of the centre; the strip crops well before this.
    static let window = 3
}

/// One wheel, cropped to the toolbar.
///
/// This is deliberately **not** a `UIPickerView`: SwiftUI cannot composite a
/// `UIViewRepresentable` into the `.mask()` this strip needs for its cropped ghost
/// chambers, and the hosted picker rendered nothing at all inside it — the whole leading
/// 58 % of the toolbar came up empty black. Drawing the wheel in SwiftUI keeps the
/// §2.18 ghosting continuous (opacity 1 → 0.4, scale 1 → 0.62 by distance from centre,
/// interpolated every frame of the drag rather than per detent) and keeps the §3.3.9
/// contract that the value commits live per drag-frame, not on release.
private struct WheelColumn: View {
    let items: [String]
    @Binding var selection: Int
    let width: CGFloat
    let accessibilityName: String
    let onPick: (String) -> Void
    let onCenterTap: (() -> Void)?

    /// The index the wheel is visually centred on. `nil` at rest = exactly `selection`;
    /// during a drag it is the continuous, un-snapped position.
    @State private var visualCentre: CGFloat?
    /// The index the current drag started from, and the flag for "a drag is in flight".
    @State private var dragOrigin: Int?

    private var centre: CGFloat { visualCentre ?? CGFloat(selection) }

    private var visibleRows: [Int] {
        guard !items.isEmpty else { return [] }
        let anchor = Int(centre.rounded())
        let lower = max(0, anchor - WheelMetrics.window)
        let upper = min(items.count - 1, anchor + WheelMetrics.window)
        guard lower <= upper else { return [] }
        return Array(lower...upper)
    }

    var body: some View {
        ZStack(alignment: Alignment(horizontal: .leading, vertical: .center)) {
            // A zero-size ZStack would collapse the column when `items` is empty.
            Color.clear.frame(width: width, height: 1)

            ForEach(visibleRows, id: \.self) { index in
                let distance = CGFloat(index) - centre
                let magnitude = min(abs(distance), 1)
                Text(items[index])
                    // §1.3: the toolbar labels are the one place TradingView uses pure white.
                    .font(.system(size: WheelMetrics.fontSize, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .frame(width: width, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    // Scale about the left edge so a ghost stays flush with the selected
                    // value instead of drifting inward as it shrinks.
                    .scaleEffect(1 - (1 - WheelMetrics.ghostScale) * magnitude, anchor: .leading)
                    .opacity(1 - (1 - WheelMetrics.ghostOpacity) * magnitude)
                    .offset(y: distance * WheelMetrics.rowHeight)
            }
        }
        .frame(width: width, height: RollerStrip.height)
        .clipped()
        .mask {
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.08),
                    .init(color: .black, location: 0.92),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
        }
        .contentShape(Rectangle())
        // Snap and programmatic moves animate; a drag in flight must track the finger.
        .animation(dragOrigin == nil ? .easeOut(duration: 0.18) : nil, value: centre)
        .gesture(roll)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityName)
        .accessibilityValue(items.indices.contains(selection) ? items[selection] : "")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: commit(selection + 1)
            case .decrement: commit(selection - 1)
            @unknown default: break
            }
        }
    }

    /// One recognizer for both verbs: `minimumDistance: 0` so a tap on the selected
    /// chamber resolves here too, instead of racing a second gesture. Taps on a ghost row
    /// are ignored — TV rolls those with the drag, not with a jump.
    private var roll: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard !items.isEmpty else { return }
                let origin = dragOrigin ?? selection
                if dragOrigin == nil { dragOrigin = origin }
                let travelled = value.translation.height / WheelMetrics.rowHeight
                let continuous = CGFloat(origin) - travelled
                let clamped = min(max(continuous, 0), CGFloat(items.count - 1))
                visualCentre = clamped
                // §3.3.9 — commit live, per drag-frame.
                commit(Int(clamped.rounded()))
            }
            .onEnded { value in
                dragOrigin = nil
                visualCentre = nil
                guard abs(value.translation.height) < 4, let onCenterTap else { return }
                let band = WheelMetrics.rowHeight / 2 + 3
                guard abs(value.startLocation.y - RollerStrip.height / 2) <= band else { return }
                onCenterTap()
            }
    }

    private func commit(_ index: Int) {
        guard items.indices.contains(index), index != selection else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        selection = index
        onPick(items[index])
    }
}
