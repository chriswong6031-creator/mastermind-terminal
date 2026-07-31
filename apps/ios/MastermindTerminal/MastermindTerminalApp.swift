import SwiftUI

/// Shared app state: active tab, the chart's current symbol, language, and symbol
/// requests from native surfaces (watchlist tap → chart). The live truth for
/// symbol/timeframe stays in the web chart; ShellBridge notifications keep `symbol`
/// in sync.
final class AppModel: ObservableObject {
    enum Tab: Hashable { case watchlist, chart, markets, menu }

    /// Non-nil presents the search sheet INSTANTLY as a root overlay (TV's search does
    /// not slide up — it appears). Covers the whole screen including the tab bar.
    @Published var searchMode: SearchSheet.Mode?
    @Published var tab: Tab = {
        // Headless screenshot pipelines pick a start tab via launch args (DEBUG builds).
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-mmTab"), let value = args.drop(while: { $0 != "-mmTab" }).dropFirst().first {
            switch value {
            case "watchlist": return .watchlist
            case "markets": return .markets
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
    /// "en" | "zh" — drives native strings' displayName side and the webview via setLang (S5 adds the toggle UI).
    @Published var lang: String = UserDefaults.standard.string(forKey: "mm.lang") ?? "en" {
        didSet { UserDefaults.standard.set(lang, forKey: "mm.lang") }
    }

    func openChart(symbol: String) {
        requestedSymbol = symbol
        tab = .chart
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

struct RootTabsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            TabView(selection: $model.tab) {
                WatchlistScreen()
                    .tabItem { Label(L10n.t("Watchlist", model.lang), systemImage: "list.bullet.rectangle") }
                    .tag(AppModel.Tab.watchlist)
                ChartScreen()
                    .tabItem { Label(L10n.t("Chart", model.lang), systemImage: "chart.xyaxis.line") }
                    .tag(AppModel.Tab.chart)
                MarketsScreen()
                    .tabItem { Label(L10n.t("Markets", model.lang), systemImage: "globe") }
                    .tag(AppModel.Tab.markets)
                MenuScreen()
                    .tabItem { Label(L10n.t("Menu", model.lang), systemImage: "line.3.horizontal") }
                    .tag(AppModel.Tab.menu)
            }
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
        // Presented from the root so any tab can request it and it survives a tab switch.
        .sheet(isPresented: $model.showSignIn) { SignInScreen() }
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
