import SwiftUI

// =====================================================================================
// Watchlist tab — rebuilt to the measured TradingView anatomy.
//
// Spec: docs/tv-parity/TV_PARITY_MASTER_SPEC.md §3.1 + §3.6, with content/interaction
// detail from docs/tv-parity/spec-watchlist.md and spec2-watchlist.md. Every metric
// below is a measurement from those documents, not a taste choice.
//
// Anatomy, top to bottom (absolute y in pt on the 402×874 reference device):
//   • toolbar row  y 67–96 : `•••` (glyph starts x 32) · brand mark (centred) · `+`
//     (right inset 19.3). All 21 pt, `Theme.text`.                              (§3.1.2)
//   • tab chips    y 110–143.7 : `TVChip`, 33.7 pt, 18 pt Bold, no uppercase,
//     16 pt leading inset, ellipsis truncation.                             (§3.1.3/§2.4)
//   • 1 px `#4A4A4A` under-tab rule, then the 20 pt block gap.            (§3.1.4/spec2 §2.1a)
//   • `TVSectionCaption` 13 pt Bold group header, 30 pt above / 27 pt below.  (§3.1.6)
//   • `TVSymbolRow.watchlist3` — ONE row that renders 60 pt / 2 lines and grows to
//     82 pt / 3 lines the moment an extended-hours quote exists (§3.6 D2). We have no
//     extended feed today, so every row is 60 pt — the growth path is live, not stubbed.
//   • `TVReorderHandle` — the 10.3 × 4 pt `#8C8C8C` dash 7 pt after the ticker, on EVERY
//     row (§3.6 item 8 / spec2 §3.1, D1).                                       (§2.6)
//   • 0.33 pt `#323235` dividers, left-inset 16, flush right.                (C20/§3.6 D3)
//   • centred `+ Add symbol` footer — the only centred row in the list.       (§3.1.10)
//
// Presentation only (root AGENTS.md): quotes come from `QuoteTicker`, membership from
// `WatchlistStore`, names from `ManifestStore`. Sorting is a view-level display
// transform — it never mutates the store, so "Customized order" always restores the
// user's real order and the cloud-sync seam never sees a phantom write.
// =====================================================================================

struct WatchlistScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @EnvironmentObject private var watchlists: WatchlistStore
    @ObservedObject private var sync = WatchlistSyncService.shared
    @StateObject private var ticker = QuoteTicker()

    @State private var preview: PreviewItem?
    @State private var newListPrompt = false
    @State private var newListName = ""
    @State private var confirmDeleteList = false
    @State private var menuOpen = false
    @State private var expanded: MenuBranch = .root
    @State private var sortField: WLSortField = .customized
    @State private var showsAlphaNotice = false

    /// The `•••` dropdown's accordion state — every branch expands **in place**, never as
    /// a stacked sheet (spec2 §4).
    private enum MenuBranch { case root, edit, sort, allLists }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                toolbar
                chipsBlock
                if sync.showsFailureHint { syncHint }
                rowsList
            }
            if menuOpen { dropdownOverlay }
        }
        .onAppear { ticker.start(symbols: watchlists.active.symbols) }
        .onDisappear { ticker.stop() }
        .onChange(of: watchlists.activeIndex) { _, _ in ticker.start(symbols: watchlists.active.symbols) }
        .onChange(of: watchlists.active.symbols) { _, syms in ticker.start(symbols: syms) }
        .sheet(item: $preview) { item in
            PreviewSheet(symbol: item.symbol) {
                preview = nil
                model.openChart(symbol: item.symbol)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.hidden)
        }
        .onAppear {
            // Headless screenshot hook: -mmPreview SYM opens the preview directly.
            let args = ProcessInfo.processInfo.arguments
            if let idx = args.firstIndex(of: "-mmPreview"), idx + 1 < args.count {
                preview = PreviewItem(symbol: args[idx + 1])
            }
        }
        .alert(L10n.t("New watchlist", model.lang), isPresented: $newListPrompt) {
            TextField(L10n.t("List name", model.lang), text: $newListName)
            Button(L10n.t("Create", model.lang)) {
                watchlists.createList(named: newListName)
                newListName = ""
            }
            Button(L10n.t("Cancel", model.lang), role: .cancel) { newListName = "" }
        }
        .confirmationDialog("\(L10n.t("Delete", model.lang)) “\(watchlists.active.name)”?",
                            isPresented: $confirmDeleteList, titleVisibility: .visible) {
            Button(L10n.t("Delete list", model.lang), role: .destructive) { watchlists.deleteActiveList() }
        }
        // The shared "pending feature" pattern (same copy as ChartScreen's blocked routes).
        .alert(Text(L10n.t("Not in this alpha", model.lang)), isPresented: $showsAlphaNotice) {
            Button(L10n.t("OK", model.lang), role: .cancel) { }
        } message: {
            Text(L10n.t("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.", model.lang))
        }
    }

    // MARK: - Toolbar (§3.1.2)

    /// y 67–96 pt on the reference device: 8 pt below the safe-area top, 29 pt tall.
    /// The centred mark is absolutely centred (ZStack), so an odd-width `•••`/`+` pair
    /// can never nudge it off-centre.
    private var toolbar: some View {
        ZStack {
            WLBrandMark()
                .frame(width: 29, height: 14)
            HStack(spacing: 0) {
                Button {
                    openMenu()
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 21, weight: .regular))
                        .foregroundStyle(Theme.text)
                        .frame(width: 44, height: 29, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, 32)
                .accessibilityLabel(L10n.t("More", model.lang))
                Spacer(minLength: TVSpace.s2)
                Button {
                    model.searchMode = .add
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 21, weight: .regular))
                        .foregroundStyle(Theme.text)
                        .frame(width: 44, height: 29, alignment: .trailing)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, 19.3)
                .accessibilityLabel(L10n.t("Add symbol", model.lang))
            }
        }
        .frame(height: 29)
        .padding(.top, 8)
    }

    // MARK: - List chips (§3.1.3)

    /// 14 pt below the toolbar row puts the capsules at y 110–143.7; the bold `#4A4A4A`
    /// rule under the tab strip is spec2 §2.1a's "under-tab hairline".
    private var chipsBlock: some View {
        VStack(spacing: 0) {
            TVChipRow(
                titles: watchlists.lists.map(\.name),
                selectedIndex: watchlists.activeIndex,
                onSelect: { watchlists.activeIndex = $0 }
            )
            .padding(.top, 14)
            .padding(.bottom, TVSpace.s2)
            TVHairline(weight: .hair, tone: .structural)
        }
    }

    /// Signed-in-only, silent-failure hint. No retry button: the next foreground, auth
    /// change, or list edit re-runs the reconcile on its own.
    private var syncHint: some View {
        VStack(spacing: 0) {
            Text(L10n.t("Sync failed — changes are saved on this device.", model.lang))
                .font(TVType.rowTertiary)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, TVSymbolRowMetrics.leftInset)
                .padding(.vertical, 6)
            TVHairline(weight: .hair, tone: .list, leadingInset: TVSymbolRowMetrics.leftInset)
        }
    }

    // MARK: - Rows

    /// The display order. `Customized order` is the store's own order; every other field
    /// is a pure view-level transform (§3.6 / spec2 §2.3).
    private var displayedSymbols: [String] {
        sorted(watchlists.active.symbols)
    }

    private var rowsList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if !watchlists.active.symbols.isEmpty {
                    // §3.1.6 — a watchlist is a stack of named groups. We ship one group
                    // per list today (user-authored sections are spec2 §3.6.5, not this
                    // wave), so the caption carries the active list's name.
                    TVSectionCaption(
                        text: watchlists.active.name,
                        size: .watchlist,
                        inset: TVSymbolRowMetrics.leftInset
                    )
                }
                ForEach(displayedSymbols, id: \.self) { sym in
                    symbolRow(sym)
                    TVHairline(weight: .hair, tone: .list, leadingInset: TVSymbolRowMetrics.leftInset)
                }
                if watchlists.active.symbols.isEmpty { emptyState }
                addSymbolFooter
            }
            .padding(.bottom, TVSpace.s6)
        }
    }

    private func symbolRow(_ sym: String) -> some View {
        let row = manifest.rows[sym]
        let quote = ticker.quotes[sym]
        let data = TVSymbolRowData(
            symbol: sym,
            name: manifest.displayName(sym, lang: model.lang),
            colorHex: row?.col,
            market: row?.sec,
            price: quote?.primaryPrice ?? row?.last,
            changePct: quote?.primaryChange ?? row?.chg,
            extPrice: quote?.extPrice,
            extChangePct: quote?.extChg,
            extSession: quote?.extSession,
            isDelayed: isDelayed(quote),
            // §3.6 item 8 / spec2 §3.1 (D1) — universal on watchlist rows: every captured
            // row carries it regardless of sign, asset class or flag state, so it is not
            // conditioned on anything. Its meaning (drag handle for `Customized order`) is
            // still the one open gesture question, §4-A19.
            showsReorderHandle: true
        )
        return Button {
            preview = PreviewItem(symbol: sym)
        } label: {
            // ONE row component: 60 pt / 2 lines today, 82 pt / 3 lines the moment the
            // quote lane carries an extended print (§3.6 D2).
            TVSymbolRow(data, variant: .watchlist3)
        }
        .buttonStyle(.plain)
        .contextMenu { rowMenu(sym) }
    }

    /// §3.1.9 — the orange `D` rides the row whenever the quote lane labels itself delayed.
    private func isDelayed(_ quote: QuoteTicker.Quote?) -> Bool {
        guard let basis = quote?.basis else { return false }
        return basis.localizedCaseInsensitiveContains("delay")
    }

    /// §3.6 item 3 — the long-press context menu, in TV's divider-separated groups.
    /// Flag / Trade / Add section above are out of this wave (see the delivery note).
    @ViewBuilder
    private func rowMenu(_ sym: String) -> some View {
        Section {
            Button {
                showsAlphaNotice = true
            } label: {
                Label(L10n.t("Add alert", model.lang), systemImage: "alarm")
            }
            Button {
                model.openChart(symbol: sym)
            } label: {
                Label(L10n.t("Open chart", model.lang), systemImage: "chart.xyaxis.line")
            }
            Button {
                preview = PreviewItem(symbol: sym)
            } label: {
                Label(L10n.t("Open symbol screen", model.lang), systemImage: "chart.bar.doc.horizontal")
            }
        }
        Section {
            // The manual-reorder action behind `Customized order` (§3.6 item 8 / D10).
            // TV's own gesture is a long-press drag off the row's dash handle, still
            // unconfirmed (§4-A19); an arbitrary move would also need a store API that
            // `WatchlistStore` does not expose yet (it has `moveToTop` and nothing else),
            // so long-press → Move to top is the reorder we can actually persist today.
            Button {
                watchlists.moveToTop(sym)
            } label: {
                Label(L10n.t("Move to top", model.lang), systemImage: "arrow.up.to.line")
            }
        }
        Section {
            Button(role: .destructive) {
                watchlists.remove(sym)
            } label: {
                Label(L10n.t("Remove", model.lang), systemImage: "trash")
            }
        }
    }

    /// §3.1.10 / spec-watchlist §3.7 — the only centred row in the list.
    private var addSymbolFooter: some View {
        Button {
            model.searchMode = .add
        } label: {
            HStack(spacing: 7) {
                Image(systemName: "plus")
                    .font(.system(size: 17, weight: .semibold))
                Text(L10n.t("Add symbol", model.lang))
                    .font(.system(size: 17, weight: .bold))
            }
            .foregroundStyle(Theme.text)
            .frame(maxWidth: .infinity)
            .frame(height: TVSymbolRowMetrics.symbolHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        VStack(spacing: TVSpace.s3) {
            Image(systemName: "list.bullet.rectangle")
                .font(.system(size: 30))
                .foregroundStyle(Theme.muted)
            Text(L10n.t("No symbols yet", model.lang))
                .font(TVType.rowSecondary)
                .foregroundStyle(Theme.text2)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 90)
        .padding(.bottom, TVSpace.s7)
    }

    // MARK: - `•••` dropdown (§3.6 item 1, spec2 §2.2/§3.2)

    private func openMenu() {
        expanded = .root
        withAnimation(.easeOut(duration: 0.12)) { menuOpen = true }
    }

    private func closeMenu() {
        withAnimation(.easeOut(duration: 0.12)) { menuOpen = false }
        expanded = .root
    }

    /// Compact popup anchored top-left over the dimmed list — card x 11.7, top y 103.3,
    /// width 250 (spec2 §2.2/§3.2).
    private var dropdownOverlay: some View {
        ZStack(alignment: .topLeading) {
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .onTapGesture { closeMenu() }
            dropdownCard
                .frame(width: WLPopup.width)
                .padding(.leading, 11.7)
                .padding(.top, 44.3)
        }
        .transition(.opacity)
    }

    @ViewBuilder
    private var dropdownCard: some View {
        VStack(spacing: 0) {
            switch expanded {
            case .root: rootMenu
            case .sort: sortBranch
            case .edit: editBranch
            case .allLists: allListsBranch
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.panel2, in: RoundedRectangle(cornerRadius: TVRadius.tile, style: .continuous))
    }

    @ViewBuilder
    private var rootMenu: some View {
        // Group labels are plain mixed-case `#9E9EA4`, deliberately NOT TVSectionCaption (D8).
        WLPopupGroupLabel(text: watchlists.active.name, height: 30)
        WLPopupDivider()
        WLPopupRow(title: L10n.t("Edit", model.lang), chevron: "chevron.right", icon: "pencil") {
            withAnimation(.easeOut(duration: 0.12)) { expanded = .edit }
        }
        WLPopupDivider()
        WLPopupRow(title: L10n.t("Sort by", model.lang), chevron: "chevron.right", icon: "arrow.down.arrow.up") {
            withAnimation(.easeOut(duration: 0.12)) { expanded = .sort }
        }
        WLPopupDivider()
        // Placeholder affordance: the news plane has no published per-watchlist API yet.
        WLPopupRow(title: L10n.t("News by watchlist", model.lang), icon: "doc.text") {
            closeMenu()
            showsAlphaNotice = true
        }
        // Section break is whitespace only — no divider (spec2 §2.2).
        WLPopupGroupLabel(text: L10n.t("Watchlists", model.lang), height: 37)
        WLPopupDivider()
        WLPopupRow(title: L10n.t("All watchlists", model.lang), chevron: "chevron.right", icon: "bookmark") {
            withAnimation(.easeOut(duration: 0.12)) { expanded = .allLists }
        }
        WLPopupDivider()
        WLPopupRow(title: L10n.t("Create new list", model.lang), icon: "plus") {
            closeMenu()
            newListPrompt = true
        }
    }

    /// Accordion, not a push (spec2 §4): the header row flips `›`→`⌄` and the option list
    /// replaces the card's body in place.
    @ViewBuilder
    private var sortBranch: some View {
        WLPopupRow(
            title: L10n.t("Sort by", model.lang),
            height: WLPopup.headerHeight,
            chevron: "chevron.down",
            icon: "arrow.down.arrow.up"
        ) {
            withAnimation(.easeOut(duration: 0.12)) { expanded = .root }
        }
        WLPopupDivider()
        ForEach(Array(WLSortField.allCases.enumerated()), id: \.element) { index, field in
            WLSortRow(
                field: field,
                title: L10n.t(field.title, model.lang),
                isActive: field == sortField
            ) {
                guard field.isSupported else { return }
                sortField = field
                closeMenu()
            }
            if index < WLSortField.allCases.count - 1 { WLPopupDivider() }
        }
    }

    /// List-level edits we actually own. `Edit` is TV's home for them; ours is a one-row
    /// branch until the store grows rename/reorder.
    @ViewBuilder
    private var editBranch: some View {
        WLPopupRow(
            title: L10n.t("Edit", model.lang),
            height: WLPopup.headerHeight,
            chevron: "chevron.down",
            icon: "pencil"
        ) {
            withAnimation(.easeOut(duration: 0.12)) { expanded = .root }
        }
        WLPopupDivider()
        WLPopupRow(
            title: L10n.t("Delete this list", model.lang),
            icon: "trash",
            isEnabled: watchlists.lists.count > 1,
            isDestructive: true
        ) {
            closeMenu()
            confirmDeleteList = true
        }
    }

    @ViewBuilder
    private var allListsBranch: some View {
        WLPopupRow(
            title: L10n.t("All watchlists", model.lang),
            height: WLPopup.headerHeight,
            chevron: "chevron.down",
            icon: "bookmark"
        ) {
            withAnimation(.easeOut(duration: 0.12)) { expanded = .root }
        }
        WLPopupDivider()
        ForEach(Array(watchlists.lists.enumerated()), id: \.offset) { index, list in
            WLPopupRow(
                title: list.name,
                icon: index == watchlists.activeIndex ? "checkmark" : nil
            ) {
                watchlists.activeIndex = index
                closeMenu()
            }
            if index < watchlists.lists.count - 1 { WLPopupDivider() }
        }
    }

    // MARK: - Local sort (presentation transform, never a store mutation)

    private func sorted(_ symbols: [String]) -> [String] {
        guard sortField.isSupported, sortField != .customized else { return symbols }
        if sortField == .symbol { return symbols.sorted { $0 < $1 } }
        return symbols.sorted { lhs, rhs in
            let a = metric(lhs)
            let b = metric(rhs)
            if let a, let b { return a == b ? lhs < rhs : a > b }
            if a != nil { return true }
            if b != nil { return false }
            return lhs < rhs
        }
    }

    /// The one numeric each sortable field reads. Everything here is already-published
    /// data (quote lane or manifest row) — no derivation, no analysis.
    private func metric(_ symbol: String) -> Double? {
        let quote = ticker.quotes[symbol]
        let row = manifest.rows[symbol]
        switch sortField {
        case .lastPrice: return quote?.primaryPrice ?? row?.last
        case .changePct: return quote?.primaryChange ?? row?.chg
        case .extendedHours: return quote?.extChg
        case .volume: return row?.vol
        default: return nil
        }
    }
}

// MARK: - Sort fields (spec2 §2.3 — TV's nine rows, in TV's order)

/// TV exposes nine sort fields. Four of them (`Change` in currency, `Flag`, `Market cap`)
/// have no published source in our data plane yet, so they ship as visible, correctly
/// styled, non-acting rows rather than being deleted from the menu — the structure is the
/// spec, the wiring follows the API.
enum WLSortField: CaseIterable, Hashable {
    case customized, symbol, lastPrice, change, changePct, flag, extendedHours, marketCap, volume

    /// English key; every one is wrapped in `L10n.t` at the call site.
    var title: String {
        switch self {
        case .customized: return "Customized order"
        case .symbol: return "Symbol"
        case .lastPrice: return "Last price"
        case .change: return "Change"
        case .changePct: return "Change (%)"
        case .flag: return "Flag"
        case .extendedHours: return "Extended hours"
        case .marketCap: return "Market cap"
        case .volume: return "Volume"
        }
    }

    var isSupported: Bool {
        switch self {
        case .change, .flag, .marketCap: return false
        default: return true
        }
    }

    /// The small type glyph TV pairs with the `↓` direction arrow: `A-Z` for Symbol,
    /// stacked lines for numerics, a flag for Flag (spec2 §2.3).
    var typeGlyph: String? {
        switch self {
        case .customized: return nil
        case .symbol: return "textformat.abc"
        case .flag: return "flag"
        default: return "line.3.horizontal"
        }
    }
}

// MARK: - Popup chrome (spec2 §3.2 — a 44 pt row token distinct from TVMenuRow's 60 pt)

/// Context-specific values the shared kit deliberately does not carry: spec2 D7/D8 record
/// that compact dropdown rows are *brighter* than sheet rows (`#F6F6F6` vs `Theme.text`)
/// and that their group labels are a plain mixed-case one-off, not `TVSectionCaption`.
/// Scoped to this file so nothing leaks into `Theme`/`TVKit`.
private enum WLPopup {
    /// Card width, left-anchored under the `•••` button.
    static let width: CGFloat = 250
    /// Standard action/option row.
    static let rowHeight: CGFloat = 44
    /// A row acting as its own accordion header.
    static let headerHeight: CGFloat = 55.7
    /// `Customized order` — the shorter, dimmer baseline row.
    static let baselineHeight: CGFloat = 33.3
    /// D7 — popup row labels are brighter than sheet rows.
    static let rowLabel = Color(hex: 0xF6F6F6)
    /// D8 — plain mixed-case menu group label.
    static let groupLabel = Color(hex: 0x9E9EA4)
    /// The dim tone `Customized order` renders in.
    static let baselineLabel = Color(hex: 0x747574)
    static let inset: CGFloat = 14
}

private struct WLPopupDivider: View {
    var body: some View {
        TVHairline(weight: .sheet, tone: .sheetRow)
    }
}

private struct WLPopupGroupLabel: View {
    let text: String
    var height: CGFloat

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(WLPopup.groupLabel)
            .lineLimit(1)
            .padding(.horizontal, WLPopup.inset)
            .frame(height: height, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// One dropdown row: optional leading accordion chevron · label · trailing semantic icon.
private struct WLPopupRow: View {
    let title: String
    var height: CGFloat = WLPopup.rowHeight
    var chevron: String?
    var icon: String?
    var isEnabled = true
    var isDestructive = false
    let action: () -> Void

    private var labelColor: Color {
        if isDestructive { return Theme.downFill }
        return isEnabled ? WLPopup.rowLabel : Theme.muted
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 0) {
                if let chevron {
                    Image(systemName: chevron)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.text2)
                        .frame(width: 14, alignment: .leading)
                        .padding(.trailing, TVSpace.s2)
                }
                Text(title)
                    .font(.system(size: 17))
                    .foregroundStyle(labelColor)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: TVSpace.s2)
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .regular))
                        .foregroundStyle(labelColor)
                }
            }
            .padding(.horizontal, WLPopup.inset)
            .frame(height: height)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

/// A Sort-by option row. `Customized order` is the odd one out by measurement: shorter
/// (33.3 pt), dimmer, and the only row with no trailing direction glyph (spec2 §2.3).
private struct WLSortRow: View {
    let field: WLSortField
    let title: String
    let isActive: Bool
    let action: () -> Void

    private var isBaseline: Bool { field == .customized }

    private var labelColor: Color {
        if isBaseline { return WLPopup.baselineLabel }
        return field.isSupported ? WLPopup.rowLabel : Theme.muted
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 0) {
                Text(title)
                    .font(.system(size: 17))
                    .foregroundStyle(labelColor)
                    .lineLimit(1)
                Spacer(minLength: TVSpace.s2)
                if let glyph = field.typeGlyph {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.down")
                        Image(systemName: glyph)
                    }
                    .font(.system(size: 13, weight: .regular))
                    // TV shows no active-sort marker (spec2 §6.3 open question); we brighten
                    // the applied field's glyph pair so a real, working sort has feedback.
                    .foregroundStyle(isActive ? Theme.text : Theme.text2)
                }
            }
            .padding(.horizontal, WLPopup.inset)
            .frame(height: isBaseline ? WLPopup.baselineHeight : WLPopup.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!field.isSupported)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}

// MARK: - Brand mark

/// The centred toolbar mark (§3.1.2). TV puts its flag logo here at ~29 × 14 pt; ours is
/// the Mastermind monogram drawn as a stroked path so it needs no asset-catalog entry and
/// stays crisp at any scale. Chrome only — nothing about it is data.
private struct WLBrandMark: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            Path { path in
                path.move(to: CGPoint(x: w * 0.05, y: h))
                path.addLine(to: CGPoint(x: w * 0.05, y: 0))
                path.addLine(to: CGPoint(x: w * 0.5, y: h * 0.72))
                path.addLine(to: CGPoint(x: w * 0.95, y: 0))
                path.addLine(to: CGPoint(x: w * 0.95, y: h))
            }
            .stroke(Theme.text, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}
