# アーキテクチャの基準棚卸し

> この文書は **0.5.0 時点 (cf81e3d) の棚卸し記録** です。現在の構成は
> [開発ガイド](../DEVELOPMENT.md) を参照してください。移行完了後も経緯として残します。

基準: `cf81e3d` 時点の `0.5.0` (PR #12)。この棚卸しは当時の既存コードを記述したものである。

## M0.1 — エントリーポイントと依存関係

| エントリーポイント | 起動と依存関係 |
|---|---|
| ブラウザ / Vite | [index.html](../../index.html) は [src/main.tsx](../../src/main.tsx) を読み込む。`bootstrap()` は PlatformRuntime を初期化し、設定ストレージを初期化し、ロケールの検出と有効化を待ってから、React StrictMode と `App` をマウントする。`npm run dev` は Vite を起動し、`npm run build` は TypeScript の後に Vite を実行する。 |
| UI シェルとルート | [App.tsx](../../src/App.tsx) はハッシュの解析、ルート変更、ナビゲーションに [router.ts](../../src/router.ts) を使う。Home、Creators、Creator、Post、Favorites、Settings、Login を選択し、不正な投稿ルートを処理する。共有のナビゲーションレール、レイアウト選択、フォロー同期、ネイティブの戻る操作の処理はシェルにある。 |
| デスクトップ / モバイルホスト | [main.rs](../../src-tauri/src/main.rs) は `pawkemoviewer_lib::run()` を呼ぶ。[lib.rs](../../src-tauri/src/lib.rs) は `run` をモバイルのエントリーポイントとしても公開し、Tauri コマンド、ログ、`pkv` メディアプロトコルを登録する。[build.rs](../../src-tauri/build.rs) は `tauri_build::build()` を呼ぶ。 |
| Tauri フロントエンドの配線 | [tauri.conf.json](../../src-tauri/tauri.conf.json) は開発時にポート 5173 で Vite を実行し、フロントエンドのビルド後に `dist` をパッケージする。[default.json](../../src-tauri/capabilities/default.json) はメインウィンドウに `core:default` を宣言する。 |

```text
index.html -> main.bootstrap -> PlatformRuntime -> デスクトップ / モバイル / Web の各サービス
                           -> 設定 + ロケール -> App -> ルーター + 機能画面
機能画面 -> api / db / icons / follows / backup / i18n -> プラットフォームサービス、またはホスト API を直接呼ぶ
api.request / Login / icons -> Tauri invoke -> Rust コマンド -> reqwest / アプリローカルファイル
描画されたメディア -> オリジン/CDN または pkv プロトコル -> 対象となる外部メディア向けの Rust ハンドラー
```

画面と機能モジュールの間には、アプリケーションのコンポジションルートもリポジトリ層も存在しない。特に `api.ts` は設定、リクエストポリシー、エンドポイントのヘルパーを所有する。`db.ts` と `icons.ts` は永続化の詳細を所有しつつ、IndexedDB のオープンはプラットフォームアダプターへ委譲する。

## M0.2 — PlatformRuntime とサービスの網羅範囲

[Runtime](../../src/platform/runtime.ts) は機能側の利用者が動き出す前にシングルトンを初期化する。Tauri ウィンドウは `__TAURI_INTERNALS__` で検出する。OS ヘルパーはネイティブウィンドウではデスクトップかモバイルを選び、マーカーがない場合は Web を選ぶ。`getPlatformRuntime()` は初期化前に例外を投げる。`resetPlatformRuntimeForTests()` はシングルトンを消去する。

[contracts](../../src/platform/contracts.ts) はすべてのサービスを任意 (optional) として定義している。次の表は、プレースホルダーや未対応の操作を含め、登録済みのアダプターを記述する。[desktop](../../src/platform/families/desktop.ts)、[mobile](../../src/platform/families/mobile.ts)、[web](../../src/platform/families/web.ts) を参照。

| サービス | デスクトップ | モバイル | Web | 利用者 |
|---|---|---|---|---|
| `storage` / `sessionStorage` | WebView のローカル/セッションストレージ | 同上 | ブラウザのローカル/セッションストレージ | 設定、フォロー、検索履歴、お気に入りタブ、スクロール、投稿コンテキスト、フォローメタデータ |
| `indexedDatabase` | IndexedDB のオープン/アップグレード | 同上 | 同上 | `db.openDb`、`icons.openDb`。スキーマとトランザクションは利用者側に残る |
| `storageLocations` | ネイティブのプライベートパスとセカンダリパスの解決 | ネイティブのプライベートのみ、セカンダリは null を返す | なし | 利用する機能は見つかっていない |
| `files` | ネイティブのアプリプライベートへのエクスポート | 同上 | Blob ダウンロード | `backup.exportBackup`、設定のログ書き出し |
| `locale` | ネイティブのプライベート CRUD とセカンダリの一覧/書き込み | ネイティブのプライベート CRUD | 一覧は null、書き込みは拒否、削除は false を返す | `i18n.refreshLocales`、設定のロケール操作 |
| `clipboard` | WebView の Clipboard API | 同上 | ブラウザの Clipboard API | 設定のバックアップのコピー/貼り付け。Creators は依然として別のヘルパーを使う |
| `logging` | Tauri 経由の診断ログ追記 | 同上 | なし | `log` は `DEBUG_DIAG` で永続出力を切り替える |
| `lifecycle` | なし | Tauri の戻るイベントと終了 | 何もしない戻るリスナー、終了は拒否 | `App` のネイティブ戻る処理 |
| `permissions`、`database`、`network` | なし | なし | なし | 利用者なし。`database` と `network` は `unknown` として型付けられている。 |

ランタイムはすでに型付きの IndexedDB オープナーを公開している。`database` スロットには、その境界以外に確立された責務がない。現行の通信呼び出しはネットワーク境界の根拠になるが、スケジューリング、キャッシュ、エンドポイントポリシーは `api.ts` に属する。共有アダプターを切り出す前に、サービス欠如時の挙動、ストレージ検出の配置 (ネイティブモジュールは現在インポート時に評価している)、IndexedDB とライフサイクル登録の失敗/後始末の挙動を記録しておく。

## M0.3 — 機能とデータアクセス

| 機能 | アプリケーションとデータの依存関係 | 機能側に残る直接アクセスまたはポリシー |
|---|---|---|
| Home | `HomePage` → `api.posts`、設定、`history`、`useScrollMemory`、共有グリッド | ページング、フィルタリング、再試行の状態、ルートクエリの状態 |
| クリエイターの探索 | `CreatorsPage` → `api.creators`、`db.searchCreators` / `saveCreators`、`history`。`CreatorHeader` → プロフィール API とアイコンのヘルパー | 索引の再読み込みと検索戦略。`platform.readClipboardTextSafe` は `navigator.clipboard` を直接呼ぶ |
| クリエイタープロフィール | `CreatorPage` → `api.creatorPosts`、`CreatorHeader`、`FollowButton`、設定、スクロールメモリ | ページング、並べ替え、タグ選択 |
| 投稿詳細 | `PostPage` → 投稿/リビジョン/コメント、元リンク、お気に入りとフラグの API 呼び出し。`post-favorites`、`FollowButton`、アイコンとメディアのヘルパー | ID の照合、リビジョンの 404 処理、表示状態、セッションの投稿コンテキスト、DOM 描画、添付。検証済みのルートとメディアホストのポリシーの両方を維持する |
| お気に入りとフォロー | `FavoritesPage` → `api.creatorPosts` / `accountFavorites`、`db.getSeen` / `setSeen` / `updateSeenCheck`、`follows`。`post-favorites` はアカウントの投稿お気に入りを読み込む | クリエイターごとの 5 分間のクールダウン、タブの永続化、ローカル/リモート同期の判断。`FollowButton` もランタイムのストレージ経由でフォローメタデータを永続化する |
| ログイン | `LoginPage` → `invoke("login_request")` の直接呼び出し、Tauri の `getVersion`、設定、フォロー同期 | ログインの進行、エラー表示、ログイン後の遷移 |
| 設定と診断 | `SettingsPage` → 設定/アカウント API、`db`/`icons` 経由のキャッシュ情報とクリア、`i18n`、`backup`、ランタイムの locale/files/clipboard、Tauri の `getVersion` | ロケールの取り込みとサイズ検査、デスクトップの出し分け、バックアップ操作、ログ書き出し。`native-debug-log.ts` はネイティブログのヘルパーを直接呼ぶ |
| バックアップとロケール | `backup` は設定、フォロー、`db.replaceSeen`、ランタイムのファイル書き出しを使う。`i18n` は同梱の日本語、遅延読み込みの英語、ランタイムのロケール列挙を使う | バックアップはフォローを更新する前に閲覧状態を検証して復元する。ロケールの検出と辞書のマージはアダプターの外に残る |
| クリエイターのアバターとメディア | `components/CreatorAvatar.tsx` → `icons.getCreatorIcon`、`api` の URL ヘルパー。投稿本文/メディアは共有の URL ポリシーを使う | `icons` はメモリ内キャッシュ、IndexedDB、`fetch_creator_icon`、`creator_icon_cache_info`、`clear_creator_icon_cache` の直接 invoke を所有する。メディアはブラウザ URL と、対象となる外部アセット向けに登録された `pkv` パスを使う |

永続化とリクエストの境界:

- `db.ts` は IndexedDB `pawkemoviewer` (v1) を開き、`creators`、`seen`、`meta`、クリエイターパック/索引の扱い、閲覧状態のアトミックな置き換えを所有する。`icons.ts` は別の `pawkemo-icons` データベースを所有し、ファイルキャッシュは Rust に委譲する。
- `api.request` は `api_request` を直接呼ぶ。トランスポートを移す際は、同時 3 リクエストの上限、250 ms の間隔、GET キャッシュの TTL 60 秒、150 エントリの上限を維持する。`apiStatus` はラップされたエラーからネイティブのステータスを取り出す。Rust が reqwest による HTTPS 直叩きを所有する。
- いくつかの利用者は `services.storage ?? localStorage` ないし対応する session のフォールバックを使い、その後にアダプター形式の `get`/`set`/`remove` を呼ぶ。ネイティブの Web Storage は `getItem`/`setItem`/`removeItem` を公開する。フォールバックが動くとソースレベルの不整合になる。M1.2/M1.4 でストレージが無い場合やアクセス不能な場合を扱う。
- ルーター履歴、ビューポート/レイアウト、DOM 操作は表示層の関心事として残る。クリエイター検索とバックアップ対象の閲覧状態は、永続化とワークフローの境界をまたぐ。ユースケースとリポジトリを定義するときは、この所有権の区別を使う。

## M0.4 — 検証の基準

Codex Cloud の Debian 13 x86-64 上で、`cf81e3d` に対して Node.js 24、Rust 1.100.0、ワークスペースの WebKitGTK 4.1 ライブラリを使って実行した。

| チェック | 結果 |
|---|---|
| `npm ci --cache /workspace/scratch/pawkemoviewer-npm` | 合格。コミット済みの npm ロックファイルからインストールされた。 |
| `npm run build` と `npm run build:debug` | 合格。どちらも `db.ts` が静的と動的の両方でインポートされているという既存の Vite 警告を報告した。 |
| `cargo check --offline --manifest-path src-tauri/Cargo.toml -j 4` | 合格。ただし非診断のログイン実装に未使用変数の警告が 5 件あった。最初の `--locked` の試行は、前のアプリバージョンのローカルな `Cargo.lock` を拒否した。オフラインのチェックは、キャッシュ済みの依存を使って無視対象のロックファイルを更新した。 |
| `cargo check --locked --manifest-path src-tauri/Cargo.toml --features debug-diag -j 4` | 合格。更新されたロックファイルを使用した。 |
| `npm run dev -- --host 127.0.0.1 --port 5176 --strictPort` と CDP 経由のヘッドレス Chromium | 合格。ホーム/検索の UI が描画され、設定のハッシュルートで見出しが表示され、ブラウザの戻るでホームに戻った。ネイティブコマンド、認証付き API、外部メディアの挙動は確認していない。 |

### プラットフォームの網羅範囲と欠落

| 対象 | M0 での確認範囲 | 残る確認 |
|---|---|---|
| ブラウザ | 起動、設定ルート、ブラウザの戻る | ストレージ拒否/Web Clipboard のケース、IndexedDB の失敗、ダウンロードの挙動 |
| Linux Tauri | 診断コードあり/なしの Rust ホストチェック | ネイティブ GUI、IPC、ファイルシステム/ロケールの挙動、バックアップとログイン |
| Windows / macOS Tauri | ソースレビューのみ | ネイティブビルド、WebView ランタイム、ロケールの置き換え、クリップボード |
| Android | ソースレビューのみ | ネイティブビルド、戻るボタン/終了、共有ファイル選択の実現性 |
| iOS | ソースレビューのみ | ビルドと端末での検証、ライフサイクルの挙動、Files ピッカーの実現性 |

この基準には npm test スクリプトも、追跡対象のプラットフォーム契約スイートもない。ローカルのノート検索スクリプトは追跡対象のスイート外にある。デスクトップ/Android のワークフローは push ビルドで `main` を対象とし、手動ディスパッチにも対応する。Android には PR トリガーがなく、この基準には iOS のワークフローもない。M0 では GitHub Actions の実行、パッケージ、ネイティブ UI テスト、実機、ライブ API 操作のいずれも実施していない。

M1.1 では、記録した呼び出し箇所を使って型付きトランスポート境界の範囲を定め、冗長で未使用の `database` スロットを解消できる。既存の IndexedDB スキーマと API リクエストポリシーは、移行計画までそのまま維持する。
