import Foundation

// Shared auth contract for S5. The auth slice completes AuthService's
// implementation; the public surface below is frozen so cloud watchlist sync
// and search tracking can code against it in parallel. Every user transition
// (sign-in, sign-out, restore) must post `.mmAuthChanged`.

extension Notification.Name {
    static let mmAuthChanged = Notification.Name("mm.authChanged")
}

@MainActor
final class AuthService: ObservableObject {
    static let shared = AuthService()

    struct User: Equatable, Codable {
        let id: String
        let email: String
    }

    /// nil while signed out / in guest mode.
    @Published private(set) var user: User?

    /// Restore a persisted Keychain session at launch (no network on the hot path).
    func restore() {}

    func signIn(email: String, password: String) async throws {}

    func signOut() async {}

    /// A currently-valid Supabase access token, refreshing when close to
    /// expiry. nil = signed out; callers fall back to guest behavior.
    func validAccessToken() async -> String? { nil }
}
