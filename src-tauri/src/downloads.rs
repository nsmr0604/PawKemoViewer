//! 一括画像ダウンロードの保存先と取得を扱う。
//!
//! 保存先は Logs / Languages と同じ Documents を基準にする。
//! モバイルは `Documents/Downloads`、デスクトップは `Downloads/PawKemoView`。
//! Android 10 以降は端末の共有 `Download/PawKemoViewer` へ MediaStore 経由で保存する。
//! 作成できない場合は Documents、最後にアプリデータ領域へフォールバックする。

use std::collections::HashSet;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager};

/// クリエイター名・ファイル名の最大文字数
const MAX_SEGMENT_CHARS: usize = 80;
/// 1 ファイルの上限
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
/// 1 回の実行で保存する合計バイト数
const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
/// 1 回の実行で保存する最大ファイル数
const MAX_FILES: usize = 300;
/// 外部ページの最大サイズ (gzip 展開後の HTML は数 MiB になることがある)
const MAX_PAGE_BYTES: u64 = 16 * 1024 * 1024;
/// 1 つの外部ページから拾う最大画像数
const MAX_PAGE_IMAGES: usize = 100;
/// 1 回の実行で開く外部ページ数
const MAX_PAGES: usize = 3;
/// これ未満の画像はトラッキングピクセル等とみなして保存しない
const MIN_IMAGE_BYTES: usize = 512;
/// ファイル取得の間隔
const FETCH_INTERVAL: Duration = Duration::from_millis(200);

static DOWNLOAD_CLIENT: LazyLock<reqwest::blocking::Client> = LazyLock::new(|| {
    reqwest::blocking::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        )
        .gzip(true)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.stop();
            }
            if crate::host_is_public(attempt.url()) {
                attempt.follow()
            } else {
                attempt.error("blocked redirect")
            }
        }))
        .build()
        .expect("failed to initialize download HTTP client")
});

static DOWNLOAD_RUNNING: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

/// ファイル名として使えない文字を置換し、前後の空白とドットを除去する。
pub(crate) fn sanitize_segment(value: &str, fallback: &str) -> String {
    let mut replaced = String::with_capacity(value.len());
    for ch in value.trim().chars() {
        let safe = !ch.is_control()
            && !matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|');
        replaced.push(if safe { ch } else { '_' });
    }
    let cleaned = replaced.trim().trim_matches('.').trim();
    let limited: String = cleaned.chars().take(MAX_SEGMENT_CHARS).collect();
    let result = limited.trim().trim_matches('.').trim();
    if result.is_empty() {
        fallback.to_string()
    } else {
        result.to_string()
    }
}

/// 保存の基準ディレクトリ。存在しなければ作成する。
///
/// - モバイル: Documents/Downloads
/// - デスクトップ: Downloads/PawKemoView (作成できなければ Documents/Pawchive/Downloads)
/// - どちらも使えなければアプリデータの Downloads
pub(crate) fn download_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        if let Ok(documents) = app.path().document_dir() {
            let base = documents.join("Downloads");
            if std::fs::create_dir_all(&base).is_ok() {
                return Ok(base);
            }
        }
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Ok(downloads) = app.path().download_dir() {
            let base = downloads.join("PawKemoView");
            if std::fs::create_dir_all(&base).is_ok() {
                return Ok(base);
            }
        }
        if let Ok(documents) = app.path().document_dir() {
            let base = documents.join("Pawchive").join("Downloads");
            if std::fs::create_dir_all(&base).is_ok() {
                return Ok(base);
            }
        }
    }
    let fallback = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("Downloads");
    std::fs::create_dir_all(&fallback).map_err(|error| error.to_string())?;
    Ok(fallback)
}

/// 1 回の保存先。Android の共有 Downloads では表示用パスと実際の書き込み先が異なる。
pub(crate) struct DownloadTarget {
    /// 結果表示に出す保存先
    pub display: PathBuf,
    /// 実際にファイルを書くディレクトリ (Android はアプリのキャッシュ)
    pub staging: PathBuf,
    /// Android の MediaStore 相対ディレクトリ (`Download/` 配下)。直接書き込む場合は None
    pub shared: Option<String>,
}

/// クリエイター名のディレクトリ。名前が空になる場合は `service_creatorId` を使う。
/// ディレクトリは作成しない (最初の 1 枚を保存するときに作る)。
pub(crate) fn creator_target(
    app: &tauri::AppHandle,
    creator_name: &str,
    service: &str,
    creator_id: &str,
) -> Result<DownloadTarget, String> {
    let fallback = format!("{}_{}", service, creator_id);
    let name = sanitize_segment(creator_name, &fallback);

    #[cfg(target_os = "android")]
    {
        if android_shared_downloads(app) {
            let relative = format!("PawKemoViewer/{name}");
            let staging = app
                .path()
                .app_cache_dir()
                .map_err(|error| error.to_string())?
                .join("downloads")
                .join(&name);
            return Ok(DownloadTarget {
                display: PathBuf::from(format!("Download/{relative}")),
                staging,
                shared: Some(relative),
            });
        }
    }

    let directory = download_root(app)?.join(name);
    Ok(DownloadTarget {
        display: directory.clone(),
        staging: directory,
        shared: None,
    })
}

/// クリエイター名のディレクトリ。存在しなければ作成する。
pub(crate) fn creator_directory(
    app: &tauri::AppHandle,
    creator_name: &str,
    service: &str,
    creator_id: &str,
) -> Result<PathBuf, String> {
    let target = creator_target(app, creator_name, service, creator_id)?;
    if target.shared.is_none() {
        std::fs::create_dir_all(&target.staging).map_err(|error| error.to_string())?;
    }
    Ok(target.display)
}

/// Android 10 以降で MediaStore 経由の共有 Downloads 保存が使えるか。
#[cfg(target_os = "android")]
fn android_shared_downloads(app: &tauri::AppHandle) -> bool {
    tauri::async_runtime::block_on(tauri_plugin_downloads_store::is_supported(app)).unwrap_or(false)
}

/// 共有 Downloads へ 1 枚移す。成功したらキャッシュ上のファイルは消える。
#[cfg(target_os = "android")]
fn store_shared(app: &tauri::AppHandle, path: &Path, file_name: &str, relative: &str) -> Result<(), String> {
    let result = tauri::async_runtime::block_on(tauri_plugin_downloads_store::save_to_downloads(
        app,
        path.to_string_lossy().to_string(),
        file_name.to_string(),
        relative.to_string(),
        mime_for(file_name).to_string(),
    ));
    let _ = std::fs::remove_file(path);
    result.map(|_| ())
}

/// 拡張子から MIME を決める。不明は octet-stream。
#[cfg(target_os = "android")]
fn mime_for(file_name: &str) -> &'static str {
    match file_name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

/// 衝突しないファイル名を組み立てる。`stem` と `extension` はサニタイズ済みの想定。
pub(crate) fn collision_name(stem: &str, extension: Option<&str>, index: u32) -> String {
    let base = if index <= 1 {
        stem.to_string()
    } else {
        format!("{stem}-{index}")
    };
    match extension {
        Some(ext) if !ext.is_empty() => format!("{base}.{ext}"),
        _ => base,
    }
}

/// ディレクトリ内で衝突しない保存先を返す。
pub(crate) fn unique_file_path(directory: &Path, filename: &str) -> PathBuf {
    let sanitized = sanitize_segment(filename, "image");
    let parsed = Path::new(&sanitized);
    let stem = parsed
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = parsed.extension().and_then(|value| value.to_str());

    for index in 1..=9999 {
        let candidate = directory.join(collision_name(stem, extension, index));
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(collision_name(stem, extension, 9999))
}

/// 一時ファイルへ書いてから置き換える。
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let temporary = path.with_file_name(format!(".{file_name}.part"));
    std::fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    match std::fs::rename(&temporary, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = std::fs::remove_file(&temporary);
            Err(error.to_string())
        }
    }
}

#[derive(serde::Deserialize)]
pub(crate) struct DownloadImage {
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) name: Option<String>,
}

#[derive(serde::Serialize)]
pub(crate) struct DownloadFailure {
    pub(crate) url: String,
    pub(crate) reason: String,
}

#[derive(serde::Serialize)]
pub(crate) struct DownloadSummary {
    pub(crate) directory: String,
    pub(crate) saved: usize,
    pub(crate) skipped: usize,
    pub(crate) cancelled: bool,
    pub(crate) failed: Vec<DownloadFailure>,
}

/// Referer に指定できるのは FANBOX / Patreon のページだけ
fn is_allowed_referer(referer: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(referer) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    host == "fanbox.cc"
        || host.ends_with(".fanbox.cc")
        || host == "patreon.com"
        || host.ends_with(".patreon.com")
}

fn referer_origin(referer: &str) -> Option<String> {
    let url = reqwest::Url::parse(referer).ok()?;
    let host = url.host_str()?;
    match url.port() {
        Some(port) => Some(format!("{}://{}:{}", url.scheme(), host, port)),
        None => Some(format!("{}://{}", url.scheme(), host)),
    }
}

/// セッション Cookie を付けてよいのは pawchive のホストだけ。
/// 外部ホストへは絶対に送らない。
fn session_cookie(url: &reqwest::Url, session: Option<&str>) -> Option<String> {
    let session = session?.trim();
    if session.is_empty() {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    let pawchive = host == "pawchive.pw" || host.ends_with(".pawchive.pw");
    pawchive.then(|| format!("session={session}"))
}

fn extension_for(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or("").trim() {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/avif" => Some("avif"),
        _ => None,
    }
}

/// `?f=` の名前、URL の末尾、Content-Type の順で保存名を決める。
fn file_name_for(url: &reqwest::Url, content_type: &str) -> String {
    let query_name = url
        .query_pairs()
        .find(|(key, _)| key == "f")
        .map(|(_, value)| value.into_owned());
    let path_name = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_string());
    let raw = query_name
        .or(path_name)
        .unwrap_or_else(|| "image".to_string());
    let decoded = crate::percent_decode(&raw);
    let mut name = if decoded.trim().is_empty() {
        "image".to_string()
    } else {
        decoded
    };
    if Path::new(&name).extension().is_none() {
        if let Some(extension) = extension_for(content_type) {
            name.push('.');
            name.push_str(extension);
        }
    }
    name
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum FetchKind {
    Image,
    Page,
}

fn fetch_image(
    url: &str,
    referer: &str,
    session: Option<&str>,
) -> Result<(Vec<u8>, String), String> {
    let fetched = fetch(url, referer, session, FetchKind::Image)?;
    if !fetched.content_type.starts_with("image/") {
        return Err("not an image".to_string());
    }
    let name = file_name_for(&fetched.final_url, &fetched.content_type);
    Ok((fetched.body, name))
}

struct Fetched {
    content_type: String,
    body: Vec<u8>,
    final_url: reqwest::Url,
}

/// Referer と ORIGIN を付けて取得する。種別ごとにサイズ上限を変える。
/// pawchive のホストにだけセッション Cookie を付ける。
///
/// ヘッダーはブラウザの画像/文書取得に寄せる。ミラー (n1〜n4.pawchive.pw) は
/// Cloudflare が `Accept` / `Accept-Language` / `Sec-Fetch-*` を見て 403 を返す。
fn fetch(
    url: &str,
    referer: &str,
    session: Option<&str>,
    kind: FetchKind,
) -> Result<Fetched, String> {
    let target = reqwest::Url::parse(url).map_err(|_| "invalid url".to_string())?;
    if !matches!(target.scheme(), "http" | "https") {
        return Err("unsupported scheme".to_string());
    }
    if !crate::host_is_public(&target) {
        return Err("forbidden address".to_string());
    }

    let mut request = DOWNLOAD_CLIENT
        .get(target.clone())
        .header(reqwest::header::USER_AGENT, crate::current_user_agent())
        .header(reqwest::header::REFERER, referer)
        .header(
            reqwest::header::ACCEPT_LANGUAGE,
            "ja,en-US;q=0.9,en;q=0.8",
        );
    match kind {
        FetchKind::Image => {
            request = request
                .header(
                    reqwest::header::ACCEPT,
                    "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                )
                .header("sec-fetch-dest", "image")
                .header("sec-fetch-mode", "no-cors")
                .header("sec-fetch-site", "cross-site");
        }
        FetchKind::Page => {
            request = request
                .header(
                    reqwest::header::ACCEPT,
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                )
                .header("sec-fetch-dest", "document")
                .header("sec-fetch-mode", "navigate")
                .header("sec-fetch-site", "cross-site")
                .header("upgrade-insecure-requests", "1");
        }
    }
    if let Some(origin) = referer_origin(referer) {
        request = request.header(reqwest::header::ORIGIN, origin);
    }
    if let Some(cookie) = session_cookie(&target, session) {
        request = request.header(reqwest::header::COOKIE, cookie);
    }
    let response = request.send().map_err(|error| error.without_url().to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let limit = if content_type.starts_with("image/") {
        MAX_FILE_BYTES
    } else {
        MAX_PAGE_BYTES
    };
    if let Some(length) = response.content_length() {
        if length > limit {
            return Err("too large".to_string());
        }
    }

    let final_url = response.url().clone();
    let mut body = Vec::new();
    response
        .take(limit + 1)
        .read_to_end(&mut body)
        .map_err(|error| error.to_string())?;
    if body.len() as u64 > limit {
        return Err("too large".to_string());
    }

    Ok(Fetched {
        content_type,
        body,
        final_url,
    })
}

/// HTML から保存対象の画像 URL を抽出し、相対 URL を解決する。
///
/// `src` だけでなく、遅延読み込みの `data-src` / `srcset` と
/// `<meta property="og:image">` も見る (静的ギャラリーの取りこぼしを減らす)。
pub(crate) fn extract_page_images(html: &str, base: &reqwest::Url) -> Vec<String> {
    static IMG_TAG: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?is)<img\b([^>]*)>").expect("valid img tag regex")
    });
    static META_TAG: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"(?is)<meta\b([^>]*)>").expect("valid meta tag regex")
    });
    static ATTR: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r#"(?is)([a-z_:][-a-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')"#)
            .expect("valid attribute regex")
    });

    // ヘッダー・ナビ・フッターのロゴやバナーを対象から外す
    let body = strip_chrome(html);

    let mut seen = HashSet::new();
    let mut images = Vec::new();
    let mut push = |raw: &str, images: &mut Vec<String>, seen: &mut HashSet<String>| {
        if images.len() >= MAX_PAGE_IMAGES {
            return;
        }
        if let Some(absolute) = image_candidate(raw, base) {
            if seen.insert(absolute.clone()) {
                images.push(absolute);
            }
        }
    };

    for caps in IMG_TAG.captures_iter(&body) {
        if images.len() >= MAX_PAGE_IMAGES {
            break;
        }
        let tag = caps.get(1).map(|value| value.as_str()).unwrap_or("");
        let mut srcset: Vec<String> = Vec::new();
        for attr in ATTR.captures_iter(tag) {
            let name = attr
                .get(1)
                .map(|value| value.as_str().to_ascii_lowercase())
                .unwrap_or_default();
            let value = attr
                .get(2)
                .or_else(|| attr.get(3))
                .map(|value| value.as_str())
                .unwrap_or("");
            match name.as_str() {
                "src" | "data-src" | "data-original" | "data-lazy-src" => push(value, &mut images, &mut seen),
                "srcset" | "data-srcset" => srcset.push(value.to_string()),
                _ => {}
            }
        }
        // srcset は最後 (最大サイズ) の候補を優先する
        for set in srcset {
            if let Some(last) = set.rsplit(',').next() {
                if let Some(url) = last.split_whitespace().next() {
                    push(url, &mut images, &mut seen);
                }
            }
        }
    }

    for caps in META_TAG.captures_iter(&body) {
        if images.len() >= MAX_PAGE_IMAGES {
            break;
        }
        let tag = caps.get(1).map(|value| value.as_str()).unwrap_or("");
        let mut is_image = false;
        let mut content = "";
        for attr in ATTR.captures_iter(tag) {
            let name = attr
                .get(1)
                .map(|value| value.as_str().to_ascii_lowercase())
                .unwrap_or_default();
            let value = attr
                .get(2)
                .or_else(|| attr.get(3))
                .map(|value| value.as_str())
                .unwrap_or("");
            match name.as_str() {
                "property" | "name" => {
                    let key = value.trim().to_ascii_lowercase();
                    if matches!(key.as_str(), "og:image" | "og:image:url" | "twitter:image") {
                        is_image = true;
                    }
                }
                "content" => content = value,
                _ => {}
            }
        }
        if is_image && !content.is_empty() {
            push(content, &mut images, &mut seen);
        }
    }

    images
}

/// 1 つの属性値を保存対象の絶対 URL に変換する。対象外なら None。
fn image_candidate(raw: &str, base: &reqwest::Url) -> Option<String> {
    let decoded = decode_entities(raw.trim());
    if decoded.is_empty() {
        return None;
    }
    let url = base.join(decoded.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    if url.host_str() == Some("img.pawchive.pw") && url.path().starts_with("/thumbnail/") {
        return None;
    }
    if is_avatar_or_ui(&url) {
        return None;
    }
    if let Some(extension) = url.path().rsplit('.').next() {
        if matches!(
            extension.to_ascii_lowercase().as_str(),
            "mp4" | "webm" | "mov" | "m4v" | "m3u8" | "gifv"
        ) {
            return None;
        }
    }
    Some(url.to_string())
}

/// 1x1 のトラッキングピクセルなど、極端に小さい画像か。
fn is_tracking_pixel(bytes: &[u8]) -> bool {
    bytes.len() < MIN_IMAGE_BYTES
}

/// SNS のアバター・バナー・UI 素材は「投稿の画像」ではないので対象外にする。
fn is_avatar_or_ui(url: &reqwest::Url) -> bool {
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    let path = url.path();
    match host.as_str() {
        "pbs.twimg.com" => {
            path.starts_with("/profile_images/") || path.starts_with("/profile_banners/")
        }
        "abs.twimg.com" | "graph.facebook.com" | "platform-lookaside.fbsbx.com" => true,
        "yt3.ggpht.com" => true,
        _ => host.ends_with("gravatar.com") && path.starts_with("/avatar/"),
    }
}

/// `<header>` / `<nav>` / `<footer>` の中身を落として、本文だけにする。
fn strip_chrome(html: &str) -> std::borrow::Cow<'_, str> {
    static TAGS: [&str; 3] = ["header", "nav", "footer"];
    let mut current = std::borrow::Cow::Borrowed(html);
    for tag in TAGS {
        let pattern = format!(r"(?is)<{tag}\b[^>]*>.*?</{tag}\s*>");
        let Ok(re) = regex::Regex::new(&pattern) else {
            continue;
        };
        if re.is_match(&current) {
            current = std::borrow::Cow::Owned(re.replace_all(&current, " ").into_owned());
        }
    }
    current
}

/// HTML 属性でよく使われる実体参照だけを戻す。
fn decode_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[tauri::command]
pub(crate) fn cancel_download() {
    DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub(crate) async fn download_post_images(
    app: tauri::AppHandle,
    creator_name: String,
    service: String,
    creator_id: String,
    referer: String,
    images: Vec<DownloadImage>,
    pages: Vec<String>,
    session_key: Option<String>,
    image_referer: Option<String>,
) -> Result<DownloadSummary, String> {
    if !is_allowed_referer(&referer) {
        return Err("referer must be a FANBOX or Patreon page".to_string());
    }
    // 外部ページから集めた画像は、そのページ自身を Referer にしないと 403 になることがある
    let image_referer = match image_referer.as_deref().map(str::trim) {
        Some(value) if !value.is_empty() => match reqwest::Url::parse(value) {
            Ok(url) if matches!(url.scheme(), "http" | "https") && url.host_str().is_some() => {
                Some(value.to_string())
            }
            _ => return Err("invalid image referer".to_string()),
        },
        _ => None,
    };
    if DOWNLOAD_RUNNING.swap(true, Ordering::SeqCst) {
        return Err("download already running".to_string());
    }
    DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);

    let target = creator_target(&app, &creator_name, &service, &creator_id)?;
    let app_for_worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_download(
            &app_for_worker,
            &target,
            &referer,
            images,
            pages,
            session_key,
            image_referer,
        )
    })
    .await;

    DOWNLOAD_RUNNING.store(false, Ordering::SeqCst);
    match result {
        Ok(summary) => summary,
        Err(error) => Err(error.to_string()),
    }
}

struct Downloader<'a> {
    app: &'a tauri::AppHandle,
    target: &'a DownloadTarget,
    session: Option<String>,
    seen: HashSet<String>,
    width: usize,
    saved: usize,
    skipped: usize,
    processed: usize,
    total: usize,
    total_bytes: u64,
    failed: Vec<DownloadFailure>,
    cancelled: bool,
}

impl<'a> Downloader<'a> {
    fn new(
        app: &'a tauri::AppHandle,
        target: &'a DownloadTarget,
        total: usize,
        session: Option<String>,
    ) -> Self {
        let width = total.max(1).to_string().len().max(3);
        Self {
            app,
            target,
            session,
            seen: HashSet::new(),
            width,
            saved: 0,
            skipped: 0,
            processed: 0,
            total,
            total_bytes: 0,
            failed: Vec::new(),
            cancelled: false,
        }
    }

    /// 中止要求を確認する。中止済みなら true を返す。
    fn stop_requested(&mut self) -> bool {
        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            self.cancelled = true;
        }
        self.cancelled
    }

    fn pause(&self) {
        if self.processed > 0 {
            std::thread::sleep(FETCH_INTERVAL);
        }
    }

    fn emit(&self) {
        let _ = self.app.emit(
            "download-progress",
            serde_json::json!({ "done": self.processed, "total": self.total }),
        );
    }

    /// 1 件取得して保存する。重複と失敗はその場で記録する。
    fn fetch_and_store(&mut self, url: &str, name: Option<&str>, referer: &str) {
        if !self.seen.insert(url.to_string()) {
            self.skipped += 1;
            self.processed += 1;
            self.emit();
            return;
        }
        self.pause();
        match fetch_image(url, referer, self.session.as_deref()) {
            Ok((bytes, derived_name)) => {
                let chosen = name
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string())
                    .unwrap_or(derived_name);
                self.store(url, &chosen, &bytes);
            }
            Err(reason) => self.failed.push(DownloadFailure {
                url: url.to_string(),
                reason,
            }),
        }
        self.processed += 1;
        self.emit();
    }

    /// 取得済みのバイト列を連番付きで保存する。
    fn store(&mut self, url: &str, name: &str, bytes: &[u8]) {
        // 1x1 のトラッキングピクセルなどは保存しない
        if is_tracking_pixel(bytes) {
            self.skipped += 1;
            return;
        }
        if self.total_bytes + bytes.len() as u64 > MAX_TOTAL_BYTES {
            self.failed.push(DownloadFailure {
                url: url.to_string(),
                reason: "total size limit".to_string(),
            });
            return;
        }
        // 保存する 1 枚目でディレクトリを作る (0 件のときに空フォルダーを残さない)
        if self.saved == 0 {
            if let Err(reason) = std::fs::create_dir_all(&self.target.staging) {
                self.failed.push(DownloadFailure {
                    url: url.to_string(),
                    reason: reason.to_string(),
                });
                return;
            }
        }
        let prefixed = format!(
            "{:0width$}_{}",
            self.saved + 1,
            sanitize_segment(name, "image"),
            width = self.width
        );
        let path = unique_file_path(&self.target.staging, &prefixed);
        if let Err(reason) = atomic_write(&path, bytes) {
            self.failed.push(DownloadFailure {
                url: url.to_string(),
                reason,
            });
            return;
        }
        // Android の共有 Downloads は MediaStore 経由で移す
        if let Some(relative) = self.target.shared.as_deref() {
            #[cfg(target_os = "android")]
            if let Err(reason) = store_shared(self.app, &path, &prefixed, relative) {
                self.failed.push(DownloadFailure {
                    url: url.to_string(),
                    reason,
                });
                return;
            }
            #[cfg(not(target_os = "android"))]
            let _ = relative;
        }
        self.saved += 1;
        self.total_bytes += bytes.len() as u64;
    }

    fn into_summary(self) -> DownloadSummary {
        DownloadSummary {
            directory: self.target.display.to_string_lossy().to_string(),
            saved: self.saved,
            skipped: self.skipped,
            cancelled: self.cancelled,
            failed: self.failed,
        }
    }
}

fn run_download(
    app: &tauri::AppHandle,
    target: &DownloadTarget,
    referer: &str,
    images: Vec<DownloadImage>,
    pages: Vec<String>,
    session: Option<String>,
    image_referer: Option<String>,
) -> Result<DownloadSummary, String> {
    let mut downloader = Downloader::new(app, target, images.len().min(MAX_FILES), session);
    let image_ref = image_referer.as_deref().unwrap_or(referer);

    for image in images.into_iter().take(MAX_FILES) {
        if downloader.stop_requested() {
            return Ok(downloader.into_summary());
        }
        downloader.fetch_and_store(&image.url, image.name.as_deref(), image_ref);
    }

    for page in pages.iter().take(MAX_PAGES) {
        if downloader.stop_requested() || downloader.saved >= MAX_FILES {
            break;
        }
        downloader.pause();
        match fetch(page, referer, downloader.session.as_deref(), FetchKind::Page) {
            Ok(fetched) if fetched.content_type.starts_with("image/") => {
                // 画像への直リンクは、そのまま 1 枚保存する
                downloader.total += 1;
                if downloader.stop_requested() {
                    break;
                }
                let name = file_name_for(&fetched.final_url, &fetched.content_type);
                if downloader.seen.insert(page.clone()) {
                    downloader.store(page, &name, &fetched.body);
                } else {
                    downloader.skipped += 1;
                }
                downloader.processed += 1;
                downloader.emit();
            }
            Ok(fetched) if fetched.content_type.contains("html") => {
                let html = String::from_utf8_lossy(&fetched.body);
                let candidates = extract_page_images(&html, &fetched.final_url);
                downloader.total += candidates.len();
                // 外部ページ内の画像は、そのページを Referer にする
                let page_referer = fetched.final_url.to_string();
                for candidate in candidates {
                    if downloader.stop_requested() || downloader.saved >= MAX_FILES {
                        break;
                    }
                    downloader.fetch_and_store(&candidate, None, &page_referer);
                }
            }
            Ok(fetched) => {
                downloader.failed.push(DownloadFailure {
                    url: page.clone(),
                    reason: format!("unsupported content type: {}", fetched.content_type),
                });
            }
            Err(reason) => downloader.failed.push(DownloadFailure {
                url: page.clone(),
                reason,
            }),
        }
    }

    Ok(downloader.into_summary())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_forbidden_characters_and_trims() {
        assert_eq!(sanitize_segment("  my:creator/name?  ", "fallback"), "my_creator_name_");
        assert_eq!(sanitize_segment("...creator...", "fallback"), "creator");
        assert_eq!(sanitize_segment("a\\b*c|d", "fallback"), "a_b_c_d");
        assert_eq!(sanitize_segment("   ", "fallback"), "fallback");
        assert_eq!(sanitize_segment("...", "fallback"), "fallback");
    }

    #[test]
    fn sanitize_limits_length_and_keeps_fallback() {
        let long = "a".repeat(200);
        assert_eq!(sanitize_segment(&long, "fallback").chars().count(), MAX_SEGMENT_CHARS);
        assert_eq!(sanitize_segment("", "fanbox_123"), "fanbox_123");
    }

    #[test]
    fn collision_names_add_a_suffix() {
        assert_eq!(collision_name("image", Some("png"), 1), "image.png");
        assert_eq!(collision_name("image", Some("png"), 2), "image-2.png");
        assert_eq!(collision_name("image", None, 3), "image-3");
        assert_eq!(collision_name("image", Some(""), 2), "image-2");
    }

    #[test]
    fn image_names_use_query_or_path_and_content_type() {
        let with_query = reqwest::Url::parse("https://example.com/data/abc?f=cover.png").unwrap();
        assert_eq!(file_name_for(&with_query, "image/png"), "cover.png");
        let no_extension = reqwest::Url::parse("https://example.com/data/abc").unwrap();
        assert_eq!(file_name_for(&no_extension, "image/jpeg"), "abc.jpg");
    }

    #[test]
    fn referer_is_limited_to_services() {
        assert!(is_allowed_referer("https://www.fanbox.cc/@a/posts/1"));
        assert!(is_allowed_referer("https://a.fanbox.cc/posts/1"));
        assert!(is_allowed_referer("https://www.patreon.com/posts/1"));
        assert!(!is_allowed_referer("https://example.com/"));
    }

    #[test]
    fn session_cookie_is_only_sent_to_pawchive_hosts() {
        let paw = reqwest::Url::parse("https://n1.pawchive.pw/data/a.jpg").unwrap();
        assert_eq!(session_cookie(&paw, Some("abc")).as_deref(), Some("session=abc"));
        let site = reqwest::Url::parse("https://pawchive.pw/api/v1/posts").unwrap();
        assert_eq!(session_cookie(&site, Some("abc")).as_deref(), Some("session=abc"));
        let external = reqwest::Url::parse("https://example.com/a.jpg").unwrap();
        assert_eq!(session_cookie(&external, Some("abc")), None);
        assert_eq!(session_cookie(&paw, None), None);
        assert_eq!(session_cookie(&paw, Some("  ")), None);
    }

    #[test]
    fn page_images_are_extracted_and_resolved() {
        let base = reqwest::Url::parse("https://example.com/gallery/page.html").unwrap();
        let html = r#"
            <img src="a.png">
            <IMG SRC='https://cdn.example.com/b.jpg?x=1&amp;y=2'>
            <img data-src="lazy.png">
            <img src="https://img.pawchive.pw/thumbnail/t.jpg">
            <img src="https://example.com/movie.mp4">
            <img src="b.jpg">
            <img src="data:image/png;base64,AAAA">
        "#;
        let images = extract_page_images(html, &base);
        assert_eq!(
            images,
            vec![
                "https://example.com/gallery/a.png".to_string(),
                "https://cdn.example.com/b.jpg?x=1&y=2".to_string(),
                "https://example.com/gallery/lazy.png".to_string(),
                "https://example.com/gallery/b.jpg".to_string(),
            ]
        );
    }

    #[test]
    fn page_images_include_lazy_attributes_and_og_image() {
        let base = reqwest::Url::parse("https://gallery.example.com/show").unwrap();
        let html = r#"
            <img data-src="/lazy.jpg" src="data:image/gif;base64,R0lGOD">
            <img data-original="orig.png">
            <picture>
              <source srcset="/s1.webp 480w, /s2.webp 960w">
              <img srcset="/s1.webp 480w, /s2.webp 960w" alt="">
            </picture>
            <meta property="og:image" content="/og.jpg">
            <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
            <meta name="description" content="/not-an-image.jpg">
        "#;
        let images = extract_page_images(html, &base);
        assert_eq!(
            images,
            vec![
                "https://gallery.example.com/lazy.jpg".to_string(),
                "https://gallery.example.com/orig.png".to_string(),
                "https://gallery.example.com/s2.webp".to_string(),
                "https://gallery.example.com/og.jpg".to_string(),
                "https://cdn.example.com/tw.jpg".to_string(),
            ]
        );
    }

    #[test]
    fn header_nav_footer_and_avatars_are_excluded() {
        let base = reqwest::Url::parse("https://example.com/post/1").unwrap();
        let html = r#"
            <header><a href="/"><img src="/logo.png"></a></header>
            <nav><img src="/nav.png"></nav>
            <main>
              <img src="/content-1.jpg">
              <img src="https://pbs.twimg.com/media/abc.jpg">
              <img src="https://pbs.twimg.com/profile_images/1/avatar.jpg">
              <img src="https://abs.twimg.com/emoji/v2/x.png">
            </main>
            <footer><img src="/footer-logo.png"></footer>
        "#;
        let images = extract_page_images(html, &base);
        assert_eq!(
            images,
            vec![
                "https://example.com/content-1.jpg".to_string(),
                "https://pbs.twimg.com/media/abc.jpg".to_string(),
            ]
        );
    }

    #[test]
    fn tracking_pixels_are_detected_by_size() {
        assert!(is_tracking_pixel(&[0u8; 43]));
        assert!(is_tracking_pixel(&[0u8; MIN_IMAGE_BYTES - 1]));
        assert!(!is_tracking_pixel(&[0u8; MIN_IMAGE_BYTES]));
        assert!(!is_tracking_pixel(&[0u8; 4096]));
    }

    #[test]
    fn page_image_extraction_is_capped() {
        let base = reqwest::Url::parse("https://example.com/").unwrap();
        let html = (0..(MAX_PAGE_IMAGES + 20))
            .map(|index| format!("<img src=\"{index}.png\">"))
            .collect::<String>();
        assert_eq!(extract_page_images(&html, &base).len(), MAX_PAGE_IMAGES);
    }
}
