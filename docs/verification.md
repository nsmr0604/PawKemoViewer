# 検証ガイド

自動テスト、ビルド、実機確認の進め方です。結果の正本は[開発状況](STATUS.md)にまとめます。

## 自動テスト

リポジトリルートで実行します。

| コマンド | 確認内容 |
|---|---|
| `npm run test:domain` | 投稿識別子、元記事 URL、Referer、言語コードなどの純粋ルールと Domain の依存境界 |
| `npm run test:application` | ユースケース、部分成功、キャンセル、API / リポジトリの契約 |
| `npm run test:platform` | 実行環境の選択、Tauri IPC、Web Storage、IndexedDB、ファイル選択、ライフサイクル |
| `node --test tests/post-download.test.mjs` | 本文・添付・外部リンクの画像 URL 抽出。通常の npm test スクリプトには未含む |
| `npm run check:boundaries` | 層間の静的インポート規約 |
| `npm run check:locales` | 日本語・英語辞書のキーと差し込み変数の一致 |
| `cargo test --lib --manifest-path src-tauri/Cargo.toml` | Rust の保存、HTML 抽出、ヘッダー、URL 検証などの単体テスト |

LLVM がメモリ不足になる環境では、テストの debuginfo を落とします。

```powershell
$env:CARGO_PROFILE_TEST_DEBUG = "0"
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

## ビルド確認

```bash
npm run build
npm run build:debug
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --features debug-diag
```

- `npm run build`: 境界チェック、辞書チェック、型検査、製品版フロントエンド。
- `npm run build:debug`: `VITE_DEBUG_DIAG=1` のフロントエンド。
- Cargo は通常と `debug-diag` の両方を確認します。
- 製品版に Full 診断の実装が混入しないことを、生成物とコマンド登録でも確認します。

CI の実行方法、パッケージ名、検証モードは[ビルドガイド](BUILD.md)を参照してください。

## ブラウザー確認

ブラウザーでは Tauri IPC をモックし、外部 API へ接続しないで画面を確認します。

- ホームの検索、サービス絞り込み、グリッド / リスト
- クリエイター検索とキャッシュ済み索引の再表示
- 正常な投稿、不正な投稿ルート、改訂なしの 404
- 設定変更と即時反映
- 320 / 390 / 768 / 1024 px のレイアウト
- レイアウト切り替え後のフォーカス・入力・結果の保持
- キーボードショートカットと戻る操作

ブラウザーの成功はネイティブ IPC、OS のファイル選択、WebView のキー処理、実機の保存を保証しません。

## 実機確認の記録

各ケースに次を記録します。秘密情報は記録しません。

```text
端末 / OS:
アプリ版 / コミット:
ビルド種別（製品 / debug / 診断）:
操作:
期待結果:
実際の結果:
保存先・ログの場所:
結果（成功 / 失敗 / 未実施）:
```

### Windows / macOS / Linux

- インストールまたは起動
- 公開投稿の取得と表示
- ログイン、お気に入り、フォロー（認証付き確認は別途記録）
- バックアップ / ログ / 言語ファイルの選択と保存
- 一括画像保存（本文、添付、外部ページ）
- 外部ページ（Referer 付与、URL バー、戻る、画像を保存、閉じる）
- 外部リンク、テーマ、レイアウト、アイコンキャッシュ

### Android

- インストールと起動
- 物理戻る、ホームへ戻る導線
- SAF の選択・キャンセル・保存・再読込
- `Documents/Downloads/<クリエイター名>/` の保存
- 外部ページの表示とチェック式画像保存
- 設定画面の縦積み、長いパスの折り返し
- DNS フィルタによる API / 画像失敗の切り分け

### iOS / iPadOS

- Files の `PawKemoViewer/Documents` 配下の表示
- JSON のコピー取り込み、書き出し、再読込
- 外部ページの表示と投稿への復帰
- 外部ページからの画像保存
- 横向き、セーフエリア、テーマアイコン
- iPhone と iPad を別の端末として記録

## 言語ファイルの実機確認

検証用データは[`docs/fixtures/`](fixtures/README.md)を使います。**製品版と診断版で実施項目を分けます。**

### 製品版

製品版で使えるのは、追加フォルダーの読み込みと言語フォルダーの同期です。

1. `qab.json` を追加フォルダーへ置き、「言語フォルダーを同期」で `QA Folder` が選べることを確認します。
2. アプリを再起動し、追加フォルダーの言語が再読込されることを確認します。

### 診断版

フロント `VITE_DEBUG_DIAG=1` と Cargo `debug-diag` の両方を有効にしたビルドを使います。

1. `qaa.json` をアプリ専用領域へ取り込み、`QA Import` が選べることを確認します。
2. `qac.json` を選び、数値である `nav.home` が理由として拒否され、一覧が変わらないことを確認します。
3. ファイル選択をキャンセルし、ファイルと言語一覧が変化しないことを確認します。
4. 書き出した JSON を開き直し、内容とサイズ上限を確認します。
5. アプリを再起動し、アプリ専用ファイルと追加フォルダーの両方が再読込されることを確認します。

## ドキュメントの確認

- 新規・削除した Markdown へのリンクが存在することを確認します。
- Wiki の正本 `docs/wiki/` を更新し、`scripts/sync-wiki.mjs` で GitHub Wiki 側を生成します。
- 版番号、ファイル名、コマンド、設定名をコードと照合します。
- `git diff --check` で空白と改行の差分を確認します。
- 公開手順や実測値を記載する場合は、その時点の Actions / Release と端末結果を確認します。

## 結果の報告

「CI が成功した」「実機で確認した」「ソースレビューだけ」を区別します。実行できなかった検証は、未実施として明記します。
