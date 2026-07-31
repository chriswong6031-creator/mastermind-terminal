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

    /// The same Supabase project the web terminal authenticates against. The anon key is
    /// the public publishable key that already ships in every web bundle — it identifies
    /// the project and grants nothing on its own; row-level security is the real boundary.
    /// User tokens are a different matter entirely and live only in the Keychain.
    static let supabaseURL = URL(string: "https://fsldfzlxyavsuwqbceod.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzbGRmemx4eWF2c3V3cWJjZW9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjA3NTYsImV4cCI6MjA5Njg5Njc1Nn0.6QEsAMgHIcVeJGJcFMkobtGXmRgBMXM2YhabP4ArXUI"

    /// Account creation stays on the marketing site (plans, terms, payment) and opens in
    /// the system browser — the app signs in, it never signs up.
    static let signUpURL = URL(string: "https://www.mastermind-x.com/?signup=1")!

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
