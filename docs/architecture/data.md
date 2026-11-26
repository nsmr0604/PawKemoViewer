# データ、キャッシュ、バックアップ

## 保存場所の一覧

| 領域 | キー / DB | 内容 |
|---|---|---|
| localStorage | `pawkemo-settings` | 設定 15 フィールド |
| localStorage | `pawkemo-follows` | フォローのローカルミラー |
| localStorage | `pawkemo-follows-migrated-to-account` | アカウント同期への初回移行済みマーカー |
| localStorage | `pawkemo-fav-tab` | `follows` / `account` の選択タブ |
| localStorage | `pawkemo-search-history` | 検索履歴（最大 20 件） |
| sessionStorage | `pawkemo-scroll` | クエリ・サービス・AI 設定ごとのスクロール位置 |
| sessionStorage | `pawkemo-current-post-context` | 開いた投稿の service / creatorId / postId / openedAt |
| IndexedDB | `pawkemoviewer` v1 | クリエイター索引、既読、メタデータ |
| IndexedDB | `pawkemo-icons` v1 | クリエイターアイコン（最大 2,000 件） |
| IndexedDB | `pawkemo-post-thumbnails` v1 | 投稿サムネイル（設定で上限を変更） |
| ファイル | `app_data/icons/` | Rust のクリエイターアイコンキャッシュ |
| ファイル | `app_data/locales/` | アプリ専用の外部辞書 |
| ファイル | `app_data/logs/` | `pawchive.log`、Full の `debug-app.log` |

設定は `pawkemo-settings-changed` イベントで上位へ通知します。保存済み JSON は既定値と shallow merge するだけで、フィールドの型や列挙値を検証しません。

## クリエイター索引

`pawkemoviewer` DB の `meta` ストアに単一パックを保存します。現行パックは次の 8 フィールドです。

```text
service / id / name / nameLower / slug / favorited / updated / indexed
```

6 フィールド形式と一時的な 7 フィールド形式も decode できます。メタデータは `creatorsPack`、`creatorsPackBytes`、`creatorsCount`、`creatorsIndexVersion`、`creatorsFetchedAt` です。

- 読み手はパックを優先し、なければ旧 `creators` ストアの行へフォールバックします。
- パックとメタデータは別トランザクションで書き込みます。中断時に新しいパックと古いメタデータが併存し得ます。
- 消去はパック、メタデータ、旧行、メモリ索引をまとめて行います。

## 既読

`seen` ストアはクリエイターをキーに、最終確認した投稿 ID、確認日時、最新投稿の要約を保持します。`replaceSeen` は全件を 1 トランザクションで置き換えます。

NEW の判定は公開日時または取得日時が直近 7 日以内の投稿です。自動新着チェックには 5 分のクールダウンがあります。

## アイコンと投稿サムネイル

### クリエイターアイコン

取得順はメモリ → IndexedDB → Rust ディスクキャッシュです。同一キーの同時取得は 1 つの Promise に統合します。

- Rust: `app_data/icons/{service}_{id}.webp`
- IndexedDB: 最大 2,000 件、古いものから削除
- アイコン無し(204・非画像・空ボディ)の `null` は IndexedDB に保存され、消去するまで再取得しない。通信失敗は保存しない(再試行可能)
- Rust は応答 `Content-Type` が `image/` で始まることを検査するが、バイト列の MIME 検証、サイズ上限、TTL はない

### 投稿サムネイル

- Rust: `img.pawchive.pw/thumbnail/data{path}` を取得（4 MiB、15 秒）
- IndexedDB: 中央正方形 crop、最大 512 px、WebP quality 0.8、1 件最大 200 KiB
- キー: `<size>:<path>`
- 上限: 100 / 250 / 500 / 1,000 / 2,000 件（既定 500）
- 低通信モードでも cache hit は表示し、miss 時はネットワークへフォールバックしない

## バックアップ

形式は `type: "pawkemoviewer-backup"`、`version: 1` です。

```json
{
  "type": "pawkemoviewer-backup",
  "version": 1,
  "exportedAt": "2026-11-26T00:00:00.000Z",
  "settings": {},
  "follows": [
    { "service": "fanbox", "id": "...", "name": "..." }
  ],
  "seen": [
    {
      "key": "fanbox:...",
      "lastSeenPostId": "...",
      "checkedAt": 0,
      "newest": { "id": "...", "title": "...", "published": "..." }
    }
  ]
}
```

- 上限: 5 MiB
- follows / seen: 各最大 100,000 件
- 復元順序: 既読を全置換 → フォローを置換 → 設定を patch
- モバイルの標準ファイル名: **`pawkemoviewer-backup.json`**
- 設定に sessionKey が含まれるため、バックアップは機密ファイルとして扱う

復元時の設定 validator は `accountId` と `userAgentMode` を対象外にしています。この 2 フィールドはバックアップから復元されません。

バックアップ対象外は、クリエイター索引、投稿サムネイル、アイコン、検索履歴、Favorites タブ、スクロール、ログ、言語ファイルです。

## 言語ファイル

- 同梱: 日本語（静的 import）と英語（動的 import）、各 436 キー
- 既定: 日本語。未知言語・読込失敗も日本語へ戻る
- キー形式: フラットなドット区切り。`keySeparator` / `nsSeparator` は無効
- 差し込み: `{{name}}`
- 外部辞書: 1 MiB、UTF-8、`locale.name` 必須、既知キーのみ、値は空でない文字列
- 言語コード: 英字 2〜3 文字で始まり、`-` 区切りの英数字 2〜8 文字を最大 2 セグメント
- 上書き順: 同梱 → アプリ専用 → 追加フォルダー

製品版で利用できるのは追加フォルダーの読み込みと同期です。任意ファイルの取り込み、アプリ専用辞書の追加・上書き・削除、ピッカーによる書き出しは `DEBUG_DIAG` 専用です。

## 標準フォルダー

| 用途 | desktop | Android | iOS / iPadOS |
|---|---|---|---|
| アプリ専用言語 | `app_data/locales` | 同左 | 同左 |
| 追加言語 | `Documents/Pawchive/languages` | `Documents/Languages` | Files の `Documents/Languages` |
| 標準 backup | 保存先を選択 | `Documents/Backups` | Files の `Documents/Backups` |
| 標準 log | 保存先を選択 | `Documents/Logs` | Files の `Documents/Logs` |
| 一括画像保存 | `Downloads/PawKemoView` | 共有 `Download/PawKemoViewer`（Android 10 以降。9 以下は `Documents/Downloads`） | Files の `Documents/Downloads` |

詳細は[プラットフォームとストレージ](platform.md)を参照してください。
