import SwiftUI

/// Menu tab: the account card (native Supabase sign-in + session handoff), the EN/中文
/// language toggle, and about/version/links. Signing in is optional throughout — the
/// signed-out card is a normal state, not an error.
struct MenuScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var auth: AuthService
    @Environment(\.openURL) private var openURL
    @State private var signingOut = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    accountCard
                        .padding(.vertical, 2)
                        .listRowBackground(Theme.panel)
                } header: {
                    Text(L10n.t("Account", model.lang))
                        .foregroundStyle(Theme.muted)
                }

                Section {
                    HStack {
                        Text(L10n.t("Language", model.lang))
                            .foregroundStyle(Theme.text)
                        Spacer()
                        // Bound straight to model.lang, which persists itself under "mm.lang".
                        Picker("", selection: $model.lang) {
                            Text("EN").tag("en")
                            Text("中文").tag("zh")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 140)
                    }
                    .listRowBackground(Theme.panel)
                }

                Section {
                    Button {
                        openURL(AppConfig.origin)
                    } label: {
                        HStack {
                            Label(L10n.t("Open the web Terminal", model.lang), systemImage: "safari")
                                .foregroundStyle(Theme.text)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                    .listRowBackground(Theme.panel)
                } footer: {
                    Text(L10n.t("External pages always open in the system browser.", model.lang))
                        .foregroundStyle(Theme.muted)
                }

                Section {
                    HStack {
                        Text(L10n.t("Version", model.lang))
                            .foregroundStyle(Theme.text)
                        Spacer()
                        Text("\(AppConfig.marketingVersion) alpha")
                            .foregroundStyle(Theme.muted)
                    }
                    .listRowBackground(Theme.panel)
                    HStack {
                        Text(L10n.t("Bridge", model.lang))
                            .foregroundStyle(Theme.text)
                        Spacer()
                        Text("v\(AppConfig.bridgeVersion)")
                            .foregroundStyle(Theme.muted)
                    }
                    .listRowBackground(Theme.panel)
                    // Required attribution for the logo image CDN (same as the web terminal).
                    Button {
                        openURL(URL(string: "https://logo.dev")!)
                    } label: {
                        Text(L10n.t("Logos provided by Logo.dev", model.lang))
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                    }
                    .listRowBackground(Theme.panel)
                } header: {
                    Text(L10n.t("About", model.lang))
                        .foregroundStyle(Theme.muted)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle(L10n.t("Menu", model.lang))
        }
    }

    @ViewBuilder
    private var accountCard: some View {
        HStack(spacing: 12) {
            Image(systemName: auth.user == nil ? "person.crop.circle" : "person.crop.circle.fill.badge.checkmark")
                .font(.title2)
                .foregroundStyle(auth.user == nil ? Theme.muted : Theme.brand2)
            VStack(alignment: .leading, spacing: 2) {
                Text(auth.user?.email ?? L10n.t("Guest", model.lang))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(auth.user == nil
                     ? L10n.t("Sign in to sync your watchlists", model.lang)
                     : L10n.t("Signed in", model.lang))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            if auth.user == nil {
                Button {
                    model.showSignIn = true
                } label: {
                    Text(L10n.t("Sign in", model.lang))
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Theme.brand, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    signingOut = true
                    Task {
                        await auth.signOut()
                        signingOut = false
                    }
                } label: {
                    Text(L10n.t("Sign out", model.lang))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.down)
                }
                .buttonStyle(.plain)
                .disabled(signingOut)
            }
        }
    }
}
