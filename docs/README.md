# PawKemoViewer 0.6.0 ドキュメント

PawKemoViewer の利用者向け情報、開発者向け仕様、設計、検証手順をまとめた目次です。

- **対象バージョン**: 0.6.0（開発中）
- **最新の公開版**: 0.5.8（2026-11-26 時点）
- **仕様の正本**: このリポジトリのコード。文書と実装が異なる場合は、コードを確認して同じ変更で文書を更新します。

## 読み方

| 知りたいこと | 資料 |
|---|---|
| アプリの導入・操作 | [README](../README.md) / [Wiki](wiki/Home.md) |
| 現在の実装範囲、検証結果、残課題 | [開発状況](STATUS.md) |
| ローカル実行、CI、パッケージ、リリース | [ビルドガイド](BUILD.md) |
| コード構成、実装規約、テスト | [開発ガイド](DEVELOPMENT.md) |
| pawchive API、Tauri コマンド、pkv | [API 仕様](API.md) |
| 画面一覧、画面遷移、各画面の仕様 | [画面設計](screens/README.md) |
| データベース（IndexedDB）、Web Storage、ファイル配置 | [データ設計](data/schema.md) |
| フロントエンドの全モジュールと関数 | [フロントエンドリファレンス](reference/frontend.md) |
| Rust のコマンド・関数・資源制約 | [Rust リファレンス](reference/rust.md) |
| 一括画像保存の現行仕様 | [一括画像保存](features/image-download.md) |
| 層分割、プラットフォーム、データ、HTTP、UI | [設計資料](architecture/README.md) |
| 自動テストと実機確認の進め方 | [検証ガイド](verification.md) |
| 作業の引き継ぎ | [引き継ぎ手順](handoff/README.md) |
| アプリと依存ソフトウェアのライセンス | [ライセンス](LICENSES.md) |
| バージョンごとの変更 | [変更履歴](HISTORY.md) |
| コード監査の結果と対応順 | [2026-11-26 監査](audit/2026-11-26-code-audit.md) |

## 開発者向けの最短経路

```bash
npm ci
npm run tauri:dev
```

検証だけを行う場合は、[開発ガイド](DEVELOPMENT.md#検証コマンド)と
[ビルドガイド](BUILD.md#ローカルビルド検証用)を参照してください。

## 文書の役割

- `docs/wiki/`: 利用者向け。ページ単体で読めるようにし、開発者向け資料へのリンクは置きません。
- `docs/STATUS.md`: 現時点の事実だけを記載します。過去の経緯は `HISTORY.md` にまとめます。
- `docs/architecture/`: 現行の設計と理由を記載します。完了したマイルストーンや日記は残しません。
- `docs/screens/`: 画面ごとの構成、状態、操作、遷移を記載します。
- `docs/data/`: IndexedDB スキーマ、Web Storage のキー、ファイル配置を記載します。
- `docs/reference/`: フロントエンドと Rust の関数・コマンドを網羅するリファレンスです。
- `docs/audit/`: コード監査の結果と対応順です。詳細は `findings/` に分けています。
- `docs/handoff/`: 申し送りの形式と手順を記載します。状態の正本は `STATUS.md` です。
- `docs/fixtures/`: 実機検証用の小さなテストデータです。

## 更新時のルール

1. 実装を変更したら、関連する仕様・API・検証手順を同じ作業で更新します。
2. 手順は実際に実行できるコマンドとファイル名で書き、推定値や古い版番号を残しません。
3. 未確認の動作は「未確認」、未実装は「未対応」と明記します。
4. パスワード、セッションキー、Cookie、署名鍵、個人情報を文書やログへ載せません。
5. Wiki の正本は `docs/wiki/` です。これを編集し、`scripts/sync-wiki.mjs` で GitHub Wiki 側を生成します。
