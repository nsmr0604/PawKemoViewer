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
//! Android / iOS は `plugins/external-view` のネイティブビューを使う。
//! Linux の WebKitGTK はナビゲーションへヘッダーを差し込む公開 API が無いため、
//! 呼び出し側が従来の pkv プロキシへフォールバックする。

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static NEXT_LABEL: AtomicU64 = AtomicU64::new(1);

/// 空ページの読み込みが終わったら、Referer 付きで目的の URL へ遷移する。
struct Pending {
    url: String,
    referer: String,
    navigated: bool,
}

/// Referer 付きのナビゲーションに対応しているか。
pub fn is_supported() -> bool {
    cfg!(windows)
}

/// 実オリジンの外部ページを Referer 付きで新しいウィンドウに開く。
pub fn open(app: &AppHandle, url: &str, referer: &str) -> Result<(), String> {
    if !is_supported() {
        return Err("unsupported-platform".to_string());
    }
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
    let pending = Arc::new(Mutex::new(Pending {
        url: url.to_string(),
        referer: referer.to_string(),
        navigated: false,
    }));
    let state = pending.clone();

    WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(PathBuf::from("external-blank.html")),
    )
    .title(title)
    .inner_size(520.0, 820.0)
    .min_inner_size(320.0, 480.0)
    .resizable(true)
    // 外部ページ内の遷移は http(s) だけ許可する (file: を防ぐ)
    .on_navigation(|next| matches!(next.scheme(), "http" | "https"))
    .on_document_title_changed(|window, title| {
        if !title.trim().is_empty() {
            let _ = window.set_title(&title);
        }
    })
    .on_page_load(move |window, payload| {
        if payload.event() != PageLoadEvent::Finished {
            return;
        }
        let request = {
            let mut state = match state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            if state.navigated {
                // 目的の URL の読み込み完了
                let _ = window.show();
                return;
            }
            state.navigated = true;
            (state.url.clone(), state.referer.clone())
        };
        let (url, referer) = request;
        let navigate_url = url.clone();
        let navigate_referer = referer.clone();
        if let Err(error) = window.with_webview(move |webview| {
            if let Err(error) = navigate(&webview, &navigate_url, &navigate_referer) {
                log::warn!("external page navigation failed: {error}");
            }
        }) {
            log::warn!("external page webview unavailable: {error}");
        }
    })
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
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
    use webview2_com::WebResourceRequestedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL, ICoreWebView2,
        ICoreWebView2WebResourceRequestedEventArgs,
    };
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

#[cfg(not(windows))]
fn navigate(
    _webview: &tauri::webview::PlatformWebview,
    _url: &str,
    _referer: &str,
) -> Result<(), String> {
    Err("unsupported-platform".to_string())
}
