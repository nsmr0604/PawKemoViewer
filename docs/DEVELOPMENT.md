# PawKemoViewer 開発ガイド

PawKemoViewer 0.5.3 の開発ガイドです。

- 対象読者: 開発参加者・ビルド担当者・コントリビューター
- ユーザー向け情報は [README.md](../README.md) を参照
- 関連: [BUILD.md](BUILD.md) (ビルド・CI)、[API.md](API.md) (API 仕様)、[LICENSES.md](LICENSES.md) (帰属)

## アーキテクチャ

```text
React 18.3.1 (TypeScript + Vite)
  ↓  invoke() (Tauri v2 コマンド)
Rust (reqwest / rustls)
  ↓  HTTPS
pawchive.pw / *.pawchive.pw
```

- **WebView は直接 fetch しない**。API・ログイン・アイコンはすべて Rust コマンド経由
  (端末 DNS ブロック・UA 偽装・Cloudflare 中継検出回避のためクライアント直叩き)
- 画像・動画は WebView が直接 CDN (`img/n1..n3/t1..t4.pawchive.pw`) を参照する。
  pkv プロキシはホットリンク対策ホストや、元記事の Referer を付ける外部メディアを扱います。
- **Cloudflare 系の中継 (Pages / Workers / Functions / Wrangler / Reverse Proxy) は禁止**。
  pawchive が中継を検出し Fake site を返すため (実測済み)

## 技術スタック

| 層 | 技術 | 備考 |
|---|---|---|
| UI | React 18.3.1 + TypeScript (strict) | 関数コンポーネント・hooks のみ |
| バンドラ | Vite 6 | PWA プラグイン不使用 |
| ランタイム | Tauri 2 | identifier `com.nsmr0604.pawkemoviewer` |
| バックエンド | Rust (edition 2024) + reqwest | `default-features = false` + rustls-tls (OpenSSL 不使用) |
| ストレージ | IndexedDB + localStorage | 詳細は後述 |

## ディレクトリ構成

```text
src/                    フロントエンド
  api.ts                API クライアント (スケジューラ・キャッシュ・URL 生成)
  db.ts                 IndexedDB (クリエイター索引パック・既読)
  icons.ts              クリエイターアイコンの多段キャッシュ
  follows.ts            フォロー (アカウント同期)
  post-favorites.ts           お気に入り投稿の共有状態
  backup.ts             バックアップ書き出し/読み込み
  log.ts                アプリ内ログ (リングバッファ)
  build-flags.ts         ビルド時機能フラグ (VITE_DEBUG_DIAG)
  i18n.ts               日本語フォールバック・外部辞書の読み込み
  domain/               投稿 ID・元記事 URL・言語ファイル検査などの純粋ロジック
  application/          投稿・クリエイター・言語ファイルのユースケースとリポジトリ契約
  infrastructure/       API・ストレージとユースケースの接続
  native-debug-log.ts   デバッグビルド用の Tauri ファイルログ操作
  debug-log.ts          詳細ログ分割 (デバッグビルドのみ動的ロード)
  platform/             実行環境判定・サービス契約・デスクトップ／モバイル／Web アダプター
  components/           PostGrid / PostThumbnail / CreatorAvatar / Feedback / NavigationRail など
  pages/                HomePage / CreatorsPage / CreatorPage / PostPage / FavoritesPage / LoginPage / SettingsPage
  post-files.ts         投稿ファイルの選別
  post-content.ts       投稿本文 HTML の処理
src-tauri/
  src/lib.rs            Tauri コマンド登録・API・pkv:// プロキシ
  src/locale_storage.rs 言語ファイルの読み書きと保存場所の解決
  src/json_files.rs     設定画面のファイル選択と書き出し
  src/main.rs           エントリポイント
  examples/probe_api.rs API 実測プローブ
  Cargo.toml            features: debug-diag
docs/                   本ドキュメント群
.github/workflows/      プラットフォーム別ビルド・紹介サイト・Wiki 同期
```

## 命名規則

- React の画面・コンポーネントのファイル名は `PascalCase.tsx`。画面は `HomePage.tsx` のように `Page` で終え、主コンポーネントと同じ名前にする。起動ファイルは `main.tsx`。
- TypeScript の非 UI モジュールは `kebab-case.ts`。型は `PascalCase`、関数と変数は `camelCase`、モジュールの定数は `UPPER_SNAKE_CASE`。
- Rust のモジュール、関数、Tauri コマンド名は `snake_case`。Tauri コマンドの引数名はフロントエンド側で `camelCase`。
- 外部 API のフィールド名・保存形式・ストレージキーは、対応する既存の形式に合わせる。

## 開発環境

- Node.js 24+ / npm 10+ / Rust 1.90+ (rustup) / Android SDK (実機テスト時)
- Windows の場合: VS BuildTools (C++) + Windows SDK
  - **注意: SDK の `um/x64` に dbghelp.lib が無い環境あり** → Windows SDK の該当ライブラリを補って対処する

```bash
npm ci               # ロックファイルに従って依存をインストール
npm run dev          # Vite 開発サーバ (localhost:5173)
npm run tauri:dev    # Tauri 開発実行 (Cargo feature debug-diag)
npm run tauri:android:dev # Android 開発実行 (Cargo feature debug-diag)
npm run build        # 境界・翻訳・型の検査と本番ビルド
cargo check --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml --features debug-diag   # 診断ビルド
```

## 重要な実装規約

### Tauri v2 コマンド引数は camelCase
Rust 側 snake_case → JS からは `sessionKey` 等。**snake_case で渡すと Option が常に None** になる (実害発生済み)。

### API 失敗のステータス復元
Rust は失敗時 `Err("STATUS=401 BODY=...")` 文字列を返し、JS 側は `ApiError(500)` で包む。
**ステータス分岐は必ず `apiStatus(err)` 経由** (`ApiError.status` は常に 500)。

### 既知の API 仕様癖 (実測)
- `GET .../revisions` は改訂なし投稿で **404 + `[]`** → 「改訂なし」扱いにする
- 詳細の `tags` は **PostgreSQL 配列リテラル文字列** (`"{\"one piece\"}"`) → `normalizeTags()` で正規化
- `account/favorites?type=post` は **PawPost 全フィールド** を返す (スリム形は artist のみ)
- 一覧のみ `substring` フィールドを持つ

### pkv プロキシ (`pkv://` / `http://pkv.localhost/`)
WebView から Referer を設定できないため、リファラーチェックがある外部 URL を Rust 側で中継する。
`/file?u=<対象URL>&r=<リファラー>`。URL 形式は OS で異なり、Windows / Android は
`http://pkv.localhost/file`、macOS / iOS / Linux は `pkv://localhost/file` になる (Tauri の仕様)。
対象はホットリンク対策ホスト (fanbox / patreon / pximg) と、投稿コンテキストのある外部ホスト。
pawchive 本体 (`pawchive.pw` / `*.pawchive.pw`) は除外し、常に WebView / Rust から直接取得する。
`r` に指定できるのは fanbox.cc / patreon.com のページのみ。Referer は投稿の正規 URL (canonical) を
優先して付与し、service / creatorId / postId から導出する (`src/domain/post-referer.ts`)。
SSRF 対策 (内部アドレス拒否) あり。名前解決後の IP も検査し、private / loopback / link-local /
CGNAT を拒否する。
資源制御として、connect 10 秒 / 全体 180 秒のタイムアウト、本文 64 MiB (HTML は 8 MiB) の上限
(超過は 413)、4 ワーカーでの処理、リダイレクトは最大 5 回で各ホップを同じ検査に通す。
reCAPTCHA を含む外部ページは pkv では動作しない (実オリジンと POST 本文が必要) ため、
投稿本文の外部リンクは Android / iOS では `open_external_page` で実オリジンのネイティブ WebView に
Referer 付きで読み込む (`src-tauri/plugins/external-view`)。デスクトップは pkv を使う。

### デバッグ診断コードはビルド時フラグ注入
`VITE_DEBUG_DIAG=1` (フロント) / Cargo feature `debug-diag` (Rust) をデバッグビルドで常に指定する。
通常の `tauri:dev` / `tauri:android:dev` と CI の debug ビルドで有効。正式リリースではフロントフラグを `0`、Cargo feature を指定しない。
Lite はセッションIDの手動入力・検証・保存で、製品版にも含めて設定トグルから利用可能。Full は詳細ログ・ログフォルダ操作・バックアップJSONダンプで、フロント DEBUG_DIAG と Rust `#[cfg(feature = "debug-diag")]` の双方により製品版からコンパイル除外する。
Full の **pkv プロキシ疎通テスト** では外部画像の読み込みと内部アドレスの拒否を確認できます。Android では `Pawchive::Proxy` の logcat も確認します。製品版のエラー記録範囲は [API 仕様](API.md) を参照してください。

## ストレージ構成 (v0.3.0 のキー体系)

| 種別 | キー | 内容 |
|---|---|---|
| localStorage | `pawkemo-settings` / `pawkemo-follows` / `pawkemo-fav-tab` / `pawkemo-scroll` / `pawkemo-search-history` | 設定・フォロー・タブ状態・スクロール・履歴 |
| IndexedDB | `pawkemoviewer` (DB) | creators パック索引 / seen (既読) / meta |
| IndexedDB | `pawkemo-icons` (DB) | クリエイターアイコンの data URL キャッシュ |
| ファイル | `app_data/icons/` | Rust 側アイコンキャッシュ (`{service}_{id}.webp`) |
| ファイル | `app_data/locales/` | アプリ専用の外部翻訳。追加フォルダーのファイルはこの辞書に重ねる |
| バックアップ | type `pawkemoviewer-backup` | 設定+フォロー+既読 (旧 `pawchive-backup` は 0.2.x 系) |

- **0.2.x (旧 Pawchive Viewer) からの引継ぎはバックアップ書き出し→読み込み**が正式手順
  (identifier 変更によりデータディレクトリが別になるため)
- クリエイター索引は**単一パックレコード** (約 10 万行を 1 文字列化・decode 1 回でメモリ索引化)
- アイコンは メモリ → IndexedDB → Rust ディスク の 3 段キャッシュで再利用 (同一キーはリクエスト統合)

## パフォーマンス・負荷配慮

- API スケジューラ: 同時 3 / 最小間隔 250ms / GET キャッシュ TTL 60 秒 (最大 150 件)
- Favorites の新着チェックは 5 分クールダウン
- 画像は lazy loading + サムネ→本体の 2 段フォールバック (失敗時は非表示プレースホルダ)

## 翻訳の追加と検証

- `src/locales/ja.json` を翻訳キーと差し込み変数の基準とします。組み込み言語を追加する際は、同じキーを翻訳し、`src/i18n.ts` の同梱辞書一覧に登録します。
- `npm run check:locales` は全同梱辞書を検査し、違反の種類とキーを出力します。CI が使う `npm run build` とローカルの `npm run build:debug` に組み込まれています。
- `src/domain/locale-validation.ts` は外部ファイルの取り込みと再読み込みでも使います。未知キー、空文字・非文字列、差し込み変数の不一致を検出します。外部辞書だけは部分翻訳を許可します。

## テスト

```bash
npm run test:domain
npm run test:application
npm run test:platform
```

アプリケーションテストでは言語ファイルの取り込み結果、上書きの優先順位、日本語へのフォールバックを確認します。インストーラーからの起動確認やモバイル向けの独立した言語検証パッケージは [ビルドガイド](BUILD.md) を参照してください。

## コーディング規約

- TypeScript `strict`。`any` 禁止 (`unknown` を使用)
- `unknown` / `any` を JSX の子にしない (boolean 化してから)
- IndexedDB への直書き禁止 (db.ts / icons.ts ヘルパー経由)
- コミットメッセージは端的に (規約は AGENTS.md 参照)

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `cargo metadata` 失敗 | `cargo --version` / `rustup update` |
| Windows リンクで dbghelp.lib 欠落 | 自作 lib (env.md の手順) |
| CI の Android が gradle 429 失敗 | Maven Central 一時障害。再実行で解消 (実測) |
| Android 実機で API・画像が出ない | `adb shell ping pawchive.pw` で名前解決先を確認する。DNS フィルターが遮断している場合は、端末またはルーターの DNS フィルター設定を見直す |
| node_modules 破損 | `rm -rf node_modules package-lock.json && npm install` |
| Vite キャッシュ破損 | `rm -rf dist node_modules/.vite` |

## 参考資料

- Tauri 2: https://tauri.app
- Rust: https://www.rust-lang.org
- React: https://react.dev / Vite: https://vitejs.dev
- pawchive API 仕様: [API.md](API.md) および Swagger UI (https://pawchive.pw/api/schema)


## プラットフォーム層

起動時に `src/platform/runtime.ts` が実行環境を特定します。共通のサービス契約に対して、デスクトップ、モバイル、Web の実装を選びます。ユースケースはリポジトリ契約に依存し、Tauri コマンドや OS のファイル選択はプラットフォーム実装が扱います。

設計は [プラットフォーム抽象化](PLATFORM_ABSTRACTION.md)、移行の経緯は [プラットフォーム監査](PLATFORM_AUDIT.md) を参照してください。
