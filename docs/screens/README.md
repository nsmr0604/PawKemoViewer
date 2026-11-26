# 画面設計

PawKemoViewer の画面一覧、共通シェル、レイアウト切替、共通の状態表示をまとめます。
個別の画面仕様はこのディレクトリの各ファイルに分けています。仕様の正本はコードです。

- 設計全体の方針は[画面構成](../architecture/adaptive-ui.md)を参照してください。ここでは重複を避け、実装の実名と構造だけを書きます。
- プラットフォームごとの差分は[プラットフォームとストレージ](../architecture/platform.md)を参照してください。

## 画面一覧

| 画面 | ルート | 実装 | 役割 | ログイン |
|---|---|---|---|---|
| ホーム / 検索 | `#/`, `#/search?q=` | `src/pages/HomePage.tsx` | 最新投稿と検索結果の一覧 | 不要 |
| クリエイター一覧 | `#/creators` | `src/pages/CreatorsPage.tsx` | ローカル索引の検索・並べ替え | 不要 |
| クリエイターページ | `#/creator/{service}/{id}` | `src/pages/CreatorPage.tsx` | プロフィールと投稿一覧 | 不要 |
| 投稿詳細 | `#/post/{service}/{creatorId}/{postId}` | `src/pages/PostPage.tsx` | 本文・ファイル・コメント・改訂 | 不要 |
| 不正な投稿 URL | `#/post/...`（検証失敗時） | `src/App.tsx` の `invalid-post` | エラー表示のみ | 不要 |
| お気に入り | `#/favorites` | `src/pages/FavoritesPage.tsx` | フォロー一覧 / アカウントお気に入り | フォローのみ不要 |
| 設定 | `#/settings`, `#/settings?section=` | `src/pages/SettingsPage.tsx` | 表示・接続・データ・診断 | 不要 |
| ログイン | `#/login`, `#/login?next=` | `src/pages/LoginPage.tsx` | pawchive セッション取得 | 不要 |

ルーティングの解析規則と遷移は[navigation.md](navigation.md)にまとめています。

## 共通シェル

`src/App.tsx` が `AppShell` に画面コンテンツを渡し、全画面が同じ外枠を使います。
`src/components/AppShell.tsx` の props は次のとおりです。

| prop | 型 | 用途 |
|---|---|---|
| `headerIcon` | `string` | モバイルのヘッダーに出すアプリアイコン（`theme` で dark / light を選択） |
| `layout` | `ResolvedLayout` | `"desktop"` / `"mobile"` |
| `currentPath` | `string` | `route.path`。ナビの選択状態と見出しに使用 |
| `followCount` | `number` | お気に入りタブのバッジ件数 |
| `hasSession` | `boolean` | アカウント表示の切替 |
| `accountId` | `string` | アカウント表示。ログイン時は username、session から復元した場合は数値の `account_id`（空なら `nav.accountIdUnknown`） |
| `children` | `ReactNode` | 画面本体 |

シェルの分岐は 3 つの真偽値で決まります。

- `isPost`: `currentPath` が `post` / `invalid-post`
- `isDetail`: `isPost` または `creator`
- `isLogin`: `currentPath` が `login`

| レイアウト | 条件 | 上部 | 下部 | 左 |
|---|---|---|---|---|
| デスクトップ | `!isLogin` | なし（詳細時は `desktop-back`） | なし | `NavigationRail` |
| デスクトップ | `isLogin` | なし（本文先頭に `desktop-back`） | なし | なし（`content-naked`） |
| モバイル | `!isDetail && !isLogin` | `top-bar`（ロゴ + 画面名 + アカウント） | `BottomNavigation` | なし |
| モバイル | `isDetail \|\| isLogin` | `top-bar detail-bar`（戻る + ホーム + 画面名） | なし | なし |

- `NavigationRail` / `BottomNavigation` は同じ `src/components/navigation-items.ts` の `navigationItems(currentPath, followCount)` を使います。項目は `/`、`/creators`、`/favorites`（バッジ = `followCount`）、`/settings` の 4 件です。
- `BottomNavigation` と `DownloadFab` は `createPortal(..., document.body)` で本文の外へ描画します。
- `DownloadFab` は `AppShell` の子として常に描画されるため、ログイン画面を含む全画面で右下に表示されます。

## レイアウト切替

`resolveLayout(settings.layoutMode, windowWidth)`（`src/platform/environment.ts`）が実際のレイアウトを返します。

| 設定 | 条件 | 結果 |
|---|---|---|
| `desktop` | 常に | `desktop` |
| `mobile` | 常に | `mobile` |
| `auto` | 幅 768px 以上 かつ デスクトップ UA | `desktop` |
| `auto` | それ以外（モバイル UA を含む） | `mobile` |

`App` は `window.innerWidth >= 768` を `requestAnimationFrame` で間引いて監視し、`resolveLayout` へは `768` / `767` のどちらかを渡します。

| 幅 / 条件 | 変化 |
|---|---|
| 768px | レイアウト切替の境界（`App`）。FAB の下端も 84px → 24px |
| 1000px 以上 | ホームの検索パネルが 2 カラム化（`styles.css`） |
| 900px 以下 | デスクトップのレールが 176px に縮む |
| 700px 以上 | 投稿グリッドの最小列幅が 150 → 200px |
| 680px 以下 | レールが 58px のアイコンのみ、設定ナビが 2 列化 |

数値は `src/styles.css` の実測値です。レールは 204px（`> 900px`）、176px（`<= 900px`）、58px（`<= 680px`）です。`content` は `max-width: 1320px`（投稿詳細は 920px）で中央寄せです。

## 全体レイアウト

デスクトップ（一覧画面）:

```
┌────────────────────┬──────────────────────────────────────────────┐
│ NavigationRail     │ content (max-width 1320px, 中央寄せ)         │
│  204 / 176 / 58 px │                                              │
│ ┌────────────────┐ │  <h1 class="page-title">                     │
│ │ ロゴ           │ │  ┌────────────────────────────────────────┐  │
│ ├────────────────┤ │  │ discovery-panel / 一覧 / 詳細本文      │  │
│ │ ホーム         │ │  └────────────────────────────────────────┘  │
│ │ クリエイター   │ │                                              │
│ │ お気に入り (n) │ │                                     ┌─────┐  │
│ │ 設定           │ │                                     │ FAB │  │
│ ├────────────────┤ │                                     └─────┘  │
│ │ アカウント     │ │                              右下 16px / 24px │
│ └────────────────┘ │                                              │
└────────────────────┴──────────────────────────────────────────────┘
```

モバイル（一覧画面）:

```
┌───────────────────────────────────────┐
│ top-bar (sticky)                      │
│ 🐾  PawKemoViewer   画面名  [account] │
├───────────────────────────────────────┤
│ content                               │
│   padding-bottom: 76px + safe-area    │
│                                       │
│                                  ┌──┐ │
│                                  │FAB││ ← bottom 84px
│                                  └──┘ │
├───────────────────────────────────────┤
│ bottom-nav (fixed, portal)            │
│  ホーム   クリエイター  お気に入り  設定 │
└───────────────────────────────────────┘
```

モバイル（詳細 / ログイン）:

```
┌───────────────────────────────────────┐
│ detail-bar:  ← 戻る   ⌂   [画面名]     │
├───────────────────────────────────────┤
│ content (app-reading)                 │
│   下部ナビなし・下余白 24px + safe-area│
│                                  ┌──┐ │
│                                  │FAB││
│                                  └──┘ │
└───────────────────────────────────────┘
```

## 共通の状態表示

`src/components/Feedback.tsx` の 3 つを全画面で使い分けます。

| コンポーネント | props | 挙動 |
|---|---|---|
| `Spinner` | `label?` | `.spinner` + ラベル。既定は `common.loading` |
| `ErrorBox` | `error`, `onRetry?` | `Error.message` を `STATUS=(\d+) BODY=` で分解し、`Fake site` / 401 / 429 / 403 / 404 / 502・network・timeout で文言を切替。本文は 2000 文字まで `<details>` に表示。`onRetry` があるときだけ再試行ボタン |
| `Empty` | `text?` | `.empty` に文言。既定は `common.noData` |

画面ごとの状態の組み合わせ:

| 状態 | 表示 |
|---|---|
| 初回読み込み | `Spinner`（一覧は `PostGrid` 内、設定は `common.loading` のテキスト） |
| 追加読み込み | `PostGrid` の `loading` → `Spinner`、末尾に `grid-end` |
| 空 | `Empty` または `.empty` の div |
| 全体エラー | `ErrorBox` + `onRetry`（多くは同じ読み込み関数を再実行） |
| 部分エラー | 投稿詳細の改訂履歴（`revisionsError`）、お気に入りの行単位エラー、クリエイターのタグ取得失敗（空配列に落として非表示） |

読み込み中の二重実行は各画面の `useRef` シーケンス番号（`reqSeq` / `searchSeq` / `AbortController`）で古い応答を破棄します。

## このディレクトリの構成

| ファイル | 内容 |
|---|---|
| [navigation.md](navigation.md) | ルート定義、ハッシュ解析、遷移図、履歴仕様 |
| [home.md](home.md) | ホームと検索 |
| [creators.md](creators.md) | クリエイター一覧 |
| [creator.md](creator.md) | クリエイターページ |
| [post.md](post.md) | 投稿詳細 |
| [favorites.md](favorites.md) | お気に入りとフォロー |
| [login.md](login.md) | ログイン |
| [settings.md](settings.md) | 設定 |
| [components.md](components.md) | 共有コンポーネントの props と挙動 |
