import SwiftUI

/// Watchlist tab, S2 scope: the guest seed rendered natively with tap→chart.
/// S3 replaces the static seed with real lists + quotes (Supabase when signed in,
/// local lists for guests) and adds search / add / remove.
struct WatchlistScreen: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(AppConfig.guestWatchlist, id: \.symbol) { item in
                        Button {
                            model.openChart(symbol: item.symbol)
                        } label: {
                            HStack(spacing: 12) {
                                SymbolBadge(symbol: item.symbol)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.symbol)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Theme.text)
                                    Text(item.name)
                                        .font(.caption)
                                        .foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                if model.symbol == item.symbol {
                                    Image(systemName: "chart.xyaxis.line")
                                        .font(.footnote)
                                        .foregroundStyle(Theme.brand2)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                        .listRowBackground(Theme.panel)
                    }
                } header: {
                    Text("Default")
                        .foregroundStyle(Theme.muted)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Watchlist")
        }
    }
}

struct SymbolBadge: View {
    let symbol: String

    var body: some View {
        Text(String(symbol.prefix(1)))
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 32, height: 32)
            .background(Theme.panel3, in: Circle())
            .overlay(Circle().strokeBorder(Theme.line, lineWidth: 1))
    }
}
