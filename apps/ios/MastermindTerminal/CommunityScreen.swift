import SwiftUI

/// Community tab — TV's fourth tab (§1.10). The entire surface is unspecified: it has
/// **zero** captures in either corpus (§4-A16), and the master spec's own build order
/// says to ship it as a placeholder pending screenshots or a mirroring session.
///
/// So this is a placeholder by instruction, not by omission. It is styled to the law it
/// can be held to: §1.2 rule 1 — a full-screen page that keeps the 5-tab bar visible is
/// pure `Theme.bg`, with `Theme.text` for the title and `Theme.text2` for the body copy
/// (§1.1; TradingView uses no pure white for text, C13).
struct CommunityScreen: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: TVSpace.s3) {
                // The tab's own glyph, per §1.10's Community entry.
                Image(systemName: "person.2")
                    .font(.system(size: 34, weight: .regular))
                    .foregroundStyle(Theme.text2)
                    .accessibilityHidden(true)

                Text(L10n.t("Community", model.lang))
                    .font(TVType.sheetTitle)
                    .foregroundStyle(Theme.text)
                    .accessibilityAddTraits(.isHeader)

                Text(L10n.t("Community arrives in a later alpha.", model.lang))
                    .font(TVType.rowSecondary)
                    .foregroundStyle(Theme.text2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, TVSpace.s5)
        }
    }
}
