# プラットフォームとストレージ

## 実行環境の選択

`src/platform/runtime.ts` が Tauri の `window.__TAURI_INTERNALS__` を確認します。

| 環境 | ファミリー | 主な提供機能 |
|---|---|---|
| Tauri の Windows / macOS / Linux | `desktop` | Web Storage、IndexedDB、Tauri IPC、デスクトップのファイルダイアログ、ログ |
| Tauri の Android / iOS / iPadOS | `mobile` | Web Storage、IndexedDB、Tauri IPC、モバイルのファイルプラグイン、外部ページ、戻る / 終了 |
| ブラウザー | `web` | Web Storage、IndexedDB、Clipboard、Blob ダウンロード。pawchive API の network は提供しない |

iPadOS のデスクトップ相当 UA は `maxTouchPoints > 1` でモバイルと判定します。ブラウザー単体では pawchive API を呼び出せないため、Web アダプターは主にモック IPC による画面確認で使います。

## サービス契約

ストレージ、IndexedDB、ファイル、言語、Clipboard、ログ、ライフサイクルは型付き契約の背後にあります。サービスがない場合の既定は次のとおりです。

- 設定やスクロール: メモリまたは Web Storage の既定値へフォールバック。
- フォロー: 永続化できない場合は失敗を表示。
- IndexedDB: 利用不可・blocked・open 失敗を拒否。
- Clipboard: 読み取り拒否は `null`、書き込み拒否は `false`。
- ファイル選択: 成功・キャンセル・利用不可を別の結果として返す。
- 診断: `DEBUG_DIAG` と Cargo `debug-diag` のビルド時ゲートを維持。

## OS 別ファイル操作

| 対象 | Windows / macOS / Linux | Android | iOS / iPadOS |
|---|---|---|---|
| JSON を選ぶ | `tauri-plugin-dialog` | SAF `ACTION_OPEN_DOCUMENT` | `UIDocumentPickerViewController`（`asCopy: true`） |
| JSON / ログを保存 | 保存ダイアログ | SAF `ACTION_CREATE_DOCUMENT` | 一時ファイルを Files ピッカーへ書き出し |
| 標準 backup | ユーザーが保存先を選択 | `Documents/Backups` | Files の `Documents/Backups` |
| 標準 log | ユーザーが保存先を選択 | `Documents/Logs` | Files の `Documents/Logs` |
| 追加言語 | `Documents/Pawchive/languages` | `Documents/Languages` | Files の `Documents/Languages` |
| 一括保存 | `Downloads/PawKemoView` | 共有 `Download/PawKemoViewer`（Android 10 以降。9 以下は `Documents/Downloads`） | Files の `Documents/Downloads` |

Android の製品版 `Documents` は通常、`Android/data/com.nsmr0604.pawkemoviewer/files/Documents` です。debug / locale_test ではアプリ ID 部分が変わります。

### キャンセルとエラー

- 選択: `{kind:"selected", ...}` / `{kind:"cancelled"}` / `{kind:"missing"}`
- 保存: `{kind:"saved", ...}` / `{kind:"cancelled"}`
- キャンセルは保存成功として扱わず、言語一覧やバックアップを変更しません。
- Android の URI grant は永続化せず、操作ごとに `ContentResolver` でアクセスします。
- iOS はコピー取り込みと、一時ファイルを使う書き出しです。Files の原本を開いたまま編集しません。

### サイズ上限

| 対象 | 上限 |
|---|---:|
| locale JSON | 1 MiB |
| backup JSON | 5 MiB |
| log text | 5 MiB |
| 投稿 thumbnail | 4 MiB |
| pkv HTML / 通常本文 | 8 / 64 MiB |
| 一括保存の 1 画像 | 64 MiB |
| 一括保存の外部 HTML | 16 MiB |

JSON の構文、locale 辞書、backup schema の主な検証は JS 側で行います。Rust は用途別のサイズとファイル名を検査します。

## ネイティブプラグイン

### locale-picker（Android / iOS）

- JSON の選択・書き出し
- アプリ専用 `Documents` への言語ファイル保存
- Android のランチャーアイコン切替
- iOS のランチャーアイコンは `tauri-plugin-app-icon` 側

### external-view（Android / iOS）

- Android: Activity + WebView
- iOS / iPadOS: WKWebView の full-screen modal
- 初回リクエストに元記事の Referer を付与
- 実オリジンで JavaScript、reCAPTCHA、サイト自身の POST を利用可能
- 外部ページの画像選択は JavaScript bridge を使わず、`pawkemo-save:` custom scheme でネイティブへ渡す

URL は http(s) と Referer を検証しますが、pkv のような内部 IP・DNS 解決先検査は通していません。既知の制約です。

### デスクトップの外部ページ（Windows / macOS / Linux）

プラグインではなく `src-tauri/src/external_page_desktop.rs` が Tauri のウィンドウを直接作ります。

- ローカルの `public/external-blank.html` を読み、読み込み完了後に目的の URL へ遷移する
- Referer の付け方: Windows は WebView2 の `WebResourceRequested`、macOS は WKWebView の
  `loadRequest`、Linux は Rust で Referer 付き取得した HTML を実 URL を base に `load_html`
- ページには `assets/external-page-overlay.js` を差し込み、URL 表示・戻る・画像を保存・閉じるを提供する
- 画像選択の結果は `document.title` の `pawkemo-save#<JSON>` で受け取り、
  `Documents/.external-download.json` に書いてウィンドウを閉じる（モバイルと同じ取り込み経路）
- Linux は初回応答の Set-Cookie が WebView の Cookie ジャーに入らない

### downloads-store（Android）

- アプリのキャッシュに書いた画像を、端末の共有 `Download/PawKemoViewer/<creator>` へ移す
- Android 10 以降は MediaStore に登録する（`MediaStore.Downloads`、`IS_PENDING` を使用）
- Android 9 以下は登録できないため、呼び出し側が `Documents/Downloads` へ直接保存する
- 権限は追加しない（MediaStore への挿入は Android 10 以降で権限不要）

### app-icon

全 OS で初期化します。Android はアプリ独自の `set_android_launcher_icon`、iOS は上流プラグインの `is_supported` / `get_name` / `change` / `reset` を使います。詳細は[アイコン](icons.md)を参照してください。

## バックグラウンドと権限

- pkv の 4 ワーカーはプロセス起動中だけの常駐スレッドで、OS のバックグラウンドサービスではありません。
- 一括保存は `spawn_blocking` とグローバル lock で同時実行を 1 に制限します。
- キャンセルは次のファイル・ページ取得前に効く協調的なキャンセルです。転送中の強制中断や再起動後の再開はしません。
- Android の外部ページ Activity は `exported=false`。追加のストレージ・通知・フォアグラウンドサービス権限はありません。
- iOS に background mode や ATS 例外はありません。
- TLS 検証を無効化しません。reqwest は rustls を使い、OpenSSL には依存しません。

## 署名と配布

- Windows / macOS: 未署名。
- Android: 標準 debug.keystore。
- iOS / iPadOS: `--no-sign` の未署名 IPA。

詳細は[ビルドガイド](../BUILD.md)を参照してください。
