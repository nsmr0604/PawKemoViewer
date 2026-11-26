# ビルドガイド

PawKemoViewer 0.6.0 のローカルビルド、GitHub Actions、パッケージ、リリースの手順です。

## 基本方針

- 通常の配布ビルドは GitHub Actions に委任します。ローカルビルドは検証用です。
- 開発版は `debug-latest` プレリリースへ公開します。
- 正式版は `main` へ統合後、4 つのビルドワークフローを `release=true` で実行します。
- CI はビルド、静的検査、任意のスモーク確認を行います。Node / Rust の unit test は CI では実行しません。

## ワークフロー

| ワークフロー | push で実行 | 手動 input | 主な成果物 |
|---|---|---|---|
| Build Tauri (`tauri.yml`) | `main` と `X.Y.Z` ブランチ、対象パス変更時 | `release` / `windows_smoke` / `linux_smoke` / `artifact_only` | Windows setup / msi、Linux AppImage / deb / rpm |
| Android Build (`android.yml`) | 同上 | `release` / `locale_test` / `artifact_only` | universal / ABI APK |
| iOS Build (`ios.yml`) | なし | `release` / `locale_test` / `artifact_only` | 未署名 IPA |
| macOS Build (`macos.yml`) | なし | `release` / `installed_smoke` / `artifact_only` | DMG / app.tar.gz |
| Wiki Sync (`wiki.yml`) | default branch の `docs/**`、README、同期スクリプト等 | なし | GitHub Wiki |
| 紹介サイト (`pages.yml`) | 4 ビルドの成功時 | なし | `gh-pages/release.json` |

pull_request トリガーはありません。PR の検証はローカルまたは手動ワークフローで行います。

## ローカルビルド（検証用）

```bash
npm ci
npm run build
npm run build:debug
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --features debug-diag
npm run tauri:dev
npm run tauri:android:dev
npm run icons:generate
```

- `npm run build`: 依存境界、辞書、型検査、製品版フロントエンド。
- `npm run build:debug`: `VITE_DEBUG_DIAG=1` のフロントエンド。
- `npm run tauri:dev`: アイコン生成 + Tauri + Cargo `debug-diag`。
- `npm run tauri:android:dev`: Android 開発実行 + `debug-diag`。
- Rust テスト: `cargo test --lib --manifest-path src-tauri/Cargo.toml`。
- メモリ不足時: `CARGO_PROFILE_TEST_DEBUG=0` を指定。

## 診断のビルド分離

| ビルド | フロント | Rust | 公開先 |
|---|---|---|---|
| 開発版 | `VITE_DEBUG_DIAG=1` | `--features debug-diag` | `debug-latest` |
| 製品版 | `VITE_DEBUG_DIAG=0` | feature なし | `pawkemoviewer-vX.Y.Z` |

Full 診断には API / login / icon / pkv の HTTP 詳細、`debug-app.log`、pkv 疎通テスト、iOS 外部ページ診断が含まれます。製品版には含めません。

製品版の Lite 機能として、手動 session の入力・検証と開発項目トグルは残ります。

## バージョニング

- 形式: `X.Y.Z`。`main` と開発ブランチには次にリリースする番号を置きます。
- 不具合修正のみ: PATCH +1。機能追加: MINOR +1、PATCH を 0 に戻します。
- 単一の正本は `package.json`。`src-tauri/tauri.conf.json` はそれを参照し、Cargo.toml は `npm run sync:version` で同期します。

```bash
npm version 0.6.0 --no-git-tag-version
npm run sync:version
```

### 開発版の表示

CI は `scripts/dev-version.mjs` で `git rev-list --count HEAD` を使い、`X.Y.Z+<コミット数>` に書き換えます。

- 更新: `package.json`、`package-lock.json` の root version、`src-tauri/Cargo.toml`
- `Cargo.lock` はスクリプトでは更新しない
- アプリ表示: `X.Y.Z+<コミット数> (<短縮SHA>)`
- 製品版表示: `X.Y.Z (<短縮SHA>)`
- `VITE_BUILD_REV` / run number は現行の表示には使用しない

`+` は Linux バンドラーが `-` の build metadata を拒否するため使います。全プラットフォームで同じコミット数になるよう、checkout は `fetch-depth: 0` です。

### Cargo.lock

`src-tauri/Cargo.lock` は gitignore 対象で、追跡していません。clean checkout の CI は Cargo が都度解決します。Rust の推移依存は npm lock ほど再現性が高くありません。

## 開発ブランチとリリース

1. 次期番号（例: `0.6.0`）のブランチで開発します。
2. 番号ブランチへの push で Windows / Linux / Android の開発版が走ります。
3. 製品版を出す前に `main` へ統合します。
4. 4 つのビルドワークフローを `release=true` で実行します。
5. すべての success とリリースアセットを確認してから公開完了とします。

ワークフロー自体はブランチを強制しません。運用として `main` から実行してください。

## 成果物とファイル名

### 0.5.8 以降の正式版

publish スクリプトは固定名で公開します。

| プラットフォーム | ファイル名 |
|---|---|
| Windows | `PawKemoViewer.exe` / `PawKemoViewer.msi` |
| Linux | `PawKemoViewer.AppImage` / `PawKemoViewer.deb` / `PawKemoViewer.rpm` |
| macOS | `PawKemoViewer.dmg` / `PawKemoViewer.app.tar.gz` |
| Android | `PawKemoViewer.apk`（universal） |
| iOS / iPadOS | `PawKemoViewer.ipa`（未署名） |

### 開発版

版とコミット数を含む名前です。例:

- `PawKemoViewer_0.6.0+<commit-count>_x64-setup.exe`
- `PawKemoViewer_0.6.0+<commit-count>_amd64.deb`
- `PawKemoViewer_0.6.0+<commit-count>_universal.apk`
- `PawKemoViewer_0.6.0+<commit-count>_ios-unsigned.ipa`

macOS の debug app.tar.gz は `PawKemoViewer_aarch64.app.tar.gz`、DMG は Tauri が生成した版入り名です。

### 0.5.7 の実例（旧形式）

0.5.7 は固定名ポリシー移行前の版入り名です。

- `PawKemoViewer_0.5.7_x64-setup.exe`
- `PawKemoViewer_0.5.7_amd64.deb`
- `PawKemoViewer_0.5.7_aarch64.dmg`
- `PawKemoViewer_0.5.7_universal.apk`
- `PawKemoViewer_0.5.7_ios-unsigned.ipa`

`debug-latest` はプラットフォームごとに更新時刻が異なります。macOS DMG と iOS IPA は push では更新されません。

## Actions artifact と公開条件

| workflow | artifact | publish をスキップする条件 |
|---|---|---|
| Build Tauri | `PawKemoViewer-windows-latest` / `PawKemoViewer-ubuntu-24.04` | `artifact_only=true`、`windows_smoke=true`、`linux_smoke=true` |
| Android Build | `pawchive-android` | `artifact_only=true`、`locale_test=true` |
| iOS Build | `pawchive-ios` | `artifact_only=true`、`locale_test=true` |
| macOS Build | `PawKemoViewer-macos` | `artifact_only=true`、`installed_smoke=true` |

`release=true` と smoke / locale_test の併用は拒否されます。成果物だけを検証する場合は `release=false` にしてください。

## 検証モード

- `windows_smoke`: その実行の NSIS をインストールして起動し、公開投稿 API の HTTP 200 を確認。
- `linux_smoke`: その実行の DEB をインストールし、Xvfb / AT-SPI で Home と公開 API を確認。
- `installed_smoke`: macOS の DMG から起動し、公開 API を確認。
- `locale_test`: Android / iOS のアプリ ID を `com.nsmr0604.pawkemoviewer.localetest` に変更。テストスクリプト自体は実行しない。

## プラットフォーム別のビルド

### Windows / Linux

- `tauri.yml` が `windows-latest` と `ubuntu-24.04` で並列ビルド。
- Windows NSIS の MZ ヘッダー、Linux DEB の実行ファイルと PNG アイコンを常設検査。
- Windows の NSIS フックは外向き通信の firewall rule を登録。失敗してもインストールは続行。

### Android

- Node 24 / Java 17 / Android SDK 35 / Build Tools 35.0.0。
- APK を zipalign し、`src-tauri/android-debug.keystore` で署名、`apksigner verify`。
- 開発版・製品版とも debug.keystore。Play ストア配布ではありません。

### iOS / iPadOS

- `macos-15`、XcodeGen、`aarch64-apple-ios`。
- iPhone / iPad 共通の unsigned IPA。
- Files 用 3 キー、既定 / 代替アイコン、`UIDeviceFamily`、診断コマンドの有無を静的に検査。
- 実機導入には再署名が必要。

### macOS

- `macos-15`、Apple Silicon。
- DMG と `.app` の実行ファイル・アイコンを検査。
- 未署名のため Gatekeeper の右クリック実行が必要になる場合があります。

## アイコン生成

マスターは `src-tauri/app-icons/{pc,dark,light}.png` の 3 枚です。`src-tauri/icons/` は gitignore 対象の生成物です。

- desktop: `pc.png`
- Android / iOS 既定: `dark.png`
- Android / iOS 代替: `light.png`

CI は init / build 前に生成し、Android / iOS では init 後に dark を再適用して代替アイコンと Manifest / XcodeGen を仕上げます。詳細は[アイコン設計](architecture/icons.md)を参照してください。

## Wiki Sync

- 正本: `docs/wiki/` のトップレベル Markdown
- 生成物: GitHub Wiki remote
- placeholder: `{{PAGES_URL}}`、`{{REPOSITORY_URL}}`、`{{DEFAULT_BRANCH}}`
- default branch でのみ実行

ローカル生成:

```bash
$env:GITHUB_SERVER_URL = "https://github.com"
$env:GITHUB_REPOSITORY = "nsmr0604/PawKemoViewer"
$env:REPOSITORY_DEFAULT_BRANCH = "main"
$env:PAGES_BASE_URL = "https://www.nsmr0604.geek.jp/PawKemoViewer"
node scripts/sync-wiki.mjs <出力先>
```

スクリプトは `notes/`、`.agent-work`、`secret.md`、Windows 絶対パス、`docs/` へのリンクを公開禁止として検査します。

## 紹介サイト（gh-pages）

- Pages の公開元は `gh-pages`（legacy）。Actions artifact deploy ではありません。
- `pages.yml` は正式リリースからプラットフォーム別の最新アセットを選び、`release.json` を commit / push します。
- draft / prerelease は除外し、5 プラットフォーム未揃いでも更新します。
- 全体の version は見つかったプラットフォームのセマンティックバージョン最大値です。
- `release.json` だけが自動更新対象です。サイト本文・スクリーンショットは `gh-pages` 側で管理します。

## 正式リリース手順

1. 版本、Cargo.toml、lock ファイルを同期し、コミット / push。
2. ローカルで[検証コマンド](verification.md#自動テスト)を実行。
3. `main` へ統合。
4. Build Tauri / Android Build / iOS Build / macOS Build を `release=true` で実行。
5. 4 workflow の success を確認。
6. `pawkemoviewer-vX.Y.Z` の 9 アセットを確認。
7. 紹介サイトの `release.json` と各リンクを確認。
8. 未確認・既知の制約を [STATUS](STATUS.md) に残す。

## 既知の CI 障害

- Maven Central 429 / Gradle プラグイン解決失敗: 一時障害。Rust まで成功していれば失敗ジョブを再実行。
- macOS runner cancelled: runner 起因のフレーク。再実行で解消することがある。
- `scripts/dev-version.mjs` / `check-boundaries.mjs` / `set-locale-test-id.mjs` だけを変更した場合、現行 push paths に含まれないためビルドが発火しないことがある。
