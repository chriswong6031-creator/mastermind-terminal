import Foundation

/// Fire-and-forget beacon for committed symbol searches — the native mirror of
/// terminal/lib/searchTrack.ts, posting to the same open /api/track/search route.
///
/// Anonymous by design: the server stamps identity from its own `mm_aid` cookie, so we
/// use URLSession.shared (shared, persistent cookie jar) and never attach an
/// Authorization header. Tracking must never break or block the UI — every failure is
/// swallowed, and the same symbol|source inside 5s collapses to one event (a row tap
/// plus a re-render would otherwise double-fire).
@MainActor
enum SearchTracker {
    private static let dedupeWindow: TimeInterval = 5
    private static var recent: [String: Date] = [:]

    static func track(_ symbol: String, source: String, query: String? = nil) {
        let sym = String(symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased().prefix(64))
        guard !sym.isEmpty else { return }

        let now = Date()
        let key = "\(sym)|\(source)"
        if let last = recent[key], now.timeIntervalSince(last) < dedupeWindow { return }
        recent[key] = now
        if recent.count > 200 {
            recent = recent.filter { now.timeIntervalSince($0.value) < dedupeWindow }
        }

        var payload: [String: String] = ["symbol": sym, "source": String(source.prefix(32))]
        let trimmed = (query ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { payload["query"] = String(trimmed.prefix(128)) }
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }

        var request = URLRequest(url: AppConfig.origin.appendingPathComponent("api/track/search"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.timeoutInterval = 8
        Task.detached { _ = try? await URLSession.shared.data(for: request) }
    }
}
