# アイコン

## マスター画像

リポジトリに登録するアイコン素材は次の 3 枚です。

| ファイル | 実寸 | 用途 |
|---|---|---|
| `src-tauri/app-icons/pc.png` | 1024×1024 RGBA | Windows / macOS / Linux |
| `src-tauri/app-icons/dark.png` | 1254×1254 RGB | Android / iOS の既定アイコン、ダークテーマ |
| `src-tauri/app-icons/light.png` | 1254×1254 RGB | Android / iOS の代替アイコン、ライトテーマ |

提供された PNG を原本として保持し、各プラットフォーム用サイズへ直接生成します。SVG へ変換した代理画像は使いません。

## 生成物

`src-tauri/icons/` は gitignore 対象の生成物です。リポジトリへコミットしません。

```bash
npm run icons:generate
npm run icons:generate:android
npm run icons:generate:ios
```

- `scripts/generate-icons.mjs` が PC 用 ICO / ICNS / PNG と Android / iOS 用画像を生成します。
- `scripts/app-icon/` が Android のランチャーエイリアスと iOS の代替アイコンを生成します。
- `tauri:dev` / `tauri:android:dev` / `tauri:build` は必要に応じてアイコン生成を実行します。
- CI も Tauri の init / build 前に生成します。

## テーマ連動

- アプリ内のロゴはテーマに応じて `dark.png` / `light.png` を表示します。
- Android は既定とライトの `activity-alias` を切り替えます。Activity 自体を無効化しません。
- iOS / iPadOS は `tauri-plugin-app-icon` の公開コマンドで `AppIconLight` を選択し、ダーク時に既定へ戻します。
- 同じアイコンへの再設定は省略します。iOS では OS の確認ダイアログが表示される場合があります。

## 実機での確認

- ライト / ダークを切り替えたとき、ホーム画面のアイコンが変わること。
- ランチャーのエントリが重複しないこと。
- Android 13 以降とそれ以前の切り替え動作。
- iPhone / iPad の既定・代替アイコン。
- アプリ内ロゴとネイティブアイコンが同じテーマへ同期すること。

パッケージ内のアイコン登録を確認できても、実機のランチャー表示を確認したことにはなりません。
