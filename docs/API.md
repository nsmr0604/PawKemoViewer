# API ドキュメント

PawKemoViewer (v0.4.1) の API レイヤ仕様。実装は `src/api.ts`。

## アーキテクチャ

```text
React (src/api.ts)
  ↓ invoke("api_request")
Tauri (src-tauri/src/lib.rs)
  ↓ reqwest (Rust / rustls)
https://pawchive.pw/api/v1
```

ブラウザの fetch は使用しない。Rust 側が User-Agent / Referer / Origin / Cookie を付与する。

## 設定 (Settings)

```ts
interface Settings {
  sessionKey: string       // pawchive の session cookie
  theme: "dark" | "light"
  layoutMode: "auto" | "desktop" | "mobile"
  noImageMode: boolean     // 低通信モード
  postViewMode: "grid" | "list"
  timeoutSecs: number      // 既定 30 (1〜300 にクランプ)
  proxyImages: boolean     // FANBOX / Patreon 由来の画像・ファイルを pkv:// 経由で読み込む (pawchive 本体は常に直接)
  postFileListMode: boolean     // 投稿内の画像を一覧表示 (省データ・自動読み込みしない)
  excludeAiPosts: boolean       // グローバル投稿一覧・検索で AI 分類を除外 (hide=(ai))
  excludeFanboxCover: boolean   // FANBOX の cover.jpeg を投稿ファイルから除外 (グローバル設定)
  locale: "ja" | "en"           // 表示言語 (既定 ja)
}
```

保存先: `localStorage` キー `pawkemo-settings`。変更は `pawkemo-settings-changed` イベントで通知。

## HTTP レイヤ

### 負荷制御
- 同時実行: 最大 3
- リクエスト間隔: 最小 250ms
- GET レスポンスキャッシュ: TTL 60s / 最大 150 件
- 世代番号 (cacheGeneration) でセッション切替時の古い結果混入を防止

### エラー復元
Rust は失敗時に `Err("STATUS=401 BODY=...")` 文字列を返す。JS 側は `ApiError(500)` で包むため、
**ステータス分岐は必ず `apiStatus(err)` で復元する**。

### API エンドポイント (pawchive.pw)

#### Posts
- `api.posts({q?, o?})` → `GET /posts?q=&o=` (o は 50 刻み)。設定 `excludeAiPosts=true` の場合は `hide=(ai)` を追加し、公式 API 側で AI 分類投稿を除外する。ホームのサービスフィルターのみクライアント側で適用する。任意タグフィルターは提供しない
- `api.creators()` → `GET /creators` (約 10 万件)
- `api.creatorPosts(service, creatorId, {q?, tag?, o?})` → `GET /{service}/user/{creatorId}?q=&tag=&o=`
  - `tag` は配列 (繰り返し送信)、q より優先
- `api.creatorProfile(service, creatorId)` → `GET /{service}/user/{creatorId}/profile`
- `api.creatorTags(service, creatorId)` → `GET /{service}/user/{creatorId}/tags`
- `api.creatorAnnouncements(service, creatorId)` → `GET /{service}/user/{creatorId}/announcements`
- `api.post(service, creatorId, postId)` → `GET /{service}/user/{creatorId}/post/{postId}`
- `api.postRevisions(service, creatorId, postId)` → `GET /{service}/user/{creatorId}/post/{postId}/revisions`
  - 改訂なし投稿は 404 + `[]` を返す → `apiStatus() === 404` で「改訂なし」扱い
- `api.postComments(service, creatorId, postId)` → `GET /{service}/user/{creatorId}/post/{postId}/comments`
  - コメント無しは 404 "No comments found." → 空配列扱い
- `api.searchHash(hash)` → `GET /search_hash/{sha256}`

#### 認証が必要 (session cookie)
- `api.accountFavorites(type, sessionKey)` → `GET /account/favorites?type=post|artist`
  - type=post は PawPost 全フィールド + `faved_seq` を返す (スキーマのスリム形は artist 向け)
- `api.favPostAdd(service, creatorId, postId)` → `POST /favorites/post/{service}/{creatorId}/{postId}`
- `api.favPostRemove(...)` → `DELETE ...`
- `api.favCreatorAdd(service, creatorId)` → `POST /favorites/creator/{service}/{creatorId}`
- `api.favCreatorRemove(...)` → `DELETE ...`
- `api.flagPost(service, creatorId, postId)` → `POST /{service}/user/{creatorId}/post/{postId}/flag`
  (再インポート申請。409 = 既に申請済み)
- `api.version()` → `GET /app_version` (サーバ commit hash / "custom")

### URL 生成

- `fileUrl(f, service?, postId?, refererUrl?)` — 本体ファイル URL。FANBOX / Patreon 由来は `proxyImages` 有効時に pkv 経由 (記事 URL を Referer に使用)。pawchive 配信 (n1 / img) は直接
- `thumbUrl(f)` — サムネイル (`img.pawchive.pw/thumbnail/data{path}`)。直接取得のみ
- `proxyFileUrl(url, service?, postId?, refererUrl?)` — ホットリンク対策 (fanbox/patreon/pximg) と、**投稿コンテキストのある外部ホスト**を pkv 経由に変換 (`proxyImages` 無効時は原 URL のまま)
- `proxyLinkUrl(url, service?, postId?, refererUrl?)` — 本文中の外部リンクを pkv 経由に変換
- Referer の決定順: `refererUrl` (正規の記事 URL) → service / postId から導出した元記事 URL → サービストップ。fanbox は creator slug が分かる場合 `https://www.fanbox.cc/@slug/posts/{postId}`、不明なら `https://www.fanbox.cc/posts/{postId}`
- `creatorIconUrl(service, id)` — `https://pawchive.pw/icons/{service}/{userId}`
- `creatorBannerUrl(service, id)` — `https://pawchive.pw/banners/{service}/{userId}`
- `postUrl(service, userId, postId)` — pawchive 投稿ページ
- `creatorUrl(service, userId)` — pawchive クリエイターページ
- `originalPostUrl(service, creatorId, postId)` — 元サービスの投稿 URL (fanbox: `{slug}.fanbox.cc/posts/{id}` / patreon: `patreon.com/posts/{id}`)
- `originalCreatorUrl(service, creatorId)` — 元サービスのクリエイターページ (fanbox: `{slug}.fanbox.cc` / patreon: `patreon.com/user?u={id}`)

### normalizeTags
詳細 API の `tags` は PostgreSQL 配列リテラル文字列 (`"{\"one piece\"}"`) で返る場合がある。
`normalizeTags(v)` は配列 / JSON 文字列 / PG 配列リテラルをすべて配列に正規化する。

## Tauri コマンド (src-tauri/src/lib.rs)

| コマンド | 用途 |
|---|---|
| `api_request(path, method, sessionKey, timeoutSecs)` | pawchive API 中継 (reqwest) |
| `login_request(username, password, timeoutSecs)` | ログイン + session cookie 抽出 + 有効性検証 |
| `export_log(text)` | ログを `%APPDATA%/logs/YYYY-MM-DD_HH-MM-SS_viewer.log` に書き出し |
| `export_file(fileName, text)` | 任意テキストを `%APPDATA%/backup/` に書き出し |
| `fetch_creator_icon(service, id)` | クリエイターアイコンを取得 + `app_data/icons/{service}_{id}.webp` にキャッシュ → data URL |
| `creator_icon_cache_info()` | クリエイターアイコンのキャッシュ件数・合計バイト数 |
| `clear_creator_icon_cache()` | アイコンのディスクキャッシュを消去 |
| `debug_append_log(text)` | (Full / debug-diag feature のみ) ログ行を `app_data/logs/debug-app.log` に追記 |
| `debug_open_log_folder()` | (Full / debug-diag feature のみ) ログフォルダをファイラで開く |

### pkv プロトコル
WebView から Referer を設定できないため、リファラーチェックがある外部 URL を Rust 側で中継する。
- Windows / Android: `/file?u=<対象URL>&r=<リファラー>` (`http://pkv.localhost`)
- macOS / iOS / Linux: `pkv://localhost/file?u=<対象URL>&r=<リファラー>`
- 対象はホットリンク対策ホスト (fanbox / patreon / pximg) と、投稿コンテキストのある外部ホスト。
  **pawchive 本体ホスト (`pawchive.pw` / `*.pawchive.pw`) は常に対象外** (`f=1` 強制中継は 0.3.1 で廃止)
- `r` に指定できるのは fanbox.cc / patreon.com のページのみ (任意サイトへの Referer 偽装を防ぐ)
- SSRF 対策 (内部アドレス拒否) あり。転送先の名前解決 IP も検査する
- 応答は 64 MiB (HTML は 8 MiB) を上限とし、超過は 413。転送は 4 ワーカー、リダイレクトは最大 5 回
- HTML ページは base 注入 + リンク/リソースのプロキシ化を行う

## データ型 (src/types.ts)

主要型: `PawPost` / `PawCreator` / `PawTag` / `PawComment` / `PawRevision` / `PawFile` / `PawAnnouncement` / `HashLookupResult` / `AccountFavorite` / `Settings`

- `PawPost`: id / user / service / title / content / embed / shared_file / added / published / edited / file / attachments / next / prev / (実測追加: tags / origin / preview_state / has_full / detail_fetched / substring)
- `AccountFavorite`: PawPost を Partial 継承 + faved_seq (type=post は PawPost 全フィールド)
- `PawCreator`: id / public_id / service / name / indexed / updated / favorited. Creator list caches updated / indexed / favorited in index v3 to support client-side sorting.
- `PawRevision extends PawPost` + revision_id


### Full 開発診断: Android API logcat
- Cargo feature `debug-diag` が有効な Android デバッグビルドでは、`api_request` のリクエスト開始 (method / URL)、HTTP status、レスポンス本文を `log::info!` で出力する。Tauri log plugin の Android Stdout target が logcat に転送する
- レスポンス本文は UTF-8 文字境界を維持して約 3 KB ごとに分割し、大きな JSON も追跡できる
- 通信エラー / レスポンス本文読取エラーも記録する
- Cookie / Authorization ヘッダー / session ID / ログインID・パスワードは出力しない。ログイン専用 `login_request` は対象外
- 製品版では `debug-diag` feature が無いため、ログ出力コード自体をコンパイルしない


### Full 開発診断: HTTP プロキシ通信ログ
- Pawchive API (`api_request`) と `pkv://` 経由の外部 HTTP 通信について、送信リクエスト / 受信レスポンスの method・URL・HTTP status・ヘッダーを記録する
- ヘッダーは1行ずつ記録。Cookie / Set-Cookie / Authorization / Proxy-Authorization / API key / auth token は値を `<redacted>` に置換する。URL query も token / secret / session / auth / signature 等の値をマスキングする
- 外部プロキシのテキスト / JSON / XML / HTML 応答本文は既存の Full 本文ロガーで記録。画像などのバイナリ本文は内容を出さず、サイズのみ記録
- リクエスト本文は現状記録しない。ログイン専用 `login_request` は引き続き対象外
- Full / Cargo feature `debug-diag` のみ。正式版にはログコードを含めない
- 本文には個人情報・投稿情報等が含まれる可能性があるため、ログを外部共有する前に内容を確認すること


### Lite / Full ログ保存先と記録範囲
- 共通ログファイルはアプリデータディレクトリの `logs/pawchive.log`。Lite / Full のネイティブ通信ログを追記する
- Lite: エラーのみ。Pawchive API エラーでは宛先 URL とレスポンス本文のみを記録。通信失敗 / 本文読取失敗は宛先のみ。外部プロキシはエラーのみ記録
- Full: Pawchive API と `pkv://` 外部プロキシの request / response、method / URL / status / ヘッダー / テキスト応答本文 / 通信エラーを logcat と同じ `pawchive.log` に記録
- Full は `debug-diag` feature のみ。正式版では Full 詳細ログ処理をコンパイルしない。Lite のエラー記録は製品版でも有効
- Cookie / Authorization / token / session / API key 等のヘッダー値と URL query の credential 値はマスキングする


- Lite のアプリ内ログリングバッファも error のみを保持し、API 失敗は宛先 URL と `BODY=` のレスポンス本文のみを表示する。info / warn は Lite では破棄する。


#### ログの秘匿情報マスキング
- Full の URL ログでは query の token / secret / session / auth / signature / password / passwd / jwt 等の値を置換し、URL user-info も除去する
- HTTP ヘッダーでは Cookie / Set-Cookie / Authorization / Proxy-Authorization / token / session / auth / API key / password 等に該当する値を置換する
- ログ本文には個人情報・投稿データが含まれる可能性があり、認証情報のマスキングとは別に共有前の確認が必要


#### Full のリクエスト本文ログ
- Full は pkv proxy の POST request body を含め、HTTP request body を logcat と `app_data/logs/pawchive.log` に記録する
- Pawchive のログイン POST はフォーム本文の構造を記録するが、username / password は値を伏せる
- ログイン後の session validation と creator icon fetch も Full の通信トレース対象
- form-urlencoded / JSON の password・token・secret・session・auth・credential・API key・JWT 等はマスキングする
- 現行 `api_request` は request body 引数を持たないため、API POST は現状空 body。API payload 対応を追加する場合は Full body logger への接続も必要
