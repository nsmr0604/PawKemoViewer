# API Documentation

PawKemoViewer API ドキュメント

---

# 概要

PawKemoViewer は pawchive の公開 API を利用してデータを取得します。

現在のアーキテクチャ:

```text
React
 ↓
invoke()
 ↓
Tauri
 ↓
Rust
 ↓
Reqwest
 ↓
https://pawchive.pw/api/v1
```

ブラウザの fetch は使用せず、
Tauri の Rust バックエンド経由で通信します。

---

# API ベース URL

```text
https://pawchive.pw/api/v1
```

Rust 側 (`src-tauri/src/lib.rs`) が自動付与するため、
フロントエンドでは指定しません。

例:

```ts
api.posts()
```

↓

```http
GET https://pawchive.pw/api/v1/posts
```

---

# 投稿

## 最近の投稿

```http
GET /posts
```

### パラメータ

| 名前 | 説明 |
|------|------|
| q | 検索キーワード |
| o | オフセット |

### 例

```http
GET /posts?q=fox&o=50
```

### 実装

```ts
api.posts()
```

---

# クリエイター

## 全クリエイター

```http
GET /creators
```

### 実装

```ts
api.creators()
```

---

## クリエイター投稿一覧

```http
GET /{service}/user/{creatorId}
```

### パラメータ

| 名前 | 説明 |
|------|------|
| q | 検索 |
| tag | タグ |
| o | オフセット |

### 実装

```ts
api.creatorPosts()
```

---

## クリエイタープロフィール

```http
GET /{service}/user/{creatorId}/profile
```

### 実装

```ts
api.creatorProfile()
```

---

## タグ一覧

```http
GET /{service}/user/{creatorId}/tags
```

### 実装

```ts
api.creatorTags()
```

---

## お知らせ一覧

```http
GET /{service}/user/{creatorId}/announcements
```

### 実装

```ts
api.creatorAnnouncements()
```

---

# 投稿詳細

## 投稿取得

```http
GET /{service}/user/{creatorId}/post/{postId}
```

### 実装

```ts
api.post()
```

---

## コメント

```http
GET /{service}/user/{creatorId}/post/{postId}/comments
```

### 実装

```ts
api.postComments()
```

---

## リビジョン

```http
GET /{service}/user/{creatorId}/post/{postId}/revisions
```

### 実装

```ts
api.postRevisions()
```

---

# ハッシュ検索

SHA-256 によるファイル検索。

```http
GET /search_hash/{hash}
```

### 実装

```ts
api.searchHash()
```

---

# お気に入り

以下の API はセッションが必要です。

---

## お気に入り一覧

```http
GET /account/favorites?type=artist
```

または

```http
GET /account/favorites?type=post
```

### 実装

```ts
api.accountFavorites()
```

---

## 投稿お気に入り追加

```http
POST /favorites/post/{service}/{creatorId}/{postId}
```

### 実装

```ts
api.favPostAdd()
```

---

## 投稿お気に入り削除

```http
DELETE /favorites/post/{service}/{creatorId}/{postId}
```

### 実装

```ts
api.favPostRemove()
```

---

## クリエイターお気に入り追加

```http
POST /favorites/creator/{service}/{creatorId}
```

### 実装

```ts
api.favCreatorAdd()
```

---

## クリエイターお気に入り削除

```http
DELETE /favorites/creator/{service}/{creatorId}
```

### 実装

```ts
api.favCreatorRemove()
```

---

# 再取得申請

```http
POST /{service}/user/{creatorId}/post/{postId}/flag
```

### 実装

```ts
api.flagPost()
```

---

# バージョン

```http
GET /app_version
```

### 実装

```ts
api.version()
```

---

# セッション認証

お気に入り同期を利用する場合は
pawchive の session Cookie が必要です。

取得手順:

1. pawchive.pw にログイン
2. 開発者ツールを開く
3. Application
4. Cookies
5. session

例:

```text
session=xxxxxxxxxxxxxxxx
```

### 保存先

```text
LocalStorage
```

キー:

```text
pawchive-settings
```

### 通信経路

```text
React Settings
 ↓
sessionKey
 ↓
invoke()
 ↓
api_request()
 ↓
Cookie: session=xxxx
 ↓
pawchive.pw
```

---

# キャッシュ

API は内部キャッシュを利用します。

設定:

```text
TTL
  60秒

最大件数
  150件

同時接続
  3

最小送信間隔
  250ms
```

実装:

```text
src/api.ts
```

---

# ファイル URL

## 本体ファイル

```text
https://n1.pawchive.pw/data{path}
```

例:

```text
https://n1.pawchive.pw/data/123/45/file.png
```

実装:

```ts
fileUrl()
```

---

## サムネイル

```text
https://img.pawchive.pw/thumbnail/data{path}
```

実装:

```ts
thumbUrl()
```

---

# URL生成

## 投稿

```text
https://pawchive.pw/{service}/user/{userId}/post/{postId}
```

実装:

```ts
postUrl()
```

---

## クリエイター

```text
https://pawchive.pw/{service}/user/{userId}
```

実装:

```ts
creatorUrl()
```

---

## アイコン

```text
https://pawchive.pw/icons/{service}/{userId}
```

実装:

```ts
creatorIconUrl()
```

---

## バナー

```text
https://pawchive.pw/banners/{service}/{userId}
```

実装:

```ts
creatorBannerUrl()
```

---

# エラー

## 401

```text
セッション無効
```

---

## 403

```text
認証不足
アクセス拒否
```

---

## 404

```text
投稿またはクリエイターが存在しない
```

---

## 500

```text
通信エラー
サーバーエラー
```

---

# 廃止された構成

以下は Tauri 移行により削除されました。

```text
Cloudflare Pages
Cloudflare Workers
Wrangler
/api/login
/api/file
/api/v1 プロキシ
Pages Functions
```