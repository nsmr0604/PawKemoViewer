# Rust 側コード監査 (PawKemoViewer 0.6.0)

- 対象: `src-tauri/src/{lib,downloads,locale_storage,json_files,external_page_desktop,main}.rs`、
  `src-tauri/plugins/*/src/lib.rs`、`src-tauri/{Cargo.toml,tauri.conf.json,capabilities/}`、`src-tauri/examples/probe_api.rs`
- 基点: ブランチ `0.6.0` / HEAD `45d324d7`(作業ツリーの未追跡のみ)
- 前提: 外部ページの全 OS 対応、`downloads-store` プラグイン、`accountId` 復元は正しい実装として扱う
- 検証: `cargo check --offline`(通常構成)でエラーなし・警告 6 件。Tauri 2.12.7 / reqwest 0.12.28 のクレートソースを併読
- 件数: **重大 4 / 中 14 / 低 20(計 38)**

---

## [重大] pkv が中継した外部 HTML が「ローカルオリジン」で実行され、アプリの全コマンドを invoke できる
- 分類: セキュリティ
- 場所: `src-tauri/src/lib.rs` の `pkv_proxy_fetch` / `transform_html` / `register_asynchronous_uri_scheme_protocol("pkv")`、`src-tauri/capabilities/default.json`
- 根拠: `pkv_proxy_fetch` は `ct.contains("text/html") && !is_direct_host(&host)` の応答を `<script>` を残したまま書き換えて同一 pkv オリジンで返す。Tauri 2.12.7 の `Webview::is_local_url` は「登録済みカスタムプロトコル」を local と判定し(`http://pkv.localhost` / `pkv://localhost` の双方)、`Webview::on_message` は local かつアプリ ACL manifest 未定義ならアプリ独自コマンドを許可する。capability は `windows: ["main"]` に `core:default` のみ。
- 影響: 投稿本文の外部リンクは `proxyLinkUrl` で**設定に関係なく** pkv 化されるため、リンクを 1 回タップするだけで任意サイトの JS が `main` ウィンドウ(= local オリジン)で動く。そこから `download_post_images`(任意の公開 URL を Downloads 配下へ保存)、`export_file` / `export_log`(アプリデータへ書き込み)、`open_in_browser`、`open_external_page`、`set_http_user_agent`、`list_locale_files`、`api_request` など 29 コマンドを呼べる。pkv オリジンは全中継先で共有されるため localStorage も共有される(CSP は `null`)。
- 修正案: pkv で HTML を返さない(画像・バイト列のみ許可)か、HTML 表示専用の `WebviewWindow`(capability なし)へ分離する。併せてアプリ独自コマンドの ACL manifest を定義し、pkv オリジンを明示的に拒否する。

## [重大] DNS 解決失敗で SSRF 検査が fail-open、検査した IP と接続先も一致しない
- 分類: セキュリティ
- 場所: `src-tauri/src/lib.rs` の `host_is_public`(利用元: `pkv_proxy_fetch`、`PROXY_HTTP_CLIENT` の redirect policy、`downloads.rs` の `fetch` と `DOWNLOAD_CLIENT` の redirect policy)
- 根拠: `match (host, port).to_socket_addrs() { Ok(addrs) => addrs.into_iter().all(...), Err(_) => true }`。検査は別解決で、reqwest は接続時に再度名前解決する。
- 影響: 名前解決が一時的に失敗する状況(オフライン遷移・DNS 負荷・意図的な NXDOMAIN)で内部宛てが通る。攻撃者制御 DNS の rebinding でも、検査時は公開 IP・接続時は 127.0.0.1/192.168.x にできる。結果として pkv の `is_proxyable` を迂回してローカルサービス・メタデータ API に到達し得る。
- 修正案: 解決失敗は `false`(拒否)にする。`ClientBuilder::resolve()` もしくはカスタム DNS リゾルバで「検査した IP にのみ接続」を保証する。

## [重大] デスクトップ外部ページの Linux 実装が Rust 側で任意 URL を取得する (SSRF + 本文上限なし)
- 分類: セキュリティ / 資源
- 場所: `src-tauri/src/external_page_desktop.rs` の `fetch_page` / `start_navigation`(非 Windows / 非 macOS 分岐)
- 根拠: `client.get(url).header(REFERER, referer)` を `Policy::limited(5)` で追従し、`response.text()` で全量読む。`open_external_page` 側は scheme と Referer しか検証しない。
- 影響: 投稿本文の外部リンクに `http://192.168.0.1/…` や `http://127.0.0.1:8001/…` を置かれると、アプリが利用者の LAN 内へ GET を発行し、応答 HTML を `load_html(html, base=実 URL)` で描画する(実オリジンの JS が動く)。リダイレクト各ホップも無検査、巨大応答はメモリを圧迫する。pkv が `is_proxyable` で守っている境界が、この経路だけ素通りになる。
- 修正案: 初回 URL と全リダイレクトに `is_proxyable` + `host_is_public` を適用し、`read_body_limited` 相当の上限(例 16 MiB)を設ける。内部アドレスは明示拒否し、ユーザーにエラーを返す。

## [重大] 外部ページの「画像を保存」がページ側の `document.title` 操作だけで発火する
- 分類: セキュリティ
- 場所: `src-tauri/src/external_page_desktop.rs` の `on_document_title_changed` / `save_selection`、`src/pages/PostPage.tsx` の外部ページ取り込み effect
- 根拠: タイトルが `pawkemo-save#` で始まれば内容を検査せず `save_selection` を呼び、`.external-download.json` を書いて `window.close()` する。フロントは `take_external_page_images` の結果を確認 UI なしで `runDownload` に渡す。
- 影響: 外部サイト(または改ざんされた中継先)の JS が任意の http(s) 画像 URL を並べたタイトルを設定するだけで、同意なしに `Downloads/PawKemoViewer/<creator>` へ書き込ませ、開いている外部ページを強制クローズできる。保存先クリエイター名はアプリ側文脈なので任意化は不可、取得先も `host_is_public` で公開ホストに限定される。
- 修正案: オーバーレイだけが発行できる経路(カスタムスキーム + ワンタイムトークン、または capability を絞った専用ウィンドウの IPC)に変更し、保存前に確認 UI を挟む。

## [中] 製品版でも API エラー応答本文を無加工で永続ログへ書く
- 分類: セキュリティ / 資源
- 場所: `src-tauri/src/lib.rs` の `api_request`(非 2xx 分岐)と `append_app_log`
- 根拠: `#[cfg(feature = "debug-diag")]` の外で `log::error!(... body={}, text)` と `append_app_log(&format!("API_ERROR destination={} body={}", ..., text))` を実行する。ログは追記のみでローテーション・上限がない。
- 影響: 投稿本文・コメント・アカウント関連のレスポンスが `app_data/logs/pawchive.log` に平文で残る。長期運用で無限に肥大化し、ログ共有時にそのまま漏洩する。
- 修正案: 製品版は status・パス・本文バイト数のみ記録し、本文は debug-diag 限定にする。ファイルはサイズ上限 + ローテーションを入れる。

## [中] `api_request` がリダイレクトを追従し、未認証の書き込みが「成功」として返る
- 分類: 契約 / 正確性
- 場所: `src-tauri/src/lib.rs` の `api_request`(と `API_HTTP_CLIENT`)
- 根拠: `API_HTTP_CLIENT` に redirect policy を設定しておらず既定(最大 10)で追従。pawchive は未認証の `POST/DELETE /favorites/...` に 302(login)を返す。判定は `if !status.is_success()` のみ。
- 影響: 302 → `/login` の 200 HTML が `Ok(text)` として返り、フロントは `JSON.parse` 失敗時に生文字列を返すため、お気に入り追加/解除が成功したように見える(実際は未反映)。Cloudflare の `Fake site` 等の 200 HTML も型付き成功として通過する。
- 修正案: `Policy::none()` にして 3xx をエラー化するか、最終 URL と `Content-Type: application/json` を検証して失敗扱いにする。

## [中] pkv の待ち行列と POST 本文が無制限
- 分類: 資源 / 並行性
- 場所: `src-tauri/src/lib.rs` の `proxy_queue` / `register_asynchronous_uri_scheme_protocol`
- 根拠: `mpsc::channel`(無制限)に `request.body().clone()` ごと投入し、ワーカーは `PROXY_WORKERS = 4` 本。1 件あたり最大 `PROXY_TIMEOUT_SECS = 180` 秒。
- 影響: 画像を大量に要求する画面や巨大 POST で待ち行列とメモリが増え、pkv 応答が数分単位で遅延する。利用者側に中止手段がない。
- 修正案: `sync_channel` で固定長にし、満杯時は 503 を返す(または同一 URL を合流させる)。POST 本文に上限(例 1 MiB)を設ける。

## [中] pkv ワーカーの panic が未応答リクエストと恒久的な 503 を招く
- 分類: 並行性
- 場所: `src-tauri/src/lib.rs` の `proxy_queue` のワーカースレッド、`pkv_proxy_fetch` の `Response::builder()...unwrap()`
- 根拠: `pkv_proxy_fetch` は複数箇所で `unwrap()` し、panic すると `responder` が drop される。受信側は `receiver.lock()` が poison されると `Err(_) => return` で他ワーカーも終了する。
- 影響: 該当リクエストが無応答のまま残り、以後の全 pkv 要求が `503 proxy unavailable` になる(アプリ再起動まで回復しない)。
- 修正案: ジョブ実行を `catch_unwind` で包み panic 時は 500 応答を返す。poison 時は `into_inner()` で復帰し、ワーカーを補充する。

## [中] `DOWNLOAD_RUNNING` がコマンド Future の drop で解放されない
- 分類: 並行性
- 場所: `src-tauri/src/downloads.rs` の `download_post_images`
- 根拠: フラグ解除は `.await` の直後の 1 か所のみ。`spawn_blocking` の JoinHandle を待つ間にコマンド Future が drop されると到達しない(`creator_target` の早期 return は `f954e1e2` で解消済み)。
- 影響: 以降の一括保存が恒久的に `download already running` で失敗する。WebView 再読み込み・ウィンドウクローズ・IPC キャンセルで発生し得る。**要確認**: Tauri が IPC の Future を drop する条件は未実測。
- 修正案: `Drop` でフラグを戻す RAII ガードを用意し、フラグの所有を `spawn_blocking` のクロージャ側へ移す。

## [中] 外部ページ HTML の `<header>/<nav>/<footer>` 除去が二次時間オーダー
- 分類: 資源 / 正確性
- 場所: `src-tauri/src/downloads.rs` の `strip_chrome`
- 根拠: `(?is)<header\b[^>]*>.*?</header\s*>` を各出現位置から末尾まで試行する。閉じタグが無い場合、出現数 × ページ長の走査になる。
- 影響: `MAX_PAGE_BYTES = 16 MiB` までの外部ページで `<header` を大量に含む HTML を与えると、保存処理が長時間 CPU を占有する(モバイルで顕著)。**要確認**: 実測は未実施。
- 修正案: 線形スキャナに置き換えるか、出現数の上限と未マッチ時の打ち切りを入れる。

## [中] 一括保存の `imageReferer` がホスト検査なしで任意ホストへ送られる
- 分類: セキュリティ
- 場所: `src-tauri/src/downloads.rs` の `download_post_images`(`image_referer` の検証)と `fetch`
- 根拠: `Ok(url) if matches!(url.scheme(), "http" | "https") && url.host_str().is_some()` だけを検査し、そのまま `REFERER` に使う。
- 影響: pkv は `is_allowed_referer` で fanbox / patreon / 取得先同一ホストに制限しているのに、一括保存経路だけ任意サイトへの Referer 偽装が可能。取得先も任意の公開ホスト。
- 修正案: pkv の `is_allowed_referer` と同じ規則(取得先ホスト or 投稿ホスト)に揃える。

## [中] `login_request` が検証失敗を一律「パスワード誤り」に丸め、取得済みセッションも捨てる
- 分類: 正確性
- 場所: `src-tauri/src/lib.rs` の `login_request`
- 根拠: 検証 GET が `Err` でも `ok = false` のまま `LoginResult { ok: false, session: None, error: Some("ユーザー名またはパスワードが正しくありません") }` を返す。
- 影響: ログイン POST 自体は成功していても、`/account/favorites` の通信失敗や 5xx でユーザーに誤った原因を表示し、有効なセッションも失う(再試行でパスワード再入力が必要)。
- 修正案: 「認証失敗」と「検証不能」を別の結果として返し、検証不能時は取得した session を返して再検証できるようにする。

## [中] CSP が `null` で、アプリ UI と中継 HTML の双方に防御層がない
- 分類: セキュリティ
- 場所: `src-tauri/tauri.conf.json` の `app.security.csp`
- 根拠: `"csp": null`。
- 影響: 何らかのインジェクションが成立した時点で、Tauri コマンド呼び出し(上記 1 件目)まで直結する。pkv の外部 HTML も同一オリジンで無制限に JS を実行できる。
- 修正案: `default-src 'self'` を基礎に `img-src` / `connect-src` / `script-src` を明示する。pkv は HTML を返さない構成にする。

## [中] pkv の宛先制限がなく実質オープンプロキシ
- 分類: セキュリティ
- 場所: `src-tauri/src/lib.rs` の `is_proxyable` / `derive_referer`
- 根拠: `matches!(u.scheme(), "http" | "https") && !forbidden_host(..) && !is_pawchive_host(..)` のみ。既定 Referer は未知ホストを fanbox 扱いにする。
- 影響: 悪意あるページ(上記 1 件目の JS)から任意の外部ホストへの取得をアプリ経由で行える。帯域・IP の帰属が利用者になる。docs の「外部メディアのみ」という記述とも不整合。
- 修正案: 既定をホットリンク対策ホスト + 投稿コンテキストのホストに限定し、拡張は明示設定にする。

## [中] pkv 応答で `Content-Encoding` を中継せず、非対応圧縮だと本文が壊れる
- 分類: 正確性
- 場所: `src-tauri/src/lib.rs` の `pkv_proxy_fetch` の転送ヘッダー一覧
- 根拠: 転送するのは Content-Type / Content-Range / Accept-Ranges / Cache-Control / Content-Disposition / ETag / Last-Modified のみ。`Content-Encoding` は含まれない。reqwest は `gzip` のみ有効。
- 影響: サーバが `Accept-Encoding` を無視して br / zstd を返すと、圧縮バイトがそのまま WebView に渡り画像・CSS が壊れる。**要確認**: 実測なし。
- 修正案: `brotli` / `zstd` を有効化して必ず展開するか、`CONTENT_ENCODING` を中継する。

## [中] 本文読取エラーの文字列が URL を含み得る(P8 の修正漏れ)
- 分類: セキュリティ
- 場所: `src-tauri/src/lib.rs` の `read_body_limited`、`src-tauri/src/downloads.rs` の `fetch`
- 根拠: `map_err(|e| BodyReadError::Read(e.to_string()))` / `.map_err(|error| error.to_string())` は `without_url()` を通していない。この文字列は `append_app_log` と `failed[].reason` に出る。
- 影響: 署名付き URL のクエリが永続ログや画面の失敗理由に残る。送信エラーだけ URL を除去している現状と非対称。
- 修正案: 読取系エラーも URL を除去して記録する(共通のエラー整形関数に寄せる)。

## [中] `open_external_page` が投稿文脈の 4 引数を検証しない
- 分類: 契約 / セキュリティ
- 場所: `src-tauri/src/lib.rs` の `open_external_page`
- 根拠: `creator_name` / `service` / `creator_id` / `post_id` をそのまま `PageContext` に詰め、保存先ディレクトリ名に使う(`sanitize_segment` は 80 文字に切るだけ)。
- 影響: 任意のディレクトリ名を作れる。パストラバーサルは防がれるが、`service_creatorId` のフォールバック名を偽装して既存の別クリエイターのフォルダへ混入させられる。空文字なら `_` という名前のフォルダになる。
- 修正案: `service` を fanbox / patreon に限定し、`creator_id` / `post_id` を英数に検証する。文脈が欠ける場合は保存自体を拒否する。

## [中] 外部ページの受け渡しファイルが Documents 直下の固定名で、多重ウィンドウと競合する
- 分類: 正確性 / 契約
- 場所: `src-tauri/src/external_page_desktop.rs` の `save_selection` / `queue_file`、`src-tauri/src/lib.rs` の `take_external_page_images`
- 根拠: `document_dir().join(".external-download.json")` 固定。書き込み直後にウィンドウを閉じ、読み手は 1 件だけ消費して削除する。
- 影響: 2 つの外部ページで同時に保存すると片方の選択が失われる。Documents 直下(Windows では OneDrive 同期対象になり得る)にゴミが見える。他プロセスが同名ファイルを置くと、公開ホスト限定とはいえ画像 URL を注入できる。
- 修正案: アプリデータ配下の一意名(ウィンドウラベル + 連番)にし、キュー形式で複数件を保持する。

## [低] `safe_log_url` が `e` / `s` / `k` / `mkey` を伏せない
- 分類: セキュリティ
- 場所: `src-tauri/src/lib.rs` の `safe_log_url`
- 根拠: 秘匿判定はキー名の部分一致(`token` / `sig` / `session` 等)のみ。pawchive の一時 URL は `?e=<expires>&s=<sig>` 形式。
- 影響: 署名付き一時 URL がログに残る(有効期限付きのため影響は限定的)。
- 修正案: `e` / `s` / `k` / `mkey` を明示的に秘匿対象にするか、クエリ全体を `<redacted>` にする。

## [低] 外部ページウィンドウの状態が閉じても解放されない
- 分類: 資源
- 場所: `src-tauri/src/external_page_desktop.rs` の `PAGES`
- 根拠: 削除は `pawkemo-close#` と保存時のみ。タイトルバーの × では `forget` が呼ばれない。
- 影響: 開いた回数だけ `PageState`(URL・Referer・文脈)が残る。ウィンドウラベルの単調増加も続く。
- 修正案: `on_window_event` の `Destroyed` / `CloseRequested` で `forget` する。

## [低] macOS の `navigate` が `inner()` を retain せず deref する
- 分類: セキュリティ(unsafe 健全性)
- 場所: `src-tauri/src/external_page_desktop.rs` の `navigate`(macOS)
- 根拠: `let view = webview.inner() as *const WKWebView; let view = unsafe { &*view };` で参照を作り `loadRequest` を呼ぶ。
- 影響: ウィンドウ破棄と競合すると dangling 参照になり得る。現状はページロード完了ハンドラ(main thread)からのみ呼ぶため実害は想定しにくい。**要確認**: 実機での競合は未検証。
- 修正案: `Retained<WKWebView>` で保持するか、`MainThreadMarker` を要求する API に寄せて `unsafe` の前提をコメントで固定する。

## [低] FreeBSD 系の cfg 分岐が依存クレート宣言と一致しない
- 分類: プラットフォーム
- 場所: `src-tauri/src/external_page_desktop.rs` の `start_navigation` / `fetch_page`、`src-tauri/Cargo.toml` の `webkit2gtk`
- 根拠: コードは `target_os = "dragonfly" | "freebsd" | "netbsd" | "openbsd"` でも `webkit2gtk::WebViewExt` を使うが、依存は `[target.'cfg(target_os = "linux")'.dependencies]` のみ。
- 影響: これらのターゲットではコンパイル不能。非サポートなら実害はないが、cfg の意図が読めず将来の移植時に誤解を招く。
- 修正案: `cfg(unix)` に揃えるか BSD 分岐を削除し、非対応を明示する。

## [低] 通常構成で警告 6 件(debug-diag 専用の値が未使用)
- 分類: プラットフォーム / テスト
- 場所: `src-tauri/src/lib.rs` の `login_request`、`src-tauri/src/downloads.rs` の `extract_page_images`
- 根拠: `cargo check` で `unused variable: app / login_status / login_body / validation_headers / validation_body` と `variable does not need to be mutable`(`let mut push`)。
- 影響: 警告ノイズで新規警告が埋もれる。製品版ではログイン経路の HTTP 診断が一切出ない(debug-diag ブロックだけが使用する)。
- 修正案: 診断値を `#[cfg(feature = "debug-diag")]` 内で組み立てるか `allow(unused_variables)` を限定適用し、`let mut push` の `mut` を外す。

## [低] 未使用の Tauri コマンド 3 本が IPC に露出している
- 分類: 契約 / セキュリティ
- 場所: `src-tauri/src/lib.rs` の `export_log` / `export_file` / `resolve_download_directory`
- 根拠: `generate_handler!` に登録されているが、フロントの `invoke` から参照がない(すべて `invoke` 呼び出しを grep して確認)。
- 影響: 攻撃面が増える(上記 1 件目のページからも呼べる)。`resolve_download_directory` はデスクトップで空ディレクトリを作る。
- 修正案: 削除するか、利用側を実装して経路を一本化する。

## [低] `api_request` の `method` が自由文字列で、想定外の値が GET に化ける
- 分類: 契約
- 場所: `src-tauri/src/lib.rs` の `api_request`
- 根拠: `match method.as_str() { "POST" => .., "DELETE" => .., _ => client.get(..) }`。
- 影響: 小文字や typo で書き込みが読み取りとして送られ、成功したように見える。逆に未知メソッドを拒否できない。
- 修正案: メソッドを enum(serde)で受け、未知の値はエラーにする。

## [低] `api_request` の `path` に検証がない
- 分類: 契約
- 場所: `src-tauri/src/lib.rs` の `api_request`
- 根拠: `let path = path.trim_start_matches('/'); format!("https://pawchive.pw/api/v1/{}", path)`。
- 影響: ホスト脱出は `Url` 正規化で起きないが、`../account/...` など API v1 外の経路へ到達できる。空文字なら `/api/v1/` への GET になる。
- 修正案: 先頭セグメントを許可リスト(`posts` / `creators` / `account` / `search_hash` 等)で検証し、`?` / `#` / `..` を拒否する。

## [低] `fetch_creator_icon` が応答サイズ無制限・Client を毎回生成
- 分類: 資源
- 場所: `src-tauri/src/lib.rs` の `fetch_creator_icon`
- 根拠: `resp.bytes()` をそのまま読み、`reqwest::Client::builder()` を呼び出しごとに生成する。
- 影響: 巨大応答でメモリを消費する。多数のアイコン取得で TLS ハンドシェイクが毎回発生する(0.4.0 監査時からの既知事項)。
- 修正案: `API_HTTP_CLIENT` を共有し、`read_body_limited` 相当の上限(例 512 KiB)を設ける。

## [低] Android の `store_shared` が失敗時もキャッシュを削除する
- 分類: 正確性
- 場所: `src-tauri/src/downloads.rs` の `store_shared`
- 根拠: `let _ = std::fs::remove_file(path);` を `result` の判定より前に無条件実行する(コメントは「成功したら消える」)。
- 影響: MediaStore 失敗時に再試行・再送の材料が残らない。失敗理由だけが UI に出る。
- 修正案: 成功時のみ削除し、失敗時は残して原因調査に使う(または明示的に破棄ログを残す)。

## [低] `take_external_page_images` が JSON を検証する前に削除する
- 分類: 正確性
- 場所: `src-tauri/src/lib.rs` の `take_external_page_images`
- 根拠: `read_to_string` の直後に `remove_file` し、その後 `serde_json::from_str` する。
- 影響: 壊れた JSON・空画像で失敗すると、ユーザーの選択が再取得不能になる(既知: `pawchive/bugs.md`)。
- 修正案: パース成功後に削除する。失敗時は `.bad` へ退避して原因を残す。

## [低] `export_log` のファイル名が秒精度で、同一秒の 2 回で上書きされる
- 分類: 正確性
- 場所: `src-tauri/src/lib.rs` の `export_log` / `chrono_free_name`
- 根拠: `format!("{}_viewer.log", chrono_free_name())` + `File::create`(上書き)。`export_file` 側は `create_new` + 連番で回避している。
- 影響: 連続エクスポートで前のファイルが消える。
- 修正案: `export_file` と同じ `create_new` + 連番方式に統一する。

## [低] pkv が HEAD / PUT / DELETE を GET として送り、Content-Type も固定する
- 分類: 正確性
- 場所: `src-tauri/src/lib.rs` の `pkv_proxy_fetch`
- 根拠: `match method { "POST" => client.post(..), _ => client.get(..) }`、POST は `application/x-www-form-urlencoded` 固定。
- 影響: HEAD が本文付きで返り、PUT/DELETE が読み取りになる。multipart フォームは中継できない(既知 P11)。
- 修正案: GET / HEAD / POST のみ許可し、それ以外は 405。Content-Type は要求ヘッダーから透過する。

## [低] pkv の HTML が文字コードを無視して UTF-8 lossy 変換される
- 分類: 正確性
- 場所: `src-tauri/src/lib.rs` の `pkv_proxy_fetch`(HTML 分岐)と `downloads.rs` の `run_download`
- 根拠: `String::from_utf8_lossy(&bytes)`。`<meta charset>` / `Content-Type` の charset を見ない。
- 影響: Shift_JIS / EUC-JP の外部ページで日本語が壊れ、`<base>` 挿入位置もずれ得る(既知 P12)。
- 修正案: `Content-Type` の charset から変換するか、変換できなければバイト列のまま返す。

## [低] `list_locale_directory` が件数無制限にメモリへ展開する
- 分類: 資源
- 場所: `src-tauri/src/locale_storage.rs` の `list_locale_directory`
- 根拠: ディレクトリ内の全 `*.json` を 1 MiB まで読み、`Vec<LocaleFile>` に貯めて IPC で返す。
- 影響: 外部フォルダーに大量のファイルを置かれるとメモリと IPC 転送量が増える。
- 修正案: 件数上限(例 200)と合計バイト上限を設け、超過分は `invalid` として扱う。

## [低] `unique_file_path` が最大 9999 回の `exists()` を同期実行する
- 分類: 資源
- 場所: `src-tauri/src/downloads.rs` の `unique_file_path`
- 根拠: `for index in 1..=9999 { let candidate = ...; if !candidate.exists() { return candidate } }`
- 影響: 同一起動で同じクリエイターの保存を繰り返すと stat 回数が増え、モバイルで保存が遅くなる。
- 修正案: 連番をディレクトリ読み取り 1 回で求める、または保存済み最大番号を状態として持つ。

## [低] `Cargo.lock` が未追跡でビルドの再現性がない
- 分類: プラットフォーム / 契約
- 場所: `.gitignore`(`Cargo.lock`)、`src-tauri/Cargo.toml`
- 根拠: `tauri = "2"` / `reqwest = "0.12"` / `objc2 = "0.6"` などの範囲指定のみで、解決結果はローカルのみ(`Cargo.lock` は 485 パッケージ)。
- 影響: ビルドごとに依存が変わり得る。バイナリ配布物の SBOM・再現ビルドが固定できない(CI も毎回解決)。
- 修正案: アプリケーションなので `Cargo.lock` を追跡する。併せて SBOM 生成を CI に置く。

## [低] `tauri.conf.json` の version が package.json 参照で、Cargo.toml と三重管理
- 分類: 契約
- 場所: `src-tauri/tauri.conf.json` の `version`、`src-tauri/Cargo.toml` の `package.version`
- 根拠: `"version": "../package.json"` を参照。現在は双方 0.6.0 で一致。
- 影響: 更新漏れでアプリ表示バージョンと `cargo` 側が食い違う(過去に版番号更新で複数ファイルを触っている運用)。
- 修正案: 片方を正本にし、他方は生成またはビルド時に検証する。

## [低] `probe_api.rs` が本番 `/account/login` にダミー認証を送り、Set-Cookie を標準出力へ出す
- 分類: テスト / セキュリティ
- 場所: `src-tauri/examples/probe_api.rs`
- 根拠: `probe_test_user` / `probe_test_pass` で実際に POST し、`for sc in resp3.headers().get_all("set-cookie") { println!("set-cookie: {}", ...) }` する。
- 影響: 実行のたびに本番へ失敗ログインが記録される。将来ここに実資格情報を入れると端末のコンソール・CI ログにセッションが残る。
- 修正案: 既定を `--dry-run`(送信なし)にし、Set-Cookie は値ではなく存在と長さだけ出力する。

## [低] テストが危険経路を覆っていない
- 分類: テスト
- 場所: `src-tauri/src/lib.rs` の `tests`(5 件)、`src-tauri/src/downloads.rs` の `tests`(11 件)
- 根拠: 既存テストは URL 生成・Referer 許可・ホスト/IP 判定・サニタイズ・命名・画像抽出。`transform_html` / `read_body_limited` / `pkv_proxy_fetch`(`u`/`r` クエリ解析) / `proxy_queue` / `valid_locale_code` / `open_external_page` の検証 / `civil_from_days` は未テスト。
- 影響: SSRF 回帰(許可リストの緩和、fail-open 化、リダイレクト検査の欠落)を検出できない。locale コード検証の後退はパストラバーサルに直結する。
- 修正案: 判定ロジックを純関数として切り出して単体テストを追加し、ローカル HTTP サーバでサイズ上限・リダイレクト拒否・タイムアウトを結合テストする。
