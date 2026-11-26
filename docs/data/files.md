# ファイルとディレクトリ

アプリが書き出すファイルの保存先・命名・形式・上限です。保存キーの概要は
[データ、キャッシュ、バックアップ](../architecture/data.md)、IndexedDB は
[IndexedDB スキーマ](schema.md)、Web Storage は[設定・履歴・セッション](storage.md)、
OS 別のファイル操作は[プラットフォームとストレージ](../architecture/platform.md)
も参照してください。

## パスの基準

| 基準 | 取得方法 | 用途 |
|---|---|---|
| `app_data_dir` | Tauri `app.path().app_data_dir()` | アイコン、専用言語、ログ、予備の保存先 |
| `document_dir` | Tauri `app.path().document_dir()` | モバイルの標準フォルダー、外部ページ受け渡し |
| `download_dir` | Tauri `app.path().download_dir()` | デスクトップの一括画像保存 |

アプリ識別子は `com.nsmr0604.pawkemoviewer`、製品名は `PawKemoViewer` です
(`src-tauri/tauri.conf.json`)。Android の debug / locale_test パッケージでは
識別子が変わります。

### OS 別の実パス

| OS | `app_data_dir` | `Documents` | `Downloads` |
|---|---|---|---|
| Windows | `%APPDATA%\com.nsmr0604.pawkemoviewer`(実測) | `%USERPROFILE%\Documents` | `%USERPROFILE%\Downloads` |
| macOS | Tauri の解決値(未実測) | `~/Documents` | `~/Downloads` |
| Linux | Tauri の解決値(未実測) | XDG の Documents | XDG の Downloads |
| Android | アプリ専用領域(未実測) | `Android/data/com.nsmr0604.pawkemoviewer/files/Documents` | 共有 `Download/`(MediaStore 経由、Android 10 以降) |
| iOS / iPadOS | アプリ専用領域(未実測) | アプリの `Documents`(Files で表示) | — |

Windows の実測値では `icons` / `locales` / `logs` の 3 フォルダーが存在します。
`backup` と `Downloads` は該当機能を使ったときに作られます。Windows の `Documents` は
OneDrive 等でリダイレクトされ得ます(解決は OS 依存)。

## フォルダー構成

```text
<app_data_dir>/
├─ icons/
│   └─ <service>_<id>.webp              # クリエイターアイコン(ディスクキャッシュ)
├─ locales/
│   └─ <code>.json                      # アプリ専用の追加・上書き言語
├─ logs/
│   ├─ pawchive.log                     # Rust の診断行を追記(ローテーションなし)
│   └─ debug-app.log                    # debug-diag ビルドのみ
├─ backup/                              # 汎用書き出し(現行フロントから未使用)
│   └─ <timestamp>[_n]_<name>
└─ Downloads/                           # 一括保存の最終フォールバック
    └─ <creator>/001_<name>.jpg
```

```text
<Documents>/                            # モバイルの標準フォルダー
├─ Backups/
│   └─ pawkemoviewer-backup.json
├─ Logs/
│   ├─ pawkemoviewer-log.txt
│   └─ external-page-diagnostic.txt      # iOS の診断ビルド
├─ Languages/
│   └─ <code>.json
├─ Downloads/
│   └─ <creator>/001_<name>.jpg          # モバイルの一括保存
├─ .external-download.json               # 外部ページの受け渡し(読み取り後削除)
└─ PawKemoViewer-Files.txt               # iOS のみ。Files に項目を作る案内
```

```text
<Downloads>/PawKemoView/                 # デスクトップの一括保存
└─ <creator>/001_<name>.jpg
```

```text
/storage/emulated/0/Download/PawKemoViewer/   # Android 10 以降の一括保存
└─ <creator>/001_<name>.jpg
```

- Android 10 以降の一括保存は、Rust がアプリのキャッシュ(`cache/downloads/<creator>/`)へ
  書いてから `downloads-store` プラグインで MediaStore に登録し、共有 `Download/` へ移します。
  キャッシュ上のファイルは移行後に削除されます。
- Android 9 以下は `Documents/Downloads/<creator>/` へ直接保存します。
- デスクトップの追加言語は `Documents/Pawchive/languages/<code>.json` です。
- デスクトップの一括保存は `Downloads/PawKemoView` → `Documents/Pawchive/Downloads` →
  `app_data/Downloads` の順にフォールバックします。Android で共有 `Download/` を使えない
  場合も同じフォールバックになります。

## ストレージ解決 API

`resolve_storage_location(area, purpose)` はパスを作成して返します。

| area | 基準 | 備考 |
|---|---|---|
| `primary-private` | `app_data_dir` | すべての OS |
| `secondary-accessible` | `document_dir` | デスクトップのみ。Android / iOS は `null` |

| purpose | 追加サブディレクトリ |
|---|---|
| `logs` | `logs` |
| `locales` | `languages`(フォルダー名は `locales` ではない) |
| `exports` | `exports` |
| `backup` | `backup` |
| `general` | なし |

## ファイル種別

| 種別 | 場所 | 名前 | 形式 | 上限 | TTL |
|---|---|---|---|---|---|
| アイコン | `app_data/icons` | `<service>_<id>.webp` | WebP バイト列 | なし | なし |
| 専用言語 | `app_data/locales` | `<code>.json` | JSON(UTF-8) | 1 MiB | なし |
| 追加言語 | `Documents/Pawchive/languages`(desktop) / `Documents/Languages`(mobile) | `<code>.json` | JSON(UTF-8) | 1 MiB | なし |
| バックアップ | モバイルは `Documents/Backups`、デスクトップは保存ダイアログ | `pawkemoviewer-backup.json`(既定) | JSON | 5 MiB | なし |
| ログ書き出し | モバイルは `Documents/Logs`、デスクトップは保存ダイアログ | `pawkemoviewer-log.txt` | テキスト | 5 MiB | なし |
| 常時ログ | `app_data/logs` | `pawchive.log` | テキスト(追記) | なし | なし |
| 詳細ログ | `app_data/logs` | `debug-app.log` | テキスト(追記) | なし | なし |
| iOS 外部ページ診断 | `Documents/Logs` | `external-page-diagnostic.txt` | テキスト | 5 MiB(保存 API 共通) | なし |
| 一括画像 | 上記の保存先 | `001_<name>.<ext>` | JPEG / PNG / WebP / GIF / AVIF など | 1 件 64 MiB・合計 512 MiB | なし |
| 外部ページ受け渡し | `Documents` | `.external-download.json` | JSON | なし(読み取り上限なし) | なし(読み取り時に削除) |
| iOS 案内 | `Documents` | `PawKemoViewer-Files.txt` | テキスト(固定文) | — | なし |

### アイコン

- キーは `service` と `id` を ASCII 英数字のみに制限して検証します
  (`src-tauri/src/lib.rs` の `fetch_creator_icon`)。違反は `invalid creator id`。
- 404 / 204 / 非 `image/*` / 空ボディは「アイコン無し」として `null` を返し、
  ファイルを作りません。
- `Content-Type` が `image/` で始まることだけを検査し、バイト列の MIME 判定・
  サイズ上限・TTL はありません。
- 保存失敗は無視し、取得した data URL はそのまま返します。

### 言語ファイル

- ファイル名は `<code>.json`。コードは英字 2〜3 文字で始まり、`-` 区切りの
  英数字 2〜8 文字を最大 2 セグメント(`ja`, `zh-Hant-TW` など)。
- 1 MiB 超、UTF-8 でない、コードが不正なファイルは一覧の `invalid` に入り、
  読み込みません。
- 内容の検証は JS 側(`src/domain/locale-validation.ts`): JSON オブジェクト、
  `locale.name` 必須、既知キーのみ、値は空でない文字列(10,000 文字以内)、
  差し込み変数の一致。
- 上書き順は 同梱 → アプリ専用 → 追加フォルダー。同梱の日本語が最終フォールバック。
- 製品版で使えるのは追加フォルダーの読み込みと、専用辞書を追加フォルダーへ書き出す
  `export_locale_to_folder` の同期だけです。任意ファイルの取り込み、専用辞書の
  追加・上書き・削除、ピッカーによる書き出しは `debug-diag` / `DEBUG_DIAG` 専用です。
- `export_locale_to_folder` は同名(大文字小文字無視)が既にあれば書き込まず
  `false` を返します。

### バックアップ

- 形式は `type: "pawkemoviewer-backup"`、`version: 1`。
- `settings` / `follows` / `seen` を含み、`follows` と `seen` は各 100,000 件まで。
- 5 MiB を超えると読み書きとも拒否します(JS と Rust の両方で検査)。
- モバイルの「標準フォルダーに保存」は `Documents/Backups/pawkemoviewer-backup.json`
  を上書きします。別名・別場所は SAF / Files ピッカー経由です。
- デスクトップは常に保存ダイアログで、`app_directory` 引数は無視されます。
- sessionKey を含むため機密ファイルとして扱います。

### ログ

| ファイル | 書き手 | 内容 | ローテーション |
|---|---|---|---|
| `pawchive.log` | Rust `append_app_log` | API 失敗、pkv 中継の診断行など | なし(追記のみ) |
| `debug-app.log` | Rust `debug_append_log`(debug-diag のみ) | フロントの詳細ログ行 | なし |
| `pawkemoviewer-log.txt` | 設定画面の書き出し | メモリ上のリングバッファ(最大 400 件) | 標準フォルダーへは上書き |

- `pawchive.log` はサイズ上限もローテーションもなく、開発機では 155 MB に
  達した例があります。
- リングバッファは 1 件 2,000 文字で切り詰め、製品版は `error` のみ保持します。
- `debug_append_log` / `debug_open_log_folder` は `debug-diag` ビルドにのみ
  登録されます。
- `export_log` / `export_file` は Rust に登録されていますが、現行フロントからは
  呼ばれていません(旧経路)。

### 一括画像保存

- ディレクトリはクリエイター名。禁止文字を `_` に置換し、前後の空白とドットを除去、
  最大 80 文字。空なら `<service>_<creatorId>`。
- ファイル名は `001_<元の名前>`(連番の桁数は総件数に応じて最低 3 桁)。
  元名がなければ URL の `?f=`、パス末尾、`image` の順で決めます。
- 拡張子が無い場合は `Content-Type` から `jpg` / `png` / `webp` / `gif` / `avif` を補います。
- 512 バイト未満の画像はトラッキングピクセルとして保存しません。
- ディレクトリは最初の保存成功時に作成し、0 件では作りません。
- 既存名と衝突する場合は `-2`, `-3`, … `-9999` を付けます。空きが無ければ
  `-9999` の名前を返し、その後の rename の成否は OS に依存します(失敗は `failed` に記録)。
- 実行をまたいだ重複排除はせず、同一実行内の URL 重複だけをスキップします。

### 外部ページの受け渡し

- デスクトップの外部ページは `document.title` の `pawkemo-save#<JSON>` を受け取り、
  `Documents/.external-download.json` に書いてウィンドウを閉じます。
- モバイルはネイティブビューが同じファイルを書きます。
- アプリ復帰時に `take_external_page_images` が読み取り、**読み取り後に削除**します。
  読み取り失敗時も削除し、JSON 不正は `null` を返します。
- 内容: `creatorName` / `service` / `creatorId` / `postId` / `referer` / `pageUrl` / `images[]`。
- サイズ上限・TTL・スキーマ検証はありません(検証前に削除されるため再取得できません)。

## ファイル名の検証

| 経路 | 規則 |
|---|---|
| `save_user_file` | 拡張子が用途と一致し、幹が ASCII 英数字と `_` `-` のみ。違反は `Invalid export file name or size` |
| 言語コード | 上記の正規表現。パス区切りを含めない |
| アイコン | `service` / `id` は ASCII 英数字のみ |
| 一括画像 | 禁止文字 `\/:*?"<>\|` と制御文字を `_` に置換。前後の空白・ドットを除去 |
| 汎用書き出し(`export_file`) | ASCII 英数字と `.` `_` `-` 以外を `_` に置換し、`<timestamp>_<name>` |

## 書き込み方式

| 経路 | 方式 |
|---|---|
| 言語・モバイル標準バックアップ・ログ | `atomic_document_write`: 同階層に `.document-<pid>-<n>.tmp` を作り、書き込み + `sync_all` 後に rename。Windows は rename 失敗時に既存を削除して再 rename |
| 一括画像 | `atomic_write`: `.<name>.part` に書いて rename。失敗時は一時ファイルを削除 |
| 追加言語の書き出し | `create_new` で新規作成のみ。既存時は `false` |
| 汎用書き出し | `create_new` を最大 100 回試し、`_1`〜`_99` を付けて衝突回避 |
| デスクトップの保存ダイアログ | `std::fs::write`(原子的ではない) |
| アイコン | `std::fs::write`(上書き) |

## 一時ファイル

| 名前 | 作成元 | 後始末 |
|---|---|---|
| `.document-<pid>-<n>.tmp` | `atomic_document_write` | 成功時は rename で消滅。書き込み・rename 失敗時は削除 |
| `.<name>.part` | 一括画像の `atomic_write` | rename 成功で消滅。失敗時は削除 |

- いずれも保存先と同じディレクトリに作り、`create_new` で衝突を避けます。
- プロセス強制終了などで残った孤児ファイルを起動時に回収する処理はありません。

## 失敗時の挙動

| 状況 | 挙動 |
|---|---|
| 保存先フォルダーが無い | `create_dir_all` で作成。失敗はエラー文字列を返す |
| 一括保存のフォルダー作成失敗 | その 1 件を `failed` に記録し、後続を継続 |
| 1 ファイルの取得失敗 | `failed` に URL と理由を記録し、後続を継続 |
| 合計 512 MiB 超過 | 以降を `total size limit` で失敗扱い |
| 言語ファイルが不正 | `invalid` に列挙し、他のファイルは読み込む |
| バックアップが 5 MiB 超 | 読み書きともエラー。既存データは変更しない |
| 外部ページ JSON が不正 | ファイルを削除して `null`。再取得不可 |
| ログ書き込み失敗 | Rust は `LOG_FILE_WRITE_ERROR` を内部ログへ。フロントは無視 |
| iOS の案内ファイル作成失敗 | 起動時の警告ログのみ(`prepare_ios_files_directory`) |

## 消去

| 対象 | 方法 |
|---|---|
| アイコン(ディスク) | 設定 → キャッシュの消去 → `clear_creator_icon_cache`(件数を返す) |
| 言語(専用) | `delete_locale_file`(debug-diag のみ) |
| ログ | アプリからは消去しない。`pawchive.log` は手動削除のみ |
| 一括画像 | アプリからは消去しない |
| 外部ページ受け渡し | 読み取り時に自動削除 |

## 未確認

- macOS / Linux / Android / iOS の `app_data_dir` 実パス。
- 一括保存の `Documents/Pawchive/Downloads` フォールバックが実際に発動する条件
  (デスクトップで Downloads が書けない環境での実測がない)。
- モバイルの SAF / Files ピッカーが同名ファイルを選んだときの上書き挙動
  (プラグイン側の実装依存)。
- iOS の `Documents` を Files に公開する設定の詳細。
