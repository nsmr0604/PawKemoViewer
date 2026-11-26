//! デスクトップ向けの外部ページビュー。
//!
//! WebView からは `Referer` を自由に設定できないため、実オリジンのまま新しい
//! ウィンドウを開き、**最初のナビゲーションだけ** Referer を付けて送る。
//! 以降のサブリソースはページ自身の URL が Referer になるため、追加の細工は要らない。
//!
//! いったんローカルの空ページ (`external-blank.html`) を読み、その読み込み完了後に
//! Referer 付きで目的の URL へ遷移する。ウィンドウ生成直後に遷移すると、ビルダーが
//! 発行する初期ナビゲーションに上書きされることがあるため。
//!
//! ページには `assets/external-page-overlay.js` を差し込み、Android / iOS の
//! ネイティブ外部ビューと同じ操作 (URL 表示・戻る・画像を保存・閉じる) を提供する。
//! 「画像を保存」は `document.title` を `pawkemo-save#<JSON>` に変えてアプリへ渡し、
//! アプリはモバイルと同じ受け渡しファイル (`.external-download.json`) を書いて
//! ウィンドウを閉じる。
//!
//! プラットフォーム別の Referer 付与:
//! - Windows: WebView2 の `WebResourceRequested` でヘッダーを差し替える
//!   (`NavigateWithWebResourceRequest` の追加ヘッダーは Referer だけ落とされる)
//! - macOS: WKWebView に `Referer` 付きの `NSMutableURLRequest` を読み込ませる
//! - Linux: WebKitGTK にナビゲーションのヘッダーを差し込む公開 API が無いため、
//!   Rust 側で Referer 付きに取得した HTML を実 URL を base にして読み込む
//!
//! Android / iOS は `plugins/external-view` のネイティブビューを使う。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

static NEXT_LABEL: AtomicU64 = AtomicU64::new(1);

/// 画像保存の受け渡しファイル (モバイルの外部ビューと同じ)
const QUEUE_FILE: &str = ".external-download.json";

/// ページ側ツールバーの操作を受け取る `document.title` の接頭辞
const SAVE_PREFIX: &str = "pawkemo-save#";
const CLOSE_TITLE: &str = "pawkemo-close#";

/// 外部ページから画像を保存するときに引き回す投稿の文脈
#[derive(Clone)]
pub struct PageContext {
    pub creator_name: String,
    pub service: String,
    pub creator_id: String,
    pub post_id: String,
}

/// ウィンドウごとの状態 (遷移前の情報と投稿の文脈)
struct PageState {
    url: String,
    referer: String,
    context: PageContext,
    navigated: bool,
}

static PAGES: LazyLock<Mutex<HashMap<String, Arc<Mutex<PageState>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 実オリジンの外部ページを Referer 付きで新しいウィンドウに開く。
pub fn open(
    app: &AppHandle,
    url: &str,
    referer: &str,
    context: PageContext,
) -> Result<(), String> {
    let target = tauri::Url::parse(url).map_err(|_| "invalid url".to_string())?;
    if !matches!(target.scheme(), "http" | "https") || target.host_str().is_none() {
        return Err("unsupported scheme".to_string());
    }

    let label = format!(
        "external-page-{}",
        NEXT_LABEL.fetch_add(1, Ordering::Relaxed)
    );
    let title = match target.host_str() {
        Some(host) => format!("外部ページ — {host}"),
        None => "外部ページ".to_string(),
    };
    let state = Arc::new(Mutex::new(PageState {
        url: url.to_string(),
        referer: referer.to_string(),
        context,
        navigated: false,
    }));
    if let Ok(mut pages) = PAGES.lock() {
        pages.insert(label.clone(), state.clone());
    }

    let page_state = state.clone();
    let page_label = label.clone();

    WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(PathBuf::from("external-blank.html")),
    )
    .title(title)
    .inner_size(900.0, 820.0)
    .min_inner_size(360.0, 480.0)
    .resizable(true)
    // 外部ページ内の遷移は http(s) だけ許可する (file: を防ぐ)。
    // 起動直後の空ページは各 OS のアプリ用スキーム (http / tauri / about) なので許可する。
    .on_navigation(|next| {
        matches!(
            next.scheme(),
            "http" | "https" | "tauri" | "about" | "asset" | "ipc"
        )
    })
    .on_document_title_changed(move |window, title| {
        if title.starts_with(SAVE_PREFIX) {
            save_selection(&window, &page_label, title.trim_start_matches(SAVE_PREFIX));
            return;
        }
        if title.starts_with(CLOSE_TITLE) {
            forget(&page_label);
            let _ = window.close();
            return;
        }
        if !title.trim().is_empty() {
            let _ = window.set_title(&title);
        }
    })
    .on_page_load(move |window, payload| {
        if payload.event() != PageLoadEvent::Finished {
            return;
        }
        let request = {
            let mut state = match page_state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            if state.navigated {
                return;
            }
            state.navigated = true;
            (state.url.clone(), state.referer.clone())
        };
        start_navigation(&window, request.0, request.1);
    })
    .initialization_script(include_str!("../assets/external-page-overlay.js"))
    .build()
    .map_err(|error| error.to_string())?;

    let _ = state;
    Ok(())
}

fn forget(label: &str) {
    if let Ok(mut pages) = PAGES.lock() {
        pages.remove(label);
    }
}

/// 選択された画像をモバイルと同じ受け渡しファイルへ書き、ウィンドウを閉じる。
fn save_selection(window: &WebviewWindow, label: &str, payload: &str) {
    let images: Vec<String> = match serde_json::from_str(payload) {
        Ok(images) => images,
        Err(error) => {
            log::warn!("external page selection is not a list: {error}");
            return;
        }
    };
    let images: Vec<String> = images
        .into_iter()
        .filter(|url| {
            matches!(
                tauri::Url::parse(url).map(|parsed| parsed.scheme().to_string()),
                Ok(scheme) if scheme == "http" || scheme == "https"
            )
        })
        .collect();
    if images.is_empty() {
        forget(label);
        let _ = window.close();
        return;
    }

    let (context, referer) = {
        let state = PAGES
            .lock()
            .ok()
            .and_then(|pages| pages.get(label).cloned());
        match state.and_then(|state| {
            state
                .lock()
                .ok()
                .map(|state| (state.context.clone(), state.referer.clone()))
        }) {
            Some(pair) => pair,
            None => (empty_context(), String::new()),
        }
    };

    let page_url = window.url().map(|url| url.to_string()).unwrap_or_default();
    let value = serde_json::json!({
        "creatorName": context.creator_name,
        "service": context.service,
        "creatorId": context.creator_id,
        "postId": context.post_id,
        "referer": referer,
        "pageUrl": page_url,
        "images": images,
    });

    match queue_file(&window) {
        Some(path) => {
            if let Err(error) = std::fs::write(&path, value.to_string()) {
                log::warn!("external page queue could not be written: {error}");
            }
        }
        None => log::warn!("external page document directory is unavailable"),
    }

    forget(label);
    let _ = window.close();
}

fn queue_file(window: &WebviewWindow) -> Option<PathBuf> {
    window
        .app_handle()
        .path()
        .document_dir()
        .ok()
        .map(|directory| directory.join(QUEUE_FILE))
}

fn empty_context() -> PageContext {
    PageContext {
        creator_name: String::new(),
        service: String::new(),
        creator_id: String::new(),
        post_id: String::new(),
    }
}

/// 最初のナビゲーションをプラットフォームごとの方法で実行する。
fn start_navigation(window: &WebviewWindow, url: String, referer: String) {
    #[cfg(any(windows, target_os = "macos"))]
    {
        if let Err(error) = window.with_webview(move |webview| {
            if let Err(error) = navigate(&webview, &url, &referer) {
                log::warn!("external page navigation failed: {error}");
            }
        }) {
            log::warn!("external page webview unavailable: {error}");
        }
    }

    // WebKitGTK はナビゲーションへヘッダーを差し込む公開 API が無い。
    // Referer 付きで取得した HTML を、実 URL を base にして読み込む。
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let window = window.clone();
        std::thread::spawn(move || {
            let (html, final_url) = match fetch_page(&url, &referer) {
                Ok(page) => page,
                Err(error) => {
                    log::warn!("external page fetch failed: {error}");
                    return;
                }
            };
            let window_inner = window.clone();
            let handle = window.app_handle().clone();
            let _ = handle.run_on_main_thread(move || {
                let _ = window_inner.with_webview(move |webview| {
                    let view = webview.inner();
                    #[cfg(any(
                        target_os = "linux",
                        target_os = "dragonfly",
                        target_os = "freebsd",
                        target_os = "netbsd",
                        target_os = "openbsd"
                    ))]
                    {
                        use webkit2gtk::WebViewExt;
                        view.load_html(&html, Some(&final_url));
                    }
                    #[cfg(not(any(
                        target_os = "linux",
                        target_os = "dragonfly",
                        target_os = "freebsd",
                        target_os = "netbsd",
                        target_os = "openbsd"
                    )))]
                    {
                        let _ = (view, html, final_url);
                    }
                });
            });
        });
    }
}

/// Linux 用: Referer 付きで最初の HTML を取得する。
#[cfg(not(any(windows, target_os = "macos")))]
fn fetch_page(url: &str, referer: &str) -> Result<(String, String), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .header(reqwest::header::REFERER, referer)
        .header(reqwest::header::USER_AGENT, crate::current_user_agent())
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("status {}", response.status()));
    }
    let final_url = response.url().to_string();
    let html = response.text().map_err(|error| error.to_string())?;
    Ok((html, final_url))
}

/// WebView2 で、Referer 付きのナビゲーションを発行する。
///
/// `NavigateWithWebResourceRequest` の追加ヘッダーは Chromium が Referer だけ
/// 落とすため、対象 URL のリクエストを `WebResourceRequested` で受けて
/// ヘッダーを差し替える。
#[cfg(windows)]
fn navigate(
    webview: &tauri::webview::PlatformWebview,
    url: &str,
    referer: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL, ICoreWebView2,
        ICoreWebView2WebResourceRequestedEventArgs,
    };
    use webview2_com::WebResourceRequestedEventHandler;
    use windows::core::HSTRING;

    let controller = webview.controller();
    let core = unsafe { controller.CoreWebView2() }.map_err(|error| error.to_string())?;
    let target = HSTRING::from(url);

    unsafe {
        core.AddWebResourceRequestedFilter(&target, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)
            .map_err(|error| error.to_string())?;
    }

    let referer = referer.to_string();
    let handler = WebResourceRequestedEventHandler::create(Box::new(
        move |_sender: Option<ICoreWebView2>,
              args: Option<ICoreWebView2WebResourceRequestedEventArgs>| {
            if let Some(args) = args {
                if let Ok(request) = unsafe { args.Request() } {
                    if let Ok(headers) = unsafe { request.Headers() } {
                        let _ = unsafe {
                            headers.SetHeader(
                                &HSTRING::from("Referer"),
                                &HSTRING::from(referer.as_str()),
                            )
                        };
                    }
                }
            }
            Ok(())
        },
    ));
    let mut token = 0;
    unsafe { core.add_WebResourceRequested(&handler, &mut token) }
        .map_err(|error| error.to_string())?;

    unsafe { core.Navigate(&target) }.map_err(|error| error.to_string())
}

/// WKWebView に Referer 付きのリクエストを読み込ませる。
#[cfg(target_os = "macos")]
fn navigate(
    webview: &tauri::webview::PlatformWebview,
    url: &str,
    referer: &str,
) -> Result<(), String> {
    use objc2_foundation::{NSMutableURLRequest, NSString, NSURL};
    use objc2_web_kit::WKWebView;

    let view = webview.inner() as *const WKWebView;
    if view.is_null() {
        return Err("webview unavailable".to_string());
    }
    let view = unsafe { &*view };
    unsafe {
        let target = NSURL::URLWithString(&NSString::from_str(url))
            .ok_or_else(|| "invalid url".to_string())?;
        let request = NSMutableURLRequest::requestWithURL(&target);
        request.addValue_forHTTPHeaderField(
            &NSString::from_str(referer),
            &NSString::from_str("Referer"),
        );
        view.loadRequest(&request);
    }
    Ok(())
}
