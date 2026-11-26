# Rust 実装リファレンス

PawKemoViewer のネイティブ側 (`src-tauri/`) の全モジュール、Tauri コマンド、内部関数のリファレンスです。コマンドの利用者向け概要と pawchive API は [API 仕様](../API.md)、一括保存の画面仕様は[一括画像保存](../features/image-download.md)、ヘッダー設計は [HTTP User-Agent とヘッダー](../architecture/http-user-agent.md) を参照してください。ここでは引数、戻り値、エラー文字列、実装上の性質だけを扱います。

対象は 0.6.0 の作業ツリーです。行番号は記述せず、ファイルパスとシンボル名で示します。

## 1. crate 構成とビルド条件

### クレート

`src-tauri/Cargo.toml` の定義です。

| 項目 | 値 |
|---|---|
| package 名 | `pawkemoviewer` (0.6.0) |
| edition / rust-version | `2024` / `1.90` |
| lib 名 | `pawkemoviewer_lib` |
| crate-type | `staticlib` / `cdylib` / `rlib` |
| build script | `src-tauri/build.rs` → `tauri_build::build()` のみ |
| エントリ | `src/main.rs` の `main()` が `pawkemoviewer_lib::run()` を呼ぶ |

`staticlib` / `cdylib` は Android / iOS のネイティブ側からリンクするためで、デスクトップでも同じ lib を使います。`main.rs` は Windows のリリースビルドでコンソールを出さない `windows_subsystem = "windows"` だけを持つ薄いラッパーです。

### feature

| feature | 内容 |
|---|---|
| `debug-diag` | 詳細診断。`tauri-plugin-external-view/debug-diag` を有効化する |

`debug-diag` は「コードをビルド時に分離する」規約のためのフラグです。リリースビルドでは次が**コンパイルも登録もされません**。

- 診断コマンド: `debug_append_log` / `debug_open_log_folder` / `write_locale_file` / `delete_locale_file` / `write_secondary_locale_file` / `save_locale_file_to_app_directory` (モバイルのみ) / `external_page_diagnostic_events` (iOS のみ)
- ログ関数: `full_http_log` / `log_http_headers` / `log_http_request_body` / `log_http_response_body`
- `json_files` の `JsonPurpose::Locale` / `ExportPurpose::Locale` 列挙子 (製品版では `locale` を指定できない)

実行時判定 (`cfg!(debug_assertions)` や is_debug コマンド) は使っていません。フロント側は `VITE_DEBUG_DIAG` → `src/build-flags.ts` の `DEBUG_DIAG` で対応します。

### target 別依存

`src-tauri/Cargo.toml` の target 依存です。

| target | 依存 | 用途 |
|---|---|---|
| `cfg(windows)` | `webview2-com = "0.39"`, `windows = "0.62"` | 外部ページの初回ナビゲーションに Referer を付ける (`WebResourceRequested` でヘッダー差し替え) |
| `cfg(target_os = "macos")` | `objc2 = "0.6"`, `objc2-foundation = "0.3"` (`NSURL` / `NSURLRequest` / `NSString`), `objc2-web-kit = "0.3"` (`WKWebView`) | `NSMutableURLRequest` に Referer を載せて `loadRequest` |
| `cfg(target_os = "linux")` | `webkit2gtk = "=2.0.2"` (`v2_38`) | Referer 付きで取得した HTML を `load_html` で読み込む |
| `cfg(any(android, ios))` | `tauri-plugin-locale-picker`, `tauri-plugin-external-view` (path 依存) | ネイティブのファイルピッカー / 外部ページビュー |
| `cfg(target_os = "android")` | `tauri-plugin-downloads-store` (path 依存) | 共有 `Download/` への MediaStore 保存 |
| `cfg(not(any(android, ios)))` | `tauri-plugin-dialog = "2"` | デスクトップのファイル選択・保存ダイアログ |

共通依存は `tauri 2`、`tauri-plugin-log 2`、`tauri-plugin-app-icon 0.1.0`、`log`、`serde` / `serde_json`、`regex`、`base64 0.22`、および `reqwest 0.12` (`default-features = false` + `json` / `cookies` / `gzip` / `brotli` / `deflate` / `rustls-tls` / `blocking`) です。OpenSSL は使いません (Android 対応と `rustls` 統一のため)。

### 実行時設定

`src-tauri/tauri.conf.json` は `security.csp = null`、identifier は `com.nsmr0604.pawkemoviewer`、メインウィンドウは 1280×900 (最小 900×700) です。`src-tauri/capabilities/default.json` は `core:default` と `app-icon:default` のみを許可します。アプリ独自コマンドは capability では制御されず、`invoke_handler` への登録で公開範囲が決まります。

`run()` が組み立てるプラグインは次の順です。

1. デスクトップ: `tauri_plugin_dialog::init()`
2. モバイル: `tauri_plugin_locale_picker::init()` → `tauri_plugin_external_view::init()`
3. Android のみ `tauri_plugin_downloads_store::init()`（共有 `Download/` への MediaStore 保存）
4. iOS のみ `setup` で `locale_storage::prepare_ios_files_directory`
5. `tauri_plugin_log` (level `Info`)
6. `tauri_plugin_app_icon::init()`
7. `register_asynchronous_uri_scheme_protocol("pkv", ...)`
8. `invoke_handler(generate_handler![...])`

## 2. Tauri コマンド一覧

アプリ独自定義は **25 コマンド**です。JS 引数は camelCase、`AppHandle` は Tauri が注入するため JS から渡しません。戻り値は特に断りがなければ `Result<T, String>` の `T` で、`Err(String)` が JS の reject 文言になります。

### 通信・ログイン

| コマンド | JS 引数 | 戻り値 | 主な Err 文字列 | 登録条件 | 実装 |
|---|---|---|---|---|---|
| `set_http_user_agent` | `userAgent` | `()` | `invalid user agent`, `user agent lock poisoned` | 全 OS | `lib.rs` |
| `fetch_post_thumbnail` | `path` | `tauri::ipc::Response` (画像バイト列) | `Invalid thumbnail path`, `Unsupported thumbnail type`, `Thumbnail is too large` | 全 OS | `lib.rs` |
| `api_request` | `path`, `method`, `sessionKey?`, `timeoutSecs?` | レスポンス本文の生文字列 | `invalid user agent`, transport の `e.to_string()`, `STATUS=<code> BODY=<本文>` | 全 OS | `lib.rs` |
| `login_request` | `username`, `password`, `timeoutSecs?` | `LoginResult { ok, session, error }` | `invalid user agent`, transport の `e.to_string()` | 全 OS | `lib.rs` |
| `fetch_creator_icon` | `service`, `id` | `Option<String>` (webp の data URL) | `invalid creator id`, `invalid user agent`, `app_data_dir` 取得エラー | 全 OS | `lib.rs` |
| `open_in_browser` | `url` | `()` | `Invalid browser URL`, `Unsupported browser URL`, `Could not open the browser` | 全 OS | `lib.rs` |

`login_request` は認証失敗でも `Ok` を返し、`error` に次を入れます。

- `ユーザー名とパスワードを入力してください` (空入力)
- `ユーザー名またはパスワードが正しくありません` (session 取得または検証失敗)

### ログ・アイコンキャッシュ

| コマンド | JS 引数 | 戻り値 | 主な Err 文字列 | 登録条件 | 実装 |
|---|---|---|---|---|---|
| `debug_append_log` | `text` | `()` | パス・I/O エラー | `debug-diag` | `lib.rs` |
| `debug_open_log_folder` | なし | ログフォルダーの絶対パス | パス・起動エラー | `debug-diag` | `lib.rs` |
| `creator_icon_cache_info` | なし | `IconCacheInfo { count, bytes }` | `app_data_dir` 取得エラー | 全 OS | `lib.rs` |
| `clear_creator_icon_cache` | なし | 削除件数 `u64` | `app_data_dir` 取得エラー | 全 OS | `lib.rs` |

旧 `export_log` / `export_file` は未使用のため削除済み (保存は `save_user_file` 系へ移行済み)。

### 言語ファイル・JSON ファイル

| コマンド | JS 引数 | 戻り値 | 主な Err 文字列 | 登録条件 | 実装 |
|---|---|---|---|---|---|
| `list_locale_files` | なし | `LocaleList { dir, files, invalid }` | ディレクトリ読み取りエラー | 全 OS | `locale_storage.rs` |
| `list_secondary_locale_files` | なし | `LocaleList` | 同上 | 全 OS | `locale_storage.rs` |
| `export_locale_to_folder` | `code`, `json` | `true`=新規 / `false`=既存あり | `Invalid locale export` | 全 OS | `locale_storage.rs` |
| `write_locale_file` | `code`, `json`, `replaceExisting?` | ファイルパス | `invalid locale code`, `locale file too large`, `Locale write lock unavailable`, `A locale file with this code already exists` | `debug-diag` | `locale_storage.rs` |
| `delete_locale_file` | `code` | `bool` (存在して消せたか) | `invalid locale code` | `debug-diag` | `locale_storage.rs` |
| `write_secondary_locale_file` | `code`, `json` | ファイルパス | `invalid locale code`, `locale file too large`, `secondary locale storage unavailable` (モバイル) | `debug-diag` | `locale_storage.rs` |
| `resolve_storage_location` | `area`, `purpose` | `Option<String>` (パス) | `invalid storage purpose`, `invalid storage area` | 全 OS | `locale_storage.rs` |
| `save_locale_file_to_app_directory` | `code`, `json` | `{ kind, path }` | `Invalid locale export`, ネイティブ側の reject | Android・iOS + `debug-diag` | `locale_storage.rs` |
| `pick_json_file` | `purpose`, `appDirectory?` | `{kind:"selected",name,json}` / `{kind:"cancelled"}` / `{kind:"missing"}` | `Only backups can be opened directly`, `JSON file exceeds the size limit`, `JSON file is not UTF-8`, `Missing file name`, `A file operation is already open` | 全 OS | `json_files.rs` |
| `save_user_file` | `purpose`, `filename`, `text`, `appDirectory?` | `{kind:"saved",path}` / `{kind:"cancelled"}` | `Invalid export file name or size`, `A file operation is already open`, I/O エラー | 全 OS | `json_files.rs` |

`purpose` の値は `backup` / `log`、`debug-diag` のみ `locale` です。`json` はパース済みオブジェクトではなく UTF-8 の生文字列です。

### 外部ページ・アイコン

| コマンド | JS 引数 | 戻り値 | 主な Err 文字列 | 登録条件 | 実装 |
|---|---|---|---|---|---|
| `open_external_page` | `url`, `referer`, `creatorName`, `service`, `creatorId`, `postId` | `()` | `invalid url`, `unsupported scheme`, `invalid referer`, `referer must be a FANBOX or Patreon page` | 全 OS | `lib.rs` |
| `take_external_page_images` | なし | `Option<serde_json::Value>` | なし (失敗は `Ok(None)`) | 全 OS | `lib.rs` |
| `external_page_diagnostic_events` | なし | `{ device, osVersion, events }` | ネイティブ側の reject | iOS + `debug-diag` | `lib.rs` |
| `set_android_launcher_icon` | `light` | `()` | ネイティブ側の reject (`Could not switch launcher icon`) | Android | `lib.rs` |

### 一括保存

| コマンド | JS 引数 | 戻り値 | 主な Err 文字列 | 登録条件 | 実装 |
|---|---|---|---|---|---|
| `download_post_images` | `creatorName`, `service`, `creatorId`, `referer`, `images`, `pages`, `sessionKey?`, `imageReferer?` | `DownloadSummary` | `referer must be a FANBOX or Patreon page`, `invalid image referer`, `download already running` | 全 OS | `downloads.rs` |
| `cancel_download` | なし | `()` | なし | 全 OS | `downloads.rs` |

`images` は `{ url, name? }` の配列、`pages` は外部ページ URL の配列です。`DownloadSummary` は `{ directory, saved, skipped, cancelled, failed: [{url, reason}] }` です。

## 3. モジュール別リファレンス

### src/main.rs

役割: デスクトップの実行ファイル入口。

| 関数 | シグネチャ | 説明 |
|---|---|---|
| `main` | `fn main()` | `pawkemoviewer_lib::run()` を呼ぶだけ。リリースビルドでコンソールを抑止する属性を持つ |

モバイルではこのバイナリを使わず、`run()` の `#[cfg_attr(mobile, tauri::mobile_entry_point)]` が入口になります。

### src/lib.rs

役割: アプリ本体。順に HTTP 中核、API 中継、ログイン、アイコン、pkv プロキシ、ログ書き出し、診断、外部ページ入口、一括保存の保存先、`run()` を収めます。`mod json_files; mod locale_storage; mod downloads;` と、デスクトップ限定の `mod external_page_desktop;` を宣言します。

#### 関数

| 名前 | シグネチャ | 戻り値 | 説明・性質 |
|---|---|---|---|
| `current_user_agent` | `pub(crate) fn current_user_agent() -> String` | UA 文字列 | `HTTP_USER_AGENT` を lock して複製。未設定・lock 失敗時は `DEFAULT_USER_AGENT` |
| `set_http_user_agent` | `fn set_http_user_agent(user_agent: String) -> Result<(), String>` | `Result<(), String>` | 空・512 バイト超・制御文字を含む値を拒否。コマンド |
| `safe_log_url` | `fn safe_log_url(url: &reqwest::Url) -> String` | 文字列 | user-info を除去し、`token` / `secret` / `session` / `auth` / `api_key` / `apikey` / `signature` / `sig` / `credential` / `password` / `passwd` / `jwt` を含むクエリ値を `<redacted>` に置換 |
| `append_app_log` | `fn append_app_log(app: &tauri::AppHandle, line: &str)` | `()` | `app_data/logs/pawchive.log` へ 1 行追記。失敗は `log::error!` のみで呼び出し元へ返さない |
| `full_http_log` | `fn full_http_log(app, target, message)` (`debug-diag`) | `()` | `log::info!` と `append_app_log` の二重出力 |
| `log_http_headers` | `fn log_http_headers(app, target, direction, headers)` (`debug-diag`) | `()` | ヘッダーを 1 行ずつ出力。`authorization` / `cookie` / `set-cookie` / `x-api-key` / `x-auth-token` 等と、名前に `token` / `secret` / `session` / `cookie` / `auth` / `api-key` / `password` / `jwt` を含む値を `<redacted>` |
| `log_http_request_body` | `fn log_http_request_body(app, target, content_type, body)` (`debug-diag`) | `()` | 非 UTF-8 は base64。form / JSON は秘密キーを `<redacted>` にし、3000 バイトごとに分割出力 |
| `log_http_response_body` | `fn log_http_response_body(app, target, body)` (`debug-diag`) | `()` | UTF-8 境界を保って 3000 バイトずつ分割。空は `<empty>` |
| `fetch_post_thumbnail` | `async fn fetch_post_thumbnail(path: String) -> Result<tauri::ipc::Response, String>` | `Response` | `img.pawchive.pw/thumbnail/data<path>` を取得。タイムアウト 15 秒、上限 4 MiB、`image/jpeg` / `image/png` / `image/webp` / `image/gif` / `image/avif` のみ許可 |
| `api_request` | `async fn api_request(app, path, method, session_key, timeout_secs) -> Result<String, String>` | 本文 | `https://pawchive.pw/api/v1/<path>` へ `POST` / `DELETE` / それ以外は GET。body は送らない。timeout は既定 30 秒、1〜300 秒へ clamp |
| `login_request` | `async fn login_request(app, username, password, timeout_secs) -> Result<LoginResult, String>` | `LoginResult` | リダイレクト追従なしの client で `POST /account/login`。`Set-Cookie` から `session` を取り出し、`GET /api/v1/account/favorites?type=artist` が成功するかで有効性を判定 |
| `fetch_creator_icon` | `async fn fetch_creator_icon(app, service, id) -> Result<Option<String>, String>` | data URL | `app_data/icons/{service}_{id}.webp` を先に読む。無ければ `https://pawchive.pw/icons/{service}/{id}` を 15 秒で取得。204・非成功・`image/` 以外・空は `Ok(None)` |
| `forbidden_host` | `fn forbidden_host(hostname: &str) -> bool` | `bool` | `localhost`、`.localhost`、`.local`、`.internal`、IPv6 リテラル、単一ラベル、IPv4 リテラルを拒否 |
| `is_public_ip` | `fn is_public_ip(ip: IpAddr) -> bool` | `bool` | private / loopback / link-local / unspecified / broadcast / multicast、`0.0.0.0/8`、`100.64.0.0/10`、`192.0.0.0/24`、`198.18.0.0/15`、IPv6 の ULA・link-local・IPv4-mapped を拒否 |
| `host_is_public` | `fn host_is_public(u: &reqwest::Url) -> bool` | `bool` | 名前解決した全アドレスが public か。**解決失敗は `false` (fail-closed)** |
| `read_body_limited` | `fn read_body_limited(resp, limit) -> Result<Vec<u8>, BodyReadError>` | バイト列 | `Content-Length` を先に見てから `take(limit + 1)` で実バイト数を判定 |
| `derive_referer` | `fn derive_referer(hostname: &str) -> &'static str` | Referer | pawchive → `https://pawchive.pw/`、fanbox / pximg → `https://www.fanbox.cc/`、patreon → `https://www.patreon.com/`、その他 → fanbox |
| `is_allowed_referer` | `fn is_allowed_referer(u: &reqwest::Url, target_host: &str) -> bool` | `bool` | `http`/`https` かつ、中継先と同一ホスト、または fanbox / patreon とそのサブドメインのみ許可 |
| `is_pawchive_host` | `fn is_pawchive_host(hostname: &str) -> bool` | `bool` | `pawchive.pw` とサブドメイン |
| `is_proxyable` | `fn is_proxyable(u: &reqwest::Url) -> bool` | `bool` | `http`/`https` かつ `forbidden_host` でなく `is_pawchive_host` でもない |
| `percent_decode` | `fn percent_decode(s: &str) -> String` | 文字列 | `%XX` と `+` を戻す。不正な `%` はそのまま残す |
| `pkv_proxy_fetch` | `fn pkv_proxy_fetch(app, method, uri, body, range) -> tauri::http::Response<Vec<u8>>` | HTTP 応答 | pkv の実処理。`text/html` は 415 で拒否する。詳細は「4. pkv プロキシ」 |
| `proxy_queue` | `fn proxy_queue() -> &'static mpsc::SyncSender<ProxyJob>` | SyncSender | 4 スレッドのワーカーを一度だけ起動し、固定長キュー (128) に配送。満杯は 503 |
| `debug_append_log` | `fn debug_append_log(app, text) -> Result<(), String>` (`debug-diag`) | `()` | `app_data/logs/debug-app.log` へ追記 |
| `debug_open_log_folder` | `fn debug_open_log_folder(app) -> Result<String, String>` (`debug-diag`) | パス | `explorer` / `open` / `xdg-open` でログフォルダーを開く |
| `icon_cache_dir` | `fn icon_cache_dir(app) -> Result<PathBuf, String>` | パス | `app_data/icons` |
| `creator_icon_cache_info` | `fn creator_icon_cache_info(app) -> Result<IconCacheInfo, String>` | 件数とバイト数 | ディレクトリ内のファイルを集計。読めない項目は黙って除外 |
| `clear_creator_icon_cache` | `fn clear_creator_icon_cache(app) -> Result<u64, String>` | 削除件数 | 削除に成功したファイルだけ数える |
| `set_android_launcher_icon` | `async fn set_android_launcher_icon(app, light) -> Result<(), String>` (Android) | `()` | `locale-picker` の `setLauncherIcon` を呼ぶ |
| `is_service_page` | `fn is_service_page(u: &reqwest::Url) -> bool` | `bool` | 外部ページの Referer 用。fanbox / patreon とそのサブドメインのみ |
| `open_external_page` | `async fn open_external_page(app, url, referer, creator_name, service, creator_id, post_id) -> Result<(), String>` | `()` | モバイルはプラグイン、デスクトップは専用ウィンドウ |
| `take_external_page_images` | `async fn take_external_page_images(app) -> Result<Option<serde_json::Value>, String>` | JSON または `None` | `Documents/.external-download.json` を上限 1 MiB で読み、JSON を検証できた後に削除して返す |
| `external_page_diagnostic_events` | `async fn external_page_diagnostic_events(app) -> Result<serde_json::Value, String>` (iOS + `debug-diag`) | 診断 JSON | プラグインの `diagnosticEvents` を中継 |
| `open_in_browser` | `async fn open_in_browser(_app, url) -> Result<(), String>` | `()` | モバイルはプラグイン、デスクトップは `explorer.exe` / `open` / `xdg-open` |
| `run` | `pub fn run()` | — | プラグイン登録、pkv プロトコル登録、25 コマンド登録、`run(generate_context!())` |

#### 構造体

| 型 | フィールド | 意味 |
|---|---|---|
| `LoginResult` (`Serialize`) | `ok: bool` / `session: Option<String>` / `error: Option<String>` | ログイン結果。認証失敗でも `Ok` で返る |
| `IconCacheInfo` (`Serialize`) | `count: u64` / `bytes: u64` | アイコンのディスクキャッシュ量 |
| `BodyReadError` (非公開) | `TooLarge` / `Read(String)` | 本文読み取りの失敗種別 (413 と 502 の振り分けに使う) |
| `ProxyJob` (型エイリアス) | `(AppHandle, String, String, Option<Vec<u8>>, Option<String>, UriSchemeResponder)` | pkv の 1 ジョブ (method, uri, body, range, responder) |

#### 定数・static

| 名前 | 値 / 型 | 意味 |
|---|---|---|
| `DEFAULT_USER_AGENT` | Windows Chrome 142 の UA | UA 未設定時の既定 |
| `HTTP_USER_AGENT` | `LazyLock<Mutex<Option<String>>>` | 設定で選ばれた UA |
| `API_HTTP_CLIENT` | `LazyLock<reqwest::Client>` | 接続プール共有用。brotli / gzip 有効 |
| `LOGIN_HTTP_CLIENT` | `LazyLock<reqwest::Client>` | リダイレクト追従なし (302 の `Set-Cookie` を取り逃さないため) |
| `PROXY_HTTP_CLIENT` | `LazyLock<reqwest::blocking::Client>` | pkv 用。UA は固定値だが、リクエストごとに `current_user_agent()` で上書きされる |
| `PROXY_MAX_BODY_BYTES` | 64 MiB | pkv のバイナリ上限 |
| `PROXY_CONNECT_TIMEOUT_SECS` | 10 | 接続タイムアウト |
| `PROXY_TIMEOUT_SECS` | 180 | 全体タイムアウト |
| `PROXY_MAX_REDIRECTS` | 5 | リダイレクト上限 |
| `PROXY_WORKERS` | 4 | pkv ワーカースレッド数 |
| `PKV_BASE_URL` | Windows / Android は `http://pkv.localhost/file`、それ以外は `pkv://localhost/file` | Tauri のカスタムプロトコル URL 形式差 |

#### 失敗時の挙動

- `api_request` は非 2xx で `Err("STATUS=<code> BODY=<本文>")` を返します。本文は無加工なので秘密情報が含まれ得ます。
- transport エラーはログと `pawchive.log` に残したうえで `e.to_string()` を返します。URL は `safe_log_url` を通します。
- `fetch_creator_icon` は通信失敗を `Err`、非成功・非画像・204 を `Ok(None)` として扱います (アイコン無しと障害を区別しない)。
- `take_external_page_images` は document_dir 取得失敗・読み取り失敗・JSON 不正のいずれも `Ok(None)` にし、失敗時はファイルを消します。
- `append_app_log` の失敗は握りつぶし (`log::error!` のみ)。

### src/downloads.rs

役割: 一括画像保存の保存先解決、取得、HTML からの画像抽出、原子的な書き込み。

#### 定数

| 名前 | 値 | 意味 |
|---|---|---|
| `MAX_SEGMENT_CHARS` | 80 | クリエイター名・ファイル名の最大文字数 |
| `MAX_FILE_BYTES` | 64 MiB | 1 ファイル上限 |
| `MAX_TOTAL_BYTES` | 512 MiB | 1 回の実行で保存する合計 |
| `MAX_FILES` | 300 | 1 回の実行で保存する最大数 |
| `MAX_PAGE_BYTES` | 16 MiB | 外部 HTML の上限 |
| `MAX_PAGE_IMAGES` | 100 | 1 ページから拾う最大画像数 |
| `MAX_PAGES` | 3 | 1 回の実行で開く外部ページ数 |
| `MIN_IMAGE_BYTES` | 512 | これ未満はトラッキングピクセルとして除外 |
| `FETCH_INTERVAL` | 200 ms | 取得間隔 |
| `DOWNLOAD_CLIENT` | `reqwest::blocking::Client` | connect 10 秒 / total 120 秒 / gzip / リダイレクト最大 5 (各ホップで `host_is_public` 検査) |
| `DOWNLOAD_RUNNING` | `AtomicBool` | 同時実行ロック |
| `DOWNLOAD_CANCELLED` | `AtomicBool` | 中止フラグ |

#### 関数

| 名前 | シグネチャ | 戻り値 | 説明・性質 |
|---|---|---|---|
| `sanitize_segment` | `pub(crate) fn sanitize_segment(value: &str, fallback: &str) -> String` | 安全な名前 | 制御文字とパス区切り・ワイルドカード・引用符などの禁止文字を `_` に置換、前後の空白とドットを除去、80 文字に切り詰め、空なら fallback |
| `download_root` | `pub(crate) fn download_root(app) -> Result<PathBuf, String>` | 基準ディレクトリ | モバイルは `Documents/Downloads`、デスクトップは `Downloads/PawKemoView` → `Documents/Pawchive/Downloads` → `app_data/Downloads` の順。作成しながら確定。Android では共有 `Download/` を使えない場合のフォールバック |
| `creator_target` | `pub(crate) fn creator_target(app, creator_name, service, creator_id) -> Result<DownloadTarget, String>` | `DownloadTarget` | 表示用パス・実際の書き込み先・MediaStore 相対パスを決める。Android 10 以降は共有 `Download/PawKemoViewer/<name>` を表示し、キャッシュへ書いて移す |
| `creator_directory` | `pub(crate) fn creator_directory(app, creator_name, service, creator_id) -> Result<PathBuf, String>` | パス | `creator_target` の表示用パス。共有保存のときはディレクトリを作らない |
| `store_shared` | `fn store_shared(app, path, file_name, relative) -> Result<(), String>` (Android) | `()` | `downloads-store` プラグインで MediaStore に登録し、キャッシュ上のファイルを削除する |
| `mime_for` | `fn mime_for(file_name) -> &'static str` (Android) | MIME | 拡張子から jpeg / png / webp / gif / avif / mp4 / webm を決める。不明は octet-stream |
| `collision_name` | `pub(crate) fn collision_name(stem, extension, index) -> String` | ファイル名 | `index <= 1` は接尾辞なし、2 以上は `-<index>`、拡張子があれば付与 |
| `unique_file_path` | `pub(crate) fn unique_file_path(directory, filename) -> PathBuf` | パス | 既存なら `-2`〜`-9999` を試す。全滅時は 9999 を返す |
| `atomic_write` | `pub(crate) fn atomic_write(path, bytes) -> Result<(), String>` | `()` | `.<name>.part` に書いて rename。rename 失敗時は一時ファイルを削除 |
| `is_allowed_referer` | `fn is_allowed_referer(referer: &str) -> bool` | `bool` | fanbox / patreon とそのサブドメインのみ。`http`/`https` 限定 |
| `referer_origin` | `fn referer_origin(referer: &str) -> Option<String>` | Origin | scheme + host (+ port) |
| `session_cookie` | `fn session_cookie(url, session) -> Option<String>` | Cookie 値 | `pawchive.pw` とサブドメインにだけ `session=<値>` を返す。空・空白のみは `None` |
| `extension_for` | `fn extension_for(content_type: &str) -> Option<&'static str>` | 拡張子 | jpeg / png / webp / gif / avif のみ |
| `file_name_for` | `fn file_name_for(url, content_type) -> String` | ファイル名 | `?f=` → パス末尾 → `image` の順。拡張子が無ければ Content-Type から補う。percent-decode する |
| `fetch_image` | `fn fetch_image(url, referer, session) -> Result<(Vec<u8>, String), String>` | バイト列と名前 | `fetch` の結果が `image/` でなければ `not an image` |
| `fetch` | `fn fetch(url, referer, session, kind) -> Result<Fetched, String>` | `Fetched` | scheme / 内部アドレス検査、ブラウザ相当ヘッダー、Referer・Origin・Cookie、サイズ上限 |
| `extract_page_images` | `pub(crate) fn extract_page_images(html, base) -> Vec<String>` | 絶対 URL 配列 | `img` の `src` / `data-src` / `data-original` / `data-lazy-src` / `srcset` / `data-srcset` と `og:image` / `og:image:url` / `twitter:image`。最大 100 件、重複除去 |
| `image_candidate` | `fn image_candidate(raw, base) -> Option<String>` | 絶対 URL | `&amp;` 等を戻し、相対 URL を解決。pawchive サムネ、アバター / UI、動画拡張子を除外 |
| `is_tracking_pixel` | `fn is_tracking_pixel(bytes: &[u8]) -> bool` | `bool` | 512 バイト未満 |
| `is_avatar_or_ui` | `fn is_avatar_or_ui(url) -> bool` | `bool` | `pbs.twimg.com/profile_images` と `/profile_banners`、`abs.twimg.com`、`graph.facebook.com`、`platform-lookaside.fbsbx.com`、`yt3.ggpht.com`、`gravatar.com/avatar/` |
| `strip_chrome` | `fn strip_chrome(html) -> Cow<'_, str>` | HTML | `<header>` / `<nav>` / `<footer>` の中身を空白に置換 |
| `decode_entities` | `fn decode_entities(value) -> String` | 文字列 | `&amp;` `&quot;` `&#39;` `&apos;` `&lt;` `&gt;` のみ戻す |
| `cancel_download` | `pub(crate) fn cancel_download()` | `()` | `DOWNLOAD_CANCELLED` を立てるだけ。即時中断はしない |
| `download_post_images` | `pub(crate) async fn download_post_images(...) -> Result<DownloadSummary, String>` | `DownloadSummary` | 引数検査 → 実行ロック → `spawn_blocking(run_download)` → lock 解除 |
| `Downloader::new` | `fn new(app, target, total, session) -> Self` | `Downloader` | 連番の桁幅を `total` の桁数 (最低 3) で決める |
| `Downloader::stop_requested` | `fn stop_requested(&mut self) -> bool` | `bool` | グローバル中止フラグを読み、立っていれば `cancelled` を立てる |
| `Downloader::pause` | `fn pause(&self)` | `()` | 2 件目以降、取得前に 200 ms 待つ |
| `Downloader::emit` | `fn emit(&self)` | `()` | `download-progress` に `{done, total}` を送る。送信失敗は無視 |
| `Downloader::fetch_and_store` | `fn fetch_and_store(&mut self, url, name, referer)` | `()` | 重複は `skipped`、失敗は `failed` に追加。必ず `processed` を進めて emit |
| `Downloader::store` | `fn store(&mut self, url, name, bytes)` | `()` | トラッキングピクセル除外、合計上限判定、最初の成功時にディレクトリ作成、連番付与、`atomic_write`。`target.shared` があれば `store_shared` で共有 `Download/` へ移す |
| `Downloader::into_summary` | `fn into_summary(self) -> DownloadSummary` | `DownloadSummary` | 集計を返す |
| `run_download` | `fn run_download(app, target, referer, images, pages, session, image_referer) -> Result<DownloadSummary, String>` | `DownloadSummary` | 画像 → 外部ページの順に処理。ページが画像なら 1 枚、HTML なら抽出して保存 |

#### 構造体・列挙体

| 型 | 内容 |
|---|---|
| `DownloadImage` (`Deserialize`) | `url: String`、`name: Option<String>` (`#[serde(default)]`) |
| `DownloadFailure` (`Serialize`) | `url: String`、`reason: String` |
| `DownloadSummary` (`Serialize`) | `directory`、`saved`、`skipped`、`cancelled`、`failed` |
| `Downloader<'a>` | `app` / `target: &DownloadTarget` / `session` / `seen: HashSet<String>` / `width` / `saved` / `skipped` / `processed` / `total` / `total_bytes` / `failed` / `cancelled` |
| `DownloadTarget` | `display: PathBuf`（結果表示）/ `staging: PathBuf`（実書き込み）/ `shared: Option<String>`（Android の MediaStore 相対パス） |
| `Fetched` | `content_type`、`body`、`final_url` (リダイレクト後の URL) |
| `FetchKind` | `Image` / `Page`。Accept と Sec-Fetch-* の組み合わせを切り替える |

#### 失敗時の挙動

- 1 件の失敗は `failed` に積んで継続します。全体は `Ok(DownloadSummary)` のままです。
- 失敗理由の文字列: `invalid url`、`unsupported scheme`、`forbidden address`、`HTTP <code>`、`too large`、`not an image`、`total size limit`、`unsupported content type: <content-type>`、I/O の `e.to_string()`。
- 実行ロックは `download_post_images` が `DOWNLOAD_RUNNING.swap(true)` した後、`spawn_blocking` の完了後に必ず解除します。保存先の決定も `spawn_blocking` の内側にあるため、`creator_target` の失敗でも解除されます。IPC の Future が破棄された場合の挙動は未確認です。
- キャンセルは画像なら次の 1 件、ページなら次のページの直前で効きます。転送中の中断はしません。

### src/locale_storage.rs

役割: `app_data/locales` の言語ファイルと、モバイル / デスクトップの追加言語フォルダーの読み書き。

| 名前 | シグネチャ | 戻り値 | 説明・性質 |
|---|---|---|---|
| `atomic_document_write` | `pub(crate) fn atomic_document_write(path, contents) -> Result<(), String>` | `()` | 同階層の `.document-<pid>-<n>.tmp` に書いて `sync_all` → rename。最大 20 回試行。Windows で rename が失敗したら既存を消して再試行。`debug-diag` かモバイルでのみコンパイル |
| `locale_dir` | `fn locale_dir(app) -> Result<PathBuf, String>` | パス | `app_data/locales` |
| `valid_locale_code` | `fn valid_locale_code(code: &str) -> bool` | `bool` | `-` 区切り最大 3 要素。先頭は英字 2〜3 文字、以降は英数 2〜8 文字 |
| `list_locale_files` | `pub(crate) fn list_locale_files(app) -> Result<LocaleList, String>` | `LocaleList` | コマンド |
| `list_locale_directory` | `fn list_locale_directory(dir) -> Result<LocaleList, String>` | `LocaleList` | `.json` のみ対象。コード不正・1 MiB 超・UTF-8 でないものは `invalid` に入れる |
| `write_locale_file` | `pub(crate) fn write_locale_file(app, code, json, replace_existing) -> Result<String, String>` | パス | 静的 `Mutex` で直列化。`replaceExisting == Some(false)` のとき大文字小文字を無視して既存を拒否 |
| `delete_locale_file` | `pub(crate) fn delete_locale_file(app, code) -> Result<bool, String>` | `bool` | 無ければ `Ok(false)` |
| `secondary_locale_dir` | `fn secondary_locale_dir(app) -> Result<PathBuf, String>` | パス | モバイルは `Documents/Languages`、デスクトップは `Documents/Pawchive/languages` |
| `list_secondary_locale_files` | `pub(crate) fn list_secondary_locale_files(app) -> Result<LocaleList, String>` | `LocaleList` | コマンド |
| `write_secondary_locale_file` | `pub(crate) fn write_secondary_locale_file(app, code, json) -> Result<String, String>` | パス | デスクトップのみ実処理。モバイルは `secondary locale storage unavailable` |
| `export_locale_to_folder` | `pub(crate) fn export_locale_to_folder(app, code, json) -> Result<bool, String>` | 新規 `true` / 既存 `false` | 追加フォルダーへ `create_new`。既存なら上書きしない |
| `resolve_storage_location` | `pub(crate) fn resolve_storage_location(app, area, purpose) -> Result<Option<String>, String>` | パス | `area` は `primary-private` / `secondary-accessible`、`purpose` は `logs` / `locales` / `exports` / `backup` / `general`。モバイルの `secondary-accessible` は `Ok(None)` |
| `save_locale_file_to_app_directory` | `pub(crate) async fn save_locale_file_to_app_directory(app, code, json) -> Result<serde_json::Value, String>` | `{ kind, path }` | iOS は直接書き、Android はプラグインの `exportToAppDirectory` |
| `prepare_ios_files_directory` | `pub(crate) fn prepare_ios_files_directory(app) -> Result<(), String>` | `()` | iOS で `Languages` / `Backups` / `Logs` を作り、`Documents/PawKemoViewer-Files.txt` を 1 度だけ置く |

| 型 | 内容 |
|---|---|
| `LocaleFile` (`Serialize`) | `code: String`、`json: String` (生の JSON 文字列) |
| `LocaleList` (`Serialize`) | `dir: String`、`files: Vec<LocaleFile>`、`invalid: Vec<String>` |
| `LOCALE_MAX_BYTES` | 1 MiB。読み書き両方の上限 |

失敗時: 一覧では壊れたファイルを `invalid` に回して全体は成功させます。書き込みは `atomic_document_write` の Err をそのまま返します。ロック取得失敗は `Locale write lock unavailable` です。

### src/json_files.rs

役割: OS のファイルピッカーを介した JSON / テキストの選択と保存。用途ごとに上限と拡張子を固定します。

| 名前 | シグネチャ | 戻り値 | 説明・性質 |
|---|---|---|---|
| `JsonPurpose::max_bytes` | `fn max_bytes(self) -> usize` | バイト数 | `locale` 1 MiB (`debug-diag` のみ)、`backup` 5 MiB |
| `ExportPurpose::format` | `fn format(self) -> (&'static str, &'static str, usize)` | (ラベル, 拡張子, 上限) | `locale` = JSON/1 MiB、`backup` = JSON/5 MiB、`log` = Text/txt/5 MiB |
| `ExportPurpose::folder` | `fn folder(self) -> &'static str` | フォルダー名 | モバイルのみ。`Languages` / `Backups` / `Logs` |
| `app_document_directory` | `pub(crate) fn app_document_directory(app, folder) -> Result<PathBuf, String>` | パス | モバイルの `Documents/<folder>` を作成 |
| `read_json_file` | `fn read_json_file(path, max_bytes) -> Result<Value, String>` | `{kind,name,json}` | `max_bytes + 1` まで読み、超過はエラー。UTF-8 以外もエラー |
| `run_mobile_picker` | `pub(crate) async fn run_mobile_picker(app, command, payload) -> Result<Value, String>` | ネイティブの戻り値 | 静的 `AtomicBool BUSY` で二重起動を防ぐ。`Drop` ガードで必ず解除 |
| `pick_json_file` | `pub(crate) async fn pick_json_file(app, purpose, app_directory) -> Result<Value, String>` | 選択結果 | `spawn_blocking` でダイアログを出す。モバイルの `appDirectory=true` は `Backups/pawkemoviewer-backup.json` を直接開く |
| `save_user_file` | `pub(crate) async fn save_user_file(app, purpose, filename, text, app_directory) -> Result<Value, String>` | 保存結果 | ファイル名は拡張子一致 + 幹が英数 `_` `-` のみ。モバイルの `appDirectory=true` は直接書き込み |

| 型 | 内容 |
|---|---|
| `JsonPurpose` (`Deserialize`, snake_case) | `Locale` (`debug-diag` のみ) / `Backup` |
| `ExportPurpose` (`Deserialize`, snake_case) | `Locale` (`debug-diag` のみ) / `Backup` / `Log` |

デスクトップのダイアログは Tauri Dialog の `blocking_pick_file` / `blocking_save_file` を `spawn_blocking` 内で使います。モバイルは `locale-picker` プラグインの `pickJson` / `saveDocument` を呼び、`maxBytes` と `folder` を渡します。

失敗時: キャンセルは Err ではなく `{kind:"cancelled"}`、標準バックアップが無い場合は `{kind:"missing"}` です。サイズ超過は `JSON file exceeds the size limit`、UTF-8 以外は `JSON file is not UTF-8`、ファイル名不正は `Invalid export file name or size` です。

### src/external_page_desktop.rs

役割: デスクトップの外部ページ専用ウィンドウ。初回ナビゲーションだけ Referer を付け、`assets/external-page-overlay.js` を差し込んでモバイル相当のツールバーを提供します。モバイルではコンパイルされません。

| 名前 | シグネチャ | 戻り値 | 説明・性質 |
|---|---|---|---|
| `open` | `pub fn open(app, url, referer, context: PageContext) -> Result<(), String>` | `()` | URL 検査、`external-page-<n>` ラベルのウィンドウ生成、状態登録、ビルダー設定 |
| `forget` | `fn forget(label: &str)` | `()` | `PAGES` から状態を削除 |
| `save_selection` | `fn save_selection(window, label, payload)` | `()` | `document.title` の JSON を検証し、`.external-download.json` を書いて閉じる。接頭辞にはウィンドウ固有のトークンを含む |
| `queue_file` | `fn queue_file(window) -> Option<PathBuf>` | パス | `Documents/.external-download.json` |
| `empty_context` | `fn empty_context() -> PageContext` | 空の文脈 | 状態が失われた場合のフォールバック |
| `start_navigation` | `fn start_navigation(window, url, referer)` | `()` | Windows / macOS は `with_webview` + `navigate`、それ以外は別スレッドで取得して `load_html` |
| `fetch_page` | `fn fetch_page(url, referer) -> Result<(String, String), String>` (非 Windows / macOS) | (HTML, 最終 URL) | 初回 URL と各リダイレクト先を `host_is_public` で検査し、30 秒・リダイレクト 5 回・本文 16 MiB 上限 |
| `navigate` (Windows) | `fn navigate(webview, url, referer) -> Result<(), String>` | `()` | `AddWebResourceRequestedFilter` + `WebResourceRequested` で `Referer` を `SetHeader` してから `Navigate` |
| `navigate` (macOS) | `fn navigate(webview, url, referer) -> Result<(), String>` | `()` | `NSMutableURLRequest` に `Referer` を追加して `loadRequest` |

| 型・定数 | 内容 |
|---|---|
| `PageContext` (`Clone`) | `creator_name` / `service` / `creator_id` / `post_id`。保存先の文脈 |
| `PageState` | `url` / `referer` / `context` / `navigated`。初回遷移を 1 度だけ実行するためのフラグ |
| `PAGES` | `LazyLock<Mutex<HashMap<String, Arc<Mutex<PageState>>>>>`。ウィンドウラベルごとの状態 |
| `NEXT_LABEL` | `AtomicU64`。ウィンドウラベルの連番 |
| `QUEUE_FILE` | `.external-download.json` |
| `new_token` | `fn new_token() -> String`。`document.title` 経由の操作を受け付ける 128 bit トークン (getrandom) |
| `MAX_PAGE_BYTES` | 16 MiB。Linux の初回取得の上限 |

ウィンドウはタイトル `外部ページ — <host>`、初期サイズ 900×820、最小 360×480、リサイズ可です。`on_navigation` は `http` / `https` / `tauri` / `about` / `asset` / `ipc` のみ許可し、`file:` を弾きます。

失敗時: URL 不正は `invalid url`、scheme 不正は `unsupported scheme`。ウィンドウ生成失敗は `e.to_string()`。ナビゲーション失敗は `log::warn!` のみで、UI には専用のエラー表示がありません。Linux の取得失敗も `log::warn!` で終わり、空のウィンドウが残ります。

## 4. pkv プロキシ

WebView から Referer を設定できないため、`pkv` カスタムプロトコルで中継します。

### URL 形式

| OS | 形式 |
|---|---|
| Windows / Android | `http://pkv.localhost/file?u=<対象URL>&r=<Referer>` |
| macOS / iOS / Linux | `pkv://localhost/file?u=<対象URL>&r=<Referer>` |

`u` は必須、`r` は任意です。`u` が無ければ 400 `missing u`、URL として不正なら 400 `bad url`。コード内のコメントには `f` も含むとありますが、実装が読むのは `u` と `r` だけです (`f` の用途は未確認)。

### 許可規則

| 検査 | 内容 |
|---|---|
| 対象 URL | `http` / `https` のみ。`forbidden_host` と `is_pawchive_host` を拒否 |
| `forbidden_host` | `localhost`、`.localhost`、`.local`、`.internal`、IPv6 リテラル、ドットを含まない単一ラベル、全ラベルが数値の IPv4 リテラル |
| DNS 解決 | `host_is_public`。`port_or_known_default()` (既定 443) で解決した全アドレスが `is_public_ip` であること。**解決失敗は許可 (fail-open)** |
| private 判定 | RFC1918、loopback、link-local、unspecified、broadcast、multicast、`0.0.0.0/8`、`100.64.0.0/10`、`192.0.0.0/24`、`198.18.0.0/15`、IPv6 の ULA / link-local、IPv4-mapped |
| Referer (`r`) | `http`/`https` で、対象と同一ホスト、または `fanbox.cc` / `patreon.com` とそのサブドメインのみ。それ以外は無視され既定 Referer になる |
| 既定 Referer | pawchive → `https://pawchive.pw/`、fanbox / pximg → `https://www.fanbox.cc/`、patreon → `https://www.patreon.com/`、その他 → fanbox |

拒否時は 403 `forbidden host` / `forbidden address` を返し、`PROXY_BLOCKED destination=... reason=host|address` をログに残します。検査は初回とリダイレクトの各ホップで行われます。

### リダイレクト・サイズ・ワーカー・タイムアウト

| 項目 | 値 |
|---|---|
| リダイレクト | 最大 5。各ホップで `is_proxyable` と `host_is_public` を再検査し、外れたら `blocked redirect` |
| 接続タイムアウト | 10 秒 |
| 全体タイムアウト | 180 秒 |
| バイナリ上限 | 64 MiB (`read_body_limited`) |
| HTML | 中継しない (`text/html` は 415) |
| ワーカー | 4 スレッド + `mpsc` キュー。受信ロックは `Mutex<Receiver>` |
| 送信ヘッダー | `User-Agent` (現在の UA)、`Referer`、`Origin`、`Range` (要求にあれば)。POST は `Content-Type: application/x-www-form-urlencoded` |
| 転送ヘッダー | `Content-Type`、`Content-Range`、`Accept-Ranges`、`Cache-Control`、`Content-Disposition`、`ETag`、`Last-Modified` |

キュー投入に失敗した場合は 503 `proxy unavailable` を返します。

### HTML を中継しない理由

`text/html` の応答は 415 (`html responses are not proxied`) で拒否します。pkv のオリジンは
Tauri から見てローカルオリジン扱いになり、中継した HTML のスクリプトがアプリ独自の
Tauri コマンド (`download_post_images` など) を invoke できてしまうためです。
外部ページはデスクトップの専用ウィンドウ、モバイルのネイティブビューで開きます。

### 残る制約

- Rust 側に投稿文脈の検証はありません。`r` はクライアント指定で、許可規則は「同一ホスト」か「fanbox / patreon」だけです。実質的に任意の外部 URL を中継できます。
- `host_is_public` の解決と reqwest の接続時解決は別なので、DNS リバインディングの TOCTOU が残ります。
- 応答は全量メモリに載ります。ストリーミング配信はしません。

## 5. 外部ページ

`open_external_page` は URL と Referer を検証したうえで、プラットフォームで分岐します。

| 条件 | 経路 |
|---|---|
| Android / iOS | `tauri_plugin_external_view::open(app, url, referer, creatorName, service, creatorId, postId)` |
| デスクトップ | `external_page_desktop::open(app, url, referer, PageContext{...})` |

Referer は **FANBOX / Patreon のページのみ**許可します (`is_service_page`)。URL は `http` / `https` のみです。

### OS 別の Referer 付与方法

| OS | 方法 | 備考 |
|---|---|---|
| Windows | WebView2 の `AddWebResourceRequestedFilter` + `WebResourceRequested` で `Referer` を差し替え、その後 `Navigate` | `NavigateWithWebResourceRequest` の追加ヘッダーは Referer だけ落とされるため。複数回フィルターを追加した場合の挙動は未確認 |
| macOS | `NSMutableURLRequest` に `Referer` を追加し `WKWebView.loadRequest` | 初回のみ。以降のサブリソースはページ URL が Referer になる |
| Linux | 公開 API が無いため、reqwest で Referer 付き取得した HTML を最終 URL を base に `webkit2gtk` の `load_html` で表示 | 初回応答の `Set-Cookie` は WebView に入らない。表示結果の実機確認は未確認 |
| Android | `WebView.loadUrl(url, headers)` に `Referer` を渡す | 以降の遷移は WebView が処理 |
| iOS | `URLRequest` に `Referer` を設定して `WKWebView.load` | モーダルのフルスクリーンで表示 |

### 画像の受け渡し

1. ページのツールバーで「画像を保存」を押す
2. 表示中 DOM から候補を最大 300 件収集 (アプリ側と同じ除外規則)
3. チェック式ピッカーを重ねる(モバイルは 3 列、デスクトップのオーバーレイは幅に応じた auto-fill)
4. 選択結果をアプリへ渡す
   - Android: `location.href = "pawkemo-save://start"` を `shouldOverrideUrlLoading` で捕捉
   - iOS: `pawkemo-save:` を `WKNavigationDelegate` で捕捉して `.cancel`
   - デスクトップ: `document.title = "pawkemo-save#" + JSON` を `on_document_title_changed` で捕捉
5. `Documents/.external-download.json` に書き出してビューを閉じる
6. アプリ復帰時にフロントが `take_external_page_images` で読み、Rust が読み取り後に削除
7. 通常の一括保存 (`download_post_images`) へ渡す

`.external-download.json` の内容は次のとおりです。

| フィールド | 意味 |
|---|---|
| `creatorName` / `service` / `creatorId` / `postId` | 保存先の文脈 |
| `referer` | 元記事 URL (FANBOX / Patreon) |
| `pageUrl` | 表示していた外部ページの URL。画像の Referer に使う |
| `images` | 選択された画像 URL の配列 |

デスクトップは `save_selection` が `http`/`https` 以外を除去し、空なら何も書かずに閉じます。壊れた JSON は `log::warn!` で捨てます。モバイルの `saveSelected` / `captureSelection` は、ピッカーに出した候補に含まれない URL を無視します。

診断 (`debug-diag` + iOS) ではネイティブが最大 100 件のイベントをメモリに保持し、`external_page_diagnostic_events` が `{ device, osVersion, events }` を返します。エクスポートはフロントの `save_user_file` 経由です。

## 6. 一括保存

Rust 側の取得と書き込みの実装詳細です。画面と候補抽出は[一括画像保存](../features/image-download.md)を参照してください。

### 取得規則

| 項目 | 内容 |
|---|---|
| 対象 | `images` (最大 300 件) → `pages` (最大 3 件) の順 |
| ページが画像 | そのまま 1 枚保存 |
| ページが HTML | `extract_page_images` で最大 100 件を抽出し、1 件ずつ取得 |
| それ以外 | `unsupported content type: <type>` で失敗扱い |
| 逐次性 | 常に 1 件ずつ。並列取得はしない |
| 間隔 | 2 件目以降、取得前に 200 ms |
| 重複 | 実行内の URL 完全一致を `seen` で除去し `skipped` に計上 |
| UA | `current_user_agent()` |
| Accept | 画像は `image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8`、ページは HTML 優先 |
| Sec-Fetch | 画像は `dest=image/mode=no-cors/site=cross-site`、ページは `dest=document/mode=navigate/site=cross-site` + `Upgrade-Insecure-Requests` |
| Origin | Referer の scheme + host (+ port) |
| Cookie | `pawchive.pw` とサブドメインにだけ `session=<sessionKey>` |
| リダイレクト | 最大 5。各ホップで `host_is_public` を検査し、外れたら `blocked redirect` |

ミラー (`n1`〜`n4.pawchive.pw`) は Cloudflare が `Accept` / `Accept-Language` / `Sec-Fetch-*` を見て 403 を返すため、ブラウザ相当のヘッダーを付けています。

### 除外規則

- `<header>` / `<nav>` / `<footer>` 内の画像
- `pbs.twimg.com/profile_images`、`/profile_banners`、`abs.twimg.com`、`graph.facebook.com`、`platform-lookaside.fbsbx.com`、`yt3.ggpht.com`、`gravatar.com/avatar/`
- `img.pawchive.pw/thumbnail/...` (原画ではないため)
- 拡張子が `mp4` / `webm` / `mov` / `m4v` / `m3u8` / `gifv`
- `data:` / `blob:` / `http(s)` 以外
- 512 バイト未満の実体 (トラッキングピクセル)
- 1 ファイル 64 MiB 超、合計 512 MiB 超

### Referer / 保存先解決

- 通常の画像と添付は投稿の `referer`。外部ページ由来の画像は `imageReferer` (無ければ `referer`)。
- `referer` は fanbox / patreon のみ許可。`imageReferer` は取得先と同一ホストか fanbox / patreon のページだけ送信します (それ以外は Referer / Origin を付けません)。
- 保存先は `download_root` → `sanitize_segment(creatorName)`。作成は最初の保存成功時のみです。
- ファイル名は `{:0width$}_{sanitize(name)}`。`width` は総件数の桁数 (最低 3)。衝突時は `-2` 以降を付けます。
- 書き込みは `.<name>.part` → rename。失敗時は `.part` を削除します。

### 進捗イベント

`download-progress` に `{ done: processed, total: total }` を送ります。`total` は画像の件数で始まり、外部ページを開くたびに `+1`、HTML から抽出した候補数だけ加算されます。`emit` の失敗は無視します。

### キャンセル

`cancel_download` は `DOWNLOAD_CANCELLED` を立てるだけです。確認するのは次のタイミングです。

- `images` の各要素を処理する前
- ページの取得前、およびページ内候補の各要素の前

中止時は `cancelled: true` とそれまでの集計を返します。転送中のリクエストは中断しません。

### 上限

| 項目 | 値 |
|---|---|
| 保存成功数 | 300 |
| 合計バイト | 512 MiB |
| 1 ファイル | 64 MiB |
| 外部 HTML | 16 MiB |
| 1 ページの候補 | 100 |
| 外部ページ数 | 3 |

## 7. 並行性・資源

| 資源 | 仕組み | 注意点 |
|---|---|---|
| API 通信 | `API_HTTP_CLIENT` (非同期、接続プール共有) | 同時数制限は JS 側スケジューラが担当。Rust 側にセマフォはない |
| ログイン | `LOGIN_HTTP_CLIENT` (リダイレクト追従なし) | API 用 client とは別プール |
| pkv | 4 ワーカースレッド + `mpsc` キュー | 1 要求 1 スレッドにしないため。キュー投入失敗は 503 |
| pkv の受信 | `Arc<Mutex<Receiver>>` | 受信ロック保持中は他ワーカーが待つ。処理自体はロック外 |
| 一括保存 | `spawn_blocking` + `AtomicBool` 2 個 | 同時実行は 1 件。実行ロックは完了後に解除する(IPC の Future 破棄時は未確認) |
| 保存の逐次性 | 単一ワーカー内のループ + 200 ms 間隔 | 並列取得なし |
| 言語ファイル書き込み | 静的 `Mutex<()>` (`PRIVATE_LOCALE_WRITES`) | プロセス内のみ。他プロセスとは排他しない |
| モバイルのファイルピッカー | 静的 `AtomicBool BUSY` + `Drop` ガード | 二重に開くと `A file operation is already open` |
| デスクトップ外部ページ | `PAGES: Mutex<HashMap<...>>` + ラベル連番 | ウィンドウごとに独立した状態 |
| Linux 外部ページ取得 | `std::thread::spawn` + `run_on_main_thread` | UI スレッドをブロックしないための退避 |
| タイムアウト | API / ログイン 1〜300 秒 (既定 30)、サムネイル・アイコン 15 秒、pkv 10/180 秒、保存 10/120 秒、Linux 外部ページ 30 秒 | いずれも reqwest の設定 |
| 取消 | pkv はなし、保存はフラグ確認のみ | pkv の転送中断手段は無い |

## 8. プラグイン

`src-tauri/plugins/` の 3 プラグインのうち、`external-view` と `locale-picker` はモバイル専用、`downloads-store` は Android 専用です。Rust 側の `src/lib.rs` は `#![cfg(any(target_os = "android", target_os = "ios"))]` などで、対象外の OS では空になります。`build.rs` は `tauri_plugin::Builder` に `android_path("android")`（と iOS 向けの `ios_path`）を渡すだけです。

### 登録方法

| プラグイン | Rust | Android | iOS |
|---|---|---|---|
| `external-view` | `tauri_plugin_external_view::init()` | `api.register_android_plugin("org.pawkemoviewer.externalview", "ExternalViewPlugin")` | `api.register_ios_plugin(init_plugin_external_view)` (`@_cdecl`) |
| `locale-picker` | `tauri_plugin_locale_picker::init()` | `api.register_android_plugin("org.pawkemoviewer.localepicker", "LocalePickerPlugin")` | `api.register_ios_plugin(init_plugin_locale_picker)` |
| `downloads-store` | `tauri_plugin_downloads_store::init()`（Android のみ） | `api.register_android_plugin("org.pawkemoviewer.downloadsstore", "DownloadsStorePlugin")` | なし |

`external-view` は `debug-diag` feature を持ち、iOS の `Package.swift` が環境変数 `PKV_IOS_EXTERNAL_DIAG` を見て Swift の `PKV_EXTERNAL_DIAG` を定義します。`build.rs` がこの環境変数を設定します。

### ネイティブ側ファイルとの対応

| IPC / Rust 関数 | Android | iOS | 役割 |
|---|---|---|---|
| `external-view` の `open` | `ExternalViewPlugin.open` → `ExternalPageActivity` | `ExternalViewPlugin.open` → `ExternalPageController` | 実オリジンの WebView を開く。Referer 付き初回ロード |
| `external-view` の `openBrowser` | `ExternalViewPlugin.openBrowser` | `ExternalViewPlugin.openBrowser` | OS ブラウザで開く |
| `external-view` の `diagnosticEvents` | 実装なし | `ExternalViewPlugin.diagnosticEvents` (`PKV_EXTERNAL_DIAG`) | iOS の診断イベント取得 |
| `locale-picker` の `pickJson` | `LocalePickerPlugin.pickJson` + `importResult` | `LocalePickerPlugin.pickJson` + `UIDocumentPickerDelegate` | JSON 選択 |
| `locale-picker` の `saveDocument` | `LocalePickerPlugin.saveDocument` + `exportResult` | `LocalePickerPlugin.saveDocument` | JSON / テキスト書き出し |
| `locale-picker` の `exportToAppDirectory` | `LocalePickerPlugin.exportToAppDirectory` (`AtomicFile`) | 実装なし (Rust が直接書く) | アプリ専用フォルダーへの言語保存 |
| `locale-picker` の `setLauncherIcon` | `LocalePickerPlugin.setLauncherIcon` → `LauncherIcons.kt` | 実装なし (app-icon プラグイン) | Android のランチャーアイコン切替 |
| `downloads-store` の `isSupported` | `DownloadsStorePlugin.isSupported` | 実装なし | Android 10 以降かの判定 |
| `downloads-store` の `saveToDownloads` | `DownloadsStorePlugin.saveToDownloads`（MediaStore 挿入） | 実装なし | キャッシュ上の画像を共有 `Download/` へ移す |

Android の `ExternalPageActivity` は `AndroidManifest.xml` で `exported="false"` の Activity として宣言され、`configChanges` で回転などを自前処理します。`LocalePickerPlugin` は起動時に `Documents/Languages` を用意します。

Android のランチャー切替は、`AppIconDefault` / `AppIconLight` の 2 つの activity-alias を `PackageManager` で有効・無効にします。alias が無い IDE ビルドでは何もしません (エラーにもなりません)。

### ネイティブ側のエラー文字列

Rust の `Err` として JS に届く文言です。

| プラグイン | 文言 |
|---|---|
| external-view (Android) | `Could not open the browser`, `Could not open the external page` |
| external-view (iOS) | `Invalid browser URL`, `Could not open the browser`, `Invalid URL`, `Could not find a view controller to present the page` |
| locale-picker (Android) | `Could not switch launcher icon`, `Could not save to the app language folder`, `Invalid JSON export arguments`, `Could not open the system file picker`, `No provider document was selected`, `Could not read or write the selected JSON file` |
| locale-picker (iOS) | `The JSON picker requires iOS 14 or later`, `A JSON picker is already open`, `File exceeds the size limit`, `Could not stage the export`, `Could not open the system file picker`, `No document was selected` |

Android の `handle` は `RESULT_CANCELED` を `{kind:"cancelled"}` として解決し、それ以外の失敗を reject します。iOS の `pickJson` は `iOS 14` 未満を reject します。

### 未確認事項

- Linux の `webkit2gtk::load_html` 経路の表示結果 (コードは存在するが、実機・CI での確認記録は本リポジトリ内にない)
- Windows WebView2 で `AddWebResourceRequestedFilter` を同一セッションで複数回呼んだ場合の挙動
- `pkv` のクエリ `f` の想定用途 (コメントにのみ登場し、実装は読まない)
- Android に `diagnosticEvents` が無い理由 (iOS 専用として実装されている事実のみ)
