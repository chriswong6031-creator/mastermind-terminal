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
    func openSearch(_ mode: SearchSheet.Mode = .go, category: String? = nil) {
        searchCategory = category
        searchMode = mode
    }
}

@main
struct MastermindTerminalApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var manifest = ManifestStore()
    @StateObject private var watchlists = WatchlistStore()
    @StateObject private var auth = AuthService.shared

    init() {
        TVTabBarChrome.apply()
    }

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

struct RootTabsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            TabView(selection: $model.tab) {
                WatchlistScreen()
                    .tabItem { tabItem(L10n.t("Watchlist", model.lang), .watchlist) }
                    .tag(AppModel.Tab.watchlist)
                ChartScreen()
                    .tabItem { tabItem(L10n.t("Chart", model.lang), .chart) }
                    .tag(AppModel.Tab.chart)
                    // C25: this — not hiding our overlay — is what actually gives the
                    // chart the tab bar's band. The overlay is drawn *over* the system
                    // bar's rect, but the bottom safe-area inset that reserves that rect
                    // is `TabView`'s, and only hiding the system bar returns it.
                    .modifier(TVSystemTabBarHidden(hidden: model.chromeMinimized))
                ExploreScreen()
                    .tabItem { tabItem(L10n.t("Explore", model.lang), .explore) }
                    .tag(AppModel.Tab.explore)
                CommunityScreen()
                    .tabItem { tabItem(L10n.t("Community", model.lang), .community) }
                    .tag(AppModel.Tab.community)
                MenuScreen()
                    .tabItem { tabItem(L10n.t("Menu", model.lang), .menu) }
                    .tag(AppModel.Tab.menu)
            }
            // The system bar must never shrink/grow on scroll: the visible bar is our own
            // fixed-height overlay, and a minimising system bar would change the bottom
            // safe-area inset underneath it and slide content behind our fill.
            .modifier(TVSystemTabBarInert())

            // §1.10 / §2.20: the bar the user actually sees. Drawn full-bleed over the
            // system bar's rect, below the search overlay (which still covers everything).
            TVRootTabBar(selection: $model.tab, lang: model.lang)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                // C25: minimised chrome slides the bar off the bottom edge (and stops
                // taking touches there) while the system bar it covers is hidden underneath.
                .offset(y: model.chromeMinimized ? TVTabBarMetrics.totalHeight : 0)
                .allowsHitTesting(!model.chromeMinimized)
                .animation(.easeOut(duration: 0.22), value: model.chromeMinimized)
                .zIndex(0.5)

            if let mode = model.searchMode {
                SearchSheet(mode: mode) { model.searchMode = nil }
                    .zIndex(1)
                    .transition(.identity)
            }
        }
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-mmOpenSearch") { model.searchMode = .go }
            AuthTestDriver.runIfRequested()
        }
        // Chrome-minimize belongs to the chart and nothing else: any move off that tab
        // (including the sign-out hop to Menu) brings the bar back, so a minimised state
        // can never follow the user to a screen with no way to undo it.
        .onChange(of: model.tab) { _, tab in
            guard tab != .chart, model.chromeMinimized else { return }
            withAnimation(.easeOut(duration: 0.22)) { model.chromeMinimized = false }
        }
        // Presented from the root so any tab can request it and it survives a tab switch.
        .sheet(isPresented: $model.showSignIn) { SignInScreen() }
    }

    /// Feeds the **system** bar only — that bar is rendered inert (`TVTabBarChrome`) and
    /// sits behind `TVRootTabBar`. `TabView` still needs one item per tab to build its
    /// tabs, and keeping the real label/glyph here means the app degrades to a sane
    /// (if non-parity) bar rather than a blank one if the overlay is ever removed.
    /// §1.10: the label is identical in both states; selection is carried entirely by the
    /// glyph swapping to its solid variant.
    private func tabItem(_ title: String, _ tab: AppModel.Tab) -> some View {
        Label {
            Text(title)
        } icon: {
            TVTabGlyph.image(for: tab, selected: model.tab == tab)
        }
    }
}

// MARK: - §1.10 / §2.20 the real tab bar

/// Anatomy §1.10 measurements that `TVTabBarMetrics` does not already carry. Kept local to
/// the shell rather than pushed into `TVKit`, because the bar itself is a shell concern.
private enum TVTabBarInk {
    /// Bar top (y 791.0) → icon ink top (y 797.7), less the 1 px rule we draw above it.
    static let iconTopInset: CGFloat = 6.4
}

/// TradingView's bottom bar: five equal columns of `#040404`, edge to edge, under a single
/// device-pixel `#4A4A4A` rule, with the home-indicator strip below it left pure black and
/// empty (§1.10). Selection is carried **only** by the glyph swapping to its solid variant —
/// no container, no pill, no accent tint anywhere (C18).
///
/// Why this exists instead of `TabView`'s own bar: from iOS 26 the system tab bar renders as
/// an inset floating glass capsule with its own rounded selection highlight, and it
/// re-templates `.tabItem` symbol images (which is what turned the `bookmark` glyph red).
/// `UITabBarAppearance` no longer reaches any of that, and the only opt-out is the
/// `UIDesignRequiresCompatibility` Info.plist key — not available to a target whose
/// Info.plist is generated from the project file. So the system bar is made inert and this
/// one is drawn over it; `TabView` keeps owning tab lifecycle (`onAppear`/`onDisappear`,
/// the retained chart web view) and the bottom safe-area inset.
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
            .frame(maxWidth: .infinity)
            .frame(height: TVTabBarMetrics.contentHeight)
            .background(TVTabBarMetrics.background)
        }
        // The home-indicator inset below the bar is pure black with no content (§1.10).
        .background(Theme.bg.ignoresSafeArea(edges: .bottom))
    }

    /// One of five equal 80.4 pt columns (402 / 5) — expressed as an equal share so the
    /// pitch stays exact on every device width rather than only on the reference iPhone.
    private func column(_ item: Item) -> some View {
        let selected = selection == item.tab
        return Button {
            selection = item.tab
        } label: {
            VStack(spacing: TVTabBarMetrics.iconToLabelGap) {
                TVTabGlyph.view(for: item.tab, selected: selected)
                    .frame(height: TVTabBarMetrics.iconInk)
                    .tvBadgeDot(item.badge)
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
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// C25 chrome-minimize: hides the **system** tab bar for the tab this is applied to, which
/// is the only thing that gives the tab's content the bottom inset back. `TVRootTabBar` is
/// an overlay in the root `ZStack`, so hiding *it* changes no layout at all — the 83 pt
/// band it sits in is `TabView`'s safe-area inset, and `TabView` only returns that inset
/// when its own bar is hidden. Applied per-tab (never to the `TabView`), so a tab switch
/// restores the bar even before `AppModel.chromeMinimized` is reset.
///
/// `toolbarVisibility(_:for:)` is iOS 18's spelling of the iOS 16 `toolbar(_:for:)`; both
/// are shipped so the iOS 17 deployment target keeps building without a deprecation.
private struct TVSystemTabBarHidden: ViewModifier {
    let hidden: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.toolbarVisibility(hidden ? .hidden : .visible, for: .tabBar)
        } else {
            content.toolbar(hidden ? .hidden : .visible, for: .tabBar)
        }
    }
}

/// Pins the system tab bar's geometry so it cannot animate out from under `TVRootTabBar`.
/// iOS 26's bar minimises on scroll by default, which would change the bottom safe-area
/// inset it hands to tab content while our fixed-height fill stays put.
private struct TVSystemTabBarInert: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.tabBarMinimizeBehavior(.never)
        } else {
            content
        }
    }
}

// MARK: - §1.10 / §2.20 tab-bar chrome

/// The five tab glyphs. Selection law (C18): selected = the glyph's solid/`.fill`
/// variant, unselected = its outline variant, **no accent tint anywhere**. The Menu
/// hamburger has no solid variant, so it doubles its stroke weight instead.
///
/// Every image is rendered with `Theme.text` baked in and `.alwaysOriginal`, so neither
/// the app's `.tint(Theme.brand2)` nor UIKit's bar tint can recolour a selected tab.
enum TVTabGlyph {
    private struct Pair {
        let outline: String
        /// `nil` = this glyph ships no solid variant (the hamburger).
        let fill: String?
    }

    private static func pair(for tab: AppModel.Tab) -> Pair {
        switch tab {
        case .watchlist: return Pair(outline: "bookmark", fill: "bookmark.fill")
        // TV's diamond-with-candlestick-ticks mark has no SF equivalent (§1.8); this is
        // the nearest outline/solid pair we can ship without a custom vector.
        case .chart: return Pair(outline: "chart.bar", fill: "chart.bar.fill")
        // `safari` is a compass with a needle — TV's Explore glyph, and its solid variant
        // is exactly the "#DBDBDB disc with the glyph knocked out" the spec describes.
        case .explore: return Pair(outline: "safari", fill: "safari.fill")
        case .community: return Pair(outline: "person.2", fill: "person.2.fill")
        case .menu: return Pair(outline: "line.3.horizontal", fill: nil)
        }
    }

    static func image(for tab: AppModel.Tab, selected: Bool) -> Image {
        let glyph = pair(for: tab)
        let name = selected ? (glyph.fill ?? glyph.outline) : glyph.outline
        // §1.10: stroke 1.33–1.67 pt → 3.0–3.33 pt when the fill-less hamburger is active.
        let weight: UIImage.SymbolWeight = (glyph.fill == nil && selected) ? .heavy : .regular
        return render(name, weight: weight)
    }

    /// SwiftUI-native rendering for the VISIBLE bar. The UIImage pipeline above
    /// (`paletteColors` + `withTintColor` re-wrapped in `Image`) rendered the ink
    /// near-black on the shipped simulator — SwiftUI's monochrome symbol path with
    /// an explicit `foregroundStyle` is deterministic, and an explicit style also
    /// satisfies C18: no ancestor `.tint` can override it.
    @ViewBuilder
    static func view(for tab: AppModel.Tab, selected: Bool) -> some View {
        let glyph = pair(for: tab)
        Image(systemName: selected ? (glyph.fill ?? glyph.outline) : glyph.outline)
            .font(.system(size: TVTabBarMetrics.iconInk,
                          weight: (glyph.fill == nil && selected) ? .heavy : .regular))
            .foregroundStyle(Theme.text)
    }

    private static func render(_ name: String, weight: UIImage.SymbolWeight) -> Image {
        let sized = UIImage.SymbolConfiguration(pointSize: TVTabBarMetrics.iconInk, weight: weight)
        let coloured = UIImage.SymbolConfiguration(paletteColors: [UIColor(Theme.text)])
        let rendered = UIImage(systemName: name, withConfiguration: sized.applying(coloured))?
            // Flattens the symbol to one ink and marks it non-template, so no ancestor tint
            // — ours, or a system bar's — can substitute a colour. §1.8: tab glyphs are
            // never tinted (the four named exceptions do not include any tab glyph).
            .withTintColor(UIColor(Theme.text), renderingMode: .alwaysOriginal)
        return Image(uiImage: rendered ?? UIImage())
    }
}

/// Makes the **system** tab bar draw nothing, so `TVRootTabBar` is the only bar on screen.
///
/// This used to configure the system bar to the §1.10 anatomy directly, which is correct on
/// the classic bar and unreachable on iOS 26's: that bar is an inset floating glass capsule
/// with its own rounded selection highlight, and it re-templates `.tabItem` symbol images.
/// Measured against the reference frames, all three of those are visible deltas (the bar
/// stopping ~21 pt short of each screen edge and 21 pt short of the bottom, a ~67 × 47 pt
/// gray pill behind the selected item, and a solid red `bookmark` glyph). There is no
/// runtime opt-out — only the `UIDesignRequiresCompatibility` Info.plist key, which this
/// target cannot carry because its Info.plist is generated from the project file — so the
/// system bar is stripped to nothing here and the real bar is drawn over its rect.
/// `TabView` is kept for everything else it owns: tab lifecycle and the safe-area inset.
enum TVTabBarChrome {
    static func apply() {
        let appearance = UITabBarAppearance()
        // No material, no fill, no rule: `TVRootTabBar` draws #040404 and the 1 px #4A4A4A
        // rule itself, full-bleed, so nothing here may bleed past that fill.
        appearance.configureWithTransparentBackground()
        appearance.backgroundEffect = nil
        appearance.backgroundColor = .clear
        appearance.shadowColor = .clear
        appearance.shadowImage = UIImage()

        let item = UITabBarItemAppearance(style: .stacked)
        for state in [item.normal, item.selected, item.focused, item.disabled] {
            state.iconColor = .clear
            state.titleTextAttributes = [
                .font: UIFont.systemFont(ofSize: 12, weight: .medium),
                .foregroundColor: UIColor.clear,
            ]
        }
        appearance.stackedLayoutAppearance = item
        appearance.inlineLayoutAppearance = item
        appearance.compactInlineLayoutAppearance = item

        let bar = UITabBar.appearance()
        bar.standardAppearance = appearance
        bar.scrollEdgeAppearance = appearance
        bar.tintColor = .clear
        bar.unselectedItemTintColor = .clear
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
