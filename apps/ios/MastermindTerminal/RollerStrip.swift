import SwiftUI
import UIKit

/// §2.18 `TVChartToolbar` — the chart tab's bottom strip, and the TV signature
/// interaction: symbol and interval live in compact wheels whose drag rolls the values and
/// hot-swaps the chart on every detent (§3.3 item 9 — "commits live per drag-frame, not on
/// release"). Tapping the SELECTED symbol chamber opens search — TV's verb; there is
/// deliberately no separate search button.
///
/// Measured chrome (§2.18, corrected by C24): **51.7 pt** tall, fill pure `#000000`, a
/// hairline above *and* below, both labels **17 pt Bold pure white** at rest (t-045 ink
/// band 12.0 pt → 17 pt; the spec's original 26 pt was a misread of the enlarged mid-drag
/// wheel centre, §2.19) with the previous/next wheel values ghosted above and below at
/// ~40 % opacity and reduced scale — the "keep scrolling" affordance.
///
/// **C25 structure** — the strip is now two blocks, not one row:
/// `[ FIXED: symbol wheel · interval wheel ] [ fade ] [ SCROLLABLE icon cluster ]`.
/// The wheels are anchored: they never move when the cluster is scrolled, and the cluster's
/// leading edge dissolves under a 16 pt gradient so an icon scrolling out never crowds the
/// interval label. Cluster order, left → right (TV): pencil · magnet · `•••` (+ red dot) ·
/// 1 pt divider · undo · minimize · redo · share, on 28 pt targets at a 14 pt pitch.
/// The cluster is wider than any phone on purpose — TV clips its own trailing icons the
/// same way (§2.18 "fullscreen … clipped at right edge") — so it scrolls.
///
/// Magnet / undo / redo are placeholder affordances: correctly-styled controls that
/// acknowledge the touch and do nothing (snap and drawing-undo live in the chart renderer,
/// which per `AGENTS.md` stays in `terminal/`). The pencil toggles the renderer's own
/// drawing toolbar over the bridge (`setDrawTools`); `•••` presents the Analysis hub;
/// minimize collapses the app's bottom menu into the chart; share is real OS share.
struct RollerStrip: View {
    /// §2.18: measured 739.3 → 791.0 pt.
    static let height: CGFloat = 51.7
    /// §2.18 measured x-bands: symbol ink from 13.3 pt, interval ink from 96.7 pt.
    static let symbolLeading: CGFloat = 13.3
    static let symbolWidth: CGFloat = 83.4
    static let intervalWidth: CGFloat = 54
    /// C25: the "faded cut off" between the fixed wheels and the scrolling cluster.
    static let clusterFade: CGFloat = 16
    /// §1.8 touch target, and the C25 pitch between them (the old 5 pt read as cramped).
    static let iconTarget: CGFloat = 28
    static let iconGap: CGFloat = 14

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
    /// Pencil state + toggle: mirrors whether the web chart's drawing toolbar is shown.
    var drawActive: Bool = false
    var onDraw: () -> Void = {}
    /// The chart's live symbol — what the share sheet links to (the wheel index can lag a
    /// programmatic symbol change by a frame; the bridge's value is the truth).
    var shareSymbol: String = AppConfig.defaultSymbol
    /// C25 minimize-rect: chrome-minimize state and its toggle. Replaces the old
    /// full-screen button, whose only action was a "rotate the device" hint.
    var chromeMinimized: Bool = false
    var onToggleChrome: () -> Void = {}

    var body: some View {
        HStack(spacing: 0) {
            // Symbol first, interval second — TV's order and their measured x-bands. The
            // labels are the leading edge of the bar: nothing sits to their left, and
            // nothing the cluster does can move them.
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

            scrollingCluster
        }
        .frame(height: Self.height)
        .background(Theme.bg)
        // C19: the rules that bracket the toolbar are a true single device pixel, not the
        // 1 pt sheet weight — shipping 1 pt here is a visible, wrong-looking delta.
        .overlay(alignment: .top) { TVHairline.hair() }
        .overlay(alignment: .bottom) { TVHairline.hair() }
    }

    /// The scrolling half of the bar. `GeometryReader` only supplies the viewport width, so
    /// the cluster can be pushed to the trailing edge when it *does* fit (iPad, landscape)
    /// while still overflowing — and scrolling — on every phone.
    ///
    /// The mask lives on the scroll container, never on the wheels: both are pure SwiftUI
    /// now, but the wheels are the one thing that must not be composited into a fading
    /// layer (that is what killed the `UIPickerView` build — see `WheelColumn`).
    private var scrollingCluster: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    iconCluster
                }
                .frame(minWidth: geo.size.width, minHeight: Self.height)
            }
            .frame(width: geo.size.width, height: Self.height)
            .mask(fadeMask)
        }
    }

    /// ~16 pt of dissolve at the leading edge, hard-opaque everywhere after it.
    private var fadeMask: some View {
        HStack(spacing: 0) {
            LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)
                .frame(width: Self.clusterFade)
            Color.black
        }
    }

    private var iconCluster: some View {
        HStack(spacing: Self.iconGap) {
            ToolbarIcon(
                glyph: .symbol("pencil", size: 22, weight: .medium),
                label: L10n.t("Draw", lang),
                isActive: drawActive,
                lang: lang,
                action: onDraw
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
                glyph: .symbol("ellipsis", size: 22, weight: .medium),
                label: L10n.t("More", lang),
                showsBadge: showsMoreBadge,
                lang: lang,
                action: onMore
            )

            Rectangle()
                .fill(Theme.line)
                .frame(width: 1, height: 24)
                .accessibilityHidden(true)

            ToolbarIcon(
                glyph: .symbol("arrow.uturn.backward", size: 20, weight: .medium),
                label: L10n.t("Undo", lang),
                isPlaceholder: true,
                lang: lang
            )
            ToolbarIcon(
                glyph: .minimizeRect,
                label: chromeMinimized
                    ? L10n.t("Show menu bar", lang)
                    : L10n.t("Hide menu bar", lang),
                isActive: chromeMinimized,
                lang: lang,
                action: onToggleChrome
            )
            ToolbarIcon(
                glyph: .symbol("arrow.uturn.forward", size: 20, weight: .medium),
                label: L10n.t("Redo", lang),
                isPlaceholder: true,
                lang: lang
            )

            // Real OS share of the public chart link — no `shell=app`, so the recipient
            // lands on the web terminal rather than a shell-mode page.
            ShareLink(item: shareURL, subject: Text(shareSymbol)) {
                ToolbarGlyphInk(glyph: .symbol("square.and.arrow.up", size: 20, weight: .medium))
            }
            .buttonStyle(ToolbarIconStyle())
            .accessibilityLabel(L10n.t("Share", lang))
        }
        // Clears the fade zone, so the pencil reads at full ink at rest and only dissolves
        // once the user actually scrolls the cluster under the wheels.
        .padding(.leading, Self.clusterFade - 2)
        .padding(.trailing, 12)
    }

    private var shareURL: URL {
        var components = URLComponents(url: AppConfig.origin, resolvingAgainstBaseURL: false)!
        components.path = "/terminal"
        components.queryItems = [URLQueryItem(name: "symbol", value: shareSymbol)]
        return components.url ?? AppConfig.origin
    }
}

// MARK: - toolbar icons

/// §1.8 + C25: white stroke, no fill, never tinted, on a 28 pt target. Ink weights are
/// deliberately heavier than the pass-1 `.light` 20 pt: TV's marks are solid and confident,
/// and at `.light` the pencil and the u-turn arrows read as sketches next to them.
private enum ToolbarGlyph {
    case symbol(String, size: CGFloat, weight: Font.Weight)
    /// §2.18 magnet/snap — no SF equivalent, so it ships as a vector (§1.8's rule for TV
    /// marks that SF does not carry).
    case magnet
    /// C25 minimize/expand — TV's rounded-rect outline that collapses the bottom menu.
    case minimizeRect
}

/// The ink alone, with no gesture attached, so a `Button` and a `ShareLink` can both wear it.
private struct ToolbarGlyphInk: View {
    let glyph: ToolbarGlyph
    var isActive = false
    var showsBadge = false

    var body: some View {
        ink
            .foregroundStyle(.white)
            .frame(width: RollerStrip.iconTarget, height: RollerStrip.iconTarget)
            // C21 one-notch rule: a raised plate on pure black is `pill`, and the glyph
            // itself stays a bare white stroke in both states.
            .background {
                if isActive {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Theme.pill)
                }
            }
            .tvBadgeDot(showsBadge)
            .contentShape(Rectangle())
    }

    @ViewBuilder
    private var ink: some View {
        switch glyph {
        case let .symbol(name, size, weight):
            Image(systemName: name)
                .font(.system(size: size, weight: weight))
        case .magnet:
            MagnetSnapGlyph()
                .stroke(style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                .frame(width: 20, height: 13)
        case .minimizeRect:
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: 1.8, lineJoin: .round))
                .frame(width: 20, height: 15)
        }
    }
}

/// Placeholders answer the touch with a soft impact and a press state, then do nothing —
/// TV's structure without a lie about what the alpha ships.
private struct ToolbarIcon: View {
    let glyph: ToolbarGlyph
    let label: String
    var isPlaceholder = false
    var isActive = false
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
            ToolbarGlyphInk(glyph: glyph, isActive: isActive, showsBadge: showsBadge)
        }
        .buttonStyle(ToolbarIconStyle())
        .accessibilityLabel(label)
        .accessibilityAddTraits(isActive ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint(isPlaceholder ? L10n.t("Not in this alpha", lang) : "")
    }
}

/// Two congruent chevrons offset on the diagonal — the same shape twice, the second shifted
/// right and up, drawn at 1.8 pt with round caps so it reads as solid as TV's mark (§2.18,
/// C25: the pass-1 pair was thin, and its two halves were mirrored rather than congruent).
private struct MagnetSnapGlyph: Shape {
    /// Normalised half-extent of one chevron; the pair spans the full box.
    private static let span: CGFloat = 0.72
    private static let rise: CGFloat = 0.62

    func path(in rect: CGRect) -> Path {
        var path = Path()
        func chevron(originX: CGFloat, originY: CGFloat) {
            let points: [(CGFloat, CGFloat)] = [
                (originX, originY + Self.rise),
                (originX + Self.span / 2, originY),
                (originX + Self.span, originY + Self.rise),
            ]
            let mapped = points.map {
                CGPoint(x: rect.minX + $0.0 * rect.width, y: rect.minY + $0.1 * rect.height)
            }
            path.move(to: mapped[0])
            path.addLine(to: mapped[1])
            path.addLine(to: mapped[2])
        }
        chevron(originX: 0, originY: 1 - Self.rise)
        chevron(originX: 1 - Self.span, originY: 0)
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
    /// §1.3 toolbar symbol / interval — C24 correction: TV's at-rest label ink measures
    /// 12.0 pt in t-045 → **17 pt Bold** (the spec's 26 pt was the mid-drag wheel centre).
    static let fontSize: CGFloat = 17
    /// Pitch that puts the ghost ink inside the 51.7 pt strip while leaving the 17 pt
    /// centre row uncrowded (ghost ink lands ~13–21 pt from centre, cropped at 25.85).
    static let rowHeight: CGFloat = 19
    /// §2.18 — neighbours at rest.
    static let ghostOpacity: CGFloat = 0.4
    static let ghostScale: CGFloat = 0.72
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
