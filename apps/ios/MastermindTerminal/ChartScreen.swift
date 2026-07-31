import SwiftUI

/// Chart tab: the live web chart under a native loading/error surface, with the
/// TV-style roller strip (symbol + timeframe wheels) docked above the tab bar in
/// portrait. Landscape hides native chrome for the full-bleed chart. The web view
/// stays mounted across tab switches, so returning to Chart never reloads.
struct ChartScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @EnvironmentObject private var watchlists: WatchlistStore
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @StateObject private var bridge = ShellBridge()
    @State private var loadError: String?
    @State private var blockedRoute: String?
    @State private var symbolIndex = 0
    @State private var timeframeIndex = 0

    /// The symbol wheel's chambers: the active watchlist, with the current symbol
    /// appended when it isn't on the list (so the wheel always shows reality).
    private var wheelSymbols: [String] {
        var syms = watchlists.active.symbols
        if !syms.contains(model.symbol) { syms.append(model.symbol) }
        return syms
    }

    private var wheelTimeframes: [String] {
        bridge.availableTimeframes.isEmpty
            ? ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "D", "2D", "3D", "W", "2W", "1M", "3M"]
            : bridge.availableTimeframes
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Theme.chartBg.ignoresSafeArea()

                ChartWebView(
                    bridge: bridge,
                    onBlockedRoute: { blockedRoute = $0 },
                    onLoadFailed: { loadError = $0 }
                )

                if !bridge.isReady && loadError == nil {
                    LoadingCover()
                        .task {
                            // The page normally reports ready in a few seconds; a silent
                            // hang (captive portal, stalled TLS) must not strand a blank cover.
                            try? await Task.sleep(for: .seconds(25))
                            if !bridge.isReady && loadError == nil {
                                loadError = "The chart is taking too long to load."
                            }
                        }
                }

                if let message = loadError {
                    ErrorCover(message: message) {
                        loadError = nil
                        bridge.reset()
                        bridge.webView?.load(URLRequest(url: AppConfig.chartURL(symbol: model.symbol)))
                    }
                }
            }

            if verticalSizeClass != .compact {
                RollerStrip(
                    symbols: wheelSymbols,
                    timeframes: wheelTimeframes,
                    symbolIndex: $symbolIndex,
                    timeframeIndex: $timeframeIndex,
                    onSymbol: { sym in
                        guard sym != bridge.symbol else { return }
                        bridge.setSymbol(sym)
                    },
                    onTimeframe: { tf in
                        guard tf != bridge.timeframe else { return }
                        bridge.setTimeframe(tf)
                    },
                    onTapSymbol: { model.searchMode = .go }
                )
            }
        }
        .onChange(of: model.requestedSymbol) { _, requested in
            guard let requested else { return }
            if bridge.isReady {
                bridge.setSymbol(requested)
                model.requestedSymbol = nil
            }
            // Not ready yet: keep the request; the isReady observer below applies it.
        }
        .onChange(of: bridge.isReady) { _, ready in
            guard ready else { return }
            if let pending = model.requestedSymbol {
                bridge.setSymbol(pending)
                model.requestedSymbol = nil
            }
            syncWheels()
            DemoDriver.runIfRequested(bridge: bridge, watchlists: watchlists)
        }
        .onChange(of: bridge.symbol) { _, sym in
            model.symbol = sym
            syncWheels()
        }
        .onChange(of: bridge.timeframe) { _, _ in syncWheels() }
        .onAppear { syncWheels() }
        .alert("Not in this alpha", isPresented: Binding(get: { blockedRoute != nil }, set: { if !$0 { blockedRoute = nil } })) {
            Button("OK", role: .cancel) { blockedRoute = nil }
        } message: {
            Text("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.")
        }
    }

    /// Programmatic wheel moves (bridge → UI). User drags flow the other way through
    /// the onSymbol/onTimeframe callbacks, which no-op when the value already matches.
    private func syncWheels() {
        if let symIdx = wheelSymbols.firstIndex(of: bridge.symbol), symIdx != symbolIndex {
            symbolIndex = symIdx
        }
        if let tfIdx = wheelTimeframes.firstIndex(of: bridge.timeframe), tfIdx != timeframeIndex {
            timeframeIndex = tfIdx
        }
    }
}

/// DEBUG-only headless proof hook: `simctl launch ... -mmDemo roll` rolls the chart to
/// the next watchlist symbol a few seconds after the bridge is ready, so a screenshot
/// pipeline can verify the native→web round-trip without UI automation.
enum DemoDriver {
    static func runIfRequested(bridge: ShellBridge, watchlists: WatchlistStore) {
        #if DEBUG
        guard ProcessInfo.processInfo.arguments.contains("-mmDemo") else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(6))
            let syms = watchlists.active.symbols
            guard let current = syms.firstIndex(of: bridge.symbol) else {
                if let first = syms.first { bridge.setSymbol(first) }
                return
            }
            bridge.setSymbol(syms[(current + 1) % syms.count])
        }
        #endif
    }
}

struct LoadingCover: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .controlSize(.large)
                    .tint(Theme.brand2)
                Text("Loading chart…")
                    .font(.subheadline)
                    .foregroundStyle(Theme.text2)
            }
        }
    }
}

struct ErrorCover: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 34))
                    .foregroundStyle(Theme.muted)
                Text("Can't reach the Terminal")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Button(action: retry) {
                    Text("Retry")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 28)
                        .padding(.vertical, 10)
                        .background(Theme.brand, in: Capsule())
                        .foregroundStyle(.white)
                }
                .padding(.top, 6)
            }
        }
    }
}
