import SwiftUI

/// Markets tab (TV "Explore" analog): index/crypto tiles with live-ish quotes, then
/// rows pushing the shell-mode web workspaces (Discover, Analysis) — web content,
/// native navigation chrome.
struct MarketsScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @StateObject private var ticker = QuoteTicker()

    private let indices = ["SPY", "QQQ", "DIA", "IWM", "BTC-USD", "ETH-USD"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(L10n.t("Markets", model.lang))
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)

                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                        ForEach(indices, id: \.self) { sym in
                            tile(sym)
                        }
                    }
                    .padding(.horizontal, 16)

                    VStack(spacing: 0) {
                        exploreRow(icon: "square.grid.2x2", title: L10n.t("Discover", model.lang),
                                   detail: L10n.t("Screeners, heatmap & market movers", model.lang), path: "discover")
                        Hairline().padding(.leading, 56)
                        exploreRow(icon: "brain.head.profile", title: L10n.t("Analysis", model.lang),
                                   detail: L10n.t("Research desk & deep dives", model.lang), path: "analysis")
                    }
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)
                }
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .onAppear { ticker.start(symbols: indices) }
        .onDisappear { ticker.stop() }
    }

    private func tile(_ sym: String) -> some View {
        let row = manifest.rows[sym]
        let quote = ticker.quotes[sym]
        let chg = quote?.primaryChange ?? row?.chg
        return Button {
            model.openChart(symbol: sym)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    LogoCircle(symbol: sym, colorHex: row?.col, size: 24, market: row?.sec)
                    Text(sym.replacingOccurrences(of: "-USD", with: ""))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.text)
                    Spacer()
                }
                PriceStack(
                    last: quote?.primaryPrice ?? row?.last,
                    chgPct: chg,
                    extPrice: quote?.extPrice,
                    extChgPct: quote?.extChg,
                    extSession: quote?.extSession,
                    alignment: .leading
                )
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func exploreRow(icon: String, title: String, detail: String, path: String) -> some View {
        NavigationLink {
            ShellWebScreen(title: title, path: path)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(Theme.brand2)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
        }
    }
}

/// A shell-mode web workspace pushed with native navigation chrome.
struct ShellWebScreen: View {
    let title: String
    let path: String

    private var url: URL {
        var components = URLComponents(url: AppConfig.origin.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "shell", value: "app")]
        return components.url!
    }

    var body: some View {
        InlineWebView(url: url)
            .ignoresSafeArea(edges: .bottom)
            .background(Theme.bg)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}
