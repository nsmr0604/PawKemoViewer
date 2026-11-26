# 設定

## 目的

表示、投稿の見え方、言語、接続、バックアップ、キャッシュ、アカウント、情報、診断を 1 画面にまとめます。値は `src/api.ts` の `updateSettings` を通して `pawkemo-settings` に保存され、`SETTINGS_CHANGED_EVENT` で全体へ通知されます。

## 入口（ルート）

| ルート | `route.path` | `query` | 備考 |
|---|---|---|---|
| `#/settings` | `settings` | — | レール / ボトムナビの「設定」 |
| `#/settings?section={id}` | `settings` | `section` | セクション直リンク。アカウント欄からも |

`activeSection` の決め方:

- `section` が既知の id ならそのセクション。
- 未知・未指定のとき、モバイルは `null`（セクション一覧を表示）。
- 未知・未指定のとき、デスクトップは `"display"`。

`section` が有効なときは `window.scrollTo(0, 0)` と `document.getElementById("settings-${id}")?.focus({ preventScroll: true })` を実行します。

## 画面構成

デスクトップ（`grid-template-columns: minmax(132px,176px) minmax(0,1fr)`）:

```
┌───────────────────────────────────────────────────────────┐
│ h1.page-title  settings.title                             │
├────────────────┬──────────────────────────────────────────┤
│ nav.settings-nav│ div.settings-panels                      │
│  (sticky)      │  ┌────────────────────────────────────┐   │
│  表示 ›         │  │ div.settings-section（選択中の 1 つ）│   │
│  投稿表示 ›     │  │   h2.section-label                  │   │
│  言語 ›         │  │   div.setting-item  × n             │   │
│  接続 ›         │  │     .setting-text / 操作部品         │   │
│  データ ›       │  └────────────────────────────────────┘   │
│  キャッシュ ›   │                                          │
│  アカウント ›   │                                          │
│  情報 ›         │                                          │
│  診断 ›         │                                          │
└────────────────┴──────────────────────────────────────────┘
```

モバイル（セクション未選択 / 選択後）:

```
┌───────────────────────────────┐
│ ← セクション（選択後のみ）     │
├───────────────────────────────┤
│ nav.settings-nav（2 列）      │
│  [表示]        [投稿表示]     │
│  [言語]        [接続]         │
│  [データ]      [キャッシュ]   │
│  [アカウント]  [情報]         │
│  [診断]                       │
└───────────────────────────────┘

選択後は nav を隠し、1 セクションだけを表示
```

セクションボタンは `navigate("/settings?section=${id}", !mobile && validSection !== null)` です。デスクトップで既にセクションを開いているときは `replace` になり、履歴を増やしません。モバイルの戻るボタンは `goBack("/settings", "/settings")` です。

## セクションと項目

| id | ナビ表示 | 項目（ラベルキー → 操作） |
|---|---|---|
| `account` | アカウント | `settings.accountTitle` → `activateAccount("/settings?section=account")` ボタン（ラベルは `accountId` か `settings.loginButton`）。`settings.loginStatus` → `checking` / `loggedIn` / `loggedOut` / `unknown` を `role="status"` で表示 |
| `display` | 表示 | `settings.theme` → segmented `dark` / `light`。`settings.layout` → segmented `auto` / `desktop` / `mobile`。`settings.postView` → segmented `grid` / `list` |
| `language` | 言語 | `settings.language` → `availableLocales()` の `select`。`settings.localeFolder` → フォルダ表示と同期ボタン。不正ファイルがあれば `settings.localeInvalid` |
| `post` | 投稿表示 | `settings.fileList` → `Toggle`（`postFileListMode`）。`settings.excludeAiTitle` → `Toggle`（`excludeAiPosts`）。`settings.coverTitle` → `Toggle`（`excludeFanboxCover`） |
| `connection` | 接続 | `settings.noImage` → `Toggle`（`noImageMode`）。`settings.proxy` → `Toggle`（`proxyImages`）。`settings.userAgent` → segmented `device` / `app` / `desktop`。`settings.timeout` → segmented 10 / 30 / 60 / 120 秒 |
| `data` | データ | `settings.exportTitle` → 既定の場所へ保存 / 保存先を選ぶ。`settings.importTitle` → 既定ファイル / 他のファイル / クリップボード / JSON 貼り付け。結果は `backupResult` |
| `cache` | キャッシュ | `settings.thumbnailCacheLimit` → `select`（100 / 250 / 500 / 1000 / 2000）。`settings.creatorIndex` → 件数・バイト・最終取得 + 消去。`settings.creatorIcon` → 件数・バイト + 消去 |
| `info` | 情報 | `settings.serverVersion` → `api.version()` を取得して表示。`settings.platform` → `getPlatformName()`。`settings.appVersion` → `displayAppVersion(getVersion())`。`settings.developerTools` → `Toggle`（`DEBUG_DIAG` ビルドでは非表示）。`settings.aboutNote` |
| `diagnostics` | 診断 | `settings.logTitle` → 表示 / 保存 / 消去。`DeveloperSessionTools`（常時）。`DeveloperFullDiagnostics`（`DEBUG_DIAG` のみ）。`DeveloperLocaleDiagnostics`（`DEBUG_DIAG` かつ診断セクション表示中） |

`diagnostics` は `showDiagnostics = DEBUG_DIAG || developerToolsEnabled` のときだけナビに現れます。`categories` は毎レンダーで組み立て直されます。

表は DOM の並び（`account` が先頭）です。ナビの並びは `categories` の順で、表示 → 投稿表示 → 言語 → 接続 → データ → キャッシュ → アカウント → 情報 → 診断になります。

### アカウント

- ボタンは `activateAccount` を呼ぶだけです。未ログインなら `/login?next=%2Fsettings%3Fsection%3Daccount`、ログイン済みなら確認後に `sessionKey = ""`。
- `loginStatus` は `sessionKey` があるとき `api.accountFavorites("artist", sessionKey, false)` を呼び、成功で `loggedIn`、401 で `loggedOut`、それ以外は `unknown`。`pawkemo-settings-changed` を購読して再検証します。

### 表示

- テーマは `updateSettings({ theme })` と同時に `document.documentElement.dataset.theme` を更新し、即時反映します。
- `layoutMode` の変更は `App` の再レンダーで反映されます（`resolveLayout`）。
- `postViewMode` はホーム / クリエイター / お気に入りの一覧の初期表示に使われます。

### 言語

- `applyLocale` は `await loadLocale(value)` の**戻り値**を保存します。読込に失敗すると `ja` が返るため、存在しない言語は設定に残りません。
- 「言語フォルダーを同期」は `getApplication().exportLocaleToFolder(locale)` の後に `reloadLocales()`（`refreshLocales` + 一覧更新 + 現在言語の再読込）を実行します。結果は `settings.localeFolderExported` / `localeFolderUpdated` / `failedMsg`。
- `folderLabel` は追加言語フォルダーのパスです。iOS ネイティブでは `settings.localeFolderIos` の文言に置き換えます。

### 接続

- `proxyImages` を切り替えると 300ms 後に `window.location.reload()`。表示中の URL 形式を確実に切り替えるためです。
- `userAgentMode` は保存後に `applyHttpUserAgent()` を呼び、HTTP ヘッダーへ反映します。
- `timeoutSecs` は API のタイムアウト値で、ログインの `timeoutSecs` にも渡ります。

### データ（バックアップ）

| 操作 | 実装 |
|---|---|
| 既定の場所へ保存 | `buildBackup()` → `appDirectory.save("backup", "pawkemoviewer-backup.json", json)` |
| 保存先を選ぶ | `services.userFiles.save(...)` または `services.files.exportText(...)` |
| 既定ファイルを開く | `appDirectory.openBackup()` |
| 他のファイルを開く | `services.userFiles.open("backup")`、非対応環境では `<input type="file">` |
| クリップボードから | `services.clipboard.readText()` |
| JSON を貼り付け | `textarea` → `doImport(backupPaste)` |

- `MAX_BACKUP_BYTES = 5 * 1024 * 1024`。書き出し前と読み込み前にサイズを検査します。
- 書き出し時は `services.clipboard.writeText(json)` も試し、成功すると `settings.clipCopied` を結果文に足します。
- 読み込みは `window.confirm(settings.importConfirm)` の後に `applyBackup(text)`。結果は `settings.imported { follows, seen, settings }`。
- 読み込み成功後は 900ms で `window.location.reload()`。
- キャンセルは成功扱いにせず、`backupResult` も変更しません。

### キャッシュ

- サムネイル上限は `THUMBNAIL_CACHE_LIMITS`（`src/post-thumbnail-cache.ts`）。変更すると `trimThumbnailCache()` を実行します。
- クリエイター索引の情報は `creatorCacheInfo()`（`count` / `bytes` / `fetchedAt`）、消去は `clearCreatorCache()`。
- アイコンは `creatorIconInfo()`（`count` / `bytes`）、消去は `clearIconCache()`。消去後は情報を再取得します。

### 情報 / 診断

- `showVersion` は `api.version()` を呼び、失敗すると `settings.loadFailed` を表示します。
- 診断セクションのログは `getLogEntries()` / `formatLog()` / `clearLog()`（`src/log.ts`、最大 400 件・1 件 2000 文字）。
- ログの保存は `saveUserFile("log", "pawkemoviewer-log.txt", formatLog(), chooseLocation)`。
- 開発者ツールのトグルを OFF にすると `logText` / `logResult` を破棄します。
- `DeveloperSessionTools` は `sessionKey` を直接入力して検証・保存する欄です（`src/components/DeveloperDiagnostics.tsx`）。

## 主な操作

| 操作 | 成功時 | 失敗時 |
|---|---|---|
| テーマ / レイアウト / 表示形式 | 即時反映（結果メッセージなし） | — |
| 言語変更 | 選択が反映 | `ja` にフォールバックして保存 |
| 言語フォルダー同期 | `localeFolderResult` に成功文 | `settings.failedMsg` |
| UA 変更 | 即時反映 | — |
| proxy 画像 | 300ms 後にリロード | — |
| バックアップ書き出し | `settings.exported` / `backupSaved`（+ `clipCopied`） | `settings.exportFailed` |
| バックアップ読み込み | `settings.imported` → 900ms 後にリロード | `settings.importFailed` / `backupTooLarge` / `backupMissing` |
| ログ表示 | `pre.log-view` に全文 | 空なら `settings.noLog` |
| ログ保存 | `settings.exported` / `logSaved` | `settings.exportFailed` |
| ログ消去 | `settings.logCleared` | — |
| キャッシュ消去 | 件数・バイトが 0 に更新 | — |

ファイル操作中は `filePickerBusy` が立ち、対象ボタンが disabled になります。

## 状態（読込中・空・エラー・部分成功）

| 状態 | 条件 | 表示 |
|---|---|---|
| セクション未選択 | モバイルで `section` が無い / 無効 | セクション一覧だけを表示し、パネルは `hidden` |
| アプリ版の取得中 | `getVersion()` の完了前 | `…`（情報セクション） |
| アプリ版の取得失敗 | `getVersion()` が reject | `settings.loadFailed` |
| サーバーバージョン未取得 | ボタン押下前 | 何も表示しない（ボタンのみ） |
| サーバーバージョン取得失敗 | `api.version()` が reject | `settings.loadFailed` |
| 索引・アイコン情報の取得中 | `cache` / `iconCache` が `null` | `common.loading` |
| 索引・アイコン情報の取得失敗 | 取得が reject | `null` のままなので `common.loading` が残る（エラー表示なし） |
| ファイル操作中 | `filePickerBusy` | 対象ボタンが disabled。バックアップ / ログ / 言語フォルダーの各ボタン |
| バックアップ結果 | `backupResult` | 1 行のテキスト（成功・失敗・サイズ超過・ファイル無し） |
| ログ結果 | `logResult` | 1 行のテキスト（保存先・消去済み・失敗） |
| 言語フォルダー結果 | `localeFolderResult` | 1 行のテキスト |
| バックアップの部分成功 | `applyBackup` の結果 | `settings.imported` にフォロー数・既読数・設定反映の有無を並べる |
| 言語の部分成功 | 取り込みで一部失敗 | `settings.localeImportPartial` に成功数とスキップ理由 |

## データ依存

| 用途 | 呼び出し |
|---|---|
| 設定 | `getSettings()` / `updateSettings()`（キー `pawkemo-settings`、イベント `pawkemo-settings-changed`） |
| バックアップ | `buildBackup` / `applyBackup` / `MAX_BACKUP_BYTES`（`src/backup.ts`） |
| 言語 | `loadLocale` / `availableLocales` / `secondaryLocaleFolder` / `invalidLocaleFiles`（`src/i18n.ts`） |
| ファイル | `services.userFiles` / `services.files` / `services.clipboard` / `services.userFiles.appDirectory` |
| キャッシュ | `creatorCacheInfo` / `clearCreatorCache`（`src/db.ts`）、`creatorIconInfo` / `clearIconCache`（`src/icons.ts`） |
| サムネイル | `getThumbnailCacheLimit` / `THUMBNAIL_CACHE_LIMITS` / `trimThumbnailCache` |
| ログ | `getLogEntries` / `formatLog` / `clearLog` / `logInfo` |
| UA | `applyHttpUserAgent`（`src/http-user-agent.ts`） |
| バージョン | `getVersion()`、`displayAppVersion()`、`api.version()` |

## 関連コード

- `src/pages/SettingsPage.tsx`
- `src/components/Toggle.tsx`
- `src/components/DeveloperDiagnostics.tsx` / `DeveloperFullDiagnostics.tsx` / `DeveloperLocaleDiagnostics.tsx`
- `src/api.ts` — 設定の保存と読み込み
- `src/backup.ts`、`src/log.ts`、`src/icons.ts`、`src/post-thumbnail-cache.ts`
- `src/i18n.ts` — 言語一覧とフォルダー

## 既知の制約

- セクションはすべて同じページ内の `div` で、`hidden` 属性で切り替えます。URL のクエリだけが現在地の情報です。
- クリエイター索引・アイコンの情報取得に失敗すると `null` のままなので、画面は `common.loading` の表示で止まります（エラー表示なし）。
- `proxyImages` の切替はページ全体のリロードを伴います。設定画面のスクロール位置などは失われます。
- バックアップの読み込みは確認ダイアログのみで、`applyBackup` はフォローと既読を**バックアップ内容で置き換え**ます（バックアップ内の重複はキーで排除）。既存データとのマージはしません。
- 診断セクションは `DEBUG_DIAG` ビルドでは「開発者ツール」トグル自体が非表示になり、常に表示されます。リリースビルドでは既定で非表示です。
- `DeveloperLocaleDiagnostics` は `DEBUG_DIAG` かつ診断セクションを開いているときだけ遅延読み込みされます。
