import Foundation
import Tauri
import UIKit
import WebKit

private struct OpenArguments: Decodable {
    let url: String
    let referer: String
    let creatorName: String?
    let service: String?
    let creatorId: String?
    let postId: String?
}

private struct BrowserArguments: Decodable {
    let url: String
}

private final class ExternalPageController: UIViewController {
    private let pageURL: URL
    private let referer: String
    private let creatorName: String
    private let service: String
    private let creatorId: String
    private let postId: String
    private var webView: WKWebView!
    private var urlObservation: NSKeyValueObservation?
    /// 選択画面に出した候補。ここに無い URL は保存させない。
    fileprivate var candidates: [String] = []
    fileprivate var pickerHandlerInstalled = false

    init(url: URL, referer: String, creatorName: String, service: String, creatorId: String, postId: String) {
        self.pageURL = url
        self.referer = referer
        self.creatorName = creatorName
        self.service = service
        self.creatorId = creatorId
        self.postId = postId
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = pageURL.absoluteString
        view.backgroundColor = .systemBackground

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: configuration)
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] view, _ in
            if let url = view.url {
                self?.title = url.absoluteString
            }
        }
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

        navigationItem.rightBarButtonItems = [
            UIBarButtonItem(
                barButtonSystemItem: .close,
                target: self,
                action: #selector(close)
            ),
            UIBarButtonItem(
                title: "画像を保存",
                style: .plain,
                target: self,
                action: #selector(saveImages)
            ),
        ]

        var request = URLRequest(url: pageURL)
        if !referer.isEmpty {
            request.setValue(referer, forHTTPHeaderField: "Referer")
        }
        webView.load(request)
    }

    @objc private func close() {
        dismiss(animated: true)
    }

    /// 表示中ページの画像候補を集め、チェック式の選択画面を出す。
    @objc private func saveImages() {
        webView.evaluateJavaScript(Self.collectScript) { [weak self] result, _ in
            guard let self else { return }
            guard let json = result as? String,
                  let data = json.data(using: .utf8),
                  let urls = try? JSONSerialization.jsonObject(with: data) as? [String],
                  !urls.isEmpty else {
                self.showMessage("保存できる画像が見つかりませんでした")
                return
            }
            self.candidates = urls
            if !self.pickerHandlerInstalled {
                self.webView.configuration.userContentController.add(self, name: "pawkemoSaver")
                self.pickerHandlerInstalled = true
            }
            guard let payload = try? JSONSerialization.data(withJSONObject: urls, options: []),
                  let jsonArray = String(data: payload, encoding: .utf8) else {
                return
            }
            let script = Self.pickerScript.replacingOccurrences(of: "__URLS__", with: jsonArray)
            self.webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    /// 選択画面の「保存」から呼ばれる。候補に無い URL は無視する。
    fileprivate func saveSelected(_ urls: [String]) {
        let allowed = Set(candidates)
        let selected = urls.filter { allowed.contains($0) }
        guard !selected.isEmpty else { return }
        let payload: [String: Any] = [
            "creatorName": creatorName,
            "service": service,
            "creatorId": creatorId,
            "postId": postId,
            "referer": referer,
            "pageUrl": webView.url?.absoluteString ?? "",
            "images": selected,
        ]
        guard let directory = FileManager.default.urls(
            for: .documentDirectory, in: .userDomainMask
        ).first else {
            showMessage("保存を開始できませんでした")
            return
        }
        let file = directory.appendingPathComponent(".external-download.json")
        do {
            let encoded = try JSONSerialization.data(withJSONObject: payload, options: [])
            try encoded.write(to: file, options: .atomic)
            dismiss(animated: true)
        } catch {
            showMessage("保存を開始できませんでした")
        }
    }

    private func showMessage(_ text: String) {
        let alert = UIAlertController(title: nil, message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    /// 表示中ページから保存対象の画像 URL を集める (アプリ側と同じ除外規則)
    private static let collectScript = """
    (function () {
      var out = [];
      var seen = {};
      function isAvatar(u) {
        var host = u.hostname;
        var path = u.pathname;
        if (host === 'pbs.twimg.com') {
          return path.indexOf('/profile_images/') === 0 || path.indexOf('/profile_banners/') === 0;
        }
        if (host === 'abs.twimg.com' || host === 'graph.facebook.com' ||
            host === 'platform-lookaside.fbsbx.com' || host === 'yt3.ggpht.com') {
          return true;
        }
        if (/(^|\\.)gravatar\\.com$/.test(host)) return path.indexOf('/avatar/') === 0;
        return false;
      }
      function push(raw) {
        if (!raw) return;
        var u;
        try { u = new URL(raw, location.href); } catch (e) { return; }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
        if (isAvatar(u)) return;
        if (/\\.(mp4|webm|mov|m4v|m3u8|gifv)$/i.test(u.pathname)) return;
        if (seen[u.href]) return;
        seen[u.href] = 1;
        out.push(u.href);
      }
      var imgs = document.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (img.closest && img.closest('header,nav,footer')) continue;
        push(img.currentSrc || img.src);
        push(img.getAttribute('data-src'));
        push(img.getAttribute('data-original'));
        push(img.getAttribute('data-lazy-src'));
        var set = img.getAttribute('srcset') || img.getAttribute('data-srcset');
        if (set) {
          var parts = set.split(',');
          var last = parts[parts.length - 1].trim().split(/\\s+/)[0];
          push(last);
        }
      }
      var meta = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
      if (meta) push(meta.getAttribute('content'));
      return JSON.stringify(out.slice(0, 300));
    })()
    """

    /// チェック式の画像選択画面。__URLS__ に候補の JSON 配列を埋め込む。
    private static let pickerScript = """
    (function (urls) {
      if (window.__pawkemoPickerClose) window.__pawkemoPickerClose();
      var selected = [];
      for (var i = 0; i < urls.length; i++) selected.push(true);

      function make(tag, css, text) {
        var el = document.createElement(tag);
        if (css) el.style.cssText = css;
        if (text !== undefined) el.textContent = text;
        return el;
      }
      function button(label, extra) {
        var b = make('button', 'border:0;border-radius:10px;padding:10px 14px;font-size:15px;font-weight:600;background:#2a2c30;color:#e8e9eb;' + (extra || ''), label);
        b.type = 'button';
        return b;
      }

      var root = make('div', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:#0e0f11;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;');
      var header = make('div', 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:#1a1b1e;color:#e8e9eb;flex:0 0 auto;');
      var close = button('✕', 'width:44px;height:44px;padding:0;font-size:20px;');
      var titleWrap = make('div', 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;');
      var title = make('div', 'font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', '保存する画像を選択');
      var count = make('div', 'font-size:12px;color:#9aa0a6;', '');
      titleWrap.appendChild(title);
      titleWrap.appendChild(count);
      var all = button('すべて解除');
      var save = button('保存', 'background:#1a73e8;color:#fff;');
      header.appendChild(close);
      header.appendChild(titleWrap);
      header.appendChild(all);
      header.appendChild(save);

      var grid = make('div', 'flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:2px;background:#0e0f11;');
      var marks = [];

      function updateCount() {
        var n = 0;
        for (var i = 0; i < selected.length; i++) if (selected[i]) n++;
        count.textContent = n + ' / ' + urls.length + ' 枚';
        save.textContent = n > 0 ? '保存 (' + n + ')' : '保存';
        all.textContent = n === urls.length ? 'すべて解除' : 'すべて選択';
      }

      for (var i = 0; i < urls.length; i++) {
        (function (index) {
          var tile = make('button', 'position:relative;display:block;padding:0;border:0;background:#1a1b1e;overflow:hidden;');
          tile.type = 'button';
          var img = make('img', 'width:100%;display:block;aspect-ratio:3/4;object-fit:cover;background:#1a1b1e;');
          img.src = urls[index];
          img.loading = 'lazy';
          img.alt = '';
          var mark = make('span', 'position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:50%;border:2px solid #1a73e8;background:#1a73e8;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;', '✓');
          tile.appendChild(img);
          tile.appendChild(mark);
          tile.onclick = function () {
            selected[index] = !selected[index];
            mark.textContent = selected[index] ? '✓' : '';
            mark.style.background = selected[index] ? '#1a73e8' : 'rgba(0,0,0,0.25)';
            mark.style.borderColor = selected[index] ? '#1a73e8' : '#fff';
            updateCount();
          };
          grid.appendChild(tile);
          marks.push(mark);
        })(i);
      }

      all.onclick = function () {
        var n = 0;
        for (var i = 0; i < selected.length; i++) if (selected[i]) n++;
        var next = n !== selected.length;
        for (var j = 0; j < selected.length; j++) {
          selected[j] = next;
          marks[j].textContent = next ? '✓' : '';
          marks[j].style.background = next ? '#1a73e8' : 'rgba(0,0,0,0.25)';
          marks[j].style.borderColor = next ? '#1a73e8' : '#fff';
        }
        updateCount();
      };

      save.onclick = function () {
        var out = [];
        for (var k = 0; k < urls.length; k++) if (selected[k]) out.push(urls[k]);
        if (out.length === 0) return;
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pawkemoSaver) {
          window.webkit.messageHandlers.pawkemoSaver.postMessage(out);
        }
      };

      close.onclick = function () {
        if (window.__pawkemoPickerClose) window.__pawkemoPickerClose();
      };

      root.appendChild(header);
      root.appendChild(grid);
      document.body.appendChild(root);
      window.__pawkemoPickerClose = function () {
        if (root.parentNode) root.parentNode.removeChild(root);
        window.__pawkemoPickerClose = null;
      };
      updateCount();
    })(__URLS__);
    """
}

extension ExternalPageController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "pawkemoSaver", let urls = message.body as? [String] else { return }
        saveSelected(urls)
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
    @objc public func openBrowser(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(BrowserArguments.self)
        guard let url = URL(string: args.url) else {
            invoke.reject("Invalid browser URL")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    invoke.resolve()
                } else {
                    invoke.reject("Could not open the browser")
                }
            }
        }
    }

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
            let controller = ExternalPageController(
                url: url,
                referer: args.referer,
                creatorName: args.creatorName ?? "",
                service: args.service ?? "",
                creatorId: args.creatorId ?? "",
                postId: args.postId ?? ""
            )
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
