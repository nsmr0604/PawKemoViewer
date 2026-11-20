# ビルドガイド

PawKemoViewer (v0.3.2) のビルド・パッケージング・CI 構成。

## ビルドフロー (原則: CI 委任)

**通常のビルドは GitHub Actions に委任する** (ローカルは検証のみ)。

```text
git push (main)
  ↓
GitHub Actions
  ├─ Build Tauri (tauri.yml)   Windows / Linux / macOS
  └─ Android Build (android.yml) universal APK
  ↓
rolling prerelease "debug-latest" (デバッグビルド)
```

- **push (main) / PR = デバッグビルド**: 診断コード (`VITE_DEBUG_DIAG=1`) を注入し、
  **rolling prerelease `debug-latest`** へアセット添付 (旧バージョン分は自動掃除)
- **正式リリース = 手動のみ**: Actions 画面から `workflow_dispatch` の input
  `release=true` (両ワークフロー)。診断コード無し・タグ `pawkemoviewer-v{VER}` へ添付
- PR ビルドは artifact のみ (android.yml。PC は未設定)

## 成果物

| プラットフォーム | ファイル例 |
|---|---|
| Windows | `PawKemoViewer_0.3.1_x64-setup.exe` / `_x64_en-US.msi` |
| Linux | `PawKemoViewer_0.3.1_amd64.AppImage` / `_amd64.deb` |
| macOS | `PawKemoViewer_0.3.1_aarch64.dmg` |
| Android | `PawKemoViewer_0.3.1_universal.apk` (debug.keystore 署名) |

- 実行ファイル名は `pawkemoviewer` (crate 名由来)。Android packageId は
  `com.nsmr0604.pawkemoviewer`
- Android 署名は標準 debug.keystore (`src-tauri/android-debug.keystore`、パスワード `android`
  は公開定数のため直書き。正式配布時はリリース鍵を GitHub Secrets へ)

## ローカルビルド (検証用)

```bash
npm install
npm run build                                  # 型検査 + フロントエンドビルド (dist/)
cargo check --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml --features debug-diag # debug exe + diagnostic commands
cargo build --manifest-path src-tauri/Cargo.toml --features debug-diag # 診断ビルド
npm run build:debug                            # VITE_DEBUG_DIAG=1 のフロントエンド
npm run tauri:dev                              # 開発実行 (Vite + Tauri + debug-diag)
npm run tauri:android:dev                      # Android 開発実行 + debug-diag
npm run tauri:build                            # ローカルリリースバンドル (通常は不要)
```

- デバッグ診断ビルド (PC): `npm run dev` / `npm run tauri:dev` は `.env.development` により
  `VITE_DEBUG_DIAG` が自動有効。`tauri:dev` は Cargo feature `debug-diag` も指定。debug exe は
  `src-tauri/target/debug/pawkemoviewer.exe`
- ワークフロー YAML の push 前検証: `npx --yes js-yaml .github/workflows/*.yml`

## CI 構成の詳細

### tauri.yml (Build Tauri)
- matrix: `windows-latest` / `ubuntu-24.04` / `macos-15` (fail-fast: false)
- `prepare` ジョブ: release=true 時は旧 PC アセット削除 / debug 時は
  debug-latest の現行バージョン以外を掃除
- `VITE_DEBUG_DIAG` は **ジョブレベル env** (tauri-action の beforeBuildCommand 内
  ビルドにも適用される)。デバッグ時は `args: --features debug-diag` も渡し、Rust 側の開発コマンド・詳細トレースを注入
- concurrency: 同一ブランチの新ランが旧ランをキャンセル

### android.yml (Android Build)
- デバッグビルド: `npx tauri android build --features debug-diag`。正式リリース: feature 無し
- `npx tauri android init` → `npx tauri android build` → zipalign + apksigner
  (debug.keystore) → リリース添付
- `on: pull_request` も発火 (artifact のみ)

### 既知の CI 障害パターン (実測)
- **Android の gradle が Maven Central 429 (Too Many Requests) で失敗**: 一時的障害。
  次の push で再実行すれば解消 (Rust コンパイルは成功しているので failure でも慌てない)
- **Gradle プラグイン解決の失敗** (`Could not resolve org.jetbrains.kotlin:kotlin-gradle-plugin` / plugins.gradle.org の POM 取得失敗): 一時障害。`gh run rerun <id> --failed` で再実行 (実測: 0.3.1 push で発生)
- **同バージョン再 push での asset 衝突**: バージョンを上げてから push する
- **macos ジョブの cancelled**: runner 起因のフレークあり。他プラットフォームが
  success なら再ランで直る

## バージョニング

- 形式: `0.x.y` (0.3 系)。**互換性を壊す変更はマイナー (0.x) を上げる**
- 更新箇所: `package.json` / `package-lock.json` (`npm install --package-lock-only`) /
  `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`
- v0.3.0 は破壊的変更 (内部キー・identifier・crate 名の全面改名)。**0.2.x からの
  引継ぎはバックアップ書き出し→読み込み**で行う

## 手動リリース手順 (正式版)

1. バージョンを上げてコミット・push (デバッグビルドが回る)
2. Actions → 「Build Tauri」/「Android Build」→ Run workflow → `release=true`
3. 両方 success を確認 → リリース `pawkemoviewer-v{VER}` のアセットを確認
4. (将来) 正式配布時: リリース鍵を Secrets 化し debug.keystore をリポジトリから削除

## クロスプラットフォーム特記事項

- **Windows**: 未署名 exe は初回ファイアウォール許可が必要 (NSIS フックが
  「PawKemoViewer (outbound allow)」規則を自動登録)
- **Android**: WebView 157 / Chrome 157 挙動を前提。debug.keystore は
  Android Studio の debug ビルドと署名が揃う
- **macOS**: 未署名 (Gatekeeper の右クリック実行が必要)


## Lite / Full 開発機能
- **Lite (製品版にも含む)**: セッションIDの手動入力・検証・保存。製品版では「開発項目」トグルで表示する
- **Full (デバッグビルド専用)**: 詳細ログファイル追記、ログフォルダを開く、バックアップJSONダンプ、APIレスポンス本文などの詳細診断
- Full はフロントの VITE_DEBUG_DIAG=1 と Rust Cargo feature debug-diag の両方で有効。正式リリースでは両方を指定せず、UI・Rustコマンド・詳細ログ処理をコンパイル対象から除外する
- 製品版で Lite を有効にしても Full 機能は有効化されない


## Lite / Full 開発機能
- **Lite (製品版にも含む)**: セッションIDの手動入力・検証・保存。製品版では「開発項目」トグルで表示する
- **Full (デバッグビルド専用)**: 詳細ログファイル追記、ログフォルダを開く、バックアップJSONダンプ、APIレスポンス本文などの詳細診断
- Full はフロントの VITE_DEBUG_DIAG=1 と Rust Cargo feature debug-diag の両方で有効。正式リリースでは両方を指定せず、UI・Rustコマンド・詳細ログ処理をコンパイル対象から除外する
- 製品版で Lite を有効にしても Full 機能は有効化されない
