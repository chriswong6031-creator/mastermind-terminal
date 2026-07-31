import SwiftUI

/// Markets tab, S2 scope: structure only. S4 fills the index strip with live cards
/// and pushes shell-mode web screens for Discover and Analysis.
struct MarketsScreen: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    PlaceholderRow(icon: "square.grid.2x2", title: "Discover", detail: "Screeners & heatmap — arriving in this alpha")
                    PlaceholderRow(icon: "brain.head.profile", title: "Analysis", detail: "Research desk — arriving in this alpha")
                } header: {
                    Text("Explore")
                        .foregroundStyle(Theme.muted)
                } footer: {
                    Text("Index cards and market movers land in the next alpha build.")
                        .foregroundStyle(Theme.muted)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Markets")
        }
    }
}

struct PlaceholderRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
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
        }
        .padding(.vertical, 2)
        .listRowBackground(Theme.panel)
    }
}
