# PawKemoViewer 開発ガイド

PawKemoViewer 0.5.5 の開発ガイドです。

- 対象読者: 開発参加者・ビルド担当者・コントリビューター
- ユーザー向け情報は [README](../README.md) を参照
- 関連: [STATUS](STATUS.md) (現状と残課題)、[BUILD](BUILD.md) (ビルド・CI)、
  [API](API.md) (API 仕様)、[設計資料](architecture/README.md)、[LICENSES](LICENSES.md)

## アーキテクチャ

```text
React 18 (TypeScript + Vite)
  ↓ invoke() (Tauri v2 コマンド)
Rust (reqwest / rustls)
  ↓ HTTPS
pawchive.pw / *.pawchive.pw

WebView → 画像 CDN (pawchive) / pkv プロキシ (外部メディア)
モバイル → ネイティブ外部ページビュー (外部リンク、Referer 付き)
```

- **WebView は API を直接 fetch しない**。API・ログイン・アイコンは Rust コマンド経由
- 画像・動画は WebView が CDN (`img / n1..n4 / t1..t4.pawchive.pw`) を直接参照する
- **Cloudflare 系の中継 (Pages / Workers / Functions / Wrangler / Reverse Proxy) は禁止**。
  pawchive が中継を検出し Fake site を返すため (実測済み)

## 技術スタック

| 層 | 技術 | 備考 |
|---|---|---|
| UI | React 18.3 + TypeScript (strict) | 関数コンポーネントと hooks |
| バンドラ | Vite 6 | PWA プラグイン不使用 |
| ランタイム | Tauri 2 | identifier `com.nsmr0604.pawkemoviewer` |
| バックエンド | Rust (edition 2024) + reqwest | `default-features = false` + rustls-tls |
| ストレージ | IndexedDB + localStorage + ファイル | 詳細は後述 |

## ディレクトリ構成

```text
src/
  api.ts                API クライアント (スケジューラ・キャッシュ・URL 生成)
  db.ts                 IndexedDB (クリエイター索引パック・既読)
  icons.ts              クリエイターアイコンの多段キャッシュ
  follows.ts            フォロー (アカウント同期)
  post-favorites.ts     お気に入り投稿の共有状態
  backup.ts             バックアップの書き出し・読み込み
  log.ts                アプリ内ログ (リングバッファ)
  build-flags.ts        ビルド時フラグ (VITE_DEBUG_DIAG)
  i18n.ts               日本語フォールバック・外部辞書の読み込み
  external-page.ts      外部ページビューの起動 (Android / iOS)
  pkv-probe.ts          pkv 疎通テスト (診断ビルドのみ)
  domain/               投稿 ID・元記事 URL などの純粋ロジック
  application/          ユースケースとリポジトリ契約
  infrastructure/       API・ストレージとユースケースの接続
  platform/             実行環境・サービス契約・デスクトップ／モバイル／Web アダプター
  components/           画面部品 (AppShell / PostGrid / PostThumbnail / Feedback など)
  pages/                HomePage / CreatorsPage / CreatorPage / PostPage / FavoritesPage /
                        LoginPage / SettingsPage
  post-content.ts       投稿本文 HTML の処理 (サニタイズ・URL 書き換え)
  post-files.ts         投稿ファイルの選別
  native-debug-log.ts   デバッグビルド用のファイルログ操作
  debug-log.ts          詳細ログ分割 (デバッグビルドのみ動的ロード)
src-tauri/
  src/lib.rs            Tauri コマンド・API・pkv プロキシ・ログ
  src/locale_storage.rs 言語ファイルの読み書きと保存場所の解決
  src/json_files.rs     ファイル選択・書き出しの共通 IPC
  src/main.rs           エントリポイント
  plugins/locale-picker モバイルの言語ファイル選択とランチャーアイコン
  plugins/external-view モバイルの外部ページビュー (Referer 付き)
  examples/probe_api.rs API 実測プローブ
  Cargo.toml            features: debug-diag
docs/                   開発者向け資料
.github/workflows/      ビルド・紹介サイト・Wiki 同期
```

## プラットフォーム層

- `src/platform/runtime.ts` が起動時に実行環境を判定し、desktop / mobile / web の
  アダプターを選ぶ。共通 UI は `platform/contracts.ts` の契約だけに依存する
- ストレージ・ログ・ネットワーク・ファイル選択・ライフサイクルはファミリー層を経由し、
  Tauri の invoke や OS の API は各アダプターに閉じ込める
- 依存境界は `npm run check:boundaries` が検査する
  (domain / application / infrastructure / presentation / platform の import 制約)

## 命名規則

- React の画面・コンポーネントは `PascalCase.tsx`。画面は `HomePage.tsx` のように `Page` で終える
- その他の TypeScript モジュールは `kebab-case.ts`。型は `PascalCase`、
  関数・変数は `camelCase`、定数は `UPPER_SNAKE_CASE`
- Rust のモジュール・関数・コマンド名は `snake_case`。Tauri コマンドの引数は
  JS 側で `camelCase`
- 外部 API のフィールド名・保存形式・ストレージキーは既存の形式に合わせる

## 開発環境

- Node.js 24+ / npm 10+ / Rust 1.90+ (rustup) / Android SDK (実機テスト時)
- Windows: VS BuildTools (C++) + Windows SDK
  - SDK の `um/x64` に `dbghelp.lib` が無い環境がある → 該当ライブラリを補って対処する

```bash
npm ci                    # ロックファイルに従って依存をインストール
npm run dev               # Vite 開発サーバ (localhost:5173)
npm run tauri:dev         # Tauri 開発実行 (Cargo feature debug-diag)
npm run tauri:android:dev # Android 開発実行 (Cargo feature debug-diag)
npm run build             # 境界・型の検査と本番ビルド
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --features debug-diag
```

## 重要な実装規約

### Tauri v2 コマンド引数は camelCase

Rust 側 `session_key` → JS からは `sessionKey`。**snake_case で渡すと Option が常に None**
になる (実害発生済み)。

### API 失敗のステータス復元

Rust は失敗時 `Err("STATUS=401 BODY=...")` 文字列を返し、JS 側は `ApiError(500)` で包む。
**ステータス分岐は必ず `apiStatus(err)` 経由** (`ApiError.status` は常に 500)。

### 既知の API 仕様の癖 (実測)

- `GET .../revisions` は改訂なし投稿で **404 + `[]`** → 「改訂なし」扱いにする
- 詳細の `tags` は **PostgreSQL 配列リテラル文字列** → `normalizeTags()` で正規化
- `account/favorites?type=post` は **PawPost 全フィールド** を返す (スリム形は artist のみ)
- 一覧のみ `substring` フィールドを持つ

### pkv プロキシ

WebView から Referer を設定できないため、リファラーチェックがある外部 URL を Rust 側で中継する。

- URL: Windows / Android は `http://pkv.localhost/file`、macOS / iOS / Linux は
  `pkv://localhost/file`。クエリは `u` (対象 URL) と `r` (Referer)
- 対象: ホットリンク対策ホスト (fanbox / patreon / pximg) と、投稿コンテキストのある外部ホスト。
  pawchive 本体は常に対象外
- Referer: `src/domain/post-referer.ts` が service / creatorId / postId から導出する。
  許可するのは fanbox.cc / patreon.com のみ
- 安全策: SSRF (内部アドレス・名前解決 IP)、リダイレクト検査、connect 10 秒 / 全体 180 秒、
  本文 64 MiB / HTML 8 MiB、4 ワーカー
- 詳細は [API 仕様](API.md#pkv-プロトコル) を参照

### 外部ページのネイティブビュー (Android / iOS)

reCAPTCHA を含む外部ページは pkv では動作しない (実オリジンと POST 本文が必要)。
投稿本文の外部リンクは `data-external-url` を持ち、モバイルでは
`open_external_page(url, referer)` で実オリジンのネイティブ WebView に Referer 付きで開く。
デスクトップは pkv を使う。実装は `src-tauri/plugins/external-view`。

### デバッグ診断コードはビルド時フラグ注入

`VITE_DEBUG_DIAG=1` (フロント) / Cargo feature `debug-diag` (Rust) をデバッグビルドで指定する。
通常の `tauri:dev` / `tauri:android:dev` と CI の debug ビルドで有効。
正式リリースではフロントフラグを `0`、Cargo feature を指定しない。

- Lite (製品版にも含む): セッション ID の手動入力・検証・保存。設定トグルで表示
- Full (デバッグビルド専用): 詳細ログ、ログフォルダ、バックアップ JSON ダンプ、
  API レスポンス本文、pkv 疎通テスト
- Full はフロントと Rust の両方でコンパイル制御し、製品版から除外する

## ストレージ構成

| 種別 | キー / 場所 | 内容 |
|---|---|---|
| localStorage | `pawkemo-settings` / `pawkemo-follows` / `pawkemo-fav-tab` / `pawkemo-scroll` / `pawkemo-search-history` | 設定・フォロー・タブ状態・スクロール・履歴 |
| IndexedDB | `pawkemoviewer` | creators パック索引 / seen (既読) / meta |
| IndexedDB | `pawkemo-icons` | クリエイターアイコンの data URL キャッシュ |
| ファイル | `app_data/icons/` | Rust 側アイコンキャッシュ (`{service}_{id}.webp`) |
| ファイル | `app_data/locales/` | 外部翻訳。追加フォルダーのファイルを重ねる |
| バックアップ | type `pawkemoviewer-backup` | 設定 + フォロー + 既読 (旧 `pawchive-backup` は 0.2.x) |

- 0.2.x (旧 Pawchive Viewer) からの引継ぎはバックアップの書き出し → 読み込み
  (identifier 変更でデータディレクトリが別になるため)
- クリエイター索引は単一パックレコード (約 10 万行を 1 文字列化し、decode 1 回でメモリ索引化)
- アイコンは メモリ → IndexedDB → Rust ディスク の 3 段キャッシュ (同一キーはリクエスト統合)
- モバイルの標準フォルダー: Android は `Documents`、iOS は Files 公開の `Documents`。
  `Languages` / `Backups` / `Logs` を用途別に使う

## パフォーマンス・負荷配慮

- API スケジューラ: 同時 3 / 最小間隔 250ms / GET キャッシュ TTL 60 秒 (最大 150 件)
- Favorites の新着チェックは 5 分クールダウン
- 画像は lazy loading とサムネ → 本体の 2 段フォールバック
- 無限スクロールは scroll / resize を `requestAnimationFrame` で集約する

## 多言語対応

- 同梱は日本語 (既定) と英語。`src/locales/ja.json` をキーと差し込み変数の基準にする
- 外部の言語ファイル (JSON) を追加・上書きできる。キーが無い場合は日本語で表示する
- 詳細は [表示言語と翻訳ファイル](wiki/Languages.md) と [API 仕様](API.md) を参照

### 別のリポジトリで紹介サイトと Wiki を公開

- GitHub Pages の公開元を `gh-pages` ブランチに設定し、Wiki を有効にする。
- GitHub Actions の **紹介サイトを公開** を実行すると、実行元のリポジトリ名とリリースから紹介サイトのリンクを更新する。
- **Wiki Sync** は実行元の Pages 設定から公開URLを取得する。別のURLを指定する場合は、リポジトリ変数 `PAGES_BASE_URL` にサブパスも含めて設定する。
- Wiki をローカルで生成する場合は、`GITHUB_SERVER_URL`、`GITHUB_REPOSITORY`、`REPOSITORY_DEFAULT_BRANCH`、`PAGES_BASE_URL` を設定して `node scripts/sync-wiki.mjs <出力先>` を実行する。

## テスト

```bash
npm run test:domain
npm run test:application
npm run test:platform
npm run check:boundaries
cargo test --lib   # 環境によっては CARGO_PROFILE_TEST_DEBUG=0
```

- ドメイン: 投稿識別子、元記事 Referer、言語ファイルの検証
- アプリケーション: ユースケース、ストレージ / ネットワークの契約
- プラットフォーム: 契約とアダプターの選択
- インストーラーからの起動確認や言語検証パッケージは [ビルドガイド](BUILD.md) を参照

## コーディング規約

- TypeScript は `strict`。`any` は禁止 (`unknown` を使う)
- `unknown` / `any` を JSX の子にしない (boolean 化してから)
- IndexedDB への直書き禁止 (`db.ts` / `icons.ts` のヘルパー経由)
- コミットメッセージは端的に (規約は `AGENTS.md` 参照)

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `cargo metadata` 失敗 | `cargo --version` / `rustup update` |
| Windows リンクで `dbghelp.lib` 欠落 | Windows SDK の該当ライブラリを補う |
| `cargo test` が LLVM OOM | `CARGO_PROFILE_TEST_DEBUG=0` を指定 |
| CI の Android が gradle 429 失敗 | Maven Central の一時障害。再実行で解消 |
| Android 実機で API・画像が出ない | `adb shell ping pawchive.pw` で名前解決先を確認し、DNS フィルターを見直す |
| `node_modules` 破損 | `rm -rf node_modules package-lock.json && npm install` |
| Vite キャッシュ破損 | `rm -rf dist node_modules/.vite` |

## 参考資料

- Tauri 2: https://tauri.app
- Rust: https://www.rust-lang.org
- React: https://react.dev / Vite: https://vitejs.dev
- pawchive API: [API.md](API.md) と Swagger UI (https://pawchive.pw/api/schema)
