# フロントエンド モジュールリファレンス

`src/` 配下の TypeScript モジュール全 82 ファイルの関数・定数・型・フックの一覧です。対象は `.ts` / `.tsx` のみで、`src-tauri/`(Rust)は扱いません。Tauri コマンドの引数仕様は [API.md](../API.md)、ビルドと検証手順は [DEVELOPMENT.md](../DEVELOPMENT.md)、層の設計意図は [design/application.md](../architecture/application.md) を参照してください。

- 数え方: `^\s*export ` の grep では 289 行(複数行宣言・再エクスポートを含む)。本文の「278 シンボル」は TypeScript Compiler API(`ts.createSourceFile` → 文単位で `export` 修飾子を判定)で宣言名を列挙した実数。内訳は `export *` の再エクスポート 6 行、`export { MIN_QUERY }` 1 件、`export { isImageFileName, isThumbnailUrl, resolveImageUrl }` 3 件、`export type { CreatorRow }` 1 件、`export default` 1 件を含む
- 行番号は記載しません(変動が早いため)。パスとシンボル名で参照してください
- 「未確認」はコードを読んだだけでは断定できなかった箇所です

## レイヤ構成と依存方向

| 層 | 場所 | 責務 | 依存してよい相手(境界チェックの許可範囲) |
|---|---|---|---|
| Domain | `src/domain/` | React・Tauri・DOM に依存しない純粋ルール(投稿識別子、Referer、locale 検証) | `domain/` のみ |
| Application | `src/application/` | ユースケース、リポジトリ契約、Composition Root | `domain/`、`application/`(composition 以外)、`types.ts` |
| Infrastructure | `src/infrastructure/` | API・保存ヘルパーを Application の契約へ接続 | Application へは `application/*-repository.ts` のみ可。presentation へは不可 |
| Platform | `src/platform/` | 実行環境の検出、ストレージ、ファイル、ログ、ライフサイクルのアダプター | Tauri API / Web API。`application/` と `infrastructure/` へは不可 |
| lib(共有ロジック) | `src/*.ts` | API クライアント、IndexedDB、i18n、ログ、ルーター、URL 変換などの横断機能 | 制限なし(実際は下位層と platform を利用) |
| Pages | `src/pages/` | 画面単位の状態・取得・描画 | presentation から `infrastructure/` へは不可 |
| Components | `src/components/` | 共有 UI、ナビ、投稿カード、診断 UI | 同上 |

```text
main.tsx / App.tsx / pages / components
        │  application/composition 経由でユースケースを取得
        ▼
   application  ──────►  domain
        ▲
        │ 契約を実装
   infrastructure ─────►  api.ts / db.ts / icons.ts / i18n.ts
        │
        ▼
   platform(contracts → families/desktop | mobile | web → Tauri invoke / Web API)
```

- `lib` は層をまたぐ実装置き場で、`api.ts` が `domain`・`platform`・`db` を、`i18n.ts` が `application/locale-repository`(型のみ)と `domain/locale-validation` を参照します。逆向き(`domain` → `api`)の参照はありません
- 依存方向は `npm run check:boundaries`(`scripts/check-boundaries.mjs`)が検査します。`ts.preProcessFile` で静的インポート・再エクスポート・`import type`・文字列リテラルの動的インポートを抽出し、`ts.resolveModuleName` で解決した先を上表の規則と照合して、違反があれば `Invalid architecture imports:` を出して終了コード 1 にします
- 検査対象は静的な import のみです。計算されたモジュールパス(テンプレートリテラル等)や実行時の効果は検査しません。`npm run build` は `check:boundaries` → `check:locales` → `tsc -b` → `vite build` の順に実行します

## レイヤ別モジュール一覧

| パス | 役割 | 主な依存 |
|---|---|---|
| `src/domain/locale-validation.ts` | 言語 JSON のサイズ・キー・差し込み変数の検証 | なし |
| `src/domain/post-identity.ts` | 投稿識別子の妥当性判定と例外型 | なし |
| `src/domain/post-referer.ts` | 元サービス記事 URL(Referer)の導出 | なし |
| `src/domain/session-account.ts` | session Cookie から `account_id` を復元 | なし |
| `src/domain/backup-secrets.ts` | バックアップ JSON から sessionKey を除く | なし |
| `src/application/composition.ts` | Composition Root。API・リポジトリ・ユースケースの組み立て | infrastructure, api, i18n, platform, build-flags |
| `src/application/creator-index-repository.ts` | クリエイター索引リポジトリの契約と行型 | なし |
| `src/application/creators.ts` | 索引の構築・検索・更新ユースケース | creator-index-repository |
| `src/application/locale-repository.ts` | 言語ファイルのリポジトリ・ピッカー契約 | なし |
| `src/application/locales.ts` | 言語ファイルの追加・取込・書き出し・削除 | locale-repository, domain/locale-validation |
| `src/application/post-detail.ts` | 投稿詳細と改訂履歴・コメントの取得 | types, domain/post-identity |
| `src/application/post-pages.ts` | 投稿一覧のページング(終端判定) | types |
| `src/infrastructure/creator-index-dto.ts` | `GET /creators` の DTO → 索引行の変換 | application/creator-index-repository |
| `src/infrastructure/creator-index-repository.ts` | 索引契約を `db.ts` と `api.ts` で実装 | api, db, Application |
| `src/infrastructure/locale-repository.ts` | `LocaleService` をリポジトリ契約へ適合 | platform/contracts, Application |
| `src/platform/contracts.ts` | プラットフォーム契約の型定義 | platform/environment(型) |
| `src/platform/environment.ts` | UA 判定、レイアウト解決、クリップボード、URL 抽出 | なし(DOM のみ) |
| `src/platform/families/browser.ts` | localStorage / sessionStorage / IndexedDB / clipboard の実装 | platform/contracts |
| `src/platform/families/desktop.ts` | デスクトップ向けサービス束 | native, build-flags, Tauri core |
| `src/platform/families/index.ts` | family アダプターの再エクスポート | desktop, mobile, web |
| `src/platform/families/mobile.ts` | モバイル向けサービス束(戻る・終了・SAF) | native, build-flags, Tauri app/core |
| `src/platform/families/native.ts` | Tauri 共通サービス(API transport / ファイル / locale / ログ) | Tauri core, browser, build-flags |
| `src/platform/families/web.ts` | ブラウザー向けサービス束 | browser, build-flags |
| `src/platform/index.ts` | contracts / runtime / families の再エクスポート | 同層 |
| `src/platform/runtime.ts` | 実行 family の決定とサービスのシングルトン化 | environment, contracts, families |
| `src/App.tsx` | シェル・ルート切替・テーマ・キーボード・戻る操作 | pages, components, api, i18n, router |
| `src/account-action.ts` | アカウントボタンのログイン/ログアウト動作 | api, i18n, router |
| `src/api.ts` | pawchive API、スケジューラ、GET キャッシュ、設定、URL 生成 | domain, infrastructure(型), db, log, platform |
| `src/app-icon.ts` | テーマに応じたランチャーアイコン同期 | platform/runtime, Tauri core |
| `src/backup.ts` | バックアップの生成・検証・復元 | api, follows, db, platform, post-thumbnail-cache |
| `src/build-flags.ts` | `VITE_DEBUG_DIAG` のビルド時定数 | なし |
| `src/db.ts` | クリエイター索引・既読・メタの IndexedDB ヘルパー | application(型), platform/runtime |
| `src/debug-log.ts` | 詳細ログの分割(Full 診断専用) | なし |
| `src/download-status.ts` | 一括保存の進捗共有ストア | なし |
| `src/external-page-diagnostics.ts` | 外部ページ起動の診断トレースと iOS レポート保存 | platform/runtime, version, Tauri |
| `src/external-page.ts` | 外部ページの起動と画像一覧の取り出し | platform/runtime, build-flags, Tauri |
| `src/follows.ts` | フォロー一覧のローカルミラーとアカウント同期 | api, platform/runtime |
| `src/format-date.ts` | ISO 日時の表示整形 | なし |
| `src/history.ts` | 検索履歴(localStorage) | platform/runtime |
| `src/hooks.ts` | debounce、スクロール位置の保存・復元フック | platform/runtime |
| `src/http-user-agent.ts` | UA の選択と Rust への適用 | api, Tauri app/core |
| `src/i18n.ts` | i18next 初期化、外部辞書のスキャンと適用 | i18next, application(型), domain, log |
| `src/icons.ts` | クリエイターアイコンの多段キャッシュ | platform/runtime, log, Tauri core |
| `src/log.ts` | リングバッファログと API 失敗記録 | build-flags, platform/runtime |
| `src/main.tsx` | 起動シーケンス(bootstrap)と React マウント | 各層の初期化関数 |
| `src/native-debug-log.ts` | Full 診断のファイルログ操作 | Tauri core |
| `src/original-post-link.ts` | 元サービス投稿 URL の解析 | なし |
| `src/original-post-navigation.ts` | 元サービス URL からミラー内の投稿を解決 | api, application/composition, domain |
| `src/pkv-probe.ts` | pkv プロトコルの疎通テスト(Full 専用) | platform/runtime |
| `src/post-content.ts` | 本文 HTML のサニタイズと URL 書き換え | api |
| `src/post-download.ts` | 一括保存の対象収集とコマンド呼び出し | post-image-urls, Tauri core |
| `src/post-favorites.ts` | お気に入り投稿 ID の共有キャッシュ | api |
| `src/post-files.ts` | 投稿ファイルの選別(cover.jpeg 判定) | types |
| `src/post-image-urls.ts` | 画像 URL の選別・重複除去(純粋関数) | なし |
| `src/post-thumbnail-cache.ts` | 投稿サムネイルの生成と IndexedDB キャッシュ | api, platform/runtime, Tauri core |
| `src/router.ts` | ハッシュルートの解析と遷移 | react |
| `src/safe-url.ts` | 外部由来 URL の http/https 判定 | なし |
| `src/types.ts` | API / 画面の共有型 | なし |
| `src/version.ts` | アプリ版表示文字列 | なし |
| `src/pages/CreatorPage.tsx` | クリエイター画面(投稿一覧・タグ) | application, components, hooks |
| `src/pages/CreatorsPage.tsx` | クリエイター検索・索引構築画面 | application, components, platform/environment |
| `src/pages/FavoritesPage.tsx` | フォロー一覧と新着、アカウントお気に入り | api, db, follows, components |
| `src/pages/HomePage.tsx` | サイト全体の投稿一覧・検索 | application, components, history |
| `src/pages/LoginPage.tsx` | ログインフォームとセッション保存 | api, follows, router |
| `src/pages/PostPage.tsx` | 投稿詳細(本文・ファイル・保存・改訂・コメント) | application, api, post-*, external-page |
| `src/pages/SettingsPage.tsx` | 設定全般(表示・投稿・言語・接続・データ・キャッシュ・診断) | api, backup, i18n, components |
| `src/components/AppShell.tsx` | 全体レイアウト(レール/ボトムナビ/ヘッダー) | navigation-items, router, account-action |
| `src/components/BottomNavigation.tsx` | モバイル用ボトムナビ(portal 描画) | navigation-items, NavigationRail |
| `src/components/BrowserLink.tsx` | ネイティブ時のみ外部ブラウザーで開くリンク | platform/runtime, Tauri core |
| `src/components/CreatorAvatar.tsx` | アイコン表示と頭文字フォールバック | icons |
| `src/components/CreatorHeader.tsx` | クリエイターのバナー・プロフィール表示 | application, api, format-date |
| `src/components/DeveloperDiagnostics.tsx` | 手動 session 入力・検証 | api |
| `src/components/DeveloperFullDiagnostics.tsx` | Full 診断(ログフォルダ・dump・pkv・iOS) | backup, pkv-probe, external-page-* |
| `src/components/DeveloperLocaleDiagnostics.tsx` | 言語ファイルの CRUD 診断 UI | application, i18n |
| `src/components/DownloadFab.tsx` | 一括保存の常時表示ボタンと進捗パネル | download-status, post-download |
| `src/components/Feedback.tsx` | Spinner / ErrorBox / Empty | i18n |
| `src/components/FollowButton.tsx` | フォロー切替ボタン | follows, db, platform/runtime |
| `src/components/navigation-items.ts` | ナビ項目の定義(パス・ラベル・バッジ) | i18n, NavigationRail(型) |
| `src/components/NavigationRail.tsx` | デスクトップ用左レールとアイコン | navigation-items, router, account-action |
| `src/components/PostGrid.tsx` | 無限スクロール一覧・カード・行 | api, follows, post-favorites, router |
| `src/components/PostThumbnail.tsx` | サムネイル生成画像とフォールバック | api, post-thumbnail-cache |
| `src/components/Toggle.tsx` | オン/オフスイッチ | i18n |

## Domain

### src/domain/locale-validation.ts
外部言語 JSON のサイズ・構造・キー・差し込み変数を検証する純粋ルール。DOM も Tauri も参照しません。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `MAX_LOCALE_BYTES` | `const = 1024 * 1024` | `number` | 言語ファイルの上限(1 MiB) | なし |
| `LocaleDict` | `type = Record<string, string>` | — | 平坦キーの辞書 | なし |
| `LocaleIssue` | `{ kind: "json" \| "size" \| "empty" } \| { kind: "value" \| "unknown" \| "missing" \| "variables"; key: string }` | — | 検証で返す問題の種別 | なし |
| `validateLocale` | `(text: string, reference?: LocaleDict, complete = false)` | `{ dictionary: LocaleDict; issues: [] } \| { dictionary: null; issues: LocaleIssue[] }` | JSON を検証し、問題が無ければ辞書を返す | なし |

- 内部: `variables(text)` は `{{ name }}` 形式の補間名を整列した JSON 文字列にし、参照辞書との一致比較に使います。`exceedsUtf8Limit(text)` はコードポイントから UTF-8 バイト数を概算します。型 `Validation` は非公開
- 失敗時: throw しません。サイズ超過は `size`、JSON 不正・配列・10,000 キー超は `json`、値が文字列でない/空/10,000 文字超は `value`、参照辞書に無いキーと `__proto__` 等は `unknown`、`locale.name`(complete 時は参照辞書の全キー)の欠落は `missing`、有効キー 2 件未満は `empty` を返します

### src/domain/post-identity.ts
投稿識別子(service / creatorId / postId)の妥当性判定と、専用の例外型。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `PostContext` | `interface { service: string; creatorId: string; postId: string }` | — | 投稿を指す最小の文脈 | なし |
| `isValidPostContext` | `(context: PostContext)` | `boolean` | `service` が `fanbox`/`patreon` かつ ID が非空・`undefined`/`null` 文字列でない・`/` を含まない | なし |
| `InvalidPostContextError` | `class extends Error`、`constructor(message: string)`、`readonly code = "invalid-post-context"` | — | 不正な識別子を表す例外 | なし |

- 内部: `isValidId(value)` が ID 単体の判定を行います
- 失敗時: 判定関数は throw せず boolean を返します。`InvalidPostContextError` は生成側(`api.postRevisions`、`application/post-detail`)が throw します

### src/domain/post-referer.ts
元サービス(FANBOX / Patreon)の記事 URL を service / postId / slug から導出します。pkv プロキシの Referer に使用します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `normalizeFanboxSlug` | `(value?: string \| null)` | `string` | 前後空白除去・小文字化・先頭 `@` 除去。空・`www`・`[a-z0-9_-]` 以外は空文字 | なし |
| `originalPostReferer` | `(service: string, postId: string, fanboxSlug?: string \| null)` | `string \| undefined` | patreon は `https://www.patreon.com/posts/{id}`、fanbox は slug があれば `https://www.fanbox.cc/@{slug}/posts/{id}`、無ければ `/posts/{id}`、未対応 service は `undefined` | なし |

### src/domain/session-account.ts
pawchive の session Cookie から `account_id` を取り出します。ログイン画面を経由せずに session だけが復元された場合のアカウント表示に使います。ドメイン層の制約に合わせ、`atob` を使わず base64url を自前で復号します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `accountIdFromSession` | `(sessionKey: string)` | `string \| null` | `<base64url(JSON)>.<timestamp>.<signature>` の先頭要素を復号し、JSON の `account_id` を返す。数値は文字列化、文字列は trim。形式不正・`account_id` なしは `null` | なし |

- 内部: `decodeBase64Url(value)` は base64url を ASCII 文字列へ復号し、不正文字・長さ不正は `null`

### src/domain/backup-secrets.ts
バックアップ JSON をクリップボードへ渡すときの整形です。sessionKey は資格情報のため、クリップボードには含めません。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `stripSessionFromBackup` | `(json: string)` | `string` | JSON を解析して `settings.sessionKey` を削除し、再シリアライズする。解析できない・settings が無い場合は元の文字列 | なし |

## Application

### src/application/composition.ts
Composition Root。プラットフォームサービスと API をユースケースへ注入し、シングルトンとして保持します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `initializeApplication` | `()` | `void` | 未初期化時のみ `createApplication()` を実行(`??=`) | モジュール変数の初期化 |
| `getApplication` | `()` | `ReturnType<typeof createApplication>` | 初期化済みのユースケース束を返す | なし |

- 返す束: `creators`、`loadCreatorPosts`、`loadCreatorProfile`、`loadCreatorTags`、`loadOriginalCreatorUrl`、`loadHomePosts`、`postDetail`、`locales`(`DEBUG_DIAG` 時のみ。それ以外は `undefined`)、`exportLocaleToFolder`、`refreshLocales`
- 内部: `createApplication()` が `getPlatformRuntime().services` から `locale`/`localePicker` を取り、`api`・`log*`・`apiStatus`・`validateExternalLocale` を配線します
- 失敗時: `getApplication()` は未初期化なら `Error("Application has not been initialized")` を throw します(`main.tsx` の bootstrap 順序違反を早期検出)

### src/application/creator-index-repository.ts
クリエイター索引リポジトリの契約と索引行の型。実装は `infrastructure/creator-index-repository.ts`。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `CreatorRow` | `interface { key: string; id: string; service: string; name: string; nameLower: string; publicId?: string; publicIdLower?: string; favorited?: number; updated?: number; indexed?: number }` | — | 索引 1 行。`key` は `service:id` | なし |
| `CreatorIndexRepository` | `interface` で `count()` / `isCurrent()` / `search(query, limit)` / `legacyRows()` / `fetchRows()` / `save(rows)` / `resetIndex()` / `clearApiCache()` | 各 `Promise` | 索引の保存・検索・移行元取得の契約 | 宣言のみ |

### src/application/creators.ts
索引の検索・構築・再構築ユースケース。`AbortSignal` は協調的キャンセルで、`throwIfAborted()` を書き込み前に呼びます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `createCreatorUseCases` | `(repository: CreatorIndexRepository)` | `{ countCreators; searchCreatorIndex; needsCreatorIndexBuild; buildCreatorIndex; refreshCreatorIndex }` | 索引ユースケースを組み立てる | なし |
| ↳ `countCreators` | `repository.count` | `Promise<number>` | 索引件数 | IndexedDB 読み取り |
| ↳ `searchCreatorIndex` | `(value: string)` | `Promise<{ rows: CreatorRow[]; postLink: { service; creatorId; postId; name } \| null }>` | 上限 100000 件で検索し、投稿 URL 入力時は先頭行から投稿リンクを構成 | IndexedDB 読み取り |
| ↳ `needsCreatorIndexBuild` | `(count: number)` | `Promise<boolean>` | 件数 0 または索引バージョン不一致で true | IndexedDB 読み取り |
| ↳ `buildCreatorIndex` | `(count: number, signal?: AbortSignal)` | `Promise<number>` | 旧行が slug / updated を全て持てばパック再保存、無ければ API から取得 | HTTP, IndexedDB 書き込み |
| ↳ `refreshCreatorIndex` | `(signal?: AbortSignal)` | `Promise<number>` | API キャッシュと索引を捨てて再取得 | HTTP, IndexedDB 書き込み, GET キャッシュ消去 |

- 内部: `downloadIndex(signal)` が `fetchRows()` → `save()` を行い件数を返します
- 失敗時: リポジトリの例外をそのまま伝播します(握りつぶしなし)。中断時は `AbortError` を throw

### src/application/locale-repository.ts
言語ファイルのリポジトリ契約とファイルピッカー契約。実装は `platform` のサービスと `infrastructure/locale-repository.ts`。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `LocaleCatalogue` | `interface { dir: string; files: { code; json }[]; invalid: string[] }` | — | 走査結果(有効ファイルと不正ファイル名) | なし |
| `LocaleRepository` | `interface`(`listPrivate`、任意で `listSecondary` / `exportToFolder` / `writePrivate` / `writeSecondary` / `deletePrivate`) | 各 `Promise` | 言語ファイルの読み書き契約。任意メソッドは対応環境のみ | 宣言のみ |
| `LocaleFileSelection` | `interface { open(); save(code, json); saveToAppDirectory?(code, json) }` | `JsonOpenResult` / `FileSaveResult` | ピッカー契約 | 宣言のみ |

### src/application/locales.ts
言語ファイルの追加・一括取込・ピッカー経由の入出力・削除。部分成功を返すのが特徴です。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `exportPrivateLocaleToFolder` | `(repository: LocaleRepository \| undefined, code: string, validate: (json: string) => LocaleIssue[])` | `Promise<boolean>` | アプリ専用辞書を追加フォルダーへ書き出す。未対応・不正なら false | ファイル書き込み |
| `createLocaleUseCases` | `(repository: LocaleRepository \| undefined, validate, picker?: LocaleFileSelection)` | 下記メソッド束 | 言語ユースケースを組み立てる | なし |
| ↳ `addLocale` | `(rawCode: string, json: string)` | `Promise<{kind:"saved";code} \| {kind:"invalid-code"} \| {kind:"invalid-json";issues}>` | コード検証 → JSON 検証 → アプリ専用へ書き込み | ファイル書き込み |
| ↳ `importLocaleFiles` | `(files: Iterable<Pick<File,"name"\|"size"\|"text">>, target: "private" \| "secondary")` | `Promise<{kind:"completed";imported:number;failures:ImportFailure[]} \| {kind:"unavailable"}>` | 1 件ずつ検証し、成功・失敗を集計 | ファイル読み書き |
| ↳ `canPickLocale` | `boolean` | `boolean` | ピッカー有無 | なし |
| ↳ `canSaveLocaleToAppDirectory` | `boolean` | `boolean` | アプリ専用保存の可否 | なし |
| ↳ `pickLocale` | `()` | `Promise<{kind:"cancelled"} \| {kind:"invalid-code"} \| {kind:"invalid-json";issues} \| {kind:"conflict";code;json} \| {kind:"saved";code}>` | ファイル選択 → 検証 → 同名衝突判定 → 書き込み | ファイル読み書き |
| ↳ `exportPrivateLocale` | `(code: string, destination: "picker" \| "app" = "picker")` | `Promise<{kind:"missing"} \| {kind:"invalid-json";issues} \| FileSaveResult>` | 既存辞書を別名保存 | ファイル書き込み |
| ↳ `deleteLocale` | `(code: string)` | `Promise<boolean>` | アプリ専用辞書を削除 | ファイル削除 |

- 内部: `LOCALE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/`、型 `LocaleFile` / `ImportFailure`
- 失敗時: サービス未対応は `throw new Error("Locale service unavailable")` 等。`importLocaleFiles` は `write` の例外を `{reason:"write"}` として集計し、全体は throw しません。`pickLocale` は既存確認が取れない場合のみ throw

### src/application/post-detail.ts
投稿詳細・改訂履歴・コメントの取得。改訂履歴の失敗は投稿本体と分離して返します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `createPostDetailUseCases` | `(deps: Dependencies)` | `{ loadPostDetail; loadPostComments }` | `Dependencies` は `post` / `postRevisions` / `postComments` / `status` / `info` / `warn` / `error` | なし |
| ↳ `loadPostDetail` | `(context: PostContext, signal?: AbortSignal)` | `Promise<{ post: PawPost; revisions: PawRevision[]; revisionsError: unknown }>` | 識別子検証 → 詳細取得 → 応答識別子の照合ログ → 改訂履歴を新しい順に整列 | HTTP, ログ出力 |
| ↳ `loadPostComments` | `({ service, creatorId, postId }: PostContext)` | `Promise<PawComment[]>` | コメント取得。失敗は空配列 | HTTP |

- 失敗時: 識別子不正は `logError` のうえ `InvalidPostContextError` を throw。改訂履歴は 404 を「改訂なし」(`revisions: []`, `revisionsError: null`)として扱い、それ以外は `revisionsError` に載せて返します(throw しない)。コメントは全失敗を空配列に握りつぶします

### src/application/post-pages.ts
投稿一覧のページサイズと終端判定。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `POST_PAGE_SIZE` | `const = 50` | `number` | 1 ページの件数 | なし |
| `createHomePostUseCase` | `(posts: (options: { q?: string; o: number }) => Promise<PawPost[]>)` | `({ query, offset }) => Promise<{ posts: PawPost[]; done: boolean }>` | サイト全体の投稿一覧 | HTTP |
| `createCreatorPostUseCase` | `(posts: (service, id, options: { tag?: string[]; o: number }) => Promise<PawPost[]>)` | `({ service, id, tags, offset }) => Promise<{ posts; done }>` | クリエイター投稿一覧。タグ空配列は `undefined` に落とす | HTTP |

- 内部: `postPage(posts)` が `done = posts.length < POST_PAGE_SIZE` を付与します
- 失敗時: API の例外をそのまま伝播します

## Infrastructure

### src/infrastructure/creator-index-dto.ts
`GET /creators` のワイヤ表現を索引行へ変換します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `CreatorIndexDto` | `interface { service: string; id: string; name: string; public_id?: string; favorited?: number; updated?: number \| string; indexed?: number \| string }` | — | API 応答 1 件 | なし |
| `toCreatorIndexRows` | `(creators: CreatorIndexDto[])` | `CreatorRow[]` | slug を小文字化して `publicIdLower` を付与。日時は比較用数値へ | なし |

- 内部: `toTimestamp(value)` は数値優先、失敗時 `Date.parse`、最終的に 0。`toRow(c)` が 1 件変換
- 失敗時: throw しません。日時不正は 0、slug 無しはフィールド省略

### src/infrastructure/creator-index-repository.ts
索引契約を `db.ts`(保存・検索・メタ)と `api.ts`(取得・キャッシュ消去)で実装します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `creatorIndexRepository` | `const: CreatorIndexRepository` | `CreatorIndexRepository` | `count`=`creatorsCount`、`isCurrent`=`creatorsIndexVersion` と `SEARCH_INDEX_VERSION` の一致、`search` は `searchCreators` + `normalizeCreatorQuery`、`legacyRows`=`getAllCreatorRows`、`fetchRows`=`api.creators()` の変換、`save`=`saveCreators`、`resetIndex`=`invalidateCreatorIndex`、`clearApiCache`=`api.clearApiCache` | IndexedDB, HTTP |

### src/infrastructure/locale-repository.ts
プラットフォームの `LocaleService` をアプリケーション契約へ適合させます(メソッドの bind のみ)。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `createLocaleRepository` | `(service: LocaleService \| undefined)` | `LocaleRepository \| undefined` | サービス未提供なら `undefined`。`listPrivate`←`listExternal`、`listSecondary`・`exportToFolder`・`writePrivate`・`writeSecondary`・`deletePrivate` を対応メソッドへ束縛 | なし(呼び出し時にファイル入出力) |

## Platform

### src/platform/contracts.ts
OS 実装を差し替えるための契約型。実装は `families/*` が注入します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `PlatformFamily` | `type = "desktop" \| "mobile" \| "web"` | — | アダプター系統 | なし |
| `PlatformDescriptor` | `interface { family: PlatformFamily; os: PlatformType; isNative: boolean }` | — | 実行環境の記述 | なし |
| `KeyValueStorage` | `interface { get; set; remove }` | `string \| null` など | localStorage 抽象 | 宣言のみ |
| `StorageArea` | `type = "primary-private" \| "secondary-accessible"` | — | 保存領域の種別 | なし |
| `StorageLocationService` | `interface { resolve(area, purpose) }` | `Promise<string \| null>` | ネイティブ側のパス解決 | 宣言のみ |
| `LocaleFileSet` | `interface { dir: string; files: { code; json }[]; invalid: string[] }` | — | 言語ファイル走査結果 | なし |
| `LocaleService` | `interface`(`listExternal`、任意で `listSecondary` / `writeSecondary` / `exportToFolder` / `write` / `delete`) | 各 `Promise` | 言語ファイルサービス | 宣言のみ |
| `JsonPurpose` | `type = "locale" \| "backup"` | — | JSON ピッカーの用途 | なし |
| `JsonOpenResult` | `{ kind: "cancelled" } \| { kind: "selected"; name: string; json: string }` | — | ファイル選択結果 | なし |
| `FileSaveResult` | `{ kind: "cancelled" } \| { kind: "saved"; path?: string }` | — | 保存結果 | なし |
| `UserFilePicker` | `interface { open(purpose); save(purpose, filename, text); appDirectory? }` | 上記結果型 | OS のファイルピッカー | 宣言のみ |
| `LocalePicker` | `interface { open(); save(code, json); saveToAppDirectory? }` | 上記結果型 | 言語専用ピッカー | 宣言のみ |
| `FileExportService` | `interface { exportText(filename, content) }` | `Promise<string>` | Web のダウンロード代替 | 宣言のみ |
| `ClipboardService` | `interface { readText(); writeText(text) }` | `Promise<string \| null>` / `Promise<boolean>` | クリップボード | 宣言のみ |
| `LifecycleService` | `interface { onBackRequested(handler); exit() }` | 解除関数 / `Promise<void>` | 戻る・終了 | 宣言のみ |
| `LoggingService` | `interface { append(line: string): void }` | `void` | ファイルログ追記 | 宣言のみ |
| `PermissionService` | `interface { request(permission: string) }` | `Promise<boolean>` | 権限要求(現状未使用) | 宣言のみ |
| `IndexedDatabaseService` | `interface { open(name, version, upgrade) }` | `Promise<IDBDatabase>` | IndexedDB を差し替え可能にする | 宣言のみ |
| `PawchiveApiRequest` | `interface { path; method; sessionKey: string \| null; timeoutSecs: number \| null }` | — | API transport の入力 | なし |
| `PawchiveApiTransport` | `interface { request(request) }` | `Promise<string>` | API transport 契約 | 宣言のみ |
| `SessionStorageService` | `interface { get; set; remove }` | — | sessionStorage 抽象 | 宣言のみ |
| `PlatformServices` | `interface`(すべて optional: `indexedDatabase` / `sessionStorage` / `storage` / `storageLocations` / `network` / `logging` / `files` / `locale` / `userFiles` / `localePicker` / `clipboard` / `lifecycle` / `permissions`) | — | サービス束 | なし |
| `PlatformRuntime` | `interface { descriptor: PlatformDescriptor; services: PlatformServices }` | — | 実行時コンテキスト | なし |

### src/platform/environment.ts
UA からの環境判定、レイアウト解決、クリップボード読み取り、テキストからのクリエイター抽出。DOM 以外に依存しません。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `PlatformType` | `type = "android" \| "windows" \| "macos" \| "linux" \| "ios" \| "unknown"` | — | OS 種別 | なし |
| `LayoutMode` | `type = "auto" \| "desktop" \| "mobile"` | — | 設定値 | なし |
| `ResolvedLayout` | `type = "desktop" \| "mobile"` | — | 実際に適用するレイアウト | なし |
| `getPlatform` | `()` | `PlatformType` | `navigator.userAgent` から判定。iPadOS は Macintosh + maxTouchPoints>1 で iOS | なし |
| `isMobile` | `()` | `boolean` | android / ios 判定 | なし |
| `isDesktop` | `()` | `boolean` | `!isMobile()` | なし |
| `getPlatformName` | `()` | `string` | 表示名(`Web / Unknown` を含む) | なし |
| `resolveLayout` | `(mode: LayoutMode, windowWidth: number)` | `ResolvedLayout` | 明示指定を優先。`auto` は幅 768 以上かつデスクトップで desktop | なし |
| `readClipboardTextSafe` | `()` | `Promise<string \| null>` | 前後空白を除いた文字列。不可・拒否は null | クリップボード読み取り |
| `ExtractedCreator` | `interface { service: "fanbox" \| "patreon"; idOrSlug: string; originalUrl: string }` | — | 抽出結果 | なし |
| `extractCreatorFromText` | `(text: string)` | `ExtractedCreator \| null` | FANBOX サブドメイン / `@slug`、Patreon `user?u=` / slug、pawchive クリエイター URL を抽出 | なし |

- 失敗時: `readClipboardTextSafe` は権限拒否・非対応を握りつぶして null。`extractCreatorFromText` は非該当・空入力で null を返し throw しません

### src/platform/families/browser.ts
ブラウザー API の薄い実装。ネイティブ・Web の両アダプターが共有します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `browserStorage` | `(name: "localStorage" \| "sessionStorage")` | `KeyValueStorage \| undefined` | `getItem`/`setItem`/`removeItem` を包む。Storage 取得自体の例外は undefined | localStorage / sessionStorage |
| `indexedDatabase` | `const: IndexedDatabaseService` | — | `open(name, version, upgrade)` を Promise 化。`onblocked` は reject | IndexedDB |
| `clipboard` | `const: ClipboardService` | — | `readText` / `writeText`。失敗は null / false | クリップボード |

- 失敗時: いずれも throw せず `undefined` / reject(`IndexedDB unavailable`、`IndexedDB upgrade blocked`)で表現します

### src/platform/families/desktop.ts
デスクトップ(Windows / macOS / Linux)向けサービス束。`native` を拡張します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `createDesktopServices` | `()` | `PlatformServices` | `createNativeServices()` に `storageLocations.resolve` を追加。`DEBUG_DIAG` 時のみ `locale.writeSecondary` を `write_secondary_locale_file` で実装 | IPC |

### src/platform/families/index.ts
family アダプターの再エクスポート(`export *` 3 行)。独自シンボルはありません。

### src/platform/families/mobile.ts
モバイル(Android / iOS)向けサービス束。戻る操作・終了・SAF を追加します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `createMobileServices` | `(os?: PlatformDescriptor["os"])` | `PlatformServices` | `storageLocations` は `secondary-accessible` を null、`userFiles.appDirectory` を `pick_json_file` / `save_user_file`(`appDirectory: true`)で実装。`localePicker.saveToAppDirectory` は `DEBUG_DIAG` かつ android/ios のみ。`lifecycle` を追加 | IPC, Tauri app API |

- 内部: `lifecycle` 定数。`onBackButtonPress` の購読解除を返し、登録完了前に解除されたら即 unregister します。`exit` は `exit(0)`
- 失敗時: 戻るリスナー登録失敗は `console.warn` のみ

### src/platform/families/native.ts
Tauri 共通サービス。API transport、ファイル、locale、クリップボード、IndexedDB、ログを提供します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `resolveNativeStorageLocation` | `(area: StorageArea, purpose: "logs" \| "locales" \| "exports" \| "backup" \| "general")` | `Promise<string \| null>` | `resolve_storage_location` の結果。失敗は null | IPC |
| `createNativeServices` | `()` | `PlatformServices`(satisfies) | `indexedDatabase`、`storage`/`sessionStorage`、`network`(`api_request`)、`logging`(DEBUG_DIAG 時のみ動的 import で `debug_append_log`)、`locale`、`userFiles`、`localePicker`(DEBUG_DIAG 時のみ)、`clipboard` | IPC, localStorage, sessionStorage, IndexedDB |

- 内部: `listLocaleFiles(command)` は失敗を null に、`locale` は `list_locale_files` / `list_secondary_locale_files` / `export_locale_to_folder` と DEBUG_DIAG 時の `write_locale_file` / `delete_locale_file`、`userFiles` は `pick_json_file` / `save_user_file`、`localePicker` は `userFiles` を再利用
- 失敗時: `resolveNativeStorageLocation` は `console.warn` して null。`listLocaleFiles` は例外を握りつぶして null。書き込み系は IPC の reject をそのまま伝播

### src/platform/families/web.ts
ブラウザー単体向けのフォールバック束。API transport は提供しません。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `createWebServices` | `()` | `PlatformServices` | `indexedDatabase`、`storage`、`sessionStorage`、`lifecycle`、`files`、`locale`、`clipboard` | localStorage, sessionStorage, IndexedDB, ダウンロード |

- 内部: `files.exportText` は Blob + `<a download>` で保存し、URL を 1 秒後に revoke。`locale.listExternal` は常に null、DEBUG_DIAG 時のみ `write` が throw、`delete` が false。`lifecycle.onBackRequested` は何もしない解除関数、`exit` は throw
- 失敗時: `exit` は `Error("Exit is not supported by the browser platform adapter")` を throw

### src/platform/index.ts
`contracts` / `runtime` / `families` の再エクスポート(`export *` 3 行)。

### src/platform/runtime.ts
実行 family を 1 度だけ決定し、サービス束をシングルトン化します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `initializePlatformRuntime` | `()` | `PlatformRuntime` | 既に初期化済みならそれを返す。`__TAURI_INTERNALS__` の有無で native 判定し、native なら mobile/desktop、非 native は web | モジュール変数の初期化 |
| `getPlatformRuntime` | `()` | `PlatformRuntime` | 初期化済み runtime を返す | なし |
| `resetPlatformRuntimeForTests` | `()` | `void` | runtime を null に戻す(テスト専用) | モジュール変数の消去 |

- 内部: `isNativeRuntime()`、`createFamilyServices(family, os)`、モジュール変数 `runtime`
- 失敗時: `getPlatformRuntime()` は未初期化なら `Error("Platform runtime has not been initialized")` を throw

## lib(src/ 直下)

### src/App.tsx
アプリシェル。ルート切替、テーマ・アイコン・言語の反映、キーボードショートカット、戻る操作、フォロー数の購読を行います。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `App`(default export) | `()` | `JSX.Element` | `useRoute()` の `path` でページを出し分け、`AppShell` で包む | イベント購読, テーマ属性, アイコン同期, 言語適用, スクロール復帰 |

- 依存: `HomePage` / `CreatorsPage` / `CreatorPage` / `PostPage` / `FavoritesPage` / `SettingsPage` / `LoginPage`、`AppShell`、`DownloadFab`、`ErrorBox`
- 副作用の詳細: `resize`(幅 768 判定)、`pawkemo-settings-changed`、`pawkemo-follows-changed`、`keydown`(Esc・Ctrl/Cmd+K・`/`・H/C/F/S)、`lifecycle.onBackRequested`、`settings.theme` 変更時の `syncAppIcon`、`settings.locale` 変更時の `loadLocale`、`settings.sessionKey` 変更時の `syncFollowsWithAccount`
- 失敗時: フォロー同期と言語適用の reject は握りつぶし(次回起動・次回表示で再試行)。`lifecycle.exit()` の reject も無視

### src/account-action.ts
アカウントボタンの動作。未ログインならログイン画面へ、ログイン済みなら確認のうえセッションを消します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `activateAccount` | `(next?: string)` | `void` | `sessionKey` 無しは `/login?next=` へ遷移。有りは `confirm` 後に `updateSettings({ sessionKey: "" })` | 遷移, 設定保存, 確認ダイアログ |

### src/api.ts
pawchive API クライアント。同時実行 3・開始間隔 250ms のスケジューラ、GET 60 秒キャッシュ(150 件上限)、設定の保存、URL 生成、pkv プロキシ変換を担います。コマンド仕様は [API.md](../API.md) を参照。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `Settings` | `interface`(sessionKey / accountId / theme / layoutMode / noImageMode / thumbnailCacheLimit / postViewMode / timeoutSecs / proxyImages / postFileListMode / userAgentMode / excludeFanboxCover / excludeAiPosts / developerToolsEnabled / locale) | — | アプリ設定。既定値は `defaultSettings()` | なし |
| `SETTINGS_CHANGED_EVENT` | `const = "pawkemo-settings-changed"` | `string` | 設定変更通知のイベント名 | なし |
| `loadSettings` | `()` | `Settings` | `pawkemo-settings` を読み、既定値にマージ | localStorage 読み取り |
| `saveSettings` | `(s: Settings)` | `void` | 設定を JSON で保存 | localStorage 書き込み |
| `initializeSettingsStorage` | `()` | `void` | runtime 初期化後に設定を読み直す。`sessionKey` があり `accountId` が空なら `accountIdFromSession` で復元して保存する | localStorage 読み取り / 書き込み |
| `getSettings` | `()` | `Settings` | モジュール変数の設定を返す | なし |
| `updateSettings` | `(patch: Partial<Settings>)` | `void` | マージして保存。`sessionKey` 変更時は `accountId` を patch 値 → session の `account_id` → `""` の順で決め、`clearApiCache()` | localStorage 書き込み, GET キャッシュ消去, イベント発火 |
| `clearApiCache` | `()` | `void` | 世代番号を進めて GET キャッシュを全消去 | キャッシュ消去 |
| `ApiError` | `class extends Error`、`constructor(status: number, message: string)`、`status: number` | — | IPC 失敗を包む例外。Rust は常に `STATUS=...` 文字列を返すため `status` は 500 | なし |
| `apiStatus` | `(err: unknown)` | `number \| null` | メッセージの `STATUS=(\d+)` から実ステータスを復元 | なし |
| `api` | `const`(オブジェクト) | 下記メソッド | エンドポイント束 | 下記 |
| ↳ `api.posts` | `(opts: { q?: string; o?: number } = {})` | `Promise<PawPost[]>` | `/posts`。`excludeAiPosts` 時は `hide=(ai)` | HTTP(GET キャッシュ) |
| ↳ `api.creators` | `()` | `Promise<CreatorIndexDto[]>` | `/creators` | HTTP(GET キャッシュ) |
| ↳ `api.creatorPosts` | `(service: string, creatorId: string, opts: { q?: string; tag?: string[]; o?: number } = {})` | `Promise<PawPost[]>` | `/{service}/user/{id}`。`tag` は複数付与 | HTTP(GET キャッシュ) |
| ↳ `api.creatorProfile` | `(service: string, creatorId: string)` | `Promise<PawCreator>` | `/profile` | HTTP |
| ↳ `api.creatorTags` | `(service: string, creatorId: string)` | `Promise<PawTag[]>` | `/tags` | HTTP |
| ↳ `api.creatorAnnouncements` | `(service: string, creatorId: string)` | `Promise<PawAnnouncement[]>` | `/announcements` | HTTP |
| ↳ `api.post` | `(service: string, creatorId: string, postId: string)` | `Promise<PawPost>` | 投稿詳細 | HTTP |
| ↳ `api.postRevisions` | `(service, creatorId, postId)` | `Promise<PawRevision[]>` | 改訂履歴。識別子不正は reject | HTTP |
| ↳ `api.postComments` | `(service, creatorId, postId)` | `Promise<PawComment[]>` | コメント | HTTP |
| ↳ `api.searchHash` | `(hash: string)` | `Promise<HashLookupResult>` | `/search_hash/{hash}` | HTTP |
| ↳ `api.accountFavorites` | `(type: "post" \| "artist", sessionKey = getSettings().sessionKey, useCache = sessionKey === getSettings().sessionKey)` | `Promise<AccountFavorite[]>` | 認証必須。未保存の session で疎通確認も可 | HTTP |
| ↳ `api.favPostAdd` / `favPostRemove` | `(service, creatorId, postId)` | `Promise<void>` | `/favorites/post/...` の POST / DELETE | HTTP |
| ↳ `api.favCreatorAdd` / `favCreatorRemove` | `(service, creatorId)` | `Promise<void>` | `/favorites/creator/...` の POST / DELETE | HTTP |
| ↳ `api.flagPost` | `(service, creatorId, postId)` | `Promise<void>` | re-import 申請の POST | HTTP |
| ↳ `api.version` | `()` | `Promise<string>` | `/app_version` | HTTP |
| ↳ `api.originalPostUrl` | `(service, creatorId, postId)` | `Promise<string \| null>` | 元サービス投稿 URL。fanbox は索引の slug が必要 | IndexedDB 読み取り |
| ↳ `api.originalCreatorUrl` | `(service, creatorId)` | `Promise<string \| null>` | 元サービスのクリエイターページ URL | IndexedDB 読み取り |
| `normalizeTags` | `(v: unknown)` | `string[]` | 配列 / JSON 文字列 / PostgreSQL 配列リテラルを配列化 | なし |
| `directFileUrl` | `(f: PawFile \| undefined)` | `string` | プロキシ変換前の URL。`temp_download_url` 優先、`server` 既定 `https://n1.pawchive.pw` | なし |
| `fileUrl` | `(f: PawFile \| undefined, service?: string, postId?: string, refererUrl?: string)` | `string` | `proxyFileUrl(directFileUrl(f), ...)` | 設定読み取り |
| `thumbUrl` | `(f: PawFile \| undefined)` | `string` | `https://img.pawchive.pw/thumbnail/data{path}` | なし |
| `isVideoFile` | `(f: PawFile \| undefined)` | `boolean` | 拡張子判定。`deferred` は `name`/`temp_url` を見る | なし |
| `postUrl` | `(service: string, userId: string, postId: string)` | `string` | `https://pawchive.pw/{service}/user/{userId}/post/{postId}` | なし |
| `proxyFileUrl` | `(url: string, service?: string, postId?: string, refererUrl?: string)` | `string` | ホットリンク対策ホストを `pkv` 経由へ。pawchive / localhost / `proxyImages=false` は素通し | 設定読み取り |
| `creatorUrl` | `(service: string, userId: string)` | `string` | pawchive のクリエイターページ URL | なし |
| `creatorIconUrl` | `(service: string, userId: string)` | `string` | `https://pawchive.pw/icons/...`(無ければ 204) | なし |
| `creatorBannerUrl` | `(service: string, userId: string)` | `string` | `https://pawchive.pw/banners/...`(無ければ 204) | なし |

- 内部: `SETTINGS_KEY = "pawkemo-settings"`、`defaultSettings()`、`settingsStorage()`、`request<T>()`、`scheduled<T>()`、`pump()`、`cacheGet` / `cachePut`、`fanboxSlug()`、`isHotlinkHost` / `isPawchiveHost` / `isLocalHost`、`pkvBaseUrl` / `proxyReferer` / `pkvProxyUrl`、定数 `MAX_CONCURRENT=3` / `MIN_GAP_MS=250` / `CACHE_TTL_MS=60000` / `CACHE_MAX=150`、`cacheGeneration`、`getCache`
- 失敗時: transport 未提供は `Error("Pawchive API requires a native runtime")`。transport の失敗は `logApiFailure` に記録してから `new ApiError(500, message)` で throw。GET の失敗はキャッシュに残しません(再試行可能)。JSON でない応答は文字列のまま返します。`pkvBaseUrl` は Windows / Android のみ `http://pkv.localhost/file`、他は `pkv://localhost/file`

### src/app-icon.ts
テーマに合わせてランチャーアイコンを切り替えます。更新は直列化されます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `AppIconTheme` | `type = "light" \| "dark"` | — | アイコンのテーマ | なし |
| `syncAppIcon` | `(theme: AppIconTheme)` | `Promise<void>` | 非ネイティブは何もしない。Android は `set_android_launcher_icon`、他は app-icon プラグインの `is_supported` → `get_name` → `change` / `reset` | IPC |

- 内部: 直列化用の `pending` プロミスチェーン
- 失敗時: 例外は `console.warn("Could not update launcher icon", ...)` で握りつぶし、`pending` は解決済みのまま維持します

### src/backup.ts
設定・フォロー・既読のバックアップ生成、検証、復元。`sessionKey` も復元対象に含みます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `BACKUP_TYPE` | `const = "pawkemoviewer-backup"` | `string` | 形式識別子 | なし |
| `MAX_BACKUP_BYTES` | `const = 5 * 1024 * 1024` | `number` | 上限 5 MiB | なし |
| `BackupData` | `interface { type; version; exportedAt; settings: Settings; follows: FollowEntry[]; seen: SeenEntry[] }` | — | バックアップ構造 | なし |
| `buildBackup` | `()` | `Promise<string>` | 現在の設定・フォロー・既読を整形 JSON 化 | IndexedDB 読み取り |
| `parseBackup` | `(text: string)` | `BackupData` | サイズ・型・バージョン(1〜1)・配列長(10 万)・settings の型を検証 | なし |
| `applyBackup` | `(text: string)` | `Promise<{ follows: number; seen: number; settings: boolean }>` | 既読を先に一括置換し、成功後にフォローと設定を適用 | IndexedDB 書き込み, localStorage 書き込み, 設定イベント, サムネイル整理 |

- 内部: `BACKUP_VERSION = 1`、`validators`(設定キーごとの検証関数)
- 失敗時: `parseBackup` は日本語メッセージで throw(サイズ超過・JSON 不正・別形式・未対応版・型不正)。`applyBackup` は storage 未提供で `Error("Follow storage unavailable")`、`replaceSeen` の失敗はそのまま伝播しフォローを変更しません。設定は検証を通ったキーだけ適用し、`thumbnailCacheLimit` 変更時は `trimThumbnailCache()` を待ちます

### src/build-flags.ts
ビルド時フラグ。リリースビルドでは定数畳み込みで診断分岐ごと除去されます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `DEBUG_DIAG` | `const = import.meta.env.VITE_DEBUG_DIAG === "1"` | `boolean` | Full 診断の有効化 | なし |

### src/db.ts
IndexedDB(`pawkemoviewer` v1、stores: `creators` / `seen` / `meta`)のヘルパー。クリエイター索引は 1 レコードのパック文字列、既読は `service:id` キーで保存します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `CreatorRow`(再エクスポート) | `export type { CreatorRow }` | — | Application の行型を再輸出 | なし |
| `SEARCH_INDEX_VERSION` | `const = 3` | `number` | 索引フォーマット版。現行は 8 フィールド | なし |
| `kanaToRomaji` | `(s: string)` | `string` | クエリのかなをローマ字へ(促音・拗音対応)。漢字・英数はそのまま | なし |
| `invalidateCreatorIndex` | `()` | `void` | メモリ索引を破棄 | メモリ状態 |
| `getAllCreatorRows` | `()` | `Promise<CreatorRow[]>` | 旧 per-row ストアの全行(移行元) | IndexedDB 読み取り |
| `normalizeCreatorQuery` | `(raw: string)` | `{ q: string; service?: string; postId?: string }` | URL 貼り付けから slug / ID / service / postId を抽出 | なし |
| `searchCreators` | `(qRaw: string, limit = 60)` | `Promise<CreatorRow[]>` | 完全一致 → 前方一致 → 部分一致、同順位は人気度順 | IndexedDB 読み取り |
| `saveCreators` | `(rows: CreatorRow[])` | `Promise<void>` | パック文字列とメタ(件数・バイト数・版・取得時刻)を保存し、旧ストアを clear | IndexedDB 書き込み |
| `creatorsCount` | `()` | `Promise<number>` | メタ件数。無ければパック長、最後に旧ストア count | IndexedDB 読み取り |
| `getCreatorRow` | `(key: string)` | `Promise<CreatorRow \| undefined>` | メモリ索引 → 旧ストアの順で 1 行取得 | IndexedDB 読み取り |
| `CreatorCacheInfo` | `interface { count: number; bytes: number; fetchedAt?: number }` | — | 設定画面のキャッシュ表示用 | なし |
| `creatorCacheInfo` | `()` | `Promise<CreatorCacheInfo>` | 件数・バイト数(メタが無ければ Blob サイズ)・取得時刻 | IndexedDB 読み取り |
| `clearCreatorCache` | `()` | `Promise<void>` | パック・メタ・旧ストアを全消去 | IndexedDB 書き込み |
| `setMeta` | `(key: string, value: unknown)` | `Promise<void>` | meta ストアへ put | IndexedDB 書き込み |
| `getMeta<T>` | `(key: string)` | `Promise<T \| undefined>` | meta ストアから get | IndexedDB 読み取り |
| `SeenEntry` | `interface { key: string; lastSeenPostId: string; checkedAt: number; newest?: { id; title?; published? } }` | — | 既読・新着状態 | なし |
| `setSeen` | `(key: string, lastSeenPostId: string, newest?: { id; title?; published? })` | `Promise<void>` | 既読 ID と新着情報を保存 | IndexedDB 書き込み |
| `updateSeenCheck` | `(key: string, newest?: { id; title?; published? })` | `Promise<SeenEntry>` | 既読 ID を保持したままチェック時刻と新着だけ更新 | IndexedDB 書き込み |
| `getSeen` | `(key: string)` | `Promise<SeenEntry \| undefined>` | 1 件取得 | IndexedDB 読み取り |
| `getAllSeen` | `()` | `Promise<SeenEntry[]>` | 全件取得 | IndexedDB 読み取り |
| `deleteSeen` | `(key: string)` | `Promise<void>` | 1 件削除 | IndexedDB 書き込み |
| `replaceSeen` | `(entries: SeenEntry[])` | `Promise<void>` | 全消去して一括投入(復元用) | IndexedDB 書き込み |

- 内部: `openDb()`(失敗時に `dbPromise` を捨てて再試行可能)、`tx<T>()`、`clearCreatorRows()`、`loadIndex()`、`sanitizeField()`、`decodePack()`(7 フィールドの旧 v3 も自動判別)、`encodePack()`、`rankRow()`、`kataToHira()`、`ROMA_BASE` / `ROMA_COMBO`、`PACK_META_KEY="creatorsPack"`、`ROW_SEP="\u001e"` / `FIELD_SEP="\u001f"`
- 失敗時: IndexedDB 未提供は `Error("IndexedDB platform service unavailable")` を reject。`openDb` の失敗はキャッシュを poison せず再試行可。`getCreatorRow` はメモリ索引の例外を握りつぶして旧ストアへフォールバック。`saveCreators` は旧ストア clear の失敗を無視。`setSeen` / `updateSeenCheck` / `replaceSeen` は abort 時に日本語メッセージで reject

### src/debug-log.ts
詳細診断(リクエスト/レスポンス全文)をログ 1 件あたりの長さ制限に合わせて分割します。Full ビルドでのみ動的 import されます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `splitDebugLog` | `(message: string)` | `string[]` | 1800 文字以下はそのまま、超える場合は `[part i/n]` 接頭辞付きで分割 | なし |

### src/download-status.ts
一括保存の進捗を画面横断で共有する小さなストア(`useSyncExternalStore` 用)。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `DownloadPhase` | `type = "idle" \| "running" \| "done" \| "error"` | — | 保存の段階 | なし |
| `DownloadStatus` | `interface { phase; done; total; saved; failed; message; updatedAt }` | — | 進捗スナップショット | なし |
| `getDownloadStatus` | `()` | `DownloadStatus` | 現在値 | なし |
| `subscribeDownloadStatus` | `(listener: () => void)` | `() => void` | 購読と解除関数 | リスナー登録 |
| `startDownload` | `(total: number)` | `void` | `running` に初期化 | リスナー通知 |
| `reportDownloadProgress` | `(done: number, total: number)` | `void` | `running` のときだけ進捗更新 | リスナー通知 |
| `finishDownload` | `(options: { saved; failed; message; cancelled? })` | `void` | 中止または失敗 0 件なら `done`、それ以外は `error` | リスナー通知 |
| `failDownload` | `(message: string)` | `void` | 開始できなかった場合に `error` | リスナー通知 |
| `resetDownloadStatus` | `()` | `void` | 初期値へ戻す | リスナー通知 |

- 内部: `initial` 定数、`update(patch)`、`listeners: Set<() => void>`
- 失敗時: throw しません

### src/external-page-diagnostics.ts
外部ページ起動の診断トレース(メモリ 100 件)と、iOS 向けレポート保存。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `traceExternalPage` | `(event: Event)` | `void` | `事件名` を時刻付きで記録(100 件で古い順に破棄) | メモリ状態 |
| `traceExternalPageError` | `(error: unknown)` | `void` | `"invalid url"` 等の文字列を対応イベントへ変換して記録 | メモリ状態 |
| `probeIOSExternalPage` | `(open: (url: string, referer: string) => Promise<void>)` | `Promise<void>` | `https://example.com/` を FANBOX Referer 付きで開き 8 秒でタイムアウト | IPC(呼び出し先経由) |
| `saveIOSExternalPageReport` | `()` | `Promise<FileSaveResult>` | アプリ版・platform・ネイティブ診断イベントを `external-page-diagnostic.txt` として保存 | IPC |

- 内部: 型 `Event`、`events: string[]`、`withTimeout<T>(promise, ms)`
- 失敗時: `saveIOSExternalPageReport` の `external_page_diagnostic_events` は 3 秒タイムアウト/失敗を `null` にし、`native_diagnostics_unavailable` と記載して保存を続けます。`save_user_file` の失敗は呼び出し元へ伝播

### src/external-page.ts
外部ページをネイティブビューで開き、外部ページ側で選んだ画像一覧を取り出します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `ExternalPageDownload` | `interface { creatorName?; service?; creatorId?; postId?; referer?; pageUrl?; images: string[] }` | — | 外部ページから引き渡される保存対象 | なし |
| `ExternalPageContext` | `interface { creatorName: string; service: string; creatorId: string; postId: string }` | — | 保存先の文脈 | なし |
| `canOpenExternalPage` | `()` | `boolean` | ネイティブかつ OS 判明時のみ true | なし |
| `openExternalPage` | `(url: string, referer: string, context?: ExternalPageContext)` | `Promise<void>` | `open_external_page` を呼ぶ。`DEBUG_DIAG` 時は開始・保留・完了をトレース | IPC |
| `takeExternalPageImages` | `()` | `Promise<ExternalPageDownload \| null>` | `take_external_page_images` の結果。空・非対応・失敗は null | IPC |

- 失敗時: `openExternalPage` は IPC の reject を再 throw(`DEBUG_DIAG` 時は `traceExternalPageError` に記録)。`takeExternalPageImages` は全ての失敗を null に握りつぶします

### src/follows.ts
フォロー一覧のローカルミラー。pawchive アカウントを正とし、初回のみローカル項目を移行します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `FollowEntry` | `interface { service: string; id: string; name: string }` | — | フォロー 1 件 | なし |
| `loadFollows` | `()` | `FollowEntry[]` | 保存済み一覧。不正・失敗は空配列 | localStorage 読み取り |
| `isFollowed` | `(service: string, id: string)` | `boolean` | 一覧を線形検索 | localStorage 読み取り |
| `follow` | `(f: FollowEntry)` | `void` | 重複が無ければ先頭に追加 | localStorage 書き込み, イベント発火 |
| `unfollow` | `(service: string, id: string)` | `void` | 該当を除去 | 同上 |
| `replaceFollows` | `(list: FollowEntry[])` | `void` | 妥当な項目だけ重複除去して一括差し替え(復元用) | 同上 |
| `syncFollowsWithAccount` | `()` | `Promise<number>` | セッション無しは 0。初回はローカル→アカウント移行、以降はアカウント一覧で置換 | HTTP, localStorage 書き込み, イベント発火 |
| `addFollow` | `(f: FollowEntry)` | `Promise<void>` | ログイン中はサーバー追加成功後にローカルへ反映 | HTTP, localStorage 書き込み |
| `removeFollow` | `(service: string, id: string)` | `Promise<void>` | ログイン中はサーバー削除成功後にローカルへ反映 | HTTP, localStorage 書き込み |
| `toggleFollow` | `(f: FollowEntry)` | `boolean` | 同期なしのローカル切替(戻り値は切替後の状態) | localStorage 書き込み |

- 内部: `KEY="pawkemo-follows"`、`CHANGED_EVENT="pawkemo-follows-changed"`、`MIGRATED_KEY="pawkemo-follows-migrated-to-account"`、`syncInFlight`(多重同期の抑止)、`storage()`、`notifyChanged()`、`save(list)`
- 失敗時: storage 未提供は `Error("Follow storage unavailable")`。`syncFollowsWithAccount` は API の reject をそのまま返し、`finally` で `syncInFlight` を解除。移行中の `favCreatorAdd` 失敗も伝播します(`App` 側が握りつぶす)

### src/format-date.ts
ISO 日時を `YYYY-MM-DD` に整形します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `formatDate` | `(iso: string \| undefined)` | `string` | 空は空文字、不正値は先頭 10 文字、例外時は元文字列 | なし |

### src/history.ts
検索履歴(最大 20 件、重複は先頭移動)。Home と Creators で共用します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `getSearchHistory` | `()` | `string[]` | 保存済み履歴。文字列以外は除外 | localStorage 読み取り |
| `addSearchHistory` | `(q: string)` | `void` | 前後空白を除いて追加。空は無視 | localStorage 書き込み |
| `clearSearchHistory` | `()` | `void` | キーを削除 | localStorage 削除 |

- 内部: `KEY="pawkemo-search-history"`、`MAX=20`、`storage()`
- 失敗時: 読み取り・書き込みの例外を握りつぶします(`clearSearchHistory` の `remove` は未保護)

### src/hooks.ts
検索入力の debounce と、スクロール位置の記憶・復元フック。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `useDebounced<T>` | `(value: T, delay = 400)` | `T` | delay 後に反映した値 | タイマー |
| `saveScroll` | `(key: string, y: number)` | `void` | キーごとにスクロール位置を保存 | sessionStorage 書き込み |
| `loadScroll` | `(key: string)` | `number` | 保存値(無ければ 0) | sessionStorage 読み取り |
| `useScrollMemory` | `(key: string, ready: boolean)` | `void` | scroll を rAF で間引き保存し、`ready` 後に 1 度だけ復元。キー変更時は前キーの記憶を削除 | sessionStorage 読み書き, スクロール操作 |

- 内部: `SCROLL_KEY="pawkemo-scroll"`、`readMap()`、型 `ScrollMap`
- 失敗時: 読み書きの例外は無視。`ready` 前は復元しません(unmount 時は記憶を残す)

### src/http-user-agent.ts
外部アクセス用 UA の選択と Rust への適用。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `UserAgentMode` | `type = "device" \| "app" \| "desktop"` | — | 設定値 | なし |
| `deviceUserAgent` | `()` | `string` | `navigator.userAgent`。無ければ固定 Chrome UA | なし |
| `appUserAgent` | `()` | `Promise<string>` | `PawKemoViewer/{version} ({platform})`。version 取得失敗は `0` | Tauri app API |
| `selectedUserAgent` | `()` | `Promise<string>` | 設定に応じて上記を選択 | 設定読み取り |
| `applyHttpUserAgent` | `()` | `Promise<void>` | `set_http_user_agent` に UA を渡す | IPC |

- 内部: `DESKTOP_UA`(Chrome 142 固定)、`platformName()`
- 失敗時: `applyHttpUserAgent` は IPC 失敗を握りつぶし、既定 UA で動作継続。`getVersion` 失敗も無視

### src/i18n.ts
i18next の初期化、同梱辞書(ja 静的 / en 遅延)、外部辞書の走査・検証・適用、言語一覧の提供。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `Locale` | `type = string` | — | 言語コード | なし |
| `LocaleInfo` | `interface { code: string; name: string; external: boolean }` | — | 選択肢 | なし |
| `TranslationKey` | `type = keyof typeof ja` | — | 同梱日本語のキー | なし |
| `validateExternalLocale` | `(text: string)` | `{ dictionary; issues }` | 同梱 ja を参照辞書に `validateLocale` | なし |
| `refreshLocales` | `(repository: LocaleRepository \| undefined)` | `Promise<void>` | アプリ専用 → 追加フォルダーの順に走査し、検証済み辞書を重ねる。外部 ja も反映 | ファイル読み取り, 辞書キャッシュ, ログ |
| `availableLocales` | `()` | `LocaleInfo[]` | 同梱 + 外部 + 追加フォルダーの一覧(ja 先頭) | なし |
| `secondaryLocaleFolder` | `()` | `string` | 追加フォルダーのパス | なし |
| `invalidLocaleFiles` | `()` | `string[]` | 不正ファイル名と問題の要約 | なし |
| `loadLocale` | `(code: Locale)` | `Promise<Locale>` | 辞書を合成して反映。未知・失敗は ja | i18next リソース更新 |
| `t` | `(key: TranslationKey, vars?: Record<string, string \| number>)` | `string` | 翻訳取得 | なし |
| `formatLocaleIssues` | `(issues: LocaleIssue[])` | `string` | 先頭 3 件 + 「他 n 件」の翻訳文 | なし |
| `default` | `i18n` インスタンス | — | 直接利用用 | なし |

- 内部: `BASE_JA`、`BUNDLED_LOADERS`(en)、`BUNDLED_NAMES`、`external` / `secondary` マップ、`secondaryDir`、`invalidFiles`、`dictionaryFor()`、`replaceDictionary()`、`translate`
- 失敗時: `refreshLocales` は `Promise.allSettled` で個別失敗を無視し、不正ファイルは `invalidFiles` と `logWarn` に残します。`loadLocale` は未知コード・読込失敗で `ja` にフォールバックして `"ja"` を返します(throw しない)

### src/icons.ts
クリエイターアイコンの多段キャッシュ(メモリ → IndexedDB `pawkemo-icons` → Rust のディスクキャッシュ)と管理 API。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `getCreatorIcon` | `(service: string, id: string)` | `Promise<string \| null>` | メモリ → IDB → `fetch_creator_icon` の順で取得し全層へ保存。同一キーの並行呼び出しは 1 本化 | IndexedDB 読み書き, IPC |
| `clearIconCache` | `()` | `Promise<number>` | メモリ・IDB・ディスクを消去。戻りはディスク削除件数 | IndexedDB 書き込み, IPC |
| `creatorIconInfo` | `()` | `Promise<{ count: number; bytes: number }>` | ディスクキャッシュの件数・容量 | IPC |
| `iconCacheCount` | `()` | `Promise<number>` | IndexedDB のレコード数 | IndexedDB 読み取り |

- 内部: `DB_NAME="pawkemo-icons"`、`STORE="icons"`、`MAX_ENTRIES=2000`、`memory` / `inflight` マップ、`openDb` / `idbGet` / `idbPut` / `prune` / `db()`、型 `IconRecord { d: string \| null; t: number }`
- 失敗時: IDB 失敗は無視して Rust へ進み、取得失敗は `logError` のうえ null(失敗はキャッシュしない)。`clearIconCache` / `creatorIconInfo` / `iconCacheCount` の IPC・IDB 失敗は 0 や空で返します。204(アイコン無し)は null として `pawkemo-icons` に永続保存し、消去するまで再取得しません(メモリにも保持)。

### src/log.ts
アプリ内リングバッファログ(400 件)と、グローバルエラーの自動記録。Lite は error のみ保持します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `LogEntry` | `interface { ts: number; level: "info" \| "warn" \| "error"; msg: string }` | — | 1 エントリ | なし |
| `logInfo` | `(msg: string)` | `void` | info 追加(DEBUG_DIAG のみ) | リングバッファ, ファイルログ |
| `logWarn` | `(msg: string)` | `void` | warn 追加(DEBUG_DIAG のみ) | 同上 |
| `logError` | `(msg: string)` | `void` | error 追加(常時) | 同上 |
| `logApiFailure` | `(path: string, method: string, message: string)` | `void` | API 失敗の記録。DEBUG_DIAG は詳細を分割記録、Lite は宛先と本文のみ | リングバッファ, ファイルログ |
| `getLogEntries` | `()` | `LogEntry[]` | 古い順のコピー | なし |
| `clearLog` | `()` | `void` | 全消去 | リングバッファ |
| `formatLog` | `()` | `string` | `[YYYY-MM-DD hh:mm:ss] [level] msg` を改行連結 | なし |

- 内部: `MAX_ENTRIES=400`、`MAX_MSG_LEN=2000`、`entries`、`push()`、`formatEntry()`
- 副作用: モジュール読込時に `window` の `error` / `unhandledrejection` を購読し `logError` 相当で記録。DEBUG_DIAG 時は `services.logging.append` へ追記
- 失敗時: ファイルログ追記は try/catch で無視(bootstrap 前を含む)。長すぎるメッセージは 2000 文字 + `…` に切り詰め

### src/main.tsx
起動シーケンス。export はありません。

- 順序: `initializePlatformRuntime()` → `initializeApplication()` → `initializeSettingsStorage()` → `applyHttpUserAgent()` → `getApplication().refreshLocales()` → `loadLocale(getSettings().locale)` → `ReactDOM.createRoot(...).render(<App />)`
- 失敗時: `bootstrap()` の reject は `void` で捨てられ、画面は描画されません(起動順序の失敗は `getApplication` / `getPlatformRuntime` の throw として現れる)

### src/native-debug-log.ts
Full 診断専用のファイルログ操作。製品版には関連コマンドを含めません。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `debugAppendLog` | `(line: string)` | `void` | `debug_append_log` に 1 行追記(戻り値は待たない) | IPC |
| `debugOpenLogFolder` | `()` | `Promise<string>` | `debug_open_log_folder` でログフォルダーを開きパスを返す | IPC |

- 失敗時: `debugAppendLog` は reject を握りつぶし(リングバッファと UI は維持)、`debugOpenLogFolder` は伝播します

### src/original-post-link.ts
FANBOX / Patreon の投稿 URL を解析します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `OriginalPostLink` | `interface { service: "fanbox" \| "patreon"; postId: string; creatorSlug?: string; titleQuery?: string }` | — | 解析結果 | なし |
| `parseOriginalPostLink` | `(href: string)` | `OriginalPostLink \| null` | `//` 始まりは https 補完。認証情報・ポート付きは拒否。fanbox の `@slug` / ベア ID / サブドメイン、patreon の `@slug/posts/title-id` を解釈 | なし |

- 失敗時: `new URL` 失敗・非 http(s)・対象外ホスト・パターン不一致は null

### src/original-post-navigation.ts
元サービス投稿 URL から、ミラー(pawchive)内の投稿コンテキストを解決します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `resolveOriginalPost` | `(link: OriginalPostLink, current: PostContext, label: string)` | `Promise<PostContext \| null>` | slug → 索引 → 全クリエイター一覧の順で creatorId 候補を作り、投稿 API の応答識別子で確定。未確定なら投稿検索を作題語・ラベル・postId で試す | IndexedDB 読み取り, HTTP |

- 失敗時: 各 API 呼び出しを `.catch(() => null / [])` で握りつぶし、解決できなければ null

### src/pkv-probe.ts
Full 診断専用の pkv 疎通テスト。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `pkvProbeUrl` | `(target: string, referer: string)` | `string` | `api.ts` と同じ OS 別形式で `?u=&r=` を組み立てる | なし |
| `probePkvImage` | `(target: string, referer: string, timeoutMs = 20000)` | `Promise<string>` | 画像として読み込み `ok {w}x{h}` / `error` / `timeout` を返す | 画像リクエスト |

- 失敗時: throw しません。全結果を文字列で返します

### src/post-content.ts
投稿本文 HTML の最小サニタイズと、画像・リンクのプロキシ書き換え。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `sanitizePostContent` | `(html: string, service?: string, postId?: string, refererUrl?: string)` | `string` | script / style / 埋め込み / フォームを除去し、`on*` と `srcdoc` を削除。URL 属性は `isSafeHttpUrl` で http/https のみ許可(`javascript:` の難読化も拒否)。画像は `proxyFileUrl` で pkv 化し、外部リンクには元 URL を `data-external-url` に残す | 設定読み取り(`proxyImages`) |

- 失敗時: 空入力は空文字。`DOMParser` はブラウザー前提で、失敗時の try/catch はありません

### src/post-download.ts
一括保存の対象収集と `download_post_images` の呼び出し。詳細は [features/image-download.md](../features/image-download.md)。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `DownloadImage` | `interface { url: string; name?: string }` | — | 保存対象 | なし |
| `DownloadFailure` | `interface { url: string; reason: string }` | — | 失敗 1 件 | なし |
| `DownloadSummary` | `interface { directory: string; saved: number; skipped: number; cancelled: boolean; failed: DownloadFailure[] }` | — | Rust の戻り値 | なし |
| `isImageFileName` / `isThumbnailUrl` / `resolveImageUrl`(再エクスポート) | `post-image-urls.ts` の同名関数 | — | 選別ユーティリティ | なし |
| `collectArticleImages` | `(html: string, baseUrl?: string)` | `DownloadImage[]` | 本文の `img[src]` と画像直リンク `a[href]` を収集 | なし |
| `collectExternalPages` | `(html: string, baseUrl?: string)` | `string[]` | 外部ページ URL(画像リンクは除外、最大 10 件) | なし |
| `collectAttachmentImages` | `(files: { url: string; name?: string }[])` | `DownloadImage[]` | 添付を URL で重複除去 | なし |
| `downloadArticleImages` | `(creatorName, service, creatorId, referer, images, pages, sessionKey?, imageReferer?)` | `Promise<DownloadSummary>` | `download_post_images` を呼ぶ。`sessionKey` / `imageReferer` は空なら null | IPC |
| `cancelImageDownload` | `()` | `Promise<void>` | `cancel_download`(次のファイル取得前に停止) | IPC |

- 失敗時: `DOMParser` 不在環境では空配列。IPC の reject は呼び出し元(`PostPage`)が `failDownload` で表示

### src/post-favorites.ts
アカウントのお気に入り投稿 ID の共有キャッシュ(60 秒)と変更通知。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `FAVORITE_POSTS_CHANGED_EVENT` | `const = "pawkemo-favposts-changed"` | `string` | 変更通知のイベント名 | なし |
| `isFavoritePost` | `(service: string, id: string)` | `boolean` | 未取得時は false | なし |
| `setFavoritePost` | `(service: string, id: string, on: boolean)` | `void` | 楽観的に集合を更新して通知 | イベント発火 |
| `loadFavoritePosts` | `(force = false)` | `void` | セッションがある場合のみ取得。TTL 内・取得中はスキップ | HTTP, イベント発火 |

- 内部: `TTL_MS=60000`、`favoritePostKeys`、`fetchedAt`、`inFlight`、`key()`、`notify()`
- 失敗時: 401 等は無視(マークが出ないだけ)

### src/post-files.ts
投稿ファイルの選別。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `isFanboxCoverFile` | `(f: PawFile)` | `boolean` | `name` または `path` 末尾が `cover.jpeg` | なし |
| `listPostFiles` | `(post: PawPost)` | `PawFile[]` | 本体(`file.path` がある場合)→ 添付の順。cover.jpeg は除外しない | なし |

### src/post-image-urls.ts
画像 URL の選別ロジック(DOM 非依存)。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `isThumbnailUrl` | `(url: URL)` | `boolean` | `img.pawchive.pw` の `/thumbnail/` 配下 | なし |
| `resolveImageUrl` | `(source: string, baseUrl?: string)` | `string \| null` | `data:`/`blob:`/非 http(s)/サムネイル/動画を除外して絶対 URL 化 | なし |
| `collectImageUrls` | `(sources: Iterable<string>, baseUrl?: string)` | `{ url: string }[]` | 重複除去して収集 | なし |
| `isImageFileName` | `(name: string)` | `boolean` | 拡張子で画像判定(`?`/`#` 以降は無視) | なし |
| `isImageFileUrl` | `(href: string)` | `boolean` | パス拡張子または `?f=` の値で判定 | なし |
| `isInternalHost` | `(host: string)` | `boolean` | `pawchive.pw` / `fanbox.cc` / `patreon.com` とそのサブドメイン | なし |
| `collectExternalLinks` | `(hrefs: Iterable<string>, baseUrl?: string, limit = 10)` | `string[]` | 断片・mailto・内部ホストを除外し重複除去 | なし |

- 内部: `VIDEO_EXTENSION`、`IMAGE_EXTENSION`、`INTERNAL_HOSTS`
- 失敗時: URL 解析失敗は false / null / スキップ

### src/post-thumbnail-cache.ts
投稿サムネイルの生成(Rust 取得 → canvas で正方形 webp)と IndexedDB `pawkemo-post-thumbnails` キャッシュ。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `THUMBNAIL_CACHE_LIMITS` | `const = [100, 250, 500, 1000, 2000]` | `readonly number[]` | 設定で選べる上限 | なし |
| `readPostThumbnail` | `(path: string, size: number)` | `Promise<Blob \| undefined>` | キャッシュのみ参照。完全一致が無ければ最も近いサイズを使う | IndexedDB 読み取り |
| `getThumbnailCacheLimit` | `()` | `number` | 設定値を検証し、無効なら 500 | 設定読み取り |
| `trimThumbnailCache` | `()` | `Promise<void>` | 上限まで古い順に削除 | IndexedDB 書き込み |
| `cachedPostThumbnail` | `(path: string, size: number)` | `Promise<Blob>` | 同一キーの生成を 1 本化してキャッシュ付きで返す | IndexedDB 読み書き, IPC |

- 内部: `STORE="thumbnails"`、`MAX_ENTRY_BYTES=200*1024`、`pending` マップ、`cropThumbnail()`、`openCache()`、`readCache()`、`load()`、`limitCache()`
- 失敗時: cache open 失敗は `undefined` として扱い、生成のみ継続。`MAX_ENTRY_BYTES` 超は保存しません。`cropThumbnail` は canvas 不在・エンコード失敗で reject(呼び出し元 `PostThumbnail` がフォールバック)

### src/router.ts
ハッシュルーター。`history.state.pawkemoPrevious` に直前のパスを保持します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `Route` | `interface { path: string; params: Record<string, string>; query: URLSearchParams }` | — | 解析結果 | なし |
| `parseHash` | `()` | `Route` | `#/creator/{service}/{id}`、`#/post/{service}/{creatorId}/{postId}`(4 要素・service 検証必須)、それ以外は先頭セグメント | なし |
| `useRoute` | `()` | `Route` | `hashchange` を購読して再解析 | イベント購読 |
| `navigate` | `(to: string, replace = false)` | `void` | push/replace 後に `HashChangeEvent` を手動発火 | 履歴操作, イベント発火 |
| `goBack` | `(fallback = "/", previous?: string)` | `void` | 直前パスが一致すれば `history.back()`、無ければ `navigate(fallback, true)` | 履歴操作 |
| `useNavigate` | `()` | `(to: string, replace?: boolean) => void` | `navigate` の安定参照 | なし |

- 失敗時: 不正な投稿 URL は `path: "invalid-post"` を返し、throw しません。`navigate` は同一ハッシュなら何もしません

### src/safe-url.ts
投稿本文など外部由来 HTML の URL 判定。`new URL()` で解決して http / https 以外を拒否します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `isSafeHttpUrl` | `(value: string, base?: string)` | `boolean` | 前後の空白を除いて URL として解決し、`http:` / `https:` のときだけ true。`java\tscript:` のような制御文字入りも URL パーサが正規化するため拒否できる | なし |

### src/types.ts
pawchive API と画面の共有型。実行時コードはありません。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `Service` | `type = "patreon" \| "fanbox"` | — | サービス | なし |
| `PawFile` | `interface { name; path; server?; deferred?; temp_url?; temp_download_url?; temp_expires? }` | — | ファイル。`deferred` は署名付き一時 URL | なし |
| `PawEmbed` | `interface { [key: string]: unknown }` | — | embed の生データ | なし |
| `PawPost` | `interface`(id / user / service / title / content / embed / shared_file / added / published / edited / file / attachments / next? / prev? / tags? / origin? / preview_state? / has_full? / detail_fetched? / substring?) | — | 投稿。`substring` は一覧のみ | なし |
| `PawRevision` | `interface extends PawPost { revision_id: number }` | — | 改訂 | なし |
| `PawCreator` | `interface { favorited?; id; indexed; name; public_id?; service; updated }` | — | クリエイター | なし |
| `PawTag` | `interface { tag: string; post_count: number }` | — | タグ | なし |
| `PawAnnouncement` | `interface { service; user_id; hash; content; added }` | — | 告知 | なし |
| `PawComment` | `interface { id; parent_id; commenter; commenter_name?; content; published; revisions }` | — | コメント | なし |
| `HashLookupResult` | `interface { id; hash; mime; ext; size; added; posts; discord_posts }` | — | ハッシュ検索結果 | なし |
| `AccountFavorite` | `interface extends Partial<PawPost> { faved_seq?; id; indexed?; last_imported?; name?; service?; updated? }` | — | `/account/favorites`。type=post は PawPost 全フィールド + `faved_seq` | なし |

### src/version.ts
アプリ版表示。`VITE_BUILD_COMMIT` の短縮 SHA を併記します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `displayAppVersion` | `(version: string)` | `string` | SHA が有効なら `x.y.z (abcdef1)`、無効なら version のみ | なし |

## Pages

### src/pages/CreatorPage.tsx
クリエイター画面。プロフィール・タグ・投稿一覧(タグ絞り込み・無限スクロール)を表示します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `CreatorPage` | `({ service, id }: { service: string; id: string })` | `JSX.Element` | `loadCreatorPosts` / `loadCreatorTags` / `loadOriginalCreatorUrl` を呼び、`PostGrid` と `CreatorHeader` を描画 | HTTP, 設定保存, スクロール記憶 |
| `CreatorNotFound` | `()` | `JSX.Element` | `ApiError(404, t("creator.notFound"))` を `ErrorBox` で表示 | なし |

- 内部: `load(offset, replace)`(世代番号で古い応答を破棄)、`toggleViewMode`(`updateSettings({ postViewMode })`)、`toggleTag`、`useScrollMemory` のキーは `creator:{service}:{id}|t={tags}`、深リンク `?tag=` を初期選択、`showAllTags` で 20 件以降を展開
- 失敗時: 投稿一覧は `ErrorBox` + 再試行。タグ取得失敗は空配列(タグ UI 非表示)、元 URL 取得失敗は null(リンク非表示)

### src/pages/CreatorsPage.tsx
クリエイター検索画面。索引の構築・検索・並べ替え・ページングと、クリップボード URL の検出を行います。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `CreatorsPage` | `()` | `JSX.Element` | 索引件数確認 → 即時検索 → 必要なら構築し、サービス絞り込み・並べ替え・60 件ずつ表示 | HTTP, IndexedDB, クリップボード読み取り, 検索履歴 |

- 内部: `runSearch(value)`(検索世代で古い応答を破棄)、`initializeIndex`(`AbortController` でキャンセル)、`onSearch`、`onSearchSubmit`(Enter 時のみ履歴追加)、`visibleRows` / `displayedRows`(`updated` / `popular` / `name` の 3 種)、`checkClip`(`focus` 時に `readClipboardTextSafe` → `extractCreatorFromText`)、`postLink` バナー
- 失敗時: 索引構築・更新の失敗は `ErrorBox`(再試行は検索のやり直し)。中断(`signal.aborted`)時は状態更新をしません

### src/pages/FavoritesPage.tsx
フォロー一覧(新着チェック・既読管理)とアカウントお気に入りの 2 タブ。タブ選択は保存されます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `FavoritesPage` | `()` | `JSX.Element` | フォローごとの最新投稿を 4 並列で確認し、NEW 表示・既読・解除・並べ替えを提供。アカウントタブは `accountFavorites("post")` を取得 | HTTP, IndexedDB, localStorage, フォロー同期 |

- 内部: `NEW_POST_WINDOW_MS`(7 日)、`CHECK_COOLDOWN_MS`(5 分)、`FollowState`、`isRecentPost()`、`restoreCachedPost()`、`sortedFollows` / `sortedFavs`、`refresh()`、`checkNew(force)`(クールダウン中は保存済み `newest` で判定)、`markRead()`、`markAllRead()`、`loadAccount()`。タブは `pawkemo-fav-tab` に保存
- 失敗時: 新着チェックの各フォロー失敗は `error` 文字列として行に表示。アカウント取得失敗は `ErrorBox` + 401 時の専用メッセージ。フォロー解除失敗は `syncResult` に表示

### src/pages/HomePage.tsx
サイト全体の投稿一覧・検索・サービス絞り込み・表示形式切替。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `HomePage` | `({ query }: { query: URLSearchParams })` | `JSX.Element` | `loadHomePosts` で 50 件ずつ取得し、`PostGrid` で表示 | HTTP, 設定保存, 検索履歴, スクロール記憶 |
| `MIN_QUERY` | `const = 3`(末尾で再エクスポート) | `number` | 検索語の最小長 | なし |

- 内部: `load(offset, replace)`(世代番号で古い応答を破棄)、`submit` / `submitHistory`(`addSearchHistory` 後に `/search?q=` へ replace 遷移)、`toggleViewMode`(`updateSettings`)、`filteredPosts`(service 絞り込み)、`SETTINGS_CHANGED_EVENT` で `excludeAiPosts` の変化を検知して再取得、`useScrollMemory` のキーは `home:{q}:service=...:excludeAi=...`
- 失敗時: `ErrorBox` の再試行は現在オフセットから。`q` が 3 文字未満は取得せずメッセージ表示

### src/pages/LoginPage.tsx
ログインフォーム。Rust 側の `login_request` で認証し、成功時にセッションとフォローを同期します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `LoginPage` | `()` | `JSX.Element` | ユーザー名・パスワード送信、結果表示、登録リンク、アプリ版表示 | IPC, 設定保存, HTTP(フォロー同期), 遷移 |

- 内部: `submit(e)`。`next` クエリ(先頭 `/` のみ許可)へ 800ms 後に replace 遷移、cookie 取得失敗時は 2500ms 後に `/settings`
- 失敗時: 空入力はエラーメッセージ、`login_request` の reject は `login.commError` として表示し、パスワード欄をクリア

### src/pages/PostPage.tsx
投稿詳細。本文・添付・ライトボックス・一括保存・改訂・コメント・お気に入り・フラグ・前後移動・スワイプを担います。フックは早期 return より前にすべて配置されています。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `PostPage` | `({ service, creatorId, postId }: { service: string; creatorId: string; postId: string })` | `JSX.Element` | `getApplication().postDetail` で詳細とコメントを取得し、`sanitizePostContent` で本文を描画 | HTTP, IndexedDB, sessionStorage, IPC(listen/invoke), 設定保存, ログ |

- 内部: `load()`(`AbortController` で前回取得を中断)、`openExternalLink(e)`(元サービス投稿リンクは `resolveOriginalPost` でミラー内へ、それ以外は `openExternalPage`、失敗時 `window.open`)、`onTouchStart` / `onTouchEnd`(横 80px 以上のスワイプで前後)、キーボード(`←`/`→` で前後・ライトボックス移動、Esc はライトボックスを閉じる)、`runDownload()`、`prepareDownload()`、`startImageDownload()`、`cancelDownload()`、`onFlag()`、`navPost(id)`(replace 遷移)、`toggleFav()`、`attachmentImages` / `sourceFiles` / `allFiles`(cover.jpeg 除外)、`listMode = postFileListMode || noImageMode`、`lightboxIndex`
- 副作用の詳細: `pawkemo-current-post-context` を sessionStorage に保存、`download-progress` を listen、`visibilitychange` / `focus` で外部ページの画像一覧を回収、`excludeFanboxCover` を `updateSettings` で永続化
- 失敗時: 詳細取得失敗は `ErrorBox` + 再試行。お気に入り 401 はボタン非表示(`fav == "none"`)、その他は `err` 表示。フラグは 409/`already` を重複として表示。保存は `failDownload` とメッセージ表示

### src/pages/SettingsPage.tsx
設定画面。表示・投稿・言語・接続・データ・キャッシュ・アカウント・情報・診断のセクションを切り替えます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `SettingsPage` | `({ layout, section }: { layout: ResolvedLayout; section: string \| null })` | `JSX.Element` | 各設定の即時適用、バックアップ入出力、キャッシュ操作、ログ表示、診断 UI の遅延読込 | localStorage, IndexedDB, IPC, ファイル入出力, 設定イベント, リロード |

- 内部: `fmtBytes()`、`fmtTs()`、`applyTheme` / `applyLayoutMode` / `applyPostViewMode` / `toggleNoImageMode` / `togglePostFileListMode` / `toggleExcludeFanboxCover` / `toggleExcludeAiPosts` / `applyLocale` / `applyTimeoutSecs` / `applyUserAgentMode`、`reloadLocales()`、`syncLocaleFolder()`、`doClearIconCache()`、`toggleProxyImages()`(300ms 後に `location.reload()`)、`saveUserFile()`、`doExportBackup()`、`doImportBackupFile()`、`doImportFromClipboard()`、`doImport()`(確認後に `applyBackup`、900ms 後にリロード)、`doClearCache()`、`showLog()`、`exportLog()`、`showVersion()`、`verifySession()`
- 遅延読込: `DeveloperSessionTools` は常時、`DeveloperFullDiagnostics` と `DeveloperLocaleDiagnostics` は `DEBUG_DIAG` 時のみ `lazy()` で読み込みます
- 失敗時: 各操作は翻訳済みメッセージで表示し throw しません。`applyBackup` / `clearCreatorCache` 等の失敗は `settings.failedMsg` / `importFailed` 系に集約

## Components

### src/components/AppShell.tsx
全体レイアウト。デスクトップは左レール、モバイルはトップバー + ボトムナビ、詳細画面は戻る/ホーム付きヘッダー。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `AppShell` | `(props: AppShellProps)`。`AppShellProps = { headerIcon: string; layout: ResolvedLayout; currentPath: string; followCount: number; hasSession: boolean; accountId: string; children: ReactNode }` | `JSX.Element` | パスからページ名を決め、レイアウト別にヘッダー・ナビを出し分け | 遷移, アカウント操作 |

### src/components/BottomNavigation.tsx
モバイル用ボトムナビ。`document.body` へ portal 描画します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `BottomNavigation` | `({ currentPath, followCount }: { currentPath: string; followCount: number })` | `ReactPortal` | `navigationItems()` をボタン化し、バッジは 99 超で `99+` | 遷移 |

### src/components/BrowserLink.tsx
ネイティブ実行時のみ `open_in_browser` で外部ブラウザーを開くリンク。Web では通常の `<a target="_blank">`。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `BrowserLink` | `({ href, children, ...props }: Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "className" \| "title" \| "children"> & { href: string })` | `JSX.Element` | クリックを横取りして IPC。失敗時はメッセージ表示 | IPC |

- 失敗時: `invoke` の reject で `failedUrl` を立て、`t("common.browserOpenFailed")` を表示

### src/components/CreatorAvatar.tsx
クリエイターアイコン。取得できるまで(またはアイコンが無い場合)は頭文字を表示します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `CreatorAvatar` | `({ service, id, name, className = "" }: { service: string; id: string; name?: string; className?: string })` | `JSX.Element` | `getCreatorIcon` の結果を表示。無ければ `name`/`id` の頭文字 | IndexedDB, IPC(キャッシュ経由) |

### src/components/CreatorHeader.tsx
クリエイターのバナーとプロフィール。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `CreatorHeader` | `({ service, id }: { service: string; id: string })` | `JSX.Element` | `loadCreatorProfile` で名前・更新日を表示、`creatorBannerUrl` の画像を表示 | HTTP, 画像取得, ログ |

- 失敗時: プロフィール失敗は `creators.profileError`、バナー失敗は `logError` のうえ非表示(アイコンは継続表示)

### src/components/DeveloperDiagnostics.tsx
手動 session 入力と疎通確認。`SettingsPage` から常時 lazy 読み込みされます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `DeveloperDiagnostics` | `()` | `JSX.Element` | session を入力・保存し、`accountFavorites("artist", key, false)` で検証 | 設定保存, HTTP |

- 失敗時: 401 は `settings.testInvalid`、それ以外はステータスとメッセージを表示(`apiStatus` 使用)

### src/components/DeveloperFullDiagnostics.tsx
Full 診断。ログフォルダー、バックアップ dump、pkv 疎通、iOS 外部ページ診断。`DEBUG_DIAG` 時のみ読み込まれます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `DeveloperFullDiagnostics` | `()` | `JSX.Element` | 各診断ボタンと結果表示 | IPC, ログ, pkv 画像取得, ファイル保存 |

- 内部: `runIOSProbe()`、`saveIOSReport()`、`dumpBackup()`(`splitDebugLog` で分割して `logInfo`)、`probeExternal()`、`probeBlocked()`(`http://127.0.0.1:1/` が拒否されることの確認)、`showIOSProbe` 判定
- 失敗時: 各操作は結果文字列にエラーを表示し throw しません(`debugOpenLogFolder` のみ `.catch` でメッセージ化)

### src/components/DeveloperLocaleDiagnostics.tsx
言語ファイルの追加・取込・書出・削除 UI。`DEBUG_DIAG` 時のみ読み込まれます。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `DeveloperLocaleDiagnostics` | `(props: { locale: Locale; localeList: LocaleInfo[]; reloadLocales: () => Promise<void>; filePickerBusy: boolean; setFilePickerBusy: Dispatch<SetStateAction<boolean>> })` | `JSX.Element` | 追加フォーム、ファイル取込、ピッカー入出力、置換/削除の確認 | ファイル読み書き, 言語再読込, ログ |

- 内部: `addLocale()`、`importLocaleFiles(files, target)`、`useLocalePicker("import" \| "export")`、`confirmLocaleChange()`、`localeChangeControls`
- 失敗時: 結果種別ごとに翻訳メッセージを表示。例外は `settings.failedMsg` に集約。`filePickerBusy` 中は操作を無視

### src/components/DownloadFab.tsx
常時表示の保存ボタン(右下)と進捗パネル。状態は `download-status.ts` から購読します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `DownloadFab` | `()` | `ReactPortal` | 実行中は件数、完了/失敗はバッジ表示。20 秒で自動リセット | 購読, IPC(`cancel_download`), タイマー |

- 失敗時: 中止ボタンは `cancelImageDownload()` を `void` で呼び、失敗は無視

### src/components/Feedback.tsx
共通のフィードバック UI。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `Spinner` | `({ label = t("common.loading") }: { label?: string })` | `JSX.Element` | 回転インジケーターとラベル | なし |
| `ErrorBox` | `({ error, onRetry }: { error: unknown; onRetry?: () => void })` | `JSX.Element` | `STATUS=`/`BODY=` を分解し、401/403/404/429/502 と `Fake site` に応じた説明を表示。本文は 2000 文字まで | なし |
| `Empty` | `({ text = t("common.noData") }: { text?: string })` | `JSX.Element` | 空状態の表示 | なし |

### src/components/FollowButton.tsx
フォロー切替ボタンと、フォロー数の取得関数。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `FollowButton` | `({ service, id }: { service: string; id: string })` | `JSX.Element` | 現在状態を表示し、押下で `addFollow` / `removeFollow` | HTTP, localStorage, イベント購読 |
| `followsCount` | `()` | `number` | `loadFollows().length` | localStorage 読み取り |

- 副作用の詳細: `pawkemo-follows-changed` を購読、索引から取得した名前で `pawkemo-follows` を直接更新(名前補完)
- 失敗時: 切替失敗は `error` をボタンの `title` と下段テキストに表示し、状態は変更しません

### src/components/navigation-items.ts
ナビ項目(ホーム / クリエイター / お気に入り / 設定)の定義。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `navigationItems` | `(currentPath: string, followCount: number)` | `{ path: string; label: string; icon: NavIconName; active: boolean; badge?: number }[]` | 現在パスから active を決め、お気に入りにフォロー数をバッジ表示 | なし |

### src/components/NavigationRail.tsx
デスクトップ用の左ナビゲーションレールと SVG アイコン。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `NavIconName` | `type = "home" \| "creators" \| "favorites" \| "settings" \| "account"` | — | アイコン名 | なし |
| `NavIcon` | `({ name }: { name: NavIconName })` | `JSX.Element` | 20×20 のインライン SVG | なし |
| `NavigationRailProps` | `interface { currentPath; followCount; hasSession; accountLabel }` | — | レールの props | なし |
| `NavigationRail` | `(props: NavigationRailProps)` | `JSX.Element` | ブランド・項目・アカウント・ショートカット表示 | 遷移, アカウント操作 |

### src/components/PostGrid.tsx
投稿一覧の無限スクロール、カード表示、リスト表示。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `PostGrid` | `(props: PostGridProps)`。`PostGridProps = { posts: PawPost[]; onEndReached?: () => void; loading?: boolean; done?: boolean; newIds?: Set<string>; viewMode?: "grid" \| "list" }` | `JSX.Element` | 末尾 800px 手前で次ページ要求。`viewMode` 未指定は設定値 | scroll/resize 購読, 設定読み取り |
| `PostCard` | `({ post, isNew }: { post: PawPost; isNew?: boolean })` | `JSX.Element` | グリッド用カード。画像枚数・NEW・★・フォロー中を表示 | 遷移, お気に入り取得 |
| `PostRow` | `({ post, isNew }: { post: PawPost; isNew?: boolean })` | `JSX.Element` | リスト用の行カード | 同上 |

- 内部: `usePostMarks(service, userId, postId)`(お気に入り・フォローの購読)、`postPath(post)`(識別子不正なら遷移中止 + `logWarn`)、`sentinelRef` と `check()`(IntersectionObserver は使わず `getBoundingClientRect` で判定)、`cbRef`
- 失敗時: 追加読み込みの失敗は呼び出し画面が処理。`postPath` が null の場合は遷移しません

### src/components/PostThumbnail.tsx
投稿サムネイル。キャッシュ生成画像 → サムネイル URL → 元画像の順にフォールバックします。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `PostThumbnail` | `({ file, className }: { file: PawFile \| undefined; className?: string })` | `JSX.Element` | `file.path` が無ければプレースホルダー。`noImageMode` を子へ渡す | 設定読み取り |
| 内部 `ThumbnailImage` | `({ file, className, cacheOnly }: { file: PawFile; className?: string; cacheOnly: boolean })` | `JSX.Element` | `IntersectionObserver`(rootMargin 160px)で遅延生成。幅 × devicePixelRatio(上限 512)で要求 | IndexedDB, IPC, ObjectURL 管理 |

- 失敗時: キャッシュ生成失敗は `thumb` → `full` → `failed` の順に落とし、最終段で `logError`。`cacheOnly`(低通信モード)ではキャッシュに無ければ失敗表示

### src/components/Toggle.tsx
左右スイッチ型のオン/オフ。状態テキストを併記します。

| 名前 | シグネチャ | 戻り値 | 説明 | 副作用 |
|---|---|---|---|---|
| `Toggle` | `({ checked, onChange, label, onLabel, offLabel }: { checked: boolean; onChange: (value: boolean) => void; label?: string; onLabel?: string; offLabel?: string })` | `JSX.Element` | `role="switch"` のボタン。押下で反転値を通知 | `onChange` 呼び出し |

## IPC / イベント呼び出し一覧

`invoke` はすべて `@tauri-apps/api/core` のものです。引数名は Tauri v2 の規約どおり camelCase で、Rust 側の snake_case と対応します([DEVELOPMENT.md](../DEVELOPMENT.md) の「Tauri の引数とエラー」)。

| コマンド | 呼び出し元 | 引数 | 戻り値 |
|---|---|---|---|
| `api_request` | `platform/families/native.ts`(`network.request`)→ `api.ts` の `request()` | `{ path: string; method: string; sessionKey: string \| null; timeoutSecs: number \| null }` | `string`(JSON 文字列。JS 側で `JSON.parse` を試みる) |
| `set_http_user_agent` | `http-user-agent.ts` `applyHttpUserAgent` | `{ userAgent: string }` | `void` |
| `login_request` | `pages/LoginPage.tsx` `submit` | `{ username: string; password: string; timeoutSecs: number \| null }` | `{ ok: boolean; session?: string; error?: string }` |
| `open_in_browser` | `components/BrowserLink.tsx` | `{ url: string }` | `void` |
| `open_external_page` | `external-page.ts` `openExternalPage` | `{ url; referer; creatorName; service; creatorId; postId }`(すべて string) | `void` |
| `take_external_page_images` | `external-page.ts` `takeExternalPageImages` | なし | `ExternalPageDownload \| null` |
| `external_page_diagnostic_events` | `external-page-diagnostics.ts` `saveIOSExternalPageReport` | なし | `{ device: string; osVersion: string; events: string[] }` |
| `pick_json_file` | `platform/families/native.ts` / `mobile.ts` | `{ purpose: "locale" \| "backup"; appDirectory?: boolean }` | `JsonOpenResult \| { kind: "missing" }` |
| `save_user_file` | `native.ts` / `mobile.ts` / `external-page-diagnostics.ts` | `{ purpose: "locale" \| "backup" \| "log"; filename: string; text: string; appDirectory?: boolean }` | `FileSaveResult` |
| `list_locale_files` | `native.ts` `locale.listExternal` | なし | `LocaleFileSet \| null`(失敗は null) |
| `list_secondary_locale_files` | `native.ts` `locale.listSecondary` | なし | `LocaleFileSet \| null` |
| `export_locale_to_folder` | `native.ts` `locale.exportToFolder` | `{ code: string; json: string }` | `boolean` |
| `write_locale_file` | `native.ts`(DEBUG_DIAG のみ) | `{ code; json; replaceExisting?: boolean }` | `void` |
| `delete_locale_file` | `native.ts`(DEBUG_DIAG のみ) | `{ code: string }` | `boolean` |
| `write_secondary_locale_file` | `platform/families/desktop.ts`(DEBUG_DIAG のみ) | `{ code: string; json: string }` | `void` |
| `save_locale_file_to_app_directory` | `platform/families/mobile.ts`(DEBUG_DIAG + android/ios) | `{ code: string; json: string }` | `{ kind: "saved"; path: string }` |
| `resolve_storage_location` | `native.ts` `resolveNativeStorageLocation` | `{ area: "primary-private" \| "secondary-accessible"; purpose: "logs" \| "locales" \| "exports" \| "backup" \| "general" }` | `string \| null` |
| `fetch_creator_icon` | `icons.ts` `getCreatorIcon` | `{ service: string; id: string }` | `string \| null`(data URL。アイコン無しは null) |
| `clear_creator_icon_cache` | `icons.ts` `clearIconCache` | なし | `number`(削除件数) |
| `creator_icon_cache_info` | `icons.ts` `creatorIconInfo` | なし | `{ count: number; bytes: number }` |
| `fetch_post_thumbnail` | `post-thumbnail-cache.ts` `cropThumbnail` | `{ path: string }` | `ArrayBuffer \| number[]` |
| `download_post_images` | `post-download.ts` `downloadArticleImages` | `{ creatorName; service; creatorId; referer; images: DownloadImage[]; pages: string[]; sessionKey: string \| null; imageReferer: string \| null }` | `DownloadSummary` |
| `cancel_download` | `post-download.ts` `cancelImageDownload` | なし | `void` |
| `set_android_launcher_icon` | `app-icon.ts` `syncAppIcon` | `{ light: boolean }` | `void` |
| `plugin:app-icon\|is_supported` | `app-icon.ts` | なし | `{ value: boolean }` |
| `plugin:app-icon\|get_name` | `app-icon.ts` | なし | `{ value: string \| null }` |
| `plugin:app-icon\|change` | `app-icon.ts` | `{ options: { name: string } }` | `void` |
| `plugin:app-icon\|reset` | `app-icon.ts` | `{ options: {} }` | `void` |
| `debug_append_log` | `native-debug-log.ts` `debugAppendLog` | `{ text: string }` | `void`(戻り値は待たない) |
| `debug_open_log_folder` | `native-debug-log.ts` `debugOpenLogFolder` | なし | `string`(フォルダーパス) |

- `@tauri-apps/api/app` の API(コマンドではない): `getVersion()` を `LoginPage` / `SettingsPage` / `http-user-agent` / `external-page-diagnostics` が、`onBackButtonPress` と `exit(0)` を `platform/families/mobile.ts` の `lifecycle` が使用します
- イベント購読(`@tauri-apps/api/event` の `listen`): `download-progress` のみ。`pages/PostPage.tsx` が `downloadState === "running"` の間だけ購読し、payload `{ done: number; total: number }` で画面と `download-status` を更新して解除します
- 送信側(Rust)のイベント名・payload は [API.md](../API.md) を参照してください

### アプリ内イベント(window)
| イベント名 | 発火元 | 購読側 |
|---|---|---|
| `pawkemo-settings-changed`(`SETTINGS_CHANGED_EVENT`) | `api.ts` `updateSettings` | `App.tsx`、`pages/HomePage.tsx`、`pages/SettingsPage.tsx` |
| `pawkemo-follows-changed` | `follows.ts` `save` / `notifyChanged` | `App.tsx`、`components/FollowButton.tsx`、`components/PostGrid.tsx` |
| `pawkemo-favposts-changed`(`FAVORITE_POSTS_CHANGED_EVENT`) | `post-favorites.ts` `setFavoritePost` / `loadFavoritePosts` | `components/PostGrid.tsx` |
| `hashchange` | `router.ts` `navigate`(手動発火)/ ブラウザー | `router.ts` `useRoute`、`components/DownloadFab.tsx` |
| `focus` | ブラウザー | `pages/CreatorsPage.tsx`(クリップボード)、`pages/PostPage.tsx`(外部ページ画像の回収) |
| `visibilitychange` | ブラウザー | `pages/PostPage.tsx` |
| `error` / `unhandledrejection` | ブラウザー | `log.ts`(モジュール読込時に自動登録) |

## ストレージ参照一覧

`services.storage` はネイティブ・Web のどちらのアダプターでも `browserStorage("localStorage")`、`services.sessionStorage` は `browserStorage("sessionStorage")` です(`platform/families/native.ts` / `web.ts`)。したがって以下の localStorage / sessionStorage は WebView の実ストレージを指します。

| モジュール | 媒体 | キー / DB・ストア | 用途 |
|---|---|---|---|
| `api.ts` | localStorage | `pawkemo-settings` | `Settings` 全体の JSON |
| `follows.ts` | localStorage | `pawkemo-follows` | フォロー一覧(ミラー) |
| `follows.ts` | localStorage | `pawkemo-follows-migrated-to-account` | 初回移行済みフラグ(`"1"`) |
| `components/FollowButton.tsx` | localStorage | `pawkemo-follows` | 索引から得た名前で一覧を直接更新 |
| `history.ts` | localStorage | `pawkemo-search-history` | 検索履歴(最大 20 件) |
| `pages/FavoritesPage.tsx` | localStorage | `pawkemo-fav-tab` | 選択タブ(`follows` / `account`) |
| `hooks.ts` | sessionStorage | `pawkemo-scroll` | 画面キーごとのスクロール位置マップ |
| `pages/PostPage.tsx` | sessionStorage | `pawkemo-current-post-context` | 開いた投稿の `service` / `creatorId` / `postId` / `openedAt` |
| `db.ts` | IndexedDB `pawkemoviewer` v1 | `creators`(keyPath `key`, index `name`)、`seen`(keyPath `key`)、`meta`(keyPath `key`) | 旧索引行、既読、索引パックとメタ |
| `icons.ts` | IndexedDB `pawkemo-icons` v1 | `icons` | アイコン data URL(最大 2000 件、`t` で古い順に削除) |
| `post-thumbnail-cache.ts` | IndexedDB `pawkemo-post-thumbnails` v1 | `thumbnails`(index `savedAt`) | 生成済み webp Blob(1 件 200 KiB まで) |
| `backup.ts` / `pages/SettingsPage.tsx` | ファイル | バックアップ JSON(`pawkemoviewer-backup.json`)、ログ(`pawkemoviewer-log.txt`)、言語ファイル | platform の `userFiles` / `files` / `locale` サービス経由 |
| `icons.ts` / `post-thumbnail-cache.ts` | Rust 側ディスク | `app_data/icons/` など | アイコン・サムネイルの元データ(パス解決は Rust) |
| `platform/families/native.ts` | Rust 側ディスク | `resolve_storage_location` の結果 | ログ・言語・書き出し・バックアップの保存先 |

## 未確認・要注意

コードを読んだ範囲で断定できなかった点と、コメントと実装が食い違う点です。いずれも修正はしていません。

1. `src/db.ts` の `decodePack` は「現行は 6 フィールド」というコメントに反し、実装では 8 フィールドを現行、7 フィールドを旧 v3 として読み分けています。`encodePack` も 8 フィールドを書きます。どちらが意図された仕様かは未確認(動作は実装側)
2. `src/external-page-diagnostics.ts` の `withTimeout` は `setTimeout(reject, ms)` のため、タイムアウト時の reject 値が `undefined` になります。呼び出し側がその値をどう扱うか(メッセージ化の有無)は未確認
3. `set_android_launcher_icon` と app-icon プラグインの OS 別対応範囲は Rust / プラグイン実装依存のため未確認
4. pkv の OS 別 URL 形式(`http://pkv.localhost/file` と `pkv://localhost/file`)が実機で正しいかは Rust 側と実機依存のため未確認。JS 側はこの 2 形式を前提に組み立てています
5. `src/post-thumbnail-cache.ts` の `openCache()` はアップグレード時に `createObjectStore` を無条件で呼びます。DB バージョンを上げた場合の移行挙動は未確認(現状 version 1 固定)
6. `src/App.tsx` は `resolveLayout(settings.layoutMode, isWideLayout ? 768 : 767)` と呼び、幅の実値を 768 / 767 に丸めて渡します。境界幅の意図(実幅を使わない理由)は未確認
7. 設定のバックアップ復元(`src/backup.ts` の `validators`)は `accountId` と `userAgentMode` を検証対象に含めないため、この 2 項目は復元されません。意図的な除外かどうかは未確認
8. `src` 内から参照されていない export(事実): `iconCacheCount`、`toggleFollow`、`followsCount`、`useDebounced`、`creatorIconUrl`、`searchHash`、`creatorAnnouncements`、`CreatorNotFound`。`resetPlatformRuntimeForTests` は `tests/platform.test.mjs` が使用しています


