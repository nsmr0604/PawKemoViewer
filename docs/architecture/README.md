# 設計資料

PawKemoViewer 0.6.0 の現行設計です。実装の詳細はコードを正とし、この資料は構成・責務・判断の理由を説明します。

| 資料 | 内容 |
|---|---|
| [レイヤーと起動時の構成](application.md) | ドメイン、アプリケーション、インフラ、プラットフォーム、表示層の責務 |
| [プラットフォームとストレージ](platform.md) | desktop / mobile / Web、OS 別ファイル操作、ネイティブプラグイン |
| [データ、キャッシュ、バックアップ](data.md) | 保存キー、IndexedDB、バックアップ、言語、キャッシュ |
| [HTTP User-Agent とヘッダー](http-user-agent.md) | API、pkv、一括保存、外部ページのヘッダーと Referer |
| [画面構成](adaptive-ui.md) | ルート、ナビゲーション、レイアウト、キーボード、モバイル表示 |
| [アイコン](icons.md) | マスター画像、生成、テーマ連動、プラットフォーム別の扱い |

## 構成の原則

1. **pawchive とは直接通信する**。Cloudflare Pages / Workers / Functions / Wrangler / リバースプロキシは使いません。
2. **WebView は pawchive API を直接 fetch しない**。API・ログインは Rust の Tauri コマンド経由で reqwest に送ります。
3. **OS 固有処理を共通 UI に散らさない**。`src/platform/` の型付き契約とアダプターに閉じ込めます。
4. **保存形式と既存キーを維持する**。引継ぎ・バックアップ・キャッシュの互換性を優先します。
5. **診断コードはビルド時に分離する**。製品版に Full 診断コードを含めません。
6. **秘密情報は端末内だけに保持する**。pawchive の session Cookie を外部ホストへ送らず、ログでもマスキングします。

## 関連資料

- [開発ガイド](../DEVELOPMENT.md): ディレクトリ構成、命名、実装規約
- [API 仕様](../API.md): エンドポイント、コマンド、イベント、pkv プロトコル
- [一括画像保存](../features/image-download.md): 抽出、保存、進捗、外部ページ連携
- [検証ガイド](../verification.md): 自動テストと実機確認
