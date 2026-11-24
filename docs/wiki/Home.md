# PawKemoViewer Wiki

[pawchive.pw](https://pawchive.pw) の非公式クライアント **PawKemoViewer** の開発者・利用者向けドキュメントです。

- ユーザー向けの概要と使い方は [README](https://github.com/nsmr0604/pawchive#readme)
- 表示言語の切替と言語の追加: [Languages](Languages)
- バックアップの保存・復元とログの書き出し: [Files](Files)
- ビルド (ローカル・CI・リリース): [Build](Build)
- 開発ガイド (構成・規約・テスト): [Development](Development)
- pawchive API と Tauri コマンド: [API](API)
- 現在のリリース状態と残課題: [Status](Status)
- リリースごとの変更: [History](History)

## 技術構成

React + Tauri 2 + Rust (reqwest) の構成です。Windows / Linux / macOS / Android に対応し、
iOS / iPadOS は未署名 IPA を生成します。Cloudflare を経由した中継は使いません
(正式構成は pawchive への直接アクセスのみ)。

## 主な機能

- 投稿一覧 (グリッド / リスト、サービス絞り込み、AI 除外) とクリエイター検索・フォロー
- 投稿詳細 (本文、画像・動画、コメント、改訂履歴、タグ、前後移動)
- お気に入り、URL 貼り付け、元サービスで開く
- 低通信モード、省データのリスト表示、サムネイル優先表示
- バックアップ / ログ / 言語ファイルの書き出し・読み込み
- 外部リンク: Android / iOS は元記事の Referer を付けたネイティブ外部ページビュー、
  デスクトップは pkv プロキシ
- ダーク / ライトテーマ、モバイルのアイコン切替、日本語 / 英語
