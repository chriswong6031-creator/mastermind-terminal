import SwiftUI
import UIKit
import WebKit

/// TV-parity **symbol-detail sheet** — `TV_PARITY_MASTER_SPEC.md` §3.4 plus
/// `spec-symbol-detail.md` §2B (surface B, the chart-anchored detail sheet).
///
/// Structure, top → bottom: grabber → 36 pt logo · company name 20 pt Bold + `⌄`
/// ticker-switcher · `•••` · `TICKER · EXCHANGE` 15 pt gray with a session badge →
/// hero price 28 pt Bold with its 13 pt currency caption, over a 17 pt cash-then-percent
/// change with a gray context suffix and the extended-hours pill → the **chart module**
/// (`/embed/chart`, which ships its own TV-style range pills and the ⤢ fullscreen rect,
/// so §3.4.4's native range row is deliberately NOT duplicated) → `TVChip` content tabs →
/// the **dossier web slice** (`/terminal?dossier=1`) as the Overview body. Nothing follows
/// it: the slice ends with its own Open-full-analysis / Ask-AI actions, so the native
/// stats grid, the two range sliders, the desk-read module and the white "Open full chart"
/// CTA that used to live here are gone — one implementation of that content, on the web
/// side, exactly as root `AGENTS.md` requires (native never re-implements analysis).
///
/// Surface law (§1.2 tier 2): a sheet whose content is a symbol is **pure `#000000`**,
/// and raised children on it step one notch to `Theme.pill` — never `panel2`.
///
/// Presentation only (root AGENTS.md): every number here is fetched, never derived.
struct PreviewItem: Identifiable {
    let symbol: String
    var id: String { symbol }
}

/// The symbol sheet's one detent (`spec-symbol-detail.md` §2B), shared by both call sites.
///
/// **The reference:** the card's top edge begins at ~y 83 of the 874 pt device, full-bleed,
/// with the host's status band visible above it — the platform's own maximum sheet on the
/// OS the corpus was captured on (`IMG_2325.PNG`: card ink reaches x 0 and x 401 at every
/// row, so no inset).
///
/// **What we shipped:** `.fraction(0.91)`, which resolves against `maxDetentValue` (the
/// screen *less* the top safe area, 812 here), landing the top edge at 153 pt.
///
/// **What iOS 26 does, measured on this simulator** — a sheet below its maximum detent is
/// rendered inset 8 pt per side **and scaled to ≈0.963**, and the scale hits every token
/// inside it: `TVGrabber` measures 35.3 pt at a partial detent and its true 36.7 pt at
/// `.large`, on the same build, in the same sheet. Three detents, one capture each:
///
/// | detent | card height | rendered top edge | grabber |
/// |---|---|---|---|
/// | `.fraction(0.91)` | 739 | 153 pt | 35.3 |
/// | `.custom(max − 24)` | 788 | 109 pt | 35.3 |
/// | `.large` | 812 | **62 pt** | **36.7** |
///
/// The reference's 83 pt is therefore **unreachable on this OS**: the scaled regime cannot
/// go above ~90 pt before the platform switches to the edge-attached look. `.large` is both
/// the closest reachable top edge (−21 pt vs +26 pt) and the only one that renders the
/// sheet's measured anatomy at measured size — a 4 % shrink of every inset, row height and
/// type size inside the card is a far larger parity loss than 21 pt of host chrome, and
/// L1 makes the measured tokens the thing we protect. Registered as §4-A20.21.
///
/// Compact width only — in regular width SwiftUI discards detents entirely and the host
/// presents a `.fullScreenCover` instead (§4-A20.5).
enum PreviewSheetPresentation {
    static let detent: PresentationDetent = .large
}

struct PreviewSheet: View {
    let symbol: String
    /// IPAD-10 / §4-A20.5. In regular width the host presents this as a `.fullScreenCover`
    /// (SwiftUI discards `presentationDetents` there), so the surface is not
    /// drag-dismissable: `TVGrabber` — which advertises exactly that — is suppressed and an
    /// explicit close takes its place. Default `false` keeps every compact call site
    /// byte-identical.
    var isFullScreen = false
    let onOpenChart: () -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @StateObject private var ticker = QuoteTicker()
    @State private var contentTab = 0
    @State private var showsAlphaNotice = false
    /// ANIM-18 — the two embeds each hold a skeleton until their page reports `didFinish`,
    /// instead of showing a hole where a module will be.
    @State private var chartLoaded = false
    @State private var dossierLoaded = false
    /// Driven by the dossier slice's own `contentHeight` posts (see `InlineWebView`'s
    /// height bridge). The default is the measured first-paint height of the rail, so the
    /// sheet never opens on a collapsed web view while the page is laying out.
    @State private var dossierHeight: CGFloat = Self.dossierDefaultHeight

    /// §3.4.6 content tabs — the reference's full four-chip row. Keys stay English so the
    /// selected index survives a language flip and the `ForEach` identity never churns.
    /// News / Minds / Ideas have no alpha backend, so they ship as placeholder
    /// affordances on the existing "Not in this alpha" pattern rather than being cut from
    /// the row: the structure mirrors the reference even where our backend is thinner.
    private static let contentTabs = ["Overview", "News", "Minds", "Ideas"]

    /// §2B: the chart plot area measures **430 pt** including the x-axis and the range-pill
    /// row. It is the *proportion* that is measured, not the absolute — §4-A20.5 re-derives
    /// the module from the presented container's own height so a 1210 pt iPad cover does
    /// not ship a phone-sized chart with 700 pt of dossier under it.
    ///
    /// The denominator is the **card**, not the device: 430 pt of a 791 pt sheet (874 − the
    /// 83 pt top edge), not of the 874 pt screen the sheet never fills. Dividing by 874 was
    /// the arithmetic that made the module ~19 % short even before the detent was wrong.
    private static let referenceSheetHeight: CGFloat = 874 - 83
    private static let chartHeightRatio: CGFloat = 430.0 / referenceSheetHeight
    /// Floor/ceiling so a mid-presentation measurement can neither collapse the module nor
    /// push the tabs off the bottom of a short window.
    private static let chartHeightRange: ClosedRange<CGFloat> = 300...620
    private static let dossierDefaultHeight: CGFloat = 900
    /// Clamp for anything the page reports — a zero/absurd measurement must never collapse
    /// or explode the scroll content.
    private static let dossierHeightRange: ClosedRange<CGFloat> = 240...20000

    private var row: ManifestStore.Row? { manifest.rows[symbol] }
    private var quote: QuoteTicker.Quote? { ticker.quotes[symbol] }
    /// Live quote wins; the manifest's EOD row is the offline/cold-launch floor.
    private var last: Double? { quote?.primaryPrice ?? row?.last }
    private var change: Double? { quote?.primaryChange ?? row?.chg }

    var body: some View {
        GeometryReader { geo in
            // The ratio's denominator is the whole card, so the measurement must be too:
            // a GeometryReader inside a sheet reports the *safe* height, and subtracting
            // the home-indicator inset from the container while the reference includes it
            // is how a proportion silently loses 34 pt.
            let containerHeight = geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom
            VStack(spacing: 0) {
                // §4-A20.5 — the grabber only ships where the surface can actually be
                // dragged; on a full-screen cover it would advertise a gesture that is not
                // there, so the close control takes its place.
                if isFullScreen { closeRow } else { TVGrabber() }
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        header.padding(.top, 14)
                        priceBlock.padding(.top, TVSpace.s3)
                        chartModule(containerHeight: containerHeight)
                            .padding(.top, TVSpace.block)
                        tabRow.padding(.top, TVSpace.block)
                        content
                    }
                }
            }
        }
        .background(Theme.bg.ignoresSafeArea())
        .onAppear { ticker.start(symbols: [symbol]) }
        .onDisappear { ticker.stop() }
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

    /// The regular-width dismissal. Same ⌀30 circular close the tool sheets use (§2.2),
    /// on the sheet's own 16 pt inset.
    private var closeRow: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            TVCloseButton(style: .circle, accessibilityLabel: L10n.t("Close", model.lang)) {
                dismiss()
            }
        }
        .padding(.horizontal, TVSpace.s4)
        .padding(.top, TVSpace.s3)
    }

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
                    .buttonStyle(TVPressStyle(.glyph))
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

    // MARK: - Chart module (§3.4.4 — the widget owns its range pills AND its ⤢)

    /// The `/embed/chart` widget in its shell dress: no header quote (`hdr=0`), no page
    /// chrome (`clean=1`), transparent so the sheet's pure black shows through, and the
    /// fullscreen rect enabled (`fs=1`). Inner scrolling is off — this module is a fixed
    /// `chartHeight` block inside the sheet's single ScrollView, and a live inner scroller
    /// would fight the sheet's own drag.
    private func chartModule(containerHeight: CGFloat) -> some View {
        let height = min(max(containerHeight * Self.chartHeightRatio,
                             Self.chartHeightRange.lowerBound),
                         Self.chartHeightRange.upperBound)
        return InlineWebView(url: chartEmbedURL,
                             scrollEnabled: false,
                             onShellMessage: handleChartMessage,
                             onLoaded: { chartLoaded = true })
            .frame(height: height)
            .overlay {
                if !chartLoaded {
                    TVSkeletonBlock(lines: 1, lineHeight: height - TVSpace.s4 * 2)
                        .padding(.horizontal, TVSpace.s4)
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.18), value: chartLoaded)
    }

    private var chartEmbedURL: URL {
        var components = URLComponents(url: AppConfig.origin.appendingPathComponent("embed/chart"),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "symbol", value: symbol),
            URLQueryItem(name: "range", value: "3M"),
            URLQueryItem(name: "theme", value: "dark"),
            URLQueryItem(name: "lang", value: model.lang),
            URLQueryItem(name: "transparent", value: "1"),
            URLQueryItem(name: "hdr", value: "0"),
            URLQueryItem(name: "clean", value: "1"),
            URLQueryItem(name: "fs", value: "1"),
        ]
        return components.url!
    }

    /// The widget's ⤢ posts `{type:"openFullChart"}`; the native answer is the sheet's
    /// existing exit closure, which dismisses and opens the Chart tab on this symbol.
    private func handleChartMessage(_ body: [String: Any]) {
        guard body["type"] as? String == "openFullChart" else { return }
        onOpenChart()
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
        if contentTab == 0 { dossier } else { placeholderTab }
    }

    // MARK: - Overview = the dossier web slice (§3.4.7 content, one implementation)

    /// `/terminal?shell=app&symbol=…&dossier=1` renders the detail-board rail with no
    /// chart of its own — key stats, ranges, the desk read, financial modules and its own
    /// trailing Open-full-analysis / Ask-AI actions. It lives *inside* this sheet's
    /// ScrollView, so its own scroller is disabled and its height is driven by the page's
    /// `contentHeight` posts rather than a guess.
    private var dossier: some View {
        InlineWebView(url: dossierURL,
                      scrollEnabled: false,
                      onShellMessage: handleDossierMessage,
                      onLoaded: { dossierLoaded = true })
            .frame(height: dossierHeight)
            .overlay(alignment: .top) {
                if !dossierLoaded {
                    TVSkeletonBlock(lines: 6, thumb: true)
                        .padding(.horizontal, TVSpace.s4)
                        .padding(.top, TVSpace.s4)
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.18), value: dossierLoaded)
    }

    private var dossierURL: URL {
        var components = URLComponents(url: AppConfig.origin.appendingPathComponent("terminal"),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "shell", value: "app"),
            URLQueryItem(name: "symbol", value: symbol),
            URLQueryItem(name: "dossier", value: "1"),
        ]
        return components.url!
    }

    private func handleDossierMessage(_ body: [String: Any]) {
        switch body["type"] as? String {
        case "contentHeight":
            guard let reported = body["h"] as? NSNumber else { return }
            let value = CGFloat(reported.doubleValue)
            guard value.isFinite else { return }
            let clamped = min(max(value, Self.dossierHeightRange.lowerBound),
                              Self.dossierHeightRange.upperBound)
            // Sub-point churn from the page's own layout must not animate the scroll view.
            guard abs(clamped - dossierHeight) >= 1 else { return }
            withAnimation(.easeOut(duration: 0.18)) { dossierHeight = clamped }
        case "openExternal":
            // Shell-mode pages route outbound links through the bridge rather than a
            // navigation; honour it the same way `ShellBridge` does.
            if let raw = body["url"] as? String, let url = URL(string: raw),
               url.scheme == "https" || url.scheme == "http" {
                UIApplication.shared.open(url)
            }
        default:
            break
        }
    }

    // MARK: - News / Minds / Ideas placeholders (§3.4.6 structure, honest empty state)

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
}

/// Minimal web container for owned-origin embeds (the `/embed/chart` widget, the dossier
/// slice, and the shell-mode workspace screens). Main-frame navigation is pinned to the
/// origin; anything else opens in the system browser.
///
/// Two opt-in capabilities, both defaulted off so existing call sites are unchanged:
/// * `scrollEnabled: false` — for an embed hosted inside a native ScrollView, where an
///   inner scroller would fight the host's drag. The caller then owns the frame height.
/// * `onShellMessage` — installs the `mm` script-message handler plus a documentEnd
///   height bridge, so a hosted page can post `{type:"openFullChart"}` (the chart
///   widget's ⤢) or `{type:"contentHeight", h}` (the ResizeObserver) back to SwiftUI.
/// * `onLoaded` — fired once, on the first main-frame `didFinish`, so a host can hold a
///   skeleton over the module until the page is actually there (ANIM-18).
struct InlineWebView: UIViewRepresentable {
    let url: URL
    var scrollEnabled: Bool = true
    var onShellMessage: (([String: Any]) -> Void)? = nil
    var onLoaded: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true

        context.coordinator.onShellMessage = onShellMessage
        context.coordinator.onLoaded = onLoaded
        if onShellMessage != nil {
            // A duplicate handler name on one content controller raises an ObjC exception.
            // This configuration is freshly built, but the remove-then-add keeps that
            // guarantee local instead of resting on the allocation above.
            configuration.userContentController.removeScriptMessageHandler(forName: ShellBridge.messageName)
            configuration.userContentController.add(context.coordinator, name: ShellBridge.messageName)
            configuration.userContentController.addUserScript(Self.heightBridgeScript)
            context.coordinator.installedMessageHandler = true
        }

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.isScrollEnabled = scrollEnabled
        webView.scrollView.bounces = scrollEnabled
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // The coordinator is made once; refresh the closure so a re-rendered SwiftUI view
        // never delivers messages into a stale capture.
        context.coordinator.onShellMessage = onShellMessage
        context.coordinator.onLoaded = onLoaded
        if webView.scrollView.isScrollEnabled != scrollEnabled {
            webView.scrollView.isScrollEnabled = scrollEnabled
            webView.scrollView.bounces = scrollEnabled
        }
        if webView.url != url && context.coordinator.lastRequested != url {
            context.coordinator.lastRequested = url
            webView.load(URLRequest(url: url))
        }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.onShellMessage = nil
        coordinator.onLoaded = nil
        guard coordinator.installedMessageHandler else { return }
        coordinator.installedMessageHandler = false
        webView.configuration.userContentController.removeScriptMessageHandler(forName: ShellBridge.messageName)
        webView.configuration.userContentController.removeAllUserScripts()
    }

    /// Height bridge: report the document's laid-out height to native, throttled to ~200 ms
    /// so a page that reflows continuously cannot storm the main thread. Installed only
    /// when a caller asked for shell messages; a page that ignores it is unaffected.
    private static let heightBridgeScript = WKUserScript(
        source: """
        (function () {
          if (window.__mmHeightBridge) { return; }
          window.__mmHeightBridge = true;
          var last = -1;
          var timer = null;
          function post() {
            timer = null;
            var body = document.body;
            var root = document.documentElement;
            var h = Math.max(
              body ? body.scrollHeight : 0,
              body ? body.offsetHeight : 0,
              root ? root.scrollHeight : 0
            );
            if (!h || Math.abs(h - last) < 1) { return; }
            last = h;
            try {
              window.webkit.messageHandlers.mm.postMessage({ type: 'contentHeight', h: h });
            } catch (e) {}
          }
          function schedule() { if (timer === null) { timer = setTimeout(post, 200); } }
          if (window.ResizeObserver && document.body) {
            try { new ResizeObserver(schedule).observe(document.body); } catch (e) {}
          }
          window.addEventListener('load', schedule);
          window.addEventListener('resize', schedule);
          schedule();
        })();
        """,
        injectionTime: .atDocumentEnd,
        forMainFrameOnly: true
    )

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var lastRequested: URL?
        var onShellMessage: (([String: Any]) -> Void)?
        var onLoaded: (() -> Void)?
        var installedMessageHandler = false

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == ShellBridge.messageName,
                  let body = message.body as? [String: Any] else { return }
            onShellMessage?(body)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            onLoaded?()
        }

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
