import SwiftUI
import UIKit
import WebKit

/// Chart tab: the live web chart under a native loading/error surface, with the
/// TV-style roller strip (symbol + timeframe wheels) docked above the tab bar.
///
/// **Two chrome verbs, never one (§4-A20.6).** They hide different things and must not be
/// merged back into a single flag:
///
/// * `chromeMinimized` (C25's minimize rect) hides **the tab bar only** — `RootTabsView`
///   owns that gate on its bottom `safeAreaInset`. The RollerStrip stays mounted on every
///   idiom, because the minimize rect *lives on the strip* and is the only way back.
///   Merging the two verbs on iPad left the screen with zero chrome and no restore control.
/// * `hidesRollerStrip` (IPAD-05's full-bleed contract) drops the strip as well, and is
///   **phone-landscape only** — a 390 pt-tall landscape phone has no room for it. iPad
///   never auto-hides on rotation: an 834 pt-tall landscape window has room, so minimize
///   is that idiom's only immersive verb and its state is remembered per orientation.
///
/// The web view stays mounted across tab switches, so returning to Chart never reloads.
struct ChartScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @EnvironmentObject private var watchlists: WatchlistStore
    @EnvironmentObject private var auth: AuthService
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.tvWidthClass) private var publishedWidthClass
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @StateObject private var bridge = ShellBridge()
    @State private var loadError: String?
    @State private var blockedRoute: String?
    @State private var symbolIndex = 0
    @State private var timeframeIndex = 0
    /// §2.18 `•••` → §3.5 Analysis hub.
    @State private var showAnalysisHub = false
    /// R2.1 — the pencil now presents the native Drawings sheet. It no longer reveals the
    /// web chart's own dock (`setDrawTools`), which stays hidden in shell mode.
    @State private var showDrawings = false
    /// DEBUG capture only: `-mmHubFull` opens the hub already at its full detent.
    @State private var hubStartsExpanded = false
    /// §2.18 ships a red dot on `•••` for unseen hub items; it clears once the hub is seen.
    @State private var hubUnseen = true
    /// Loop guard for the cookie-absent handoff: setSession makes the page reload itself,
    /// so `ready` fires again — without this the second pass would push once more.
    /// Reset only when WE load the page (retry, sign-out), never on the page's own reload.
    @State private var didPushWebSession = false
    /// ANIM-05: the boot cover's own visibility, so its removal can be a transaction
    /// rather than a frame-drop when `bridge.isReady` flips.
    @State private var showsCover = true
    /// §4-A20.6 — iPad remembers the minimize state per orientation. `false` on a phone,
    /// where landscape is already the immersive verb.
    @State private var isLandscape = false
    @AppStorage("mm.chromeMinimized.portrait") private var chromeMinimizedPortrait = false
    @AppStorage("mm.chromeMinimized.landscape") private var chromeMinimizedLandscape = false

    private var widthClass: TVWidthClass { publishedWidthClass ?? TVWidthClass(horizontalSizeClass) }

    /// IPAD-05 / §4-A20.6 — the **strip** gate, and nothing else.
    ///
    /// `verticalSizeClass != .compact` was a phone-landscape test that iPad answers
    /// `.regular` in every orientation, Split View and Stage Manager configuration, so on
    /// iPad the branch was a constant `true` and the full-bleed contract never fired.
    /// Binding it to `chromeMinimized` instead was the opposite error: minimize then took
    /// the strip away too, leaving an iPad chart with zero chrome and no restore control —
    /// the minimize rect it needs to undo is *drawn on the strip*.
    ///
    /// So the strip disappears on exactly one condition: a landscape **phone**, where
    /// there is no room for it. `chromeMinimized` never enters this expression.
    private var hidesRollerStrip: Bool {
        UIDevice.current.userInterfaceIdiom == .phone && verticalSizeClass == .compact
    }

    /// The symbol wheel's chambers: the active watchlist, with the current symbol
    /// appended when it isn't on the list (so the wheel always shows reality).
    private var wheelSymbols: [String] {
        var syms = watchlists.active.symbols
        if !syms.contains(model.symbol) { syms.append(model.symbol) }
        return syms
    }

    /// R2.4 — the interval wheel rotates the user's STARRED timeframes when the page has
    /// any, with the live interval appended if it isn't starred (the wheel always shows
    /// reality, the same rule `wheelSymbols` follows). The page's canonical list, then a
    /// local list, remain the fallbacks — the wheel must never be empty.
    private var wheelTimeframes: [String] {
        let favourites = bridge.favTimeframes
        if !favourites.isEmpty {
            var tfs = favourites
            if !bridge.timeframe.isEmpty, !tfs.contains(bridge.timeframe) { tfs.append(bridge.timeframe) }
            return tfs
        }
        return bridge.availableTimeframes.isEmpty
            ? ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "D", "2D", "3D", "W", "2W", "1M", "3M"]
            : bridge.availableTimeframes
    }

    var body: some View {
        VStack(spacing: 0) {
            chartStack
            if !hidesRollerStrip { rollerStrip }
        }
        // IPAD-10: `presentationDetents` are honoured only when the presented sheet's own
        // horizontal size class is compact; in iPad regular width SwiftUI silently falls
        // back to a centred `.formSheet`, so §3.5's 60 %-then-full anatomy collapsed into
        // a generic card. In regular width the hub is a full-screen cover with the same
        // internal layout and its own close control (§4-A20.5).
        .sheet(isPresented: Binding(get: { showAnalysisHub && !widthClass.isRegular },
                                    set: { if !$0 { showAnalysisHub = false } })) {
            AnalysisHubSheet(
                lang: model.lang,
                onOpenPanel: openWebPanel,
                startsExpanded: hubStartsExpanded
            ) { showAnalysisHub = false }
        }
        .fullScreenCover(isPresented: Binding(get: { showAnalysisHub && widthClass.isRegular },
                                              set: { if !$0 { showAnalysisHub = false } })) {
            AnalysisHubSheet(
                lang: model.lang,
                isFullScreen: true,
                onOpenPanel: openWebPanel
            ) { showAnalysisHub = false }
        }
        // R2.1 — the pencil's sheet. `.large` and the rest of its anatomy live on the
        // presented view, so this call site carries only the inventory and the two hooks.
        .sheet(isPresented: $showDrawings) {
            DrawingsSheet(
                tools: bridge.drawTools,
                lang: model.lang,
                onPick: { tool in
                    showDrawings = false
                    bridge.setDrawTool(tool.id)
                },
                onClose: { showDrawings = false }
            )
        }
        .onAppear {
            #if DEBUG
            // Headless §6.2 capture states. `-mmHub` is the hub at its 60 % detent,
            // `-mmHubFull` the same sheet already dragged to full, `-mmDraw` the R2.1
            // Drawings sheet.
            let args = ProcessInfo.processInfo.arguments
            if args.contains("-mmHubFull") {
                hubStartsExpanded = true
                showAnalysisHub = true
            } else if args.contains("-mmHub") {
                showAnalysisHub = true
            }
            if args.contains("-mmDraw") { showDrawings = true }
            #endif
        }
        // §4-A20.6 — restore the minimize state this orientation was left in, and keep the
        // two stores in step. Phone never persists: landscape is already its immersive verb.
        .background {
            GeometryReader { geo in
                Color.clear
                    .onChange(of: geo.size.width > geo.size.height, initial: true) { _, landscape in
                        applyOrientation(landscape)
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
            // ANIM-05: readiness drives the cover through its own state so the removal is
            // a 0.28 s cross-fade. `bridge.reset()` (retry, sign-out) puts it back.
            withAnimation(.easeOut(duration: 0.28)) { showsCover = !ready }
            guard ready else { return }
            if let pending = model.requestedSymbol {
                bridge.setSymbol(pending)
                model.requestedSymbol = nil
            }
            // The page bootstraps its language from its own storage; this covers the first
            // load after a native toggle, when that storage is still empty or stale.
            bridge.setLang(model.lang)
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
        // R2.4 — favourites can land after the wheel has already been built.
        .onChange(of: bridge.favTimeframes) { _, _ in syncWheels() }
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

    // MARK: - Canvas

    private var chartStack: some View {
        ZStack {
            // §3.3.1 / CHART-01 — the canvas is a vertical gradient, and it runs
            // **lightest at top**: `IMG_2321.PNG` samples (24,26,37) at y=190 →
            // (19,22,33) at y=2200, monotonic. Drawn dark-at-top, the brightest canvas
            // row butted against the pure-black toolbar, which was the visible seam.
            LinearGradient(
                colors: [Theme.chartBgBottom, Theme.chartBg],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            ChartWebView(
                bridge: bridge,
                onBlockedRoute: { blockedRoute = $0 },
                onLoadFailed: { message in
                    withAnimation(.easeOut(duration: 0.25)) { loadError = message }
                }
            )

            if showsCover && loadError == nil {
                // ANIM-05: a skeleton on the *same* gradient. The old cover filled
                // `Theme.bg` (#000000) over the canvas and was removed in one frame —
                // a black→navy cut on every cold launch.
                ChartSkeleton(lang: model.lang)
                    .transition(.opacity)
                    .task { await failIfStalled() }
            }

            if let message = loadError {
                ErrorCover(message: message, lang: model.lang, retry: retryLoad)
                    .transition(.opacity)
            }
        }
    }

    private var rollerStrip: some View {
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
            onTapSymbol: { model.openSearch(.go) },
            lang: model.lang,
            showsMoreBadge: hubUnseen,
            onMore: openAnalysisHub,
            drawActive: showDrawings,
            onDraw: { showDrawings = true },
            onUndo: { drawHistory { bridge.drawUndo() } },
            onRedo: { drawHistory { bridge.drawRedo() } },
            shareSymbol: model.symbol,
            chromeMinimized: model.chromeMinimized,
            onToggleChrome: toggleChrome
        )
        // With the tab bar minimised away, the strip becomes the bottom-most piece of
        // chrome — the home-indicator inset under it stays pure black (§1.10).
        .background(Theme.bg.ignoresSafeArea(edges: .bottom))
    }

    /// ANIM-13: present first, clear the dot once the sheet has covered the toolbar — a
    /// dot that vanishes under the user's finger reads as a glitch, not as "seen".
    private func openAnalysisHub() {
        showAnalysisHub = true
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            withAnimation(.easeOut(duration: 0.2)) { hubUnseen = false }
        }
    }

    /// R2.1 — drawing history is the renderer's, so the strip's undo/redo can only ask.
    /// Before the page is ready there is nothing to ask, and the control falls back to the
    /// placeholder acknowledgement (`.soft`) the strip used while these were inert: the
    /// touch is answered, and nothing is silently dropped.
    private func drawHistory(_ send: () -> Void) {
        guard bridge.isReady else {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            return
        }
        send()
    }

    /// R2.2 — the hub's Indicators/Compare tiles. The hub closes first so the page's own
    /// modal is not opened behind a sheet.
    private func openWebPanel(_ panel: String) {
        showAnalysisHub = false
        guard bridge.isReady else { return }
        bridge.openPanel(panel)
    }

    /// ANIM-11: the single transaction that owns the bar's slide, the safe-area inset it
    /// gives back and the chart's new height. Nothing on that path animates implicitly.
    private func toggleChrome() {
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        withAnimation(TVChrome.minimize) { model.chromeMinimized.toggle() }
        persistChromeMinimized()
    }

    private func retryLoad() {
        withAnimation(.easeOut(duration: 0.25)) { loadError = nil }
        didPushWebSession = false
        bridge.reset()
        bridge.webView?.load(URLRequest(url: AppConfig.chartURL(symbol: model.symbol)))
    }

    /// The page normally reports ready in a few seconds; a silent hang (captive portal,
    /// stalled TLS) must not strand a blank cover.
    private func failIfStalled() async {
        try? await Task.sleep(for: .seconds(25))
        guard !bridge.isReady, loadError == nil else { return }
        withAnimation(.easeOut(duration: 0.25)) {
            loadError = L10n.t("The chart is taking too long to load.", model.lang)
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

    /// §4-A20.6. Only the iPad has a minimize state worth remembering: the phone's
    /// immersive verb is the rotation itself, and `chromeMinimized` is never set there.
    private func applyOrientation(_ landscape: Bool) {
        isLandscape = landscape
        guard UIDevice.current.userInterfaceIdiom != .phone, model.tab == .chart else { return }
        let restored = landscape ? chromeMinimizedLandscape : chromeMinimizedPortrait
        guard restored != model.chromeMinimized else { return }
        withAnimation(TVChrome.minimize) { model.chromeMinimized = restored }
    }

    private func persistChromeMinimized() {
        guard UIDevice.current.userInterfaceIdiom != .phone else { return }
        if isLandscape {
            chromeMinimizedLandscape = model.chromeMinimized
        } else {
            chromeMinimizedPortrait = model.chromeMinimized
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

/// ANIM-05 — the boot surface. Deliberately draws **no background of its own**: the
/// parent's canvas gradient shows through, so the first frame of the app is already the
/// colour the chart lands on and the hand-off is a cross-fade, not a cut.
///
/// The shape is the chart's own anatomy: a right-hand price-axis rail and the three pane
/// bands the chart will occupy (price + two oscillators), at the 5 % white / r 6 the kit
/// uses for every skeleton, under a 1.2 s left→right shimmer.
struct ChartSkeleton: View {
    var lang = "en"

    private enum Skeleton {
        /// The price scale the chart reserves on the right.
        static let railWidth: CGFloat = 56
        static let inset: CGFloat = 12
        static let gap: CGFloat = 10
        /// Price pane, then the two oscillator panes, as fractions of the plot height.
        static let paneShares: [CGFloat] = [0.62, 0.19, 0.19]
    }

    var body: some View {
        GeometryReader { geo in
            let gaps = Skeleton.gap * CGFloat(Skeleton.paneShares.count - 1)
            let plotHeight = max(geo.size.height - Skeleton.inset * 2 - gaps, 0)
            HStack(alignment: .top, spacing: Skeleton.gap) {
                VStack(spacing: Skeleton.gap) {
                    ForEach(Array(Skeleton.paneShares.enumerated()), id: \.offset) { _, share in
                        band.frame(maxWidth: .infinity)
                            .frame(height: plotHeight * share)
                    }
                }
                band.frame(width: Skeleton.railWidth)
            }
            .padding(Skeleton.inset)
            .frame(width: geo.size.width, height: geo.size.height)
            .modifier(ChartSkeletonShimmer())
        }
        .accessibilityLabel(L10n.t("Loading chart…", lang))
    }

    private var band: some View {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(Color.white.opacity(0.05))
    }
}

/// The travelling highlight over the boot skeleton.
///
/// Deliberately **not** `TVKit`'s `tvShimmer()`: that mask is a bare gradient rect swept
/// past the content's own bounds, so for part of every cycle the content sits outside the
/// mask entirely and disappears. Here the mask is an opaque floor plus a travelling band,
/// so the skeleton never drops below 55 % and only brightens as the highlight passes.
private struct ChartSkeletonShimmer: ViewModifier {
    func body(content: Content) -> some View {
        content.phaseAnimator([0.0, 1.0]) { view, phase in
            view.mask {
                GeometryReader { geo in
                    ZStack {
                        Color.black.opacity(0.55)
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: .black.opacity(0.45), location: 0.5),
                                .init(color: .clear, location: 1),
                            ],
                            startPoint: .leading, endPoint: .trailing
                        )
                        .frame(width: geo.size.width * 0.8)
                        .offset(x: (phase * 2 - 1) * geo.size.width)
                    }
                }
            }
        } animation: { phase in
            // Phase 0 is the instant reset, so the highlight never runs backwards.
            phase == 1 ? .linear(duration: 1.2) : .linear(duration: 0)
        }
    }
}

struct ErrorCover: View {
    let message: String
    var lang = "en"
    let retry: () -> Void

    var body: some View {
        ZStack {
            // ANIM-24: a scrim, not a fill — the chart gradient stays visible behind the
            // message, so a failed load reads as "this surface didn't arrive", not as a
            // different, black screen.
            Color.black.opacity(0.72).ignoresSafeArea()
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
