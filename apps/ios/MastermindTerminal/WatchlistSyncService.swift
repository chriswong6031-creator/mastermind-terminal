import Foundation
import UIKit

/// Cloud watchlist sync (S5) — the native mirror of what the web terminal already does
/// with the signed-in user's Supabase lists, and nothing more. No product logic lives
/// here: it moves symbol membership between the device list and PostgREST.
///
/// WEB PARITY LAW: only the list named "Default" syncs; custom named lists stay
/// device-local. On sign-in the local Default is RECONCILED, never clobbered — local
/// order wins locally, local-only symbols are healed UP to the server (idempotent add),
/// server-only symbols are APPENDED to the local list. Order beyond insertion position
/// is not synced. Signing out leaves the local lists exactly as they are (the web keeps
/// localStorage the same way), and guest mode never touches the network.
///
/// Cross-account note: because reconcile MERGES, whatever is on the device when a second
/// account signs in is healed up into that account's cloud Default. This is the web's
/// merge law, kept deliberately rather than clobbering either side.
///
/// Failure model: local mutations are already committed by the time they reach this
/// service, so nothing here blocks or reverts them. Any failed call raises `dirty`, and
/// the next opportunity (foreground, auth change, or the next mutation) repairs the
/// session by re-running the full reconcile. The only UI is WatchlistScreen's hairline
/// hint, driven by `showsFailureHint`.
@MainActor
final class WatchlistSyncService: ObservableObject {
    static let shared = WatchlistSyncService()

    /// A signed-in cloud call failed since the last success.
    @Published private(set) var lastSyncFailed = false
    /// Mirrors AuthService.user != nil so views need only observe this service.
    @Published private(set) var isSignedIn = false

    /// Guests never see sync state — there is nothing to sync.
    var showsFailureHint: Bool { isSignedIn && lastSyncFailed }

    private weak var store: WatchlistStore?
    /// "Default" watchlist row id, cached for the session and dropped on every auth change.
    private var listID: String?
    /// A cloud write was lost; the next reconcile repairs the whole list.
    private var dirty = false
    /// Removals whose DELETE failed. Retried at the head of a reconcile and held out of
    /// the heal-down set, so a dropped delete cannot resurrect the symbol on the device.
    private var pendingRemovals: Set<String> = []
    private var reconciling = false
    /// Bumped by every cloud-relevant mutation, so a reconcile can tell whether the list
    /// moved under it mid-flight and needs one more pass.
    private var changeToken = 0
    private var observers: [NSObjectProtocol] = []

    private init() {}

    // MARK: - wiring

    /// Called from `WatchlistStore.init`, so the seam needs no App-level plumbing and a
    /// guest session pays nothing beyond two notification observers.
    func attach(_ store: WatchlistStore) {
        guard self.store == nil else { return }
        self.store = store
        store.onChange = { [weak self] change in self?.handle(change) }
        observers.append(NotificationCenter.default.addObserver(
            forName: .mmAuthChanged, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.authChanged() }
        })
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.syncNow() }
        })
        authChanged()
    }

    // MARK: - triggers

    private func authChanged() {
        let signedIn = AuthService.shared.user != nil
        isSignedIn = signedIn
        listID = nil
        pendingRemovals.removeAll()
        guard signedIn else {
            // Guest: local lists stay untouched and the failure hint never shows.
            dirty = false
            lastSyncFailed = false
            return
        }
        dirty = true    // a fresh session always starts from a full reconcile
        syncNow()
    }

    /// Reconciles when signed in; a silent no-op for guests.
    func syncNow() {
        guard AuthService.shared.user != nil, !reconciling else { return }
        reconciling = true
        Task { [weak self] in
            let needsAnotherPass = await self?.reconcile() ?? false
            self?.reconciling = false
            // Only a SUCCESSFUL pass that raced a local edit re-runs — a failing session
            // waits for the next trigger instead of spinning.
            if needsAnotherPass { self?.syncNow() }
        }
    }

    private func handle(_ change: WatchlistStore.Change) {
        guard change.list == WatchlistStore.cloudListName else { return }  // custom lists are device-local
        guard AuthService.shared.user != nil else { return }               // guests never write
        changeToken &+= 1
        if change.kind == .add { pendingRemovals.remove(change.symbol) }
        Task { [weak self] in await self?.push(change) }
    }

    // MARK: - reconcile + write-through

    /// Returns true when the pass succeeded but a local edit landed while it was in
    /// flight, so the caller should run one more.
    private func reconcile() async -> Bool {
        guard let store, store.cloudListSymbols != nil,
              let user = AuthService.shared.user else { return false }
        guard let token = await AuthService.shared.validAccessToken() else {
            dirty = true
            lastSyncFailed = true
            return false
        }
        do {
            let token0 = changeToken
            let id = try await ensureDefaultList(userID: user.id, token: token)
            listID = id
            let removals = pendingRemovals
            for symbol in removals {
                try await deleteSymbol(symbol, listID: id, token: token)
            }
            // Subtract, never clear: a removal can land while the deletes are in flight.
            pendingRemovals.subtract(removals)

            var cloud = try await fetchCloudSymbols(listID: id, token: token)
            // Self-heal duplicate rows. The table has no (watchlist_id, symbol) unique
            // constraint, and two clients CAN race their first heal-up — this app's
            // reconcile and the freshly signed-in web page seed the same guest list in
            // parallel after the session handoff. putSymbol's delete-then-insert
            // collapses every row for the symbol back to one.
            var seen = Set<String>()
            var dupes = Set<String>()
            for symbol in cloud where !seen.insert(symbol).inserted { dupes.insert(symbol) }
            for symbol in dupes {
                try await putSymbol(symbol, listID: id, token: token, position: cloud.count)
            }
            if !dupes.isEmpty { cloud = cloud.filter { seen.remove($0) != nil } }
            // Read the device list only now: it is the merge's local side, and the user may
            // have edited it while the fetch was in flight.
            let local = store.cloudListSymbols ?? []
            let cloudSet = Set(cloud)
            var position = cloud.count
            for symbol in local where !cloudSet.contains(symbol) {
                try await putSymbol(symbol, listID: id, token: token, position: position)
                position += 1
            }
            // Heal down, minus anything the user is still trying to delete — a deferred or
            // dropped removal must never resurrect the symbol on the device.
            let localSet = Set(local)
            store.appendFromCloud(cloud.filter { !localSet.contains($0) && !pendingRemovals.contains($0) })

            lastSyncFailed = false
            let raced = changeToken != token0
            dirty = raced
            return raced
        } catch {
            dirty = true
            lastSyncFailed = true
            return false
        }
    }

    private func push(_ change: WatchlistStore.Change) async {
        // A dirty session repairs itself with the full reconcile, which already carries
        // this change — the local list is the intent of record. A deferred REMOVE still has
        // to be remembered: the merge law would otherwise heal the symbol back down.
        guard !dirty, let id = listID else {
            if change.kind == .remove { pendingRemovals.insert(change.symbol) }
            syncNow()
            return
        }
        guard let token = await AuthService.shared.validAccessToken() else { return fail(change) }
        do {
            switch change.kind {
            case .add:
                let position = store?.cloudListSymbols?.firstIndex(of: change.symbol) ?? 0
                try await putSymbol(change.symbol, listID: id, token: token, position: position)
            case .remove:
                try await deleteSymbol(change.symbol, listID: id, token: token)
            }
            lastSyncFailed = false
        } catch {
            fail(change)
        }
    }

    private func fail(_ change: WatchlistStore.Change) {
        if change.kind == .remove { pendingRemovals.insert(change.symbol) }
        dirty = true
        lastSyncFailed = true
    }

    // MARK: - PostgREST (RLS scopes every call to the signed-in user)

    private enum SyncError: Error { case http(Int), malformed }

    /// UPSERT on the (user_id, name) unique index — same idempotent seed the web
    /// terminal does on load, so two clients racing at first sign-in both succeed.
    private func ensureDefaultList(userID: String, token: String) async throws -> String {
        struct Row: Decodable { let id: String }
        var request = try makeRequest("watchlists", query: [("on_conflict", "user_id,name")],
                                      method: "POST", token: token)
        request.setValue("resolution=merge-duplicates,return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: [[
            "user_id": userID,
            "name": WatchlistStore.cloudListName,
            "position": 0,
        ] as [String: Any]])
        let data = try await send(request)
        guard let row = try? JSONDecoder().decode([Row].self, from: data), let id = row.first?.id else {
            throw SyncError.malformed
        }
        return id
    }

    private func fetchCloudSymbols(listID: String, token: String) async throws -> [String] {
        struct Row: Decodable { let symbol: String }
        let request = try makeRequest("watchlist_symbols", query: [
            ("watchlist_id", "eq.\(listID)"),
            ("select", "symbol,section,position"),
            ("order", "position.asc"),
        ], method: "GET", token: token)
        let data = try await send(request)
        // A decode failure must never read as "the cloud list is empty" — that would
        // heal every local symbol up as if the server had none.
        guard let rows = try? JSONDecoder().decode([Row].self, from: data) else { throw SyncError.malformed }
        return rows.map(\.symbol)
    }

    /// Idempotent add: dedupe-then-insert, mirroring the web's /api/watchlist route.
    private func putSymbol(_ symbol: String, listID: String, token: String, position: Int) async throws {
        try await deleteSymbol(symbol, listID: listID, token: token)
        var request = try makeRequest("watchlist_symbols", method: "POST", token: token)
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: [[
            "watchlist_id": listID,
            "symbol": symbol,
            "section": "Watchlist",
            "position": position,
        ] as [String: Any]])
        _ = try await send(request)
    }

    private func deleteSymbol(_ symbol: String, listID: String, token: String) async throws {
        let request = try makeRequest("watchlist_symbols", query: [
            ("watchlist_id", "eq.\(listID)"),
            ("symbol", "eq.\(symbol)"),
        ], method: "DELETE", token: token)
        _ = try await send(request)
    }

    private func makeRequest(_ table: String, query: [(String, String)] = [],
                             method: String, token: String) throws -> URLRequest {
        guard let root = Self.restRoot,
              var components = URLComponents(url: root.appendingPathComponent(table),
                                             resolvingAgainstBaseURL: false) else {
            throw SyncError.malformed
        }
        components.percentEncodedQuery = query.isEmpty ? nil
            : query.map { "\(Self.escape($0.0))=\(Self.escape($0.1))" }.joined(separator: "&")
        guard let url = components.url else { throw SyncError.malformed }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 12
        request.setValue(AppConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    /// Interpolated so this compiles against `AppConfig.supabaseURL` as either a URL or
    /// a String (the auth slice owns that constant).
    private static var restRoot: URL? {
        let base = "\(AppConfig.supabaseURL)".trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: base + "/rest/v1")
    }

    /// Unreserved characters only: a dotted or dashed ticker (BRK.B, BTC-USD) must never
    /// reach PostgREST as anything but a literal filter value.
    private static func escape(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
    }

    private static let unreserved = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw SyncError.http(status) }
        return data
    }
}
