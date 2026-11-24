mod json_files;
mod locale_storage;
mod downloads;

use regex::Regex;
use tauri::Manager;
use reqwest::header::{
    HeaderMap,
    HeaderValue,
    ACCEPT,
    ACCEPT_LANGUAGE,
    COOKIE,
    ORIGIN,
    REFERER,
    SET_COOKIE,
    USER_AGENT,
};

use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::sync::{mpsc, Arc, LazyLock, Mutex};

// reqwest Client は Clone が安価で内部の接続プールを共有できる。
// コマンドごとに Client を生成せず、接続/TLS セッションをアプリ全体で再利用する。
static API_HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .brotli(true)
        .gzip(true)
        .build()
        .expect("failed to initialize API HTTP client")
});

static LOGIN_HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .brotli(true)
        .gzip(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("failed to initialize login HTTP client")
});



fn safe_log_url(url: &reqwest::Url) -> String {
    let mut safe = url.clone();
    // URL user-info is also credential material; never include it in diagnostics.
    let _ = safe.set_username("");
    let _ = safe.set_password(None);
    let pairs: Vec<(String, String)> = safe.query_pairs().map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
    if !pairs.is_empty() {
        safe.set_query(None);
        {
            let mut query = safe.query_pairs_mut();
            for (key, value) in pairs {
                let lower = key.to_ascii_lowercase();
                let sensitive = ["token", "secret", "session", "auth", "api_key", "apikey", "signature", "sig", "credential", "password", "passwd", "jwt"]
                    .iter()
                    .any(|needle| lower.contains(needle));
                query.append_pair(&key, if sensitive { "<redacted>" } else { &value });
            }
        }
    }
    safe.to_string()
}


// Append diagnostics to app_data/logs/pawchive.log in Lite and Full builds.
fn append_app_log(app: &tauri::AppHandle, line: &str) {
    use std::io::Write;
    let result = (|| -> Result<(), String> {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("logs");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut file = std::fs::OpenOptions::new().create(true).append(true)
            .open(dir.join("pawchive.log")).map_err(|e| e.to_string())?;
        writeln!(file, "{}", line).map_err(|e| e.to_string())
    })();
    if let Err(error) = result {
        log::error!(target: "Pawchive::Logging", "LOG_FILE_WRITE_ERROR {}", error);
    }
}

#[cfg(feature = "debug-diag")]
fn full_http_log(app: &tauri::AppHandle, target: &str, message: &str) {
    log::info!(target: target, "{}", message);
    append_app_log(app, &format!("[{}] {}", target, message));
}

// Full diagnostics: dump HTTP headers while masking credentials and session material.
#[cfg(feature = "debug-diag")]
fn log_http_headers(app: &tauri::AppHandle, target: &str, direction: &str, headers: &reqwest::header::HeaderMap) {
    for (name, value) in headers.iter() {
        let key = name.as_str();
        let lower = key.to_ascii_lowercase();
        let sensitive = matches!(
            lower.as_str(),
            "authorization" | "proxy-authorization" | "cookie" | "set-cookie"
                | "x-api-key" | "x-auth-token" | "authentication-info"
        ) || ["token", "secret", "session", "cookie", "auth", "api-key", "password", "passwd", "jwt"]
            .iter()
            .any(|needle| lower.contains(needle));
        let rendered = if sensitive {
            "<redacted>".to_string()
        } else {
            value.to_str().unwrap_or("<non-utf8>").to_string()
        };
        full_http_log(app, target, &format!("{}_HEADER {}: {}", direction, key, rendered));
    }
}

// Full: request body is logged to both logcat and the persistent diagnostics file.
#[cfg(feature = "debug-diag")]
fn log_http_request_body(app: &tauri::AppHandle, target: &str, content_type: Option<&str>, body: &[u8]) {
    use base64::Engine as _;
    if body.is_empty() {
        full_http_log(app, target, "REQUEST_BODY <empty>");
        return;
    }
    let Some(text) = std::str::from_utf8(body).ok() else {
        let encoded = base64::engine::general_purpose::STANDARD.encode(body);
        full_http_log(app, target, &format!("REQUEST_BODY_BASE64 {}", encoded));
        return;
    };
    let mut safe = text.to_string();
    let ct = content_type.unwrap_or("").to_ascii_lowercase();
    if ct.contains("application/x-www-form-urlencoded") {
        safe = safe.split('&').map(|part| {
            let (key, value) = part.split_once('=').unwrap_or((part, ""));
            let decoded_key = percent_decode(key).to_ascii_lowercase();
            let secret = ["password", "passwd", "token", "secret", "session", "auth", "credential", "api_key", "apikey", "jwt"]
                .iter().any(|needle| decoded_key.contains(needle));
            format!("{}={}", key, if secret { "<redacted>" } else { value })
        }).collect::<Vec<_>>().join("&");
    } else if ct.contains("json") || safe.trim_start().starts_with('{') || safe.trim_start().starts_with('[') {
        let re = Regex::new(r#"(?i)("(?:[^"]*(?:password|passwd|token|secret|session|auth|credential|api[_-]?key|jwt)[^"]*)"[ ]*:[ ]*)("(?:\\\\.|[^"])*"|[^,}\\]]+)"#).unwrap();
        safe = re.replace_all(&safe, "$1\"<redacted>\"").into_owned();
    }
    const MAX_CHUNK_BYTES: usize = 3000;
    let mut chunk = String::new();
    let mut index = 0usize;
    for ch in safe.chars() {
        chunk.push(ch);
        if chunk.len() >= MAX_CHUNK_BYTES {
            full_http_log(app, target, &format!("REQUEST_BODY chunk={} {}", index, chunk));
            chunk.clear();
            index += 1;
        }
    }
    if !chunk.is_empty() {
        full_http_log(app, target, &format!("REQUEST_BODY chunk={} {}", index, chunk));
    }
}

// pkv プロキシの資源制御。応答は最終的に全量メモリへ載るため上限を設ける。
const PROXY_MAX_BODY_BYTES: u64 = 64 * 1024 * 1024;
const PROXY_MAX_HTML_BYTES: u64 = 8 * 1024 * 1024;
const PROXY_CONNECT_TIMEOUT_SECS: u64 = 10;
const PROXY_TIMEOUT_SECS: u64 = 180;
const PROXY_MAX_REDIRECTS: usize = 5;
const PROXY_WORKERS: usize = 4;

static PROXY_HTTP_CLIENT: LazyLock<reqwest::blocking::Client> = LazyLock::new(|| {
    reqwest::blocking::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        )
        .gzip(true)
        .connect_timeout(std::time::Duration::from_secs(PROXY_CONNECT_TIMEOUT_SECS))
        // 全量バッファ前提のため、停止した接続でワーカーを占有し続けないよう上限を置く
        .timeout(std::time::Duration::from_secs(PROXY_TIMEOUT_SECS))
        // リダイレクト先も初回と同じ検査を通す (SSRF 迂回の防止)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= PROXY_MAX_REDIRECTS {
                return attempt.stop();
            }
            if is_proxyable(attempt.url()) && host_is_public(attempt.url()) {
                attempt.follow()
            } else {
                attempt.error("blocked redirect")
            }
        }))
        .build()
        .expect("failed to initialize proxy HTTP client")
});

#[tauri::command]
async fn fetch_post_thumbnail(path: String) -> Result<tauri::ipc::Response, String> {
    if !path.starts_with('/') || path.len() > 512 || path.contains("..")
        || !path.bytes().all(|b| b.is_ascii_alphanumeric() || b"/._-".contains(&b))
    {
        return Err("Invalid thumbnail path".into());
    }
    const MAX_BYTES: usize = 4 * 1024 * 1024;
    let mut response = API_HTTP_CLIENT
        .get(format!("https://img.pawchive.pw/thumbnail/data{path}"))
        .timeout(std::time::Duration::from_secs(15))
        .send().await.map_err(|e| e.without_url().to_string())?
        .error_for_status().map_err(|e| e.without_url().to_string())?;
    if !response.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| matches!(value.split(';').next(), Some("image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif")))
    {
        return Err("Unsupported thumbnail type".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.without_url().to_string())? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("Thumbnail is too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn api_request(
    app: tauri::AppHandle,
    path: String,
    method: String,
    session_key: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    let path = path.trim_start_matches('/');

    let url = format!(
        "https://pawchive.pw/api/v1/{}",
        path
    );

    // Full: API通信の開始をlogcatへ出力。認証Cookie/ヘッダーは記録しない。
    #[cfg(feature = "debug-diag")]
    full_http_log(&app, "Pawchive::API", &format!("REQUEST method={} url={}", method, reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into())));

    // タイムアウトはユーザー設定 (Settings → 接続)。1〜300 秒にクランプ
    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(30).clamp(1, 300));

    let client = &*API_HTTP_CLIENT;

    let mut headers = HeaderMap::new();

    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        ),
    );

    headers.insert(
        ACCEPT,
        HeaderValue::from_static(
            "application/json,text/plain,*/*",
        ),
    );

    headers.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static(
            "ja,en-US;q=0.9,en;q=0.8",
        ),
    );

    headers.insert(
        REFERER,
        HeaderValue::from_static(
            "https://pawchive.pw/",
        ),
    );

    headers.insert(
        ORIGIN,
        HeaderValue::from_static(
            "https://pawchive.pw",
        ),
    );

    if let Some(session) = session_key {
        if !session.is_empty() {
            let cookie = format!("session={}", session);
            headers.insert(COOKIE, HeaderValue::from_str(&cookie).map_err(|e| e.to_string())?);
        }
    }

    #[cfg(feature = "debug-diag")]
    log_http_headers(&app, "Pawchive::API", "REQUEST", &headers);

    let response = match method.as_str() {
        "POST" => {
            client
                .post(&url)
                .headers(headers)
                .timeout(timeout)
                .send()
                .await
        }

        "DELETE" => {
            client
                .delete(&url)
                .headers(headers)
                .timeout(timeout)
                .send()
                .await
        }

        _ => {
            client
                .get(&url)
                .headers(headers)
                .timeout(timeout)
                .send()
                .await
        }
    }
    .map_err(|e| {
        log::error!(target: "Pawchive::API", "API_ERROR destination={}", reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()));
        append_app_log(&app, &format!("API_ERROR destination={}", reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into())));
        #[cfg(feature = "debug-diag")]
        full_http_log(&app, "Pawchive::API", &format!("TRANSPORT_ERROR method={} url={} error={}", method, reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()), e));
        e.to_string()
    })?;

    let status = response.status();

    #[cfg(feature = "debug-diag")]
    {
        full_http_log(&app, "Pawchive::API", &format!("RESPONSE method={} url={} status={}", method, reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()), status));
        log_http_headers(&app, "Pawchive::API", "RESPONSE", response.headers());
    }

    let text = response
        .text()
        .await
        .map_err(|e| {
            log::error!(target: "Pawchive::API", "API_BODY_READ_ERROR destination={}", reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()));
            append_app_log(&app, &format!("API_BODY_READ_ERROR destination={}", reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into())));
            #[cfg(feature = "debug-diag")]
            full_http_log(&app, "Pawchive::API", &format!("BODY_READ_ERROR method={} url={} error={}", method, reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()), e));
            e.to_string()
        })?;

    #[cfg(feature = "debug-diag")]
    {
        full_http_log(&app, "Pawchive::API", &format!("RESPONSE method={} url={} status={} bytes={}", method, reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()), status, text.len()));
        log_http_response_body(&app, "Pawchive::API", &text);
    }

    if !status.is_success() {
        log::error!(target: "Pawchive::API", "API_ERROR destination={} body={}", reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()), text);
        append_app_log(&app, &format!("API_ERROR destination={} body={}", reqwest::Url::parse(&url).map(|u| safe_log_url(&u)).unwrap_or_else(|_| "<invalid-url>".into()), text));
        return Err(format!("STATUS={} BODY={}", status, text));
    }

    Ok(text)
}

// Full: レスポンス本文を logcat の1行サイズに収まるよう分割して出力する。
// UTF-8文字境界を維持し、空レスポンスも明示する。
#[cfg(feature = "debug-diag")]
fn log_http_response_body(app: &tauri::AppHandle, target: &str, body: &str) {
    const MAX_CHUNK_BYTES: usize = 3000;
    if body.is_empty() {
        full_http_log(app, target, "RESPONSE_BODY <empty>");
        return;
    }
    let mut chunk = String::new();
    let mut chunk_index = 0usize;
    for ch in body.chars() {
        chunk.push(ch);
        if chunk.len() >= MAX_CHUNK_BYTES {
            full_http_log(app, target, &format!("RESPONSE_BODY chunk={} {}", chunk_index, chunk));
            chunk.clear();
            chunk_index += 1;
        }
    }
    if !chunk.is_empty() {
        full_http_log(app, target, &format!("RESPONSE_BODY chunk={} {}", chunk_index, chunk));
    }
}

// ---------------------------------------------------------------------------
// ログイン (pawchive.pw /account/login の中継 + session cookie 抽出)
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct LoginResult {
    ok: bool,
    session: Option<String>,
    error: Option<String>,
}

#[tauri::command]
async fn login_request(app: tauri::AppHandle, username: String, password: String, timeout_secs: Option<u64>) -> Result<LoginResult, String> {
    if username.is_empty() || password.is_empty() {
        return Ok(LoginResult {
            ok: false,
            session: None,
            error: Some("ユーザー名とパスワードを入力してください".into()),
        });
    }

    // タイムアウトはユーザー設定 (api_request と同じクランプ)
    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(30).clamp(1, 300));

    // リダイレクトを追従しない (pawchive は 302 応答に Set-Cookie を付けるため。
    // 追従すると最終応答のヘッダーしか見えず session を取り逃す)
    let client = &*LOGIN_HTTP_CLIENT;

    let ua = HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    );

    // POST /account/login (フォーム送信) — pawchive は失敗時でも flash 入りの
    // session cookie を発行するため、取得後に有効性を検証する
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, ua.clone());
    headers.insert(REFERER, HeaderValue::from_static("https://pawchive.pw/account/login"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://pawchive.pw"));

    let form = [
        ("username", username.as_str()),
        ("password", password.as_str()),
        ("location", "/login"),
    ];

    #[cfg(feature = "debug-diag")]
    {
        full_http_log(&app, "Pawchive::Login", "REQUEST method=POST url=https://pawchive.pw/account/login");
        log_http_headers(&app, "Pawchive::Login", "REQUEST", &headers);
        log_http_request_body(&app, "Pawchive::Login", Some("application/x-www-form-urlencoded"), b"username=<redacted>&password=<redacted>&location=%2Flogin");
    }

    let resp = client
        .post("https://pawchive.pw/account/login")
        .headers(headers)
        .form(&form)
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| {
            #[cfg(feature = "debug-diag")]
            full_http_log(&app, "Pawchive::Login", &format!("TRANSPORT_ERROR url=https://pawchive.pw/account/login error={}", e));
            e.to_string()
        })?;

    #[cfg(feature = "debug-diag")]
    {
        full_http_log(&app, "Pawchive::Login", &format!("RESPONSE status={}", resp.status()));
        log_http_headers(&app, "Pawchive::Login", "RESPONSE", resp.headers());
    }

    let login_status = resp.status();
    let login_headers = resp.headers().clone();
    #[cfg(feature = "debug-diag")]
    {
        full_http_log(&app, "Pawchive::Login", &format!("RESPONSE status={}", login_status));
        log_http_headers(&app, "Pawchive::Login", "RESPONSE", &login_headers);
    }
    let login_body = resp.text().await.unwrap_or_default();
    #[cfg(feature = "debug-diag")]
    log_http_response_body(&app, "Pawchive::Login", &login_body);

    let mut session: Option<String> = None;
    for sc in login_headers.get_all(SET_COOKIE) {
        if let Ok(v) = sc.to_str() {
            for part in v.split(';') {
                if let Some(rest) = part.trim().strip_prefix("session=") {
                    session = Some(rest.to_string());
                }
            }
        }
    }

    // セッションの有効性を検証 (favorites が取得できなければ認証失敗扱い)
    let mut ok = false;
    if let Some(s) = &session {
        let mut vh = HeaderMap::new();
        vh.insert(USER_AGENT, ua.clone());
        if let Ok(c) = HeaderValue::from_str(&format!("session={}", s)) {
            vh.insert(COOKIE, c);
            #[cfg(feature = "debug-diag")]
            {
                full_http_log(&app, "Pawchive::LoginValidation", "REQUEST method=GET url=https://pawchive.pw/api/v1/account/favorites?type=artist");
                log_http_headers(&app, "Pawchive::LoginValidation", "REQUEST", &vh);
            }
            if let Ok(v) = client
                .get("https://pawchive.pw/api/v1/account/favorites?type=artist")
                .headers(vh)
                .timeout(timeout)
                .send()
                .await
            {
                let validation_status = v.status();
                let validation_headers = v.headers().clone();
                #[cfg(feature = "debug-diag")]
                {
                    full_http_log(&app, "Pawchive::LoginValidation", &format!("RESPONSE status={}", validation_status));
                    log_http_headers(&app, "Pawchive::LoginValidation", "RESPONSE", &validation_headers);
                }
                let validation_body = v.text().await.unwrap_or_default();
                #[cfg(feature = "debug-diag")]
                log_http_response_body(&app, "Pawchive::LoginValidation", &validation_body);
                ok = validation_status.is_success();
            }
        }
    }

    if ok && session.is_some() {
        Ok(LoginResult { ok: true, session, error: None })
    } else {
        Ok(LoginResult {
            ok: false,
            session: None,
            error: Some("ユーザー名またはパスワードが正しくありません".into()),
        })
    }
}

// ---------------------------------------------------------------------------
// クリエイターアイコン (取得 + ディスクキャッシュ)
//
// pawchive.pw/icons/{service}/{userId} は webp (存在しない場合は 204)。
// app_data/icons/{service}_{id}.webp にキャッシュし、2 回目以降は
// ネットワークなしで data URL を返す。JS 側 (src/icons.ts) が
// メモリ/IndexedDB キャッシュをさらに重ねる。
// ---------------------------------------------------------------------------

/// クリエイターアイコンを data URL で返す。アイコンが存在しない場合は None。
/// 取得済みアイコンは app_data/icons/ から返す (通信しない)。
#[tauri::command]
async fn fetch_creator_icon(
    app: tauri::AppHandle,
    service: String,
    id: String,
) -> Result<Option<String>, String> {
    use base64::Engine as _;

    // 識別子の検証 (パスインジェクション防止)
    if service.is_empty()
        || id.is_empty()
        || !service.chars().all(|c| c.is_ascii_alphanumeric())
        || !id.chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err("invalid creator id".into());
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("icons");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let cache_path = dir.join(format!("{}_{}.webp", service, id));

    let to_data_url = |bytes: Vec<u8>| -> String {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        format!("data:image/webp;base64,{}", b64)
    };

    // ディスクキャッシュヒット → そのまま返す
    if let Ok(bytes) = std::fs::read(&cache_path) {
        return Ok(Some(to_data_url(bytes)));
    }

    let url = format!("https://pawchive.pw/icons/{}/{}", service, id);
    #[cfg(feature = "debug-diag")]
    println!("ICON REQUEST => {}", url);

    let client = reqwest::Client::builder()
        .brotli(true)
        .gzip(true)
        .build()
        .map_err(|e| e.to_string())?;
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        ),
    );
    headers.insert(REFERER, HeaderValue::from_static("https://pawchive.pw/"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://pawchive.pw"));

    #[cfg(feature = "debug-diag")]
    {
        full_http_log(&app, "Pawchive::Icon", &format!("REQUEST method=GET url={}", safe_log_url(&reqwest::Url::parse(&url).unwrap())));
        log_http_headers(&app, "Pawchive::Icon", "REQUEST", &headers);
    }
    let resp = client
        .get(&url)
        .headers(headers)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| {
            #[cfg(feature = "debug-diag")]
            full_http_log(&app, "Pawchive::Icon", &format!("TRANSPORT_ERROR url={} error={}", safe_log_url(&reqwest::Url::parse(&url).unwrap()), e));
            e.to_string()
        })?;

    let status = resp.status();
    // アイコンが存在しないクリエイターは 204 (実測)。
    if status.as_u16() == 204 || !status.is_success() {
        return Ok(None);
    }
    let ct = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !ct.starts_with("image/") {
        return Ok(None);
    }
    #[cfg(feature = "debug-diag")]
    {
        full_http_log(&app, "Pawchive::Icon", &format!("RESPONSE url={} status={}", safe_log_url(&reqwest::Url::parse(&url).unwrap()), status));
        log_http_headers(&app, "Pawchive::Icon", "RESPONSE", resp.headers());
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    #[cfg(feature = "debug-diag")]
    full_http_log(&app, "Pawchive::Icon", &format!("RESPONSE_BODY <binary omitted; {} bytes>", bytes.len()));
    if bytes.is_empty() {
        return Ok(None);
    }

    // ディスクへ保存して data URL を返す
    let _ = std::fs::write(&cache_path, &bytes);
    Ok(Some(to_data_url(bytes.to_vec())))
}

// ---------------------------------------------------------------------------
// pkv:// プロトコル (リファラー偽装プロキシ)
//
// WebView (tauri://localhost) からは Referer を自由に設定できないため、
// リファラーチェックでブロックされる fanbox / patreon / 外部サイトの
// ファイル・ページを Rust 側で Referer/Origin を偽装して中継する。
//
// WebView 側の URL: Windows / Android は http://pkv.localhost/file?u=<対象URL>&r=<リファラー>、
// それ以外の OS は pkv://localhost/file?u=<対象URL>&r=<リファラー>
//  - GET  : ファイル/ページ取得
//  - POST : 外部ページ内のフォーム送信を中継 (reCAPTCHA 付きフォーム等)
// ---------------------------------------------------------------------------

/// pkv カスタムプロトコルの基底 URL。
/// Tauri は Windows / Android だけ `http://<scheme>.localhost` で配信し、
/// macOS / iOS / Linux は `<scheme>://localhost` になる。
#[cfg(any(windows, target_os = "android"))]
const PKV_BASE_URL: &str = "http://pkv.localhost/file";
#[cfg(not(any(windows, target_os = "android")))]
const PKV_BASE_URL: &str = "pkv://localhost/file";

/// リファラーチェックが無い (実測) / ミラー済みのため直接アクセス可能なホスト。
/// HTML 変換も行わない (fanbox / patreon は SPA のため同一オリジン化すると壊れる)。
fn is_direct_host(hostname: &str) -> bool {
    let h = hostname.to_ascii_lowercase();
    ["fanbox.cc", "patreon.com", "patreonusercontent.com", "pximg.net", "pawchive.pw"]
        .iter()
        .any(|d| h == *d || h.ends_with(&format!(".{}", d)))
}

/// SSRF 対策: 内部アドレス・IP 直指定・ローカル名を拒否する
fn forbidden_host(hostname: &str) -> bool {
    let h = hostname.to_ascii_lowercase();
    h == "localhost"
        || h.ends_with(".localhost")
        || h.ends_with(".local")
        || h.ends_with(".internal")
        || h.split(':').count() > 1 // IPv6 リテラル
        || !h.contains('.') // 単一ラベル (paw 自身など)
        || h.split('.').all(|p| p.parse::<u16>().is_ok()) // IPv4 リテラル
}

/// グローバル到達可能なアドレスか (loopback / private / link-local / CGNAT 等を拒否)
fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
                || octets[0] == 0
                || (octets[0] == 100 && (64..128).contains(&octets[1])) // 100.64.0.0/10
                || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0) // 192.0.0.0/24
                || (octets[0] == 198 && (octets[1] & 0xfe) == 18)) // 198.18.0.0/15
        }
        IpAddr::V6(v6) => {
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.is_multicast()
                || v6
                    .to_ipv4_mapped()
                    .map(|mapped| !is_public_ip(IpAddr::V4(mapped)))
                    .unwrap_or(false))
        }
    }
}

/// ホストが内部アドレスへ解決しないことを確認する。
/// 名前解決自体に失敗した場合は reqwest の接続失敗に任せる。
fn host_is_public(u: &reqwest::Url) -> bool {
    let host = match u.host_str() {
        Some(h) if !h.is_empty() => h,
        _ => return false,
    };
    let port = u.port_or_known_default().unwrap_or(443);
    match (host, port).to_socket_addrs() {
        Ok(addrs) => addrs.into_iter().all(|addr| is_public_ip(addr.ip())),
        Err(_) => true,
    }
}

enum BodyReadError {
    TooLarge,
    Read(String),
}

/// 応答本文を上限付きで読み切る。Content-Length を信用せず実バイト数で判定する。
fn read_body_limited(
    mut resp: reqwest::blocking::Response,
    limit: u64,
) -> Result<Vec<u8>, BodyReadError> {
    if let Some(length) = resp.content_length() {
        if length > limit {
            return Err(BodyReadError::TooLarge);
        }
    }
    let mut bytes = Vec::new();
    resp.by_ref()
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| BodyReadError::Read(e.to_string()))?;
    if bytes.len() as u64 > limit {
        return Err(BodyReadError::TooLarge);
    }
    Ok(bytes)
}

/// ホストに応じた既定のリファラー
fn derive_referer(hostname: &str) -> &'static str {
    let h = hostname.to_ascii_lowercase();
    if h.ends_with("pawchive.pw") {
        "https://pawchive.pw/"
    } else if h.ends_with("fanbox.cc") || h.ends_with("pximg.net") {
        "https://www.fanbox.cc/"
    } else if h.ends_with("patreon.com") || h.ends_with("patreonusercontent.com") {
        "https://www.patreon.com/"
    } else {
        // 投稿本文からの外部リンク等は fanbox 由来として扱う
        "https://www.fanbox.cc/"
    }
}

/// Referer に指定できるのは元サービス (FANBOX / Patreon) のページか、
/// 中継先と同じホストのページ (プロキシした HTML 内のサブリソース) だけ。
/// 任意サイトへの Referer 偽装を防ぐ。
fn is_allowed_referer(u: &reqwest::Url, target_host: &str) -> bool {
    if !matches!(u.scheme(), "http" | "https") {
        return false;
    }
    let h = u.host_str().unwrap_or("").to_ascii_lowercase();
    h == target_host.to_ascii_lowercase()
        || h == "fanbox.cc"
        || h.ends_with(".fanbox.cc")
        || h == "patreon.com"
        || h.ends_with(".patreon.com")
}

/// Pawchive 本体・API・画像配信サーバーは常に直接アクセスする。
fn is_pawchive_host(hostname: &str) -> bool {
    let h = hostname.to_ascii_lowercase();
    h == "pawchive.pw" || h.ends_with(".pawchive.pw")
}

/// プロキシ対象にできる URL か (http(s)・外部・SSRF でない)。
/// FANBOX / Patreon の画像ホストは Referer が必要なため、ここでは除外しない。
fn is_proxyable(u: &reqwest::Url) -> bool {
    matches!(u.scheme(), "http" | "https")
        && !forbidden_host(u.host_str().unwrap_or(""))
        && !is_pawchive_host(u.host_str().unwrap_or(""))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                if let Ok(b) = u8::from_str_radix(hex, 16) {
                    out.push(b);
                    i += 3;
                    continue;
                }
                out.push(b'%');
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// pkv プロトコルの URL を生成する
fn pkv_url(abs: &reqwest::Url, referer: &str) -> String {
    let mut u = reqwest::Url::parse(PKV_BASE_URL).unwrap();
    u.query_pairs_mut()
        .append_pair("u", abs.as_str())
        .append_pair("r", referer);
    u.to_string()
}

/// タグ内の属性値を書き換える (変換先が None の場合は元のまま)
fn rewrite_attr(tag: &str, attr: &str, transform: &dyn Fn(&str) -> Option<String>) -> String {
    let re = Regex::new(&format!(
        r#"(?is)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)')"#,
        attr
    ))
    .unwrap();
    if let Some(c) = re.captures(tag) {
        let val = c
            .get(2)
            .or_else(|| c.get(3))
            .map(|m| m.as_str())
            .unwrap_or("");
        if let Some(new) = transform(val) {
            let m0 = c.get(0).unwrap();
            let rebuilt = format!("{}=\"{}\"", attr, new.replace('"', "%22"));
            return format!(
                "{}{}{}",
                &tag[..m0.start()],
                rebuilt,
                &tag[m0.end()..]
            );
        }
    }
    tag.to_string()
}

/// 外部ページの HTML 変換:
/// - <base> 注入 (相対 URL を元サイト基準に)
/// - img / form / a の URL を pkv:// 経由に書き換え (リファラーを揃える)
fn transform_html(html: &str, target: &reqwest::Url, self_referer: &str) -> String {
    let base_href = target
        .join(".")
        .map(|u| u.to_string())
        .unwrap_or_else(|_| target.to_string());

    // <head ...> 直後に <base> を注入
    let lower = html.to_ascii_lowercase();
    let inject_at = match lower.find("<head") {
        Some(p) => match lower[p..].find('>') {
            Some(o) => p + o + 1,
            None => 0,
        },
        None => 0,
    };
    let base_tag = format!(r#"<base href="{}">"#, base_href);
    let html = if inject_at > 0 {
        format!("{}{}{}", &html[..inject_at], base_tag, &html[inject_at..])
    } else {
        format!("{}{}", base_tag, html)
    };

    // img
    let img_re = Regex::new(r#"(?is)<img\b[^>]*>"#).unwrap();
    let html = img_re
        .replace_all(&html, |c: &regex::Captures| {
            let tag = c.get(0).unwrap().as_str();
            rewrite_attr(tag, "src", &|v: &str| {
                if v.starts_with("data:") {
                    return None;
                }
                target
                    .join(v)
                    .ok()
                    .filter(|u| is_proxyable(u))
                    .map(|u| pkv_url(&u, self_referer))
            })
        })
        .into_owned();

    // form (action が無い場合は自身の URL への POST)
    let form_re = Regex::new(r#"(?is)<form\b[^>]*>"#).unwrap();
    let html = form_re
        .replace_all(&html, |c: &regex::Captures| {
            let tag = c.get(0).unwrap().as_str();
            rewrite_attr(tag, "action", &|v: &str| {
                let abs = if v.is_empty() {
                    Some(target.clone())
                } else {
                    target.join(v).ok()
                };
                abs.filter(|u| is_proxyable(u))
                    .map(|u| pkv_url(&u, self_referer))
            })
        })
        .into_owned();

    // a
    let a_re = Regex::new(r#"(?is)<a\b[^>]*>"#).unwrap();
    let html = a_re
        .replace_all(&html, |c: &regex::Captures| {
            let tag = c.get(0).unwrap().as_str();
            rewrite_attr(tag, "href", &|v: &str| {
                if v.starts_with('#') || v.starts_with("mailto:") || v.starts_with("javascript:") {
                    return None;
                }
                target
                    .join(v)
                    .ok()
                    .filter(|u| is_proxyable(u))
                    .map(|u| pkv_url(&u, self_referer))
            })
        })
        .into_owned();

    html
}

/// pkv:// ハンドラ本体 (GET / POST を中継)
fn pkv_proxy_fetch(
    app: &tauri::AppHandle,
    method: &str,
    uri: &str,
    body: Option<Vec<u8>>,
    range: Option<String>,
) -> tauri::http::Response<Vec<u8>> {
    use tauri::http::{header, Response};

    let bad = |status: u16, msg: &str| {
        Response::builder()
            .status(status)
            .body(msg.as_bytes().to_vec())
            .unwrap()
    };

    // クエリの解析 (u / r / f)
    let q = uri.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut u: Option<String> = None;
    let mut r: Option<String> = None;
    for pair in q.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        match percent_decode(k).as_str() {
            "u" => u = Some(percent_decode(v)),
            "r" => r = Some(percent_decode(v)),
            _ => {}
        }
    }
    let u = match u {
        Some(u) => u,
        None => return bad(400, "missing u"),
    };
    let target = match reqwest::Url::parse(&u) {
        Ok(t) => t,
        Err(_) => return bad(400, "bad url"),
    };
    // Pawchive 本体/API/画像サーバーは pkv 経由にしない。
    if !is_proxyable(&target) {
        log::warn!(
            target: "Pawchive::Proxy",
            "PROXY_BLOCKED destination={} reason=host",
            safe_log_url(&target)
        );
        return bad(403, "forbidden host");
    }
    // 名前解決後に内部アドレスへ向かうホストも拒否する (DNS リバインディング対策)
    if !host_is_public(&target) {
        log::warn!(
            target: "Pawchive::Proxy",
            "PROXY_BLOCKED destination={} reason=address",
            safe_log_url(&target)
        );
        return bad(403, "forbidden address");
    }

    let host = target.host_str().unwrap_or("").to_string();

    // リファラー: クエリ指定 (fanbox / patreon の記事 URL) を優先、無ければホスト別の既定値
    let mut referer = derive_referer(&host).to_string();
    if let Some(r) = &r {
        if let Ok(ru) = reqwest::Url::parse(r) {
            if is_allowed_referer(&ru, &host) {
                referer = ru.to_string();
            }
        }
    }
    let origin = reqwest::Url::parse(&referer)
        .map(|ru| {
            match ru.port() {
                Some(p) => format!("{}://{}:{}", ru.scheme(), ru.host_str().unwrap_or(""), p),
                None => format!("{}://{}", ru.scheme(), ru.host_str().unwrap_or("")),
            }
        })
        .unwrap_or_default();

    let client = &*PROXY_HTTP_CLIENT;

    let mut rb = match method {
        "POST" => client.post(target.clone()),
        _ => client.get(target.clone()),
    };
    rb = rb
        .header(header::REFERER, referer.as_str())
        .header(header::ORIGIN, origin.as_str());
    if let Some(rg) = &range {
        rb = rb.header(header::RANGE, rg.as_str());
    }
    if let Some(b) = body {
        rb = rb
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(b);
    }

    // Build once so Full diagnostics can inspect the exact outgoing request headers.
    let request = match rb.build() {
        Ok(r) => r,
        Err(e) => return bad(502, &format!("request build: {}", e)),
    };
    #[cfg(feature = "debug-diag")]
    {
        full_http_log(app, "Pawchive::Proxy", &format!("REQUEST method={} url={}", request.method(), safe_log_url(request.url())));
        log_http_headers(app, "Pawchive::Proxy", "REQUEST", request.headers());
        if let Some(request_body) = request.body().and_then(|b| b.as_bytes()) {
            log_http_request_body(app, "Pawchive::Proxy", request.headers().get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()), request_body);
        } else {
            full_http_log(app, "Pawchive::Proxy", "REQUEST_BODY <empty>");
        }
    }

    let resp = match client.execute(request) {
        Ok(r) => r,
        // reqwest のエラー表示は URL (クエリ含む) を含むため、ログ・応答から除去する
        Err(e) => {
            let e = e.without_url();
            let message = format!("PROXY_ERROR destination={} error={}", safe_log_url(&target), e);
            log::error!(target: "Pawchive::Proxy", "{}", message);
            append_app_log(app, &message);
            #[cfg(feature = "debug-diag")]
            full_http_log(app, "Pawchive::Proxy", &format!("TRANSPORT_ERROR url={} error={}", safe_log_url(&target), e));
            return bad(502, &format!("upstream: {}", e));
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let message = format!("PROXY_ERROR destination={} status={}", safe_log_url(&target), status);
        log::error!(target: "Pawchive::Proxy", "{}", message);
        append_app_log(app, &message);
    }
    #[cfg(feature = "debug-diag")]
    {
        full_http_log(app, "Pawchive::Proxy", &format!("RESPONSE url={} status={}", safe_log_url(&target), status));
        log_http_headers(app, "Pawchive::Proxy", "RESPONSE", resp.headers());
    }
    let ct = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // 外部 (direct 以外) ホストの HTML ページ: base 注入 + リンク/リソースのプロキシ化
    if ct.contains("text/html") && !is_direct_host(&host) {
        let bytes = match read_body_limited(resp, PROXY_MAX_HTML_BYTES) {
            Ok(bytes) => bytes,
            Err(BodyReadError::TooLarge) => {
                let message = format!("PROXY_ERROR destination={} body=too_large", safe_log_url(&target));
                log::error!(target: "Pawchive::Proxy", "{}", message);
                append_app_log(app, &message);
                return bad(413, "response too large");
            }
            Err(BodyReadError::Read(error)) => {
                let message = format!("PROXY_ERROR destination={} body_read_error={}", safe_log_url(&target), error);
                log::error!(target: "Pawchive::Proxy", "{}", message);
                append_app_log(app, &message);
                return bad(502, "upstream body");
            }
        };
        let html = String::from_utf8_lossy(&bytes).into_owned();
        #[cfg(feature = "debug-diag")]
        log_http_response_body(app, "Pawchive::Proxy", &html);
        let self_referer = format!("{}://{}/", target.scheme(), host);
        let out = transform_html(&html, &target, &self_referer);
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(out.into_bytes())
            .unwrap();
    }

    // そのまま中継 (バイナリ / direct ホストの HTML)。
    // ヘッダーは本文を読む前に控え、Content-Length は実バイト数で付け直す。
    let forwarded: Vec<(tauri::http::HeaderName, String)> = [
        header::CONTENT_TYPE,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
        header::CACHE_CONTROL,
        header::CONTENT_DISPOSITION,
        header::ETAG,
        header::LAST_MODIFIED,
    ]
    .iter()
    .filter_map(|name| {
        resp.headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(|value| (name.clone(), value.to_string()))
    })
    .collect();

    let bytes = match read_body_limited(resp, PROXY_MAX_BODY_BYTES) {
        Ok(bytes) => bytes,
        Err(BodyReadError::TooLarge) => {
            let message = format!("PROXY_ERROR destination={} body=too_large", safe_log_url(&target));
            log::error!(target: "Pawchive::Proxy", "{}", message);
            append_app_log(app, &message);
            return bad(413, "response too large");
        }
        Err(BodyReadError::Read(error)) => {
            let message = format!("PROXY_ERROR destination={} body_read_error={}", safe_log_url(&target), error);
            log::error!(target: "Pawchive::Proxy", "{}", message);
            append_app_log(app, &message);
            return bad(502, "upstream body");
        }
    };

    #[cfg(feature = "debug-diag")]
    if ct.starts_with("text/") || ct.contains("json") || ct.contains("xml") || ct.contains("javascript") {
        if let Ok(text) = std::str::from_utf8(&bytes) {
            log_http_response_body(app, "Pawchive::Proxy", text);
        } else {
            full_http_log(app, "Pawchive::Proxy", &format!("RESPONSE_BODY <non-utf8 text payload; {} bytes>", bytes.len()));
        }
    } else {
        full_http_log(app, "Pawchive::Proxy", &format!("RESPONSE_BODY <binary omitted; {} bytes>", bytes.len()));
    }

    let mut builder = Response::builder().status(status);
    for (name, value) in forwarded {
        builder = builder.header(name, value);
    }
    builder
        .header(header::CONTENT_LENGTH, bytes.len().to_string())
        .body(bytes)
        .unwrap()
}

type ProxyJob = (
    tauri::AppHandle,
    String,
    String,
    Option<Vec<u8>>,
    Option<String>,
    tauri::UriSchemeResponder,
);

/// pkv の要求を固定数のワーカーで処理する。
/// 1 要求 1 スレッドだと画像が多い画面でスレッドが増えすぎるため。
fn proxy_queue() -> &'static mpsc::Sender<ProxyJob> {
    static QUEUE: LazyLock<mpsc::Sender<ProxyJob>> = LazyLock::new(|| {
        let (sender, receiver) = mpsc::channel::<ProxyJob>();
        let receiver = Arc::new(Mutex::new(receiver));
        for index in 0..PROXY_WORKERS {
            let receiver = Arc::clone(&receiver);
            let _ = std::thread::Builder::new()
                .name(format!("pkv-proxy-{index}"))
                .spawn(move || loop {
                    let job = {
                        let receiver = match receiver.lock() {
                            Ok(receiver) => receiver,
                            Err(_) => return,
                        };
                        receiver.recv()
                    };
                    match job {
                        Ok((app, method, uri, body, range, responder)) => {
                            let response = pkv_proxy_fetch(&app, &method, &uri, body, range);
                            responder.respond(response);
                        }
                        Err(_) => return,
                    }
                });
        }
        sender
    });
    &QUEUE
}

#[tauri::command]
fn export_log(
    app: tauri::AppHandle,
    text: String,
) -> Result<String, String> {
    use std::io::Write;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // 起動ごとに 1 ファイル (JHenTai の logs/YYYY-MM-DD_HH-MM-SS.log 型)。
    // 同一セッション内の追記は JS 側のリングバッファ (formatLog) が担当する
    let name = format!("{}_viewer.log", chrono_free_name());
    let path = dir.join(&name);
    let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// 汎用テキストファイル書き出し (バックアップ等)。
/// %APPDATA%/backup/ に保存する。ファイル名は安全な文字のみ許可
#[tauri::command]
fn export_file(
    app: tauri::AppHandle,
    file_name: String,
    text: String,
) -> Result<String, String> {
    use std::io::Write;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backup");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // ファイル名のサニタイズ (パス区切り・予約文字を除去)
    let safe: String = file_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect();

    let safe = if safe.trim_matches(['_', '.']).is_empty() { "export.txt".to_string() } else { safe };
    // create_new prevents silently overwriting an earlier export with the same
    // timestamp/name (including concurrent export calls).
    for attempt in 0..100u32 {
        let suffix = if attempt == 0 { String::new() } else { format!("_{}", attempt) };
        let name = format!("{}_{}{}", chrono_free_name(), suffix, safe);
        let path = dir.join(&name);
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut f) => {
                f.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
                return Ok(path.to_string_lossy().to_string());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("could not allocate a unique export filename".into())
}

/// ファイル名用タイムスタンプ (追加依存を入れずに生成)
fn chrono_free_name() -> String {
    // エポック秒 → UTC 表記 (デバッグ用途のため秒精度で十分)
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let (y, m, d) = civil_from_days(days as i64);
    let rem = secs % 86400;
    format!(
        "{:04}-{:02}-{:02}_{:02}-{:02}-{:02}",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Howard Hinnant の civil_from_days (日数 → 年月日)
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

// ---------------------------------------------------------------------------
// デバッグ診断 (PC 向け・debug-diag feature のみ有効)
//
// フロントエンドのログ行を常時ファイルへ追記し、ログフォルダを
// エクスプローラで開けるようにする (PC でのログ収集を容易にするため)。
// リリースビルド (feature 無し) では分離される (登録自体も行わない)
// ---------------------------------------------------------------------------

/// Full diagnostics: フロントエンドの詳細ログをファイルへ追記する。
#[cfg(feature = "debug-diag")]
#[tauri::command]
fn debug_append_log(app: tauri::AppHandle, text: String) -> Result<(), String> {
    use std::io::Write;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("debug-app.log");
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", text).map_err(|e| e.to_string())?;
    Ok(())
}

/// Full diagnostics: ログフォルダを OS のファイラで開く。
#[cfg(feature = "debug-diag")]
#[tauri::command]
fn debug_open_log_folder(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let opener = "explorer";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let opener = "xdg-open";

    std::process::Command::new(opener)
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// クリエイターアイコンのディスクキャッシュ件数・合計バイト数
#[derive(serde::Serialize)]
pub struct IconCacheInfo {
    count: u64,
    bytes: u64,
}

fn icon_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("icons"))
}

#[tauri::command]
fn creator_icon_cache_info(app: tauri::AppHandle) -> Result<IconCacheInfo, String> {
    let dir = icon_cache_dir(&app)?;
    let mut info = IconCacheInfo { count: 0, bytes: 0 };
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            if let Ok(m) = e.metadata() {
                if m.is_file() {
                    info.count += 1;
                    info.bytes += m.len();
                }
            }
        }
    }
    Ok(info)
}

/// アイコンのディスクキャッシュを消去し、消した件数を返す
#[tauri::command]
fn clear_creator_icon_cache(app: tauri::AppHandle) -> Result<u64, String> {
    let dir = icon_cache_dir(&app)?;
    let mut n = 0u64;
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_file() && std::fs::remove_file(&p).is_ok() {
                n += 1;
            }
        }
    }
    Ok(n)
}

#[cfg(target_os = "android")]
#[tauri::command]
async fn set_android_launcher_icon(app: tauri::AppHandle, light: bool) -> Result<(), String> {
    tauri_plugin_locale_picker::run(&app, "setLauncherIcon", serde_json::json!({ "light": light }))
        .await
        .map(|_| ())
}

/// Referer にできるのは FANBOX / Patreon のページだけ (外部ページ用)
#[cfg(any(target_os = "android", target_os = "ios"))]
fn is_service_page(u: &reqwest::Url) -> bool {
    if !matches!(u.scheme(), "http" | "https") {
        return false;
    }
    let h = u.host_str().unwrap_or("").to_ascii_lowercase();
    h == "fanbox.cc"
        || h.ends_with(".fanbox.cc")
        || h == "patreon.com"
        || h.ends_with(".patreon.com")
}

/// 外部ページを実オリジンのまま Referer 付きで開く。
/// pkv プロキシでは reCAPTCHA 付きページを表示できないため、ネイティブビューへ委譲する。
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
async fn open_external_page(
    app: tauri::AppHandle,
    url: String,
    referer: String,
    creator_name: String,
    service: String,
    creator_id: String,
    post_id: String,
) -> Result<(), String> {
    let target = reqwest::Url::parse(&url).map_err(|_| "invalid url".to_string())?;
    if !matches!(target.scheme(), "http" | "https") {
        return Err("unsupported scheme".to_string());
    }
    let referer_url = reqwest::Url::parse(&referer).map_err(|_| "invalid referer".to_string())?;
    if !is_service_page(&referer_url) {
        return Err("referer must be a FANBOX or Patreon page".to_string());
    }
    tauri_plugin_external_view::open(&app, url, referer, creator_name, service, creator_id, post_id)
        .await
}

/// 外部ページの「画像を保存」で書き出された一覧を取り出す (取り出したら消す)。
/// 返り値は { creatorName, service, creatorId, postId, referer, pageUrl, images }。
#[tauri::command]
async fn take_external_page_images(
    app: tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    let directory = match app.path().document_dir() {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    let path = directory.join(".external-download.json");
    if !path.exists() {
        return Ok(None);
    }
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(_) => {
            let _ = std::fs::remove_file(&path);
            return Ok(None);
        }
    };
    let _ = std::fs::remove_file(&path);
    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    Ok(Some(value))
}

#[cfg(all(target_os = "ios", feature = "debug-diag"))]
#[tauri::command]
async fn external_page_diagnostic_events(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri_plugin_external_view::diagnostic_events(&app).await
}

#[tauri::command]
async fn open_in_browser(_app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = reqwest::Url::parse(&url).map_err(|_| "Invalid browser URL")?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() {
        return Err("Unsupported browser URL".into());
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return tauri_plugin_external_view::open_browser(&_app, url.to_string()).await;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        #[cfg(target_os = "windows")]
        let program = "explorer.exe";
        #[cfg(target_os = "macos")]
        let program = "open";
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let program = "xdg-open";
        std::process::Command::new(program)
            .arg(url.as_str())
            .spawn()
            .map(|_| ())
            .map_err(|_| "Could not open the browser".into())
    }
}

/// 一括画像ダウンロードの保存先 (クリエイター名ディレクトリ) を返す。
/// ディレクトリが無ければ作成する。
#[tauri::command]
fn resolve_download_directory(
    app: tauri::AppHandle,
    creator_name: String,
    service: String,
    creator_id: String,
) -> Result<String, String> {
    downloads::creator_directory(&app, &creator_name, &service, &creator_id)
        .map(|path| path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_dialog::init());
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder
        .plugin(tauri_plugin_locale_picker::init())
        .plugin(tauri_plugin_external_view::init());
    #[cfg(target_os = "ios")]
    let builder = builder.setup(|app| {
        if let Err(error) = locale_storage::prepare_ios_files_directory(app.handle()) {
            log::warn!("Could not prepare the Files directories: {error}");
        }
        Ok(())
    });
    builder
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_app_icon::init())
        .register_asynchronous_uri_scheme_protocol("pkv", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let method = request.method().as_str().to_string();
            let uri = request.uri().to_string();
            let range = request
                .headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let body = if method == "POST" {
                Some(request.body().clone())
            } else {
                None
            };
            // UI を止めないよう固定ワーカーへ投入する
            let job = (app, method, uri, body, range, responder);
            if let Err(mpsc::SendError((_, _, _, _, _, responder))) = proxy_queue().send(job) {
                let unavailable = tauri::http::Response::builder()
                    .status(503)
                    .body(b"proxy unavailable".to_vec())
                    .unwrap();
                responder.respond(unavailable);
            }
        })
        .invoke_handler(
            tauri::generate_handler![
                api_request,
                fetch_post_thumbnail,
                login_request,
                export_log,
                export_file,
                fetch_creator_icon,
                creator_icon_cache_info,
                clear_creator_icon_cache,
                locale_storage::list_locale_files,
                locale_storage::list_secondary_locale_files,
                locale_storage::export_locale_to_folder,
                #[cfg(feature = "debug-diag")]
                locale_storage::write_secondary_locale_file,
                #[cfg(feature = "debug-diag")]
                locale_storage::write_locale_file,
                #[cfg(feature = "debug-diag")]
                locale_storage::delete_locale_file,
                locale_storage::resolve_storage_location,
                json_files::pick_json_file,
                json_files::save_user_file,
                resolve_download_directory,
                downloads::download_post_images,
                downloads::cancel_download,
                open_in_browser,
                #[cfg(all(feature = "debug-diag", any(target_os = "android", target_os = "ios")))]
                locale_storage::save_locale_file_to_app_directory,
                #[cfg(target_os = "android")]
                set_android_launcher_icon,
                #[cfg(any(target_os = "android", target_os = "ios"))]
                open_external_page,
                take_external_page_images,
                #[cfg(all(target_os = "ios", feature = "debug-diag"))]
                external_page_diagnostic_events,
                // デバッグ診断コマンドは debug-diag feature のビルドにのみ含まれる
                // (リリースビルドでは分離)。tauri v2 の generate_handler は
                // 属性付き項目に対応している
                #[cfg(feature = "debug-diag")]
                debug_append_log,
                #[cfg(feature = "debug-diag")]
                debug_open_log_folder
            ]
        )
        .run(
            tauri::generate_context!()
        )
        .expect(
            "error while building tauri application",
        );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkv_scheme_base_parses() {
        // macOS / iOS / Linux で使う pkv:// 形式を、Windows でもパーサが受け付けることを確認する
        let parsed = reqwest::Url::parse("pkv://localhost/file").unwrap();
        assert_eq!(parsed.scheme(), "pkv");
        assert_eq!(parsed.host_str(), Some("localhost"));
    }

    #[test]
    fn pkv_url_keeps_target_and_referer() {
        let target = reqwest::Url::parse("https://example.com/a%20b.png?x=1&y=2").unwrap();
        let referer = "https://www.fanbox.cc/@tateha/posts/1";
        let url = pkv_url(&target, referer);
        assert!(url.starts_with(PKV_BASE_URL), "{url}");
        let parsed = reqwest::Url::parse(&url).unwrap();
        let pairs: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        assert_eq!(pairs.get("u").map(String::as_str), Some(target.as_str()));
        assert_eq!(pairs.get("r").map(String::as_str), Some(referer));
    }

    #[test]
    fn referer_allowlist_accepts_services_and_same_host_only() {
        let ok = |value: &str, host: &str| {
            is_allowed_referer(&reqwest::Url::parse(value).unwrap(), host)
        };
        assert!(ok("https://www.fanbox.cc/@tateha/posts/1", "example.com"));
        assert!(ok("https://tateha.fanbox.cc/posts/1", "example.com"));
        assert!(ok("https://www.patreon.com/posts/1", "example.com"));
        assert!(ok("https://cdn.example.com/page", "cdn.example.com"));
        assert!(!ok("https://evil.example/redirect", "example.com"));
        assert!(!ok("javascript:alert(1)", "example.com"));
        assert!(!ok("file:///etc/passwd", "example.com"));
    }

    #[test]
    fn proxy_host_guards_block_internal_and_pawchive_hosts() {
        assert!(forbidden_host("127.0.0.1"));
        assert!(forbidden_host("localhost"));
        assert!(forbidden_host("printer.local"));
        assert!(!forbidden_host("example.com"));
        assert!(is_pawchive_host("img.pawchive.pw"));
        assert!(!is_proxyable(&reqwest::Url::parse("https://pawchive.pw/x").unwrap()));
        assert!(is_proxyable(&reqwest::Url::parse("https://example.sakura.ne.jp/x").unwrap()));
    }

    #[test]
    fn resolved_private_and_special_addresses_are_rejected() {
        for value in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "198.18.0.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:192.168.0.1",
        ] {
            let ip: IpAddr = value.parse().unwrap();
            assert!(!is_public_ip(ip), "{value} must be rejected");
        }
        for value in ["1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"] {
            let ip: IpAddr = value.parse().unwrap();
            assert!(is_public_ip(ip), "{value} must be accepted");
        }
    }
}
