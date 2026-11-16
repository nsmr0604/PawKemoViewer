// api_request と同一のヘッダー/クライアント構成で pawchive API に実アクセスする検証ツール
// 使い方: cargo run --offline --manifest-path src-tauri/Cargo.toml --example probe_api
use reqwest::blocking::Client;
use reqwest::header::{
    HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, ORIGIN, REFERER, USER_AGENT,
};

fn main() {
    // --- 1. api_request と同一構成: GET /posts?o=0 ---
    let url = "https://pawchive.pw/api/v1/posts?o=0";
    let client = Client::builder()
        .brotli(true)
        .gzip(true)
        .build()
        .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("application/json,text/plain,*/*"));
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("ja,en-US;q=0.9,en;q=0.8"));
    headers.insert(REFERER, HeaderValue::from_static("https://pawchive.pw/"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://pawchive.pw"));

    let resp = client.get(url).headers(headers).send().unwrap();
    let status = resp.status();
    let body = resp.text().unwrap();
    println!("[1] GET /posts?o=0 -> {}", status);
    println!("    body[:300] = {}", body.chars().take(300).collect::<String>());

    // --- 2. ORIGIN/REFERER 無し ---
    let resp2 = client
        .get(url)
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")
        .header(ACCEPT, "application/json,text/plain,*/*")
        .send()
        .unwrap();
    println!("[2] ORIGIN/REFERER 無し -> {}", resp2.status());

    // --- 3. ログイン POST (login_request と同一) ---
    let lc = Client::builder()
        .brotli(true)
        .gzip(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let resp3 = lc
        .post("https://pawchive.pw/account/login")
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")
        .header(REFERER, "https://pawchive.pw/account/login")
        .header(ORIGIN, "https://pawchive.pw")
        .form(&[
            ("username", "probe_test_user"),
            ("password", "probe_test_pass"),
            ("location", "/login"),
        ])
        .send()
        .unwrap();
    println!("[3] POST /account/login -> {}", resp3.status());
    for sc in resp3.headers().get_all("set-cookie") {
        println!("    set-cookie: {}", sc.to_str().unwrap_or("<non-ascii>"));
    }
}
