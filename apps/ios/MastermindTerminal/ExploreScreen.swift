import SwiftUI

// Explore tab root — TradingView's third tab, rebuilt to the measured spec
// (`docs/tv-parity/TV_PARITY_MASTER_SPEC.md` §3.8 + `spec2-explore.md`).
//
// Surface law (§1.2 rule 1): a full-screen tab root that keeps the 5-tab bar visible is
// pure `Theme.bg`. Every raised child on it therefore fills `Theme.pill` `#2E2E2E`, not
// the sheet-tier `#2C2C2E` (the one-notch rule, C21) — which is why the index cards and
// both pill rows fill `Theme.pill` and `TVTile` (whose fill is keyed to a sheet host) is
// never used on this screen.
//
// Margin correction (spec2-explore §2.2a): the Explore root uses the **16 pt** margin,
// not the 20 pt margin §1.4 assigns to black full-screen pages. Both hard geometric
// measurements on the reference frame (action row and card grid) land on exactly 16 pt.

/// Layout constants measured from `z-015.png` (spec2-explore §2/§3). Kept together so a
/// re-measure changes one place; nothing here is rounded to taste.
private enum ExploreMetrics {
    /// §2.1 — bare `magnifyingglass`, 19.3 pt box, right inset 20.3 pt (the one element
    /// on this page that does NOT use the 16 pt margin).
    static let searchGlyph: CGFloat = 19.3
    static let searchGlyphTrailingInset: CGFloat = 20.3
    /// §2.2 — glyph bottom → title cap top is 24.7 pt; ≈9.2 pt of that is SF Pro's
    /// ascender-to-cap lead at 34 pt, so the frame gap is the remainder.
    static let searchToTitleGap: CGFloat = 15.5
    /// §3.1 — title cap bottom → action-row top is 24.3 pt, less SF Pro's 34 pt descent.
    static let titleToActionGap: CGFloat = 17
    // SCREEN-02: the 117.7 × 63.7 pt tile metrics that used to live here described the
    // wrong primitive. §3.8.2 measures this row as capsules, so it is built from
    // `TVNavPill`'s own measured 31.3 pt height and 11 pt gutter instead.
    /// §3.2 — action-row bottom → pill-row top.
    static let actionToPillsGap: CGFloat = 16.7
    /// §3.3 — pill-row bottom → first card row top.
    static let pillsToCardsGap: CGFloat = 25.7
    /// §3.3 — card content box, column gutter and (vertical) row gutter.
    static let cardWidth: CGFloat = 149.7
    static let cardHeight: CGFloat = 103.3
    static let cardGutter: CGFloat = 8.3
    static let cardRowGutter: CGFloat = 28.7
    /// §3.3 — badge disc, its inset inside the card, and the gap to the name.
    static let cardBadge: CGFloat = 19.7
    static let cardContentInset: CGFloat = 8
    static let cardBadgeToName: CGFloat = 5
    /// §3.3 — the column rule flanking each card: 1 device px of `#2E2E2E` that fades out
    /// over ~8 pt at each end. Neither `tvHairline` nor any other divider token (B11).
    static let cardRuleFade: CGFloat = 8
    /// §3.4 — card grid bottom → "Top Stories" cap top measures 32–42 pt, a bigger break
    /// than either the s6 (24) or s7 (30) section token.
    static let cardsToStoriesGap: CGFloat = 37
    /// §3.4 — text → chevron gap.
    static let storiesChevronGap: CGFloat = 8.7
}

struct ExploreScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @StateObject private var ticker = QuoteTicker()
    @Environment(\.tvWidthClass) private var publishedWidthClass
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    /// Drives the app's existing "Not in this alpha" notice for the placeholder entries.
    @State private var showsNotInAlpha = false
    /// Headless §6.2 capture state (`-mmDiscover`): the pushed Discover frame is tap-only.
    @State private var debugDiscover = false

    /// The majors rail. Real data throughout: manifest EOD renders instantly, `QuoteTicker`
    /// overlays the live/delayed print from `/api/quote` on the existing 6 s cadence.
    private let indices = ["SPY", "QQQ", "DIA", "IWM", "BTC-USD", "ETH-USD"]

    private var widthClass: TVWidthClass { publishedWidthClass ?? TVWidthClass(horizontalSizeClass) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    actionRow
                        .padding(.top, ExploreMetrics.titleToActionGap)
                    pillRow
                        .padding(.top, ExploreMetrics.actionToPillsGap)
                    carousel
                        .padding(.top, ExploreMetrics.pillsToCardsGap)
                    topStories
                        .padding(.top, ExploreMetrics.cardsToStoriesGap)
                }
                .padding(.bottom, TVSpace.s6)
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $debugDiscover) {
                ShellWebScreen(title: L10n.t("Discover", model.lang), path: "discover")
            }
            .onAppear {
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-mmDiscover") { debugDiscover = true }
                #endif
            }
            .alert(
                Text(L10n.t("Not in this alpha", model.lang)),
                isPresented: $showsNotInAlpha
            ) {
                Button(L10n.t("OK", model.lang), role: .cancel) { showsNotInAlpha = false }
            } message: {
                Text(L10n.t("This part of Explore arrives in a later alpha.", model.lang))
            }
        }
        // A1.7 — the screen is mounted for the app's whole lifetime now, so the ticker
        // follows the selected tab instead of view appearance.
        .onChange(of: model.tab, initial: true) { _, tab in
            if tab == .explore {
                ticker.start(symbols: indices)
            } else {
                ticker.stop()
            }
        }
    }

    // MARK: - §2.1/§2.2 header

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                Button {
                    model.openSearch(.go)
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: ExploreMetrics.searchGlyph, weight: .regular))
                        .foregroundStyle(Theme.text)
                        .frame(width: ExploreMetrics.searchGlyph, height: ExploreMetrics.searchGlyph)
                }
                .buttonStyle(TVPressStyle(.glyph))
                .accessibilityLabel(L10n.t("Search", model.lang))
            }
            .padding(.trailing, ExploreMetrics.searchGlyphTrailingInset)
            .padding(.top, TVSpace.s2)

            // C22 tier 1: the tab-root large title is the iOS stock 34 pt slot, and it is
            // visibly heavier than SF Pro Bold — Heavy, not Bold.
            Text(L10n.t("Explore", model.lang))
                .font(TVType.largeTitle)
                .foregroundStyle(Theme.text)
                .padding(.leading, TVSpace.s4)
                .padding(.top, ExploreMetrics.searchToTitleGap)
                .accessibilityAddTraits(.isHeader)
        }
        // IPAD-09 — the search glyph sat ~660 pt from the title it belongs to.
        .tvReadableWidth()
    }

    // MARK: - §3.8.2 action row

    /// SCREEN-02 — §3.8.2 measures this row as "filled `#2E2E2E` capsule buttons, 13–14 pt
    /// labels". It shipped as ~112 × 64 pt icon-over-label tiles, i.e. `TVTile` geometry
    /// (§3.5.6's Analysis-hub tool cell), with the correctly-built `TVNavPill` category row
    /// directly beneath it on the same screen. The **inventory** (News / Calendar /
    /// Discover / Analysis in place of TV's News / Calendar / Brokers) is spec-sanctioned by
    /// §3.8.6 — only the shape was wrong.
    ///
    /// IPAD-08: on the phone the row scrolls because 402 pt clips it. In regular width the
    /// reason to scroll has evaporated, so the same capsules tile a bounded column.
    @ViewBuilder
    private var actionRow: some View {
        if widthClass.isRegular {
            HStack(spacing: TVNavPill.gutter) {
                actionPills
                Spacer(minLength: 0)
            }
            .padding(.horizontal, TVSpace.s4)
            .tvReadableWidth()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TVNavPill.gutter) {
                    actionPills
                }
                .padding(.horizontal, TVSpace.s4)
            }
            .frame(height: TVNavPill.height)
        }
    }

    @ViewBuilder
    private var actionPills: some View {
        // The placeholder variants surface the app's existing "Not in this alpha" notice
        // rather than pretending the feature is missing.
        TVNavPill(title: L10n.t("News", model.lang), icon: "newspaper") { showsNotInAlpha = true }
        TVNavPill(title: L10n.t("Calendar", model.lang), icon: "calendar") { showsNotInAlpha = true }
        // The working variants: shell-mode web workspaces pushed with native chrome.
        webActionPill(icon: "square.grid.2x2", title: L10n.t("Discover", model.lang), path: "discover")
        webActionPill(icon: "brain.head.profile", title: L10n.t("Analysis", model.lang), path: "analysis")
    }

    /// `TVNavPill`'s anatomy behind a `NavigationLink`, which cannot take the primitive's
    /// action closure.
    private func webActionPill(icon: String, title: String, path: String) -> some View {
        NavigationLink {
            ShellWebScreen(title: title, path: path)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.text)
                Text(title)
                    .font(TVType.pillLabel)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(height: TVNavPill.height)
            .background(Theme.pill, in: Capsule())
        }
        .buttonStyle(TVPressStyle(.tile))
    }

    // MARK: - §3.2 category pills

    /// C23: these are navigation, not selection — every pill is filled and none is ever
    /// "active". Tapping one opens the search surface browsing that category (the
    /// search-row law: a category with an empty query BROWSES, it never shows an empty pane).
    private var pillRow: some View {
        TVNavPillRow(titles: manifest.categories) { index in
            let categories = manifest.categories
            guard categories.indices.contains(index) else { return }
            model.openSearch(.go, category: categories[index])
        }
        // Same bounded column as the action row above and the cards below.
        .tvReadableWidth()
    }

    // MARK: - §3.3 index-card carousel

    /// A 2-row × N-column grid that pans as one unit — not two independent single-row
    /// carousels, and not a static 2-column grid.
    ///
    /// IPAD-08 / §4-A20.3: in regular width the grid ended ~485 pt into an 834 pt page and
    /// had nothing left to scroll to, so the same measured cell tiles a bounded column
    /// instead. Every card metric (`cardWidth`, `cardHeight`, `cardGutter`,
    /// `cardRowGutter`, `ExploreColumnRule`) is unchanged — only the column **count**
    /// adapts, which is the whole of §6's extrapolation law.
    @ViewBuilder
    private var carousel: some View {
        if widthClass.isRegular {
            LazyVGrid(
                columns: TVGrid.adaptiveColumns(minimum: ExploreMetrics.cardWidth,
                                                gutter: ExploreMetrics.cardGutter),
                alignment: .leading,
                spacing: ExploreMetrics.cardRowGutter
            ) {
                ForEach(indices, id: \.self) { indexCard($0) }
            }
            .padding(.horizontal, TVSpace.s4)
            .tvReadableWidth()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHGrid(
                    rows: [
                        GridItem(.fixed(ExploreMetrics.cardHeight), spacing: ExploreMetrics.cardRowGutter),
                        GridItem(.fixed(ExploreMetrics.cardHeight), spacing: 0),
                    ],
                    spacing: ExploreMetrics.cardGutter
                ) {
                    ForEach(indices, id: \.self) { indexCard($0) }
                }
                .padding(.horizontal, TVSpace.s4)
            }
            .frame(height: ExploreMetrics.cardHeight * 2 + ExploreMetrics.cardRowGutter)
        }
    }

    /// Borderless: no enclosing rounded rect, no fill panel, no drawn top or bottom edge.
    /// The only chrome is the faded column rule sitting in the gutter beside it.
    private func indexCard(_ sym: String) -> some View {
        let row = manifest.rows[sym]
        let quote = ticker.quotes[sym]
        let last = quote?.primaryPrice ?? row?.last
        let change = quote?.primaryChange ?? row?.chg
        let name = manifest.displayName(sym, lang: model.lang)
        // /api/quote reports its own provenance (LIVE | DELAYED_15M | EOD); the orange "D"
        // is a bare glyph with no background chip (§1.1, spec2-explore §3.3).
        let isDelayed = (quote?.basis ?? "").uppercased().contains("DELAYED")

        return Button {
            model.openChart(symbol: sym)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: ExploreMetrics.cardBadgeToName) {
                    LogoCircle(
                        symbol: sym,
                        colorHex: row?.col,
                        size: ExploreMetrics.cardBadge,
                        nameForInitial: name,
                        market: row?.sec
                    )
                    Text(name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if isDelayed {
                        Text("D")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Theme.delayed)
                            .accessibilityLabel(L10n.t("Delayed", model.lang))
                    }
                }
                .frame(height: ExploreMetrics.cardBadge)

                // Price ink top lands ≈28.7 pt below the card top; the unit suffix rides the
                // same baseline in the SAME `Theme.text`, deliberately not dimmed.
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(TVFormat.price(last))
                        .font(.system(size: 17, weight: .bold).monospacedDigit())
                        .foregroundStyle(Theme.text)
                    // The six majors on this rail are all USD-denominated; a mixed-currency
                    // rail would need a currency field on the manifest row first.
                    Text("USD")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(Theme.text)
                }
                .padding(.top, 4)

                // Change and its "today" qualifier are BOTH in the polarity colour.
                Text("\(TVFormat.change(change)) \(L10n.t("today", model.lang))")
                    .font(.system(size: 14, weight: .regular).monospacedDigit())
                    .foregroundStyle(TVFormat.changeColor(change))
                    .padding(.top, 2.5)

                // TV fills the rest of the card with an intraday area chart — teal/red
                // polarity line over a fading gradient, end-of-series dot (spec2-explore
                // §3.3). We deliberately ship none, and the reason is NOT a data gap: the
                // published `/api/intraday?sym=&tf=` route already returns `bars`
                // `[[epochSec,o,h,l,c,v], …]` for these symbols, so the series is one fetch
                // away. It is the *drawing* that is barred — a native price series is chart
                // rendering, which root AGENTS.md keeps in `terminal/` only. Shipping it
                // needs an explicit operator carve-out for "sparkline ≠ chart engine", not
                // a new endpoint. Until then the measured card height stands empty so the
                // two-row rhythm (§3.3) stays exact, and no fake series is drawn.
                Spacer(minLength: 0)
            }
            .padding(.leading, ExploreMetrics.cardContentInset)
            .frame(width: ExploreMetrics.cardWidth, height: ExploreMetrics.cardHeight, alignment: .topLeading)
            .contentShape(Rectangle())
            .overlay(alignment: .trailing) { ExploreColumnRule() }
        }
        .buttonStyle(TVPressStyle(.tile))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(TVFormat.price(last)), \(TVFormat.change(change))")
    }

    // MARK: - §3.4/§3.5 Top Stories

    /// Header at the §1.3 in-content section size, then an honest empty state: the news
    /// feed needs a published Terminal API (ledger bucket B) and one does not exist yet,
    /// so the structure ships and the content says so instead of faking rows.
    private var topStories: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                showsNotInAlpha = true
            } label: {
                HStack(spacing: ExploreMetrics.storiesChevronGap) {
                    Text(L10n.t("Top Stories", model.lang))
                        .font(TVType.sheetTitle)
                        .foregroundStyle(Theme.text)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.text)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(TVPressStyle(.glyph))
            .accessibilityAddTraits(.isHeader)

            Text(L10n.t("Top stories arrive in a later alpha.", model.lang))
                .font(TVType.rowSecondary)
                .foregroundStyle(Theme.text2)
                .padding(.top, TVSpace.s3)
        }
        .padding(.horizontal, TVSpace.s4)
        .tvReadableWidth()
    }
}

/// The vertical rule flanking each Explore index card: **1 device pixel** of `Theme.pill`,
/// soft-faded over ~8 pt at both ends. Dimmer, thinner and softer-edged than any documented
/// divider token, so it stays its own thing rather than being forced into `TVHairline`
/// (spec2-explore §3.3; exact sub-pixel width is open question B11).
private struct ExploreColumnRule: View {
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        let fade = ExploreMetrics.cardRuleFade / ExploreMetrics.cardHeight
        LinearGradient(
            stops: [
                .init(color: Theme.pill.opacity(0), location: 0),
                .init(color: Theme.pill, location: fade),
                .init(color: Theme.pill, location: 1 - fade),
                .init(color: Theme.pill.opacity(0), location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(width: 1 / max(displayScale, 1))
        .offset(x: ExploreMetrics.cardGutter / 2)
        .accessibilityHidden(true)
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
