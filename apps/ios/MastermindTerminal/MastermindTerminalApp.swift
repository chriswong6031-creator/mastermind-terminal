import SwiftUI

/// Shared app state: active tab, the chart's current symbol, and symbol requests
/// from native surfaces (watchlist tap → chart). The live truth for symbol/timeframe
/// stays in the web chart; ShellBridge notifications keep `symbol` in sync.
final class AppModel: ObservableObject {
    enum Tab: Hashable { case watchlist, chart, markets, menu }

    @Published var tab: Tab = .chart
    @Published var symbol: String = AppConfig.defaultSymbol
    /// Set by native UI; ChartScreen forwards it over the bridge and clears it.
    @Published var requestedSymbol: String?

    func openChart(symbol: String) {
        requestedSymbol = symbol
        tab = .chart
    }
}

@main
struct MastermindTerminalApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootTabsView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .tint(Theme.brand2)
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
