import SwiftUI
import UIKit
import WebKit

/// TV-style symbol preview (tap a watchlist row): header with logo/name/price,
/// range chips over the existing /embed/chart widget, key stats from the manifest,
/// and the Mastermind desk read from /data/<SYM>.intel.json — clearly labeled
/// research, never a trade signal. "Open full chart" jumps to the Chart tab.
struct PreviewItem: Identifiable {
    let symbol: String
    var id: String { symbol }
}

struct PreviewSheet: View {
    let symbol: String
    let onOpenChart: () -> Void

    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @State private var intel: Intel?

    private var row: ManifestStore.Row? { manifest.rows[symbol] }

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Theme.line).frame(width: 36, height: 4).padding(.top, 8).padding(.bottom, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    // The widget carries its own range tabs — no native duplicate row.
                    InlineWebView(url: widgetURL)
                        .frame(height: 250)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    statsGrid
                    if let intel { deskRead(intel) }
                    Button(action: onOpenChart) {
                        Text(L10n.t("Open full chart", model.lang))
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Theme.brand, in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(.white)
                    }
                    .padding(.bottom, 18)
                }
                .padding(.horizontal, 16)
            }
        }
        .background(Theme.bg.ignoresSafeArea())
        .task {
            let url = AppConfig.origin.appendingPathComponent("data/\(symbol).intel.json")
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return }
            intel = try? JSONDecoder().decode(Intel.self, from: data)
        }
    }

    private var widgetURL: URL {
        var components = URLComponents(url: AppConfig.origin.appendingPathComponent("embed/chart"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "symbol", value: symbol),
            URLQueryItem(name: "range", value: "1Y"),
            URLQueryItem(name: "theme", value: "dark"),
            URLQueryItem(name: "lang", value: model.lang),
            URLQueryItem(name: "transparent", value: "1"),
            URLQueryItem(name: "hdr", value: "0"),
        ]
        return components.url!
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            LogoCircle(symbol: symbol, colorHex: row?.col, size: 40,
                       nameForInitial: manifest.displayName(symbol, lang: model.lang), market: row?.sec)
            VStack(alignment: .leading, spacing: 2) {
                Text(manifest.displayName(symbol, lang: model.lang))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text("\(symbol) · \(intel?.sector ?? row?.sec ?? "")")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(PriceStack.price(row?.last))
                    .font(.system(size: 22, weight: .bold).monospacedDigit())
                    .foregroundStyle(Theme.text)
                Text(PriceStack.change(row?.chg))
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle((row?.chg ?? 0) >= 0 ? Theme.up : Theme.down)
            }
        }
    }

    private var statsGrid: some View {
        let stats: [(String, String)] = [
            ("Open", PriceStack.price(rowValue(\.open))),
            ("High", PriceStack.price(rowValue(\.high))),
            ("Low", PriceStack.price(rowValue(\.low))),
            ("Volume", Self.volume(rowValue(\.vol))),
            ("52W High", PriceStack.price(rowValue(\.hi52))),
            ("52W Low", PriceStack.price(rowValue(\.lo52))),
        ]
        // Keys stay English so the ForEach id is stable across the language toggle.
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(stats, id: \.0) { label, value in
                HStack {
                    Text(L10n.t(label, model.lang)).font(.system(size: 12)).foregroundStyle(Theme.muted)
                    Spacer()
                    Text(value).font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(Theme.text)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Theme.panel, in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private func rowValue(_ key: KeyPath<ManifestStore.Row.Extra, Double?>) -> Double? {
        row?.extra[keyPath: key]
    }

    static func volume(_ value: Double?) -> String {
        guard let value, value.isFinite, value > 0 else { return "—" }
        if value >= 1e9 { return String(format: "%.2fB", value / 1e9) }
        if value >= 1e6 { return String(format: "%.1fM", value / 1e6) }
        if value >= 1e3 { return String(format: "%.1fK", value / 1e3) }
        return String(format: "%.0f", value)
    }

    private func deskRead(_ intel: Intel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.t("RESEARCH DESK READ — NOT A TRADE SIGNAL", model.lang))
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Theme.muted)
            if let verdict = intel.cards?.ai_judgment?.verdict {
                Text(verdict)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.text)
            }
            if let gloss = intel.cards?.ai_judgment?.gloss {
                Text(gloss)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.text2)
            }
            if let conviction = intel.cards?.conviction {
                HStack(spacing: 8) {
                    if let score = conviction.score {
                        Text("\(L10n.t("Conviction", model.lang)) \(Int(score))")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Theme.signal)
                    }
                    if let band = conviction.band {
                        Text(band).font(.system(size: 11)).foregroundStyle(Theme.muted)
                    }
                }
                chipsRow(conviction.drivers ?? [], color: Theme.up, label: L10n.t("Drivers", model.lang))
                chipsRow(conviction.cautions ?? [], color: Theme.down, label: L10n.t("Cautions", model.lang))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func chipsRow(_ items: [String], color: Color, label: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased()).font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.muted)
                ForEach(items.prefix(3), id: \.self) { item in
                    HStack(alignment: .top, spacing: 6) {
                        Circle().fill(color).frame(width: 4, height: 4).padding(.top, 5)
                        Text(item).font(.system(size: 11)).foregroundStyle(Theme.text2)
                    }
                }
            }
        }
    }
}

struct Intel: Codable {
    let sector: String?
    let cards: Cards?

    struct Cards: Codable {
        let ai_judgment: AIJudgment?
        let conviction: Conviction?
    }

    struct AIJudgment: Codable {
        let verdict: String?
        let gloss: String?
    }

    struct Conviction: Codable {
        let score: Double?
        let band: String?
        let drivers: [String]?
        let cautions: [String]?
    }
}

/// Minimal web container for owned-origin embeds (the /embed/chart widget and the
/// shell-mode workspace screens). Main-frame navigation is pinned to the origin;
/// anything else opens in the system browser.
struct InlineWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != url && context.coordinator.lastRequested != url {
            context.coordinator.lastRequested = url
            webView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var lastRequested: URL?

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
            guard navigationAction.targetFrame?.isMainFrame != false else { return decisionHandler(.allow) }
            if url.scheme == "https" && url.host == AppConfig.origin.host { return decisionHandler(.allow) }
            if url.scheme == "https" || url.scheme == "http" { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
}
