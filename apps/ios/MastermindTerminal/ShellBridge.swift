import Foundation
import UIKit
import WebKit

/// Native side of bridge v1 (web types: terminal/lib/platform/contract.ts; message
/// schema: contracts/native-shell.v1.schema.json).
///
/// Web → native: the page posts {type: ...} objects to webkit.messageHandlers.mm.
/// Native → web: commands call window.__mmShell methods with JSON-encoded arguments.
/// WebKit delivers script messages on the main thread, so @Published writes are safe here.
final class ShellBridge: NSObject, ObservableObject, WKScriptMessageHandler {
    static let messageName = "mm"

    @Published private(set) var isReady = false
    @Published private(set) var symbol = AppConfig.defaultSymbol
    @Published private(set) var timeframe = ""
    private(set) var availableTimeframes: [String] = []

    weak var webView: WKWebView?

    /// Called before a reload so the loading cover comes back until the page re-announces ready.
    func reset() {
        isReady = false
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName,
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            isReady = true
            availableTimeframes = (body["availableTimeframes"] as? [String]) ?? []
        case "symbolChanged":
            if let sym = body["sym"] as? String, !sym.isEmpty { symbol = sym }
        case "stateChanged":
            if let tf = body["tf"] as? String, !tf.isEmpty { timeframe = tf }
        case "openExternal":
            if let raw = body["url"] as? String, let url = URL(string: raw),
               url.scheme == "https" || url.scheme == "http" {
                UIApplication.shared.open(url)
            }
        default:
            break
        }
    }

    // MARK: - native → web commands

    func setSymbol(_ symbol: String) { call("setSymbol", args: [symbol]) }
    func setTimeframe(_ timeframe: String) { call("setTimeframe", args: [timeframe]) }
    func setLang(_ lang: String) { call("setLang", args: [lang]) }

    private func call(_ method: String, args: [Any]) {
        // Arguments are JSON-encoded and applied — never string-interpolated into JS.
        guard JSONSerialization.isValidJSONObject(args),
              let data = try? JSONSerialization.data(withJSONObject: args),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.__mmShell && window.__mmShell.\(method).apply(window.__mmShell, \(json));"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
