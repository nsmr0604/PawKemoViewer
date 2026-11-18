# API Reference

PawKemoViewer が利用する pawchive.pw API と、アプリ内 API レイヤ (`src/api.ts`) の対応表。

---

## アーキテクチャ

ブラウザの `fetch` は使用しません。すべて Tauri コマンド経由で Rust (reqwest) に委譲します。

```text
React (src/api.ts)
  ↓ invoke("api_request", { path, method, sessionKey, timeoutSecs })
Tauri 2 (src-tauri/src/lib.rs)
  ↓ reqwest (rustls / brotli / gzip)
https://pawchive.pw/api/v1/{path}
```

- ベース URL `https://pawchive.pw/api/v1` は Rust 側が付与
- 負荷制御: 同時 3 リクエスト / 開始間隔 250ms / GET は 60 秒 TTL・150 件キャッシュ (`src/api.ts`)
- エラーは `STATUS={code} BODY={...}` 形式の文字列で返るため、JS 側は `apiStatus(err)` で実ステータスを復元して判定する

---

## エンドポイント一覧

### 投稿

| API | 実装 | 備考 |
|---|---|---|
| `GET /posts?q=&o=` | `api.posts({ q, o })` | 最近の投稿。`o` は 50 刻み (50 の倍数以外は 400) |
| `GET /{service}/user/{id}` | `api.creatorPosts(service, id, { q, tag, o })` | クリエイター投稿一覧。`tag` は `q` より優先 |
| `GET /{service}/user/{id}/post/{postId}` | `api.post()` | 投稿詳細。`next` / `prev` に前後投稿 ID |
| `GET .../post/{postId}/revisions` | `api.postRevisions()` | **改訂なし投稿は 404 + `[]` を返す** (実測)。アプリは 404 を「改訂なし」扱い |
| `GET .../post/{postId}/comments` | `api.postComments()` | コメントなし投稿は 404 を返す |
| `GET /search_hash/{sha256}` | `api.searchHash()` | ファイルハッシュ検索 |

### クリエイター

| API | 実装 | 備考 |
|---|---|---|
| `GET /creators` | `api.creators()` | 全クリエイター (約 10 万件)。`public_id` (fanbox slug) を含む |
| `GET /{service}/user/{id}/profile` | `api.creatorProfile()` | 名前・アイコン URL・最終更新 |
| `GET /{service}/user/{id}/tags` | `api.creatorTags()` | `{tag, post_count}` 配列 |
| `GET /{service}/user/{id}/announcements` | `api.creatorAnnouncements()` | お知らせ |

### お気に入り (要セッション)

| API | 実装 | 備考 |
|---|---|---|
| `GET /account/favorites?type=artist` | `api.accountFavorites("artist")` | スリム形 (クリエイター) |
| `GET /account/favorites?type=post` | `api.accountFavorites("post")` | **PawPost 全フィールド + `faved_seq`** (実測)。投稿カードとして描画可能 |
| `POST /favorites/post/{service}/{id}/{postId}` | `api.favPostAdd()` | 未認証は 302 |
| `DELETE /favorites/post/...` | `api.favPostRemove()` | |
| `POST /favorites/creator/{service}/{id}` | `api.favCreatorAdd()` | フォロー (アカウント同期) |
| `DELETE /favorites/creator/...` | `api.favCreatorRemove()` | |

### その他

| API | 実装 | 備考 |
|---|---|---|
| `POST .../post/{postId}/flag` | `api.flagPost()` | 再インポート申請。409 = 申請済み |
| `GET /app_version` | `api.version()` | 実測では `"custom"` を返す |

未実装 (意図的): `links` / `fancards` / flag の GET。

---

## 実測で判明しているレスポンスの癖

- 詳細の `tags` は**配列ではなく PostgreSQL 配列リテラル文字列** (`"tags":"{\"one piece\"}"`)。
  `normalizeTags()` (api.ts) で展開
- 一覧レスポンスのみ `substring` (本文冒頭) を含む
- `temp_url` / `temp_download_url` / `preview_state` / `has_full` はスキーマ外だが常に返る。
  一時 URL は署名付き・期限付きのためキャッシュしない

---

## セッション認証

お気に入り同期には pawchive.pw の `session` Cookie 値が必要。

取得方法 (どちらか):

1. アプリ内ログイン (Login ページ) — ID/パスワードから Rust が自動取得
2. pawchive.pw にブラウザでログイン → 開発者ツール → Application → Cookies → `session` の値を設定画面へ貼り付け

保存先: `localStorage["pawkemo-settings"]` の `sessionKey`。
Rust が `Cookie: session=xxx` ヘッダーを付与して送信する。
**セッションキーはパスワード相当** (バックアップ JSON に含まれるため取り扱い注意)。

---

## ファイル URL (api.ts の URL ビルダ)

| 種別 | URL | 実装 |
|---|---|---|
| 本体 | `https://n{1-3}.pawchive.pw/data{path}` | `fileUrl()` |
| サムネイル | `https://img.pawchive.pw/thumbnail/data{path}` | `thumbUrl()` |
| 動画 (HLS) | `https://t{1-4}.pawchive.pw/v/.../master.m3u8?...` (署名付き一時 URL) | `fileUrl()` が `temp_url` を優先 |
| クリエイターアイコン | `https://pawchive.pw/icons/{service}/{id}` (webp, 無い場合は 204) | `fetch_creator_icon` コマンド (ディスクキャッシュ) + `src/icons.ts` |
| バナー | `https://pawchive.pw/banners/{service}/{id}` | `creatorBannerUrl()` |

### paw:// プロキシ (`http://paw.localhost/file?u=&r=`)

WebView から Referer を設定できないため、リファラーチェックがある URL は
Rust 側プロトコルハンドラ経由で中継します (`proxyFileUrl()` / `proxyLinkUrl()`)。
設定「画像を paw:// プロキシ経由で読み込む」(proxyImages) 有効時は
pawchive 系画像もこの経路になります (DNS フィルタリング環境向け)。

---

## 元サービス (fanbox / patreon) へのリンク

| サービス | 投稿 | クリエイター |
|---|---|---|
| fanbox | `https://{slug}.fanbox.cc/posts/{id}` (**slug 必須**。`www.fanbox.cc/posts/{id}` は 404) | `https://{slug}.fanbox.cc` |
| patreon | `https://www.patreon.com/posts/{id}` (実ブラウザで canonical へ自動リダイレクト) | `https://www.patreon.com/user?u={id}` (307 → `/{name}`) |

実装: `api.originalPostUrl()` / `api.originalCreatorUrl()`。
fanbox の slug はクリエイター索引の `publicId` から解決。
外部リンクは `referrerpolicy="no-referrer"` でリファラーを送信しません。

URL 貼り付け検索は `www.fanbox.cc/@{slug}/posts/{id}` パターンも認識し、
投稿への直接遷移バナーを表示します (`normalizeCreatorQuery`)。
