# API 仕様

PawKemoViewer 0.6.0 の pawchive API、Tauri コマンド、pkv、イベントのリファレンスです。

## 通信の全体像

```text
React / TypeScript
  → src/api.ts（スケジューラ、キャッシュ、設定、URL 生成）
  → invoke("api_request")
  → Rust / reqwest / rustls
  → https://pawchive.pw/api/v1
```

WebView は pawchive API を直接 `fetch` しません。ブラウザーだけの Web ランタイムには native transport がなく、API 呼び出しは失敗します。

## Settings

保存先は localStorage の `pawkemo-settings`。変更時は `pawkemo-settings-changed` を発火します。

```ts
interface Settings {
  sessionKey: string;
  accountId: string;
  theme: "dark" | "light";
  layoutMode: "auto" | "desktop" | "mobile";
  noImageMode: boolean;
  thumbnailCacheLimit: number;
  postViewMode: "grid" | "list";
  timeoutSecs: number;
  proxyImages: boolean;
  postFileListMode: boolean;
  userAgentMode: "device" | "app" | "desktop";
  excludeFanboxCover: boolean;
  excludeAiPosts: boolean;
  developerToolsEnabled: boolean;
  locale: string;
}
```

| フィールド | 既定 | 選択肢 / 影響 |
|---|---|---|
| `sessionKey` | `""` | pawchive の session cookie |
| `accountId` | `""` | 表示用。ログイン時は username、session から復元した場合は数値の `account_id` |
| `theme` | `"dark"` | `dark` / `light`。モバイルアイコンにも反映 |
| `layoutMode` | `"auto"` | `auto` / `desktop` / `mobile` |
| `noImageMode` | `false` | 一覧はキャッシュ済みサムネイルのみ。投稿詳細もリスト表示 |
| `thumbnailCacheLimit` | `500` | 100 / 250 / 500 / 1000 / 2000 |
| `postViewMode` | `"grid"` | `grid` / `list` |
| `timeoutSecs` | `30` | UI は 10 / 30 / 60 / 120。Rust は 1〜300 秒へ clamp |
| `proxyImages` | `false` | 投稿の外部メディアを pkv 経由へ。変更後 300 ms で reload |
| `postFileListMode` | `false` | 投稿ファイルを名前一覧にして個別読込 |
| `userAgentMode` | `"device"` | `device` / `app` / `desktop` |
| `excludeFanboxCover` | `false` | 一覧・詳細・一括保存の添付候補から `cover.jpeg` を除外 |
| `excludeAiPosts` | `false` | Home の API リクエストに `hide=(ai)` を付与 |
| `developerToolsEnabled` | `false` | 製品版の開発・診断カテゴリを表示 |
| `locale` | `"ja"` | 同梱または外部の言語コード。失敗時は日本語 |

設定 API: `loadSettings()` / `saveSettings()` / `initializeSettingsStorage()` / `getSettings()` / `updateSettings(patch)` / `clearApiCache()` / `apiStatus(error)`。

sessionKey を変更すると `accountId` を更新し(指定が無ければ session の `account_id` から導出)、API キャッシュ世代を進めます。保存済み設定は型・列挙値を検証せず、既定値と shallow merge します。

## pawchive API

基底 URL は `https://pawchive.pw/api/v1`。一覧の `o` は 50 刻みです。

### 投稿・クリエイター

| メソッド | パス | 備考 |
|---|---|---|
| GET | `/posts` | query: `q`、`o`。AI 除外設定時は `hide=(ai)` |
| GET | `/creators` | 全クリエイター。`favorited` を含む |
| GET | `/{service}/user/{creator_id}` | query: `q`、`tag`（配列、q より優先）、`o` |
| GET | `/{service}/user/{creator_id}/profile` | プロフィール |
| GET | `/{service}/user/{creator_id}/tags` | タグと投稿数 |
| GET | `/{service}/user/{creator_id}/announcements` | API 関数は存在するが、現行 UI は呼ばない |
| GET | `/{service}/user/{creator_id}/post/{post_id}` | 投稿詳細。`next` / `prev` を含む |
| GET | `/{service}/user/{creator_id}/post/{post_id}/revisions` | 改訂履歴。改訂なしは 404 + `[]` |
| GET | `/{service}/user/{creator_id}/post/{post_id}/comments` | コメント。なしは 404 `"No comments found."` |
| GET | `/search_hash/{sha256}` | ファイルハッシュ検索。API 関数は存在するが UI からは未使用 |
| GET | `/app_version` | サーバー commit hash または `"custom"` |

### 認証付き

| メソッド | パス | 備考 |
|---|---|---|
| GET | `/account/favorites?type=post\|artist` | session 必須。401 は Unauthorized |
| POST | `/favorites/post/{service}/{creator_id}/{post_id}` | 投稿をお気に入りに追加 |
| DELETE | `/favorites/post/{service}/{creator_id}/{post_id}` | 投稿のお気に入りを解除 |
| POST | `/favorites/creator/{service}/{creator_id}` | クリエイターをお気に入りに追加 |
| DELETE | `/favorites/creator/{service}/{creator_id}` | クリエイターのお気に入りを解除 |
| POST | `/{service}/user/{creator_id}/post/{post_id}/flag` | 再インポート申請。409 は申請済み |

`fancards`、`links`、GET flag は意図的に実装していません。

### レスポンスの癖

- 一覧は `substring` を持つ。詳細にはない。
- 詳細の `tags` は PostgreSQL 配列リテラル文字列の場合がある。`normalizeTags()` で正規化。
- `account/favorites?type=post` は PawPost 全フィールド + `faved_seq`。スリム形は artist 向け。
- 改訂履歴の 404 + `[]` は「改訂なし」として扱う。
- `preview_state` / `has_full` / `detail_fetched` / `origin` はスキーマ外の実測フィールド。
- 動画の `temp_url` / `temp_download_url` / `temp_expires` は期限付き。キャッシュしない。

## HTTP スケジューラとキャッシュ

- 共通 FIFO キュー
- 同時実行: 最大 3
- 開始間隔: 最小 250 ms
- GET キャッシュ: TTL 60 秒、最大 150 エントリ、挿入順追い出し
- 実行中の GET は Promise を共有
- 失敗した GET はキャッシュせず、再試行可能
- POST / DELETE はキャッシュしない
- キャッシュキー: `cacheGeneration:URL`
- sessionKey はキュー投入時、timeout は実行開始時に読み取る
- session 変更または明示的な clear で世代を進め、古い結果の新世代への混入を防ぐ
- 別 session を明示した `accountFavorites` は既定でキャッシュバイパス

Rust の非 2xx は `Err("STATUS=<code> BODY=<本文>")`。JS は `ApiError(500, message)` で包むため、**ステータス分岐は必ず `apiStatus(error)`** を使います。

## URL ヘルパー

| 関数 | 内容 |
|---|---|
| `directFileUrl(file)` | `temp_download_url` → `temp_url` → `{server\|n1}/data{path}?f={name}` |
| `fileUrl(...)` | ダイレクト URL を必要に応じて pkv へ変換 |
| `thumbUrl(file)` | `img.pawchive.pw/thumbnail/data{path}` |
| `isVideoFile(file)` | 動画判定 |
| `postUrl(...)` / `creatorUrl(...)` | pawchive のページ URL |
| `creatorIconUrl(...)` / `creatorBannerUrl(...)` | pawchive のアイコン / バナー |
| `proxyFileUrl(...)` | 外部メディアを pkv へ変換する候補を判定 |
| `proxyLinkUrl(...)` | 本文の外部リンクを pkv へ変換する候補を判定 |
| `originalPostUrl(...)` / `originalCreatorUrl(...)` | FANBOX / Patreon の元 URL |
| `normalizeTags(value)` | 配列、JSON 文字列、PG 配列リテラルを配列へ正規化 |

pkv の変換対象は FANBOX / Patreon / patreonusercontent / pximg と、投稿コンテキストのあるその他外部ホストです。pawchive 系とローカルは直接アクセスします。

## Tauri コマンド

アプリ独自定義は 29 コマンドです。JS 引数は **camelCase**。`AppHandle` は Tauri が注入するため JS から渡しません。特に記載がない戻り値は `Result<T, String>` の `T` です。

`api_request` は固定の pawchive 基底 URL へ path を連結する汎用 relay です。path の allowlist はなく、POST / DELETE 以外は GET として扱い、リクエスト body は送りません。アプリ側は既知のエンドポイントだけを呼び出します。

### 通信用

| コマンド | JS 引数 | 戻り値 / 対象 |
|---|---|---|
| `set_http_user_agent` | `userAgent` | `()` / 全 OS |
| `fetch_post_thumbnail` | `path` | 画像バイト列の IPC Response / 全 OS |
| `api_request` | `path, method, sessionKey?, timeoutSecs?` | 生のレスポンス文字列 / 全 OS |
| `login_request` | `username, password, timeoutSecs?` | `{ok, session, error}` / 全 OS |
| `fetch_creator_icon` | `service, id` | data URL または `null` / 全 OS |
| `open_in_browser` | `url` | `()` / 全 OS |

### ログ・キャッシュ

| コマンド | JS 引数 | 戻り値 / 対象 |
|---|---|---|
| `export_log` | `text` | 絶対パス / 全 OS。現行フロントからは未使用 |
| `export_file` | `fileName, text` | 絶対パス / 全 OS。現行フロントからは未使用 |
| `debug_append_log` | `text` | `()` / `debug-diag` |
| `debug_open_log_folder` | なし | ログフォルダーのパス / `debug-diag`。実用は desktop |
| `creator_icon_cache_info` | なし | `{count, bytes}` / 全 OS |
| `clear_creator_icon_cache` | なし | 削除件数 / 全 OS |

### 言語・JSON ファイル

| コマンド | JS 引数 | 戻り値 / 対象 |
|---|---|---|
| `list_locale_files` | なし | `{dir, files, invalid}` / 全 OS |
| `write_locale_file` | `code, json, replaceExisting?` | ファイルパス / `debug-diag` |
| `delete_locale_file` | `code` | `bool` / `debug-diag` |
| `list_secondary_locale_files` | なし | `LocaleList` / 全 OS |
| `write_secondary_locale_file` | `code, json` | ファイルパス / `debug-diag`、実処理は desktop |
| `export_locale_to_folder` | `code, json` | 新規 `true`、既存 `false` / 全 OS |
| `resolve_storage_location` | `area, purpose` | パスまたは `null` / 全 OS |
| `save_locale_file_to_app_directory` | `code, json` | `{kind:"saved", path}` / Android・iOS + `debug-diag` |
| `pick_json_file` | `purpose, appDirectory?` | `selected` / `cancelled` / `missing` |
| `save_user_file` | `purpose, filename, text, appDirectory?` | `saved` / `cancelled` |

`pick_json_file` の `purpose`:

- `backup`: 製品版、5 MiB
- `locale`: `debug-diag` のみ、1 MiB
- `appDirectory=true` はモバイルの標準バックアップを直接開く場合だけ有効

`save_user_file` の `purpose`:

- `backup`: 製品版、5 MiB
- `log`: 製品版、5 MiB
- `locale`: `debug-diag` のみ、1 MiB

選択成功時は `{kind:"selected", name, json}` を返します。`json` プロパティはパース済みオブジェクトではなく、UTF-8 の生文字列です。

### 外部ページ・アイコン

| コマンド | JS 引数 | 戻り値 / 対象 |
|---|---|---|
| `set_android_launcher_icon` | `light` | `()` / Android |
| `open_external_page` | `url, referer, creatorName, service, creatorId, postId` | `()` / 全 OS。Android・iOS はプラグイン、デスクトップは専用ウィンドウ |
| `take_external_page_images` | なし | JSON 値または `null`。終了した外部ページの選択結果を読み取る（全 OS） |
| `external_page_diagnostic_events` | なし | `{device, osVersion, events}` / iOS + `debug-diag` |

`creatorName` 以降は、外部ページから保存する画像の宛先文脈です。デスクトップは
`Documents/.external-download.json` を書き出してウィンドウを閉じ、モバイルと同じ
`take_external_page_images` の経路で取り込みます。

### 一括画像保存

| コマンド | JS 引数 | 戻り値 / 対象 |
|---|---|---|
| `resolve_download_directory` | `creatorName, service, creatorId` | 作成済みディレクトリーパス / 全 OS。現行フロントからは未使用 |
| `download_post_images` | `creatorName, service, creatorId, referer, images, pages, sessionKey?, imageReferer?` | `{directory, saved, skipped, cancelled, failed}` / 全 OS |
| `cancel_download` | なし | `()` / 全 OS |

`images` は `{url, name?}` の配列です。詳細は[一括画像保存](features/image-download.md)を参照してください。

## プラグインコマンド

フロントが直接使うものと、ネイティブ実装の内部 API を区別します。

| IPC 名 | 用途 |
|---|---|
| `plugin:app-icon\|is_supported` | iOS のアイコン切替対応確認 |
| `plugin:app-icon\|get_name` | 現在の iOS アイコン名 |
| `plugin:app-icon\|change` | iOS の代替アイコン選択（フロントでは未使用） |
| `plugin:app-icon\|reset` | iOS の既定アイコンへ戻す（フロントでは未使用） |
| `plugin:locale-picker\|pickJson` | Android / iOS の JSON 選択 |
| `plugin:locale-picker\|saveDocument` | Android / iOS の JSON 書き出し |
| `plugin:locale-picker\|exportToAppDirectory` | Android のアプリ専用言語保存 |
| `plugin:locale-picker\|setLauncherIcon` | Android のランチャーアイコン |
| `plugin:external-view\|open` | Android / iOS の実オリジン外部ページ（デスクトップは `open_external_page` が専用ウィンドウを開く） |
| `plugin:external-view\|openBrowser` | Android / iOS の OS ブラウザ |
| `plugin:external-view\|diagnosticEvents` | iOS + `debug-diag` の外部ページ診断 |

## イベント

| イベント | payload |
|---|---|
| `download-progress` | `{done: number, total: number}` |

## pkv プロトコル

外部ページの表示には使いません。アプリ自身の WebView に表示する外部画像
（設定 `proxyImages`）の Referer 偽装だけに使います。

- Windows / Android: `http://pkv.localhost/file?u=<URL>&r=<Referer>`
- macOS / iOS / Linux: `pkv://localhost/file?u=<URL>&r=<Referer>`
- pawchive 系は常に対象外。
- Referer は FANBOX / Patreon または取得先と同一 hostname。
- 内部 IP・DNS 解決先を検査し、リダイレクト先も再検査。
- connect 10 秒、total 180 秒、本文 64 MiB、HTML 8 MiB、worker 4、redirect 5。

HTML 変換、SSRF の残る制約、POST / Cookie の扱いは[HTTP User-Agent とヘッダー](architecture/http-user-agent.md)を参照してください。

## データ型

主要型: `PawPost` / `PawCreator` / `PawTag` / `PawComment` / `PawRevision` / `PawFile` / `PawAnnouncement` / `HashLookupResult` / `AccountFavorite` / `Settings`。

- `AccountFavorite`: `Partial<PawPost>` + `faved_seq`
- `PawRevision extends PawPost` + `revision_id`
- `PawCreator`: `id` / `public_id` / `service` / `name` / `indexed` / `updated` / `favorited`

保存キー、IndexedDB、バックアップ形式は[データ、キャッシュ、バックアップ](architecture/data.md)を参照してください。

## 診断ログ

- **Lite（製品版）**: アプリ内ログは error 系。Rust は `app_data/logs/pawchive.log` と OS ログへ出力。
- **Full（debug-diag）**: API / login / icon / pkv の request / response、headers、body、status を記録。フロントは `debug-app.log` にも追記。
- **iOS Full**: 外部ページ診断を最大 100 行メモリへ保持し、`Documents/Logs/external-page-diagnostic.txt` へ書き出し。

ヘッダーの Cookie / Authorization / token / session / password 系、URL の user-info と既知の sensitive query はマスキングします。ただし Full の response body と製品版の API error body は無加工で残り得ます。ログを共有する前に内容を確認してください。
