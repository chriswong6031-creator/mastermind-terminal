import Foundation

/// Live-ish quotes for native lists via the web's own batch endpoint
/// (/api/quote?syms=A,B,C → explicit regular-session + extended-session lanes).
/// Server caches per symbol (5s TTL) so the 6s poll matches the web's cadence
/// without adding upstream load. null → caller falls back to manifest EOD.
@MainActor
final class QuoteTicker: ObservableObject {
    /// `Equatable` so a poll that returns the same print does not republish (ANIM-08):
    /// `PriceStack`'s tick flash keys off a real change, and a wholesale rewrite of the
    /// dictionary every 6 s would otherwise re-render every row with nothing to say.
    struct Quote: Codable, Equatable {
        let last: Double?
        let chg: Double?
        let basis: String?
        let close: Double?
        let prevClose: Double?
        let prevSessionChg: Double?
        let regularPrice: Double?
        let regularChg: Double?
        let extPrice: Double?
        let extChg: Double?
        let extTs: Double?
        let extSession: String?

        /// The primary lane is always the regular session. The explicit API fields win;
        /// older servers still degrade safely through close/prevSessionChg before raw last/chg.
        var primaryPrice: Double? {
            if let regularPrice, regularPrice.isFinite, regularPrice > 0 { return regularPrice }
            if let close, close.isFinite, close > 0 { return close }
            if let last, last.isFinite, last > 0 { return last }
            return nil
        }

        var primaryChange: Double? {
            if let regularChg, regularChg.isFinite { return regularChg }
            if let close, close.isFinite,
               let prevClose, prevClose.isFinite, prevClose != 0 {
                return ((close - prevClose) / prevClose) * 100
            }
            if let prevSessionChg, prevSessionChg.isFinite { return prevSessionChg }
            if let chg, chg.isFinite { return chg }
            return nil
        }

        var hasExtended: Bool {
            guard let extPrice else { return false }
            return extPrice.isFinite && extPrice > 0
        }
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
            if let quote {
                guard quotes[sym] != quote else { continue }
                quotes[sym] = quote
            } else if quotes[sym] != nil {
                quotes.removeValue(forKey: sym)
            }
        }
    }
}
