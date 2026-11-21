# 代替アプリアイコン生成スクリプト

`tauri-plugin-app-icon` (SableClient) の生成スクリプトを pawchive 用に取り込んだもの。

- 上流: https://github.com/SableClient/tauri-plugin-app-icon
- 取得コミット: `e9b5b36aa163664f0a8c948ccc922febc6131827`
- ライセンス: MIT OR Apache-2.0 (上流に準拠)
- 変更点: `lib.mjs` の `tauriRunner()` を常に `npx` に固定 (pawchive は npm プロジェクト)

使い方:

```sh
# Android (tauri android init 後)
node scripts/app-icon/generate-android.mjs --config src-tauri/app-icons.json
# iOS (tauri ios init 後)
node scripts/app-icon/generate-ios.mjs --config src-tauri/app-icons.json
```

設定は `src-tauri/app-icons.json`。元画像は `src-tauri/app-icons/{light,dark}.png`。
