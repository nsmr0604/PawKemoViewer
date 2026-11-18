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
- リファラー偽装が必要な外部 URL は `pkv://` カスタムプロトコル(`http://pkv.localhost`)経由
- reqwest は `default-features = false` + `rustls-tls`(OpenSSL 不使用、Android 対応)

## Tauri コマンド引数

- Tauri v2 の引数は **camelCase**(Rust 側 snake_case → JS からは `sessionKey` 等)
- snake_case で渡すとバインドされず Option 引数が常に None になる(実害発生済み)

## コンテキスト管理 (常時読み込み・常時書き込み原則)

- **常時読み込み (作業着手前)**: セッション開始時・タスク着手時は、必ず `notes/` 配下のナレッジ (`index.md`, `sessions.md`, 関連 concept) を最初にすべて読み込み、現在の進捗・仕様・既知の罠・未解決事項を同期してから作業する
- **常時書き込み (気づいた時点)**: 開発上の発見・バグ・仕様変更・作業進捗・ノウハウは、作業中・作業完了時に**気づいた時点で `notes/` にすべて記録・追記する** (後回しにしない)
- コード修正時は、原因が分かった時点で該当ノート (`pawchive/bugs.md` や各 concept) に先に記録してから修正に着手する
- 会話コンテキストが長くなったら、内容を **`notes/` 以下に Markdown で落とし込み、以後そちらを参照**する
- `notes/` は gitignore で除外済み(ローカル限定、コミットしない)
- **開発上の発見・バグ・仕様・ノウハウは、気づいた時点で `notes/` にすべて記録する**
- **記法は OKF (Open Knowledge Format) v0.2 の軽量サブセット**(仕様詳細: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)

### notes/ バンドル構成

- ナレッジバンドルの実体は **`V:\OpenCode\knowledge\`** (OpenCode 全体共通・全セッション参照)。
  `notes/` は同実体へのジャンクションであり、記録・読み込みはどちらのパスでも同一バンドルを指す
- **ルート = 複数プロジェクトで再利用する共通知見**、
  **`<プロジェクト名>/` サブディレクトリ = プロジェクト固有の知見・成果物**。
  新規プロジェクトの固有知見は同名サブディレクトリにまとめる (現状: `pawchive/`、`pixiview/`)

```
notes/
├─ index.md            # バンドル目次 (frontmatter は okf_version のみ許可)
├─ log.md              # 更新履歴 (日付降順、YYYY-MM-DD 見出し)
│
│  # --- 共通 (ルート) ---
├─ env.md              # type: Reference   — 開発マシン環境
├─ github.md           # type: Reference   — GitHub / Actions 運用
├─ android-testing.md  # type: Reference   — Android 実機テスト (adb 共通操作)
├─ ui-reference.md     # type: Reference   — Android アプリ UI 参考
├─ jhentai.md          # type: Reference   — JHenTai 実機確認知見
├─ opencode.md         # type: Reference   — OpenCode 自体のノウハウ
├─ sessions.md         # type: Session Note — 進捗・未解決事項
│
│  # --- pawchive 固有 (pawchive/) ---
├─ pawchive/
│   ├─ pawchive-api.md  # type: Reference   — pawchive 実測仕様
│   ├─ tauri2.md        # type: Reference   — Tauri 2 の罠集
│   ├─ bugs.md          # type: Incident Log — バグ履歴
│   ├─ windows-testing.md # type: Reference — Windows テストマニュアル
│   ├─ pawchive-handoff-2026-11-18.md # type: Session Note — 引き継ぎ
│   └─ apk/             # 実測ログ・スクショ・旧 APK (成果物)
│
│  # --- pixiview 固有 (pixiview/) ---
└─ pixiview/
    └─ pixiview.md      # PixiView-KMP 非公式ビルドの実測知見
```

### 新規 concept ファイルの追加規約

- **プロジェクト固有の知見・成果物 (実測ログ/スクショ/スクリプト等) は
  `<プロジェクト名>/` サブディレクトリに置く** (例: `pawchive/`、`pixiview/`)。
  共通化できる知見 (adb 操作、環境、CI 運用など) はルートの concept に追記する
- **既存 concept の枠に収まらない知見 (新規プラットフォーム・新規ライブラリ・
  新規外部サービス等) は、既存ファイルに無理に混ぜず、
  新たな OKF 形式 markdown を作成して管理する** (例: GitHub 関連 → `github.md`)
- 判断基準: 既存ファイルの `title` / `description` / `tags` に自然に収まるか。
  「〜も含めました」的な寄せ集め (雑多ノート化) はしない
- 新規 concept 作成時は必ず:
  1. frontmatter (type / title / description / tags / generated) を付与
  2. `index.md` の目次に追記
  3. `log.md` に追記
- 既存 concept の内容が他ファイルへ移動する場合は、移動元に
  「〜は 〇〇.md に移動」のポインタを 1 行残す

- concept ファイル追加時は `index.md` の目次と `log.md` に必ず追記する

### frontmatter フィールド(本サブセットで使用する全フィールド)

| フィールド | 必須 | 値・例 | 説明 |
|---|---|---|---|
| `type` | **必須** | `Reference` / `Incident Log` / `Session Note` | 種別。未知の値は消費側が寛容に扱う |
| `title` | 推奨 | 任意の文字列 | 表示名 |
| `description` | 推奨 | 1 文 | 目次・検索用サマリ |
| `tags` | 任意 | `[pawchive, api]` | 横断分類 |
| `resource` | 任意 | URL / パス | 対象アセットの正規 URI |
| `status` | 推奨 | `draft` / `stable` / `deprecated` | ライフサイクル。省略時は `stable` |
| `generated.by` | **generated 内必須** | `opencode/glm-5.3-flash-free` | 書き手(アクター規約) |
| `generated.at` | 推奨 | `2026-11-17T00:00:00Z` | 最終内容更新時刻(ISO 8601 UTC) |
| `verified` | 任意 | `{ by, at }` またはリスト | 確認履歴。**人間確認時のみ記載** |
| `stale_after` | 任意 | ISO 8601 UTC 絶対時刻 | この時刻以降は陳腐とみなす |

### 追記・更新ルール

- 新規発見は該当 concept に追記し、`generated.at` を更新する
- 既存エントリと矛盾する場合は、**旧エントリを `status: deprecated` にして残し**、
  新規エントリを `draft` で追加 → 確認後に `stable` へ
- 人間が実機確認した項目は `verified: { by: human:..., at: ... }` を付与する
  (エージェントのみの確認では付与しない)
- 実測値・環境依存の情報には `stale_after` を設定(既定は記録日 + 90 日)。
  陳腐化したら再検証して `generated.at` / `stale_after` を更新する
- 機密情報(パスワード・鍵・セッションキー)は notes/ にも書かない
- `notes/` は gitignore 済み・コミットしない

### 採用しない OKF 機能(意図的除外)

- `sources` クレジビリティ信号(`author`/`usage_count`/`usage_window`)・脚注による出典帰属
- `Attested Computation` 型(`runtime`/`parameters`/`executor`/`attester`)
- `references/` ディレクトリ規約
- バンドル配布(git リポジトリ/tarball としての交換)

(旧 `knowledge.md` / `YYYY-MM-DD-session.md` 構成は concept 分割方式へ移行済み)

## API 規約

- pawchive API は `pawchive.pw/api/v1` 直アクセス。エンドポイントは Swagger スキーマに準拠
- 意図的に未実装: `fancards` / `links` / GET flag(追加しない)
- 負荷配慮: API スケジューラ・キャッシュ(`api.ts`)とクールダウン(`Favorites.tsx`)を維持

## ビルド / 署名

- ビルドは GitHub Actions に委任(ローカルビルドは検証のみ)
- Windows exe: 現在未署名(将来 eMudhra コード署名を予定)
- Android APK: `src-tauri/android-debug.keystore`(**Android SDK 標準手順の debug.keystore**)で署名
  - 標準手順: `%USERPROFILE%\.android\debug.keystore` に keytool で作成
    (パスワード `android` / alias `androiddebugkey` / `CN=Android Debug,O=Android,C=US`)
    をリポジトリへ同梱コピー(パスワードは公開定数のためコミット可)
  - **例外規定 (公開情報の鍵は直書き可)**: 仕様上公開されている値
    (標準 debug.keystore のパスワード `android` 等、誰でも作れる公開定数) は
    yml への直書きを許可する。逆に**非公開の鍵 (正式リリース鍵・API 鍵等) は
    yml 直書き禁止**で GitHub Secrets 経由とする。ローカルの値・再作成手順は
    `secret.md` に記録
  - 正式配布時はリリース鍵を Secrets 化し、debug.keystore もリポジトリから削除

## デバッグ診断コードの注入規約

- デバッグ用の診断コード (backup JSON ダンプ・詳細通信ログ等) は
  **ビルド時フラグで注入し、リリースビルドではコード自体を分離する**。
  実行時判定 (`cfg!(debug_assertions)` や is_debug コマンド) は使わない
- **フロントエンド**: `VITE_DEBUG_DIAG=1` → `src/debug.ts` の `DEBUG_DIAG` 定数。
  診断コードは `if (DEBUG_DIAG)` で囲み、リリースビルドでは定数畳み込みで
  バンドラが分岐ごと排除する
  - 開発サーバ (`npm run dev`): `.env.development` で自動有効
  - テスト用ビルド: `VITE_DEBUG_DIAG=1 npm run build`
  - CI: android.yml の workflow_dispatch input `debug_diag` (**リリース添付をスキップ**)。
    push (リリース) ビルドでは常に無効
- **Rust 側**: cargo feature `debug-diag` (src-tauri/Cargo.toml)。
  診断コードは `#[cfg(feature = "debug-diag")]` で書き、テスト用ビルドでのみ
  `--features debug-diag` を付ける

## エージェント作業領域

- opencode 自身がビルド・テスト・解析等で使う一時ファイルは
  **`V:\pawchive\.agent-work\`** に置く (gitignore 済み・コミット禁止)
- **C: ドライブ以下の規定ディレクトリ (%TEMP% 等) はなるべく使わない**。
  V: ドライブ以下が開発環境なので、作業領域・出力・中間ファイルはすべて V: 以下へ
- notes/ 同様、成果物として残すべきもの以外はコミットしない

## 検証ツール

- `src-tauri/examples/probe_api.rs`: アプリと同一の reqwest 構成で API/ログインを実測するプローブ

## ドキュメント

- README.md: ユーザー向け(詳細実装を書かない)
- docs/: 開発者向け
