# 画面遷移とルーティング

ルートはハッシュベースです。`src/router.ts` の `parseHash` / `navigate` / `goBack` と `src/App.tsx` の `switch` だけで画面が決まります。サーバー側のルーティングはありません。

## ルート定義

| ハッシュ | `route.path` | 画面 | `params` | `query` |
|---|---|---|---|---|
| （ハッシュなし）/ `#` / `#/` | `home` | `HomePage` | — | `q`, `focus` |
| `#/search?q=...` | `search` | `HomePage` | — | `q` |
| `#/creators` | `creators` | `CreatorsPage` | — | — |
| `#/creator/{service}/{id}` | `creator` | `CreatorPage` | `service`, `id` | `tag` |
| `#/post/{service}/{creatorId}/{postId}` | `post` | `PostPage` | `service`, `creator`, `id` | — |
| 上記の検証に失敗した `#/post/...` | `invalid-post` | インラインの `ErrorBox` | — | — |
| `#/favorites` | `favorites` | `FavoritesPage` | — | — |
| `#/settings` | `settings` | `SettingsPage` | — | `section` |
| `#/login` | `login` | `LoginPage` | — | `next` |
| 上記以外 | 第 1 セグメントの文字列 | `HomePage`（`switch` の `default`） | — | 任意 |

`route.path` は `switch` のキー、`route.params` は画面 props、`route.query` は `URLSearchParams` です。クエリは `route.path` の決定には使わず、画面の切替も `switch (route.path)` だけで行います。

## ハッシュ解析規則

`parseHash()` の処理順:

1. `location.hash` から先頭 `#` を除く。空文字なら `/` とみなす。
2. 最初の `?` でパス部とクエリ部に分割し、クエリは `new URLSearchParams(queryPart)`。
3. パス部を `/` で分割し、空要素を除去（`filter(Boolean)`）。末尾スラッシュと連続スラッシュは無視される。
4. 第 1 セグメントが `creator` かつ 3 セグメント以上 → `creator`。`params.service = segs[1]`、`params.id = segs[2]`。4 セグメント目以降は捨てる。
5. 第 1 セグメントが `post` → 次の全条件を満たすときだけ `post`。
   - セグメント数がちょうど 4
   - `service` が `fanbox` または `patreon`
   - `creatorId` / `postId` が空でなく、文字列 `"undefined"` / `"null"` でもない
   満たさない場合は `invalid-post`。
6. それ以外 → `path = segs[0] || "home"`。

`post` の厳密判定は、不完全な URL から `/undefined/user/undefined/post/...` のような壊れた遷移を生成しないためのものです。

### 解析の結果に関する注意

- `#/creator`（1 セグメント）と `#/creator/{service}`（2 セグメント）は条件 4 を満たさず、`path` は `creator` のまま `params` が空になります。`CreatorPage` には `undefined` が渡ります（実機での表示は未確認）。
- 未知のパス（例 `#/foo`）は `path = "foo"` となり `App` の `default` で `HomePage` が描画されます。`AppShell` の `pageLabel` は該当分岐がないためログイン用の文言になります。
- `#/settings?section=unknown` は `path=settings` のまま、`SettingsPage` 側で `validSection = null` に落とします。

## `navigate` と `goBack`

### `navigate(to, replace = false)`

```ts
navigate("/post/fanbox/123/456")        // push
navigate("/search?q=cat", true)          // replace
```

1. `#${to}` を作り、`location.hash` と完全一致するなら何もしない。
2. `history.state` に `pawkemoPrevious` を書く。
   - `replace = false`: 現在のハッシュ（先頭 `#` を除く。空なら `/`）
   - `replace = true`: 既存の `history.state.pawkemoPrevious` をそのまま引き継ぐ
3. `pushState` / `replaceState` を実行。
4. `HashChangeEvent("hashchange")` を手動で `dispatchEvent`（`pushState` では `hashchange` が発火しないため）。

同一ハッシュを無視するため、同じ検索語の再送信では `route` は変化しません。`history.state` は他アプリ用の値を壊さないようスプレッドで維持します。

### `goBack(fallback = "/", previous?)`

```ts
const from = history.state?.pawkemoPrevious
if (typeof from === "string" && (previous === undefined || from === previous)) history.back()
else navigate(fallback, true)
```

- `pawkemoPrevious` が文字列で、`previous` 未指定または一致するときだけ実際の履歴を戻します。
- それ以外（直接開いた・`replace` で履歴が無い）は `fallback` へ `replace` 遷移します。履歴を増やしません。
- `previous` を渡すのは設定画面（`goBack("/settings", "/settings")`）だけです。セクションを開いた後に一覧へ戻すとき、直前が `/settings` のときのみ `history.back()` を使います。

### 履歴を積まない遷移

| 操作 | 呼び出し | 理由 |
|---|---|---|
| ホームの検索送信・履歴チップ | `nav(..., true)` | 検索の往復で履歴を増やさない |
| ホームの「クリア」 | `nav("/", true)` | 同上 |
| 投稿の前後移動（`navPost`） | `navigate(..., true)` | 「戻る」で一覧へ戻れるようにする |
| ログイン成功後の遷移 | `navigate(next, true)` | ログイン画面を履歴に残さない |
| `goBack` のフォールバック | `navigate(fallback, true)` | 同上 |
| デスクトップ設定のセクション切替（既にセクション表示中） | `navigate(..., true)` | セクション間の移動で履歴を増やさない |

## 遷移図

```
                    ┌──────────────────────────┐
     起動 ─────────▶│ home  #/                 │
                    │ search #/search?q=       │
                    └───┬───────────┬──────────┘
        投稿カード(push)│           │ 検索送信(replace)
                        │           ▼
                        │      （search へ置換）
                        │
                    ┌───▼──────────────────────┐
                    │ post #/post/s/c/p        │◀──┐
                    │ ・本文/添付/コメント/改訂 │   │ 前後移動
                    └───┬───────────┬──────────┘   │ (replace)
      クリエイターリンク │           │ タグチップ(push, ?tag=)
                        │           ▼              │
                        │      ┌──────────────────┴─┐
                        │      │ creator #/creator/s/id│
                        │      └──────────┬───────────┘
                        │                 │
   一覧の行(push)       ▼                 ▼
                    ┌──────────────────────────┐
                    │ creators #/creators      │
                    └──────────────────────────┘

  レール / ボトムナビ（常時・push）
    ├─▶ home
    ├─▶ creators
    ├─▶ favorites #/favorites  ──(未ログイン時のボタン)──▶ login?next=/favorites
    └─▶ settings  #/settings   ──(アカウント欄)──────────▶ login?next=/settings?section=account

  invalid-post は post からしか発生しない（ErrorBox のみ。戻る導線は AppShell）
```

## 戻る / ホーム導線

| 場所 | 操作 | 実装 |
|---|---|---|
| モバイル詳細バー（左） | ← 戻る | `goBack(currentPath === "creator" ? "/creators" : "/")` |
| モバイル詳細バー（中央） | ホームアイコン | `navigate("/")` |
| デスクトップ詳細（`.desktop-back`） | 同じ 2 ボタン + 画面名 | 同上 |
| デスクトップの戻るボタン | ツールチップに `Esc` を併記 | `isDesktopLayout` のときだけ |
| `Esc` | `post` / `invalid-post` / `creator` / `login` のみ | `goBack(creator ? "/creators" : "/")`。入力欄にフォーカスがあるときは無効 |
| OS / WebView の戻る | 履歴があれば `history.back()`、なければ `lifecycle.exit()` | `getPlatformRuntime().services.lifecycle.onBackRequested`（`App`） |
| レール / ボトムナビ | 各項目 | `navigate(path)`（push） |
| モバイル設定のセクション | ← セクション一覧 | `goBack("/settings", "/settings")` |

`App` は `route.path` / `route.params.id` が変わるたびに `window.scrollTo(0, 0)` を実行します。一覧画面は `useScrollMemory` で位置を復元します（[home.md](home.md)、[creator.md](creator.md)）。

## キーボード（デスクトップ）

`App` の `handleKeyDown` が担当します。入力要素（`INPUT` / `TEXTAREA` / `SELECT` / `contentEditable`）にフォーカスがあるときは `Esc` 以外を無効化します。

| キー | 操作 |
|---|---|
| `H` | `navigate("/")` |
| `C` | `navigate("/creators")` |
| `F` | `navigate("/favorites")` |
| `S` | `navigate("/settings")` |
| `/` | `input[type='search']` にフォーカス（無ければ何もしない） |
| `Ctrl/Cmd + K` | デスクトップのみ。ホームの検索欄にフォーカス、無ければ `/?focus=search` へ遷移 |
| `Esc` | 上表の戻る |
| `←` / `→` | 投稿詳細のみ（`PostPage` が実装。通常は投稿の前後、ライトボックス表示中は画像の前後） |

`Ctrl` / `Alt` / `Meta` 付きのキーは `Ctrl/Cmd + K` を除いて無視されます。

## ディープリンク

| URL | 用途 | 補足 |
|---|---|---|
| `#/post/fanbox/{creatorId}/{postId}` | 投稿を直接開く | `service` は `fanbox` / `patreon` のみ |
| `#/creator/{service}/{id}?tag={tag}` | タグ絞り込み済みのクリエイター | `tag` は初期選択にだけ使う（`parseHash().query`） |
| `#/search?q={keyword}` | 検索結果 | 3 文字未満は本文を出さず案内のみ |
| `#/?focus=search` | ホームの検索欄にフォーカス | `useEffect` の `query` 依存 |
| `#/settings?section={id}` | 設定のセクションを直接開く | `id` は [settings.md](settings.md) の表を参照 |
| `#/login?next={path}` | ログイン後の戻り先 | `next` が `/` 始まりでなければ `/` |

外部からの起動 URL（`pawkemoviewer://` など）を処理するコードはフロント側に見当たりません（未確認）。

## ログイン必須画面のガード

グローバルなガードはなく、全画面が未ログインで開けます。ログインの要否は画面内の分岐で表現します。

| 箇所 | 未ログイン時 | ログイン時 |
|---|---|---|
| お気に入り「フォロー」タブ | ローカルのフォロー一覧のみ | 表示時に `syncFollowsWithAccount()` |
| お気に入り「アカウント」タブ | 説明文 + ログインボタン（`/login?next=/favorites`） | 「取得」ボタンで `api.accountFavorites("post")` |
| 投稿詳細の☆ボタン | 非表示（`sessionKey` が空、または `faved === "none"`） | 状態に応じて `post.favNo` / `favYes` / `favErrorShort` |
| フォローボタン | ローカルのみ更新 | API 成功後にローカルへ反映（`src/follows.ts`） |
| 設定のアカウント欄 | 「ログイン」ボタン | `accountId` を表示し、押すと確認後にログアウト |
| レール下部 / モバイルヘッダー | 「ログイン」 | アカウント名 + 接続状態 |

`activateAccount(next?)`（`src/account-action.ts`）が入口を兼ねます。未ログインなら `navigate(next ? "/login?next=${encodeURIComponent(next)}" : "/login")`、ログイン済みなら `window.confirm` の後に `updateSettings({ sessionKey: "" })` でログアウトします。

`FavoritesPage` は `App` から `key={settings.sessionKey ? "signed-in" : "signed-out"}` で渡され、ログイン状態の変化で再マウントされます。

## 既知の制約

- `popstate` は購読していません。履歴移動はブラウザ / WebView が発火する `hashchange` に依存します。
- `navigate` は同一ハッシュを無視するため、「同じ URL へ遷移し直して再読み込み」はできません。再試行は各画面の `ErrorBox` の `onRetry` を使います。
- `route.query` の変更ではコンポーネントが再マウントされません（`App` が `key` を渡すのは `creator`（service / id）と `favorites`（ログイン状態の 2 値）だけです）。クエリを初期値に使う画面は、その初期値が再適用されない点に注意が必要です。
- 未知パスは `HomePage` にフォールバックするため、404 画面はありません。
