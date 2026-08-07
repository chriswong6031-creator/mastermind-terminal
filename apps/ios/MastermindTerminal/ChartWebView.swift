import SwiftUI
import UIKit
import WebKit

/// WKWebView that reports its first non-zero layout, so page load can wait for the
/// real frame instead of measuring against the SwiftUI placeholder size.
final class ShellWebView: WKWebView {
    var onFirstRealLayout: (() -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.height > 0, let callback = onFirstRealLayout {
            onFirstRealLayout = nil
            callback()
        }
    }
}

/// Hosts the live terminal chart (?shell=app). The web page is the product; this view
/// supplies only the WebView, the bridge message handler, and the navigation policy:
/// owned origin + allowlisted paths stay inside, external links leave via the system
/// browser, excluded routes surface the native "not in this alpha" notice.
struct ChartWebView: UIViewRepresentable {
    @ObservedObject var bridge: ShellBridge
    let onBlockedRoute: (String) -> Void
    let onLoadFailed: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(bridge: bridge, onBlockedRoute: onBlockedRoute, onLoadFailed: onLoadFailed)
    }

    func makeUIView(context: Context) -> ShellWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        // The coordinator (not the bridge) is the retained handler so dismantle can break the cycle.
        configuration.userContentController.add(context.coordinator, name: ShellBridge.messageName)

        let webView = ShellWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        // CHART-01 — the backdrop that shows during first paint must be the gradient's
        // **top** stop, which is `chartBgBottom` now that the gradient runs light→dark.
        webView.backgroundColor = UIColor(Theme.chartBgBottom)
        webView.scrollView.backgroundColor = UIColor(Theme.chartBgBottom)
        // The page owns scrolling/gestures; the native scroll view must not rubber-band under it.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        #if DEBUG
        webView.isInspectable = true
        #endif

        bridge.webView = webView
        // Defer the page load until the view has its real frame: the chart measures its
        // container on mount, and loading at the placeholder .zero frame produced a
        // half-height layout on first launch (verified in the simulator).
        let url = AppConfig.chartURL(symbol: bridge.symbol)
        webView.onFirstRealLayout = { [weak webView] in
            webView?.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ webView: ShellWebView, context: Context) {}

    static func dismantleUIView(_ webView: ShellWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: ShellBridge.messageName)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        private let bridge: ShellBridge
        private let onBlockedRoute: (String) -> Void
        private let onLoadFailed: (String) -> Void

        init(bridge: ShellBridge, onBlockedRoute: @escaping (String) -> Void, onLoadFailed: @escaping (String) -> Void) {
            self.bridge = bridge
            self.onBlockedRoute = onBlockedRoute
            self.onLoadFailed = onLoadFailed
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            bridge.userContentController(userContentController, didReceive: message)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
            // Subframe loads (embed widgets, auth iframes) stay subject to the page's own CSP.
            guard navigationAction.targetFrame?.isMainFrame != false else { return decisionHandler(.allow) }

            let sameOrigin = url.scheme == "https" && url.host == AppConfig.origin.host
            if !sameOrigin {
                if url.scheme == "https" || url.scheme == "http" { UIApplication.shared.open(url) }
                return decisionHandler(.cancel)
            }
            if !AppConfig.isAllowedPath(url.path) {
                onBlockedRoute(url.path)
                return decisionHandler(.cancel)
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            report(error)
        }

        private func report(_ error: Error) {
            let nsError = error as NSError
            // Cancellation (our own policy denials, rapid re-navigation) is not a failure state.
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            if nsError.domain == "WebKitErrorDomain" && nsError.code == 102 { return } // frame load interrupted by policy
            onLoadFailed(error.localizedDescription)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            // One automatic recovery; repeated crashes surface through didFail → error cover.
            bridge.reset()
            webView.reload()
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            // window.open / target=_blank → system browser, never a second in-app web view.
            if let url = navigationAction.request.url, url.scheme == "https" || url.scheme == "http" {
                UIApplication.shared.open(url)
            }
            return nil
        }
    }
}
