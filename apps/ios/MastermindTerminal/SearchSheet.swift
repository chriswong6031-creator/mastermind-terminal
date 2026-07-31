import SwiftUI

/// Full-screen symbol search, TV anatomy: search field + Close, category chips
/// (All / Equities / Crypto / …), result rows with logo · symbol · name on the left
/// and category · add-toggle on the right. Empty query = recents, or a category
/// BROWSE when a chip is active (search-row law: never an empty pane).
struct SearchSheet: View {
    enum Mode { case go, add }
    let mode: Mode

    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var manifest: ManifestStore
    @EnvironmentObject private var watchlists: WatchlistStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var category: String?
    @FocusState private var fieldFocused: Bool
    @AppStorage("mm.recents.v1") private var recentsRaw = ""

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            chips
            Hairline()
            resultsList
        }
        .background(Theme.bg.ignoresSafeArea())
        .onAppear { fieldFocused = true }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.muted)
                TextField("Search symbols", text: $query)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.text)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($fieldFocused)
            }
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 10))
            Button("Close") { dismiss() }
                .font(.system(size: 15))
                .foregroundStyle(Theme.text)
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 10)
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(nil, label: "All")
                ForEach(manifest.categories, id: \.self) { cat in
                    chip(cat, label: cat)
                }
            }
            .padding(.horizontal, 14)
        }
        .padding(.bottom, 10)
    }

    private func chip(_ value: String?, label: String) -> some View {
        Button {
            category = value
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(category == value ? Theme.bg : Theme.text2)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(category == value ? Theme.text : Theme.panel2, in: Capsule())
        }
    }

    private var results: [String] {
        let q = query.trimmingCharacters(in: .whitespaces)
        if q.isEmpty && category == nil {
            // Idle default, TV-style: recents first, else the user's own list — never an
            // alphabetical wall of the whole universe.
            let recents = recentsRaw.split(separator: ",").map(String.init).filter { manifest.rows[$0] != nil }
            return recents.isEmpty ? watchlists.active.symbols : recents
        }
        return manifest.search(query: q, category: category, lang: model.lang)
    }

    private var resultsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if query.isEmpty && category == nil && !recentsRaw.isEmpty {
                    HStack {
                        Text("Recent")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.muted)
                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                }
                ForEach(results, id: \.self) { sym in
                    let row = manifest.rows[sym]
                    let name = manifest.displayName(sym, lang: model.lang)
                    HStack(spacing: 12) {
                        LogoCircle(symbol: sym, colorHex: row?.col, size: 32, nameForInitial: name)
                        SymbolTitle(symbol: sym, name: name)
                        Spacer(minLength: 8)
                        Text(row?.sec ?? "")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.muted)
                        addButton(sym)
                    }
                    .padding(.horizontal, 14)
                    .frame(height: 56)
                    .contentShape(Rectangle())
                    .onTapGesture { pick(sym) }
                    Hairline().padding(.leading, 58)
                }
            }
        }
        .scrollDismissesKeyboard(.immediately)
    }

    private func addButton(_ sym: String) -> some View {
        Button {
            watchlists.toggle(sym)
        } label: {
            Image(systemName: watchlists.contains(sym) ? "checkmark" : "plus")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(watchlists.contains(sym) ? Theme.up : Theme.text2)
                .frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
    }

    private func pick(_ sym: String) {
        recordRecent(sym)
        switch mode {
        case .go:
            model.openChart(symbol: sym)
            dismiss()
        case .add:
            watchlists.toggle(sym)
        }
    }

    private func recordRecent(_ sym: String) {
        var recents = recentsRaw.split(separator: ",").map(String.init).filter { $0 != sym }
        recents.insert(sym, at: 0)
        recentsRaw = recents.prefix(8).joined(separator: ",")
    }
}
