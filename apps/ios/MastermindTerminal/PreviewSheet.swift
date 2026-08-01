import SwiftUI
import UIKit
import WebKit

/// TV-parity **symbol-detail sheet** — `TV_PARITY_MASTER_SPEC.md` §3.4 plus
/// `spec-symbol-detail.md` §2B (surface B, the chart-anchored detail sheet).
///
/// Structure, top → bottom: 36 pt logo · company name 20 pt Bold + `⌄` ticker-switcher ·
/// `•••` · `TICKER · EXCHANGE` 15 pt gray with a session badge → hero price 28 pt Bold
/// with its 13 pt currency caption, over a 17 pt cash-then-percent change with a gray
/// context suffix and the extended-hours pill → the
/// existing `/embed/chart` widget (it ships its own range tabs, so §3.4.4's native range
/// row is deliberately NOT duplicated) → `TVChip` content tabs → Overview content
/// (Key stats · Day's/52-week `TVRangeSlider` · the Mastermind desk read) → the white
/// `TVPrimaryCTA`.
///
/// Surface law (§1.2 tier 2): a sheet whose content is a symbol is **pure `#000000`**,
/// and raised children on it step one notch to `Theme.pill` — never `panel2`.
///
/// Presentation only (root AGENTS.md): every number here is fetched, never derived.
/// The desk read stays labelled research, never a trade signal.
struct PreviewItem: Identifiable {
    let symbol: String
    var id: String { symbol }
}

struct PreviewSheet: View {
    let symbol: String
    let onOpenChart: () -> Void

    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @StateObject private var ticker = QuoteTicker()
    @State private var intel: Intel?
    @State private var contentTab = 0
    @State private var showsAlphaNotice = false

    /// §3.4.6 content tabs — the reference's full four-chip row. Keys stay English so the
    /// selected index survives a language flip and the `ForEach` identity never churns.
    /// News / Minds / Ideas have no alpha backend, so they ship as placeholder
    /// affordances on the existing "Not in this alpha" pattern rather than being cut from
    /// the row: the structure mirrors the reference even where our backend is thinner.
    private static let contentTabs = ["Overview", "News", "Minds", "Ideas"]

    private var row: ManifestStore.Row? { manifest.rows[symbol] }
    private var quote: QuoteTicker.Quote? { ticker.quotes[symbol] }
    /// Live quote wins; the manifest's EOD row is the offline/cold-launch floor.
    private var last: Double? { quote?.primaryPrice ?? row?.last }
    private var change: Double? { quote?.primaryChange ?? row?.chg }

    var body: some View {
        VStack(spacing: 0) {
            TVGrabber()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header.padding(.top, 14)
                    priceBlock.padding(.top, TVSpace.s3)
                    chartWidget.padding(.top, TVSpace.block)
                    tabRow.padding(.top, TVSpace.block)
                    content
                    footer
                }
            }
        }
        .background(Theme.bg.ignoresSafeArea())
        .onAppear { ticker.start(symbols: [symbol]) }
        .onDisappear { ticker.stop() }
        .task {
            let url = AppConfig.origin.appendingPathComponent("data/\(symbol).intel.json")
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return }
            intel = try? JSONDecoder().decode(Intel.self, from: data)
        }
        .alert(
            Text(L10n.t("Not in this alpha", model.lang)),
            isPresented: $showsAlphaNotice
        ) {
            Button(L10n.t("OK", model.lang), role: .cancel) {}
        } message: {
            Text(L10n.t("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.", model.lang))
        }
    }

    // MARK: - Header block (§3.4.2)

    private var header: some View {
        HStack(alignment: .top, spacing: 13) {
            LogoCircle(symbol: symbol, colorHex: row?.col, size: 36,
                       nameForInitial: manifest.displayName(symbol, lang: model.lang), market: row?.sec)
            VStack(alignment: .leading, spacing: TVSpace.s1) {
                HStack(spacing: 6) {
                    Text(manifest.displayName(symbol, lang: model.lang))
                        .font(TVType.sheetTitle)
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    // §3.4.2 ticker-switcher affordance. Symbol switching is not in this
                    // alpha, so the control is present and honest rather than absent.
                    Button { showsAlphaNotice = true } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.text2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.t("Switch symbol", model.lang))
                }
                HStack(spacing: TVSpace.s2) {
                    Text("\(symbol) · \(venue)")
                        .font(TVType.rowSecondary)
                        .foregroundStyle(Theme.text2)
                        .lineLimit(1)
                    if quote?.hasExtended == true { sessionBadge }
                }
            }
            Spacer(minLength: TVSpace.s2)
            actionsMenu
        }
        .padding(.horizontal, TVSpace.s4)
    }

    /// §3.4.2 / `spec-symbol-detail.md` §3 "Company header block": the subtitle slot is
    /// `{TICKER} · {EXCHANGE}` — the listing venue ("AXP · NYSE", "NVIDIA … · NASDAQ"),
    /// never the instrument category, which reads "Equities" for every US listing and so
    /// can never converge on the reference. Nothing is fabricated here: the venue is a
    /// published manifest field (`mkt`, set on every production row), the same one
    /// `terminal/lib/markets.ts` classifies markets from. `sec` stays only as the floor
    /// for a row whose venue is missing (the local dev fixture).
    private var venue: String {
        let published = (row?.mkt ?? "").trimmingCharacters(in: .whitespaces)
        return published.isEmpty ? (row?.sec ?? "") : published
    }

    /// §3.4.2's 24 pt status badge pill — the extended-hours moon only. The data-plan
    /// crown is deliberately not shipped: entitlement state is not native business (root
    /// AGENTS.md), and no published API exposes it to the shell.
    private var sessionBadge: some View {
        Image(systemName: "moon.fill")
            .font(.system(size: 10))
            .foregroundStyle(Theme.extHours)
            .padding(.horizontal, TVSpace.s2)
            .frame(height: 24)
            .background(Theme.pill, in: Capsule())
            .accessibilityLabel(L10n.t("Extended hours", model.lang))
    }

    /// §3.4.15's `•••` action sheet, at alpha scope: Share is real OS integration,
    /// Notes / Metrics are styled placeholders on the existing "Not in this alpha" pattern.
    private var actionsMenu: some View {
        Menu {
            ShareLink(item: shareURL) {
                Label(L10n.t("Share", model.lang), systemImage: "square.and.arrow.up")
            }
            Button { showsAlphaNotice = true } label: {
                Label(L10n.t("Notes", model.lang), systemImage: "square.and.pencil")
            }
            Button { showsAlphaNotice = true } label: {
                Label(L10n.t("Metrics", model.lang), systemImage: "chart.bar")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.text)
                .frame(width: 28, height: 28)
        }
        .accessibilityLabel(L10n.t("More actions", model.lang))
    }

    private var shareURL: URL {
        var components = URLComponents(url: AppConfig.origin, resolvingAgainstBaseURL: false)!
        components.path = "/terminal"
        components.queryItems = [URLQueryItem(name: "symbol", value: symbol)]
        return components.url ?? AppConfig.origin
    }

    // MARK: - Price block (§3.4.3)

    private var priceBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            // §3.4.3 / spec §2A/§2B: the quote currency rides the hero print's baseline
            // ("200.75 USD", "336.25 USD") as a 13 pt gray caption — the same
            // baseline-riding unit suffix `TVStatRow` puts on a stat value (§2.8), not a
            // new idiom.
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(TVFormat.price(last))
                    .font(TVType.heroPrice.monospacedDigit())
                    .foregroundStyle(Theme.text)
                    .accessibilityIdentifier("regular-price")
                if let quoteCurrency {
                    Text(quoteCurrency)
                        .font(TVType.rowTertiary)
                        .foregroundStyle(Theme.text2)
                        .accessibilityIdentifier("regular-currency")
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                // §3.4.3 / spec §2A/§2B: the cash move always precedes the percentage
                // ("+5.71 +2.93%", "−1.27 −0.38% at close") — the reference never prints
                // a percent alone. Same colour, driven by the same published percentage.
                if let cashChange {
                    Text(Self.cashChangeText(cashChange, price: last))
                        .font(.system(size: 17, weight: .semibold).monospacedDigit())
                        .foregroundStyle(TVFormat.changeColor(change))
                        .accessibilityIdentifier("regular-change-abs")
                }
                Text(TVFormat.change(change))
                    .font(.system(size: 17, weight: .semibold).monospacedDigit())
                    .foregroundStyle(TVFormat.changeColor(change))
                    .accessibilityIdentifier("regular-change")
                if let contextSuffix {
                    Text(contextSuffix)
                        .font(.system(size: 17))
                        .foregroundStyle(Theme.text2)
                }
            }
            if let quote, quote.hasExtended, let extPrice = quote.extPrice {
                // §3.4.3's extended-hours pill row. `ExtendedQuoteLine` already carries the
                // moon + the independent up/down colouring; the capsule is the one-notch
                // raised fill for a pure-black host (§1.2 C21).
                ExtendedQuoteLine(price: extPrice, change: quote.extChg, session: quote.extSession)
                    .padding(.horizontal, TVSpace.s3)
                    .frame(height: 34)
                    .background(Theme.pill, in: Capsule())
                    .padding(.top, TVSpace.s1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, TVSpace.s4)
    }

    /// The cash leg of the change line. It is a **unit restatement of the two numbers
    /// already on screen** — the displayed price and the published percentage — so the
    /// dollar token and the percent token can never disagree with each other. It is
    /// deliberately *not* `price − prevClose`: after the close the feed's `prevClose` is
    /// the reference for a different session than the percentage we display (NVDA
    /// overnight: last 200.61, prevClose 200.75, regularChg +2.93%), and that pairing
    /// would print a red cash move beside a green percent. No analysis, no new fact.
    private var cashChange: Double? {
        guard let last, last.isFinite, let change, change.isFinite else { return nil }
        let ratio = 1 + change / 100
        guard ratio.isFinite, ratio != 0 else { return nil }
        let delta = last - last / ratio
        return delta.isFinite ? delta : nil
    }

    /// Signed cash delta at the precision of the price it rides with (`TVFormat.price`'s
    /// own sub-10 → 4 dp rule), with the same sign glyphs `TVFormat.change` uses so the
    /// two tokens on the line read as one number.
    private static func cashChangeText(_ delta: Double, price: Double?) -> String {
        let decimals = (price ?? 0) < 10 ? 4 : 2
        return String(format: "%@%.\(decimals)f", delta >= 0 ? "+" : "-", abs(delta))
    }

    /// The currency caption riding the hero price. No published API carries a per-symbol
    /// currency, but the manifest publishes the listing venue and a venue's quote
    /// currency is fixed reference data, not a derived or analytical value. Crypto reads
    /// the pair's own quote asset (every manifest pair is `…-USD`). Anything whose
    /// currency is not certain — index levels, futures, FX crosses, bond yields, and the
    /// country-name venue tail — omits the caption: a missing unit is honest, a wrong
    /// one is a lie about the price.
    private var quoteCurrency: String? {
        switch row?.sec {
        case "Crypto":
            guard let dash = symbol.lastIndex(of: "-") else { return nil }
            let quoteAsset = symbol[symbol.index(after: dash)...].uppercased()
            return quoteAsset.isEmpty ? nil : quoteAsset
        case "Equities", "Funds":
            switch venue.uppercased() {
            case "NYSE", "NASDAQ", "AMEX", "US", "ARCA", "BATS", "OTC", "CBOE": return "USD"
            case "HKEX", "HK", "SEHK": return "HKD"
            case "SSE", "SZSE", "BSE", "CN": return "CNY"
            case "TSX", "TSXV", "NEO", "CA": return "CAD"
            default: return nil
            }
        default:
            return nil
        }
    }

    /// TV's gray "at close" rider. Shown when the print we are displaying is a closed
    /// session — either there is no live quote at all (manifest EOD) or an extended-hours
    /// lane exists, which means the regular session has ended. Never a computed guess
    /// about market hours.
    private var contextSuffix: String? {
        guard let quote else { return L10n.t("at close", model.lang) }
        return quote.hasExtended ? L10n.t("at close", model.lang) : nil
    }

    // MARK: - Chart (§3.4.4 — the widget owns its own range tabs)

    private var chartWidget: some View {
        InlineWebView(url: widgetURL)
            .frame(height: 430)
            .accessibilityHidden(true)
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

    // MARK: - Content tabs (§3.4.5/§3.4.6)

    private var tabRow: some View {
        VStack(spacing: 0) {
            TVHairline()
            TVChipRow(titles: Self.contentTabs.map { L10n.t($0, model.lang) },
                      selectedIndex: contentTab) { contentTab = $0 }
                .padding(.vertical, TVSpace.s2)
            TVHairline()
        }
    }

    @ViewBuilder
    private var content: some View {
        if contentTab == 0 { overview } else { placeholderTab }
    }

    // MARK: - Overview (§3.4.7 order, at the depth our published APIs support)

    private var overview: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader(L10n.t("Key stats", model.lang))
            ForEach(keyStats) { stat in
                TVStatRow(label: L10n.t(stat.label, model.lang), value: stat.value, unit: stat.unit)
            }
            rangeSliders
            if let intel { deskRead(intel) }
        }
    }

    /// §3.4.8 stat rows. Labels stay English keys so the `ForEach` identity is stable
    /// across the language toggle; the magnitude suffix rides as the 13 pt gray unit.
    private struct Stat: Identifiable {
        let label: String
        let value: String
        var unit: String? = nil
        var id: String { label }
    }

    private var keyStats: [Stat] {
        let volume = Self.volumeParts(rowValue(\.vol))
        return [
            Stat(label: "Open", value: PriceStack.price(rowValue(\.open))),
            Stat(label: "High", value: PriceStack.price(rowValue(\.high))),
            Stat(label: "Low", value: PriceStack.price(rowValue(\.low))),
            Stat(label: "Volume", value: volume.0, unit: volume.1),
            Stat(label: "52W High", value: PriceStack.price(rowValue(\.hi52))),
            Stat(label: "52W Low", value: PriceStack.price(rowValue(\.lo52))),
        ]
    }

    /// §3.4.9 — two sliders, day's range then 52-week range, each with the last print
    /// under the track. Rendered only when the manifest actually carries both endpoints.
    @ViewBuilder
    private var rangeSliders: some View {
        if let low = rowValue(\.low), let high = rowValue(\.high), high > low {
            TVRangeSlider(caption: L10n.t("Day's range", model.lang), low: low, high: high, current: last)
                .padding(.top, TVSpace.block)
        }
        if let lo52 = rowValue(\.lo52), let hi52 = rowValue(\.hi52), hi52 > lo52 {
            TVRangeSlider(caption: L10n.t("52-week range", model.lang), low: lo52, high: hi52, current: last)
                .padding(.top, TVSpace.block)
        }
    }

    private func rowValue(_ key: KeyPath<ManifestStore.Row.Extra, Double?>) -> Double? {
        row?.extra[keyPath: key]
    }

    /// Kept for callers that want one string (unchanged formatting contract).
    static func volume(_ value: Double?) -> String {
        guard let value, value.isFinite, value > 0 else { return "—" }
        if value >= 1e9 { return String(format: "%.2fB", value / 1e9) }
        if value >= 1e6 { return String(format: "%.1fM", value / 1e6) }
        if value >= 1e3 { return String(format: "%.1fK", value / 1e3) }
        return String(format: "%.0f", value)
    }

    /// Same thresholds and precision as `volume(_:)`, split so `TVStatRow` can render the
    /// magnitude letter as the 13 pt gray unit suffix TV puts on stat values (§2.8).
    static func volumeParts(_ value: Double?) -> (String, String?) {
        guard let value, value.isFinite, value > 0 else { return ("—", nil) }
        if value >= 1e9 { return (String(format: "%.2f", value / 1e9), "B") }
        if value >= 1e6 { return (String(format: "%.1f", value / 1e6), "M") }
        if value >= 1e3 { return (String(format: "%.1f", value / 1e3), "K") }
        return (String(format: "%.0f", value), nil)
    }

    /// In-content section header — 20 pt Bold, 16 pt inset, 24 pt above (§1.3/§1.4).
    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(TVType.sheetTitle)
            .foregroundStyle(Theme.text)
            .padding(.horizontal, TVSpace.s4)
            .padding(.top, TVSpace.s6)
            .padding(.bottom, TVSpace.s2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }

    // MARK: - Research desk read (Mastermind content module, TV section anatomy)

    private func deskRead(_ intel: Intel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader(L10n.t("Research desk read", model.lang))
            VStack(alignment: .leading, spacing: TVSpace.s2) {
                TVSectionCaption(text: L10n.t("RESEARCH DESK READ — NOT A TRADE SIGNAL", model.lang),
                                 inset: 0, topPadding: 0, bottomPadding: TVSpace.s1)
                if let verdict = intel.cards?.ai_judgment?.verdict {
                    Text(verdict)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let gloss = intel.cards?.ai_judgment?.gloss {
                    Text(gloss)
                        .font(TVType.rowSecondary)
                        .foregroundStyle(Theme.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let conviction = intel.cards?.conviction {
                    if let score = conviction.score {
                        TVStatRow(label: L10n.t("Conviction", model.lang),
                                  value: String(Int(score)),
                                  unit: conviction.band,
                                  valueWeight: .semibold,
                                  inset: 0)
                    }
                    bulletBlock(conviction.drivers ?? [], color: Theme.upText, label: L10n.t("Drivers", model.lang))
                    bulletBlock(conviction.cautions ?? [], color: Theme.downText, label: L10n.t("Cautions", model.lang))
                }
            }
            .padding(.horizontal, TVSpace.s4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func bulletBlock(_ items: [String], color: Color, label: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: TVSpace.s1) {
                TVSectionCaption(text: label, inset: 0, topPadding: TVSpace.s2, bottomPadding: TVSpace.s1)
                ForEach(items.prefix(3), id: \.self) { item in
                    HStack(alignment: .top, spacing: TVSpace.s2) {
                        Circle()
                            .fill(color)
                            .frame(width: 5, height: 5)
                            .padding(.top, 6)
                        Text(item)
                            .font(TVType.rowSecondary)
                            .foregroundStyle(Theme.text2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // MARK: - News / Ideas placeholders (§3.4.6 structure, honest empty state)

    private var placeholderTab: some View {
        VStack(alignment: .leading, spacing: TVSpace.s2) {
            Text(L10n.t("Not in this alpha", model.lang))
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.text)
            Text(L10n.t("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.", model.lang))
                .font(TVType.rowSecondary)
                .foregroundStyle(Theme.text2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, TVSpace.s4)
        .padding(.vertical, TVSpace.s7)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - CTA (§2.12 — 40 pt in the symbol-detail sheet)

    private var footer: some View {
        VStack(spacing: 0) {
            TVHairline().padding(.top, TVSpace.block)
            TVPrimaryCTA(title: L10n.t("Open full chart", model.lang), height: 40, action: onOpenChart)
                .padding(.top, TVSpace.block)
                .padding(.bottom, TVSpace.s6)
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
