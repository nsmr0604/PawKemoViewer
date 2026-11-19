# API ドキュメント

PawKemoViewer (v0.3.2) の API レイヤ仕様。実装は `src/api.ts`。

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

- `fileUrl(f, service?, postId?, refererUrl?)` — 本体ファイル URL。FANBOX / Patreon 由来は `proxyImages` 有効時に pkv:// 経由 (記事 URL を Referer に使用)。pawchive 配信 (n1 / img) は直接
- `thumbUrl(f)` — サムネイル (`img.pawchive.pw/thumbnail/data{path}`)。直接取得のみ
- `proxyFileUrl(url, service?, postId?, refererUrl?)` — ホットリンク対策 (fanbox/patreon/pximg) を pkv:// 経由に変換 (`proxyImages` 無効時は原 URL のまま)
- `proxyLinkUrl(url, service?, postId?, refererUrl?)` — 本文中の外部リンクを pkv:// 経由に変換
- Referer の決定順: `refererUrl` (正規の記事 URL) → fanbox/patreon の記事 URL (postId あり) → サービストップ
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
| `debug_append_log(text)` | (debug-diag feature のみ) ログ行を `app_data/logs/debug-app.log` に追記 |
| `debug_open_log_folder()` | (debug-diag feature のみ) ログフォルダをファイラで開く |

### pkv:// プロトコル
WebView から Referer を設定できないため、リファラーチェックがある外部 URL を Rust 側で中継する。
- `/file?u=<対象URL>&r=<リファラー>`
- 対象は外部メディアホストのみ。**pawchive 本体ホスト (`pawchive.pw` / `*.pawchive.pw`) は対象外** (`f=1` 強制中継は 0.3.1 で廃止)
- SSRF 対策 (内部アドレス拒否) あり。fanbox / patreon のホストは中継対象
- HTML ページは base 注入 + リンク/リソースのプロキシ化を行う

## データ型 (src/types.ts)

主要型: `PawPost` / `PawCreator` / `PawTag` / `PawComment` / `PawRevision` / `PawFile` / `PawAnnouncement` / `HashLookupResult` / `AccountFavorite` / `Settings`

- `PawPost`: id / user / service / title / content / embed / shared_file / added / published / edited / file / attachments / next / prev / (実測追加: tags / origin / preview_state / has_full / detail_fetched / substring)
- `AccountFavorite`: PawPost を Partial 継承 + faved_seq (type=post は PawPost 全フィールド)
- `PawCreator`: id / public_id / service / name / indexed / updated / favorited
- `PawRevision extends PawPost` + revision_id
