# PawKemoViewer Wiki

[pawchive.pw](https://pawchive.pw) の非公式クライアント **PawKemoViewer** の開発者・利用者向けドキュメントです。

- ユーザー向けの概要と使い方は [README](https://github.com/nsmr0604/pawchive#readme) を参照してください
- 表示言語の切替と言語の追加: [Languages](Languages)
- ビルド (ローカル・CI): [Build](Build)
- 開発ガイド (構成・規約・テスト): [Development](Development)
- pawchive API の仕様: [API](API)

## 技術構成

React + Tauri 2 + Rust (reqwest) の構成です。Windows / Linux / macOS / Android に対応しています。
Cloudflare を経由した中継は使いません (正式構成は pawchive への直接アクセスのみ)。
