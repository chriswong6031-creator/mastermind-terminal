import SwiftUI

/// Shared app state: active tab, the chart's current symbol, language, and symbol
/// requests from native surfaces (watchlist tap → chart). The live truth for
/// symbol/timeframe stays in the web chart; ShellBridge notifications keep `symbol`
/// in sync.
final class AppModel: ObservableObject {
    enum Tab: Hashable { case watchlist, chart, markets, menu }

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

    var body: some Scene {
        WindowGroup {
            RootTabsView()
                .environmentObject(model)
                .environmentObject(manifest)
                .environmentObject(watchlists)
                .preferredColorScheme(.dark)
                .tint(Theme.brand2)
                .task { await manifest.load() }
        }
    }
}

struct RootTabsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView(selection: $model.tab) {
            WatchlistScreen()
                .tabItem { Label("Watchlist", systemImage: "list.bullet.rectangle") }
                .tag(AppModel.Tab.watchlist)
            ChartScreen()
                .tabItem { Label("Chart", systemImage: "chart.xyaxis.line") }
                .tag(AppModel.Tab.chart)
            MarketsScreen()
                .tabItem { Label("Markets", systemImage: "globe") }
                .tag(AppModel.Tab.markets)
            MenuScreen()
                .tabItem { Label("Menu", systemImage: "line.3.horizontal") }
                .tag(AppModel.Tab.menu)
        }
    }
}
