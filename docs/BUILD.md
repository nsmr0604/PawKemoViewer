# Build Guide

PawKemoViewer のビルド、パッケージ生成、GitHub Actions 自動ビルドについて説明します。

---

# アーキテクチャ

現在のビルド構成は以下の通りです。

```text
React
TypeScript
Vite
        ↓
     Tauri
        ↓
      Rust
        ↓
     Reqwest
        ↓
   pawchive.pw
```

Cloudflare Pages / Functions / Wrangler は使用しません。

---

# 必要環境

## Node.js

推奨:

```text
Node.js 24+
npm 10+
```

確認:

```bash
node --version
npm --version
```

例:

```text
v24.22.1
10.9.2
```

---

## Rust

インストール:

```bash
rustup-init
```

確認:

```bash
rustc --version
cargo --version
```

例:

```text
rustc 1.90+
cargo 1.90+
```

---

# セットアップ

依存インストール:

```bash
npm install
```

---

# フロントエンドビルド

Viteのみビルド:

```bash
npm run build
```

出力:

```text
dist/
```

例:

```text
dist/index.html
dist/assets/*
dist/manifest.webmanifest
```

---

# Tauri 開発モード

```bash
npm run tauri:dev
```

実行内容:

```text
npm run dev
↓
Vite
↓
http://localhost:5173
↓
Tauri 起動
```

---

# Tauri リリースビルド

```bash
npm run tauri:build
```

生成先:

```text
src-tauri/target/release/
```

---

# Windows ビルド

成果物:

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

例:

```text
PawKemoViewer_x64_en-US.msi

PawKemoViewer_x64-setup.exe
```

---

# Linux ビルド

成果物:

```text
AppImage
deb
rpm
```

例:

```text
pawkemoviewer_0.3.0_amd64.deb

pawkemoviewer.AppImage
```

---

# macOS ビルド

成果物:

```text
DMG
.app
```

例:

```text
PawKemoViewer.dmg

PawKemoViewer.app
```

---

# GitHub Actions

ビルドは GitHub Actions によって自動実行されます。

配置:

```text
.github/workflows/tauri.yml
```

---

## ワークフロー

実行条件:

```yaml
on:
  push:
    branches:
      - main

  workflow_dispatch:
```

実行タイミング:

- main ブランチへの push
- GitHub UI から手動実行

---

## マルチプラットフォーム構成

```yaml
strategy:
  fail-fast: false

  matrix:
    include:
      - platform: windows-latest

      - platform: ubuntu-24.04

      - platform: macos-15
```

ビルド対象:

```text
Windows
Linux
macOS
```

---

## GitHub Actions サンプル

```yaml
name: Build Tauri

on:
  push:
    branches:
      - main

  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:

    strategy:
      fail-fast: false

      matrix:
        include:
          - platform: windows-latest

          - platform: ubuntu-24.04

          - platform: macos-15

    runs-on: ${{ matrix.platform }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install Dependencies
        run: npm ci

      - name: Build Frontend
        run: npm run build

      - name: Build Tauri
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

        with:
          tagName: pawchive-v__VERSION__
          releaseName: PawKemoViewer v__VERSION__
          releaseDraft: false
          prerelease: false
```

---

# GitHub Releases

ビルド成功後:

```text
GitHub
↓
Releases
```

へ成果物が自動アップロードされます。

公開例:

```text
PawKemoViewer_x64-setup.exe

pawkemoviewer.AppImage

PawKemoViewer.dmg
```

---

# Android (予定)

Tauri 2 は Android 対応予定です。

初期化:

```bash
npm run tauri android init
```

デバッグ:

```bash
npm run tauri android dev
```

リリース:

```bash
npm run tauri android build
```

生成:

```text
app-release.apk
```

---

# トラブルシューティング

## cargo が見つからない

```text
failed to run cargo metadata
```

確認:

```bash
cargo --version
```

Rust を再インストール:

```bash
rustup update
```

---

## Tauri Build失敗

依存を再生成:

```bash
rm -rf node_modules
rm package-lock.json

npm install
```

---

## TypeScriptエラー

型検査のみ:

```bash
npx tsc --noEmit
```

---

## Viteエラー

キャッシュ削除:

```bash
rm -rf dist
rm -rf node_modules/.vite
```

再ビルド:

```bash
npm run build
```

---

# CI/CDフロー

```text
Developer
      ↓
git push
      ↓
GitHub Actions
      ↓
Tauri Build
      ↓
Windows
Linux
macOS
      ↓
GitHub Releases
```

これが PawKemoViewer の正式なビルド手順です。