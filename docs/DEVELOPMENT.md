# Development Guide

PawKemoViewer の開発者向けドキュメント。対象: コントリビューター / ビルド担当 / 検証者。

---

## 技術構成

```text
Frontend      React 18 + TypeScript + Vite
Desktop/Mobile   Tauri 2 (Windows / Linux / macOS / Android)
Backend       Rust + reqwest (rustls・brotli/gzip) — すべての通信は Rust 経由
Storage       IndexedDB (クリエイター索引・既読・アイコン) + localStorage (設定)
```

Cloudflare (Pages / Workers / Functions / Reverse Proxy) は使用禁止。
pawchive が Cloudflare 由来の中継を検出してFake site を返すため (実測)。

---

## 開発環境

| 要件 | バージョン | 備考 |
|---|---|---|
| Node.js | 24+ | `node --version` |
| Rust | 1.90+ | `rustup` で導入。Windows は MSVC + Windows SDK (C++ ワークロード) |
| Android (任意) | Android SDK + JDK 17 | 実機ビルド時のみ |

```bash
git clone https://github.com/nsmr0604/pawchive.git
cd pawchive
npm install
```

---

## ソース構成

```text
src/
  api.ts          API レイヤ (エンドポイント・スケジューラ・キャッシュ・URL ビルダ)
  db.ts           IndexedDB (クリエイター索引パック・既読・移行)
  follows.ts      フォロー (アカウント同期ミラー)
  favstate.ts     お気に入り投稿 ID の共有キャッシュ
  icons.ts        クリエイターアイコンのキャッシュ (メモリ→IndexedDB→Rust)
  backup.ts       バックアップ書き出し/復元
  log.ts          アプリ内ログ (リングバッファ 400 件)
  debug.ts        デバッグ診断フラグ (DEBUG_DIAG・ビルド時注入)
  router.ts       ハッシュルータ
  hooks.ts        useDebounced / useScrollMemory など
  types.ts        API 型
  components.tsx  PostCard / PostRow / Thumb / CreatorAvatar など
  components/FollowButton.tsx
  pages/          Home / Creators / CreatorPage / PostPage / Favorites / Login / Settings
src-tauri/
  src/lib.rs      Tauri コマンド (api_request / login_request / fetch_creator_icon /
                  export_log / export_file / paw:// プロトコルハンドラ)
  src/main.rs     エントリポイント
  examples/probe_api.rs  reqwest 実測プローブ
  tauri.conf.json identifier: com.nsmr0604.pawkemoviewer
```

---

## 主要コマンド

```bash
npm run dev            # Vite 開発サーバ (http://localhost:5173)
npm run build          # tsc + Vite 本番ビルド → dist/
cargo check            # Rust 型検査 (src-tauri/)
npm run tauri:dev      # デスクトップ開発実行
npm run tauri:build    # デスクトップリリースビルド
npm run tauri android init   # Android 初期化 (要 SDK)
npm run tauri android build # APK ビルド
```

---

## 設計メモ

### 通信
- React は `fetch` を使わず `invoke("api_request")` で Rust に委譲
- **Tauri v2 コマンド引数は camelCase** (`session_key` ではなく `sessionKey`)。
  snake_case で渡すと Option が常に None になる (実被害済み)
- API エラーは文字列 `STATUS=401 BODY=...` で返る → `apiStatus(err)` で判定

### ストレージキー (v0.3.0 で pawkemo-* 系に統一)
- localStorage: `pawkemo-settings` / `pawkemo-follows` / `pawkemo-fav-tab` / `pawkemo-scroll` / `pawkemo-search-history`
- IndexedDB: `pawkemoviewer` (索引/既読) / `pawkemo-icons` (アイコン)
- バックアップ形式: `pawkemoviewer-backup` (フォロー・既読・設定を含む。sessionKey 含むため取り扱い注意)

### クリエイター索引 (db.ts)
- 全クリエイター (約 10 万件) を 1 IndexedDB レコードのパック形式で保存 (約 5MB)
- `public_id` (fanbox slug) を保持し、URL 貼り付け検索・元サービスリンクに使用

### デバッグ診断コード (ビルド時注入)
- フロントエンド: `VITE_DEBUG_DIAG=1` → `src/debug.ts` の `DEBUG_DIAG`
  - `npm run dev` は `.env.development` で自動有効
- Rust: cargo feature `debug-diag` (`--features debug-diag`)
- 診断機能: backup JSON 全文ダンプ / API 失敗詳細ログ / `debug-app.log` 常時追記
- **リリースビルドでは定数畳み込みでコード自体が分離される** (診断文字列がバンドルに出ないことを実測確認済み)

### コーディング規約
- TypeScript: `strict` / `any` 禁止 (`unknown` を使う) / `unknown` を JSX 子にしない
- React: 関数コンポーネント + フック
- CSS: `src/styles.css` 単一 (CSS Modules 不使用)
- コミットメッセージ: 作業内容のみ簡潔に (装飾・経緯を含めない)

---

## ドキュメント構成

| ファイル | 内容 |
|---|---|
| README.md | ユーザー向け概要 (詳細実装を書かない) |
| docs/API.md | pawchive API とアプリ API レイヤの対応 |
| docs/BUILD.md | ビルド・CI・リリースフロー |
| docs/DEVELOPMENT.md | 本ドキュメント |
| docs/LICENSES.md | 第三者ライセンス帰属 |

詳細な API 実測仕様・設計判断の経緯は開発ナレッジ (非公開) を参照のこと。
