# Build & Release Guide

PawKemoViewer のビルド、CI、リリース運用について。

---

## ビルドの原則

- **正式ビルドは GitHub Actions に委任**。ローカルビルドは検証用
- push (main) = **デバッグビルド** (診断コード入り) → rolling prerelease `debug-latest` へ
- 正式リリース = **手動のみ** (workflow_dispatch の `release=true`)。診断コード無し
- ローカルビルドは `V:\pawchive\` (リポジトリルート) で実行する。
  エージェントの作業ファイルは `.agent-work/` (gitignore 済み)

---

## ローカルビルド

```bash
npm install
npm run build            # フロントエンド (tsc + Vite) → dist/
cargo check              # Rust 型検査
npm run tauri:dev        # デスクトップ開発実行
npm run tauri:build      # デスクトップリリースビルド
```

### デバッグ診断ビルド (手元で診断コードを入れる)

```powershell
$env:VITE_DEBUG_DIAG = "1"; npm run build          # フロントエンド
cargo build --features debug-diag                   # Rust
```

診断ビルドではバックアップ JSON ダンプ・API 失敗詳細ログ・
`app_data/logs/debug-app.log` 常時追記が有効になる (リリースでは自動分離)。

### 成果物の名前 (v0.3.0~)

| プラットフォーム | ファイル |
|---|---|
| Windows | `PawKemoViewer_0.3.0_x64-setup.exe` / `_x64_en-US.msi` |
| Linux | `pawkemoviewer_0.3.0_amd64.deb` / `.AppImage` / `.rpm` |
| macOS | `PawKemoViewer_0.3.0_aarch64.dmg` |
| Android | `PawKemoViewer_0.3.0_universal.apk` (debug.keystore 署名) |

プロセス名 / exe 名は `pawkemoviewer` (v0.3.0 で crate 名を改名したため)。

---

## Android ビルド

```bash
npm run tauri android init
npm run tauri android build
```

署名: `src-tauri/android-debug.keystore` (Android SDK 標準手順の debug.keystore。
パスワード `android` は公開定数のため直書き可 — 非公開の鍵は GitHub Secrets 経由)。
正式配布時はリリース鍵を Secrets 化し、debug.keystore をリポジトリから削除する。

---

## CI (GitHub Actions)

| ワークフロー | トリガー | 出力先 |
|---|---|---|
| `.github/workflows/tauri.yml` (Build Tauri) | push (main) / dispatch | PC 成果物 |
| `.github/workflows/android.yml` (Android Build) | push (main) / **PR** / dispatch | APK |

### push (main) = デバッグビルド

- `VITE_DEBUG_DIAG=1` を注入 (ジョブレベル env。`beforeBuildCommand` 内の再ビルドにも波及)
- 成果物は rolling prerelease **`debug-latest`** に添付
  (旧バージョンのアセットは「ファイル名に現行バージョンを含まないものを削除」で掃除)
- PR ビルドは artifact のみ (リリースには出さない)

### 正式リリース (手動)

1. バージョンを上げる: `package.json` / `package-lock.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`
2. push してデバッグビルドで動作確認
3. GitHub UI → Actions → **Build Tauri / Android Build → Run workflow → `release=true`**
4. タグ `pawkemoviewer-v{VER}` のリリースに成果物が添付される (PC 側は旧アセット削除→新アップロード)

### トラブルシューティング

- **Android がgradle 依存解決で失敗**: Maven Central の 429 (Too Many Requests) の
  一時的障害のことがある。Rust コンパイル成功後に `Could not resolve` が出たら再実行で直る
- ワークフロー YAML は push 前に `npx --yes js-yaml .github/workflows/*.yml` で検証

---

## リリースフロー

```text
開発 (main push)
  → デバッグビルド (VITE_DEBUG_DIAG=1)
  → prerelease "debug-latest" (テスト用・上書き更新)
実機テストで問題なければ
  → バージョン更新 + workflow_dispatch release=true
  → 正式リリース "pawkemoviewer-v{VER}"
```

### 0.2.x → 0.3.0 移行 (破壊的変更)

- identifier / 内部キーが変更されたため、**旧アプリのデータは自動引き継ぎされない**
- 引き継ぎ手順: 旧バージョンでバックアップを書き出し → 新バージョンで読み込み
  (フォロー・既読・設定・セッションキーを含む)
- Windows は旧「Pawchive Viewer」が別フォルダに残るため手動アンインストール
- Android は旧アプリ (`jp.geek.nsmr0604.pawchive`) と共存する

---

## 将来計画

- Windows 正式署名 (eMudhra コード署名証明書)
- Android リリース鍵の Secrets 化
