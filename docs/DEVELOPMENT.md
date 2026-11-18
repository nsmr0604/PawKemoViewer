# Development Guide

このドキュメントは PawKemoViewer の開発者向け情報をまとめたものです。

対象読者:

- 開発参加者
- コントリビューター
- ビルド担当者
- 自己ホスト環境での検証者

---

# 技術構成

PawKemoViewer は次の構成で実装されています。

```text
Frontend
  React 18
  TypeScript
  Vite

Desktop Runtime
  Tauri 2

Backend
  Rust
  Reqwest

Storage
  IndexedDB
```

---

# 開発環境要件

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

Tauri が利用します。

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

### インストール

Windows:

```powershell
winget install Rustlang.Rustup
```

または

```text
https://rustup.rs
```

---

## Visual Studio Build Tools

Windows ビルド時に必須。

Visual Studio Installer:

```text
Desktop development with C++
```

を選択。

必要:

```text
MSVC
Windows SDK
CMake Tools
```

確認:

```cmd
where cl
```

---

# プロジェクト構成

```text
src/
  api.ts
  db.ts
  follows.ts
  hooks.ts
  router.ts
  styles.css
  types.ts

  components/
    FollowButton.tsx

  pages/
    Home.tsx
    Creators.tsx
    CreatorPage.tsx
    Favorites.tsx
    Login.tsx
    PostPage.tsx
    Settings.tsx

public/

src-tauri/
  Cargo.toml
  tauri.conf.json

  src/
    main.rs
    lib.rs
```

---

# インストール

リポジトリ取得:

```bash
git clone <repository-url>

cd pawchive
```

依存取得:

```bash
npm install
```

---

# 開発サーバー

起動:

```bash
npm run dev
```

Vite:

```text
http://localhost:5173
```

---

# フロントエンドビルド

```bash
npm run build
```

出力:

```text
dist/
```

---

# Tauri 開発

起動:

```bash
npm run tauri:dev
```

実行内容:

```text
Vite起動
↓
localhost:5173
↓
Tauri起動
```

---

# Tauri リリースビルド

```bash
npm run tauri:build
```

生成先:

```text
src-tauri/target/release
```

パッケージ:

```text
Windows
  MSI
  NSIS

Linux
  AppImage
  Deb

macOS
  DMG
```

---

# アプリ構造

```text
React
  ↓
invoke()
  ↓
Tauri
  ↓
Rust
  ↓
Reqwest
  ↓
pawchive.pw
```

---

# API レイヤ

フロント側:

```text
src/api.ts
```

からアクセス。

例:

```ts
api.posts()
api.creators()
api.creatorPosts()
```

---

## 通信

React は直接 fetch を行いません。

```ts
invoke("api_request")
```

経由で Rust に委譲します。

---

# Rust API

実装:

```text
src-tauri/src/lib.rs
```

コマンド:

```rust
#[tauri::command]
async fn api_request(...)
```

役割:

```text
pawchive APIへ接続
JSON取得
Reactへ返却
```

---

# データ保存

## IndexedDB

利用用途:

```text
クリエイターキャッシュ
既読管理
```

実装:

```text
src/db.ts
```

---

## LocalStorage

利用用途:

```text
設定
セッションキー
```

キー:

```text
pawchive-settings
```

---

# キャッシュ

API キャッシュ:

```text
TTL
  60秒

最大
  150件

同時接続
  3
```

実装:

```text
src/api.ts
```

---

# セッションキー

お気に入り同期には

```text
session cookie
```

が必要。

設定画面:

```text
Settings
```

保存先:

```text
LocalStorage
```

送信方法:

```text
Rust reqwest
↓
Cookie: session=xxxx
```

---

# コーディング規約

## TypeScript

有効:

```json
"strict": true
```

禁止:

```text
any
```

推奨:

```ts
unknown
```

---

## React

関数コンポーネントを使用。

推奨:

```ts
useState()
useEffect()
useMemo()
useCallback()
```

---

## CSS

場所:

```text
src/styles.css
```

原則:

```text
CSS Modules 不使用
```

---

# デバッグ

## TypeScript型検査

```bash
npx tsc --noEmit
```

---

## Vite

```bash
npm run dev
```

---

## Rust

```bash
cargo check
```

---

## Tauri

```bash
npm run tauri:dev
```

---

# キャッシュリセット

## IndexedDB

ブラウザ:

```text
Application
↓
IndexedDB
```

削除。

---

## LocalStorage

```js
localStorage.clear()
```

---

# よくある問題

## cargo が見つからない

```text
failed to run cargo metadata
```

確認:

```bash
cargo --version
```

---

## Node Modules破損

再生成:

```bash
rm -rf node_modules
rm package-lock.json

npm install
```

---

## Viteキャッシュ破損

削除:

```bash
rm -rf dist
rm -rf node_modules/.vite
```

再ビルド:

```bash
npm run build
```

---

# GitHub Actions

設定:

```text
.github/workflows/tauri.yml
```

対象:

```text
Windows
Linux
macOS
```

成果物:

```text
GitHub Releases
```

へ自動公開。

---

# 将来計画

予定:

```text
Android対応
iOS対応
通知機能
ダウンロード管理
画像一括保存
```

---

# 参考資料

Tauri:

```text
https://tauri.app
```

Rust:

```text
https://www.rust-lang.org
```

React:

```text
https://react.dev
```

Vite:

```text
https://vitejs.dev
```