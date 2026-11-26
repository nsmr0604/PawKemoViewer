# Web Storage(設定・履歴・セッション)

localStorage と sessionStorage に保存する全キーの一覧です。IndexedDB は
[IndexedDB スキーマ](schema.md)、ファイルは[ファイルとディレクトリ](files.md)を参照してください。

## 実装境界

- フロントは `window.localStorage` / `window.sessionStorage` を直接触らず、
  `getPlatformRuntime().services.storage` / `services.sessionStorage` を使います。
- 実装は `src/platform/families/browser.ts` の `browserStorage(name)` で、
  `getItem` / `setItem` / `removeItem` を包むだけです。
- Storage オブジェクトへアクセスできない環境では `undefined` を返します。
  呼び出し側は optional chaining か例外処理で扱います。
- `initializePlatformRuntime()` の前に読むと `getPlatformRuntime()` が例外を投げます。
  設定だけは `initializeSettingsStorage()` で再読込します。

## localStorage のキー

| キー | 値の型(JSON 形) | 既定値 | 書き込み元 | 読み取り元 | 変更通知 | 消去条件 |
|---|---|---|---|---|---|---|
| `pawkemo-settings` | `Settings` オブジェクト | `defaultSettings()` | `updateSettings` → `saveSettings` | `loadSettings` / `initializeSettingsStorage` | `pawkemo-settings-changed`(`CustomEvent`) | アプリから全消去する UI はない。端末のサイトデータ削除のみ |
| `pawkemo-follows` | `[{ service, id, name }]` | `[]` | `follow` / `unfollow` / `replaceFollows` / `FollowButton` の名前補完 | `loadFollows` / `isFollowed` | `pawkemo-follows-changed`(`Event`) | `replaceFollows([])`、端末データ削除 |
| `pawkemo-follows-migrated-to-account` | `"1"` | なし | `syncFollowsWithAccount` | 同左(初回移行判定) | なし | なし |
| `pawkemo-fav-tab` | `"follows"` \| `"account"` | `"follows"` | `FavoritesPage` の `setTab` | `FavoritesPage` の初期化 | なし | なし |
| `pawkemo-search-history` | `string[]`(最大 20) | `[]` | `addSearchHistory` | `getSearchHistory`(Home / Creators) | なし | `clearSearchHistory()` が `removeItem` |

### `pawkemo-follows` の要素

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `service` | string | ○ | `"fanbox"` / `"patreon"` |
| `id` | string | ○ | クリエイター ID |
| `name` | string | ○ | 表示名(不明時は ID) |

```json
[{ "service": "fanbox", "id": "12345", "name": "Example" }]
```

- `follow()` は先頭へ追加し、同じ `service:id` は重複追加しません。
- `replaceFollows()` は `service` / `id` が文字列かつ非空の要素だけを残し、
  `service:id` で重複を排除します。件数上限はありません。
- `FollowButton` はキャッシュ済みクリエイター名が古い場合、`loadFollows()` の結果を
  直接 `storage.set` で書き戻します(イベントは発火しません)。
- 読み込み失敗・不正 JSON は `[]` として扱います。
- フォローは pawchive アカウントが正で、ローカルはミラーです。ログイン中の
  `addFollow` / `removeFollow` はサーバー更新成功後にローカルへ反映します。
- 初回同期時だけ、アカウントに無いローカル項目を `favCreatorAdd` で移行し、
  その後 `pawkemo-follows-migrated-to-account` に `"1"` を書きます。

### 検索履歴

- 追加時に `trim()` し、空文字は無視。同じ文字列は先頭へ移動します。
- 20 件を超えると末尾を切り捨てます。
- 配列以外・文字列以外の要素は読み込み時に除外します。
- Home(投稿検索)と Creators(クリエイター検索)で同じ履歴を共有します。
- 画面の「履歴を消す」で `removeItem` します(バックアップ対象外)。

## sessionStorage のキー

| キー | 値の型 | 既定値 | 書き込み元 | 読み取り元 | 消去条件 |
|---|---|---|---|---|---|
| `pawkemo-scroll` | `Record<string, number>` | `{}` | `saveScroll`(スクロール時、rAF で間引き) | `loadScroll` / `useScrollMemory` | フィルタキー変更時に旧キーを削除。タブ / アプリ終了で消滅 |
| `pawkemo-current-post-context` | `{ service, creatorId, postId, openedAt }` | なし | `PostPage` の `useEffect` | リポジトリ内に読み取り元なし | タブ / アプリ終了で消滅 |

### スクロールキーの形式

| 画面 | キー |
|---|---|
| Home | `home:<q>:service=<filter>:excludeAi=<bool>` |
| Creator | `creator:<service>:<id>\|t=<tagKey>` |

- 値は `window.scrollY` を四捨五入した整数です。
- 一覧のデータ到着後(`ready`)に 1 回だけ復元します。
- キーが変わると、直前のキーの記録だけを削除します(画面離脱時は保持)。

### 投稿コンテキスト

```json
{ "service": "fanbox", "creatorId": "12345", "postId": "900",
  "openedAt": "2026-11-26T00:00:00.000Z" }
```

`openedAt` は ISO 8601 文字列です。現行コードでは書き込みのみで、読み取る箇所は
ありません(外部ページ連携用の履歴として残っている可能性があるが、用途は未確認)。

## 設定オブジェクト

`src/api.ts` の `Settings` は 15 フィールドです。

| フィールド | 型 | 既定値 | 意味 | バックアップ復元 |
|---|---|---|---|---|
| `sessionKey` | string | `""` | pawchive の session Cookie 値。**機密** | 空文字以外を復元(最大 8,192 文字) |
| `accountId` | string | `""` | ログイン中のアカウント。ログイン時は username、session から復元した場合は数値の `account_id`(表示用) | **復元しない** |
| `theme` | `"dark"` \| `"light"` | `"dark"` | 配色 | 列挙値のみ |
| `layoutMode` | `"auto"` \| `"desktop"` \| `"mobile"` | `"auto"` | レイアウト | 列挙値のみ |
| `noImageMode` | boolean | `false` | 低通信モード(画像を読まない) | boolean のみ |
| `thumbnailCacheLimit` | number | `500` | 投稿サムネイル上限(100 / 250 / 500 / 1,000 / 2,000) | 上記 5 値のみ。復元後に `trimThumbnailCache` |
| `postViewMode` | `"grid"` \| `"list"` | `"grid"` | 投稿一覧の表示形式 | 列挙値のみ |
| `timeoutSecs` | number | `30` | API タイムアウト秒 | 1〜300 の有限数のみ |
| `proxyImages` | boolean | `false` | FANBOX / Patreon 画像を pkv 経由にする | boolean のみ |
| `postFileListMode` | boolean | `false` | 投稿内ファイルを一覧表示(自動読込しない) | boolean のみ |
| `userAgentMode` | `"device"` \| `"app"` \| `"desktop"` | `"device"` | 外部アクセスの UA | **復元しない** |
| `excludeFanboxCover` | boolean | `false` | FANBOX の `cover.jpeg` を除外 | boolean のみ |
| `excludeAiPosts` | boolean | `false` | 一覧・検索で AI 分類を除外 | boolean のみ |
| `developerToolsEnabled` | boolean | `false` | 製品版で開発項目を表示 | boolean のみ |
| `locale` | string | `"ja"` | 表示言語コード | `^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$` |

保存値の例:

```json
{ "sessionKey": "", "accountId": "", "theme": "dark", "layoutMode": "auto",
  "noImageMode": false, "thumbnailCacheLimit": 500, "postViewMode": "grid",
  "timeoutSecs": 30, "proxyImages": false, "postFileListMode": false,
  "userAgentMode": "device", "excludeFanboxCover": false,
  "excludeAiPosts": false, "developerToolsEnabled": false, "locale": "ja" }
```

## 書き込みと通知

`updateSettings(patch)` の手順:

1. `sessionKey` が実際に変わる場合は、`accountId` を次の順で決めてから
   `clearApiCache()` を呼ぶ(GET キャッシュの世代を進める)。
   1. patch に `accountId` があればそれを使う(ログイン画面は username を渡す)
   2. 無ければ session Cookie の payload から `account_id` を導出する
      (`src/domain/session-account.ts` の `accountIdFromSession`)
   3. どちらも無ければ `""`
2. 現在値へ patch を浅くマージする。
3. `saveSettings()` で `JSON.stringify` して `setItem`。失敗は握りつぶす。
4. `window` があれば `pawkemo-settings-changed` を dispatch する
   (値が変わらなくても発火)。

起動時は `initializeSettingsStorage()` が保存値を読み直し、`sessionKey` があるのに
`accountId` が空なら session から復元して保存する。以前の版や診断画面から
session だけを保存した場合でも、再起動後に「アカウント不明」にならない。

購読側: `App`(テーマ・レイアウト・言語などの反映)、`SettingsPage`(ログイン状態の再検証)。

- 起動時はモジュール初期化で `loadSettings()` が走り、その後
  `initializeSettingsStorage()` がランタイム経由で読み直します。
- `sessionKey` はバックアップ JSON に含まれるため、バックアップは機密ファイルです。
  ログや notes へは出しません。
- どの設定変更も `Settings` 全 15 フィールドを毎回書き直します(差分保存ではない)。

### 通知イベント

| イベント名 | 型 | 発火元 | 主な購読側 |
|---|---|---|---|
| `pawkemo-settings-changed` | `CustomEvent`(detail なし) | `updateSettings` | `App`、`SettingsPage`、`HomePage` |
| `pawkemo-follows-changed` | `Event` | `follows.save`(follow / unfollow / replaceFollows) | `App`、`FollowButton`、`PostGrid` |
| `pawkemo-favposts-changed` | `Event` | `post-favorites.setFavoritePost` / 取得成功時 | `PostGrid` |
| `download-progress` | Tauri イベント | Rust の一括保存 | `DownloadFab` |

`FollowButton` の名前補完書き込みは `storage.set` を直接呼ぶため、
`pawkemo-follows-changed` を発火しません。

### 設定の反映先

| フィールド | 反映 |
|---|---|
| `theme` | `document.documentElement.dataset.theme`、アプリ内ロゴ、ネイティブアイコン |
| `layoutMode` | `resolveLayout` による desktop / mobile レイアウト |
| `locale` | i18next の辞書切替 |
| `noImageMode` / `postFileListMode` | 一覧・投稿詳細の画像読込 |
| `proxyImages` | `proxyFileUrl` の pkv 変換可否 |
| `excludeAiPosts` | `/posts` に `hide=(ai)` を付与 |
| `timeoutSecs` | `api_request` のタイムアウト |
| `sessionKey` | API の Cookie、フォロー同期、お気に入り同期 |
| `thumbnailCacheLimit` | サムネイル DB の上限(変更時に即 trim) |

## 壊れた JSON・型不正の扱い

| キー | 不正時の扱い |
|---|---|
| `pawkemo-settings` | `JSON.parse` 失敗・Storage 例外は既定値一式へフォールバック。JSON が object 以外でもスプレッドで無視され既定値のまま |
| `pawkemo-settings`(型違い) | 検証しない。`loadSettings` は既定値と shallow merge するだけで、`"dark"` 以外の文字列などもそのまま保持される。各画面が `\|\| 既定値` で補う |
| `pawkemo-follows` | 解析失敗は `[]`。配列でない場合も `loadFollows` は型を検査せず返すため、呼び出し側の `find` / `some` が失敗し得る |
| `pawkemo-follows-migrated-to-account` | `"1"` 以外は未移行として扱う |
| `pawkemo-fav-tab` | `"account"` 以外は `"follows"` |
| `pawkemo-search-history` | 解析失敗は `[]`。配列なら文字列要素のみ残す |
| `pawkemo-scroll` | 解析失敗は `{}`。値が数値でないキーは `loadScroll` で `0` 扱い |
| `pawkemo-current-post-context` | 読み取り側がないため影響なし |

- `setItem` の容量超過などは `saveSettings` / `addSearchHistory` / `saveScroll` では
  握りつぶします。`follows.save` は例外をそのまま投げます。

## バージョン移行

| 対象 | 方式 |
|---|---|
| 設定 | バージョンフィールドなし。フィールド追加は既定値マージで吸収する |
| 設定の DB 移行 | v0.3.0 の改名で IndexedDB 名が `pawkemoviewer` に変わった。旧設定・旧 DB は自動移行せず、バックアップ書き出し → 読み込みで移行する |
| フォロー | 初回だけローカル → アカウントへ移行し、マーカーを立てる。以後はアカウントを正とする |
| 既読 | IndexedDB `seen` に保存。バックアップでは配列として入出力する |
| 検索履歴・タブ・スクロール | 移行なし(再起動後に再生成) |

バックアップ復元時は `src/backup.ts` の validator を通したフィールドだけを
`updateSettings(patch)` に渡します。`accountId` と `userAgentMode` は validator に
存在しないため復元されません。`sessionKey` は空文字を無視し、既存値を維持します。

### バックアップ復元時の検証

`parseBackup` → `applyBackup` の順に、次の条件を満たさない要素を捨てます。

| 対象 | 条件 |
|---|---|
| 全体 | `type === "pawkemoviewer-backup"`、`version` は 1 のみ、5 MiB 以内 |
| `follows` | 配列で 100,000 件以内。`service` は `fanbox` / `patreon`、`id` は空でなく 256 文字以内 |
| `follows[].name` | 文字列なら前後空白を除去して 512 文字まで。空なら `id` |
| `seen` | 配列で 100,000 件以内。`key` は `^(fanbox\|patreon):[^:]+$`、ID は 256 文字以内 |
| `seen[].lastSeenPostId` | 文字列なら 256 文字まで。それ以外は `""` |
| `seen[].checkedAt` | 0 以上の有限数のみ。それ以外は現在時刻 |
| `seen[].newest` | `id` が 1〜256 文字のときだけ採用。`title` は 1,024 文字、`published` は 128 文字まで |
| `settings` | 上表の validator を通ったフィールドのみ |

復元順は 既読の全置換 → フォローの置換 → 設定の patch です。既読の置換に失敗すると
フォローと設定は変更しません。`thumbnailCacheLimit` を復元した場合は
`trimThumbnailCache` を実行します。

## 容量と件数

| キー | 上限 | 超過時 |
|---|---|---|
| `pawkemo-settings` | なし(端末の localStorage 容量に依存) | `setItem` 失敗を握りつぶす |
| `pawkemo-follows` | なし | 同上(ただし `follows.save` は例外を投げる) |
| `pawkemo-search-history` | 20 件 | 末尾を切り捨て |
| `pawkemo-scroll` | なし(画面ごとに 1 キー) | — |
| バックアップ JSON | 5 MiB・follows / seen 各 100,000 件 | 読み書きを拒否 |

## バックアップ・消去の関係

| データ | バックアップ | アプリ内の消去 |
|---|---|---|
| 設定 | ○(sessionKey 含む) | 個別変更のみ |
| フォロー | ○ | 各項目の解除 |
| 既読 | ○ | なし(全置換は復元時) |
| 検索履歴 | × | 履歴チップの「消す」 |
| Favorites タブ | × | なし |
| スクロール | × | フィルタ変更・タブ終了 |
| 投稿コンテキスト | × | タブ終了 |
| クリエイター索引 | × | 設定 → キャッシュの消去 |
| アイコン | × | 設定 → キャッシュの消去 |
| 投稿サムネイル | × | 上限変更時の trim |

## 未確認

- Android / iOS の WebView で localStorage が消える条件(OS のストレージ整理、
  アプリデータ削除以外)。
- `pawkemo-current-post-context` の読み取り元(ネイティブ側プラグインを含め、
  リポジトリ内には存在しない)。
- 設定の型不正値が各画面でどこまで実害になるか(全画面の網羅確認は未実施)。
