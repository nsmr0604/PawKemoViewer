# PawKemoViewer 0.6.0 開発ガイド

開発参加者、ビルド担当、コントリビューター向けの資料です。利用者向けの使い方は [Wiki](wiki/Home.md) を参照してください。

## 技術スタック

| 層 | 技術 |
|---|---|
| UI | React 18.3 + TypeScript strict |
| バンドラ | Vite 6（PWA プラグインは不使用） |
| デスクトップ / モバイル | Tauri 2 / Wry |
| ネイティブ | Rust edition 2024、MSRV 1.90 |
| HTTP | reqwest 0.12、`default-features=false`、rustls |
| 保存 | Web Storage、IndexedDB、OS のファイル |
| 多言語 | i18next + react-i18next、日本語 / 英語 JSON |
| テスト | Node test runner、Rust test、Python / Node のスモークテスト |

アプリ ID は `com.nsmr0604.pawkemoviewer` です。

## アーキテクチャ

```text
React
  → application / infrastructure
  → platform contracts
  → desktop / mobile / web adapters
  → Tauri invoke / Web API

Tauri / Rust
  → reqwest / rustls
  → pawchive.pw / *.pawchive.pw
  → pkv（対象となる外部メディア）
  → OS のファイル / ネイティブプラグイン
```

- pawchive API は Rust 経由で直接通信します。Cloudflare 系の中継は禁止です。
- 画像・動画の表示、投稿サムネイル取得、一括保存、外部ページはそれぞれ別経路です。
- ブラウザー単体の Web アダプターには pawchive API の network がなく、主にモック IPC の確認で使います。
- 層の責務と依存境界は[設計資料](architecture/application.md)を参照してください。

## ディレクトリ構成

```text
src/
  main.tsx                 起動・PlatformRuntime・設定・言語の初期化
  App.tsx                  シェル、ルート、キーボード、戻る操作
  router.ts                ハッシュルートと遷移
  api.ts                   pawchive API、スケジューラ、キャッシュ、Settings、URL 生成
  types.ts                 API / 画面の共有型
  domain/                  投稿識別子、Referer、locale 検証
  application/             ユースケース、リポジトリ契約、Composition Root
  infrastructure/          API / IndexedDB とアプリケーション契約の接続
  platform/                実行環境、契約、desktop / mobile / web アダプター
  components/              共有 UI、ナビ、投稿カード、診断、DownloadFab
  pages/                   Home / Creators / Creator / Post / Favorites / Login / Settings
  db.ts                    クリエイター索引と既読の IndexedDB
  icons.ts                 クリエイターアイコンの多段キャッシュ
  post-thumbnail-cache.ts  投稿サムネイルの IndexedDB キャッシュ
  follows.ts               pawchive を正とするフォロー同期
  post-favorites.ts        投稿お気に入りの共有状態
  backup.ts                バックアップの生成・検証・復元
  i18n.ts / locales/       同梱辞書、外部辞書の読み込み
  post-content.ts          本文 HTML のサニタイズと URL 書き換え
  post-files.ts            投稿ファイルの選別
  post-download.ts         一括保存の候補とコマンド呼び出し
  post-image-urls.ts       本文 / 添付 / 外部リンクの URL 抽出
  download-status.ts       一括保存の共有状態
  external-page.ts         外部ページの起動判定と画像選択の取り込み
  http-user-agent.ts       UA の選択と Rust への適用
  app-icon.ts              テーマとランチャーアイコンの同期
  log.ts / debug-log.ts    リングログと Full 診断の動的読み込み
  build-flags.ts           VITE_DEBUG_DIAG のビルド時定数

src-tauri/
  src/main.rs              desktop エントリーポイント
  src/lib.rs               Tauri コマンド、API、login、pkv、ログ、thumbnail / icon
  src/downloads.rs         一括画像保存
  src/external_page_desktop.rs  デスクトップの外部ページウィンドウと Referer 付与
  assets/external-page-overlay.js  外部ページへ差し込むツールバーと画像選択 UI
  src/locale_storage.rs    言語ファイル、保存先、追加フォルダー
  src/json_files.rs        JSON / ログのファイル選択と保存
  plugins/locale-picker/   Android SAF / iOS Files とアプリ専用保存
  plugins/external-view/   Android WebView / iOS WKWebView
  examples/probe_api.rs    API 実測プローブ
  app-icons/               3 枚のマスター画像

tests/
  domain.test.mjs
  application.test.mjs
  platform.test.mjs
  post-download.test.mjs
  ui_layout_smoke.py
  desktop_installed_smoke.py
  linux_installed_smoke.py
  android_installed_smoke.mjs

scripts/
  check-boundaries.mjs / check-locales.mjs
  dev-version.mjs / sync-version.mjs
  generate-icons.mjs / app-icon/
  sync-wiki.mjs
  ci/
```

## 開発環境

- Node.js 24+ / npm 10+
- Rust 1.90+（rustup）
- Windows: Visual Studio Build Tools（C++）と Windows SDK
- Android: Android SDK / NDK（実機ビルド時）
- macOS / iOS: Xcode と XcodeGen（CI または macOS で実行）

```bash
npm ci
npm run dev
npm run tauri:dev
npm run tauri:android:dev
```

- `npm run dev`: Vite 開発サーバー。`.env.development` で `VITE_DEBUG_DIAG=1`。
- `npm run tauri:dev`: アイコン生成 + Tauri + Cargo `debug-diag`。
- `npm run tauri:android:dev`: Android 開発実行 + `debug-diag`。

## 命名とコーディング規約

- React の画面・コンポーネント: `PascalCase.tsx`。画面は `Page` で終える。
- その他の TypeScript モジュール: `kebab-case.ts`。
- 型: `PascalCase`、関数 / 変数: `camelCase`、定数: `UPPER_SNAKE_CASE`。
- Rust のモジュール・関数・コマンド: `snake_case`。
- Tauri コマンドの JS 引数: **camelCase**。`session_key` は `sessionKey`。
- TypeScript は `strict`。`any` は使わず `unknown` を使う。
- `unknown` / `any` を JSX の子にせず、boolean 化してから描画する。
- IndexedDB への直接アクセスは UI から行わず、`db.ts` / `icons.ts` / `post-thumbnail-cache.ts` のヘルパーを使う。
- 既存 API のフィールド名、保存形式、ストレージキー、バックアップ形式を維持する。
- コミットメッセージは端的にし、秘密情報を含めない。

## 実装上の重要な規約

### Tauri の引数とエラー

Rust 側 `session_key` は JS から `sessionKey` で渡します。snake_case では Option が `None` になる実害があります。

Rust の非 2xx は `Err("STATUS=401 BODY=...")` を返し、JS は `ApiError(500)` で包みます。ステータス判定は必ず `apiStatus(error)` を使ってください。

### React hooks

早期 return がある画面では、すべての hook を return より前に置きます。投稿詳細で hook 順が変わり、本文が空白になる不具合が発生したことがあります。

### 設定の反映

設定をモジュール変数から読むだけでは上位が再描画されません。`updateSettings()` は `pawkemo-settings-changed` を発火し、`App` が購読します。

### pawchive API の癖

- 改訂履歴の 404 + `[]` は「改訂なし」。
- 詳細の `tags` は PG 配列リテラル文字列のことがある。
- 投稿お気に入りは PawPost 全フィールド + `faved_seq`。
- 一覧だけ `substring` を持つ。
- 動画の署名付き一時 URL はキャッシュしない。

### ファイルと OS

- キャンセルを保存成功として扱わない。
- Android は SAF、iOS は Files のコピー取り込み / 一時ファイル書き出し。
- 追加言語フォルダーとアプリ専用言語を混同しない。
- 製品版の任意 locale pick/save とアプリ専用 CRUD は `DEBUG_DIAG` 専用。

### 外部メディア

- pawchive 系は常に直接通信。
- pkv の Referer は FANBOX / Patreon または取得先と同一 hostname。
- 外部ページは全 OS でネイティブビュー。Android / iOS は `plugins/external-view`、
  デスクトップは `src-tauri/src/external_page_desktop.rs` の専用ウィンドウ。
- デスクトップの Referer 付与: Windows は WebView2 の `WebResourceRequested`、
  macOS は WKWebView の `loadRequest`、Linux は Referer 付き取得後の `load_html`。
- pkv はアプリ内に表示する外部画像 (`proxyImages`) だけに残る。
- session Cookie を外部ホストへ送らない。

## 診断のビルド分離

| 機能 | 製品版 Lite | Full |
|---|---|---|
| 手動 session 入力・検証 | 開発トグルで表示 | 表示 |
| アプリ内ログ | error 系 | info / warn / error |
| native HTTP 詳細 | なし | headers / body / status |
| ファイルログ | `pawchive.log` | `pawchive.log` + `debug-app.log` |
| ログフォルダーを開く | なし | あり |
| バックアップ JSON dump | なし | 手動操作であり |
| pkv 疎通テスト | なし | あり |
| 言語ファイル CRUD | なし | あり |
| iOS 外部ページ診断 | なし | あり |

Full はフロントの `VITE_DEBUG_DIAG=1` と Cargo の `debug-diag` を両方有効にします。片方だけでは UI と IPC がずれます。製品版には Full の実装を含めません。

ログには本文や署名付き URL が残り得ます。共有前に認証情報と個人情報を確認してください。

## 検証コマンド

```bash
npm run check:boundaries
npm run check:locales
npm run test:domain
npm run test:application
npm run test:platform
node --test tests/post-download.test.mjs
npm run build
npm run build:debug
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --features debug-diag
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

`post-download.test.mjs` は現在、npm scripts に含まれていません。個別に実行してください。`npm run build` はテストを実行しません。

詳細は[検証ガイド](verification.md)を参照してください。

## ドキュメントと Wiki

- 利用者向け Wiki の正本は `docs/wiki/`。編集後、`scripts/sync-wiki.mjs` で GitHub Wiki 側を生成します。
- 仕様変更は [API](API.md)、[設計資料](architecture/README.md)、[検証ガイド](verification.md) の関連箇所を同じ作業で更新します。
- 状態と残課題は [STATUS](STATUS.md)、リリースごとの変更は [HISTORY](HISTORY.md) に分けます。
- `notes/` はローカル用で Git 管理外です。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| Windows リンクで `dbghelp.lib` 欠落 | Windows SDK の `um/x64/dbghelp.lib` を補う |
| `cargo test` が LLVM OOM | `CARGO_PROFILE_TEST_DEBUG=0` を指定 |
| Android が Gradle / Maven 429 | 一時障害。Rust まで成功していれば失敗ジョブを再実行 |
| Android で API / 画像が出ない | `adb shell ping pawchive.pw` で DNS 解決先を確認し、フィルターを切り分ける |
| `node_modules` 破損 | `npm ci` で入れ直す |
| Vite キャッシュ破損 | `dist` と `node_modules/.vite` を削除して再ビルド |

現在の既知の不具合と制約は[STATUS](STATUS.md#5-既知の制約残課題)にまとめています。
