# API ドキュメント

PawKemoViewer 0.5.5 の API レイヤ仕様です。クライアント実装は `src/api.ts` にあります。

## アーキテクチャ

```text
React (src/api.ts)
  ↓ invoke("api_request")
Tauri (src-tauri/src/lib.rs)
  ↓ reqwest (Rust / rustls)
https://pawchive.pw/api/v1
```

ブラウザの `fetch` は使用しない。Rust 側が User-Agent / Referer / Origin / Cookie を付与する。

## 設定 (Settings)

```ts
interface Settings {
  sessionKey: string       // pawchive の session cookie
  theme: "dark" | "light"
  layoutMode: "auto" | "desktop" | "mobile"
  noImageMode: boolean     // 低通信モード
  postViewMode: "grid" | "list"
  timeoutSecs: number      // 既定 30 (1〜300 にクランプ)
  proxyImages: boolean     // 投稿の外部メディアを pkv 経由で取得 (既定 false)
  postFileListMode: boolean     // 投稿内の画像を一覧表示 (省データ・自動読み込みしない)
  excludeAiPosts: boolean       // グローバル投稿一覧・検索で AI 分類を除外 (hide=(ai))
  excludeFanboxCover: boolean   // FANBOX の cover.jpeg を投稿ファイルから除外
  developerToolsEnabled: boolean // 製品版の開発項目を表示 (既定 false)
  locale: string               // 同梱または外部の言語コード (既定 ja)
}
```

- 保存先: `localStorage` キー `pawkemo-settings`
- 変更通知: `pawkemo-settings-changed` イベント

## HTTP レイヤ

### 負荷制御

- 同時実行: 最大 3
- リクエスト間隔: 最小 250ms
- GET レスポンスキャッシュ: TTL 60 秒 / 最大 150 件
- 世代番号 (cacheGeneration) でセッション切替時の古い結果混入を防止
- Favorites の新着チェックは 5 分クールダウン

### エラー復元

Rust は失敗時に `Err("STATUS=401 BODY=...")` 文字列を返す。JS 側は `ApiError(500)` で包むため、
**ステータス分岐は必ず `apiStatus(err)` で復元する**。

### API エンドポイント (pawchive.pw)

#### Posts

- `api.posts({q?, o?})` → `GET /posts?q=&o=` (o は 50 刻み)。
  `excludeAiPosts=true` の場合は `hide=(ai)` を追加する。ホームのサービスフィルターはクライアント側で適用する
- `api.creators()` → `GET /creators` (約 10 万件)
- `api.creatorPosts(service, creatorId, {q?, tag?, o?})` → `GET /{service}/user/{creatorId}?q=&tag=&o=`
  - `tag` は配列 (繰り返し送信)。q より優先
- `api.creatorProfile(service, creatorId)` → `GET /{service}/user/{creatorId}/profile`
- `api.creatorTags(service, creatorId)` → `GET /{service}/user/{creatorId}/tags`
- `api.creatorAnnouncements(service, creatorId)` → `GET /{service}/user/{creatorId}/announcements`
- `api.post(...)` → `GET /{service}/user/{creatorId}/post/{postId}`
- `api.postRevisions(...)` → `GET /{service}/user/{creatorId}/post/{postId}/revisions`
  - 改訂なし投稿は 404 + `[]` を返す → 「改訂なし」扱い
- `api.postComments(...)` → `GET /{service}/user/{creatorId}/post/{postId}/comments`
  - コメント無しは 404 "No comments found." → 空配列扱い
- `api.searchHash(hash)` → `GET /search_hash/{sha256}`

#### 認証が必要 (session cookie)

- `api.accountFavorites(type, sessionKey)` → `GET /account/favorites?type=post|artist`
  - type=post は PawPost 全フィールド + `faved_seq` を返す (スリム形は artist 向け)
- `api.favPostAdd / favPostRemove` → `POST` / `DELETE /favorites/post/{service}/{creatorId}/{postId}`
- `api.favCreatorAdd / favCreatorRemove` → `POST` / `DELETE /favorites/creator/{service}/{creatorId}`
- `api.flagPost(...)` → `POST /{service}/user/{creatorId}/post/{postId}/flag`
  (再インポート申請。409 = 既に申請済み)
- `api.version()` → `GET /app_version` (サーバ commit hash / "custom")

### URL 生成

- `fileUrl(f, service?, postId?, refererUrl?)` — 本体ファイル URL。pawchive 配信は直接取得する
- `thumbUrl(f)` — サムネイル (`img.pawchive.pw/thumbnail/data{path}`)。直接取得のみ
- `proxyFileUrl(url, service?, postId?, refererUrl?)` — `proxyImages` 有効時に、
  ホットリンク対策ホストか、元記事 URL が渡された外部メディアを pkv 経由に変換する
- `proxyLinkUrl(url, service?, postId?, refererUrl?)` — 本文中の対象となる外部リンクを pkv 経由に変換する。
  pawchive / ローカル / ホットリンク対策ホストへのリンクは元の URL を返す
- Referer の決定順: `refererUrl` → service / postId から導出した元記事 URL → サービストップ。
  fanbox は slug が分かる場合 `https://www.fanbox.cc/@slug/posts/{postId}`、
  不明なら `https://www.fanbox.cc/posts/{postId}`
- `creatorIconUrl` / `creatorBannerUrl` — pawchive のアイコン / バナー
- `postUrl` / `creatorUrl` — pawchive のページ URL
- `originalPostUrl` / `originalCreatorUrl` — 元サービスの URL
  (fanbox: `{slug}.fanbox.cc/posts/{id}` / patreon: `patreon.com/posts/{id}`)

### normalizeTags

詳細 API の `tags` は PostgreSQL 配列リテラル文字列 (`"{\"one piece\"}"`) で返る場合がある。
`normalizeTags(v)` は配列 / JSON 文字列 / PG 配列リテラルをすべて配列に正規化する。

## Tauri コマンド

| コマンド | 用途 |
|---|---|
| `api_request(path, method, sessionKey, timeoutSecs)` | pawchive API 中継 (reqwest) |
| `login_request(username, password, timeoutSecs)` | ログイン + session cookie 抽出 + 有効性検証 |
| `export_log(text)` | ログをアプリデータの `logs/` に書き出し |
| `export_file(fileName, text)` | 任意テキストを `backup/` に書き出し |
| `pick_json_file(purpose, appDirectory?)` | 言語またはバックアップの JSON を選択。モバイルは標準フォルダーからの読み込みも可 |
| `save_user_file(purpose, filename, text, appDirectory?)` | 言語・バックアップ・ログを保存先へ書き出し |
| `list_locale_files()` / `list_secondary_locale_files()` | アプリ専用領域と追加フォルダーの翻訳ファイルを取得 |
| `fetch_creator_icon(service, id)` | アイコン取得 + ディスクキャッシュ → data URL |
| `creator_icon_cache_info()` | アイコンキャッシュの件数・バイト数 |
| `clear_creator_icon_cache()` | アイコンキャッシュを消去 |
| `open_external_page(url, referer)` | (Android / iOS) 外部ページを実オリジンのまま Referer 付きのネイティブビューで開く |
| `debug_append_log(text)` | (Full / debug-diag のみ) ログ行を `logs/debug-app.log` に追記 |
| `debug_open_log_folder()` | (Full / debug-diag のみ) ログフォルダを開く |

### pkv プロトコル

WebView から Referer を設定できないため、リファラーチェックがある外部 URL を Rust 側で中継する。

- Windows / Android: `http://pkv.localhost/file?u=<対象URL>&r=<Referer>`
- macOS / iOS / Linux: `pkv://localhost/file?u=<対象URL>&r=<Referer>`
- 対象: ホットリンク対策ホスト (fanbox / patreon / pximg) と、投稿コンテキストのある外部ホスト。
  **pawchive 本体 (`pawchive.pw` / `*.pawchive.pw`) は常に対象外** (`f=1` は 0.3.1 で廃止)
- `r` に指定できるのは fanbox.cc / patreon.com のみ (任意サイトへの Referer 偽装を防ぐ)
- SSRF 対策: 内部アドレスを拒否し、名前解決後の IP (private / loopback / link-local / CGNAT) も検査する
- 資源制御: 本文 64 MiB (HTML は 8 MiB、超過は 413)、connect 10 秒 / 全体 180 秒、
  4 ワーカー、リダイレクトは最大 5 回で各ホップを検査する
- HTML ページは `<base>` 注入とリンク / リソースのプロキシ化を行う

### 外部ページのネイティブ表示 (Android / iOS)

reCAPTCHA を含む外部ページは pkv (pkv.localhost オリジン、Android は POST 本文なし) では
動作しない。投稿本文の外部リンクは `data-external-url` を持ち、モバイルでは
`open_external_page(url, referer)` で実オリジンの WebView に Referer 付きで読み込む。

- `url` は http(s) のみ
- `referer` は fanbox.cc / patreon.com のみ許可
- 実装: `src-tauri/plugins/external-view` (Android: Activity + WebView / iOS: WKWebView)
- デスクトップは従来どおり pkv を使う

## データ型 (src/types.ts)

主要型: `PawPost` / `PawCreator` / `PawTag` / `PawComment` / `PawRevision` / `PawFile` /
`PawAnnouncement` / `HashLookupResult` / `AccountFavorite` / `Settings`

- `PawPost`: id / user / service / title / content / embed / shared_file / added / published /
  edited / file / attachments / next / prev / (実測追加: tags / origin / preview_state / has_full /
  detail_fetched / substring)
- `AccountFavorite`: `Partial<PawPost>` + `faved_seq` (type=post は PawPost 全フィールド)
- `PawCreator`: id / public_id / service / name / indexed / updated / favorited
- `PawRevision extends PawPost` + `revision_id`

## 診断ログ

### ビルドと出力先

- **Lite (製品版を含む)**: エラーのみ。アプリデータの `logs/pawchive.log` と
  Android の logcat に記録する。Pawchive API のエラーは宛先 URL と本文のみ、外部プロキシはエラーのみ
- **Full (debug-diag のみ)**: Pawchive API と pkv 外部プロキシの request / response、
  method / URL / status / ヘッダー / テキスト本文 / 通信エラーを logcat と `pawchive.log` に記録する
- Full の詳細ログは製品版に含めない (フロントの `VITE_DEBUG_DIAG=0` + Cargo feature 無し)

### マスキング

- ヘッダー: Cookie / Set-Cookie / Authorization / Proxy-Authorization / token / session /
  auth / API key / password 等の値を置換する
- URL: query の token / secret / session / auth / signature / password / passwd / jwt 等と
  user-info をマスキングする
- ログ本文には投稿・個人情報が含まれ得る。共有前に内容を確認する

### その他

- Android のデバッグビルドでは API のリクエスト開始・status・本文を約 3 KB ずつ出力する
- ログイン POST はフォーム本文の構造のみ記録し、username / password の値は記録しない
- ログ共有前に、認証情報以外の個人情報が含まれていないか確認する

## ストレージ (アプリ側)

| 種別 | 場所 | 内容 |
|---|---|---|
| localStorage | `pawkemo-settings` ほか | 設定・フォロー・タブ状態・履歴 |
| IndexedDB | `pawkemoviewer` / `pawkemo-icons` | 索引・既読・アイコン |
| ファイル | `app_data/icons/` / `logs/` / `locales/` | アイコン・ログ・外部翻訳 |
| モバイル標準フォルダー | `Documents/{Languages,Backups,Logs}` | 書き出し・読み込み |

- バックアップの type は `pawkemoviewer-backup`
- 0.2.x からの引継ぎはバックアップの書き出し → 読み込み
