import Foundation
import UIKit
import WebKit

/// One row of the page's drawing-tool registry, as it arrives over the bridge.
///
/// `label` is the web's English label and `group` its TV-taxonomy family key — both are
/// the page's to define. Native only presents them: it localizes `label` through `L10n`
/// and buckets by `group`, and it must never filter, extend or reorder the inventory,
/// because the tools that exist are whatever the renderer in `terminal/` registers.
struct ShellDrawTool: Identifiable, Equatable {
    let id: String
    let label: String
    let group: String
}

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
    /// R2.4 — the user's starred timeframes, which the interval wheel prefers over the
    /// canonical list. Published because the wheel has to rebuild when it arrives.
    @Published private(set) var favTimeframes: [String] = []
    /// R2.1 — the chart's own drawing-tool registry, sent by the page. Native never
    /// hardcodes an engine tool list (`AGENTS.md`: the registry lives in `terminal/`).
    @Published private(set) var drawTools: [ShellDrawTool] = []
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
            applyOptionalPayload(body)
        case "symbolChanged":
            if let sym = body["sym"] as? String, !sym.isEmpty { symbol = sym }
        case "stateChanged":
            if let tf = body["tf"] as? String, !tf.isEmpty { timeframe = tf }
            applyOptionalPayload(body)
        case "openExternal":
            if let raw = body["url"] as? String, let url = URL(string: raw),
               url.scheme == "https" || url.scheme == "http" {
                UIApplication.shared.open(url)
            }
        default:
            break
        }
    }

    /// R2.4/R2.1 — the two payload members `ready` and `stateChanged` both carry. A key
    /// that is *absent* leaves the stored value alone: an older page build must not blank
    /// a list a newer one already delivered, and only the page can say the list is empty.
    private func applyOptionalPayload(_ body: [String: Any]) {
        if let favs = body["favTimeframes"] as? [String] { favTimeframes = favs }
        if let raw = body["drawTools"] as? [[String: Any]] { drawTools = Self.parseDrawTools(raw) }
    }

    private static func parseDrawTools(_ rows: [[String: Any]]) -> [ShellDrawTool] {
        rows.compactMap { row in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let label = row["label"] as? String, !label.isEmpty else { return nil }
            return ShellDrawTool(id: id, label: label, group: (row["group"] as? String) ?? "")
        }
    }

    // MARK: - native → web commands

    func setSymbol(_ symbol: String) { call("setSymbol", args: [symbol]) }
    func setTimeframe(_ timeframe: String) { call("setTimeframe", args: [timeframe]) }
    func setLang(_ lang: String) { call("setLang", args: [lang]) }

    /// Hands the page a Supabase session. One object argument, matching the web's
    /// `setSession({access_token, refresh_token})`; the page reloads ITSELF once the
    /// cookies are written, so native must not reload after calling this.
    /// Fire-and-forget: the promise it returns is unreadable from here, and token
    /// values must never reach a log.
    func setSession(accessToken: String, refreshToken: String) {
        call("setSession", args: [["access_token": accessToken, "refresh_token": refreshToken]])
    }

    /// Shows/hides the web chart's own drawing toolbar. Legacy compat only (R2.1): the
    /// pencil now opens the native Drawings sheet and the web dock stays hidden in shell
    /// mode, so nothing in the app calls this. Kept because it is still bridge v1 surface.
    func setDrawTools(_ visible: Bool) {
        call("setDrawTools", args: [visible])
    }

    /// R2.1 — activates one drawing tool by its registry id (the same code path the web
    /// dock's own buttons take). Ids come from `drawTools`; native never invents one.
    func setDrawTool(_ id: String) { call("setDrawTool", args: [id]) }

    /// R2.1 — drawing history, owned by the chart renderer in `terminal/`.
    func drawUndo() { call("drawUndo", args: []) }
    func drawRedo() { call("drawRedo", args: []) }

    /// R2.2 — asks the page to open one of its own modals ("indicators" | "compare").
    /// One implementation law: the picker is the web's, presented by the web.
    func openPanel(_ id: String) { call("openPanel", args: [id]) }

    private func call(_ method: String, args: [Any]) {
        // Arguments are JSON-encoded and applied — never string-interpolated into JS.
        guard JSONSerialization.isValidJSONObject(args),
              let data = try? JSONSerialization.data(withJSONObject: args),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.__mmShell && window.__mmShell.\(method).apply(window.__mmShell, \(json));"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
