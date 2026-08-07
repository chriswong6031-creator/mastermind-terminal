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

    /// Tokens for the web view. Deliberately not `Codable`: this pair is handed to the
    /// page and then forgotten — only the native session is ever persisted.
    struct WebSession {
        let accessToken: String
        let refreshToken: String
    }

    enum AuthError: Error {
        /// The server answered and said no (bad password, revoked refresh token).
        /// Definitive — retrying the same input cannot succeed.
        case rejected
        /// Nobody answered, or the server broke. The session, if any, survives.
        case unavailable
    }

    /// nil while signed out / in guest mode.
    @Published private(set) var user: User?

    /// Set by `signIn`, consumed once by whichever web view becomes ready first.
    /// Memory only — see the token-family note on `signIn`.
    private(set) var pendingWebSession: WebSession?

    private var session: Session?
    /// Serializes refreshes: concurrent `validAccessToken()` callers await one grant,
    /// because two parallel refreshes of the same token revoke the whole family.
    private var refreshTask: Task<Session?, Never>?

    /// What the Keychain holds. `expiresAt` is a UNIX epoch, matching Supabase's field.
    private struct Session: Codable {
        let accessToken: String
        let refreshToken: String
        let expiresAt: Double
        let user: User
    }

    // MARK: - lifecycle

    /// Restore a persisted Keychain session at launch (no network on the hot path).
    func restore() {
        guard let data = KeychainStore.load(account: KeychainStore.sessionAccount),
              let stored = try? JSONDecoder().decode(Session.self, from: data) else { return }
        session = stored
        user = stored.user
        // An expired access token is fine here: validAccessToken() refreshes on first use.
        NotificationCenter.default.post(name: .mmAuthChanged, object: nil)
    }

    /// Two password grants, on purpose. Supabase rotates refresh tokens, so a token
    /// family used by two clients at once eventually double-rotates and the server
    /// revokes the family — signing the user out of both. Session A is persisted for
    /// native REST calls; session B exists only to hand the web view its own family.
    func signIn(email: String, password: String) async throws {
        let native = try await tokenGrant(
            grantType: "password",
            body: ["email": email, "password": password]
        )
        // Best effort: if the second grant fails we hand the web session A's tokens and
        // accept the collision risk above — a shared family beats no sign-in at all.
        let web = try? await tokenGrant(
            grantType: "password",
            body: ["email": email, "password": password]
        )
        let handoff = web ?? native

        persist(native)
        pendingWebSession = WebSession(accessToken: handoff.accessToken, refreshToken: handoff.refreshToken)
        user = native.user
        NotificationCenter.default.post(name: .mmAuthChanged, object: nil)
    }

    func signOut() async {
        if let session {
            // Best effort — a dead network must not strand the user in a signed-in UI.
            var request = authRequest(path: "logout", query: [URLQueryItem(name: "scope", value: "local")])
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }
        pendingWebSession = nil
        clearSession()
    }

    // MARK: - tokens

    /// A currently-valid Supabase access token, refreshing when close to
    /// expiry. nil = signed out; callers fall back to guest behavior.
    func validAccessToken() async -> String? {
        guard let session else { return nil }
        // 60s of slack so a token can't expire between this check and the request it authorizes.
        if Date().timeIntervalSince1970 < session.expiresAt - 60 { return session.accessToken }
        return await refresh()?.accessToken
    }

    /// The pending web handoff, cleared as it is read — a session may be handed to the
    /// page exactly once.
    func consumePendingWebSession() -> WebSession? {
        defer { pendingWebSession = nil }
        return pendingWebSession
    }

    /// Last-resort handoff for a signed-in launch whose web view has no auth cookie
    /// (cookies cleared, cookie expired). Shares the NATIVE token family with the page,
    /// so it is used only when the page would otherwise stay a guest.
    func fallbackWebSession() async -> WebSession? {
        guard await validAccessToken() != nil, let session else { return nil }
        return WebSession(accessToken: session.accessToken, refreshToken: session.refreshToken)
    }

    @discardableResult
    private func refresh() async -> Session? {
        if let refreshTask { return await refreshTask.value }
        guard let current = session else { return nil }
        let task = Task { [weak self] () -> Session? in
            guard let self else { return nil }
            defer { self.refreshTask = nil }
            do {
                let renewed = try await self.tokenGrant(
                    grantType: "refresh_token",
                    body: ["refresh_token": current.refreshToken]
                )
                // The rotated refresh token MUST be written: the old one is already dead.
                self.persist(renewed)
                return renewed
            } catch AuthError.rejected {
                // Family revoked or password changed elsewhere — back to guest.
                self.clearSession()
                return nil
            } catch {
                // Offline or a 5xx: keep the session and let the caller degrade for now.
                return nil
            }
        }
        refreshTask = task
        return await task.value
    }

    // MARK: - storage

    private func persist(_ session: Session) {
        self.session = session
        guard let data = try? JSONEncoder().encode(session) else { return }
        KeychainStore.save(data, account: KeychainStore.sessionAccount)
    }

    private func clearSession() {
        KeychainStore.delete(account: KeychainStore.sessionAccount)
        session = nil
        user = nil
        NotificationCenter.default.post(name: .mmAuthChanged, object: nil)
    }

    // MARK: - Supabase REST

    /// Both unwraps below are invariants, not optimism: the base is the static, compile-time
    /// `AppConfig.supabaseURL`, `path` is a literal at every call site, and `query` is
    /// percent-encoded by `URLComponents` on the way out — so neither the components nor the
    /// recomposed URL can be nil. Returning an optional here would push a `guard` into every
    /// caller to handle a case that cannot occur (SWEEP-FORCE-UNWRAP-002, P2 hygiene).
    private func authRequest(path: String, query: [URLQueryItem]) -> URLRequest {
        var components = URLComponents(
            url: AppConfig.supabaseURL.appendingPathComponent("auth/v1/\(path)"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = query
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    private func tokenGrant(grantType: String, body: [String: String]) async throws -> Session {
        var request = authRequest(path: "token", query: [URLQueryItem(name: "grant_type", value: grantType)])
        request.httpBody = try? JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw AuthError.unavailable
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            // 4xx is the server's verdict; 5xx and anything else is worth retrying.
            // The body is never surfaced or logged — it echoes the submitted email.
            throw (400..<500).contains(status) ? AuthError.rejected : AuthError.unavailable
        }
        guard let token = try? JSONDecoder().decode(TokenResponse.self, from: data),
              let email = token.user.email else { throw AuthError.unavailable }
        return Session(
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            // expires_at is authoritative when present; expires_in is the fallback.
            expiresAt: token.expiresAt ?? Date().timeIntervalSince1970 + (token.expiresIn ?? 3600),
            user: User(id: token.user.id, email: email)
        )
    }

    private struct TokenResponse: Decodable {
        let accessToken: String
        let refreshToken: String
        let expiresAt: Double?
        let expiresIn: Double?
        let user: SupabaseUser

        struct SupabaseUser: Decodable {
            let id: String
            let email: String?
        }

        private enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case refreshToken = "refresh_token"
            case expiresAt = "expires_at"
            case expiresIn = "expires_in"
            case user
        }
    }
}
