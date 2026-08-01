import SwiftUI
import UIKit
import WebKit

/// Chart tab: the live web chart under a native loading/error surface, with the
/// TV-style roller strip (symbol + timeframe wheels) docked above the tab bar in
/// portrait. Landscape hides native chrome for the full-bleed chart. The web view
/// stays mounted across tab switches, so returning to Chart never reloads.
struct ChartScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @EnvironmentObject private var watchlists: WatchlistStore
    @EnvironmentObject private var auth: AuthService
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @StateObject private var bridge = ShellBridge()
    @State private var loadError: String?
    @State private var blockedRoute: String?
    @State private var symbolIndex = 0
    @State private var timeframeIndex = 0
    /// §2.18 `•••` → §3.5 Analysis hub.
    @State private var showAnalysisHub = false
    /// Whether the web chart's drawing toolbar is shown (hidden by default in shell mode);
    /// re-applied on every page ready since a reload resets the page to hidden.
    @State private var drawToolsOn = false
    /// §2.18 ships a red dot on `•••` for unseen hub items; it clears once the hub is seen.
    @State private var hubUnseen = true
    /// Loop guard for the cookie-absent handoff: setSession makes the page reload itself,
    /// so `ready` fires again — without this the second pass would push once more.
    /// Reset only when WE load the page (retry, sign-out), never on the page's own reload.
    @State private var didPushWebSession = false

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
                // §3.3.1 — the canvas is a vertical gradient `#131722 → #181B26`, not a
                // flat black, and not the same token as the chrome above/below it. The web
                // chart paints its own; this is the backdrop it lands on.
                LinearGradient(
                    colors: [Theme.chartBg, Theme.chartBgBottom],
                    startPoint: .top, endPoint: .bottom
                )
                .ignoresSafeArea()

                ChartWebView(
                    bridge: bridge,
                    onBlockedRoute: { blockedRoute = $0 },
                    onLoadFailed: { loadError = $0 }
                )

                if !bridge.isReady && loadError == nil {
                    LoadingCover(lang: model.lang)
                        .task {
                            // The page normally reports ready in a few seconds; a silent
                            // hang (captive portal, stalled TLS) must not strand a blank cover.
                            try? await Task.sleep(for: .seconds(25))
                            if !bridge.isReady && loadError == nil {
                                loadError = L10n.t("The chart is taking too long to load.", model.lang)
                            }
                        }
                }

                if let message = loadError {
                    ErrorCover(message: message, lang: model.lang) {
                        loadError = nil
                        didPushWebSession = false
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
                    onTapSymbol: { model.searchMode = .go },
                    lang: model.lang,
                    showsMoreBadge: hubUnseen,
                    onMore: {
                        hubUnseen = false
                        showAnalysisHub = true
                    },
                    drawActive: drawToolsOn,
                    onDraw: {
                        drawToolsOn.toggle()
                        bridge.setDrawTools(drawToolsOn)
                    },
                    shareSymbol: model.symbol,
                    chromeMinimized: model.chromeMinimized,
                    onToggleChrome: {
                        UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
                        // Animated at the mutation site so the tab bar's slide-out and the
                        // chart's reclaimed safe-area inset move on the same curve.
                        withAnimation(.easeOut(duration: 0.22)) {
                            model.chromeMinimized.toggle()
                        }
                    }
                )
                // With the tab bar minimised away, the strip becomes the bottom-most piece
                // of chrome — the home-indicator inset under it stays pure black (§1.10).
                .background(Theme.bg.ignoresSafeArea(edges: .bottom))
            }
        }
        .sheet(isPresented: $showAnalysisHub) {
            AnalysisHubSheet(lang: model.lang) { showAnalysisHub = false }
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
            // The page bootstraps its language from its own storage; this covers the first
            // load after a native toggle, when that storage is still empty or stale.
            bridge.setLang(model.lang)
            // A (re)loaded page defaults its drawing toolbar hidden — restore the toggle.
            if drawToolsOn { bridge.setDrawTools(true) }
            Task { await flushWebSession() }
            syncWheels()
            DemoDriver.runIfRequested(bridge: bridge, watchlists: watchlists)
        }
        .onChange(of: model.lang) { _, lang in bridge.setLang(lang) }
        .onReceive(NotificationCenter.default.publisher(for: .mmAuthChanged)) { _ in
            // Signing in from any tab must reach a web view that is already loaded and
            // ready, where no isReady transition is coming.
            if auth.user == nil {
                Task { await resetWebToGuest() }
            } else {
                Task { await flushWebSession() }
            }
        }
        .onChange(of: bridge.symbol) { _, sym in
            model.symbol = sym
            syncWheels()
        }
        .onChange(of: bridge.timeframe) { _, _ in syncWheels() }
        .onAppear { syncWheels() }
        .alert(
            Text(L10n.t("Not in this alpha", model.lang)),
            isPresented: Binding(get: { blockedRoute != nil }, set: { if !$0 { blockedRoute = nil } })
        ) {
            Button(L10n.t("OK", model.lang), role: .cancel) { blockedRoute = nil }
        } message: {
            Text(L10n.t("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.", model.lang))
        }
    }

    /// Gives the page a session at most once per native page load.
    ///
    /// A fresh sign-in always hands over the second token family minted for the web. With
    /// nothing pending we only intervene when the page has no auth cookie of its own —
    /// cookies persist in the default data store, so the ordinary cold launch of a
    /// signed-in user pushes nothing and the page comes up authenticated on its own.
    private func flushWebSession() async {
        guard bridge.isReady else { return }
        if let handoff = auth.consumePendingWebSession() {
            didPushWebSession = true
            bridge.setSession(accessToken: handoff.accessToken, refreshToken: handoff.refreshToken)
            return
        }
        guard auth.user != nil, !didPushWebSession else { return }
        if await hasWebAuthCookie() { return }
        guard let handoff = await auth.fallbackWebSession() else { return }
        didPushWebSession = true
        bridge.setSession(accessToken: handoff.accessToken, refreshToken: handoff.refreshToken)
    }

    /// Supabase's cookie is chunked (`…auth-token.0`/`.1`) once it exceeds the size limit,
    /// so match on the prefix rather than an exact name.
    private func hasWebAuthCookie() async -> Bool {
        let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
        return cookies.contains {
            $0.domain.contains("mastermind-x.com") && $0.name.hasPrefix("sb-") && $0.name.contains("auth-token")
        }
    }

    /// Signing out natively must not leave a signed-in page behind: the web's session lives
    /// in cookies and storage that outlive our Keychain entry. Everything for the origin
    /// goes, including the page's own language key — the reload's setLang restores it.
    private func resetWebToGuest() async {
        let store = WKWebsiteDataStore.default()
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        let records = await store.dataRecords(ofTypes: types)
        await store.removeData(
            ofTypes: types,
            for: records.filter { $0.displayName.contains("mastermind-x.com") }
        )
        didPushWebSession = false
        bridge.reset()
        bridge.webView?.load(URLRequest(url: AppConfig.chartURL(symbol: model.symbol)))
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
    var lang = "en"

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .controlSize(.large)
                    .tint(Theme.brand2)
                Text(L10n.t("Loading chart…", lang))
                    .font(.subheadline)
                    .foregroundStyle(Theme.text2)
            }
        }
    }
}

struct ErrorCover: View {
    let message: String
    var lang = "en"
    let retry: () -> Void

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 34))
                    .foregroundStyle(Theme.muted)
                Text(L10n.t("Can't reach the Terminal", lang))
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Button(action: retry) {
                    Text(L10n.t("Retry", lang))
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
