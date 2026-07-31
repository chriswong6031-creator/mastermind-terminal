import SwiftUI

/// Chart tab: the live web chart under a native loading/error surface.
/// The web view stays mounted across tab switches (TabView keeps it alive), so
/// returning to Chart never reloads the page.
struct ChartScreen: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var bridge = ShellBridge()
    @State private var loadError: String?
    @State private var blockedRoute: String?

    var body: some View {
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
                        // The skeleton/page normally reports ready in a few seconds; a silent
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
        }
        .onChange(of: bridge.symbol) { _, sym in
            model.symbol = sym
        }
        .alert("Not in this alpha", isPresented: Binding(get: { blockedRoute != nil }, set: { if !$0 { blockedRoute = nil } })) {
            Button("OK", role: .cancel) { blockedRoute = nil }
        } message: {
            Text("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.")
        }
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
