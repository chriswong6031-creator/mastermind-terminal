import Foundation

/// The symbol universe — /data/manifest.json, the same file the web terminal searches
/// client-side. Rows carry EOD last/chg so lists render instantly; live quotes overlay
/// via QuoteTicker. Cached to disk so a cold offline launch still has a universe.
@MainActor
final class ManifestStore: ObservableObject {
    struct Row: Codable {
        let name: String?
        let zh: String?
        let sec: String?
        let col: String?
        let last: Double?
        let chg: Double?

        private enum CodingKeys: String, CodingKey { case name, zh, sec, col, last, chg }
    }

    private struct Manifest: Codable {
        let symbols: [String: Row]
    }

    @Published private(set) var rows: [String: Row] = [:]
    @Published private(set) var loaded = false

    /// Categories with rows, ordered by size — drives the search chips (TV's All/Stocks/… row).
    var categories: [String] {
        var counts: [String: Int] = [:]
        for row in rows.values { counts[row.sec ?? "Other", default: 0] += 1 }
        return counts.sorted { $0.value > $1.value }.map(\.key)
    }

    private var cacheURL: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("manifest.v1.json")
    }

    func load() async {
        if rows.isEmpty, let cached = try? Data(contentsOf: cacheURL) {
            apply(cached)
        }
        var request = URLRequest(url: AppConfig.origin.appendingPathComponent("data/manifest.json"))
        request.timeoutInterval = 15
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return }
        apply(data)
        try? data.write(to: cacheURL)
    }

    private func apply(_ data: Data) {
        guard let manifest = try? JSONDecoder().decode(Manifest.self, from: data) else { return }
        rows = manifest.symbols
        loaded = true
    }

    /// One-language display name — exact mirror of terminal/lib/markets.ts displayName():
    /// zh view prefers zh and falls back to en; en view the reverse. Never both at once.
    func displayName(_ symbol: String, lang: String) -> String {
        let row = rows[symbol]
        let en = row?.name ?? ""
        let zh = row?.zh ?? ""
        let name = lang == "zh" ? (zh.isEmpty ? en : zh) : (en.isEmpty ? zh : en)
        return name.isEmpty ? symbol : name
    }

    /// Simple native ranking (deliberately simpler than the web's scoreSymbol — presentation
    /// layer only): symbol prefix, then name prefix, then contains; ties alphabetical.
    func search(query: String, category: String?, lang: String, limit: Int = 60) -> [String] {
        let q = query.trimmingCharacters(in: .whitespaces).uppercased()
        let pool = rows.filter { category == nil || $0.value.sec == category }
        if q.isEmpty {
            // Category browse rule: an empty query with a category selected BROWSES the
            // category (search-row law) — alphabetical, never an empty pane.
            return pool.keys.sorted().prefix(limit).map { $0 }
        }
        var ranked: [(String, Int)] = []
        for (sym, row) in pool {
            let name = displayName(sym, lang: lang).uppercased()
            let score: Int
            if sym.hasPrefix(q) { score = 0 }
            else if name.hasPrefix(q) { score = 1 }
            else if sym.contains(q) { score = 2 }
            else if name.contains(q) { score = 3 }
            else { continue }
            ranked.append((sym, score))
        }
        return ranked.sorted { $0.1 == $1.1 ? $0.0 < $1.0 : $0.1 < $1.1 }.prefix(limit).map(\.0)
    }
}
