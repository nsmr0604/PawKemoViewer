# 投稿詳細

## 目的

1 件の投稿の本文、画像・動画、添付、コメント、改訂履歴を表示します。外部リンクの安全な開き方と、画像の一括保存の入口もここにあります。

## 入口（ルート）

| ルート | `route.path` | `params` | 備考 |
|---|---|---|---|
| `#/post/{service}/{creatorId}/{postId}` | `post` | `service`, `creator`, `id` | 一覧カード、お気に入り、投稿内リンクから |
| 検証に失敗した `#/post/...` | `invalid-post` | — | `App` が `ErrorBox` だけを表示 |

`?` 以降のクエリは使いません。画面を開くと `sessionStorage` の `pawkemo-current-post-context` に `{ service, creatorId, postId, openedAt }` を保存します。

## 画面構成

```
┌───────────────────────────────────────────────────────────┐
│ div.post-title-wrap                                       │
│   h1.post-title  タイトル（空なら common.untitled）         │
│   div.post-meta                                           │
│     [avatar] クリエイター名 → creator へ                    │
│     公開日 · 更新日 · 追加日 · 「最新版 / 旧版 i/n」        │
│   div.tag-chips  [タグ] → creator?tag=                     │
│   div.creator-actions                                     │
│     [フォロー] [☆] [前へ][次へ] [サイトを開く]              │
│     [画像を一括保存] [fanbox で開く]                        │
├───────────────────────────────────────────────────────────┤
│ （保存候補の選択中）div.download-picker                    │
│   ☑ 本文の画像 (n) ☑ 添付 (n) ☑ 外部リンク (n)             │
│   [保存する] [閉じる]                                      │
├───────────────────────────────────────────────────────────┤
│ div.post-content（サニタイズ済み HTML。リンクは横取り）     │
│   （リンク解決中/失敗）div.hint-row                        │
├───────────────────────────────────────────────────────────┤
│ （保存中）n/N + [中止] ／ （結果）メッセージ               │
│ （失敗）ul.download-failures  host — reason（最大 5 件）    │
├───────────────────────────────────────────────────────────┤
│ div.post-files（通常表示）                                 │
│   n 件 · サムネイル/原画  [cover を除外] [原画を読み込む]   │
│   figure.post-file  img または video                       │
│     figcaption ファイル名（新しいタブ + download）          │
├───────────────────────────────────────────────────────────┤
│ div.post-file-list-wrap（リスト表示）                       │
│   n 件  [cover 除外][すべて読み込む][原画]                  │
│   ul.post-file-list > li.post-file-row                     │
│     名前 / 画像・動画 / [読み込む → 保存]                   │
├───────────────────────────────────────────────────────────┤
│ （embed あり）pre.post-embed  JSON を整形表示               │
├───────────────────────────────────────────────────────────┤
│ div.post-nav  [前の投稿] [次の投稿]                         │
├───────────────────────────────────────────────────────────┤
│ section  その他  [flag ボタン]                             │
│ section  コメント  Spinner / Empty / ul.comment-list        │
│ section  改訂履歴  select(最新版 / 旧版) + 説明             │
├───────────────────────────────────────────────────────────┤
│ （ライトボックス）div.lightbox  画像 or 動画 + 位置/前後/保存 │
└───────────────────────────────────────────────────────────┘
```

通常表示とリスト表示の判定は `postFileListMode || noImageMode`（`listMode`）です。`noImageMode` が有効なら常にリスト表示になります。

## 主な操作

| 操作 | 挙動 |
|---|---|
| タイトル下のクリエイター名 | `navigate("/creator/${service}/${creatorId}")`（`encodeURIComponent`） |
| タグチップ | `navigate("/creator/${service}/${creatorId}?tag=${tag}")` |
| フォロー | `FollowButton` |
| ☆（お気に入り） | `sessionKey` があるときだけ表示。`api.favPostAdd` / `favPostRemove` 後に `clearApiCache()` と `setFavoritePost`。401 なら `faved="none"` でボタンを消す |
| 前へ / 次へ | `navPost(post.prev \| post.next)`。`replace` 遷移なので履歴は増えない |
| サイトを開く | `BrowserLink` で `postUrl(service, creatorId, postId)` |
| 元サービスで開く | `originalUrl` があるときだけ `BrowserLink` |
| 画像を一括保存 | `prepareDownload()` で候補を収集し、選択 UI を開く |
| 保存する | `startImageDownload()` → `runDownload()`。候補 0 件なら `post.downloadEmpty` |
| 中止 | `cancelImageDownload()`。進捗行と右下 FAB の両方から |
| 原画 / サムネイル切替 | `loadOriginalImages`。`fileUrl` と `thumbUrl` を切替 |
| cover を除外 | FANBOX のみ。`updateSettings({ excludeFanboxCover })` でグローバル保存 |
| 画像クリック | `lightboxIndex` を設定してライトボックスを開く |
| flag | `api.flagPost`。409 / already は「重複」、その他は「失敗」 |
| 改訂の選択 | `selectedRevisionId` を変え、`displayPost = activeRevision ?? post` |
| 外部リンク | 投稿内リンクを横取り（下記） |
| スワイプ | 横方向優位（`abs(dx) >= 80` かつ `abs(dx) >= 2 * abs(dy)`）で前後投稿へ。ライトボックス表示中は無効 |
| `←` / `→` | 通常時は前後投稿、ライトボックス時は画像の前後 |
| `Esc` | ライトボックスを閉じる。`stopPropagation()` を呼ぶが、`App` の `keydown` は同じ `window` 上の別リスナーなので止まらない（同時に戻る動作が走る可能性があり、実機確認は未実施） |

### 外部リンクの扱い

`openExternalLink` が `div.post-content` と各コメント本文のクリックを処理します。修飾キー付き・中クリック・`defaultPrevented` は素通しします。

1. `a[href]` を探す。無ければ何もしない。
2. `data-external-url` または `href` を `parseOriginalPostLink` に渡す。
3. 元サービス投稿リンクなら `resolveOriginalPost` で対応投稿を探し、見つかれば `navigate` で内部の投稿へ。見つからなければ `linkState = { kind: "missing", url }` として「元リンクを開く」を出す。
4. それ以外は `proxyReferer` と `canOpenExternalPage()` を確認し、`openExternalPage(url, proxyReferer, {...})` でネイティブの外部ページビューを開く。失敗時は `window.open(href, "_blank", "noopener")`。

`proxyReferer` は Patreon なら `originalPostReferer("patreon", postId)`、FANBOX なら元 URL のホストから slug を取り出して `originalPostReferer("fanbox", postId, slug)`。どちらも作れないときは `undefined` で、外部リンクは開きません。

## 状態（読込中・空・エラー・部分成功）

| 状態 | 条件 | 表示 |
|---|---|---|
| 本文取得中 | `!post` | ページ全体が `Spinner` |
| 本文エラー | `error` | ページ全体が `ErrorBox`（再試行 `load`） |
| コメント取得中 | `comments === null` | セクション内 `Spinner`（`post.commentsLoading`） |
| コメント 0 件 | `comments.length === 0` | `Empty`（`post.noComments`） |
| コメント失敗 | 例外 | `loadPostComments` が `[]` を返すため「0 件」と同じ表示（失敗とは区別できない） |
| 改訂取得中 | `revisions === null` | `Spinner`（`post.revisionsLoading`） |
| 改訂 404 | API が 404 | `revisions = []`、エラーなし |
| 改訂失敗（404 以外） | `revisionsError` | セクション内 `ErrorBox`（再試行なし） |
| 改訂 0 件 | `revisions.length === 0 && !revisionsError` | `Empty`（`post.noRevisions`） |
| 部分成功 | 本文は取得、改訂だけ失敗 | 本文とファイルは表示し、改訂セクションだけエラー |
| ファイル 0 件（cover 除外後） | `allFiles.length === 0` | `post.noFiles` の 1 行 |
| サムネイル失敗 | `img.onError` | 同じ `img` の `src` を本体 URL に差し替え。それも失敗したら `display: none` |
| お気に入り確認中 | `faved === "checking"` | ボタンは「…」で disabled |
| お気に入り失敗 | `faved === "err"` | 「エラー」表示（`post.favErrorShort`） |
| 一括保存 候補なし | 本文・添付・外部すべて 0 | メッセージのみ。ネイティブコマンドは呼ばない |
| 一括保存 実行中 | `downloadState === "running"` | `n/N` + 中止。`download-progress` イベントを購読 |
| 一括保存 完了 / 中止 / 失敗 | `downloadMessage` | 1 行の結果 + 失敗理由 5 件まで |
| リンク解決中 | `linkState.kind === "loading"` | `common.loading` |
| リンク先が見つからない | `linkState.kind === "missing"` | 「元リンクを開く」リンク |

## データ依存

| 用途 | 呼び出し / ストア |
|---|---|
| 本文・改訂 | `getApplication().postDetail.loadPostDetail(context, signal)`（`api.post` + `api.postRevisions`） |
| コメント | `postDetail.loadPostComments(context)`（`api.postComments`） |
| 元サービス投稿 URL | `api.originalPostUrl(service, creatorId, postId)` |
| クリエイター名 | `getCreatorRow("${service}:${creatorId}")` → 無ければ `loadCreatorProfile` |
| お気に入り判定 | `api.accountFavorites("post")`（`faved` の初期化） |
| お気に入り更新 | `api.favPostAdd` / `api.favPostRemove`、`setFavoritePost`、`clearApiCache` |
| flag | `api.flagPost` |
| ファイル URL | `fileUrl(file, service, postId, proxyReferer)` / `thumbUrl(file)` / `directFileUrl(file)` |
| 一括保存 | `collectArticleImages` / `collectAttachmentImages` / `collectExternalPages` / `downloadArticleImages` / `cancelImageDownload`（`src/post-download.ts`） |
| 保存進捗の共有 | `startDownload` / `reportDownloadProgress` / `finishDownload` / `failDownload`（`src/download-status.ts`）、Tauri イベント `download-progress` |
| 外部ページからの取り込み | `takeExternalPageImages()`（`src/external-page.ts`） |
| 本文の無害化 | `sanitizePostContent(post.content, service, postId, proxyReferer)`（`src/post-content.ts`） |
| コンテキスト保存 | `sessionStorage` キー `pawkemo-current-post-context` |

一括保存の対象と制限は[一括画像保存](../features/image-download.md)を参照してください。

## 外部ページから戻ったときの取り込み

`canOpenExternalPage()` が真の環境でだけ動きます。`document` の `visibilitychange` と `window` の `focus`、およびマウント直後に `takeExternalPageImages()` を呼びます。

- 表示状態が `visible` で、`downloadState` が `running` でないときだけ処理します。
- payload があれば `referer = payload.referer || proxyReferer || originalUrl` を使い、`payload.images` をそのまま一括保存へ渡します。
- 保存先のクリエイター名・service・creatorId は payload の値を優先し、無ければ現在の投稿の値を使います。
- `referer` が作れない場合は何もしません（`takeExternalPageImages` は既に読み取り済みなので、その機会は失われます）。

## 関連コード

- `src/pages/PostPage.tsx`
- `src/application/post-detail.ts` — 本文・改訂・コメントのユースケース
- `src/post-download.ts` / `src/post-image-urls.ts` — 候補収集
- `src/post-content.ts` / `src/original-post-link.ts` / `src/original-post-navigation.ts` — 本文とリンク
- `src/external-page.ts` — 外部ページビュー
- `src/components/DownloadFab.tsx` — 右下の常時表示ボタン
- `src/build-flags.ts` — `DEBUG_DIAG`（外部リンクのトレース）

## 既知の制約

- コメントの取得失敗は空配列に落ちるため、画面では「コメントなし」と区別できません。
- 改訂を選ぶと本文・ファイルは切り替わりますが、コメントは最新のままです。
- `embed` は JSON を `<pre>` に整形表示するだけで、埋め込みプレイヤーとしては描画しません。
- 一括保存は `referer`（`proxyReferer` または `originalUrl`）が必須です。両方作れない投稿では保存を開始できません。
- 外部リンクは `canOpenExternalPage()` が偽の環境（ブラウザ実行など）では開きません。`proxyReferer` が無い場合も同様です。
- 進捗イベントの購読は `downloadState === "running"` の間だけです。画面を離れると数値が止まることがあります（最終結果は共有ストアに残ります）。
- お気に入り判定の API が失敗すると `faved = "no"` になり、実際は登録済みでも未登録として表示されます。
- ライトボックスの前後移動は `allFiles` の範囲内で、`cover` 除外設定を反映した並びです。
- `post.prev` / `post.next` は API 応答の値をそのまま使います。前後移動は `replace` のため、連続移動後に「戻る」で一覧へ戻ります。
