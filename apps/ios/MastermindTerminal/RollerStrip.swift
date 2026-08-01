import SwiftUI
import UIKit

/// §2.18 `TVChartToolbar` — the chart tab's bottom strip, and the TV signature
/// interaction: symbol and interval live in compact wheels whose drag rolls the values and
/// hot-swaps the chart on every detent (§3.3 item 9 — "commits live per drag-frame, not on
/// release"). Tapping the SELECTED symbol chamber opens search — TV's verb; there is
/// deliberately no separate search button.
///
/// Measured chrome (§2.18, corrected by C24): **51.7 pt** tall, fill pure `#000000`, a
/// hairline above and a single-device-pixel seam below (whose owner is the tab bar — see
/// `body`), both labels **17 pt Bold `Theme.text`** at rest (t-045 ink band 12.0 pt → 17 pt;
/// the spec's original 26 pt was a misread of the enlarged mid-drag wheel centre, §2.19)
/// with the previous/next wheel values ghosted above and below at **34 %** opacity and
/// **full size** — the "keep scrolling" affordance (ANIM-02: §2.18's "~40 % and reduced
/// scale" is superseded by the `IMG_2296` pixel measurement, which reads the resting ghost
/// at `#4A4A4A` = 0.34 of the `#DBDBDB` centre; see `WheelMetrics.restingGhostOpacity`).
///
/// While a wheel is rolled, the §2.19 magnified panel floats 8 pt above the strip
/// (`TVWheelPicker`) — the affordance that tells the user a list is moving under the finger.
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
    /// C26 — TV's undo/redo ink box, measured on `IMG_2296` (x1042–1079 / y2279–2308 @3x).
    /// The target around it stays `iconTarget`; only the ink shrinks.
    static let uturnInk = CGSize(width: 12.7, height: 9.7)

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

    /// §2.19 — the floating magnified wheel, non-nil only while a wheel is being rolled.
    /// It lives here rather than inside `WheelColumn` because that view is `.clipped()` to
    /// the 51.7 pt strip and could never draw the 133 pt panel above it.
    @State private var wheelDrag: WheelDragState?

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
                onCenterTap: onTapSymbol,
                pickerKind: .symbol,
                pickerLeadingX: Self.symbolLeading,
                onWheelDrag: { wheelDrag = $0 }
            )
            .padding(.leading, Self.symbolLeading)

            WheelColumn(
                items: timeframes,
                selection: $timeframeIndex,
                width: Self.intervalWidth,
                accessibilityName: L10n.t("Interval", lang),
                onPick: onTimeframe,
                onCenterTap: nil,
                pickerKind: .interval,
                pickerItems: timeframes.map { Self.intervalLongForm($0, lang: lang) },
                pickerLeadingX: Self.symbolLeading + Self.symbolWidth,
                onWheelDrag: { wheelDrag = $0 }
            )

            scrollingCluster
        }
        .frame(height: Self.height)
        .background(Theme.bg)
        // C19: the rules that bracket the toolbar are a true single device pixel, not the
        // 1 pt sheet weight — shipping 1 pt here is a visible, wrong-looking delta.
        .overlay(alignment: .top) { TVHairline.hair() }
        // C26 seam ownership — the strip's TOP rule is its own; the BOTTOM seam belongs to
        // whatever is under it. `TVRootTabBar` already draws a single-device-pixel
        // `#4A4A4A` rule at its own top edge, so drawing ours there too stacked **two**
        // pixel rows (0.67 pt) where TV (`IMG_2296`, rows y2217 and y2373) draws exactly
        // one, and it shortened the visible band from the measured 51.7 pt to 51.3 pt.
        // The tab bar is therefore the sole owner of the seam; the strip draws its own
        // bottom rule only when C25 has minimised the bar away and nothing else owns it.
        // Do not re-add an unconditional rule here without deleting the bar's.
        .overlay(alignment: .bottom) {
            if chromeMinimized { TVHairline.hair() }
        }
        .overlay(alignment: .bottomLeading) { wheelPicker }
    }

    /// §2.19 places the panel 8 pt clear of the strip's top edge and flush with the wheel
    /// column it belongs to. Anchored `.bottomLeading` so both offsets are the measurement
    /// itself rather than a half-height arithmetic detour.
    @ViewBuilder
    private var wheelPicker: some View {
        if let drag = wheelDrag {
            TVWheelPicker(items: drag.items, centre: drag.centre, kind: drag.kind)
                .offset(x: drag.leadingX, y: -(Self.height + 8))
                // The finger is on the strip below; the panel is a readout, never a target.
                .allowsHitTesting(false)
                .transition(.scale(scale: 0.9, anchor: .bottom).combined(with: .opacity))
        }
    }

    /// t-012 / t-014 — the floating wheel spells intervals out; only the toolbar chamber
    /// abbreviates. Codes the chart does not use fall through unchanged.
    static func intervalLongForm(_ code: String, lang: String) -> String {
        let digits = code.prefix { $0.isNumber }
        let count = Int(digits) ?? 1
        let unit: String
        // Case matters: `1m` is a minute, `1M` a month.
        switch code.dropFirst(digits.count) {
        case "m": unit = "minute"
        case "h": unit = "hour"
        case "D", "d": unit = "day"
        case "W", "w": unit = "week"
        case "M": unit = "month"
        default: return code
        }
        return L10n.t("\(count) \(unit)\(count == 1 ? "" : "s")", lang)
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
                glyph: .ellipsisRings,
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
                glyph: .uturn(forward: false),
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
                glyph: .uturn(forward: true),
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
    /// C26 `•••` — TV's "more" mark is three **outline rings**, not SF's filled `ellipsis`
    /// (measured `IMG_2296` x861–924 / y2287–2302: 5.3 pt rings on an 8.2 pt pitch, 21.7 pt
    /// total span, 1.33 pt stroke). SF's filled dots shipped ~24.3 pt wide and read as a
    /// heavier, denser mark than anything else in TV's cluster.
    case ellipsisRings
    /// C26 undo / redo — TV's u-turn ink measures **12.7 × 9.7 pt** (`IMG_2296` x1042–1079 /
    /// y2279–2308). Ours rendered 18.7 × 18.7 at 20 pt, i.e. roughly twice the area, which
    /// is what made the trailing half of the cluster read as the loudest thing on the bar.
    case uturn(forward: Bool)
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
        case .ellipsisRings:
            EllipsisRingsGlyph()
                .stroke(style: StrokeStyle(lineWidth: EllipsisRingsGlyph.stroke))
                .frame(width: EllipsisRingsGlyph.span, height: EllipsisRingsGlyph.ring)
        case let .uturn(forward):
            // `.resizable()` rather than a smaller point size: SF's u-turn is square where
            // TV's is 1.3 : 1, so the measured 12.7 × 9.7 pt box is the *bound* and the
            // 9.7 pt height is the match. A point size small enough to hit 9.7 pt of ink
            // would also thin the stroke below TV's 1.67 pt shaft.
            Image(systemName: forward ? "arrow.uturn.forward" : "arrow.uturn.backward")
                .resizable()
                .scaledToFit()
                .fontWeight(.semibold)
                .frame(width: RollerStrip.uturnInk.width, height: RollerStrip.uturnInk.height)
        }
    }
}

/// C26 `•••` — three congruent outline rings on one baseline, drawn as a stroked path so
/// the ring wall is TV's measured 1.33 pt rather than SF's solid fill.
private struct EllipsisRingsGlyph: Shape {
    /// Outer diameter of one ring (`IMG_2296`: 16 px @3x).
    static let ring: CGFloat = 5.3
    /// Centre-to-centre pitch (`IMG_2296`: 24 px @3x → 8.0; 8.2 keeps the measured
    /// 21.7 pt span with the 5.3 pt ring).
    static let pitch: CGFloat = 8.2
    /// Ring wall (`IMG_2296`: 4 px @3x).
    static let stroke: CGFloat = 1.33
    /// `ring + 2 × pitch` — the mark's measured total span on TV, 21.7 pt.
    static let span: CGFloat = ring + 2 * pitch

    func path(in rect: CGRect) -> Path {
        var path = Path()
        // The stroke is centred on the path, so the *path* diameter is the outer diameter
        // less one wall; that is what makes the rendered ring measure 5.3 pt.
        let diameter = Self.ring - Self.stroke
        for index in 0..<3 {
            let centreX = rect.minX + Self.ring / 2 + CGFloat(index) * Self.pitch
            path.addEllipse(
                in: CGRect(
                    x: centreX - diameter / 2,
                    y: rect.midY - diameter / 2,
                    width: diameter,
                    height: diameter
                )
            )
        }
        return path
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
        // ANIM-22: the icons that *do* something acknowledge on press-down; the
        // placeholders keep the distinct `.soft` impact on the action instead, so the two
        // classes of control never feel the same under the finger.
        .buttonStyle(ToolbarIconStyle(acknowledges: !isPlaceholder))
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

/// ANIM-22 — a 28 pt glyph dimming to 45 % is easy to miss on a black bar under a thumb,
/// so the press also shrinks it. The haptic lives here rather than in each button's action
/// so that `ShareLink`, which has no action closure of ours, acknowledges as well.
private struct ToolbarIconStyle: ButtonStyle {
    var acknowledges = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.45 : 1)
            .scaleEffect(configuration.isPressed ? 0.90 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .sensoryFeedback(trigger: configuration.isPressed) { _, pressed in
                acknowledges && pressed ? .impact(weight: .light) : nil
            }
    }
}

// MARK: - the value wheels

private enum WheelMetrics {
    /// §1.3 toolbar symbol / interval — C24 correction: TV's at-rest label ink measures
    /// 12.0 pt in t-045 → **17 pt Bold** (the spec's 26 pt was the mid-drag wheel centre).
    static let fontSize: CGFloat = 17
    /// ANIM-02 — measured on `IMG_2296.PNG` rows y2218–2373, not chosen to fit: cap-top
    /// pitch centre → ghost is 69 px = **23.0 pt**. The earlier 19 pt was derived from the
    /// assumption that the ghosts had to be squeezed clear of a 40 %-opacity centre row;
    /// they do not, and the strip height is unchanged at 51.7 pt.
    static let rowHeight: CGFloat = 23
    /// C26 — the **resting** ghost of the toolbar wheel, and only that. `IMG_2296` reads
    /// the `META`/`BABA` and `1M`/`3m` rows at `#4A4A4A` (74/255) against the `#DBDBDB`
    /// (219/255) centre → **0.338**, i.e. TV's resting ghost is a third of the centre ink,
    /// not a sixth. A previous round collapsed this onto the mid-drag panel's much fainter
    /// value (`TVWheelPicker.dragGhostOpacity`, ~15 %) and the whole leading half of the
    /// bar went nearly blank at rest.
    ///
    /// **These are two different measurements of two different surfaces — do not merge
    /// them again.** Toolbar chamber at rest = 0.34 here; §2.19 floating panel mid-drag =
    /// `TVWheelPicker.dragGhostOpacity`.
    static let restingGhostOpacity: CGFloat = 0.34
    /// ANIM-02 — the ghost glyph's width equals the centre glyph's: TV does **not** shrink
    /// the neighbours, it only fades them. Kept as the record of that measurement.
    static let ghostScale: CGFloat = 1.0
    /// Rows rendered on each side of the centre; the strip crops well before this.
    static let window = 3
    /// Below this the gesture is a tap on the chamber, not a roll.
    static let tapSlop: CGFloat = 4
    /// ANIM-17 — trailing debounce on the *bridge* commit, in ms. TV runs the chart one
    /// detent behind the wheel (t-014, t-015); rolling a 7-symbol watchlist must not issue
    /// 7 main-thread `evaluateJavaScript` chart loads while the finger is still down.
    static let pickDebounce = 120
}

/// What the floating §2.19 picker needs to draw itself. Lifted out of `WheelColumn`
/// because that view is `.clipped()` to the 51.7 pt strip and can never paint above it.
private struct WheelDragState: Equatable {
    var items: [String]
    var centre: CGFloat
    var kind: TVWheelPicker.Kind
    /// x of the wheel column's leading edge, in the strip's coordinate space.
    var leadingX: CGFloat
}

/// One wheel, cropped to the toolbar.
///
/// This is deliberately **not** a `UIPickerView`: SwiftUI cannot composite a
/// `UIViewRepresentable` into the `.mask()` this strip needs for its cropped ghost
/// chambers, and the hosted picker rendered nothing at all inside it — the whole leading
/// 58 % of the toolbar came up empty black. Drawing the wheel in SwiftUI keeps the
/// §2.18 ghosting continuous (opacity 1 → `WheelMetrics.restingGhostOpacity` by distance
/// from centre, interpolated
/// every frame of the drag rather than per detent) and keeps the §3.3.9 contract that the
/// value commits live per drag-frame, not on release.
private struct WheelColumn: View {
    let items: [String]
    @Binding var selection: Int
    let width: CGFloat
    let accessibilityName: String
    let onPick: (String) -> Void
    let onCenterTap: (() -> Void)?
    /// Which §2.19 panel this wheel raises while it is being dragged.
    var pickerKind: TVWheelPicker.Kind = .symbol
    /// Row strings for the floating panel, when they differ from the toolbar's (the
    /// interval wheel spells its values out — `1 hour`, not `1h`, per t-012/t-014).
    var pickerItems: [String]? = nil
    /// This column's leading edge inside the strip, so the panel can align to it.
    var pickerLeadingX: CGFloat = 0
    var onWheelDrag: (WheelDragState?) -> Void = { _ in }

    /// The index the wheel is visually centred on. `nil` at rest = exactly `selection`;
    /// during a drag it is the continuous, un-snapped position.
    @State private var visualCentre: CGFloat?
    /// The index the current drag started from, and the flag for "a drag is in flight".
    @State private var dragOrigin: Int?
    /// True while the gesture path owns the transaction — the live drag and the flick
    /// spring that follows it. The implicit `.animation` below must stand down for both or
    /// it fights the explicit spring; it exists only for programmatic `syncWheels()` moves.
    @State private var isSettling = false
    /// The pending debounced bridge commit (ANIM-17).
    @State private var flushTask: Task<Void, Never>?
    /// Whether the §2.19 floating panel is already up, so only the first frame of a roll
    /// animates it in.
    @State private var isPickerUp = false

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
                    // ANIM-02: the centre row is the measured 219/255 — `Theme.text`
                    // (#DBDBDB) — not pure white. §1.3's "the one place TV uses pure white"
                    // was read off a saturated capture.
                    .font(.system(size: WheelMetrics.fontSize, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .frame(width: width, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    // C26: 1 → 0.34 by distance. This is the RESTING toolbar ghost, which
                    // is a different measurement from the §2.19 panel's mid-drag rows.
                    .opacity(1 - (1 - WheelMetrics.restingGhostOpacity) * magnitude)
                    .offset(y: distance * WheelMetrics.rowHeight)
            }
        }
        .frame(width: width, height: RollerStrip.height)
        .clipped()
        // TV crops its own ghost rows against the bar's two rules (`IMG_2296` y2217/y2373),
        // so the mask is a single-pixel bleed at each edge rather than a long fade that
        // would eat 8 % of the row — the cut is the reference, not an artefact to hide.
        .mask {
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.02),
                    .init(color: .black, location: 0.98),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
        }
        .contentShape(Rectangle())
        // Programmatic moves (`syncWheels()`) ease; a drag tracks the finger and its flick
        // is owned by the explicit spring in `onEnded`.
        .animation(isSettling ? nil : .easeOut(duration: 0.18), value: centre)
        .gesture(roll)
        // ANIM-04: SwiftUI keeps one generator warm for the view's lifetime. The old code
        // allocated a `UISelectionFeedbackGenerator` per detent and never called
        // `prepare()`, so ticks arrived late or dropped during a fast roll.
        .sensoryFeedback(.selection, trigger: selection)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityName)
        .accessibilityValue(items.indices.contains(selection) ? items[selection] : "")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: adjust(to: selection + 1)
            case .decrement: adjust(to: selection - 1)
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
                if dragOrigin == nil {
                    dragOrigin = origin
                    isSettling = true
                }
                let travelled = value.translation.height / WheelMetrics.rowHeight
                let continuous = CGFloat(origin) - travelled
                let clamped = min(max(continuous, 0), CGFloat(items.count - 1))
                visualCentre = clamped
                publishDrag(centre: clamped, isRoll: abs(value.translation.height) >= WheelMetrics.tapSlop)
                // §3.3.9 — the *value* commits live, per drag-frame. The bridge call is
                // debounced separately (ANIM-17).
                commit(Int(clamped.rounded()))
            }
            .onEnded { value in
                let origin = dragOrigin ?? selection
                isPickerUp = false
                withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) { onWheelDrag(nil) }

                guard abs(value.translation.height) >= WheelMetrics.tapSlop, !items.isEmpty else {
                    dragOrigin = nil
                    visualCentre = nil
                    isSettling = false
                    guard let onCenterTap else { return }
                    let band = WheelMetrics.rowHeight / 2 + 3
                    guard abs(value.startLocation.y - RollerStrip.height / 2) <= band else { return }
                    onCenterTap()
                    return
                }

                // ANIM-03 — the wheel used to drop dead at the fingertip and ease 0.18 s to
                // the nearest detent, so a flick that should coast three symbols moved one.
                // UIKit's own projection is the whole fix.
                let predicted = CGFloat(origin) - value.predictedEndTranslation.height / WheelMetrics.rowHeight
                let target = Int(min(max(predicted, 0), CGFloat(items.count - 1)).rounded())
                withAnimation(.interpolatingSpring(stiffness: 180, damping: 26)) {
                    commit(target)
                    visualCentre = nil
                    dragOrigin = nil
                } completion: {
                    isSettling = false
                }
                // The finger is up: the chart takes the final value now, not 120 ms later.
                flush(target)
            }
    }

    /// Raises (or tracks) the §2.19 floating panel. A tap on the chamber must not flash it,
    /// so it only appears once the gesture has cleared the tap slop.
    private func publishDrag(centre: CGFloat, isRoll: Bool) {
        guard isRoll else { return }
        let state = WheelDragState(
            items: pickerItems ?? items,
            centre: centre,
            kind: pickerKind,
            leadingX: pickerLeadingX
        )
        guard !isPickerUp else {
            // Tracking the finger: per-frame, unanimated, or the panel lags the wheel.
            onWheelDrag(state)
            return
        }
        isPickerUp = true
        withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) { onWheelDrag(state) }
    }

    /// Visual + haptic commit, per detent (§3.3.9). The bridge call rides the debounce.
    private func commit(_ index: Int) {
        guard items.indices.contains(index), index != selection else { return }
        selection = index
        scheduleFlush(index)
    }

    /// VoiceOver adjusts one detent at a time and has no "release", so it flushes at once.
    private func adjust(to index: Int) {
        commit(index)
        flush(index)
    }

    private func scheduleFlush(_ index: Int) {
        flushTask?.cancel()
        flushTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(WheelMetrics.pickDebounce))
            guard !Task.isCancelled else { return }
            flush(index)
        }
    }

    private func flush(_ index: Int) {
        flushTask?.cancel()
        flushTask = nil
        guard items.indices.contains(index) else { return }
        onPick(items[index])
    }
}
