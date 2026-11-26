# クリエイターページ

## 目的

1 人のクリエイターのプロフィール、タグ、投稿一覧を表示します。フォロー操作と元サービスへの導線もここに置きます。

## 入口（ルート）

| ルート | `route.path` | `params` | 備考 |
|---|---|---|---|
| `#/creator/{service}/{id}` | `creator` | `service`, `id` | 一覧の行、投稿詳細のクリエイター名、タグチップから |
| `#/creator/{service}/{id}?tag={tag}` | `creator` | 同上 | `tag` は初期選択タグ（1 件） |

`App` は `CreatorPage` の `key` に `creator:` + `service` + `:` + `id` の文字列を渡します。クリエイター間の移動では再マウントされ、選択タグとエラーを引き継ぎません。

## 画面構成

```
┌───────────────────────────────────────────────────────────┐
│ div.creator-head-wrap                                     │
│   CreatorHeader                                           │
│     img.creator-banner（取得失敗で非表示）                 │
│     [avatar.big] 名前                                     │
│                   fanbox · 20352 · 更新日時                │
│   div.creator-actions                                     │
│     [フォロー / フォロー中] [サイトを開く] [fanbox で開く] │
├───────────────────────────────────────────────────────────┤
│ （タグ取得中）Spinner                                      │
│ div.tag-chips（最大 20 件 + 「+N」 / 「閉じる」）          │
│   [タグ 12][タグ 3] …                                     │
├───────────────────────────────────────────────────────────┤
│ div.view-mode-bar                                         │
│   creator.posts            [🔲 グリッド][☰ リスト]         │
├───────────────────────────────────────────────────────────┤
│ （エラー）ErrorBox + 再試行                                │
│ PostGrid（posts / loading / done / onEndReached）          │
│ div.empty  home.empty（done・0 件・エラーなし）            │
└───────────────────────────────────────────────────────────┘
```

## 主な操作

| 操作 | 挙動 |
|---|---|
| フォロー / 解除 | `FollowButton`。ログイン中は API 成功後にローカルへ反映（`src/follows.ts`） |
| サイトを開く | `creatorUrl(service, id)` = `https://pawchive.pw/{service}/user/{id}` を新しいタブで開く。`rel="noreferrer"` `referrerPolicy="no-referrer"` |
| 元サービスで開く | `loadOriginalCreatorUrl(service, id)` が返した URL があるときだけ表示。FANBOX は slug サブドメイン、Patreon は `user?u=` |
| タグチップ | `selectedTags` をトグル（複数選択可）。変更で一覧をリセットして先頭から再取得 |
| `+N` / 閉じる | `showAllTags` を切替（20 件 → 全件） |
| グリッド / リスト | `viewMode` を切替え、`updateSettings({ postViewMode })` で永続化（ホームと共通） |
| 無限スクロール | 末尾 + 800px で次ページ（`offset + POST_PAGE_SIZE`） |
| 再試行 | `ErrorBox` の `onRetry` = `load(offset, offset === 0)` |

## 状態（読込中・空・エラー・部分成功）

| 状態 | 条件 | 表示 |
|---|---|---|
| プロフィール取得中 | `CreatorHeader` 内 `profile === null` | `Spinner`（`creators.profileLoading`） |
| プロフィール失敗 | `error` | `.creator-head.error-box` に `creators.profileError`（再試行ボタンなし） |
| バナー失敗 | `img` の `onError` | `bannerOk = false` でバナーだけ非表示。`logError` に記録 |
| タグ取得中 | `tags === null` | `Spinner`（`creator.tags`） |
| タグ失敗 | 取得例外 | `setTags([])` として扱い、エラーを出さない |
| タグ 0 件 | `tags.length === 0` | `div.tag-chips` 自体を出さない |
| 投稿読み込み中 | `loading` | `PostGrid` 内 `Spinner` |
| 空 | `!loading && !error && posts.length === 0 && done` | `div.empty` に `home.empty` |
| エラー | `error !== null` | `ErrorBox`。`PostGrid` は描画されたままで、保持済みの投稿は表示される |
| 部分成功 | タグは取れたが投稿が失敗 など | 取得できた部分だけ表示し、失敗した節にだけエラーを出す |

タグ条件（`filterKey = service:id:tagKey`）が変わると `posts` / `done` / `error` をリセットして `load(0, true)` を実行します。古い応答は `reqSeq` の不一致で破棄します。

## データ依存

| 用途 | 呼び出し | 備考 |
|---|---|---|
| プロフィール | `getApplication().loadCreatorProfile(service, id)` | `CreatorHeader` 内 |
| バナー | `creatorBannerUrl(service, id)` | 204 のときは `onError` で非表示 |
| タグ | `loadCreatorTags(service, id)` | `api.creatorTags` |
| 投稿 | `loadCreatorPosts({ service, id, tags, offset })` | `api.creatorPosts`（`tag` を配列で送る） |
| 元サービス URL | `loadOriginalCreatorUrl(service, id)` | `api.originalCreatorUrl` |
| ページサイズ | `POST_PAGE_SIZE = 50` | `src/application/post-pages.ts` |
| 表示形式 | 設定 `postViewMode` | |
| スクロール位置 | `useScrollMemory("creator:${service}:${id}\|t=${tagKey}", posts.length > 0 \|\| done)` | タグ条件ごとに別キー |
| 初期タグ | `parseHash().query.get("tag")` | マウント時に 1 件だけ |

## 関連コード

- `src/pages/CreatorPage.tsx`
- `src/components/CreatorHeader.tsx` — プロフィール、バナー
- `src/components/CreatorAvatar.tsx` — アイコン
- `src/components/FollowButton.tsx`
- `src/components/PostGrid.tsx`
- `src/application/post-pages.ts` — `POST_PAGE_SIZE`、`createCreatorPostUseCase`

## 既知の制約

- タブ UI はありません。投稿一覧の絞り込みはタグチップだけです（「タブ」に相当する機能は未実装）。
- ページングは「次ページを追加」だけで、ページ番号や総件数は表示しません。`done` は API が返した件数が 50 未満になった時点で立ちます。
- 複数タグを選んだときの AND / OR は API 側の仕様に依存します（この画面では配列をそのまま渡すだけで、解釈は未確認）。
- `?tag=` は初期値にだけ使い、以降のタグ変更では URL を更新しません。同じクリエイターへ `?tag=` 付きで再遷移しても、`App` の `key` が変わらないため選択タグは再適用されません。
- `CreatorNotFound`（同ファイル内で export）はどこからも使われていません。
- 「元サービスで開く」は `originalUrl` が `null` のとき表示されません（slug が索引に無い FANBOX など）。
