# クリエイター一覧

## 目的

ローカルに構築したクリエイター索引を検索し、クリエイターページへ移動します。索引は API から少しずつ構築されるため、構築途中でも読めるところから表示します。

## 入口（ルート）

| ルート | `route.path` | 備考 |
|---|---|---|
| `#/creators` | `creators` | レール / ボトムナビの「クリエイター」 |

## 画面構成

```
┌───────────────────────────────────────────────────────────┐
│ h1.page-title  nav.creators                               │
├───────────────────────────────────────────────────────────┤
│ （クリップボードに URL）div.clipboard-banner               │
│   📋 creators.clipboard  fanbox / tateha                  │
│                         [クリップボードを使う] [×]          │
├───────────────────────────────────────────────────────────┤
│ div.discovery-panel.creator-discovery                     │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ form.search-bar  [ input type=search ][×]           │  │
│  └─────────────────────────────────────────────────────┘  │
│  （q が空 かつ 履歴あり）div.history-chips                 │
│  div.creator-list-controls                                │
│    [すべて][fanbox][patreon]  [並べ替え select]  件数表示   │
├───────────────────────────────────────────────────────────┤
│ div.hint-row   索引の状態（構築中 n 件 / キャッシュ n 件）  │
│                [更新]                                     │
├───────────────────────────────────────────────────────────┤
│ （building かつ 未構築）Spinner                            │
│ （エラー）ErrorBox + 再試行                                │
│ （ready かつ 0 件）Empty                                   │
│ div.hint-row （投稿 URL を検出）div.clipboard-banner       │
│     🔗 creators.postLink  「…」 [この投稿を開く]            │
│ div.creator-list                                          │
│   div.creator-row  [avatar] [フォロー中] 名前              │
│                              fanbox · 20352 · publicId     │
│   …                                                       │
│ [さらに表示 (n)]                                           │
└───────────────────────────────────────────────────────────┘
```

## 主な操作

| 操作 | 挙動 |
|---|---|
| 検索入力 | 1 文字ごとに `onSearch` → `searchCreatorIndex(value)`。`q` と `visibleCount=60` をリセット |
| Enter | `addSearchHistory` して履歴を更新（検索自体は入力時点で実行済み） |
| × ボタン | `onSearch("")` で全件に戻す |
| 履歴チップ | その語で `onSearch` |
| 履歴クリア | `clearSearchHistory()` |
| サービス絞り込み | `serviceFilter` を `all` / `fanbox` / `patreon` に。`visibleCount=60` に戻す |
| 並べ替え | `sortBy` を `updated` / `popular` / `name` に。`visibleCount=60` に戻す |
| さらに表示 | `visibleCount` を 60 件ずつ増やす（上限は `visibleRows.length`） |
| 行クリック / Enter / Space | `navigate("/creator/${r.service}/${r.id}")` |
| クリップボードバナー | 「使う」で `onSearch(clipCreator.idOrSlug)`、「×」で閉じる |
| 投稿リンクバナー | `navigate("/post/${postLink.service}/${postLink.creatorId}/${postLink.postId}")` |
| 更新 | `window.confirm(creators.refreshConfirm)` → `refreshCreatorIndex` → 再検索 |

### 並べ替えの規則

| `sortBy` | 比較 |
|---|---|
| `updated` | `updated` 降順 → `favorited` 降順 |
| `popular` | `favorited` 降順 → `updated` 降順 |
| `name` | `localeCompare(..., { sensitivity: "base" })` |

`updated` / `favorited` が未設定の行は `0` として扱います。

### 絞り込みの順序

`rows` → `serviceFilter` で filter → `sortBy` で sort → `visibleCount` で slice。件数表示は `displayedRows.length / visibleRows.length` です。

## 状態（読込中・空・エラー・部分成功）

| 状態 | 条件 | 表示 |
|---|---|---|
| 索引の初期化中 | `countCreators()` の完了前 | 一覧は空。`.hint-row` は `creators.list` |
| 構築中（未構築） | `building && built === null` | `Spinner`（`creators.loading`） |
| 構築中（部分表示） | `building && built !== null` | 前回の索引の検索結果を表示しつつ `creators.building {count}` |
| 構築済み | `built !== null && !building` | `creators.cached {count}` + 「更新」ボタン |
| 空 | `ready && visibleRows.length === 0 && !building` | `Empty`（`creators.empty`） |
| エラー | `error !== null` | `ErrorBox`。再試行は `onSearch(q)` |
| 検索結果 0 件（索引あり） | 上と同じ | 同上 |
| 投稿 URL を検出 | `postLink !== null` | 投稿を開くバナー |
| クリップボードに URL | `clipCreator !== null` | クリップボードバナー |

索引の構築は `AbortController` で中断でき、アンマウント時に `abort()` と `searchSeq` の加算を行います。途中で検索語が変わっても、古い検索結果は `searchSeq` の不一致で破棄されます。

## データ依存

| 用途 | 呼び出し | 備考 |
|---|---|---|
| 索引件数 | `getApplication().creators.countCreators()` | 0 件なら `built = null` |
| 検索 | `creators.searchCreatorIndex(value)` | 戻り値 `{ rows, postLink }` |
| 構築要否 | `creators.needsCreatorIndexBuild(count)` | 真なら構築へ |
| 構築 | `creators.buildCreatorIndex(count, signal)` | 戻り値は総件数 |
| 再構築 | `creators.refreshCreatorIndex(signal)` | 確認ダイアログ後に実行 |
| フォロー判定 | `isFollowed(service, id)` | 行の `is-followed` と「フォロー中」バッジ |
| 検索履歴 | `getSearchHistory` / `addSearchHistory` / `clearSearchHistory` | ホームと共通 |
| クリップボード | `readClipboardTextSafe` + `extractCreatorFromText` | マウント時と `window` の `focus` 時 |
| 行の型 | `CreatorRow`（`src/application/creator-index-repository.ts`） | `key`, `service`, `id`, `name`, `publicId`, `updated`, `favorited` |

## 関連コード

- `src/pages/CreatorsPage.tsx`
- `src/application/creator-index-repository.ts` — `CreatorRow`
- `src/components/CreatorAvatar.tsx` — 行のアイコン
- `src/platform/environment.ts` — `readClipboardTextSafe`、`extractCreatorFromText`
- `src/follows.ts` — `isFollowed`

## 既知の制約

- 検索はローカル索引のみで、pawchive API のクリエイター検索は呼びません。索引に無いクリエイターは検索でも出ません。
- クリップボードの読み取りは `focus` のたびに実行します。権限がない環境では `null` が返り、バナーは出ません。
- 行のフォロー状態はクリック時の `isFollowed` 参照で、`pawkemo-follows-changed` を購読していないため、別画面での変更はこの画面の再描画まで反映されない可能性があります（未確認）。
- 索引の構築中に画面を離れると構築は中断されます。次回表示時に `needsCreatorIndexBuild` から再開します。
- `Clipboard` のイベント購読は `focus` のみで、`visibilitychange` は使いません。
