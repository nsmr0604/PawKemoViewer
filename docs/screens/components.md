# 共有コンポーネント

画面から再利用されるコンポーネントの props と挙動です。スタイルの数値は `src/styles.css` の実測値です。

| コンポーネント | ファイル | 主な利用画面 |
|---|---|---|
| `AppShell` | `src/components/AppShell.tsx` | 全画面 |
| `NavigationRail` / `NavIcon` | `src/components/NavigationRail.tsx` | デスクトップ全画面（ログイン以外） |
| `BottomNavigation` | `src/components/BottomNavigation.tsx` | モバイルの一覧画面 |
| `navigationItems` | `src/components/navigation-items.ts` | レール / ボトムナビ |
| `PostGrid` / `PostCard` / `PostRow` | `src/components/PostGrid.tsx` | ホーム、クリエイター、お気に入り |
| `PostThumbnail` | `src/components/PostThumbnail.tsx` | 投稿カード、行 |
| `DownloadFab` | `src/components/DownloadFab.tsx` | 全画面（右下） |
| `Spinner` / `ErrorBox` / `Empty` | `src/components/Feedback.tsx` | 全画面 |
| `Toggle` | `src/components/Toggle.tsx` | 設定 |
| `FollowButton` | `src/components/FollowButton.tsx` | クリエイター、投稿詳細 |
| `CreatorHeader` | `src/components/CreatorHeader.tsx` | クリエイター |
| `CreatorAvatar` | `src/components/CreatorAvatar.tsx` | 一覧行、投稿詳細、ヘッダー |
| `BrowserLink` | `src/components/BrowserLink.tsx` | 投稿詳細 |
| `DeveloperDiagnostics` ほか | `src/components/Developer*.tsx` | 設定の診断 |

## AppShell

```ts
interface AppShellProps {
  headerIcon: string
  layout: ResolvedLayout
  currentPath: string
  followCount: number
  hasSession: boolean
  accountId: string
  children: ReactNode
}
```

- ルート要素は `div.app` + `app-desktop` / `app-mobile`。
- `pageLabel` は `currentPath` から決まります。`home` / `search` → ホーム、`creators` / `creator` → クリエイター、`favorites`、`settings`、`post` / `invalid-post` → 投稿詳細、それ以外 → ログイン。
- デスクトップかつ `!isLogin` のときだけ `NavigationRail` を描画。
- モバイルの一覧画面は `top-bar`（`logo` + `topbar-context` + `btn-account`）と `BottomNavigation`。
- モバイルの詳細 / ログインは `top-bar.detail-bar`（戻る + ホーム + `detail-context`）。戻るは `goBack(currentPath === "creator" ? "/creators" : "/")`。
- デスクトップの詳細 / ログインは `div.desktop-back` に同じ 2 ボタンを置く。戻るのツールチップには `Esc` を併記。
- 本文は `main.content`。詳細 / ログインでは `app-reading`、投稿は `content-post`（`max-width: 920px`）、ログインは `content-naked`。

## NavigationRail / NavIcon

```ts
interface NavigationRailProps {
  currentPath: string
  followCount: number
  hasSession: boolean
  accountLabel: string
}
```

- `NavIcon` は `home` / `creators` / `favorites` / `settings` / `account` の 5 種類。`viewBox="0 0 24 24"`、`stroke="currentColor"`、`aria-hidden`。
- 上部はブランドボタン（`pc.png` + `PawKemoViewer`）で `navigate("/")`。
- 中央は `navigationItems` の 4 項目。`aria-current="page"` と `nav-rail-badge`（99 超は `99+`）。
- 下部はアカウントボタン（`activateAccount()`）と接続状態ドット、`nav.searchShortcut` のヒント。
- 幅は 204px、900px 以下で 176px、680px 以下で 58px（ラベル類は非表示）。

## BottomNavigation

```ts
{ currentPath: string; followCount: number }
```

- `createPortal(..., document.body)` で `nav.bottom-nav` を本文外へ描画。
- 項目はレールと同じ `navigationItems`。アクティブは `nav-active`、バッジは `bottom-nav-badge`（99 超は `99+`）。
- `position: fixed`、`padding-bottom` に `env(safe-area-inset-bottom)` を加算。

## navigationItems

```ts
navigationItems(currentPath: string, followCount: number)
// => { path, label, icon, active, badge? }[]
```

| path | label | active 条件 | badge |
|---|---|---|---|
| `/` | `nav.home` | `home` / `search` | — |
| `/creators` | `nav.creators` | `creators` / `creator` | — |
| `/favorites` | `nav.favorites` | `favorites` | `followCount` |
| `/settings` | `nav.settings` | `settings` | — |

## PostGrid

```ts
interface PostGridProps {
  posts: PawPost[]
  onEndReached?: () => void
  loading?: boolean
  done?: boolean
  newIds?: Set<string>
  viewMode?: "grid" | "list"
}
```

- `viewMode` 未指定なら設定 `postViewMode`。
- 無限スクロールは `scroll` / `resize` を `requestAnimationFrame` で集約し、センチネル（高さ 1px の `div`）の `top` が `window.innerHeight + 800` 未満なら `onEndReached()`。
- `IntersectionObserver` は使っていません（環境によって再発火しないため）。
- `loading` で `Spinner`、`done && posts.length > 0` で `div.grid-end`（`common.end`）。
- キーは `${post.service}:${post.id}`。

### PostCard / PostRow

- クリック / Enter / Space で `navigate`。遷移先は `postPath(post)` が `isValidPostContext` を通ったときだけ生成し、不正なら `logWarn` して遷移しません。
- サムネイルは `listPostFiles(post)[0]` を `PostThumbnail` に渡す。
- `usePostMarks(service, user, id)` が `isFavoritePost` / `isFollowed` を読み、`FAVORITE_POSTS_CHANGED_EVENT` と `pawkemo-follows-changed` を購読して全カードを同期。
- バッジ: `isNew` → `NEW`、画像 2 枚以上 → `🖼n`、お気に入り → `★`、フォロー中 → `follow.following`。
- `PostRow` は `newIds` をタイトル横のインライン NEW として表示。

## PostThumbnail

```ts
{ file: PawFile | undefined; className?: string }
```

| 段階 | 条件 | 表示 |
|---|---|---|
| ファイル無し | `file?.path` が空 | `div.thumb.thumb-fallback` に `🖼️` |
| 初期 `loading` | ネイティブ実行、または `noImageMode` | プレースホルダ（`noImageMode` は `common.dataSaving` 付き） |
| 初期 `thumb` | Web 実行（キャッシュ問い合わせ前） | `thumbUrl(file)` を即表示 |
| `cached` | IndexedDB / ディスクキャッシュ、または取得に成功 | `URL.createObjectURL` の画像 |
| `thumb` | キャッシュ取得が失敗（Web） | `thumbUrl(file)` |
| `full` | サムネイル画像の読み込み失敗 | `fileUrl(file)` |
| `failed` | 取得結果が空、`noImageMode` でキャッシュ無し、最終的な失敗 | プレースホルダ |

- `IntersectionObserver`（`rootMargin: "160px"`）で画面に近づいたときだけキャッシュを読み込みます。
- 要求サイズは `parentElement.clientWidth * devicePixelRatio` を 1〜512 に丸めた値。
- `noImageMode` では `readPostThumbnail`（キャッシュのみ）、通常は `cachedPostThumbnail`（取得もする）。
- `onError` は `cached → thumb → full → failed` の順に落とし、`full` の失敗だけ `logError`。

## DownloadFab

- `useSyncExternalStore(subscribeDownloadStatus, getDownloadStatus)` で `src/download-status.ts` を購読。
- `createPortal(..., document.body)`。位置は `right: 16px`、`bottom: 84px + safe-area`（768px 以上は `24px`）、`z-index: 60`。
- `hashchange` で開いているパネルを閉じる。
- `done` / `error` は 20 秒後に `resetDownloadStatus()`（`updatedAt` が変わっていなければ）。
- ボタン表示: 実行中は `done/total`、完了は ✓、失敗は失敗件数。待機時はダウンロードアイコン。
- パネルには状態見出し、`status.message`、実行中のみ中止ボタン、閉じるボタン。

## Feedback（Spinner / ErrorBox / Empty）

| コンポーネント | props | 挙動 |
|---|---|---|
| `Spinner` | `label?` | `.spinner` + ラベル。既定 `common.loading` |
| `ErrorBox` | `error: unknown`, `onRetry?: () => void` | `Error.message` を `STATUS=(\d+) BODY=([\s\S]*)` で分解。`Fake site` → ブロック、401 → セッション無効、429 / 403 / 404 / 502・upstream・network・timeout で文言とヒントを切替。本文は 2000 文字まで `<details>`。`onRetry` があるときだけ再試行ボタン |
| `Empty` | `text?` | `div.empty`。既定 `common.noData` |

`Toggle` は `Feedback.tsx` ではなく `src/components/Toggle.tsx` にあります。

## Toggle

```ts
{ checked: boolean; onChange: (value: boolean) => void; label?: string; onLabel?: string; offLabel?: string }
```

- 状態テキスト（`onLabel` / `offLabel`、既定 `common.on` / `common.off`）と `role="switch"` のボタンを横に並べます。
- `aria-checked` と `aria-label` を設定。クリックで `onChange(!checked)`。

## FollowButton

```ts
{ service: string; id: string }
```

- 初期値は `isFollowed(service, id)`。`pawkemo-follows-changed` を購読して同期。
- マウント時に `getCreatorRow("${service}:${id}")` で名前を引き、保存済みフォローの `name` と違えば `storage.set("pawkemo-follows", ...)` で補完します。
- クリックで `addFollow` / `removeFollow`。ログイン中は API を先に呼びます（`src/follows.ts`）。
- 実行中は `follow.syncing` で disabled。失敗時はボタンの `title` と横の `span.creator-sub` にエラー文。
- 同ファイルの `followsCount()` は `loadFollows().length` を返すだけです。

## CreatorHeader

```ts
{ service: string; id: string }
```

- `getApplication().loadCreatorProfile(service, id)` でプロフィールを取得。
- 取得中は `Spinner`（`creators.profileLoading`）、失敗は `div.creator-head.error-box` に `creators.profileError`（再試行なし。再表示はページ遷移）。
- 成功時は `img.creator-banner`（`creatorBannerUrl`、失敗で非表示 + `logError`）、`CreatorAvatar`（`big`）、名前、`service · id · 更新日時`。

## CreatorAvatar

```ts
{ service: string; id: string; name?: string; className?: string }
```

- `getCreatorIcon(service, id)`（メモリ → IndexedDB → Rust ディスクキャッシュ）で URL を取得。
- 取得できるまで、またはアイコンが無いときは `name || id` の先頭 1 文字を大文字にして表示。
- 読み込み中もフォールバック文字を出し、取得成功後に `img` へ差し替わります。

## BrowserLink

```ts
Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "title" | "children"> & { href: string }
```

- 常に `target="_blank" rel="noopener noreferrer"` の `<a>`。
- ネイティブ実行（`descriptor.isNative`）では `preventDefault` して `invoke("open_in_browser", { url: href })`。
- 失敗すると `href` の横に `common.browserOpenFailed` を `role="status"` で表示。
- Web 実行では通常のリンクとして動作します。

## Developer*（設定の診断）

| コンポーネント | 表示条件 | 内容 |
|---|---|---|
| `DeveloperDiagnostics` | 常時（`lazy` + `Suspense`） | `sessionKey` を直接入力して「テスト」「保存」。成功で `settings.saved`、検証は `api.accountFavorites("artist", key, false)` |
| `DeveloperFullDiagnostics` | `DEBUG_DIAG` のみ | ログフォルダーを開く、バックアップのダンプ、pkv プローブ（外部 / 内部アドレス拒否）、iOS / iPadOS の外部ページ診断 |
| `DeveloperLocaleDiagnostics` | `DEBUG_DIAG` かつ診断セクション表示中 | 言語ファイルの取り込み・書き出し・追加・置換・削除、追加フォルダーへのコピー、検証結果の表示 |

`DeveloperLocaleDiagnostics` は `locale` / `localeList` / `reloadLocales` / `filePickerBusy` / `setFilePickerBusy` を props で受け取ります。
