import Foundation

/// Where the app may go and what it may show. Product logic lives in the web terminal;
/// this file is the native mirror of contracts/native-features.v1.json plus the origin.
enum AppConfig {
    static let origin = URL(string: "https://app.mastermind-x.com")!
    static let defaultSymbol = "NVDA"
    static let bridgeVersion = 1

    /// native-features.v1 allowedRoutes — the only paths the privileged WebView may load.
    /// The Options suite (and every other excluded surface) is enforced HERE, not in
    /// product code: any other path gets the native "not in this alpha" notice.
    static let allowedRoutes = ["/terminal", "/analysis", "/discover", "/embed/chart"]

    static func isAllowedPath(_ path: String) -> Bool {
        allowedRoutes.contains { path == $0 || path.hasPrefix($0 + "/") }
    }

    static func chartURL(symbol: String) -> URL {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        components.path = "/terminal"
        components.queryItems = [
            URLQueryItem(name: "shell", value: "app"),
            URLQueryItem(name: "symbol", value: symbol),
        ]
        return components.url!
    }

    /// Guest seed shown natively until real watchlists land in S3 (matches the web's guest seed).
    static let guestWatchlist: [(symbol: String, name: String)] = [
        ("BTC-USD", "Bitcoin"),
        ("ETH-USD", "Ethereum"),
        ("NVDA", "NVIDIA"),
        ("AAPL", "Apple"),
        ("MSFT", "Microsoft"),
        ("QQQ", "Invesco QQQ Trust"),
    ]

    static var marketingVersion: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.0"
    }
}
