import Foundation
import Tauri
import UIKit
import WebKit

private struct OpenArguments: Decodable {
    let url: String
    let referer: String
}

private final class ExternalPageController: UIViewController {
    private let pageURL: URL
    private let referer: String
    private var webView: WKWebView!

    init(url: URL, referer: String) {
        self.pageURL = url
        self.referer = referer
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "外部ページ"
        view.backgroundColor = .systemBackground

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: configuration)
#if PKV_EXTERNAL_DIAG
        webView.navigationDelegate = self
        ExternalViewTrace.add("load_requested")
#endif
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        self.webView = webView

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .close,
            target: self,
            action: #selector(close)
        )

        var request = URLRequest(url: pageURL)
        if !referer.isEmpty {
            request.setValue(referer, forHTTPHeaderField: "Referer")
        }
        webView.load(request)
    }

    @objc private func close() {
        dismiss(animated: true)
    }
}

#if PKV_EXTERNAL_DIAG
private struct ExternalViewReport: Encodable {
    let device: String
    let osVersion: String
    let events: [String]
}

// Accessed on the main queue by UIKit, WebKit and the plugin commands.
private enum ExternalViewTrace {
    static var lines: [String] = []

    static func add(_ event: String) {
        lines.append("\(Int(Date().timeIntervalSince1970 * 1000)) native \(event)")
        if lines.count > 100 { lines.removeFirst() }
    }

    static func failure(_ phase: String, _ error: Error) {
        let error = error as NSError
        let domain = [NSURLErrorDomain, WKError.errorDomain].contains(error.domain) ? error.domain : "other"
        add("\(phase) domain=\(domain) code=\(error.code)")
    }
}

extension ExternalPageController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        ExternalViewTrace.add("navigation_started")
    }

    func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
        ExternalViewTrace.add("navigation_redirect")
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if response.isForMainFrame, let status = (response.response as? HTTPURLResponse)?.statusCode {
            ExternalViewTrace.add("navigation_http status=\(status)")
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ExternalViewTrace.add("navigation_finished")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        ExternalViewTrace.failure("navigation_provisional_failed", error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        ExternalViewTrace.failure("navigation_failed", error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        ExternalViewTrace.add("web_content_terminated")
    }
}
#endif

private final class ExternalViewPlugin: Plugin {
#if PKV_EXTERNAL_DIAG
    @objc public func diagnosticEvents(_ invoke: Invoke) {
        DispatchQueue.main.async {
            let idiom = UIDevice.current.userInterfaceIdiom == .pad ? "pad" : "other"
            invoke.resolve(ExternalViewReport(
                device: idiom, osVersion: UIDevice.current.systemVersion, events: ExternalViewTrace.lines
            ))
        }
    }
#endif

    @objc public func open(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(OpenArguments.self)
        DispatchQueue.main.async {
#if PKV_EXTERNAL_DIAG
            ExternalViewTrace.add("open_received")
#endif
            guard let host = self.manager.viewController else {
#if PKV_EXTERNAL_DIAG
                ExternalViewTrace.add("presenter_missing")
#endif
                invoke.reject("Could not find a view controller to present the page")
                return
            }
            guard let url = URL(string: args.url) else {
#if PKV_EXTERNAL_DIAG
                ExternalViewTrace.add("url_invalid")
#endif
                invoke.reject("Invalid URL")
                return
            }
            let controller = ExternalPageController(url: url, referer: args.referer)
            let navigation = UINavigationController(rootViewController: controller)
            navigation.modalPresentationStyle = .fullScreen
#if PKV_EXTERNAL_DIAG
            ExternalViewTrace.add("present_requested attached=\(host.viewIfLoaded?.window != nil) busy=\(host.presentedViewController != nil)")
#endif
            host.present(navigation, animated: true) {
#if PKV_EXTERNAL_DIAG
                ExternalViewTrace.add("present_completed")
#endif
                invoke.resolve()
            }
        }
    }
}

@_cdecl("init_plugin_external_view")
public func initPlugin() -> Plugin {
    ExternalViewPlugin()
}
