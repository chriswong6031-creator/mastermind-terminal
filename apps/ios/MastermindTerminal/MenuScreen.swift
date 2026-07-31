import SwiftUI

/// Menu tab, S2 scope: about/version/links. S5 adds the account card (native
/// Supabase sign-in + session handoff) and the EN/中文 language toggle.
struct MenuScreen: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle")
                            .font(.title2)
                            .foregroundStyle(Theme.muted)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Guest")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Theme.text)
                            Text("Sign-in arrives in the next alpha build")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 2)
                    .listRowBackground(Theme.panel)
                }

                Section {
                    Button {
                        openURL(AppConfig.origin)
                    } label: {
                        HStack {
                            Label("Open the web Terminal", systemImage: "safari")
                                .foregroundStyle(Theme.text)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    .listRowBackground(Theme.panel)
                } footer: {
                    Text("External pages always open in the system browser.")
                        .foregroundStyle(Theme.muted)
                }

                Section {
                    HStack {
                        Text("Version")
                            .foregroundStyle(Theme.text)
                        Spacer()
                        Text("\(AppConfig.marketingVersion) alpha")
                            .foregroundStyle(Theme.muted)
                    }
                    .listRowBackground(Theme.panel)
                    HStack {
                        Text("Bridge")
                            .foregroundStyle(Theme.text)
                        Spacer()
                        Text("v\(AppConfig.bridgeVersion)")
                            .foregroundStyle(Theme.muted)
                    }
                    .listRowBackground(Theme.panel)
                } header: {
                    Text("About")
                        .foregroundStyle(Theme.muted)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Menu")
        }
    }
}
