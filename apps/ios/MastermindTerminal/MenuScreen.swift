import SwiftUI

/// Menu tab, rebuilt to `docs/tv-parity/spec2-menu-settings.md` (master §3.7).
///
/// Anatomy, top → bottom: utility icon row (messages + settings, both placeholder
/// affordances per §4-A18) · profile card on `Theme.pill` `#2E2E2E` (C21 one-notch rule,
/// D1) · one `TVPromoCard` · 44 pt `TVAccountRow` list with 0.33 pt `#4A4A4A` dividers
/// (D2/D7), sections separated by whitespace alone · destructive Sign out in fill-red
/// `#F23645` (D5-menu). Page background is `tvBlack` full-bleed.
///
/// Presentation only. Every behavior here is the pre-existing wiring, restyled: auth
/// state from `AuthService`, sign-out through `auth.signOut()`, the sign-in path through
/// `model.showSignIn`, the language toggle bound straight to `model.lang`, and external
/// pages always handed to the system browser. No entitlement is computed natively — the
/// plan line points at the web, it does not claim a tier.
struct MenuScreen: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var auth: AuthService
    @Environment(\.openURL) private var openURL
    @State private var signingOut = false
    @State private var showAbout = false
    @State private var showAlphaNotice = false

    private var isSignedIn: Bool { auth.user != nil }

    /// The web billing surface is a section of the Terminal's Settings panel
    /// (`components/settings/SectionBilling.tsx`, mounted by `TerminalShell`), which has
    /// no deep link of its own — so "Manage subscription" opens the Terminal that hosts it.
    private var billingURL: URL { AppConfig.origin.appendingPathComponent("terminal") }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // §2: utility row sits directly under the status bar, no title alongside.
                    utilityRow
                    // §2: 25.3 pt from the utility ink to the profile card's top edge.
                    profileCard
                        .padding(.top, 25.3 - Metrics.iconHitPad)
                    // §2: 8 pt exactly — the profile card and the promo row are one block.
                    promoCard
                        .padding(.top, TVSpace.s2)
                    // §2: 44 pt of plain whitespace, no section caption, before the list.
                    accountSection
                        .padding(.top, 44)
                    if isSignedIn {
                        // §3.4: Sign out is its own section, ≈57 pt of whitespace above it.
                        signOutSection
                            .padding(.top, 57)
                    }
                }
                .padding(.bottom, TVSpace.s7)
            }
            .scrollIndicators(.hidden)
            .background(Theme.bg)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $showAbout) { aboutPage }
        }
        // Placeholder affordances use the app's existing "not in this alpha" notice.
        .alert(
            Text(L10n.t("Not in this alpha", model.lang)),
            isPresented: $showAlphaNotice
        ) {
            Button(L10n.t("OK", model.lang), role: .cancel) { showAlphaNotice = false }
        } message: {
            Text(L10n.t("That area of the Terminal isn't part of the app alpha yet. It remains available on the website.", model.lang))
        }
    }

    // MARK: - §3.1 utility icon row

    /// Two bare icon buttons, right-aligned inside the 20 pt margin: 18.7 pt message
    /// bubble, then a 38.7 pt gap, then the 20 × 17.3 pt settings glyph (TV's stylised
    /// "nut" — a hexagon outline with an inset circle, deliberately not a gear).
    /// Both are placeholder affordances: their targets are unphotographed and unbuilt.
    private var utilityRow: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            utilityButton(label: L10n.t("Messages", model.lang)) {
                Image(systemName: "bubble.left")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 18.7, height: 18.7)
            }
            .accessibilityIdentifier("menu-messages")
            // Ink-to-ink gap 38.7 pt, less the two 12 pt hit-target pads.
            Spacer().frame(width: 38.7 - Metrics.iconHitPad * 2)
            utilityButton(label: L10n.t("Settings", model.lang)) {
                settingsGlyph
            }
            .accessibilityIdentifier("menu-settings")
        }
        // 20 pt from the screen edge to the gear's ink, less the hit-target pad.
        .padding(.trailing, TVSpace.s5 - Metrics.iconHitPad)
    }

    private func utilityButton<Glyph: View>(
        label: String,
        @ViewBuilder glyph: () -> Glyph
    ) -> some View {
        Button { showAlphaNotice = true } label: {
            glyph()
                .foregroundStyle(Theme.text)
                // Ink stays at the measured size; the pad only grows the tap target.
                .padding(Metrics.iconHitPad)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var settingsGlyph: some View {
        ZStack {
            Image(systemName: "hexagon")
                .resizable()
                .scaledToFit()
            Circle()
                .stroke(Theme.text, lineWidth: 1.4)
                .frame(width: 5.3, height: 5.3)
        }
        .frame(width: 20, height: 17.3)
    }

    // MARK: - §3.2 profile card

    /// Signed in: 46 pt avatar with the account initial, the email as the display name in
    /// **pure white** (the documented C13 exception, D3), and a plan line. Guest: the same
    /// card shape with "Guest", the sync subtitle, and a whole-card chevron — the entire
    /// card is the sign-in target, mirroring TV's whole-card affordance.
    @ViewBuilder
    private var profileCard: some View {
        if isSignedIn {
            profileCardBody
        } else {
            Button { model.showSignIn = true } label: {
                profileCardBody
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.text2)
                            // §3.2: 22.4 pt below the card top, 25.3 pt in from its right edge.
                            .padding(.top, 22.4)
                            .padding(.trailing, 25.3 + TVSpace.s4)
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L10n.t("Sign in", model.lang))
        }
    }

    private var profileCardBody: some View {
        HStack(spacing: 17) {
            avatar
            VStack(alignment: .leading, spacing: 9.6) {
                Text(isSignedIn ? (auth.user?.email ?? "") : L10n.t("Guest", model.lang))
                    // §3.2 / D3: 18 pt Bold, flat #FFFFFF — the one pure-white text slot.
                    .font(TVType.navTitle)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(isSignedIn
                     ? L10n.t("Plan managed on the web", model.lang)
                     : L10n.t("Sign in to sync your watchlists", model.lang))
                    .font(TVType.rowSecondary)
                    .foregroundStyle(Theme.text2)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: TVSpace.s2)
        }
        .padding(TVSpace.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.pill, in: RoundedRectangle(cornerRadius: TVRadius.tile, style: .continuous))
        .padding(.horizontal, TVSpace.s4)
        .accessibilityIdentifier("menu-profile-card")
    }

    /// §3.2: 46 × 46 pt, r ≈ 8 pt (softer than the card's own 12), flat `#666080` — a
    /// placeholder fill, not a semantic token.
    private var avatar: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(Color(hex: 0x666080))
            .frame(width: 46, height: 46)
            .overlay {
                if let initial = accountInitial {
                    Text(initial)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    Image(systemName: "person.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.white)
                }
            }
            .accessibilityHidden(true)
    }

    private var accountInitial: String? {
        guard let letter = auth.user?.email.first(where: { $0.isLetter || $0.isNumber }) else { return nil }
        return String(letter).uppercased()
    }

    // MARK: - §3.3 promo card

    /// Signed in → the web billing surface; guest → account creation on the marketing
    /// site. Both open in the system browser, as every external page in this app does.
    private var promoCard: some View {
        TVPromoCard(
            icon: isSignedIn ? "creditcard" : "person.crop.circle.badge.plus",
            //            "Plans and pricing on the web"
            title: isSignedIn
                ? L10n.t("Manage subscription", model.lang)
                : L10n.t("Create account", model.lang),
            subtitle: isSignedIn
                ? L10n.t("Plans and billing on the web", model.lang)
                : L10n.t("Plans and pricing on the web", model.lang)
        ) {
            openURL(isSignedIn ? billingURL : AppConfig.signUpURL)
        }
        .padding(.horizontal, TVSpace.s4)
        .accessibilityIdentifier("menu-promo-card")
    }

    // MARK: - §3.4 account list

    private var accountSection: some View {
        VStack(spacing: 0) {
            languageRow
            divider
            TVAccountRow(
                icon: "questionmark.circle",
                title: L10n.t("Help Center", model.lang)
            ) {
                openURL(AppConfig.origin)
            }
            .accessibilityIdentifier("menu-help-center")
            divider
            TVAccountRow(
                icon: "info.circle",
                title: L10n.t("About", model.lang),
                showsChevron: true
            ) {
                showAbout = true
            }
            .accessibilityIdentifier("menu-about")
            divider
        }
    }

    private var signOutSection: some View {
        VStack(spacing: 0) {
            TVAccountRow(
                icon: "rectangle.portrait.and.arrow.right",
                title: L10n.t("Sign out", model.lang),
                isDestructive: true
            ) {
                guard !signingOut else { return }
                signingOut = true
                Task {
                    await auth.signOut()
                    signingOut = false
                }
            }
            .opacity(signingOut ? 0.5 : 1)
            .accessibilityIdentifier("menu-sign-out")
            divider
        }
    }

    /// §3.4 / D2: a true single device pixel in `#4A4A4A`, left-inset to the label column.
    private var divider: some View {
        TVHairline(leadingInset: TVAccountRow.dividerInset)
    }

    /// `TVAccountRow`'s metrics with a trailing control instead of a chevron — the row is
    /// the language switch itself, so it keeps the segmented EN/中文 picker.
    private var languageRow: some View {
        HStack(spacing: 0) {
            Image(systemName: "globe")
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(Theme.text)
                .frame(width: 20, height: 20)
                .padding(.leading, TVSpace.s5)
            Text(L10n.t("Language", model.lang))
                .font(TVType.rowPrimaryMenu)
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .padding(.leading, 15.3)
            Spacer(minLength: TVSpace.s2)
            // Bound straight to model.lang, which persists itself under "mm.lang".
            Picker("", selection: $model.lang) {
                Text("EN").tag("en")
                Text("中文").tag("zh")
            }
            .pickerStyle(.segmented)
            .frame(width: 118)
            .padding(.trailing, TVSpace.s5)
        }
        .frame(height: TVAccountRow.height)
        .accessibilityIdentifier("menu-language")
    }

    // MARK: - About (§3.4 "About" push target)

    /// Version, bridge revision, and the Logo.dev attribution the image CDN requires —
    /// the attribution is a licence term, so it stays visible and tappable.
    private var aboutPage: some View {
        ScrollView {
            VStack(spacing: 0) {
                TVStatRow(
                    label: L10n.t("Version", model.lang),
                    value: "\(AppConfig.marketingVersion) alpha"
                )
                TVHairline(leadingInset: TVSpace.s4)
                TVStatRow(
                    label: L10n.t("Bridge", model.lang),
                    value: "v\(AppConfig.bridgeVersion)"
                )
                TVHairline(leadingInset: TVSpace.s4)
                Button {
                    openURL(URL(string: "https://logo.dev")!)
                } label: {
                    HStack(spacing: TVSpace.s2) {
                        Text(L10n.t("Logos provided by Logo.dev", model.lang))
                            .font(TVType.rowSecondary)
                            .foregroundStyle(Theme.text2)
                        Spacer(minLength: TVSpace.s2)
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.text2)
                    }
                    .padding(.horizontal, TVSpace.s4)
                    .frame(height: TVAccountRow.height)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("about-logo-attribution")
            }
            .padding(.top, TVSpace.s2)
        }
        .scrollIndicators(.hidden)
        .background(Theme.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // C22 tier 3: pushed pages carry an 18 pt Bold compact title.
            ToolbarItem(placement: .principal) {
                Text(L10n.t("About", model.lang))
                    .font(TVType.navTitle)
                    .foregroundStyle(Theme.text)
            }
        }
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }

    private enum Metrics {
        /// Grows the 18.7–20 pt utility glyphs to a ~43 pt tap target without moving the ink.
        static let iconHitPad: CGFloat = 12
    }
}
