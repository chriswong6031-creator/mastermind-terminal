import SwiftUI
import UIKit

// =====================================================================================
// TVKit — the shared TV-parity component kit.
//
// Every metric in this file is a measured value from
// `docs/tv-parity/TV_PARITY_MASTER_SPEC.md` (the authoritative spec; per-screen specs
// in the same folder cover content/interaction detail only). Section markers `§x.y`
// refer to that document; `Cnn` / `Dn` markers refer to its conflict-resolution log.
//
// Rules this kit obeys, so screens can consume it without thinking about them:
//   • Presentation only. No stores, no networking, no analysis math (root AGENTS.md).
//     Components take value types and closures — never an ObservableObject.
//   • No user-facing copy is hardcoded here. Every label is a parameter, so callers
//     wrap their own strings in `L10n.t(_:_:)`.
//   • Selection is never an accent tint (§1.6): tiles/rows/segmented pills fully
//     invert, chips darken, glyphs gain ink mass.
//   • A raised child's fill is a function of its HOST surface, not of the component
//     (§1.2 one-notch rule, C21): `Theme.panel3` on a `Theme.panel2` sheet,
//     `Theme.pill` on pure black.
// =====================================================================================

// MARK: - Scales (§1.3 type · §1.4 spacing · §1.9 radii)

/// The measured spacing scale (§1.4). `block` is the 20 pt rhythm that separates every
/// stacked chrome block in the app (search field → chips → first row).
enum TVSpace {
    static let s1: CGFloat = 4
    static let s2: CGFloat = 8
    /// 3-column tile gutter.
    static let s2h: CGFloat = 9
    static let s3: CGFloat = 12
    /// Master horizontal margin — sheets, tiles, rows with a leading avatar.
    static let s4: CGFloat = 16
    /// Alternate margin used by pure-black full-screen pages (Indicators picker, Compare).
    static let s5: CGFloat = 20
    static let s6: CGFloat = 24
    /// Watchlist section-header top gap.
    static let s7: CGFloat = 30
    /// The 20 pt block rhythm (§1.4).
    static let block: CGFloat = 20
}

/// The measured type scale (§1.3). SF Pro (system) throughout; table/price numerics
/// must additionally call `.monospacedDigit()`.
enum TVType {
    /// 34 pt Heavy — tab-root large title (Explore). iOS stock large-title slot (C22 tier 1).
    static let largeTitle = Font.system(size: 34, weight: .heavy)
    /// 28 pt Bold — symbol-detail hero price.
    static let heroPrice = Font.system(size: 28, weight: .bold)
    /// 20 pt Bold — sheet / tool-page title, and in-content section headers. Never 28 (C5).
    static let sheetTitle = Font.system(size: 20, weight: .bold)
    /// 18 pt Bold — compact inline nav title, collapsed watchlist name, profile display name (C22 tier 3).
    static let navTitle = Font.system(size: 18, weight: .bold)
    /// 17 pt Semibold — ticker, price, list-row label.
    static let rowPrimary = Font.system(size: 17, weight: .semibold)
    /// 18 pt Semibold — Indicators-picker / account-row labels.
    static let rowPrimaryMenu = Font.system(size: 18, weight: .semibold)
    /// 15 pt Regular — company name, category, subtitle.
    static let rowSecondary = Font.system(size: 15, weight: .regular)
    /// 15 pt Medium — the change value riding beside a row's secondary line.
    static let rowChange = Font.system(size: 15, weight: .medium)
    /// 13 pt Regular — extended-hours line, timestamps, axis ticks.
    static let rowTertiary = Font.system(size: 13, weight: .regular)
    /// 18 pt Bold — `TVChip` selector label (corrected from 17 by C23).
    static let chipLabel = Font.system(size: 18, weight: .bold)
    /// 14 pt Semibold — `TVNavPill` navigation label. A genuinely smaller step (C23).
    static let pillLabel = Font.system(size: 14, weight: .semibold)
    /// 15 pt Semibold — `TVSegmentedPill` label.
    static let segmentLabel = Font.system(size: 15, weight: .semibold)
    /// 11 pt Semibold ALL CAPS — sheet/page section caption.
    static let caption = Font.system(size: 11, weight: .semibold)
    /// 13 pt Bold ALL CAPS — watchlist group header (deliberately 2 pt larger than `caption`).
    static let captionWatchlist = Font.system(size: 13, weight: .bold)
    /// 12 pt Semibold — tab-bar label, identical in both states (§1.10).
    static let tabLabel = Font.system(size: 12, weight: .semibold)
    /// 17 pt Bold — primary-CTA label.
    static let ctaLabel = Font.system(size: 17, weight: .bold)
    /// ALL-CAPS tracking used by both caption tiers.
    static let captionTracking: CGFloat = 0.6
}

/// Corner radii (§1.9). Sheet top corners are the system default — never hand-rolled.
enum TVRadius {
    /// All tiles and cards (measured r ≈ 38 px @3x). Always `.continuous`.
    static let tile: CGFloat = 12
    /// Compact outline action buttons (Analysis-hub rows 1–2).
    static let ghost: CGFloat = 10
    /// "Chart saved" toast card.
    static let toast: CGFloat = 24
    /// News-row thumbnail.
    static let thumb: CGFloat = 8
}

// MARK: - Adaptivity seam (IPAD-03)

/// Layout-affecting metrics that are **not** measured from the phone corpus.
enum TVMetrics {
    /// The regular-width content column. **INVENTION — §4-A20.1**: there is no
    /// TradingView-for-iPad reference in either corpus, so this is a conservative
    /// extrapolation of the 402 pt phone content measure onto a 4:3 reading width, not a
    /// measurement. Re-derive it the moment iPad captures exist.
    static let readableWidth: CGFloat = 704
}

/// The app's single width seam. Screens branch on this, never on
/// `horizontalSizeClass` directly, so the extrapolation law in §6 has one place to live.
enum TVWidthClass {
    case compact
    case regular

    init(_ sizeClass: UserInterfaceSizeClass?) {
        self = sizeClass == .regular ? .regular : .compact
    }

    var isRegular: Bool { self == .regular }
}

private struct TVWidthClassKey: EnvironmentKey {
    static let defaultValue: TVWidthClass? = nil
}

extension EnvironmentValues {
    /// Published by the root container. `nil` means "nobody published one", and every
    /// consumer falls back to `horizontalSizeClass` — so a screen resolves correctly even
    /// when it is hosted outside the root (previews, sheets presented on their own).
    var tvWidthClass: TVWidthClass? {
        get { self[TVWidthClassKey.self] }
        set { self[TVWidthClassKey.self] = newValue }
    }
}

extension View {
    /// Publishes the width class into the environment. Call once, at the root container.
    func tvWidthClass(_ value: TVWidthClass) -> some View {
        environment(\.tvWidthClass, value)
    }
}

/// Resolves the seam for a subtree: the root's published value wins, otherwise the
/// ambient size class.
struct TVWidthClassReader<Content: View>: View {
    @Environment(\.tvWidthClass) private var published
    @Environment(\.horizontalSizeClass) private var sizeClass

    private let content: (TVWidthClass) -> Content

    init(@ViewBuilder content: @escaping (TVWidthClass) -> Content) {
        self.content = content
    }

    var body: some View {
        content(published ?? TVWidthClass(sizeClass))
    }
}

/// Bounds a stacked column to `TVMetrics.readableWidth` and centres it, leaving the host
/// full-bleed. This is the whole fix for the dead-middle class of iPad defect: measured
/// tokens (row heights, insets, type, radii, hairlines) are untouched — only the column
/// narrows. Dividers that must stay edge-to-edge belong *outside* this wrapper.
struct TVReadableWidth<Content: View>: View {
    var maxWidth: CGFloat = TVMetrics.readableWidth
    private let content: Content

    init(maxWidth: CGFloat = TVMetrics.readableWidth, @ViewBuilder content: () -> Content) {
        self.maxWidth = maxWidth
        self.content = content()
    }

    var body: some View {
        content
            .frame(maxWidth: maxWidth)
            .frame(maxWidth: .infinity)
    }
}

extension View {
    /// Modifier spelling of `TVReadableWidth`, for wrapping a single existing subview.
    func tvReadableWidth(_ maxWidth: CGFloat = TVMetrics.readableWidth) -> some View {
        frame(maxWidth: maxWidth).frame(maxWidth: .infinity)
    }
}

// MARK: - ANIM-07 TVPressStyle

/// `.buttonStyle(.plain)` suppresses every default highlight, which left no tappable
/// surface in the app with a pressed state. TV fills the pressed row lighter for the whole
/// touch (t-073, t-074, t-078, t-079, t-080, t-097) — a state, not a flash.
///
/// Three kinds because one acknowledgement does not fit three anatomies: a full-bleed row
/// cannot scale without tearing its dividers, and a bare glyph has no fill to lighten.
struct TVPressStyle: ButtonStyle {
    enum Kind {
        /// Full-bleed list rows — lighten the whole row for the duration of the touch.
        case row
        /// Tiles, cards, capsules — a 3 % press-in.
        case tile
        /// Bare icon / text buttons with no plate of their own.
        case glyph
    }

    var kind: Kind = .row

    init(_ kind: Kind = .row) {
        self.kind = kind
    }

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        return configuration.label
            .background(kind == .row ? Color.white.opacity(pressed ? 0.07 : 0) : Color.clear)
            .scaleEffect(kind == .tile && pressed ? 0.97 : 1)
            .opacity(kind == .glyph && pressed ? 0.45 : 1)
            .animation(.easeOut(duration: 0.12), value: pressed)
    }
}

// MARK: - ANIM-18 shimmer / skeleton

/// The one shimmer in the app: a `LinearGradient` mask swept left → right over 1.2 s,
/// linear, repeating. Phase 0 is the instant reset, so the sweep never bounces back.
struct TVShimmer: ViewModifier {
    func body(content: Content) -> some View {
        content.phaseAnimator([0.0, 1.0]) { view, phase in
            view.mask {
                GeometryReader { geo in
                    // Opaque floor + travelling highlight: the floor keeps every pixel
                    // visible (dimmed) while the band sweeps — a bare band mask leaves
                    // content OUTSIDE it fully invisible for most of each cycle.
                    ZStack(alignment: .leading) {
                        Color.black.opacity(0.55)
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: .black, location: 0.5),
                                .init(color: .clear, location: 1),
                            ],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .frame(width: geo.size.width * 0.6)
                        .offset(x: (phase * 1.6 - 0.6) * geo.size.width)
                    }
                }
            }
        } animation: { phase in
            phase == 1 ? .linear(duration: 1.2) : .linear(duration: 0)
        }
    }
}

extension View {
    func tvShimmer() -> some View { modifier(TVShimmer()) }
}

/// Placeholder block for a surface that is still loading — TV fills exactly this slot
/// (t-088 → t-089) rather than leaving a hole or dropping a spinner on the page.
/// Rounded rects at 5 % white, r 8, under the shared 1.2 s shimmer.
struct TVSkeletonBlock: View {
    var lines: Int = 3
    var thumb: Bool = false
    var lineHeight: CGFloat = 12
    var spacing: CGFloat = TVSpace.s2
    var thumbSize: CGFloat = 56

    var body: some View {
        HStack(alignment: .top, spacing: TVSpace.s3) {
            if thumb {
                RoundedRectangle(cornerRadius: TVRadius.thumb, style: .continuous)
                    .fill(Color.white.opacity(0.05))
                    .frame(width: thumbSize, height: thumbSize)
            }
            VStack(alignment: .leading, spacing: spacing) {
                ForEach(0..<max(lines, 1), id: \.self) { index in
                    RoundedRectangle(cornerRadius: TVRadius.thumb, style: .continuous)
                        .fill(Color.white.opacity(0.05))
                        .frame(height: lineHeight)
                        // Last line short, as a real paragraph ragged edge would be.
                        .frame(maxWidth: index == max(lines, 1) - 1 && lines > 1 ? 180 : .infinity, alignment: .leading)
                }
            }
        }
        .tvShimmer()
        .accessibilityHidden(true)
    }
}

// MARK: - Number formatting (§2.6 colour rule)

/// Price/change rendering shared by every row and stack, so one symbol never formats
/// two ways on two screens.
enum TVFormat {
    static func price(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        return String(format: value < 10 ? "%.4f" : "%.2f", value)
    }

    static func change(_ pct: Double?) -> String {
        guard let pct, pct.isFinite else { return "—" }
        return String(format: "%@%.2f%%", pct >= 0 ? "+" : "", pct)
    }

    /// §2.6: **each value is coloured independently** — a row can be green on the day
    /// line and red on the extended-hours line. Exactly `0.00` renders `Theme.text`,
    /// not green.
    static func changeColor(_ pct: Double?) -> Color {
        guard let pct, pct.isFinite, pct != 0 else { return Theme.text }
        return pct > 0 ? Theme.upText : Theme.downText
    }
}

// MARK: - §2.1 TVHairline

/// Two real weights, keyed to the host surface (C19/C20) — this replaces the earlier
/// "everything is 1 pt" reading, which had only been measured on sheets.
///
/// * `.sheet` — 1 pt (3 px @3x) inside a `Theme.panel2` tool sheet.
/// * `.hair`  — a true single device pixel (0.33 pt @3x) on pure-black pages, black-page
///   list rows and the tab-bar top rule. Shipping 1 pt there is a visible, wrong-looking delta.
///
/// Inset rule (§2.1): left-inset to align with content, always flush to the right screen edge.
struct TVHairline: View {
    enum Weight {
        /// 1 pt — dividers, section rules and ghost-button borders inside a `#1C1C1E` sheet.
        case sheet
        /// 0.33 pt (1 px) — tab-bar top rule, list rows on a `#000000` page.
        case hair
    }

    enum Tone {
        /// `#4A4A4A` — structural rules, sheet-row dividers, tab-bar rule.
        case structural
        /// `#414141` — between flat list rows on a sheet.
        case sheetRow
        /// `#3D3D3D` — between rows inside a `Theme.rowBlock` container.
        case soft
        /// `#323235` — between watchlist symbol rows on pure black (C20).
        case list
    }

    var weight: Weight = .hair
    var tone: Tone = .structural
    var leadingInset: CGFloat = 0
    var trailingInset: CGFloat = 0

    @Environment(\.displayScale) private var displayScale

    private var color: Color {
        switch tone {
        case .structural: return Theme.line
        case .sheetRow: return Theme.lineSheetRow
        case .soft: return Theme.lineSoft
        case .list: return Theme.lineList
        }
    }

    private var height: CGFloat {
        switch weight {
        case .sheet: return 1
        case .hair: return 1 / max(displayScale, 1)
        }
    }

    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: height)
            .padding(.leading, leadingInset)
            .padding(.trailing, trailingInset)
            .accessibilityHidden(true)
    }

    /// 1 pt rule for `Theme.panel2` sheets.
    static func sheet(tone: Tone = .structural, inset: CGFloat = 0) -> TVHairline {
        TVHairline(weight: .sheet, tone: tone, leadingInset: inset)
    }

    /// True 1-px rule for pure-black pages and the tab-bar top edge.
    static func hair(tone: Tone = .structural, inset: CGFloat = 0) -> TVHairline {
        TVHairline(weight: .hair, tone: tone, leadingInset: inset)
    }
}

// MARK: - §2.2 Sheet chrome

/// 36.7 × 5.3 pt mid-gray grabber, centred, 8 pt below the sheet's top edge (§2.2).
struct TVGrabber: View {
    var body: some View {
        Capsule()
            .fill(Theme.line)
            .frame(width: 36.7, height: 5.3)
            .padding(.top, TVSpace.s2)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }
}

/// 20 pt Bold `Theme.text` (§2.2). Leading inset 16 pt on sheets, 20 pt on black pages.
struct TVSheetTitle: View {
    let text: String
    var inset: CGFloat = TVSpace.s4

    var body: some View {
        Text(text)
            .font(TVType.sheetTitle)
            .foregroundStyle(Theme.text)
            .padding(.leading, inset)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Two variants keyed to **presentation class, not background hex** (C25):
/// full-screen *pages* get the bare `×`; compact *modals/sheets* get the ⌀30 circle —
/// including the Create-section modal, which is pure black yet uses the circle.
/// Close dismisses one level only (§2.2).
struct TVCloseButton: View {
    enum Style {
        /// ⌀ 30 pt, fill `Theme.control`, glyph `Theme.dismiss`. Sheets and compact modals.
        case circle
        /// Bare 18 pt `xmark` in `Theme.text`, no chrome. Full-screen pages.
        case bare
    }

    var style: Style = .circle
    var accessibilityLabel: String = "Close"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            switch style {
            case .circle:
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.dismiss)
                    .frame(width: 30, height: 30)
                    .background(Theme.control, in: Circle())
            case .bare:
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(Theme.text)
                    .frame(width: 30, height: 30)
            }
        }
        .buttonStyle(TVPressStyle(.glyph))
        .accessibilityLabel(accessibilityLabel)
    }
}

/// Grabber + title + close, laid out as the standard sheet header (§2.2).
/// Pass `showsGrabber: false` for a pushed full-screen page.
struct TVSheetHeader: View {
    let title: String
    var closeStyle: TVCloseButton.Style = .circle
    var showsGrabber = true
    var inset: CGFloat = TVSpace.s4
    var closeAccessibilityLabel: String = "Close"
    var onClose: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 0) {
            if showsGrabber { TVGrabber() }
            HStack(spacing: TVSpace.s3) {
                TVSheetTitle(text: title, inset: inset)
                if let onClose {
                    TVCloseButton(style: closeStyle, accessibilityLabel: closeAccessibilityLabel, action: onClose)
                        .padding(.trailing, inset)
                }
            }
            .padding(.top, showsGrabber ? 14 : 4)
        }
    }
}

// MARK: - §2.3 TVSearchField / TVTextField

/// Two variants chosen by host surface (C11) — a deliberate contrast rule, not an
/// inconsistency: outline-40 on `#000000`, filled-36 on `#1C1C1E`.
///
/// Both: leading `magnifyingglass` inset 13 pt, placeholder 17 pt Regular
/// `Theme.text2`, caret flat gray — **never the system blue accent**.
/// Canonical placeholder copy (wrap in `L10n.t` at the call site): `"Search"`,
/// `"Symbol, ISIN, or CUSIP"` (Compare), `"Use = to do math"` (Add symbol).
struct TVSearchField: View {
    enum Variant {
        /// 40 pt, transparent fill, 1 pt `Theme.line` border, 20 pt side margins. On black.
        case outline
        /// 36 pt, `Theme.control` fill, no border, 16 pt side margins. On a sheet.
        case filled
    }

    /// The trailing dismiss affordance, which also differs per surface (§2.3/§3.2.2).
    enum Trailing: Equatable {
        case hidden
        /// Inline text button (Add-symbol sheet ships "Close", 17 pt white).
        case label(String)
        /// Sheet-level `×` glyph (Compare Symbols).
        case glyph
    }

    let placeholder: String
    @Binding var text: String
    var variant: Variant = .filled
    var trailing: Trailing = .hidden
    /// Ours, not TV's: an inline clear glyph once the field has text. Set false for a
    /// literal TV mirror.
    var showsClear = true
    var autocapitalization: TextInputAutocapitalization = .never
    var focus: FocusState<Bool>.Binding? = nil
    var onSubmit: (() -> Void)? = nil
    var onTrailing: (() -> Void)? = nil

    @FocusState private var localFocus: Bool

    private var height: CGFloat { variant == .outline ? 40 : 36 }
    private var margin: CGFloat { variant == .outline ? TVSpace.s5 : TVSpace.s4 }

    var body: some View {
        HStack(spacing: TVSpace.s2) {
            HStack(spacing: TVSpace.s2) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(Theme.text2)
                ZStack(alignment: .leading) {
                    if text.isEmpty {
                        Text(placeholder)
                            .font(.system(size: 17))
                            .foregroundStyle(Theme.text2)
                    }
                    TextField("", text: $text)
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.text)
                        .tint(Color(hex: 0xD4D4D4)) // flat gray caret — never the system accent
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(autocapitalization)
                        .submitLabel(.search)
                        .onSubmit { onSubmit?() }
                        .focused(focus ?? $localFocus)
                }
                if showsClear && !text.isEmpty {
                    Button {
                        text = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.text2)
                    }
                    .buttonStyle(TVPressStyle(.glyph))
                    .accessibilityLabel("Clear")
                }
            }
            .padding(.leading, 13)
            .padding(.trailing, 13)
            .frame(height: height)
            .background(variant == .filled ? Theme.control : Color.clear, in: Capsule())
            .overlay {
                if variant == .outline { Capsule().strokeBorder(Theme.line, lineWidth: 1) }
            }

            switch trailing {
            case .hidden:
                EmptyView()
            case .label(let title):
                Button(title) { onTrailing?() }
                    .font(.system(size: 17))
                    .foregroundStyle(.white)
                    .buttonStyle(TVPressStyle(.glyph))
            case .glyph:
                TVCloseButton(style: .circle) { onTrailing?() }
            }
        }
        .padding(.horizontal, margin)
    }
}

/// Sibling primitive (§2.3, pass-2 D5): plain naming/text-entry field — single line,
/// bottom hairline only, no capsule, no fill, no leading icon (Create-section modal).
/// Deliberately **not** a `TVSearchField` variant.
struct TVTextField: View {
    let placeholder: String
    @Binding var text: String
    var focus: FocusState<Bool>.Binding? = nil
    var onSubmit: (() -> Void)? = nil

    @FocusState private var localFocus: Bool

    var body: some View {
        VStack(spacing: TVSpace.s2) {
            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(placeholder)
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.text2)
                }
                TextField("", text: $text)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.text)
                    .tint(Color(hex: 0xD4D4D4))
                    .submitLabel(.done)
                    .onSubmit { onSubmit?() }
                    .focused(focus ?? $localFocus)
            }
            .frame(height: 34)
            TVHairline(weight: .hair, tone: .structural)
        }
    }
}

// MARK: - §2.4 TVChip / TVNavPill

/// The segmented capsule, reused five times: watchlist tabs · search category filters ·
/// symbol-detail content tabs · indicator-template tabs · Financials pill row.
///
/// Height 33.7 pt, capsule, 15 pt horizontal padding. Selected = `Theme.pill` fill with
/// an 18 pt Bold `Theme.text` label; unselected = **no fill**, 18 pt Bold `Theme.text2`
/// (C23 — chips darken, they never invert and never tint). Long labels truncate with `…`
/// — never wrap, never shrink (must survive mixed-script names like `SECTOR ETF 美国…`).
struct TVChip: View {
    let title: String
    var isSelected = false
    /// ANIM-14: inside a `TVChipRow` the selection capsule is hoisted into one
    /// `matchedGeometryEffect` so it slides between chips instead of teleporting. A chip
    /// used on its own still draws its own fill.
    var drawsFill = true
    let action: () -> Void

    static let height: CGFloat = 33.7
    static let horizontalPadding: CGFloat = 15

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(TVType.chipLabel)
                .foregroundStyle(isSelected ? Theme.text : Theme.text2)
                .lineLimit(1)
                .truncationMode(.tail)
                // ANIM-20: the label is language-bearing, so an EN⇄中文 switch cross-fades
                // instead of hard-cutting under the capsule.
                .contentTransition(.opacity)
                .padding(.horizontal, Self.horizontalPadding)
                .frame(height: Self.height)
                .background(isSelected && drawsFill ? Theme.pill : Color.clear, in: Capsule())
        }
        .buttonStyle(TVPressStyle(.tile))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

/// Horizontally-scrollable `TVChip` row — leading inset 16 pt, no divider, no fade edge (§2.4).
///
/// The row owns the selection capsule (ANIM-14) and the scroll position: a selection that
/// lands off-screen — which is every selection past the third chip on a phone — was
/// previously invisible with no indication that anything had happened.
struct TVChipRow: View {
    let titles: [String]
    let selectedIndex: Int
    var leadingInset: CGFloat = TVSpace.s4
    var spacing: CGFloat = TVSpace.s2
    let onSelect: (Int) -> Void

    @Namespace private var chipNS

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: spacing) {
                    ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                        TVChip(
                            title: title,
                            isSelected: index == selectedIndex,
                            drawsFill: false
                        ) { onSelect(index) }
                            .background {
                                if index == selectedIndex {
                                    Capsule()
                                        .fill(Theme.pill)
                                        .matchedGeometryEffect(id: "tvchip", in: chipNS)
                                }
                            }
                            .id(index)
                    }
                }
                .padding(.leading, leadingInset)
                .padding(.trailing, leadingInset)
                .animation(.spring(response: 0.30, dampingFraction: 0.85), value: selectedIndex)
            }
            .frame(height: TVChip.height)
            .onChange(of: selectedIndex) { _, index in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(index, anchor: .center) }
            }
        }
    }
}

/// Explore category pill (C23) — capsule 31.3 pt, 14 pt Semibold label, **every** pill
/// filled `Theme.pill`, no selected state. These navigate; they don't select.
/// Deliberately **not** merged with `TVChip`.
struct TVNavPill: View {
    let title: String
    var icon: String? = nil
    let action: () -> Void

    static let height: CGFloat = 31.3
    /// Measured gutter between Explore pills — larger than the tile gutters (spec2-explore §3.2).
    static let gutter: CGFloat = 11

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.text)
                }
                Text(title)
                    .font(TVType.pillLabel)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(height: Self.height)
            .background(Theme.pill, in: Capsule())
        }
        .buttonStyle(TVPressStyle(.tile))
    }
}

/// Horizontally-scrollable `TVNavPill` row at the measured 11 pt gutter.
struct TVNavPillRow: View {
    let titles: [String]
    var leadingInset: CGFloat = TVSpace.s4
    let onSelect: (Int) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TVNavPill.gutter) {
                ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                    TVNavPill(title: title) { onSelect(index) }
                }
            }
            .padding(.leading, leadingInset)
            .padding(.trailing, leadingInset)
        }
        .frame(height: TVNavPill.height)
    }
}

// MARK: - §2.5 TVSegmentedPill

/// The *inverting* variant (Financials / range sub-nav). Height 34 pt, capsule, 8 pt gaps.
/// Selected `Theme.inverseRow` + black Bold; unselected `Theme.pill` + `Theme.text`.
/// Distinct from `TVChip`: chips darken, pills invert (§1.6 idiom 1 vs 2).
struct TVSegmentedPill: View {
    let title: String
    var isSelected = false
    let action: () -> Void

    static let height: CGFloat = 34

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(isSelected ? Font.system(size: 15, weight: .bold) : TVType.segmentLabel)
                .foregroundStyle(isSelected ? Theme.inverseText : Theme.text)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .frame(height: Self.height)
                .background(isSelected ? Theme.inverseRow : Theme.pill, in: Capsule())
        }
        .buttonStyle(TVPressStyle(.tile))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

/// A row of `TVSegmentedPill`s at the measured 8 pt gap.
struct TVSegmentedPillRow: View {
    let titles: [String]
    let selectedIndex: Int
    var leadingInset: CGFloat = TVSpace.s4
    let onSelect: (Int) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TVSpace.s2) {
                ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                    TVSegmentedPill(title: title, isSelected: index == selectedIndex) { onSelect(index) }
                }
            }
            .padding(.horizontal, leadingInset)
        }
        .frame(height: TVSegmentedPill.height)
    }
}

// MARK: - §2.6 TVSymbolRow

/// The measured grid all three symbol-row variants share (§2.6).
enum TVSymbolRowMetrics {
    /// 3-line row (instrument with a live extended-hours quote).
    static let watchlistHeight: CGFloat = 82
    /// The SAME row with no extended session — §3.6 D2: build one row that grows, not two classes.
    static let watchlistCollapsedHeight: CGFloat = 60
    /// Standard 2-line symbol row (search results, futures rows, Indicators-picker menu rows).
    static let symbolHeight: CGFloat = 60
    /// Compact row (Compare Symbols recents).
    static let compactHeight: CGFloat = 52
    static let avatar: CGFloat = 36
    static let compactAvatar: CGFloat = 24
    static let leftInset: CGFloat = 16
    static let compactLeftInset: CGFloat = 20
    static let avatarGap: CGFloat = 13
    /// Where line 1/2 text begins on the 36 pt-avatar variants.
    static let textLeftEdge: CGFloat = 65
    /// Where line 1/2 text begins on `.compact`.
    static let compactTextLeftEdge: CGFloat = 53
    /// The extended-hours line starts ~2 pt right of the avatar's right edge (spec-watchlist §3.1).
    static let extendedLeftEdge: CGFloat = 54
    /// Trailing stack inset from the screen edge.
    static let trailingInset: CGFloat = 17.3
}

/// §3.6 item 8 / spec2-watchlist §3.1 (D1) — the small horizontal dash every watchlist row
/// carries immediately after its ticker. Pass 1 read it as a session/flat-state marker on
/// `MNQ2!`; pass 2 kills that guess — it is present on **100 % of rows** (CBOE, XLV, LLY,
/// MRK, JNJ, NOC, GILD, WM, MCD, APA, DVN, COIN …) regardless of sign, asset class or flag
/// state. Best-supported reading is a **drag handle** for the `Customized order` sort mode
/// (D10), which stays the one unconfirmed bit (§4-A19).
///
/// Geometry is the pixel-grid measurement off MRK's row in z-019, not a taste choice:
/// **10.3 × 4.0 pt**, fully rounded, `#8C8C8C` (= `Theme.text2`), ~7 pt after the ticker's
/// last letter, vertically centred on the ticker's cap-height band. (A coarser threshold
/// scan overstates the width to 18–24 pt by swallowing antialiased letter edges — do not
/// "fix" this to that number.)
struct TVReorderHandle: View {
    static let width: CGFloat = 10.3
    static let height: CGFloat = 4
    /// The measured ~6–8 pt gap between the ticker's last letter and the dash.
    static let leadingGap: CGFloat = 7

    var body: some View {
        Capsule(style: .circular)
            .fill(Theme.text2)
            .frame(width: Self.width, height: Self.height)
            // Decorative: the row is one combined accessibility element, and the reorder
            // action itself is exposed by the row's long-press menu, not by this glyph.
            .accessibilityHidden(true)
    }
}

/// Everything a symbol row renders, as a plain value — no store coupling, so watchlist,
/// search, compare and preview can all feed the same row from different sources.
struct TVSymbolRowData: Equatable {
    var symbol: String
    var name: String = ""
    /// Manifest `col` — the per-symbol brand colour behind the initial fallback.
    var colorHex: String? = nil
    /// Manifest `sec` — selects the crypto logo family, mirroring `lib/assetLogos.ts`.
    var market: String? = nil
    var price: Double? = nil
    var changePct: Double? = nil
    var extPrice: Double? = nil
    var extChangePct: Double? = nil
    /// `"pre"` / `"post"` / anything else = overnight. Drives the VoiceOver label only —
    /// TV shows a moon glyph, not a session tag (§3.1.14).
    var extSession: String? = nil
    /// Orange `D` delayed-data glyph immediately right of the ticker (§3.1.9).
    var isDelayed: Bool = false
    /// `TVReorderHandle` — the universal per-row dash (§3.6 item 8 / spec2 §3.1, D1).
    /// Opt-in rather than variant-implied: it is measured on watchlist rows only, and no
    /// search / compare / preview capture carries it.
    var showsReorderHandle: Bool = false
    /// `.symbol2` / `.compact` line-1 right value (exchange).
    var trailingTop: String? = nil
    /// `.symbol2` / `.compact` line-2 right value (category).
    var trailingBottom: String? = nil

    init(
        symbol: String,
        name: String = "",
        colorHex: String? = nil,
        market: String? = nil,
        price: Double? = nil,
        changePct: Double? = nil,
        extPrice: Double? = nil,
        extChangePct: Double? = nil,
        extSession: String? = nil,
        isDelayed: Bool = false,
        showsReorderHandle: Bool = false,
        trailingTop: String? = nil,
        trailingBottom: String? = nil
    ) {
        self.symbol = symbol
        self.name = name
        self.colorHex = colorHex
        self.market = market
        self.price = price
        self.changePct = changePct
        self.extPrice = extPrice
        self.extChangePct = extChangePct
        self.extSession = extSession
        self.isDelayed = isDelayed
        self.showsReorderHandle = showsReorderHandle
        self.trailingTop = trailingTop
        self.trailingBottom = trailingBottom
    }

    var hasExtended: Bool {
        guard let extPrice else { return false }
        return extPrice.isFinite && extPrice > 0
    }
}

/// Three variants on one grid (§2.6):
/// `avatar → 13 pt gap → 2-line leading stack ⟷ 2-line trailing stack → accessory`,
/// with an optional third (extended-hours) line that makes the row grow 60 → 82 pt.
///
/// Change values are coloured **independently** per line, and exactly `0.00` renders
/// `Theme.text` rather than green (§2.6).
struct TVSymbolRow<Accessory: View>: View {
    enum Variant {
        /// 82 pt with an extended-hours line, 60 pt without (§3.6 D2 — one row that grows).
        case watchlist3
        /// 60 pt, 36 pt avatar — search results, futures rows.
        case symbol2
        /// 52 pt, 24 pt avatar — Compare Symbols recents, inside a `Theme.rowBlock`.
        case compact
    }

    let data: TVSymbolRowData
    var variant: Variant = .watchlist3
    let accessory: Accessory

    init(_ data: TVSymbolRowData, variant: Variant = .watchlist3, @ViewBuilder accessory: () -> Accessory) {
        self.data = data
        self.variant = variant
        self.accessory = accessory()
    }

    private var avatarSize: CGFloat {
        variant == .compact ? TVSymbolRowMetrics.compactAvatar : TVSymbolRowMetrics.avatar
    }

    private var leftInset: CGFloat {
        variant == .compact ? TVSymbolRowMetrics.compactLeftInset : TVSymbolRowMetrics.leftInset
    }

    private var showsExtendedLine: Bool { variant == .watchlist3 && data.hasExtended }

    var height: CGFloat {
        switch variant {
        case .watchlist3:
            return data.hasExtended
                ? TVSymbolRowMetrics.watchlistHeight
                : TVSymbolRowMetrics.watchlistCollapsedHeight
        case .symbol2: return TVSymbolRowMetrics.symbolHeight
        case .compact: return TVSymbolRowMetrics.compactHeight
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 0) {
                LogoCircle(
                    symbol: data.symbol,
                    colorHex: data.colorHex,
                    size: avatarSize,
                    nameForInitial: data.name,
                    market: data.market
                )
                .padding(.leading, leftInset)

                leadingStack
                    .padding(.leading, TVSymbolRowMetrics.avatarGap)

                Spacer(minLength: TVSpace.s2)

                trailingStack
                accessory
            }
            if showsExtendedLine {
                extendedLine
                    .padding(.leading, TVSymbolRowMetrics.extendedLeftEdge)
            }
        }
        .padding(.trailing, TVSymbolRowMetrics.trailingInset)
        .frame(height: height)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var leadingStack: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Gaps are explicit rather than an HStack `spacing:` because the dash's 7 pt
            // offset from the ticker is a measurement (spec2 §3.1) and the `D` badge's is not.
            // Vertical centring is left to the HStack: for SF Pro the line box's centre and
            // the cap-height band's centre coincide to within 0.15 pt at 17 pt, so the
            // measured "centred on the cap band" falls out of plain `.center` alignment.
            HStack(spacing: 0) {
                Text(data.symbol)
                    .font(TVType.rowPrimary)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if data.showsReorderHandle {
                    // D1 — universal, so it holds the fixed slot right after the ticker and
                    // the *optional* `D` badge follows it.
                    TVReorderHandle()
                        .padding(.leading, TVReorderHandle.leadingGap)
                }
                if data.isDelayed {
                    // §1.1 tvDelayD — bare glyph, no background chip.
                    Text("D")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.delayed)
                        .padding(.leading, 5)
                        .accessibilityLabel("Delayed data")
                }
            }
            if !data.name.isEmpty {
                Text(data.name)
                    .font(TVType.rowSecondary)
                    .foregroundStyle(Theme.text2)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder private var trailingStack: some View {
        if variant == .watchlist3 || (data.trailingTop == nil && data.trailingBottom == nil) {
            // ANIM-08: one price stack, so the rolling digits and the tick flash reach the
            // list rows too — this branch used to be a second, static copy of `PriceStack`
            // at identical type (17 Semibold over 15 Medium), which is why lists read as a
            // page that reloads every 6 s rather than a live surface.
            PriceStack(last: data.price, chgPct: data.changePct)
        } else {
            // §2.6: "its two lines match the leading stack's baselines exactly" — so the
            // `.symbol2`/`.compact` trailing text uses the SAME type as the leading stack
            // (17 Semibold `tvText` over 15 Regular `tvTextSecondary`), not a demoted 15/13
            // pair. spec-search §2.2 measures the exchange line at ≈17 pt Bold white and the
            // category line at ≈15 pt Regular gray, which is the same rule stated per-pixel.
            VStack(alignment: .trailing, spacing: 2) {
                if let top = data.trailingTop {
                    Text(top)
                        .font(TVType.rowPrimary)
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                }
                if let bottom = data.trailingBottom {
                    Text(bottom)
                        .font(TVType.rowSecondary)
                        .foregroundStyle(Theme.text2)
                        .lineLimit(1)
                }
            }
        }
    }

    /// Line 3 — moon glyph (`Theme.extHours`, the only chromatic icon in the row system)
    /// + 13 pt price + 13 pt signed Δ, coloured independently of line 2 (§2.6/§3.1.8).
    private var extendedLine: some View {
        HStack(spacing: 5) {
            Image(systemName: "moon.fill")
                .font(.system(size: 9))
                .foregroundStyle(Theme.extHours)
            Text(TVFormat.price(data.extPrice))
                .foregroundStyle(Theme.text2)
            Text(TVFormat.change(data.extChangePct))
                .foregroundStyle(TVFormat.changeColor(data.extChangePct))
        }
        .font(TVType.rowTertiary.monospacedDigit())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Self.extendedAccessibilityLabel(data))
        .accessibilityIdentifier("extended-quote")
    }

    /// Kept from `ExtendedQuoteLine` — TV shows only a moon, but naming the session out
    /// loud is strictly better for VoiceOver, so the label survives the restyle (§3.1.14).
    static func extendedAccessibilityLabel(_ data: TVSymbolRowData) -> String {
        let session: String
        switch data.extSession {
        case "pre": session = "Pre-market"
        case "post": session = "After hours"
        default: session = "Overnight"
        }
        return "\(session), \(TVFormat.price(data.extPrice)), \(TVFormat.change(data.extChangePct))"
    }
}

extension TVSymbolRow where Accessory == EmptyView {
    init(_ data: TVSymbolRowData, variant: Variant = .watchlist3) {
        self.init(data, variant: variant) { EmptyView() }
    }
}

/// Per-row trailing add affordance for search results (§3.2.6/§3.2.7): an 18 pt `plus`
/// that becomes a **persistent** `checkmark` once the symbol is in the list.
///
/// The added state is a **dimmer gray**, never the up/positive accent (spec-watchlist §3.3):
/// `tvUpText` is the semantic colour of a rising price, and spending it on "already in your
/// list" says something the row does not mean. Both states are laid out in an identical
/// 18 × 18 pt box inside a 30 pt hit target, so the swap changes colour and glyph only —
/// nothing shifts or resizes under the user's finger.
struct TVAddGlyph: View {
    var isAdded: Bool
    var accessibilityLabel: String = "Add"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: isAdded ? "checkmark" : "plus")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(isAdded ? Theme.dismiss : Theme.text)
                .frame(width: 18, height: 18)
                .frame(width: 30, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(TVPressStyle(.glyph))
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(isAdded ? [.isSelected] : [])
    }
}

/// 18 pt verification/venue badge circle carried by search-result rows (§3.2.6):
/// navy + white ✓ for a retail broker feed, deep blue + cyan globe for an exchange.
///
/// The three hexes below are **spec-locked measurements** from §3.2.6 (independently
/// re-confirmed by pixel sampling during the SCREEN-05 review) and deliberately stay
/// local: they belong to this one badge, and a semantic name in `Theme` would invite a
/// future session to "adjust" a measured value to taste.
struct TVExchangeBadge: View {
    enum Kind { case broker, exchange }
    var kind: Kind = .exchange

    var body: some View {
        ZStack {
            Circle().fill(Color(hex: kind == .broker ? 0x001E41 : 0x132640))
            Image(systemName: kind == .broker ? "checkmark" : "globe")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(kind == .broker ? Color.white : Color(hex: 0x2F96C9))
        }
        .frame(width: 18, height: 18)
        .accessibilityHidden(true)
    }
}

// MARK: - §2.7 TVMenuRow · §3.7 TVAccountRow

/// Icon · label · chevron, height **60 pt** (§2.7). Icon 20 pt ink at left inset 20 pt,
/// 13.3 pt gap, label 18 pt Semibold at x = 53, trailing `›` at right inset 26.3 pt.
/// **No dividers between rows** — sections separate by whitespace alone.
struct TVMenuRow: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var showsChevron = true
    var showsBadge = false
    var tint: Color = Theme.text
    let action: () -> Void

    static let height: CGFloat = 60

    var body: some View {
        Button(action: action) {
            HStack(spacing: 0) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(tint)
                    .frame(width: 20, height: 20)
                    .tvBadgeDot(showsBadge)
                    .padding(.leading, TVSpace.s5)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(TVType.rowPrimaryMenu)
                        .foregroundStyle(tint)
                        .lineLimit(1)
                        // ANIM-20 — language-bearing label; cross-fade on an EN⇄中文 switch.
                        .contentTransition(.opacity)
                    if let subtitle {
                        Text(subtitle)
                            .font(TVType.rowTertiary)
                            .foregroundStyle(Theme.text2)
                            .lineLimit(1)
                    }
                }
                .padding(.leading, 13.3)
                Spacer(minLength: TVSpace.s2)
                if showsChevron {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .padding(.trailing, 26.3)
                }
            }
            .frame(height: Self.height)
            .contentShape(Rectangle())
        }
        .buttonStyle(TVPressStyle(.row))
    }
}

/// The Menu-tab plain list row (spec2-menu §3.4, D7) — **44 pt**, not `TVMenuRow`'s 60.
/// Full-bleed on the black page with no fill of its own; label 18 pt Semibold at x = 55.3;
/// chevron only where the row really pushes, in the dimmer tertiary tint (D9);
/// destructive rows (Sign out) render label **and** icon in `Theme.downFill` (D5-menu).
/// Dividers are 0.33 pt `Theme.line`, left-inset to `TVAccountRow.dividerInset` (C19).
struct TVAccountRow: View {
    let icon: String
    let title: String
    var trailingText: String? = nil
    var showsChevron = false
    var isDestructive = false
    /// ANIM-19 — an in-flight row action (Sign out) reports in the chevron slot rather
    /// than dropping a spinner somewhere else on the page. Takes the slot over the chevron:
    /// a row that is working is not a row you can push into.
    var trailingProgress = false
    let action: () -> Void

    static let height: CGFloat = 44
    /// Dividers align to the label, not the icon (spec2-menu §3.4).
    static let dividerInset: CGFloat = 54

    private var tint: Color { isDestructive ? Theme.downFill : Theme.text }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 0) {
                Image(systemName: icon)
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(tint)
                    .frame(width: 20, height: 20)
                    .padding(.leading, TVSpace.s5)
                Text(title)
                    .font(TVType.rowPrimaryMenu)
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    // ANIM-20 — language-bearing label; cross-fade on an EN⇄中文 switch.
                    .contentTransition(.opacity)
                    .padding(.leading, 15.3)
                Spacer(minLength: TVSpace.s2)
                if let trailingText {
                    Text(trailingText)
                        .font(TVType.rowSecondary)
                        .foregroundStyle(Theme.text2)
                        .lineLimit(1)
                        .padding(.trailing, showsChevron || trailingProgress ? TVSpace.s2 : 25.7)
                }
                if trailingProgress {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Theme.text2)
                        .padding(.trailing, 25.7)
                } else if showsChevron {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .padding(.trailing, 25.7)
                }
            }
            .frame(height: Self.height)
            .contentShape(Rectangle())
        }
        .buttonStyle(TVPressStyle(.row))
    }
}

// MARK: - §2.8 TVStatRow

/// Label ⟷ value, height 44 pt. Label 17 Regular `Theme.text`; value 17 right-aligned
/// with a 13 pt `Theme.text2` unit suffix riding the baseline ("USD", "B", "M", "K").
/// **No divider** in Overview sections; 1 pt edge-to-edge `Theme.line` in table contexts.
struct TVStatRow: View {
    let label: String
    let value: String
    var unit: String? = nil
    var valueColor: Color = Theme.text
    var valueWeight: Font.Weight = .regular
    var showsDivider = false
    var inset: CGFloat = TVSpace.s4

    static let height: CGFloat = 44

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: TVSpace.s2) {
                Text(label)
                    .font(.system(size: 17))
                    .foregroundStyle(Theme.text)
                Spacer(minLength: TVSpace.s2)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value)
                        .font(.system(size: 17, weight: valueWeight).monospacedDigit())
                        .foregroundStyle(valueColor)
                    if let unit {
                        Text(unit)
                            .font(TVType.rowTertiary)
                            .foregroundStyle(Theme.text2)
                    }
                }
            }
            .padding(.horizontal, inset)
            .frame(height: Self.height)
            if showsDivider { TVHairline(weight: .sheet, tone: .structural) }
        }
    }
}

// MARK: - §2.9 TVSectionCaption

/// ALL CAPS, tracking +0.6, `Theme.text2`. Two sizes: 11 pt Semibold on sheets/pages
/// ("PERSONAL", "TOOLS", "RECENT SYMBOLS"); 13 pt Bold inside a watchlist
/// ("CORE HOLDINGS"). Inset matches the row icon (16 or 20 pt).
/// Rhythm: ~30 pt above, ~27 pt below — baked in as defaults, override per screen.
struct TVSectionCaption: View {
    enum Size {
        /// 11 pt Semibold — sheets and full-screen pages.
        case sheet
        /// 13 pt Bold — in-watchlist group header.
        case watchlist
    }

    let text: String
    var size: Size = .sheet
    var inset: CGFloat = TVSpace.s4
    var topPadding: CGFloat = TVSpace.s7
    var bottomPadding: CGFloat = 27

    var body: some View {
        Text(text.uppercased())
            .font(size == .sheet ? TVType.caption : TVType.captionWatchlist)
            .tracking(TVType.captionTracking)
            .foregroundStyle(Theme.text2)
            .padding(.leading, inset)
            .padding(.top, topPadding)
            .padding(.bottom, bottomPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - §2.10 TVTile

/// One grid token app-wide (C7/C8): the chart-type cell and the Analysis-hub tool tile
/// are the same 117.3 × 72 pt cell at r 12.
enum TVGrid {
    static let margin: CGFloat = TVSpace.s4
    static let twoColumnWidth: CGFloat = 180.7
    static let twoColumnGutter: CGFloat = 8.3
    static let threeColumnWidth: CGFloat = 117.3
    static let threeColumnGutter: CGFloat = 9
    /// Analysis-hub row gap.
    static let rowGap: CGFloat = 8
    /// Chart-type and Drawings row gap.
    static let chartTypeRowGap: CGFloat = 12
    static let tileHeight: CGFloat = 72

    /// `LazyVGrid` columns at the measured gutter for 2- or 3-up grids.
    static func columns(_ count: Int) -> [GridItem] {
        let gutter = count >= 3 ? threeColumnGutter : twoColumnGutter
        return Array(repeating: GridItem(.flexible(), spacing: gutter), count: count)
    }

    /// The width seam applied to a grid: the **count** is the only thing that may change
    /// with width (§6 extrapolation law) — cell metrics and gutters stay measured.
    static func columns(for widthClass: TVWidthClass, compact: Int = 1, regular: Int = 2) -> [GridItem] {
        columns(widthClass.isRegular ? regular : compact)
    }

    /// Adaptive variant for the rows that TV lays out as a horizontal scroller on the
    /// phone: in regular width the reason to scroll is gone, so the same measured cell
    /// tiles the column instead. Cell minimum/maximum are measured; the resulting column
    /// count is derived — **§4-A20.2 / A20.3**.
    static func adaptiveColumns(minimum: CGFloat, maximum: CGFloat = .infinity, gutter: CGFloat) -> [GridItem] {
        [GridItem(.adaptive(minimum: minimum, maximum: maximum), spacing: gutter)]
    }
}

/// Icon-over-label card: 72 pt tall, r 12 `.continuous`, fill `Theme.panel3`, icon ~15 pt
/// ink centred above a 15 pt Medium `Theme.text` label (§2.10).
/// Selected = **full inversion** (`#FFFFFF` fill, `Theme.inverseText` glyph + label).
struct TVTile: View {
    let icon: String
    let title: String
    var isSelected = false
    var showsBadge = false
    var height: CGFloat = TVGrid.tileHeight
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(isSelected ? Theme.inverseText : Theme.text)
                    .tvBadgeDot(showsBadge)
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(isSelected ? Theme.inverseText : Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(
                isSelected ? Color.white : Theme.panel3,
                in: RoundedRectangle(cornerRadius: TVRadius.tile, style: .continuous)
            )
            .opacity(isEnabled ? 1 : 0.45)
        }
        .buttonStyle(TVPressStyle(.tile))
        .disabled(!isEnabled)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

// MARK: - §2.11 TVGhostButton

/// Compact outline action row: 55.7 pt tall, r 10, **transparent fill** (reads as the
/// sheet background), 1 pt `Theme.line` border, icon ~15 pt over a 17 pt Medium gray
/// label (C6 — the "filled #2C2C2E" reading in `spec-chart.md` is wrong).
/// Secondary/contextual only — never use it for content tiles.
struct TVGhostButton: View {
    let title: String
    var icon: String? = nil
    var height: CGFloat = 55.7
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(Theme.text)
                }
                Text(title)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.text2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay {
                RoundedRectangle(cornerRadius: TVRadius.ghost, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: 1)
            }
        }
        .buttonStyle(TVPressStyle(.tile))
    }
}

// MARK: - §2.12 TVPrimaryCTA · TVGradientCTA

/// Full-width capsule, 44 pt tall (40 pt in the symbol-detail sheet), 16 pt side margins,
/// fill `#FFFFFF`, label 17 pt Bold `Theme.inverseText`, centred.
/// Disabled fill is flat `Theme.ctaDisabled` — the label colour does **not** change (§1.1).
struct TVPrimaryCTA: View {
    let title: String
    var height: CGFloat = 44
    var horizontalMargin: CGFloat = TVSpace.s4
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(TVType.ctaLabel)
                .foregroundStyle(Theme.inverseText)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .background(isEnabled ? Color.white : Theme.ctaDisabled, in: Capsule())
        }
        .buttonStyle(TVPressStyle(.tile))
        .disabled(!isEnabled)
        .padding(.horizontal, horizontalMargin)
    }
}

/// The one CTA outlier (§2.12/§3.5.4): "Trade with your broker" — 70 pt tall,
/// fill `Theme.panel3`, 1.5 pt **gradient border** `#FE46A5 → #4A5AFF`, leading
/// double-chevron. Border-only gradient; the fill stays flat.
struct TVGradientCTA: View {
    let title: String
    var subtitle: String? = nil
    var icon: String = "chevron.right.2"
    var height: CGFloat = 70
    var horizontalMargin: CGFloat = TVSpace.s4
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: TVSpace.s3) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.text)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.text)
                    if let subtitle {
                        Text(subtitle)
                            .font(TVType.rowSecondary)
                            .foregroundStyle(Theme.text2)
                    }
                }
                Spacer(minLength: TVSpace.s2)
            }
            .padding(.horizontal, TVSpace.s4)
            .frame(height: height)
            .background(Theme.panel3, in: RoundedRectangle(cornerRadius: TVRadius.tile, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: TVRadius.tile, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [Color(hex: 0xFE46A5), Color(hex: 0x4A5AFF)],
                            startPoint: .leading,
                            endPoint: .trailing
                        ),
                        lineWidth: 1.5
                    )
            }
        }
        .buttonStyle(TVPressStyle(.tile))
        .padding(.horizontal, horizontalMargin)
    }
}

// MARK: - §2.13 TVCapsuleButton

/// Secondary capsule ("Add note", "More info", "See forecast", "← Back"): 40–50 pt tall,
/// fill `Theme.pill`, label 15–17 pt Semibold `Theme.text`, optional leading icon and
/// trailing `▸` in gray.
struct TVCapsuleButton: View {
    let title: String
    var icon: String? = nil
    var trailingIcon: String? = nil
    var height: CGFloat = 40
    var fillsWidth = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: TVSpace.s2) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(Theme.text)
                }
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                if fillsWidth { Spacer(minLength: TVSpace.s2) }
                if let trailingIcon {
                    Image(systemName: trailingIcon)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.text2)
                }
            }
            .padding(.horizontal, TVSpace.s4)
            .frame(maxWidth: fillsWidth ? .infinity : nil)
            .frame(height: height)
            .background(Theme.pill, in: Capsule())
        }
        .buttonStyle(TVPressStyle(.tile))
    }
}

// MARK: - §2.15 TVRangeSlider

/// Day's-Range / 52-Week-Range indicator (§2.15). 4 pt fully-rounded track on
/// `Theme.pill`, a teal `Theme.upText` inset segment marking the meaningful range, and a
/// small upward white ▲ marking the current price **under** the track. Caption centred
/// above in tracked gray small-caps, numeric endpoints flanking.
///
/// Read-only by design — it reports a range, it does not accept a drag.
struct TVRangeSlider: View {
    let caption: String
    let low: Double
    let high: Double
    var segmentStart: Double? = nil
    var segmentEnd: Double? = nil
    var current: Double? = nil
    var inset: CGFloat = TVSpace.s4

    private func fraction(_ value: Double) -> CGFloat {
        guard high > low, value.isFinite else { return 0 }
        return CGFloat(min(max((value - low) / (high - low), 0), 1))
    }

    var body: some View {
        VStack(spacing: TVSpace.s2) {
            HStack {
                Text(TVFormat.price(low))
                    .font(.system(size: 17).monospacedDigit())
                    .foregroundStyle(Theme.text)
                Spacer(minLength: TVSpace.s2)
                Text(caption.uppercased())
                    .font(TVType.rowTertiary)
                    .tracking(TVType.captionTracking)
                    .foregroundStyle(Theme.text2)
                Spacer(minLength: TVSpace.s2)
                Text(TVFormat.price(high))
                    .font(.system(size: 17).monospacedDigit())
                    .foregroundStyle(Theme.text)
            }
            GeometryReader { geo in
                let width = geo.size.width
                let start = fraction(segmentStart ?? low)
                let end = fraction(segmentEnd ?? current ?? high)
                let lo = min(start, end)
                let hi = max(start, end)
                ZStack(alignment: .topLeading) {
                    Capsule()
                        .fill(Theme.pill)
                        .frame(width: width, height: 4)
                    Capsule()
                        .fill(Theme.upText)
                        .frame(width: max((hi - lo) * width, 2), height: 4)
                        .offset(x: lo * width)
                    if let current, current.isFinite {
                        Image(systemName: "arrowtriangle.up.fill")
                            .font(.system(size: 8))
                            .foregroundStyle(.white)
                            .offset(x: fraction(current) * width - 4, y: 5)
                    }
                }
            }
            .frame(height: 18)
        }
        .padding(.horizontal, inset)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(caption), \(TVFormat.price(low)) to \(TVFormat.price(high))")
    }
}

// MARK: - §2.16 TVBadgeDot

/// The universal red notification dot. C24 re-measured it at **⌀ 6.0 pt** (17–18 px @3x)
/// in `Theme.downFill`, anchored so its centre sits on the host icon's top-right corner
/// and it overhangs the icon's top edge by ~1 pt — that supersedes §2.16's 5.5 pt.
struct TVBadgeDot: View {
    var diameter: CGFloat = TVBadgeDot.size

    static let size: CGFloat = 6

    var body: some View {
        Circle()
            .fill(Theme.downFill)
            .frame(width: diameter, height: diameter)
            .accessibilityHidden(true)
    }
}

extension View {
    /// Anchors a `TVBadgeDot` to this view's top-right corner per C24.
    ///
    /// ANIM-13: the dot pops in and shrinks away rather than blinking — a 6 pt mark
    /// appearing or vanishing in one frame is below the threshold at which a user
    /// registers that anything changed, which is the whole point of a notification dot.
    func tvBadgeDot(_ isVisible: Bool = true, diameter: CGFloat = TVBadgeDot.size) -> some View {
        overlay(alignment: .topTrailing) {
            if isVisible {
                TVBadgeDot(diameter: diameter)
                    .offset(x: diameter / 2, y: -diameter / 2 - 1)
                    .transition(.scale(scale: 0.1).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.28, dampingFraction: 0.7), value: isVisible)
    }
}

// MARK: - §2.17 TVToast

/// What a `TVToast` shows. Copy pattern (§2.17): title `MNQ2!`, subtitle `Added to "CHRIS"`.
struct TVToastContent: Equatable {
    var icon: String = "checkmark"
    var title: String
    var subtitle: String? = nil

    init(icon: String = "checkmark", title: String, subtitle: String? = nil) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
    }

    var identity: String { "\(icon)|\(title)|\(subtitle ?? "")" }
}

/// Centred card ≈85 % width, fill `Theme.toast`, r 24, big centred glyph (~28 pt) over a
/// 20 pt Bold title over a 15 pt `Theme.text2` subtitle.
///
/// **ANIM-06 correction to §2.17**: TV does *not* dim the layer behind this card. Measured
/// on the same list band, `t-006` (card present) vs `t-004` (absent) read p99 = 254 /
/// mean ≈ 50.4 in both, and 254 / 81.9 vs 81.8 in the keyboard band — zero attenuation.
/// The card floats over a live, fully-lit, still-interactive surface; it is not a blocking
/// confirmation. §2.17's "dims the layer behind it" is the reading this supersedes.
struct TVToast: View {
    let content: TVToastContent

    var body: some View {
        VStack(spacing: TVSpace.s3) {
            Image(systemName: content.icon)
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(Theme.text)
            Text(content.title)
                .font(TVType.sheetTitle)
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            if let subtitle = content.subtitle {
                Text(subtitle)
                    .font(TVType.rowSecondary)
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.vertical, TVSpace.s6)
        .padding(.horizontal, TVSpace.s5)
        .frame(maxWidth: .infinity)
        .background(Theme.toast, in: RoundedRectangle(cornerRadius: TVRadius.toast, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

private struct TVToastModifier: ViewModifier {
    @Binding var toast: TVToastContent?
    let duration: Double

    func body(content: Content) -> some View {
        content.overlay {
            if let value = toast {
                // No scrim (ANIM-06) and no full-bleed hit-testing layer: the card is the
                // only drawn content in this overlay, so every touch outside it reaches the
                // list underneath. `.allowsHitTesting(false)` on the container would be the
                // literal spelling of "touches pass through", but it also disables the
                // card's own tap-to-dismiss — the frame carries no ink, so it needs neither.
                TVToast(content: value)
                    .padding(.horizontal, 30) // ≈85 % width on a 402 pt screen
                    .onTapGesture { withAnimation(.easeOut(duration: 0.15)) { toast = nil } }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(.scale(scale: 0.88).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.30, dampingFraction: 0.80), value: toast)
        .task(id: toast?.identity) {
            guard toast != nil else { return }
            try? await Task.sleep(for: .seconds(duration))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.15)) { toast = nil }
        }
    }
}

extension View {
    /// Presents a `TVToast` while `toast` is non-nil, auto-dismissing after `duration`
    /// (§4-A6: TV's exact timing was never captured — 1.8 s is our default). Non-blocking:
    /// the host stays lit and interactive for the whole 1.8 s (ANIM-06).
    func tvToast(_ toast: Binding<TVToastContent?>, duration: Double = 1.8) -> some View {
        modifier(TVToastModifier(toast: toast, duration: duration))
    }
}

// MARK: - §2.19 TVWheelPicker

/// The floating magnified wheel that rides above the chart toolbar while a value wheel is
/// being dragged (§2.19). Until now it was **not implemented at all**, so the app's single
/// most-used gesture had no visible affordance: the 51.7 pt toolbar chamber is `.clipped()`
/// and a roll read as a twitching label.
///
/// Measured (§2.19): container ≈ 183 × 133 pt, r 20, dark translucent ≈ 55 % black, no
/// sheet and no scrim in the drag variant. Row emphasis is by distance from centre —
/// 34 pt Bold at the centre stepping down and fading to the container edge. The symbol
/// variant prefixes each row with a 16.7 pt avatar at the row's own opacity.
///
/// Presentation only: it renders whatever strings it is handed, so the caller owns copy
/// (and its localisation) — including the long-form interval spelling of `t-012`/`t-014`.
struct TVWheelPicker: View {
    enum Kind {
        /// Rows carry a leading logo.
        case symbol
        /// Bare text rows.
        case interval
    }

    let items: [String]
    /// The wheel's continuous, un-snapped centre — the same value the toolbar wheel drags,
    /// so the panel tracks the finger rather than stepping per detent.
    let centre: CGFloat
    var kind: Kind = .symbol

    static let width: CGFloat = 183
    static let height: CGFloat = 133
    static let corner: CGFloat = 20
    /// 133 / 5 — the centre row plus two rows each side inside the container; ±3 rides the
    /// edge fade (§2.19 "fading to the container edge"). Derived from the measured
    /// container height, not measured directly.
    static let rowPitch: CGFloat = TVWheelPicker.height / 5
    /// Rows rendered each side of the centre; the container crops before this.
    static let window = 3
    static let avatar: CGFloat = 16.7
    static let inset: CGFloat = TVSpace.s4
    /// C26 — the ink of the **outermost** row of the mid-drag panel, ~15 % of the centre
    /// row. This is the *only* surface that keeps the 14.6 % figure: it was measured on a
    /// panel row three detents from centre and riding the container's edge fade, not on the
    /// toolbar chamber. The toolbar's resting ghost is three times brighter —
    /// `WheelMetrics.restingGhostOpacity` (0.34) in `RollerStrip.swift`.
    ///
    /// **Two surfaces, two measurements — do not collapse them into one constant again.**
    static let dragGhostOpacity: CGFloat = 0.146

    private var visibleRows: [Int] {
        guard !items.isEmpty else { return [] }
        let anchor = Int(centre.rounded())
        let lower = max(0, anchor - Self.window)
        let upper = min(items.count - 1, anchor + Self.window)
        guard lower <= upper else { return [] }
        return Array(lower...upper)
    }

    var body: some View {
        ZStack {
            ForEach(visibleRows, id: \.self) { index in
                let distance = CGFloat(index) - centre
                let magnitude = abs(distance)
                // §2.19 emphasis ramp: one step to ±1, a shallower one out to ±3, landing
                // the outermost row exactly on the measured `dragGhostOpacity`.
                let near = min(magnitude, 1)
                let far = max(0, min(magnitude - 1, 2))
                let farStep = (0.65 - Self.dragGhostOpacity) / 2
                row(items[index], size: 34 - 5 * near - 4 * far)
                    .opacity(1 - 0.35 * near - farStep * far)
                    .offset(y: distance * Self.rowPitch)
            }
        }
        .frame(width: Self.width, height: Self.height)
        // The rows fade at the container edge; the container itself must not, so the mask
        // sits under the background rather than over the whole panel.
        .mask {
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.14),
                    .init(color: .black, location: 0.86),
                    .init(color: .clear, location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
        }
        .background {
            RoundedRectangle(cornerRadius: Self.corner, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: Self.corner, style: .continuous)
                        .fill(Color.black.opacity(0.55))
                }
        }
        // Decorative: the wheel it mirrors is the accessible control, and VoiceOver drives
        // that one with an adjustable action rather than a drag.
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func row(_ title: String, size: CGFloat) -> some View {
        HStack(spacing: TVSpace.s2) {
            if kind == .symbol {
                LogoCircle(symbol: title, colorHex: nil, size: Self.avatar)
            }
            Text(title)
                .font(.system(size: size, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Self.inset)
        // Width only. `rowPitch` is the *offset* unit, not a box: at 34 pt the line box
        // exceeds the pitch even though the cap-height ink does not, and constraining the
        // height here would let `minimumScaleFactor` shrink the centre row off its measure.
        .frame(width: Self.width)
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - TVPromoCard (spec2-menu-settings §3.3)

/// The Menu tab's promo card — same 2-column grid as `TVTile` (181 pt cell, 8 pt gutter,
/// 16 pt margins) but a taller 3-line anatomy: icon + chevron header row, then title,
/// then subtitle. Fill `Theme.pill` (one-notch-above-black, C21).
/// Note D4: the subtitle stays `Theme.text` — promo subtitles are **not** dimmed.
struct TVPromoCard: View {
    let icon: String
    let title: String
    let subtitle: String
    var height: CGFloat = 97.7
    /// SCREEN-03 — the 2-column cell this card's own contract specifies: `(370 − 8) / 2`.
    /// Without it a single card stretched to a 369.7 pt full-width block, which is a
    /// different component from the one measured in spec2-menu-settings §3.3.
    ///
    /// C26 — this is now a **fixed** width, not a `maxWidth` cap. A cap is only an upper
    /// bound, and the cap never bound: in the menu's
    /// `HStack { promo; referral; Spacer(minLength: 0) }` the trailing spacer is a third
    /// child, so the stack charges the 8 pt gutter **twice** (370 − 16 = 354) and then
    /// splits what is left equally — both cards came out 177 pt inside a 24.3 pt trailing
    /// margin. Claiming the measured cell outright restores `181 + 8 + 181 = 370`.
    ///
    /// The phantom gutter still exists in the host: with fixed cells that `HStack` reports
    /// 378 pt into a 370 pt slot, and the page centres the 8 pt of overflow, so the menu
    /// column sits 4 pt left of its 16 pt margin. The remaining fix is one line **in the
    /// host**, not here — drop the trailing `Spacer(minLength: 0)` and let the `HStack`
    /// carry `.frame(maxWidth: .infinity, alignment: .leading)` instead. Then the row is
    /// exactly `16 + 181 + 8 + 181 + 16 = 402` with nothing over-committed.
    var width: CGFloat = TVPromoCard.cellWidth
    let action: () -> Void

    static let cellWidth: CGFloat = 181
    /// Two lines of `TVType.rowSecondary` (15 pt Regular), taken from the font's own line
    /// height rather than guessed, so the reserved slot tracks the type scale if it moves.
    static let subtitleSlot: CGFloat = 2 * UIFont.systemFont(ofSize: 15).lineHeight
    /// The page margin and gutter the 181 pt cell was measured inside
    /// (spec2-menu-settings §3.3): `16 + 181 + 8 + 181 + 16 = 402`, the reference device's
    /// width exactly. Kept here because the cell only means anything alongside them.
    static let pageMargin: CGFloat = TVSpace.s4
    static let gutter: CGFloat = TVSpace.s2

    /// A fixed width cannot shrink, so it is clamped to half of the page's own content
    /// column on any device narrower than the 402 pt reference (an iPhone SE would
    /// otherwise push the second card past the trailing edge). On the reference phone and
    /// on every regular-width column this resolves to the measured 181 pt.
    private var resolvedWidth: CGFloat {
        let column = TVPromoCard.hostWidth - 2 * TVPromoCard.pageMargin - TVPromoCard.gutter
        return min(width, max(column / 2, 0))
    }

    /// Window width, read once per layout. `UIRequiresFullScreen = YES` for the alpha
    /// (§4-A20.9), so there is exactly one window and this is the page width.
    private static var hostWidth: CGFloat {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.screen.bounds.width ?? 402
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    Image(systemName: icon)
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(Theme.text)
                    Spacer(minLength: TVSpace.s2)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.text2)
                }
                Spacer(minLength: 0)
                Text(title)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(subtitle)
                    .font(TVType.rowSecondary)
                    .foregroundStyle(Theme.text) // D4 — deliberately not dimmed
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    // C26 — the subtitle slot is **always** exactly two lines tall. The
                    // card is a fixed 97.7 pt with a `Spacer` above the title, so a card
                    // whose subtitle wraps to one line let the spacer grow and pushed its
                    // title a full line below its neighbour's: two cards side by side, two
                    // different title baselines. A hard slot (rather than
                    // `reservesSpace:`) also absorbs the ~1 pt that `minimumScaleFactor`
                    // shaves off a wrapped subtitle's own line box, so the baseline is a
                    // property of the card and never of its copy.
                    .frame(height: Self.subtitleSlot, alignment: .topLeading)
            }
            .padding(.leading, TVSpace.s5)
            .padding(.trailing, TVSpace.s3)
            .padding(.top, 14)
            .padding(.bottom, 13.7)
            .frame(width: resolvedWidth, alignment: .leading)
            .frame(height: height)
            .background(Theme.pill, in: RoundedRectangle(cornerRadius: TVRadius.tile, style: .continuous))
        }
        .buttonStyle(TVPressStyle(.tile))
    }
}

// MARK: - §1.10 / §2.20 Tab-bar metrics

/// Exact tab-bar anatomy (§1.10). Provided as constants because the tab bar itself is a
/// `TabView` owned by the app shell; these are the numbers it must hit.
/// Selected state = the glyph's **solid** variant, unselected = its **outline** variant,
/// and the label is identical in both states (C18) — there is no accent tint anywhere.
enum TVTabBarMetrics {
    /// 402 / 5 on the iPhone 16 Pro reference device.
    static let columnPitch: CGFloat = 80.4
    /// 49 pt content + 34 pt safe area.
    static let totalHeight: CGFloat = 83
    static let contentHeight: CGFloat = 49
    static let iconInk: CGFloat = 22
    static let iconToLabelGap: CGFloat = 6
    static let background = Theme.panel
    /// The rule above the bar is a true single device pixel — `TVHairline(weight: .hair)`.
    static let ruleColor = Theme.line
}
