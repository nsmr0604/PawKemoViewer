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

private final class ExternalViewPlugin: Plugin {
    @objc public func open(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(OpenArguments.self)
        DispatchQueue.main.async {
            guard let host = self.manager.viewController else {
                invoke.reject("Could not find a view controller to present the page")
                return
            }
            guard let url = URL(string: args.url) else {
                invoke.reject("Invalid URL")
                return
            }
            let controller = ExternalPageController(url: url, referer: args.referer)
            let navigation = UINavigationController(rootViewController: controller)
            navigation.modalPresentationStyle = .fullScreen
            host.present(navigation, animated: true) {
                invoke.resolve()
            }
        }
    }
}

@_cdecl("init_plugin_external_view")
public func initPlugin() -> Plugin {
    ExternalViewPlugin()
}
