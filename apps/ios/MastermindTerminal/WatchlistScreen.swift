import SwiftUI

/// Watchlist tab, TV anatomy: header (⋯ · list name · +), named-list chips, then
/// flat full-bleed quote rows — logo, symbol + one-language name, price over signed
/// change%. Tap opens the chart; long-press gets the row context menu.
struct WatchlistScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @EnvironmentObject private var watchlists: WatchlistStore
    @StateObject private var ticker = QuoteTicker()
    @State private var newListPrompt = false
    @State private var newListName = ""
    @State private var confirmDeleteList = false
    @State private var preview: PreviewItem?

    var body: some View {
        VStack(spacing: 0) {
            header
            ListChipsRow(
                names: watchlists.lists.map(\.name),
                activeIndex: watchlists.activeIndex,
                onPick: { watchlists.activeIndex = $0 }
            )
            .padding(.bottom, 8)
            Hairline()
            rowsList
        }
        .background(Theme.bg.ignoresSafeArea())
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
        .alert("New watchlist", isPresented: $newListPrompt) {
            TextField("List name", text: $newListName)
            Button("Create") {
                watchlists.createList(named: newListName)
                newListName = ""
            }
            Button("Cancel", role: .cancel) { newListName = "" }
        }
        .confirmationDialog("Delete “\(watchlists.active.name)”?", isPresented: $confirmDeleteList, titleVisibility: .visible) {
            Button("Delete list", role: .destructive) { watchlists.deleteActiveList() }
        }
    }

    private var header: some View {
        HStack {
            Menu {
                Button { newListPrompt = true } label: { Label("New list", systemImage: "plus.rectangle.on.rectangle") }
                if watchlists.lists.count > 1 {
                    Button(role: .destructive) { confirmDeleteList = true } label: { Label("Delete this list", systemImage: "trash") }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.text2)
                    .frame(width: 40, height: 36)
            }
            Spacer()
            Text(watchlists.active.name.uppercased())
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.text)
            Spacer()
            Button {
                model.searchMode = .add
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.text)
                    .frame(width: 40, height: 36)
            }
        }
        .padding(.horizontal, 6)
        .padding(.top, 4)
        .padding(.bottom, 2)
    }

    private var rowsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(watchlists.active.symbols, id: \.self) { sym in
                    let row = manifest.rows[sym]
                    let quote = ticker.quotes[sym]
                    Button {
                        preview = PreviewItem(symbol: sym)
                    } label: {
                        let name = manifest.displayName(sym, lang: model.lang)
                        HStack(spacing: 12) {
                            LogoCircle(symbol: sym, colorHex: row?.col, nameForInitial: name, market: row?.sec)
                            SymbolTitle(symbol: sym, name: name)
                            Spacer(minLength: 8)
                            if model.symbol == sym {
                                Image(systemName: "chart.xyaxis.line")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.brand2)
                            }
                            PriceStack(last: quote?.last ?? row?.last, chgPct: quote?.chg ?? row?.chg)
                        }
                        .padding(.horizontal, 14)
                        .frame(height: 62)
                        .contentShape(Rectangle())
                    }
                    .contextMenu {
                        Button { model.openChart(symbol: sym) } label: { Label("Open chart", systemImage: "chart.xyaxis.line") }
                        Button { watchlists.moveToTop(sym) } label: { Label("Move to top", systemImage: "arrow.up.to.line") }
                        Button(role: .destructive) { watchlists.remove(sym) } label: { Label("Remove", systemImage: "trash") }
                    }
                    Hairline().padding(.leading, 60)
                }
            }
        }
        .overlay {
            if watchlists.active.symbols.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "list.bullet.rectangle")
                        .font(.system(size: 30))
                        .foregroundStyle(Theme.muted)
                    Text("No symbols yet")
                        .font(.subheadline)
                        .foregroundStyle(Theme.text2)
                    Button("Add symbols") { model.searchMode = .add }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.brand2)
                }
            }
        }
    }
}
