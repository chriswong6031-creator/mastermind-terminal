import SwiftUI

/// Sign-in sheet. Optional by design: dismissing it leaves every tab fully usable as a
/// guest, so nothing here may block the app. Account creation and password recovery
/// live on the website — the app authenticates, it does not manage accounts.
struct SignInScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var auth: AuthService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var errorText: String?
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    private var canSubmit: Bool {
        !busy && email.contains("@") && !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(L10n.t("Sign in", model.lang))
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(Theme.text)
                        .padding(.bottom, 6)

                    field(
                        title: L10n.t("Email", model.lang),
                        content: TextField("", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.next)
                            .focused($focused, equals: .email)
                            .onSubmit { focused = .password }
                    )

                    field(
                        title: L10n.t("Password", model.lang),
                        content: SecureField("", text: $password)
                            .textContentType(.password)
                            .submitLabel(.go)
                            .focused($focused, equals: .password)
                            .onSubmit { submit() }
                    )

                    if let errorText {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .font(.caption)
                            Text(errorText)
                                .font(.footnote)
                        }
                        .foregroundStyle(Theme.down)
                        .transition(.opacity)
                    }

                    Button(action: submit) {
                        Text(busy ? L10n.t("Signing in…", model.lang) : L10n.t("Sign in", model.lang))
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(canSubmit ? Theme.brand : Theme.panel3, in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(canSubmit ? .white : Theme.muted)
                    }
                    .disabled(!canSubmit)
                    .padding(.top, 4)

                    Button {
                        openURL(AppConfig.signUpURL)
                    } label: {
                        Text(L10n.t("Create account", model.lang))
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.brand2)
                            .frame(maxWidth: .infinity)
                    }
                    .padding(.top, 2)

                    Text(L10n.t("Signing in is optional — the app works as a guest.", model.lang))
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 10)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
            .background(Theme.bg.ignoresSafeArea())
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                    }
                    .accessibilityLabel(L10n.t("Cancel", model.lang))
                }
            }
            .toolbarBackground(Theme.bg, for: .navigationBar)
        }
        .presentationBackground(Theme.bg)
        .onAppear { focused = .email }
    }

    private func field(title: String, content: some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
            content
                .foregroundStyle(Theme.text)
                .tint(Theme.brand2)
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private func submit() {
        guard canSubmit else { return }
        busy = true
        errorText = nil
        focused = nil
        Task {
            do {
                try await auth.signIn(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password
                )
                busy = false
                dismiss()
            } catch AuthService.AuthError.unavailable {
                errorText = L10n.t("Couldn't reach the server. Check your connection.", model.lang)
                busy = false
            } catch {
                // Deliberately generic: never confirm whether an email is registered.
                errorText = L10n.t("Check your email or password.", model.lang)
                busy = false
            }
        }
    }
}
