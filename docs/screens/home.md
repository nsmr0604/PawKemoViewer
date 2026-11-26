# ホーム / 検索

## 目的

最新投稿のフィードと、キーワード検索の結果を同じ画面で扱います。`#/` と `#/search?q=` は同じ `HomePage` を描画し、`q` の有無だけが違います。

## 入口（ルート）

| ルート | `route.path` | 意味 |
|---|---|---|
| `#/`（ハッシュなしを含む） | `home` | 最新フィード |
| `#/search?q={keyword}` | `search` | 検索結果 |
| `#/?focus=search` | `home` | 検索欄へフォーカス（`Ctrl/Cmd+K` の遷移先） |

## 画面構成

```
┌───────────────────────────────────────────────────────────┐
│ h1.home-title            home.browseTitle                 │
├───────────────────────────────────────────────────────────┤
│ div.discovery-panel                                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ form.search-bar  [ input type=search ][ 検索 ]      │  │
│  └─────────────────────────────────────────────────────┘  │
│  （エラー時）p.search-error  role="alert"                  │
│  （q が空 かつ 履歴あり）div.history-chips                 │
│      [履歴1] [履歴2] … [履歴クリア]                        │
│  section.home-filters                                     │
│      [すべて][FANBOX][Patreon]                            │
│      （絞り込み中）件数 + [絞り込み解除]                    │
├───────────────────────────────────────────────────────────┤
│ div.view-mode-bar                                         │
│   （q あり）結果ラベル + [クリア]                          │
│   （q なし）h2.feed-title  home.latestTitle                │
│   （画面右）[▦ グリッド][☰ リスト]                         │
├───────────────────────────────────────────────────────────┤
│ （エラー）ErrorBox + 再試行                                │
│ PostGrid                                                  │
│   div.post-grid（grid）または div.post-list（list）        │
│     PostCard / PostRow  × n                               │
│   div（高さ 1px のセンチネル）                             │
│   Spinner（追加読み込み中）                                │
│   div.grid-end「終端」（done かつ 1 件以上）                │
├───────────────────────────────────────────────────────────┤
│ div.empty  home.empty（done・0 件・エラーなし）             │
└───────────────────────────────────────────────────────────┘
```

デスクトップ 1000px 以上では `.discovery-panel` が 2 カラムになり、`.home-filters` が 1 行目右側へ移動します（`styles.css`）。

## 主な操作

| 操作 | 挙動 | 実装 |
|---|---|---|
| 検索送信 | `input.trim()`。空でなければ `addSearchHistory` → `navigate("/search?q=${encodeURIComponent(keyword)}", true)`。空なら `/` へ replace | `submit` |
| 1〜2 文字で送信 | 送信せず `showSearchError` を立て、`home.tooShort` を `role="alert"` で表示 | `submit` / `MIN_QUERY` |
| 入力変更 | ローカル state を更新し、エラー表示を消す。API 呼び出しはしない | `onChange` |
| 履歴チップ | その語で即検索（`replace`） | `submitHistory` |
| 履歴クリア | `clearSearchHistory()` でストレージから削除 | `history.ts` |
| サービス絞り込み | `serviceFilter` を `all` / `fanbox` / `patreon` に。**読み込み済みの投稿をクライアント側で filter** | `filteredPosts` |
| 絞り込み解除 | `serviceFilter = "all"` | 「絞り込み解除」 |
| グリッド / リスト | `viewMode` を切替え、`updateSettings({ postViewMode })` で永続化 | `toggleViewMode` |
| クリア（検索解除） | `nav("/", true)` | `view-mode-bar` |
| 無限スクロール | センチネルがビューポート + 800px 以内で次ページ取得 | `PostGrid` |
| `Ctrl/Cmd + K` | デスクトップのみ検索欄へフォーカス | `App.tsx` |
| `/` | `input[type='search']` へフォーカス | `App.tsx` |

## 状態（読込中・空・エラー・部分成功）

| 状態 | 条件 | 表示 |
|---|---|---|
| 初回読み込み | `loading` かつ投稿 0 件 | `PostGrid` 内の `Spinner`（グリッドは空のまま） |
| 追加読み込み | `loading` かつ投稿あり | 一覧の下に `Spinner` |
| 検索語が短い | `q.length > 0 && q.length < 3` | 一覧を出さず `home.tooShort` のみ。API も呼ばない |
| 空 | `!loading && !error && filteredPosts.length === 0 && done` | `div.empty` に `home.empty` |
| 空（絞り込み後） | 絞り込みで 0 件 | `filteredPosts` が空になるため同じ `div.empty`。解除ボタンは `hint-row` 側 |
| エラー | `error !== null` | `ErrorBox`。再試行は `load(offset, offset === 0)` |
| 古い応答 | `reqSeq` が一致しない | 破棄（`setPosts` しない） |
| 履歴なし | `history.length === 0` | チップ列自体を出さない |

`tooShort` のときは `PostGrid` を描画しないため、前の検索結果は表示されません（`q` 変更時に `posts` をクリア）。

## データ依存

| 用途 | 呼び出し / ストア | 備考 |
|---|---|---|
| 投稿一覧 | `getApplication().loadHomePosts({ query: q, offset })` | `src/application/post-pages.ts` → `api.posts` |
| ページサイズ | `POST_PAGE_SIZE = 50` | `posts.length < 50` で `done` |
| AI 投稿の除外 | 設定 `excludeAiPosts` → `api.posts` が `hide=(ai)` を付与 | ホームに切替 UI はなく、[設定](settings.md)の「投稿表示」で変更 |
| サービス絞り込み | ローカル state のみ | API へは送らない |
| 表示形式 | 設定 `postViewMode` | 初期値も設定から読む |
| 検索履歴 | `getSearchHistory` / `addSearchHistory` / `clearSearchHistory` | キー `pawkemo-search-history`、最大 20 件（`src/history.ts`） |
| スクロール位置 | `useScrollMemory(scrollKey, posts.length > 0 \|\| done)` | キーは `home:${q}:service=${serviceFilter}:excludeAi=${excludeAiPosts}` |
| 設定変更の監視 | `SETTINGS_CHANGED_EVENT` | `excludeAiPosts` が変わったら `load(0, true)` |

`loadHomePosts` が失敗すると `error` に保持し、`ErrorBox` を出します。`PostGrid` は描画されたままで、保持されている投稿があれば表示されます（`q` 変更時に `posts` はクリア済み）。

## 関連コード

- `src/pages/HomePage.tsx` — 画面本体、`MIN_QUERY`
- `src/components/PostGrid.tsx` — 一覧、無限スクロール、カード / 行
- `src/components/Feedback.tsx` — `ErrorBox`
- `src/hooks.ts` — `useScrollMemory`
- `src/history.ts` — 検索履歴
- `src/application/post-pages.ts` — ページングと `done` の判定
- `src/api.ts` — `api.posts`、`getSettings` / `updateSettings`

## 既知の制約

- サービス絞り込みは読み込み済みページへの後掛けフィルタです。サーバーへは送らないため、絞り込みで 0 件でも次のページを読むまで結果が増える可能性があります。
- `NEW` バッジは `PostGrid` の `newIds` で描画されますが、ホームは `newIds` を渡していません（未使用）。
- 検索語は URL の `q` が正で、入力欄はローカル state です。`#/search?q=` の `q` が変わると一覧をリセットして再取得しますが、コンポーネントは再マウントされません。
- 同一の検索語を再送信しても `navigate` が同一ハッシュを無視するため、再読み込みは発生しません。
- 履歴チップはホームとクリエイター一覧で同じストレージを共有します（`src/history.ts`）。
