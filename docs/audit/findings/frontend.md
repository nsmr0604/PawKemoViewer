# フロントエンド監査 (0.6.0 / src 配下)

- 対象: `src/**/*.ts` / `*.tsx`(pages / components / domain / application / infrastructure / platform / 直下の lib)
- 対象外: `tests/`、`src-tauri/`(必要箇所のみ参照)
- 方針: コード変更なし。行番号は記載せず、ファイルパスとシンボル名で示す
- `notes/pawchive/bugs.md` に既出の項目は「既知」と明記(未修正のまま残っているもの)
- 件数: 重大 4 / 中 18 / 低 15(計 37)

---

## [重大] 投稿本文サニタイザーが `javascript:` スキームを迂回できる
- 分類: セキュリティ
- 場所: `src/post-content.ts` の `sanitizePostContent`
- 根拠: href の除去判定が `attr.value.trim().toLowerCase().startsWith("javascript")` のみ。`java&#9;script:` のような制御文字入りは判定を通過し、ブラウザは URL 解析時にタブ/改行を除去するため `javascript:` として実行される。SVG の `xlink:href` は属性名チェックの対象外。本文は `PostPage` の `dangerouslySetInnerHTML` で描画される。
- 影響: 投稿本文を作成できる第三者が、アプリのオリジンで任意スクリプトを実行できる。`localStorage` の sessionKey 読み出しや Tauri `invoke`(API 中継・保存)の呼び出しに到達し得る。
- 修正案: 許可タグ・許可属性・許可スキームのホワイトリスト方式に変え、`new URL()` で解決して `http/https` 以外の href を削除する。`xlink:href` / `formaction` / `srcset` も検査対象にする。

## [重大] バックアップ書き出しで sessionKey を OS クリップボードへコピーしている
- 分類: セキュリティ
- 場所: `src/pages/SettingsPage.tsx` の `doExportBackup`、`src/backup.ts` の `buildBackup`
- 根拠: `buildBackup` は `settings` を丸ごと含むため sessionKey を含み、`doExportBackup` は保存成功後に `services.clipboard.writeText(json)` を無条件で実行する。
- 影響: クリップボードは他アプリ・クリップボード履歴・クラウド同期から読める。端末ローカルのファイル保存という設計意図(backup.ts のコメント)を超えて資格情報が拡散する。画面には「クリップボードにもコピー済み」と出るが、sessionKey が含まれることは示していない。
- 修正案: クリップボードへは sessionKey を除いた JSON を渡す、または既定でコピーしない(明示ボタンにする)。

## [重大] Home のサービス絞り込みで表示 0 件のとき次ページ取得が止まらない
- 分類: 性能
- 場所: `src/pages/HomePage.tsx` の `filteredPosts` / `onEndReached` と `src/components/PostGrid.tsx` の `check`
- 根拠: フィルタ後の配列を `PostGrid` に渡す一方、`onEndReached` は `loading || done` でしか止まらない。フィルタ後 0 件でもセンチネルは画面内に残り、`loading` 復帰後の 60ms 再判定で次頁を連続取得する。
- 影響: `done` まで 50 件ずつ取得を繰り返し、スピナーが出続ける。pawchive API への負荷が想定を超える(既知・未修正)。
- 修正案: 絞り込み中は自動次頁を停止する、またはフィルタ前の全件を保持して読み込み済み範囲だけを絞り込む。

## [重大] アカウント切替後も前アカウントのお気に入りを表示する
- 分類: データ
- 場所: `src/App.tsx` の `FavoritesPage` の `key`、`src/pages/FavoritesPage.tsx` の `loadAccount` effect、`src/post-favorites.ts` の `loadFavoritePosts`
- 根拠: `key={settings.sessionKey ? "signed-in" : "signed-out"}` のため別アカウントへ切り替えても再マウントされない。取得 effect の条件 `accountFavs === null` が偽のままなので再取得しない。`favoritePostKeys` も session 変更で破棄されない。
- 影響: 別アカウントの投稿お気に入り一覧と ★ マークが残り、共有端末では他人のデータが見える。以後の表示判定も誤る。
- 修正案: key に sessionKey を含める、または session 変更時に `accountFavs` を null に戻し `favoritePostKeys` を破棄する。

---

## [中] ライトボックスで Esc を押すと投稿詳細からも離脱する
- 分類: 正確性
- 場所: `src/pages/PostPage.tsx` の `onKey`(ライトボックス分岐)と `src/App.tsx` の `handleKeyDown`
- 根拠: 両方が `window` に keydown を登録している。PostPage 側は `e.stopPropagation()` のみで、同一ノード上の他リスナーには効かない。App 側は `defaultPrevented` を見ずに `goBack` を実行する。
- 影響: 画像を閉じるつもりが一覧まで戻る。`h` / `c` / `f` / `s` のショートカットもライトボックス表示中に発火する。
- 修正案: オーバーレイ表示中は App 側のショートカットを抑止する(フラグを共有)、または PostPage 側で `stopImmediatePropagation` を使い App 側で `defaultPrevented` を確認する。

## [中] ログイン成功後のフォロー同期失敗が「通信エラー」として表示される
- 分類: 正確性
- 場所: `src/pages/LoginPage.tsx` の `submit`
- 根拠: `updateSettings({ sessionKey })` の直後に `await syncFollowsWithAccount()` があり、その例外が外側の catch に入って `login.commError` を表示する。session は保存済み。
- 影響: ログイン自体は成功しているのに失敗したように見え、再ログインを試す導線になる(既知・未修正)。
- 修正案: 同期だけ `.catch()` で切り離し、成功メッセージと同期失敗の注記を分けて表示する。

## [中] 初回フォロー移行の再取得が 60 秒キャッシュを読み、移行したフォローがローカルから消える
- 分類: データ
- 場所: `src/follows.ts` の `syncFollowsWithAccount`
- 根拠: 移行ループの前後で `api.accountFavorites("artist")` を 2 回呼ぶが、GET キャッシュの TTL が 60 秒で同一世代なので 2 回目は移行前の応答を返す。その結果で `replaceFollows` し `MIGRATED_KEY` を立てる。
- 影響: 初回ログイン直後にローカルのフォローが一覧から消える(サーバー側には追加済みなので次回同期で復活するが、ユーザーには消失に見える)。
- 修正案: 移行後の再取得は `force`(キャッシュ無効)にする、または移行で追加した分をローカル結果へマージする。

## [中] follows の localStorage が壊れていると一覧描画が例外になる
- 分類: データ
- 場所: `src/follows.ts` の `loadFollows`
- 根拠: `JSON.parse(raw)` の結果を配列か検証せず返す。`App` は `.length`、`PostGrid` / `FollowButton` は `.some` を呼ぶ。
- 影響: 値が `{}` などだと `isFollowed` が TypeError を投げ、一覧のカード描画ごと落ちる(ErrorBoundary も無い)。バッジ件数も `undefined` になる。
- 修正案: `Array.isArray` と要素の型検証を行い、不正時は空配列へフォールバックする(`replaceFollows` と同じ検証を共有)。

## [中] コメント本文が HTML エスケープされてタグがそのまま見える
- 分類: 正確性
- 場所: `src/pages/PostPage.tsx` のコメント一覧 `comment-body`
- 根拠: `sanitizePostContent(c.content, ...)` の戻り値(HTML 文字列)を JSX の子として渡しているため、テキストとしてエスケープされる。本文側は同じ関数を `dangerouslySetInnerHTML` で使っている。
- 影響: コメントに HTML が含まれる場合 `<p>` や `&amp;` がそのまま表示され、リンクも機能しない。プレーンテキスト前提なら無害(要確認: API の `content` が HTML か)。
- 修正案: コメントも同じサニタイズ結果を `dangerouslySetInnerHTML` で描画する、または API がプレーンテキストならサニタイズをやめてそのまま表示する。

## [中] 投稿を前後移動しても一括保存の選択状態が残る
- 分類: 正確性
- 場所: `src/pages/PostPage.tsx` の `downloadPicker` / `downloadSources` と `load` effect
- 根拠: `load` は投稿・コメント・改訂・linkState をリセットするが `downloadPicker` / `downloadSources` / `downloadMessage` はリセットしない。`startImageDownload` は現在の `postContext` と古い候補を組み合わせて保存する。
- 影響: 前の投稿の画像を新しい投稿の保存先(クリエイター名)へ保存しようとする。候補件数の表示も実態とずれる。
- 修正案: 投稿識別子が変わったら選択 UI と結果メッセージを閉じる。

## [中] 一覧カードごとに window リスナーを登録し、イベントごとに localStorage を再パースする
- 分類: 性能
- 場所: `src/components/PostGrid.tsx` の `usePostMarks`、`src/follows.ts` の `isFollowed`
- 根拠: カード 1 枚ごとに `favorite-posts` と `follows` の 2 リスナーを登録し、発火のたびに `loadFollows()` で JSON をパースする。無限スクロールで数百枚になるとリスナーとパース回数が比例して増える。
- 影響: フォロー同期やお気に入り更新のたびにスクロールが固まる。低スペック端末で顕著。
- 修正案: フォロー集合をモジュール内でメモリ保持して 1 つの購読にまとめ、カードは props か context で受け取る。

## [中] CreatorsPage が 10 万件を毎レンダーで filter + sort する
- 分類: 性能
- 場所: `src/pages/CreatorsPage.tsx` の `visibleRows` / `displayedRows`
- 根拠: `searchCreatorIndex` は最大 100000 行を返し、`rows.filter(...).sort(...)` をレンダーのたびに実行する。検索入力は 1 文字ごとに `onSearch` → `runSearch` → setState で再レンダーする(デバウンスなし)。
- 影響: 入力のたびに 10 万件の走査とソートが走り、キー入力が詰まる。索引構築中はさらに悪化する。
- 修正案: 入力のデバウンス、`useMemo` による絞り込み・ソートのメモ化、表示上限 60 件での早期打ち切り。

## [中] FavoritesPage の新着チェックがマウント時に二重実行される
- 分類: 性能
- 場所: `src/pages/FavoritesPage.tsx` の `checkNew` と 2 つの effect
- 根拠: マウント時の `checkNew(false)` と、`sessionKey` effect の `syncFollowsWithAccount().then(... checkNew(false))` が直列化されずに走る。先に始まった走査がまだ処理していないフォローは `checkedAt` が古いままなので、2 本目もクールダウン判定を通らず API を呼ぶ。
- 影響: 初回やクールダウン経過後は、同じフォローに対して `creatorPosts` が最大 2 回呼ばれる。80 フォローで最大 160 リクエストになり、API 負荷と待ち時間が倍増する。
- 修正案: 初回チェックを 1 本化する(同期完了後にまとめて 1 回)、または実行中フラグで直列化する。

## [中] アイコン 1 件保存するたびに IndexedDB の全件を読み出している
- 分類: 性能
- 場所: `src/icons.ts` の `getCreatorIcon` → `prune`
- 根拠: `idbPut` の後に毎回 `prune(d)` を呼び、`store.getAll()` で保持中の全レコード(上限 2000 件・data URL 各 30〜60KB)を読み出してソートする。
- 影響: 一覧を開いてアイコンを N 件取得すると、保存のたびに全件読み出しが走る。キャッシュが育つほど 1 件あたりのコストが増え、初回表示が大きく遅れる。
- 修正案: 保存時は件数のみ確認し、閾値超過時だけ削除する。削除は `t` のインデックスカーソルで先頭から消す。

## [中] noImageMode のサムネイル取得が毎回キー全走査する
- 分類: 性能
- 場所: `src/post-thumbnail-cache.ts` の `readPostThumbnail`
- 根拠: 完全一致キーが無いと `getAllKeys()` で全キーを取り、サイズ違いの候補を線形探索する。
- 影響: noImage モードで未キャッシュのカードが多いほど、1 枚ごとに O(n) のキー走査が走る(最大 2000 件)。
- 修正案: サイズを固定(表示幅に依らず 1〜2 種類)にするか、`[path, size]` の複合キーでレンジ検索する。

## [中] 本文サニタイズがレンダーのたびに DOMParser を実行する
- 分類: 性能
- 場所: `src/pages/PostPage.tsx` の `post-content` とコメント描画
- 根拠: `sanitizePostContent(...)` を JSX 内で直接呼んでいる。保存進捗イベント(`download-progress`)でも state が更新され再レンダーされる。
- 影響: 長い本文・コメントが多い投稿で、進捗更新のたびに HTML パースと属性走査が繰り返され、保存中のスクロールが重くなる。
- 修正案: `useMemo` で `[content, service, postId, proxyReferer]` に依存させて結果を保持する。

## [中] ErrorBoundary が無く、描画例外でアプリ全体が白画面になる
- 分類: 保守性
- 場所: `src/main.tsx` の `bootstrap` / `src/App.tsx`
- 根拠: `src` 内に `ErrorBoundary` / `componentDidCatch` が存在しない。React 18 ではルート直下の例外でツリー全体がアンマウントされる。
- 影響: 1 つの壊れたデータ(例: follows の破損)や想定外の `undefined` で画面が消え、ログを見る導線も残らない。
- 修正案: ルートとページ境界に ErrorBoundary を置き、再読み込み・ホームへ戻る導線を出す。

## [中] CreatorsPage がフォーカスのたびにクリップボードを読む
- 分類: セキュリティ
- 場所: `src/pages/CreatorsPage.tsx` の `checkClip`、`src/platform/environment.ts` の `readClipboardTextSafe`
- 根拠: マウント時と `window` の `focus` ごとに `navigator.clipboard.readText()` を呼ぶ。ユーザー操作を起点にしていない。
- 影響: Windows では WebView2 のクリップボード許可ダイアログが前面に出る(既知)。許可後も他アプリのコピー内容を常時読む挙動になり、プライバシー上の説明も無い。
- 修正案: 「クリップボードから」ボタンなど明示操作に限定し、初回に用途を説明する。

## [中] クリエイター検索の失敗が未処理 rejection になる
- 分類: 正確性
- 場所: `src/pages/CreatorsPage.tsx` の `runSearch` / `onSearch`
- 根拠: `searchCreatorIndex` の reject を捕捉せず、`onSearch` も await するだけ。IndexedDB 障害時は `error` state も更新されない。
- 影響: 画面は古い結果のまま、コンソールとグローバルログにのみ `unhandled rejection` が残る。利用者には原因が分からない。
- 修正案: `try/catch` で `setError` し、検索欄の下にエラーと再試行を出す。

## [中] ライトボックスがダイアログとして扱われておらず、キーボードで開けない
- 分類: 保守性
- 場所: `src/pages/PostPage.tsx` のライトボックス、`src/components/PostGrid.tsx` のカード
- 根拠: ライトボックス要素に `role="dialog"` / `aria-modal` / フォーカス移動・復帰が無く、サムネイル `img` は `onClick` のみで `tabIndex` を持たない。Esc はグローバルハンドラ依存。
- 影響: キーボードだけで画像を開けず、スクリーンリーダーではオーバーレイの存在と閉じ方が伝わらない。
- 修正案: サムネイルを button 化し、ライトボックスに dialog role・初期フォーカス・閉じた後のフォーカス復帰を実装する。

## [中] fanbox / patreon への直リンクは `data-external-url` が付かずアプリ内で遷移する
- 分類: プラットフォーム差
- 場所: `src/api.ts` の `proxyLinkUrl` と `src/pages/PostPage.tsx` の `openExternalLink`
- 根拠: `proxyLinkUrl` は hotlink ホスト(fanbox / patreon)を「そのまま」返すため `data-external-url` が付かない。投稿 URL(`/@slug/posts/{id}`)は `parseOriginalPostLink` が拾って preventDefault するが、クリエイターページやプロフィールへのリンクはそのまま既定動作になる。
- 影響: 本文中の fanbox / patreon のプロフィール系リンクをタップすると、アプリの WebView 自体が外部サイトへ遷移し得る(戻るまで画面が戻らない)。Tauri のナビゲーション制限でブロックされるかは要確認。
- 修正案: hotlink ホストへのリンクにも `target` / `data-external-url` を付け、外部ビューで開く。

## [中] 本文由来 URL をネイティブ外部ビューへ渡す前の検査がフロントに無い
- 分類: セキュリティ
- 場所: `src/external-page.ts` の `openExternalPage`、呼び出し元 `src/pages/PostPage.tsx` の `openExternalLink`
- 根拠: `proxyLinkUrl` を通った URL は `http/https` に限られるが、`isLocalHost` は `localhost` / `127.0.0.1` のみで、`192.168.x.x` や `169.254.x.x` は除外されない。そのまま `open_external_page` に渡る。
- 影響: 悪意ある投稿本文で、端末から内部ネットワークへ Referer 付きのリクエストを発生させられる(実効性は Rust 側の検査次第。要確認: `open_external_page` に内部アドレス検査が無いとの記録あり)。
- 修正案: フロントでも IP リテラル・プライベートレンジ・`.local` を拒否する、または Rust 側で必ず遮断する。

---

## [低] バックアップで accountId / userAgentMode が復元されない
- 分類: データ
- 場所: `src/backup.ts` の `applyBackup` の `validators`
- 根拠: validator に `accountId` と `userAgentMode` が無いため、書き出した設定のうち 2 項目が無視される。
- 影響: 復元後にアカウント表示が「不明」になり、UA 設定も既定へ戻る(既知・未修正)。
- 修正案: 両項目の validator を追加する(`accountId` は長さ上限、`userAgentMode` は 3 値)。

## [低] フォロー同期が session 変更を跨いで古いアカウントの一覧を書き戻す
- 分類: データ
- 場所: `src/follows.ts` の `syncFollowsWithAccount`
- 根拠: 開始時の sessionKey を保持せず、完了時に `replaceFollows` する。実行中にログアウト/切替が起きても中断しない。
- 影響: 稀有だが、切替直後に前アカウントのフォロー一覧がローカルへ残る。
- 修正案: 完了時に `getSettings().sessionKey` が開始時と一致するか確認してから書き込む(`PostPage` の `toggleFav` と同じ手法)。

## [低] SettingsPage が設定変更イベント名をリテラルで登録している
- 分類: 保守性
- 場所: `src/pages/SettingsPage.tsx` の `verifySession` effect
- 根拠: `"pawkemo-settings-changed"` を直書きしており、`api.ts` の `SETTINGS_CHANGED_EVENT` を import していない。
- 影響: イベント名を変更したとき購読だけが外れ、ログイン状態表示が更新されなくなる。
- 修正案: 定数を import して使う。

## [低] 未使用 export が残っている
- 分類: 保守性
- 場所: `src/follows.ts` の `toggleFollow`、`src/components/FollowButton.tsx` の `followsCount`、`src/icons.ts` の `iconCacheCount`、`src/db.ts` の `deleteSeen`
- 根拠: `src` 内に参照が無い(呼び出し元ゼロ)。`toggleFollow` はアカウント同期を経由しないローカル単独更新で、canonical と不整合になり得る。
- 影響: 誤って使うとアカウント側と食い違う。読解コストも増える。
- 修正案: 削除する。

## [低] `AccountFavorite` を `PawPost[]` にキャストしている
- 分類: 保守性
- 場所: `src/pages/FavoritesPage.tsx` の `sortedFavs as PawPost[]`、`src/types.ts` の `AccountFavorite`
- 根拠: `AccountFavorite` は `Partial<PawPost>` であり、`file` / `content` などが欠落し得る。`as` で型検査を迂回している。
- 影響: 将来 `PostGrid` 側が必須フィールドを前提にすると実行時エラーになる。
- 修正案: 表示用の DTO を明示的に組み立てる、または `PostGrid` の props を必要最小限の型にする。

## [低] API パスの識別子エンコードが不統一で、creator ルートの service 検証も無い
- 分類: セキュリティ
- 場所: `src/api.ts` の `post` / `postComments` / `favPostAdd` など、`src/router.ts` の `parseHash`
- 根拠: `postRevisions` だけが `encodeURIComponent` と `isValidPostContext` を通す。他は生値を連結する。creator ルートは `segs.length >= 3` だけで service を検証しない。
- 影響: 特殊文字を含むハッシュから意図しない API パスが生成され得る(`/posts/..%2F` 等)。現状の ID は数値中心のため実害は限定的。
- 修正案: パス組み立てを 1 つのヘルパーに集約し、全エンドポイントで encode と service 検証を行う。

## [低] 一括保存の進捗 total が外部ページ数を数えていない
- 分類: 正確性
- 場所: `src/pages/PostPage.tsx` の `runDownload`
- 根拠: `startDownload(images.length)` と `setDownloadProgress({ total: images.length })` で、`pages` を含まない。Rust のイベントはページ分も含む。
- 影響: 外部ページを保存すると進捗が `n / m` を超えたり、開始直後に件数がずれて見える。
- 修正案: `images.length + pages.length` を total にする(実際の件数は Rust のイベントに合わせる)。

## [低] 未使用の翻訳キーが残っている
- 分類: 保守性
- 場所: `src/locales/ja.json` / `en.json`
- 根拠: `nav.menu`、`nav.shortcuts`、`nav.keyboardHint`、`settings.diagTitle`、`settings.diagFlag`、`settings.connection`、`settings.dataTitle`、`settings.cacheTitle`、`settings.localeRefresh`、`settings.localeAddTitle`、`settings.localeBadJson`、`settings.intro`、`common.yes`、`login.sessionManual`、`settings.languageJapanese/English` などが参照 0。動的キー(`settings.userAgent_*` 等)もあるため要確認。
- 影響: 辞書の保守コスト増。翻訳漏れの検出が難しくなる。
- 修正案: 参照が無いことを確認して削除し、`check:locales` に未使用検出を追加する。

## [低] お気に入りのクリエイター行がキーボード操作できない
- 分類: 保守性
- 場所: `src/pages/FavoritesPage.tsx` の `creator-row-main`
- 根拠: `div` の `onClick` のみで `role` / `tabIndex` / `onKeyDown` が無い(`CreatorsPage` の行は実装済み)。
- 影響: キーボードとスクリーンリーダーではクリエイターを開けない。
- 修正案: `CreatorsPage` の行と同じく `role="button"` + Enter/Space 対応にする。

## [低] バックアップ取込の確認に `window.confirm` を使っている
- 分類: 正確性
- 場所: `src/pages/SettingsPage.tsx` の `doImport`、`src/account-action.ts` の `activateAccount`
- 根拠: 破壊的操作の確認を WebView の `confirm` に依存している。
- 影響: Android WebView で `confirm` が実装されていない場合、確認なしで適用される/何も起きない(要確認)。以前に locale 削除で同じ問題が記録されている。
- 修正案: 設定画面内のインライン確認 UI に統一する。

## [低] 破壊的なキャッシュ消去に確認が無い
- 分類: 正確性
- 場所: `src/pages/SettingsPage.tsx` の `doClearCache` / `doClearIconCache`
- 根拠: ボタン 1 回で索引(約 6MB・再取得に時間がかかる)を削除する。
- 影響: 誤タップで検索索引とアイコンキャッシュが消え、再構築まで検索できない。
- 修正案: 実行前に確認を出す、または取り消し可能な猶予を持たせる。

## [低] 診断ビルドの backup dump が sessionKey をログへ書き出す
- 分類: セキュリティ
- 場所: `src/components/DeveloperFullDiagnostics.tsx` の `dumpBackup`
- 根拠: `buildBackup()` の全文を `logInfo` で分割記録する。バックアップには sessionKey が含まれる。
- 影響: 診断ビルドのログファイル・画面・書き出しに資格情報が残る(`DEBUG_DIAG` 限定)。
- 修正案: dump 前に `sessionKey` を伏字化する。

## [低] スクロール位置の保存がフレームごとに JSON 往復する
- 分類: 性能
- 場所: `src/hooks.ts` の `saveScroll` / `useScrollMemory`
- 根拠: scroll の rAF ごとに `JSON.parse` → 更新 → `JSON.stringify` → `sessionStorage.setItem` を同期実行する。
- 影響: スクロール中の微小なコストが積み上がる。低スペック端末でカクつきの一因。
- 修正案: 位置は ref に保持し、離脱時または 200ms デバウンスで書き込む。

## [低] `clearCreatorCache` が `value: undefined` のレコードを残す
- 分類: データ
- 場所: `src/db.ts` の `clearCreatorCache` / `setMeta`
- 根拠: 削除を `put({ key, value: undefined })` で行うため、`meta` ストアに空レコードが残る。
- 影響: `creatorsCount` などの判定は `undefined` チェックで通るが、容量と一覧の見通しが悪くなる。
- 修正案: `delete` を使うヘルパー(`deleteMeta`)を追加する。

## [低] 既読操作の失敗が未処理 rejection になる
- 分類: 正確性
- 場所: `src/pages/FavoritesPage.tsx` の `markRead` / `markAllRead`
- 根拠: `setSeen` の reject を捕捉していない。`markAllRead` は全件を逐次 await する。
- 影響: IndexedDB 障害時にボタンが無反応のまま、ログにだけ unhandled rejection が残る。件数が多いと完了まで待たされる。
- 修正案: `try/catch` で結果を表示し、書き込みは 1 トランザクションにまとめる。
