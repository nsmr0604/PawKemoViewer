# お気に入り / フォロー

## 目的

ローカルのフォロー一覧（新着チェック付き）と、pawchive アカウントのお気に入り投稿を 1 画面の 2 タブで扱います。フォローはアカウントの「クリエイターお気に入り」のミラーです。

## 入口（ルート）

| ルート | `route.path` | 備考 |
|---|---|---|
| `#/favorites` | `favorites` | レール / ボトムナビの「お気に入り」（バッジ = フォロー数） |

`App` は `key={settings.sessionKey ? "signed-in" : "signed-out"}` を付けるため、ログイン / ログアウトで画面が再マウントされます。

## 画面構成

```
┌───────────────────────────────────────────────────────────┐
│ h1.page-title  nav.favorites                              │
├───────────────────────────────────────────────────────────┤
│ div.tabs                                                  │
│   [ お気に入り (NEW 件数) ] [ アカウント ]                  │
├───────────────────────────────────────────────────────────┤
│ ▼ フォロータブ                                            │
│ div.hint-row  favorites.desc  [新着チェック / 確認中]      │
│               （同期結果 role="status"）                   │
│ div.hint-row  件数  [並べ替え select][降順/昇順] [全既読]   │
│ （0 件）Empty favorites.emptyFollows                       │
│ div.creator-list                                          │
│   div.creator-row                                         │
│     [avatar] 名前 [NEW]                                   │
│              fanbox · 最新 2026-11-20 · （取得エラー）      │
│              最新投稿タイトル → post へ                    │
│     [既読] [フォロー解除]                                  │
├───────────────────────────────────────────────────────────┤
│ ▼ アカウントタブ                                          │
│ div.hint-row  説明  [取得] または [ログイン]               │
│ （エラー）ErrorBox + 再試行                                │
│ （401）div.error-box  favorites.sessionInvalid             │
│ （0 件）Empty favorites.emptyAccount                      │
│ div.hint-row  件数  [並べ替え select][降順/昇順]           │
│ PostGrid（グリッド / リストは設定に従う）                  │
└───────────────────────────────────────────────────────────┘
```

## 主な操作

| 操作 | 挙動 |
|---|---|
| タブ切替 | `setTab` が `storage.set("pawkemo-fav-tab", t)` で記憶。次回起動時に復元 |
| 新着チェック | `clearApiCache()` → `checkNew(true)`（クールダウン無視） |
| 自動チェック | マウント時に `checkNew(false)`。アカウント同期後にもう一度 `checkNew(false)` |
| 既読 | `setSeen(key, newest.id, info)` して行の `isNew` を落とす |
| 全既読 | `newest` がある全行を `setSeen` し、`isNew = false` |
| フォロー解除 | `removeFollow(service, id)` → `refresh()`。失敗時は `favorites.unfollowFailed` |
| 行クリック | `navigate("/creator/${f.service}/${f.id}")` |
| 最新投稿タイトル | `navigate("/post/${service}/${user}/${id}")`（行クリックは `stopPropagation`） |
| 並べ替え（フォロー） | `followSort` = `published` / `checked` / `name` / `followed`、`followOrder` = `desc` / `asc` |
| 並べ替え（アカウント） | `favSort` = `faved` / `published` / `added`、`favOrder` = `desc` / `asc` |
| 取得 | `loadAccount()` = `api.accountFavorites("post")` |
| ログイン | `navigate("/login?next=/favorites")` |

### NEW の条件

`isRecentPost(post)` が真（`published` または `added` が解釈でき、`0 <= 経過時間 <= 7 日`）かつ、最新投稿 ID が `lastSeenPostId` と異なるときだけ `isNew = true` になります。日時不明・未来日時は NEW になりません。タブのバッジは `follows.filter(f => f.isNew).length` です。

### 新着チェックの負荷配慮

- 4 並列のワーカーで `api.creatorPosts(service, id, { o: 0 })` を呼び、先頭 1 件だけ見ます。
- 自動チェック（`force = false`）は `checkedAt` から 5 分以内の項目を API なしでスキップし、保存済みの最新情報で判定します。
- 既読 ID の更新は `updateSeenCheck` が IndexedDB の readwrite トランザクション内で最新状態を読み直します（待機中に「既読」が押されても上書きしない）。
- 同期中に `syncFollowsWithAccount()` が走っている場合、`src/follows.ts` の `syncInFlight` で 1 本にまとめられます。

## 状態（読込中・空・エラー・部分成功）

| 状態 | 条件 | 表示 |
|---|---|---|
| フォロー 0 件 | `follows.length === 0` | `Empty`（`favorites.emptyFollows`） |
| 新着チェック中 | `checking` | ボタンが `favorites.checking` で disabled |
| 行単位の取得失敗 | `f.error` | `.creator-sub` にエラー文字列を併記（他の行は表示） |
| 同期成功 | `syncResult` | `role="status"` に `favorites.synced {n}` |
| 同期失敗 | `syncResult` | `favorites.syncFailed {msg}` |
| フォロー解除失敗 | `syncResult` | `favorites.unfollowFailed {msg}` |
| アカウント未取得 | `accountFavs === null` | 一覧を出さない（取得ボタンは表示） |
| アカウント 0 件 | `accountFavs.length === 0` | `Empty`（`favorites.emptyAccount`） |
| アカウント取得失敗 | `accountErr` | `ErrorBox`（再試行 `loadAccount`） |
| セッション無効 | `ApiError` かつ `apiStatus === 401` | `ErrorBox` に加えて `favorites.sessionInvalid` の注意書き |
| 未ログイン | `sessionKey` が空 | 説明文 + ログインボタン |

## データ依存

| 用途 | 呼び出し / ストア |
|---|---|
| フォロー一覧 | `loadFollows()`（キー `pawkemo-follows`） |
| アカウント同期 | `syncFollowsWithAccount()`（`api.accountFavorites("artist")` → `replaceFollows`） |
| フォロー解除 | `removeFollow(service, id)` |
| 既読・最新情報 | `getAllSeen` / `getSeen` / `setSeen` / `updateSeenCheck`（`src/db.ts`、IndexedDB） |
| 最新投稿 | `api.creatorPosts(service, id, { o: 0 })` |
| アカウントお気に入り | `api.accountFavorites("post")` |
| キャッシュ破棄 | `clearApiCache()` |
| タブの記憶 | `getPlatformRuntime().services.storage` のキー `pawkemo-fav-tab` |
| 一覧の描画 | `PostGrid`（`viewMode` 未指定なので設定 `postViewMode` に従う） |

## 関連コード

- `src/pages/FavoritesPage.tsx`
- `src/follows.ts` — フォローとアカウント同期
- `src/db.ts` — 既読状態（IndexedDB）
- `src/post-favorites.ts` — 投稿お気に入りのローカルマーク
- `src/components/PostGrid.tsx` / `src/components/CreatorAvatar.tsx`

## 既知の制約

- ページングはありません。フォローもアカウントお気に入りも全件を一度に取得・描画します（`api.accountFavorites` はページング引数を持ちません）。
- ソートはすべてクライアント側です。`published` が無い行は `added`、どちらも無ければ `0` として扱います。
- 自動チェックはマウント時とアカウント同期後のみです。画面を開いたまま新着を検知し続けるポーリングはありません。
- アカウントタブの取得は「タブを開いた時点で `accountFavs === null` なら 1 回」です。以降は「取得」ボタンを押すまで更新されません。
- `markAllRead` は `newest` を持つ行だけを既読にします。最新投稿を取得できていない行は `checkedAt` も変わりません。
- フォロー行の `name` はローカル保存値です。`FollowButton` が索引から名前を補完しますが、この画面からは補完しません。
