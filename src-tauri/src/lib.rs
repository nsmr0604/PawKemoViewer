use regex::Regex;
use reqwest::header::{
    HeaderMap,
    HeaderValue,
    ACCEPT,
    ACCEPT_LANGUAGE,
    CACHE_CONTROL,
    COOKIE,
    CONTENT_DISPOSITION,
    CONTENT_LENGTH,
    CONTENT_RANGE,
    CONTENT_TYPE,
    ETAG,
    LAST_MODIFIED,
    ORIGIN,
    REFERER,
    SET_COOKIE,
    USER_AGENT,
    ACCEPT_RANGES,
};

#[tauri::command]
async fn api_request(
    path: String,
    method: String,
    session_key: Option<String>,
) -> Result<String, String> {
    let path = path.trim_start_matches('/');

    let url = format!(
        "https://pawchive.pw/api/v1/{}",
        path
    );

    println!("REQUEST => {}", url);

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
            let cookie =
                format!("session={}", session);

            headers.insert(
                COOKIE,
                HeaderValue::from_str(&cookie)
                    .map_err(|e| e.to_string())?,
            );
        }
    }

    println!("METHOD => {}", method);

    let response = match method.as_str() {
        "POST" => {
            client
                .post(&url)
                .headers(headers)
                .send()
                .await
        }

        "DELETE" => {
            client
                .delete(&url)
                .headers(headers)
                .send()
                .await
        }

        _ => {
            client
                .get(&url)
                .headers(headers)
                .send()
                .await
        }
    }
    .map_err(|e| e.to_string())?;

    let status = response.status();

    let response_headers =
        response.headers().clone();

    let text = response
        .text()
        .await
        .map_err(|e| e.to_string())?;

    println!("STATUS => {}", status);

    if !status.is_success() {
        return Err(
            format!(
                "STATUS={}\nHEADERS={:#?}\nBODY={}",
                status,
                response_headers,
                text
            )
        );
    }

    Ok(text)
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
async fn login_request(username: String, password: String) -> Result<LoginResult, String> {
    if username.is_empty() || password.is_empty() {
        return Ok(LoginResult {
            ok: false,
            session: None,
            error: Some("ユーザー名とパスワードを入力してください".into()),
        });
    }

    // リダイレクトを追従しない (pawchive は 302 応答に Set-Cookie を付けるため。
    // 追従すると最終応答のヘッダーしか見えず session を取り逃す)
    let client = reqwest::Client::builder()
        .brotli(true)
        .gzip(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

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

    let resp = client
        .post("https://pawchive.pw/account/login")
        .headers(headers)
        .form(&form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut session: Option<String> = None;
    for sc in resp.headers().get_all(SET_COOKIE) {
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
            if let Ok(v) = client
                .get("https://pawchive.pw/api/v1/account/favorites?type=artist")
                .headers(vh)
                .send()
                .await
            {
                ok = v.status().is_success();
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
// paw:// プロトコル (リファラー偽装プロキシ)
//
// WebView (tauri://localhost) からは Referer を自由に設定できないため、
// リファラーチェックでブロックされる fanbox / patreon / 外部サイトの
// ファイル・ページを Rust 側で Referer/Origin を偽装して中継する。
//
// WebView 側の URL: http://paw.localhost/file?u=<対象URL>&r=<リファラー>
//  - GET  : ファイル/ページ取得
//  - POST : 外部ページ内のフォーム送信を中継 (reCAPTCHA 付きフォーム等)
// ---------------------------------------------------------------------------

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

/// ホストに応じた既定のリファラー
fn derive_referer(hostname: &str) -> &'static str {
    let h = hostname.to_ascii_lowercase();
    if h.ends_with("fanbox.cc") || h.ends_with("pximg.net") {
        "https://www.fanbox.cc/"
    } else if h.ends_with("patreon.com") || h.ends_with("patreonusercontent.com") {
        "https://www.patreon.com/"
    } else {
        // 投稿本文からの外部リンク等は fanbox 由来として扱う
        "https://www.fanbox.cc/"
    }
}

/// プロキシ対象にできる URL か (http(s)・外部・SSRF でない)
fn is_proxyable(u: &reqwest::Url) -> bool {
    matches!(u.scheme(), "http" | "https")
        && !forbidden_host(u.host_str().unwrap_or(""))
        && !is_direct_host(u.host_str().unwrap_or(""))
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

/// paw プロトコルの URL を生成する
fn paw_url(abs: &reqwest::Url, referer: &str) -> String {
    let mut u = reqwest::Url::parse("http://paw.localhost/file").unwrap();
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
/// - img / form / a の URL を paw:// 経由に書き換え (リファラーを揃える)
fn transform_html(html: &str, target: &reqwest::Url, self_referer: &str) -> String {
    let base_href = target
        .join(".")
        .map(|u| u.to_string())
        .unwrap_or_else(|| target.to_string());

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
                    .map(|u| paw_url(&u, self_referer))
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
                    .map(|u| paw_url(&u, self_referer))
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
                    .map(|u| paw_url(&u, self_referer))
            })
        })
        .into_owned();

    html
}

/// paw:// ハンドラ本体 (GET / POST を中継)
fn paw_proxy_fetch(
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

    // クエリの解析 (u / r)
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
    if !is_proxyable(&target) {
        return bad(403, "forbidden host");
    }

    let host = target.host_str().unwrap_or("").to_string();

    // リファラー: クエリ指定 (https) を優先、無ければホスト別の既定値
    let mut referer = derive_referer(&host).to_string();
    if let Some(r) = &r {
        if r.starts_with("http") && reqwest::Url::parse(r).is_ok() {
            referer = r.clone();
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

    let client = match reqwest::blocking::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        )
        .gzip(true)
        .build()
    {
        Ok(c) => c,
        Err(e) => return bad(500, &format!("client: {}", e)),
    };

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

    let resp = match rb.send() {
        Ok(r) => r,
        Err(e) => return bad(502, &format!("upstream: {}", e)),
    };

    let status = resp.status();
    let ct = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // 外部 (direct 以外) ホストの HTML ページ: base 注入 + リンク/リソースのプロキシ化
    if ct.contains("text/html") && !is_direct_host(&host) {
        let html = resp.text().unwrap_or_default();
        let self_referer = format!("{}://{}/", target.scheme(), host);
        let out = transform_html(&html, &target, &self_referer);
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(out.into_bytes())
            .unwrap();
    }

    // そのまま中継 (バイナリ / direct ホストの HTML)
    let mut b = Response::builder().status(status);
    for h in [
        header::CONTENT_TYPE,
        header::CONTENT_LENGTH,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
        header::CACHE_CONTROL,
        header::CONTENT_DISPOSITION,
        header::ETAG,
        header::LAST_MODIFIED,
    ] {
        if let Some(v) = resp.headers().get(h).and_then(|v| v.to_str().ok()) {
            b = b.header(h, v);
        }
    }
    let bytes = resp.bytes().unwrap_or_default();
    b.body(bytes.to_vec()).unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .register_asynchronous_uri_scheme_protocol("paw", |_ctx, request, responder| {
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
            // ブロッキング取得は別スレッドで行う (UI を止めない)
            std::thread::spawn(move || {
                let response = paw_proxy_fetch(&method, &uri, body, range);
                responder.respond(response);
            });
        })
        .invoke_handler(
            tauri::generate_handler![
                api_request,
                login_request
            ]
        )
        .run(
            tauri::generate_context!()
        )
        .expect(
            "error while building tauri application",
        );
}