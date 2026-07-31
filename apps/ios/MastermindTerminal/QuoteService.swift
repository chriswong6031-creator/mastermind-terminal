import Foundation

/// Live-ish quotes for native lists via the web's own batch endpoint
/// (/api/quote?syms=A,B,C → { quotes: { SYM: {last, chg, basis} | null } }).
/// Server caches per symbol (5s TTL) so the 6s poll matches the web's cadence
/// without adding upstream load. null → caller falls back to manifest EOD.
@MainActor
final class QuoteTicker: ObservableObject {
    struct Quote: Codable {
        let last: Double?
        let chg: Double?
        let basis: String?
    }

    private struct Batch: Codable {
        let quotes: [String: Quote?]
    }

    @Published private(set) var quotes: [String: Quote] = [:]
    private var task: Task<Void, Never>?
    private var symbols: [String] = []

    func start(symbols: [String]) {
        self.symbols = symbols
        task?.cancel()
        guard !symbols.isEmpty else { return }
        task = Task { [weak self] in
            while let self, !Task.isCancelled {
                await self.pollOnce()
                try? await Task.sleep(for: .seconds(6))
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func pollOnce() async {
        let syms = symbols.prefix(60).joined(separator: ",")
        var components = URLComponents(url: AppConfig.origin.appendingPathComponent("api/quote"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "syms", value: syms)]
        guard let url = components.url else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let batch = try? JSONDecoder().decode(Batch.self, from: data) else { return }
        for (sym, quote) in batch.quotes {
            if let quote { quotes[sym] = quote }
        }
    }
}
