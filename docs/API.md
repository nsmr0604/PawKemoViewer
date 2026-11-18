# API ドキュメント

PawKemoViewer (v0.3.0) の API レイヤ仕様。実装は `src/api.ts`。

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
  proxyImages: boolean     // 画像を paw:// 経由で読み込む (AdGuard sinkhole 対策)
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
- `api.posts({q?, o?})` → `GET /posts?q=&o=` (o は 50 刻み)
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

- `fileUrl(f)` — 本体ファイル URL (deferred は temp_download_url を paw:// 経由)
- `thumbUrl(f)` — サムネイル (`img.pawchive.pw/thumbnail/data{path}`)
- `proxyFileUrl(url)` — ホットリンク対策 (fanbox/patreon/pximg) を paw:// 経由に変換
- `proxyLinkUrl(url, service)` — 本文中の外部リンクを paw:// 経由に変換
- `pawchiveProxyUrl(url)` — pawchive ホストを paw:// (f=1 force) で中継 (AdGuard 対策)
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
| `debug_append_log(text)` | (debug-diag feature のみ) ログ行を `app_data/logs/debug-app.log` に追記 |
| `debug_open_log_folder()` | (debug-diag feature のみ) ログフォルダをファイラで開く |

### paw:// プロトコル
WebView から Referer を設定できないため、リファラーチェックがある外部 URL を Rust 側で中継する。
- `/file?u=<対象URL>&r=<リファラー>` (+ `&f=1` で pawchive ホストの強制中継)
- SSRF 対策 (内部アドレス拒否) / direct ホスト (fanbox/patreon/pawchive) の除外ロジックあり
- HTML ページは base 注入 + リンク/リソースのプロキシ化を行う

## データ型 (src/types.ts)

主要型: `PawPost` / `PawCreator` / `PawTag` / `PawComment` / `PawRevision` / `PawFile` / `PawAnnouncement` / `HashLookupResult` / `AccountFavorite` / `Settings`

- `PawPost`: id / user / service / title / content / embed / shared_file / added / published / edited / file / attachments / next / prev / (実測追加: tags / origin / preview_state / has_full / detail_fetched / substring)
- `AccountFavorite`: PawPost を Partial 継承 + faved_seq (type=post は PawPost 全フィールド)
- `PawCreator`: id / public_id / service / name / indexed / updated / favorited
- `PawRevision extends PawPost` + revision_id
