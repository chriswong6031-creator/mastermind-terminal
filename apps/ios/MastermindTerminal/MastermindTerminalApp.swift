import SwiftUI
import UIKit

/// Shared app state: active tab, the chart's current symbol, language, and symbol
/// requests from native surfaces (watchlist tap → chart). The live truth for
/// symbol/timeframe stays in the web chart; ShellBridge notifications keep `symbol`
/// in sync.
final class AppModel: ObservableObject {
    /// TradingView's five tabs, left → right (§1.10). `markets` is kept as an alias so
    /// pre-rename call sites and the `-mmTab markets` launch arg keep working.
    enum Tab: Hashable {
        case watchlist, chart, explore, community, menu

        /// The Markets tab became TV's Explore tab root (§3.8). Same tab, new name.
        static let markets: Tab = .explore

        /// Left → right, exactly the order §1.10 measures the five columns in.
        static let ordered: [Tab] = [.watchlist, .chart, .explore, .community, .menu]
    }

    /// Non-nil presents the search sheet INSTANTLY as a root overlay (TV's search does
    /// not slide up — it appears). Covers the whole screen including the tab bar.
    @Published var searchMode: SearchSheet.Mode?
    /// Optional browse category handed to the search surface alongside `searchMode`
    /// (Explore's `TVNavPill` row sets it — the pills navigate into a category browse,
    /// they don't select, C23). The search surface owns whether it consumes this; while
    /// it doesn't, a pill still opens search and the category is simply not pre-applied.
    @Published var searchCategory: String?
    @Published var tab: Tab = {
        // Headless screenshot pipelines pick a start tab via launch args (DEBUG builds).
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-mmTab"), let value = args.drop(while: { $0 != "-mmTab" }).dropFirst().first {
            switch value {
            case "watchlist": return .watchlist
            // "markets" is the pre-rename spelling of the same tab — both must keep working.
            case "explore", "markets": return .explore
            case "community": return .community
            case "menu": return .menu
            default: return .chart
            }
        }
        return .chart
    }()
    @Published var symbol: String = AppConfig.defaultSymbol
    /// Set by native UI; ChartScreen forwards it over the bridge and clears it.
    @Published var requestedSymbol: String?
    /// Presents the sign-in sheet from the root, so any tab can ask for it.
    @Published var showSignIn = false
    /// C25 chrome-minimize (the chart toolbar's minimize-rect): the bottom tab bar slides
    /// away and its band of the screen becomes chart. Only the Chart tab can enter it, and
    /// leaving that tab always restores the chrome — `RootTabsView` owns both rules, so no
    /// screen can strand the app without a tab bar.
    @Published var chromeMinimized = false
    /// "en" | "zh" — drives native strings' displayName side and the webview via setLang (S5 adds the toggle UI).
    @Published var lang: String = UserDefaults.standard.string(forKey: "mm.lang") ?? "en" {
        didSet { UserDefaults.standard.set(lang, forKey: "mm.lang") }
    }

    func openChart(symbol: String) {
        requestedSymbol = symbol
        tab = .chart
    }

    /// One entry point for every native search affordance, so the optional browse
    /// category is always set (or cleared) in the same breath as the mode.
    ///
    /// ANIM-10: the animation lives here rather than at the five call sites, so no
    /// surface can open the search plane without the transition.
    func openSearch(_ mode: SearchSheet.Mode = .go, category: String? = nil) {
        withAnimation(.easeOut(duration: 0.20)) {
            searchCategory = category
            searchMode = mode
        }
    }

    func closeSearch() {
        withAnimation(.easeOut(duration: 0.20)) { searchMode = nil }
    }
}

@main
struct MastermindTerminalApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var manifest = ManifestStore()
    @StateObject private var watchlists = WatchlistStore()
    @StateObject private var auth = AuthService.shared

    var body: some Scene {
        WindowGroup {
            RootTabsView()
                .environmentObject(model)
                .environmentObject(manifest)
                .environmentObject(watchlists)
                .environmentObject(auth)
                .preferredColorScheme(.dark)
                .tint(Theme.brand2)
                // Keychain read, no network: a returning user is signed in before first paint.
                .onAppear { auth.restore() }
                .task { await manifest.load() }
        }
    }
}

/// The app's root container. **Not** a `TabView` (IPAD-01): from iPadOS 18 a `TabView`
/// built from `.tabItem` adopts the top floating capsule placement, which no
/// `UITabBarAppearance` can reach — so a second, system-blue bar rendered above the
/// content while `TVRootTabBar` still drew ours at the bottom, and the capsule reserved
/// **zero** bottom inset, which put the RollerStrip underneath our own bar.
///
/// So the shell owns the bar outright: all five screens stay mounted in a `ZStack` (the
/// retained chart web view is the reason they must), and the real bar is attached as a
/// bottom `safeAreaInset` — the inset is what reserves the band, on every idiom, with no
/// system bar in the layout at all.
struct RootTabsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        ZStack {
            ZStack {
                ForEach(AppModel.Tab.ordered, id: \.self) { tab in
                    screen(tab)
                        // Kept mounted, not rebuilt: the chart's web view must survive a
                        // tab switch. Hidden tabs take no touches and never paint.
                        .opacity(model.tab == tab ? 1 : 0)
                        .allowsHitTesting(model.tab == tab)
                        .zIndex(model.tab == tab ? 1 : 0)
                }
            }
            // §1.10 / §2.20: the only bar in the app. As a safe-area inset it both draws
            // the bar and reserves its band, so C25's minimize is a single layout change
            // instead of an offset trick racing a system inset (IPAD-04/IPAD-13).
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !model.chromeMinimized {
                    TVRootTabBar(selection: $model.tab, lang: model.lang)
                        .transition(.move(edge: .bottom))
                }
            }

            if let mode = model.searchMode {
                SearchSheet(mode: mode) { model.closeSearch() }
                    .zIndex(1)
                    // ANIM-10: the search plane still *appears* rather than sliding up
                    // (§3.2), but not in a single frame.
                    .transition(.opacity.combined(with: .scale(scale: 1.03)))
            }
        }
        // The one place the width seam is published; every screen reads it from the
        // environment rather than testing `horizontalSizeClass` itself (§6).
        .tvWidthClass(TVWidthClass(horizontalSizeClass))
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-mmOpenSearch") { model.openSearch(.go) }
            #if DEBUG
            // Headless §6.2 capture state: tap-only interactions get launch-arg mirrors.
            let args = ProcessInfo.processInfo.arguments
            if args.contains("-mmMinimize") {
                // Pre-seed the per-orientation stores too, or the iPad restore path
                // (ChartScreen.applyOrientation) immediately undoes the flag.
                UserDefaults.standard.set(true, forKey: "mm.chromeMinimized.portrait")
                UserDefaults.standard.set(true, forKey: "mm.chromeMinimized.landscape")
                model.chromeMinimized = true
            } else if args.contains("-mmTab") {
                // Any other headless capture launch clears what a prior -mmMinimize run
                // persisted — otherwise the iPad restores it and captures stop being
                // deterministic. Real user launches (no -mmTab) keep their state.
                UserDefaults.standard.set(false, forKey: "mm.chromeMinimized.portrait")
                UserDefaults.standard.set(false, forKey: "mm.chromeMinimized.landscape")
            }
            #endif
            AuthTestDriver.runIfRequested()
        }
        // Chrome-minimize belongs to the chart and nothing else: any move off that tab
        // (including the sign-out hop to Menu) brings the bar back, so a minimised state
        // can never follow the user to a screen with no way to undo it.
        .onChange(of: model.tab) { _, tab in
            guard tab != .chart, model.chromeMinimized else { return }
            withAnimation(TVChrome.minimize) { model.chromeMinimized = false }
        }
        // Presented from the root so any tab can request it and it survives a tab switch.
        .sheet(isPresented: $model.showSignIn) { SignInScreen() }
    }

    @ViewBuilder
    private func screen(_ tab: AppModel.Tab) -> some View {
        switch tab {
        case .watchlist: WatchlistScreen()
        case .chart: ChartScreen()
        case .explore: ExploreScreen()
        case .community: CommunityScreen()
        case .menu: MenuScreen()
        }
    }
}

/// The C25 chrome-minimize curve, shared by the two mutation sites that own the
/// transaction (`ChartScreen`'s minimize rect and the leave-the-tab reset). ANIM-11: the
/// bar carries **no** implicit `.animation` of its own, so exactly one transaction drives
/// the inset, the chart's reclaimed height and the bar's slide together.
enum TVChrome {
    static let minimize: Animation = .spring(response: 0.34, dampingFraction: 0.92)
}

// MARK: - §1.10 / §2.20 the real tab bar

/// Anatomy §1.10 measurements that `TVTabBarMetrics` does not already carry. Kept local to
/// the shell rather than pushed into `TVKit`, because the bar itself is a shell concern.
private enum TVTabBarInk {
    /// Bar top (y 791.0) → icon ink top (y 797.7), less the 1 px rule we draw above it.
    static let iconTopInset: CGFloat = 6.4
    /// §4-A20.4 — the five columns keep their **measured** 80.4 pt pitch on every idiom,
    /// so on a wide window the column block is bounded to 402 pt and centred rather than
    /// stretched. Widening the pitch would be pure invention; the fill and the rule stay
    /// full-bleed because those are the only parts §1.10 measures edge-to-edge.
    static let contentWidth: CGFloat = TVTabBarMetrics.columnPitch * 5
}

/// TradingView's bottom bar: five equal columns of `#040404`, edge to edge, under a single
/// device-pixel `#4A4A4A` rule, with the home-indicator strip below it left pure black and
/// empty (§1.10). Selection is carried **only** by the glyph swapping to its solid variant —
/// no container, no pill, no accent tint anywhere (C18).
///
/// Why this exists instead of `TabView`'s own bar: from iOS 26 the system tab bar renders as
/// an inset floating glass capsule with its own rounded selection highlight, it re-templates
/// `.tabItem` symbol images, and on iPad it moves to the top of the window entirely. No
/// appearance proxy reaches any of that. `RootTabsView` therefore ships no `TabView` at all
/// and mounts this bar as its bottom `safeAreaInset` (L5).
struct TVRootTabBar: View {
    @Binding var selection: AppModel.Tab
    let lang: String

    private struct Item: Identifiable {
        let tab: AppModel.Tab
        let title: String
        /// §1.10: Chart carries a persistent red dot in TV, present whichever tab is
        /// selected. Community's dot is unread-gated and we publish no unread count yet,
        /// so it stays off rather than lying about state.
        let badge: Bool

        var id: AppModel.Tab { tab }
    }

    /// Order comes from `AppModel.Tab.ordered`, and the per-tab switch is exhaustive, so a
    /// sixth tab can never be silently dropped from the bar.
    private var items: [Item] { AppModel.Tab.ordered.map(item(for:)) }

    private func item(for tab: AppModel.Tab) -> Item {
        switch tab {
        case .watchlist: return Item(tab: tab, title: L10n.t("Watchlist", lang), badge: false)
        case .chart: return Item(tab: tab, title: L10n.t("Chart", lang), badge: true)
        case .explore: return Item(tab: tab, title: L10n.t("Explore", lang), badge: false)
        case .community: return Item(tab: tab, title: L10n.t("Community", lang), badge: false)
        case .menu: return Item(tab: tab, title: L10n.t("Menu", lang), badge: false)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // C19: a true single device pixel, not a hand-rolled 1 pt rule.
            TVHairline(weight: .hair, tone: .structural)
            HStack(spacing: 0) {
                ForEach(items) { column($0) }
            }
            // §4-A20.4 — bounded to the measured 5 × 80.4 pt block, centred; the fill it
            // sits on stays edge-to-edge.
            .frame(maxWidth: TVTabBarInk.contentWidth)
            .frame(maxWidth: .infinity)
            .frame(height: TVTabBarMetrics.contentHeight)
            .background(TVTabBarMetrics.background)
        }
        // The home-indicator inset below the bar is pure black with no content (§1.10).
        .background(Theme.bg.ignoresSafeArea(edges: .bottom))
        // ANIM-12: the bar is the app's most-used control and had no feedback at all.
        .sensoryFeedback(.selection, trigger: selection)
    }

    /// One of five equal 80.4 pt columns (402 / 5) — expressed as an equal share so the
    /// pitch stays exact on every device width rather than only on the reference iPhone.
    private func column(_ item: Item) -> some View {
        let selected = selection == item.tab
        return Button {
            withAnimation(.easeOut(duration: 0.15)) { selection = item.tab }
        } label: {
            VStack(spacing: TVTabBarMetrics.iconToLabelGap) {
                TVTabGlyph.view(for: item.tab, selected: selected)
                    .frame(height: TVTabBarMetrics.iconInk)
                    // SCREEN-04: the selected Chart shield carries the dot *inside* its own
                    // badge, nested in a knockout notch. Letting the generic corner dot ride
                    // on top of it as well drew two dots' worth of ink in one corner.
                    .tvBadgeDot(item.badge && !TVTabGlyph.drawsOwnBadgeDot(for: item.tab, selected: selected))
                Text(item.title)
                    // §1.3 `[P2]`: 12 pt **Semibold** — the pass-1 "Medium" reading was
                    // corrected by the stem measurement (5–6 px = 1.67–2.0 pt at 12 pt).
                    // `tvText` in both states; the label never carries selection (C18).
                    .font(TVType.tabLabel)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .padding(.top, TVTabBarInk.iconTopInset)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .contentShape(Rectangle())
        }
        .buttonStyle(TVPressStyle(.glyph))
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - §1.10 / §2.20 tab-bar chrome

/// The five tab glyphs. Selection law (C18): selected = the glyph's solid/`.fill`
/// variant, unselected = its outline variant, **no accent tint anywhere**. The Menu
/// hamburger has no solid variant, so it doubles its stroke weight instead.
///
/// SCREEN-04 is the one documented exception to "solid variant of the same base shape":
/// measured on `IMG_2298.PNG`, TV's **selected** Chart tab is a filled shield/badge with
/// two candles knocked out of it, not a solid bar chart. SF Symbols ships no such glyph, so
/// it is drawn here as a path from the measurement (`TVChartTabShield`) rather than carried
/// as a bundled vector — the imageset it replaces rendered 18 × 18.7 pt inside the 22 pt
/// icon box, ~20 % under the measured badge. The **unselected** shield is not in the corpus
/// (§4-A20.16), so the outline bar chart stays until a capture of it exists.
enum TVTabGlyph {
    private struct Pair {
        let outline: String
        /// `nil` = this glyph ships no solid variant (the hamburger).
        let fill: String?
        /// A hand-drawn vector that replaces the selected SF symbol entirely (SCREEN-04).
        var drawsSelectedShield = false
    }

    private static func pair(for tab: AppModel.Tab) -> Pair {
        switch tab {
        case .watchlist: return Pair(outline: "bookmark", fill: "bookmark.fill")
        case .chart: return Pair(outline: "chart.bar", fill: "chart.bar.fill",
                                 drawsSelectedShield: true)
        // `safari` is a compass with a needle — TV's Explore glyph, and its solid variant
        // is exactly the "#DBDBDB disc with the glyph knocked out" the spec describes.
        case .explore: return Pair(outline: "safari", fill: "safari.fill")
        case .community: return Pair(outline: "person.2", fill: "person.2.fill")
        case .menu: return Pair(outline: "line.3.horizontal", fill: nil)
        }
    }

    /// True where the glyph paints the §1.10 red dot itself, so the generic corner badge
    /// must stand down (SCREEN-04 — the shield nests its dot in a knockout notch).
    static func drawsOwnBadgeDot(for tab: AppModel.Tab, selected: Bool) -> Bool {
        selected && pair(for: tab).drawsSelectedShield
    }

    /// SwiftUI-native rendering. An explicit `foregroundStyle` satisfies C18: no ancestor
    /// `.tint` can override it.
    @ViewBuilder
    static func view(for tab: AppModel.Tab, selected: Bool) -> some View {
        let glyph = pair(for: tab)
        if selected, glyph.drawsSelectedShield {
            TVChartTabShield()
        } else {
            Image(systemName: selected ? (glyph.fill ?? glyph.outline) : glyph.outline)
                .font(.system(size: TVTabBarMetrics.iconInk,
                              weight: (glyph.fill == nil && selected) ? .heavy : .regular))
                .foregroundStyle(Theme.text)
                // ANIM-12: outline → solid is a state change, not a new icon.
                .contentTransition(.symbolEffect(.replace.offUp))
        }
    }
}

/// §1.10 / SCREEN-04 — the **selected** Chart tab's badge, drawn from the measurement.
///
/// Measured on `IMG_2298.PNG` (3× pixels; badge ink x 325–395, y 2398–2463):
///
/// * The badge is **23.7 × 22.0 pt**: a flat-top pentagon with a 16 pt top edge, straight
///   bevelled shoulders reaching full width at 39.4 % of the height, then straight edges
///   converging on a **sharp bottom vertex**. Its point sits ~1 pt (3 device px) below the
///   neighbouring SF glyphs' ink — the reference does the same, and the 22 pt layout frame
///   plus the 1 pt overflow reproduces it without moving the row.
/// * Two candles are knocked **out** of the badge: a hollow-bodied one with a wick above
///   and below, and a shorter filled one with a wick below.
/// * The §1.10 red dot is **⌀5.67 pt centred on the badge's top-right corner and nested
///   into it**: the badge is cut away in a ⌀10.67 pt circle around the dot, leaving a
///   ~2.5 pt ring of bar background between red and white. The dot is part of the badge,
///   not a sticker floating above it — which is what the generic corner badge drew.
///
/// Drawn rather than bundled: the imageset this replaces resolved to 18 × 18.7 pt inside
/// the 22 pt icon box (~20 % under the measurement) because a `scaledToFit` asset can only
/// ever fit the box, and it could not express the knockout notch at all.
struct TVChartTabShield: View {
    var ink: Color = Theme.text
    var dot: Color = Theme.downFill

    /// The badge's own measured box. The layout frame is 1 pt taller so the nested dot,
    /// which rides 1 pt proud of the top edge, is not clipped by the canvas.
    static let badge = CGSize(width: 23.7, height: 22.0)
    private static let topOverflow: CGFloat = 1.0

    // Fractions of the badge box (from the pixel measurement above).
    private static let topEdgeLeading: CGFloat = 0.155
    private static let topEdgeTrailing: CGFloat = 0.845
    private static let shoulderY: CGFloat = 0.394
    private static let dotCentre = CGPoint(x: 0.831, y: 0.083)
    private static let dotDiameter: CGFloat = 5.67
    private static let nestDiameter: CGFloat = 10.67

    var body: some View {
        Canvas { context, size in
            let box = CGRect(x: 0, y: size.height - Self.badge.height,
                             width: size.width, height: Self.badge.height)
            // One isolated layer, so `destinationOut` cuts real holes in the badge and the
            // bar's own `#040404` shows through — nothing here paints a background colour,
            // which would have to be kept in step with the bar by hand.
            context.drawLayer { layer in
                layer.fill(Self.badgePath(box), with: .color(ink))
                layer.blendMode = .destinationOut
                layer.fill(Self.knockoutPath(box), with: .color(.black))
                layer.blendMode = .normal
                // The left candle's body is hollow: its interior is badge, not hole.
                layer.fill(Path(Self.frac(box, 0.338, 0.348, 0.408, 0.470)), with: .color(ink))
            }
            context.fill(Path(ellipseIn: Self.circle(box, Self.dotDiameter)), with: .color(dot))
        }
        .frame(width: Self.badge.width, height: Self.badge.height + Self.topOverflow)
        .accessibilityHidden(true)
    }

    private static func badgePath(_ box: CGRect) -> Path {
        Path { path in
            path.move(to: point(box, topEdgeLeading, 0))
            path.addLine(to: point(box, topEdgeTrailing, 0))
            path.addLine(to: point(box, 1, shoulderY))
            path.addLine(to: point(box, 0.5, 1))
            path.addLine(to: point(box, 0, shoulderY))
            path.closeSubpath()
        }
    }

    /// Everything cut out of the badge: both candles and the dot's nest.
    private static func knockoutPath(_ box: CGRect) -> Path {
        var path = Path()
        // Left candle — body, then the wick above and below it. Split in two so no two
        // rectangles overlap: the candle is a hole, and a hole drawn twice is still a hole,
        // but the hollow interior refilled afterwards depends on clean geometry.
        path.addRect(frac(box, 0.268, 0.273, 0.479, 0.545))
        path.addRect(frac(box, 0.338, 0.182, 0.408, 0.273))
        path.addRect(frac(box, 0.338, 0.545, 0.408, 0.636))
        // Right candle — filled body, wick below.
        path.addRect(frac(box, 0.577, 0.288, 0.761, 0.409))
        path.addRect(frac(box, 0.634, 0.409, 0.704, 0.500))
        // The dot's nest.
        path.addEllipse(in: circle(box, nestDiameter))
        return path
    }

    private static func point(_ box: CGRect, _ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: box.minX + box.width * x, y: box.minY + box.height * y)
    }

    private static func frac(_ box: CGRect, _ x0: CGFloat, _ y0: CGFloat,
                             _ x1: CGFloat, _ y1: CGFloat) -> CGRect {
        CGRect(x: box.minX + box.width * x0,
               y: box.minY + box.height * y0,
               width: box.width * (x1 - x0),
               height: box.height * (y1 - y0))
    }

    /// A circle of `diameter` pt centred on the measured dot centre.
    private static func circle(_ box: CGRect, _ diameter: CGFloat) -> CGRect {
        let centre = point(box, dotCentre.x, dotCentre.y)
        return CGRect(x: centre.x - diameter / 2, y: centre.y - diameter / 2,
                      width: diameter, height: diameter)
    }
}

/// DEBUG-only headless verification: `simctl launch … -mmTestEmail e -mmTestPassword p`
/// performs a real sign-in at boot (and `-mmTestSignOut` a sign-out), so the screenshot
/// pipeline can prove the signed-in surfaces without UI automation. Fixture accounts only.
enum AuthTestDriver {
    @MainActor
    static func runIfRequested() {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-mmTestSignOut") {
            Task { await AuthService.shared.signOut() }
            return
        }
        guard let email = args.drop(while: { $0 != "-mmTestEmail" }).dropFirst().first,
              let password = args.drop(while: { $0 != "-mmTestPassword" }).dropFirst().first else { return }
        Task { try? await AuthService.shared.signIn(email: email, password: password) }
        #endif
    }
}
