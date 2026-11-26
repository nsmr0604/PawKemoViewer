# IndexedDB スキーマ

本書は IndexedDB に保存するデータの完全な設計です。概要は
[データ、キャッシュ、バックアップ](../architecture/data.md)、Web Storage は
[設定・履歴・セッション](storage.md)、ファイルは[ファイルとディレクトリ](files.md)
を参照してください。

## データベース一覧

| DB 名 | バージョン | 用途 | object store | 実装 |
|---|---:|---|---|---|
| `pawkemoviewer` | 1 | クリエイター索引・既読・メタデータ | `creators` / `seen` / `meta` | `src/db.ts` |
| `pawkemo-icons` | 1 | クリエイターアイコンの data URL | `icons` | `src/icons.ts` |
| `pawkemo-post-thumbnails` | 1 | 投稿サムネイルの Blob | `thumbnails` | `src/post-thumbnail-cache.ts` |

すべて `getPlatformRuntime().services.indexedDatabase.open()` 経由で開きます
(`src/platform/families/browser.ts` の `indexedDatabase`)。ブラウザー実行でも
IndexedDB 自体は利用できますが、Tauri 以外では API が動かないため実用しません。

- バージョンは 3 DB とも `1`。`onupgradeneeded` ではストアの存在確認後に作成するため、
  再実行しても破壊しません。
- `indexedDB.deleteDatabase` は呼びません。DB の作り直しはストアの `clear` で行います。
- `navigator.storage.persist()` / `estimate()` は呼びません。容量逼迫時の追い出しは
  ブラウザー / WebView の既定動作に任せています。
- IndexedDB の実体ファイルの場所は WebView のデータ領域で、`app_data_dir` ではありません
  (実パスは未確認)。

## `pawkemoviewer` v1

### 接続

`openDb()` がモジュール変数 `dbPromise` に接続を 1 つだけ保持します。

| 項目 | 挙動 |
|---|---|
| 初回オープン | `indexedDatabase` が無ければ `IndexedDB platform service unavailable` で reject |
| オープン失敗 | `dbPromise` を `null` に戻し、次回呼び出しで再試行できる |
| `versionchange` | `db.close()` する。`dbPromise` は閉じた接続を保持したままなので、以後のトランザクションは失敗する |
| 単一ストア操作 | `tx(store, mode, fn)` が 1 トランザクションを張り、`oncomplete` で resolve、`onerror` / `onabort` で reject |

`tx()` は 1 リクエスト専用です。複数ストア・複数リクエストをまとめる処理は
`setSeen` / `updateSeenCheck` / `replaceSeen` のように個別にトランザクションを組みます。

### ストア

| ストア | キー | autoIncrement | index | 主なレコード |
|---|---|---|---|---|
| `creators` | `keyPath: "key"` | なし | `name` → `nameLower` | `CreatorRow`(旧 per-row 索引) |
| `seen` | `keyPath: "key"` | なし | なし | `SeenEntry` |
| `meta` | `keyPath: "key"` | なし | なし | `{ key, value }` |

`creators` の index `name` は作成されるだけで、検索には使われません。検索は
メモリ上のパック索引を線形走査します。

### `creators` ストア(旧形式)

現在は移行元としてのみ存在し、パック保存後に `clear` されます。

| フィールド | 型 | 意味 |
|---|---|---|
| `key` | string | `"<service>:<id>"`(主キー) |
| `service` | string | `"fanbox"` / `"patreon"` |
| `id` | string | サービス側のクリエイター ID |
| `name` | string | 表示名 |
| `nameLower` | string | 表示名の小文字(ソート・比較用) |
| `publicId` | string? | URL slug(fanbox の `tateha` 等) |
| `publicIdLower` | string? | slug の小文字 |
| `favorited` | number? | お気に入り数(人気度順に使用) |
| `updated` | number? | API の `updated` を数値化したもの |
| `indexed` | number? | API の `indexed` を数値化したもの |

```json
{ "key": "fanbox:12345", "service": "fanbox", "id": "12345",
  "name": "Example", "nameLower": "example", "publicId": "example",
  "publicIdLower": "example", "favorited": 42, "updated": 1763000000000 }
```

型は `src/application/creator-index-repository.ts` の `CreatorRow` です。

### `meta` ストアのキー

| キー | 値の型 | 書き込み元 | 意味 |
|---|---|---|---|
| `creatorsPack` | string | `saveCreators` | 索引パック本文(1 レコード・約 6 MB) |
| `creatorsPackBytes` | number | `saveCreators` | パックの UTF-8 バイト数(`Blob` で算出) |
| `creatorsCount` | number | `saveCreators` | 行数 |
| `creatorsIndexVersion` | number | `saveCreators` | パック形式のバージョン(現行 `3`) |
| `creatorsFetchedAt` | number | `saveCreators` | 取得時刻(epoch ms) |

`value` は任意の JSON 値を取れます。`setMeta(key, undefined)` は
`{ key, value: undefined }` を put するため、レコード自体は残り、読み手からは
未設定と同じ `undefined` に見えます。

### `seen` ストア

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `key` | string | ○ | `"<service>:<id>"`(主キー) |
| `lastSeenPostId` | string | ○ | 最後に確認した最新投稿 ID(未確認は `""`) |
| `checkedAt` | number | ○ | 新着チェック時刻(epoch ms)。クールダウン判定に使用 |
| `newest` | object? | — | 最後に取得した最新投稿の要約 |

`newest` の内訳:

| フィールド | 型 | 意味 |
|---|---|---|
| `id` | string | 投稿 ID |
| `title` | string? | タイトル |
| `published` | string? | 公開日時(API の `published` または `added`) |

```json
{ "key": "fanbox:12345", "lastSeenPostId": "900",
  "checkedAt": 1763000000000,
  "newest": { "id": "901", "title": "…", "published": "2026-11-20T00:00:00Z" } }
```

- 件数上限・TTL・自動削除はありません。フォローを外しても `seen` は残ります
  (`deleteSeen` は定義されているが、アプリ内から呼ばれていない)。
- 新着判定は `newest.id !== lastSeenPostId` かつ `newest` が 7 日以内です
  (`src/pages/FavoritesPage.tsx` の `NEW_POST_WINDOW_MS`)。自動チェックは
  `checkedAt` から 5 分間スキップします(`CHECK_COOLDOWN_MS`)。

## クリエイターパック形式

`saveCreators` は全行を 1 本の文字列にします(`encodePack`)。

- 行区切り: `U+001E`、フィールド区切り: `U+001F`
- 1 行 = `service / id / name / nameLower / slug / favorited / updated / indexed`
  (8 フィールド・現行 v3)
- `nameLower` 昇順、同値は `id` 昇順にソートして固定順を保証
- 各フィールドは区切り文字を半角空白へ置換(`sanitizeField`)。それ以外の制御文字は残る
- 例: `fanbox␟12345␟Example␟example␟example␟42␟1763000000000␟1763000000000`

`decodePack` はフィールド数で形式を判別します。

| フィールド数 | 解釈 | slug | favorited | updated / indexed |
|---:|---|---|---|---|
| 8 | 現行 v3 | `f[4]` | `f[5]` | `f[6]` / `f[7]` |
| 7 | 一時 v3(kanaLower 入り) | `f[5]` | `f[6]` | 0 |
| 6 | 旧 v2 | `f[4]` | `f[5]` | 0 |

- `service` か `id` が空の行は読み飛ばします。
- `name` が空なら `id`、`nameLower` が空なら `name.toLowerCase()` で補います。
- `slug` は `publicId` と `publicIdLower` の両方へ同じ値を入れます(小文字化は
  API 取込時の `toCreatorIndexRows` で済ませ、パックには小文字を書く)。

## メモリ索引

| 変数 | 内容 | 設定タイミング |
|---|---|---|
| `indexRows` | 復元済みの `CreatorRow[]` | `loadIndex` 成功時 |
| `indexPromise` | 読み込み中の Promise(多重読込の抑止) | `loadIndex` 開始時、失敗時に `null` |

- 読み込み順: `meta.creatorsPack` → 無ければ `creators` ストア全件。
- `invalidateCreatorIndex()` が `indexRows` と `indexPromise` を捨てます。
  呼び出し元は `saveCreators`、`clearCreatorCache`、`creatorIndexRepository.resetIndex`。
- 索引は 1 回読むとアプリ終了まで保持します。TTL はありません。
- 検索はメモリ上で完全一致 → 前方一致 → 部分一致の順にスコアリングします。
  各段では ID / slug を先に、次に名前を判定します。同スコアは `favorited` 降順、
  次に `nameLower` 昇順です(`rankRow` / `searchCreators`)。

## 書き込み順と失敗時の整合性

### `saveCreators`

1. `meta.creatorsPack`
2. `meta.creatorsPackBytes`
3. `meta.creatorsCount`
4. `meta.creatorsIndexVersion`
5. `meta.creatorsFetchedAt`
6. `creators` ストアを `clear`(失敗は無視)
7. メモリ索引を破棄

各項目は別トランザクションです。途中で中断すると、新しいパックと古いメタデータ
(またはその逆)が併存し得ます。`creatorsIndexVersion` が古いままなら、次回起動時に
`needsCreatorIndexBuild` が真になり再構築されます。パックだけ新しくメタが古い場合も
同様に再取得します。

### `clearCreatorCache`

`creatorsPack` / `creatorsPackBytes` / `creatorsCount` / `creatorsIndexVersion` /
`creatorsFetchedAt` を `undefined` で上書きし、`creators` を `clear`、メモリ索引を
破棄します。途中失敗時は一部のメタだけが残ることがありますが、パックが読めなければ
`creatorsCount` はストア件数へフォールバックします。

### `setSeen`

1 トランザクション内で `get(key)` → 既存へマージして `put`。
`checkedAt` は常に現在時刻、`newest` は引数があるときだけ上書きします。
`lastSeenPostId` は引数の値で置き換えます。

### `updateSeenCheck`

1 トランザクション内で `get` → `put`。`lastSeenPostId` は既存値を維持するため、
API 待機中に「既読」が押されても上書きしません。行が無ければ `""` で作成します。

### `replaceSeen`

1 トランザクションで `clear` した後に全件 `put`。バックアップ復元専用で、
部分適用は起きません(失敗時は reject)。

## マイグレーションとフォールバック

| 項目 | 内容 |
|---|---|
| DB 名の変更 | v0.3.0(PawKemoViewer 改名)で `pawkemoviewer` に変更。旧 DB は引き継がず、バックアップ書き出し → 読み込みで移行する |
| DB バージョン | 1 のまま。ストア追加・変更時は `onupgradeneeded` に追記する |
| 索引バージョン | `SEARCH_INDEX_VERSION = 3`。`meta.creatorsIndexVersion` と一致しなければ再構築 |
| 再構築の判断 | `needsCreatorIndexBuild`: 件数 0 またはバージョン不一致 |
| 旧行の再利用 | `buildCreatorIndex` は旧 `creators` 行が全件 `publicIdLower` と `updated` を持つ場合、再取得せずパック化する。欠けがあれば `/creators` を再取得 |
| 旧パックの読取 | 6 / 7 フィールドは `decodePack` が読む。8 フィールドへは次回保存時に変換 |
| メタ欠落 | `creatorCacheInfo` は `creatorsPackBytes` が無ければパック文字列からサイズを再計算する |

索引の新規構築・更新は `src/pages/CreatorsPage.tsx` が起動時と手動更新時に実行します。

## `pawkemo-icons` v1

| 項目 | 内容 |
|---|---|
| ストア | `icons`(キーは out-of-line、`keyPath` なし) |
| キー | `"<service>:<id>"` |
| レコード | `{ d: string \| null, t: number }` |

| フィールド | 型 | 意味 |
|---|---|---|
| `d` | string \| null | `data:image/webp;base64,...`。`null` は「アイコン無し(204・非画像・空ボディ)」 |
| `t` | number | 保存時刻(epoch ms)。削除順の判定に使用 |

- 上限 2,000 件(`MAX_ENTRIES`)。`put` のたびに `prune` が全件を読み、
  `t` 昇順で超過分を削除します。
- `prune` は読み取りと削除が別トランザクションで、`put` と並行すると
  削除件数がずれ得ます。また毎回 O(n) の全件走査です。
- 取得失敗(例外)は保存しません。204 / 非画像 / 空ボディは `null` として保存します。
- メモリの `Map`(`memory`)が最優先で、`inflight` が同一キーの同時取得を 1 本にします。
  メモリ側に件数上限はなく、`clearIconCache` だけがメモリと IndexedDB を空にします。
- ディスクキャッシュ(Rust)より先に参照され、ヒット時は Rust を呼びません。

## `pawkemo-post-thumbnails` v1

| 項目 | 内容 |
|---|---|
| ストア | `thumbnails`(out-of-line キー) |
| index | `savedAt` → `savedAt` |
| キー | `"<size>:<path>"`(例 `512:/data/ab/cd.jpg`) |
| レコード | `{ image: Blob, savedAt: number }` |

| フィールド | 型 | 意味 |
|---|---|---|
| `image` | Blob | 中央正方形 crop、最大 512 px、WebP quality 0.8 |
| `savedAt` | number | 保存時刻(epoch ms)。削除順 |

- 上限は設定 `thumbnailCacheLimit`(100 / 250 / 500 / 1,000 / 2,000、既定 500)。
- 1 件 200 KiB(`MAX_ENTRY_BYTES`)を超える Blob は保存しません(表示のみ)。
- 読み取りは完全一致キー → 同じ `path` でサイズが最も近いキー、の順。
  後者は `getAllKeys()` の全件走査です。
- 書き込みは 1 トランザクションで `put` → `count` → `savedAt` 昇順カーソルで
  超過分を削除。失敗・中断は握りつぶします。
- 同時取得は `pending` Map で 1 本に統合し、完了時に削除します。

## 上限と削除方針のまとめ

| 対象 | 上限 | 削除契機 |
|---|---|---|
| `creators` | 実質 0 件(保存後に clear) | `saveCreators` / `clearCreatorCache` |
| `meta.creatorsPack` | 1 レコード(約 6 MB) | 同上 |
| `seen` | 上限なし | `replaceSeen`(全置換)のみ |
| `icons` | 2,000 件 | `put` 時の `prune`、`clearIconCache` |
| `thumbnails` | 設定値(100〜2,000) | `put` 時、`trimThumbnailCache` |

## IndexedDB 外のメモリキャッシュ

| 名称 | 場所 | 寿命 | 破棄契機 |
|---|---|---|---|
| GET レスポンスキャッシュ | `src/api.ts` の `getCache` | 60 秒・最大 150 件 | TTL 超過、`clearApiCache`、session 変更 |
| お気に入り投稿集合 | `src/post-favorites.ts` | 60 秒 | `loadFavoritePosts(true)` など |
| ダウンロード進捗 | `src/download-status.ts` | アプリ起動中 | `resetDownloadStatus` |
| API スケジューラ | `src/api.ts` | 起動中 | — |

`getCache` のキーは `"<generation>:<path>"` で、session 変更や手動更新で
`cacheGeneration` を進め、旧世代の結果が新キャッシュへ戻らないようにしています。

## 失敗時の挙動

| 状況 | 挙動 |
|---|---|
| DB オープン失敗 | `tx` が reject。呼び出し側は既定値・空配列・`null` へフォールバック |
| パック読取失敗 | `loadIndex` の Promise を破棄し、次回再試行。`getCreatorRow` は `creators` を直接参照 |
| メタ欠落 | パックから件数・サイズを再計算 |
| アイコン DB 失敗 | メモリ / Rust キャッシュのみで動作 |
| サムネイル DB 失敗 | 毎回生成し、保存しない |
| `creators` の clear 失敗 | 無視。次回保存で上書き |

## 未確認

- WebView ごとの IndexedDB 実体パスと容量上限。
- Android / iOS での `onversionchange` 発生頻度と、閉じた接続が残る問題の実害。
- 99,231 行(コメント記載値)のパック保存に要する時間の実測値。
