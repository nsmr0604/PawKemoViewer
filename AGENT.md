# AGENT.md — エージェント作業規約

## コミットメッセージ規約

- 端的に作業内容のみを記述する(例: `sessionKey 修正`、`APK 署名ステップ追加`)
- 余計な文言を入れない:挨拶・背景説明・経緯・感情的表現・"〜しました" 等の装飾は禁止
- 機密情報(パスワード・鍵・トークン)はメッセージに含めない
- 1 コミット = 1 作業内容。未 push コミットの改変(amend / force push)は最小限に

## アーキテクチャ規約(最重要)

- **Cloudflare 禁止**: Pages / Workers / Functions / Wrangler / Reverse Proxy は再提案しない
  (pawchive 側が Cloudflare 由来の中継を検出し `Fake site` を返す — 実測済み)
- 正式構成は **React + Tauri 2 + Rust + reqwest** 直叩きのみ
- リファラー偽装が必要な外部 URL は `paw://` カスタムプロトコル(`http://paw.localhost`)経由
- reqwest は `default-features = false` + `rustls-tls`(OpenSSL 不使用、Android 対応)

## Tauri コマンド引数

- Tauri v2 の引数は **camelCase**(Rust 側 snake_case → JS からは `sessionKey` 等)
- snake_case で渡すとバインドされず Option 引数が常に None になる(実害発生済み)

## コンテキスト管理

- 会話コンテキストが長くなったら、内容を **`notes/` 以下に Markdown で落とし込み、以後そちらを参照**する
- `notes/` は gitignore で除外済み(ローカル限定、コミットしない)

## API 規約

- pawchive API は `pawchive.pw/api/v1` 直アクセス。エンドポイントは Swagger スキーマに準拠
- 意図的に未実装: `fancards` / `links` / GET flag(追加しない)
- 負荷配慮: API スケジューラ・キャッシュ(`api.ts`)とクールダウン(`Favorites.tsx`)を維持

## ビルド / 署名

- ビルドは GitHub Actions に委任(ローカルビルドは検証のみ)
- Windows exe: 現在未署名(将来 eMudhra コード署名を予定)
- Android APK: `src-tauri/android-dev.keystore`(仮・開発用)で署名。正式配布時は Secrets 化してリポジトリから削除

## 検証ツール

- `src-tauri/examples/probe_api.rs`: アプリと同一の reqwest 構成で API/ログインを実測するプローブ

## ドキュメント

- README.md: ユーザー向け(詳細実装を書かない)
- docs/: 開発者向け
