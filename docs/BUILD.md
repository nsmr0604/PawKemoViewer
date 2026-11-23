# ビルドガイド

PawKemoViewer (v0.5.1) のビルド・パッケージング・CI 構成。

## ビルドフロー (原則: CI 委任)

**通常のビルドは GitHub Actions に委任する** (ローカルは検証のみ)。

| ワークフロー | main へのプッシュ | 手動実行 |
|---|---|---|
| Build Tauri (`tauri.yml`) | Windows・Linux のデバッグ版 | デバッグ版・製品版 |
| Android Build (`android.yml`) | Android のデバッグ版 | デバッグ版・製品版 |
| iOS Build (`ios.yml`) | なし | iPhone・iPad のデバッグ版・製品版 |
| macOS Build (`macos.yml`) | なし | macOS のデバッグ版・製品版 |

デバッグ版は `VITE_DEBUG_DIAG=1` と Cargo の `debug-diag` を有効にし、
`debug-latest` プレリリースに公開する。アプリのバージョン欄には短いコミット ID を表示する。
製品版は手動で `release=true` を指定し、詳細診断コードをビルドから除き、
`pawkemoviewer-v{VER}` に公開する。`artifact_only=true` なら公開せず、Actions 成果物だけを作る。

各ワークフローはビルド完了後に担当プラットフォームの成果物を公開する。
同名のファイルは置き換え、デバッグ版の古いファイルはアップロードが成功してから担当分だけ削除する。

起動・言語ファイルの検証も同じビルド画面から実行する。

- Build Tauri の `linux_smoke=true` は、その実行で作った DEB をインストールし、WebView の起動と公開投稿 API の応答を確認する。
- Android Build と iOS Build の `locale_test=true` は、アプリ ID `com.nsmr0604.pawkemoviewer.localetest` で言語ファイル検証用パッケージを作る。通常版と並べてインストールできる。
- どちらの検証モードも手動のデバッグビルド専用で、成果物は Actions に保存する。

紹介サイトの公開と Wiki の同期には、それぞれ `pages.yml` と `wiki.yml` を使う。

## 成果物

| プラットフォーム | ファイル例 |
|---|---|
| Windows | `PawKemoViewer_0.5.1_x64-setup.exe` / `_x64_en-US.msi` |
| Linux | `PawKemoViewer_0.5.1_amd64.AppImage` / `_amd64.deb` |
| macOS | `PawKemoViewer_0.5.1_aarch64.dmg` |
| Android | `PawKemoViewer_0.5.1_universal.apk` (debug.keystore 署名) |
| iOS | `PawKemoViewer_0.5.1_ios-unsigned.ipa` (未署名・実機インストールには再署名が必要) |

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
npm run icons:generate                         # pc.png / dark.png から src-tauri/icons/ を生成
```

- ネイティブアイコンはリポジトリに置かず、上記 `icons:generate` / `tauri:dev` /
  `tauri:android:dev` / `tauri:build` が実行時に `scripts/generate-icons.mjs` を呼んで生成する
  (`src-tauri/icons/` は gitignore 済み)。**PC 向けの `icon.ico` / `icon.icns` /
  StoreLogo 等は `pc.png` から、Android / iOS は `dark.png` から生成**し、
  `light.png` はモバイルの代替アイコン専用

- デバッグ診断ビルド (PC): `npm run dev` / `npm run tauri:dev` は `.env.development` により
  `VITE_DEBUG_DIAG` が自動有効。`tauri:dev` は Cargo feature `debug-diag` も指定。debug exe は
  `src-tauri/target/debug/pawkemoviewer.exe`
- ワークフロー YAML の push 前検証: `npx --yes js-yaml .github/workflows/*.yml`

## CI 構成の詳細

### PC と macOS

- `tauri.yml` は Windows と Linux を別のランナーでビルドする。
- `macos.yml` は `macos-15` で Apple シリコン向け DMG とアプリのアーカイブを作る。

### Android と iOS/iPadOS

- Android は Tauri で生成した APK を zipalign し、開発用キーストアで署名する。
- iOS は `macos-15` と XcodeGen で Xcode プロジェクトを生成し、iPhone・iPad 共通の arm64 IPA を作る。無署名 IPA を実機にインストールするには再署名が必要。
- 診断の有無は全対象で共通とし、デバッグ版だけを `--features debug-diag` 付きでビルドする。

### モバイルアプリアイコン (ライト / ダーク)
- デザイン決定事項・素材一覧・引継ぎは
  [docs/branding/ICON_HANDOFF.md](https://github.com/nsmr0604/pawchive/blob/main/docs/branding/ICON_HANDOFF.md) を参照
- リポジトリに入っているアイコン画像は **3 枚**:
  `src-tauri/app-icons/pc.png` (PC 用キャラクターイラスト)、
  `dark.png` (モバイル既定・青)、`light.png` (モバイル切替用・グラデーション)
- `src-tauri/icons/` (desktop / Android / iOS) は dark.png から **ビルド時に生成** し、
  gitignore している。各 workflow は `tauri * init` / `tauri build` の前に
  `npm run icons:generate` を実行する
- Web 用の `public/` アイコン、`index.html` の icon link、旧 `scripts/make-icons.mjs`
  は削除した (Tauri のネイティブアプリアイコンには不要。`index.html` 自体は
  WebView のエントリなので全プラットフォームで残す)
- 切替は `tauri-plugin-app-icon` (Rust) + `app-icon:default` capability を使用。
  フロントは `src/app-icon.ts` の `syncAppIcon()` をテーマ変更時に呼び、
  light テーマでは `light` を選択、dark テーマでは `set_icon(null)` で
  既定の dark アイコンへ戻す (desktop / web は未対応のため無視)
- 設定: `src-tauri/app-icons.json`。生成スクリプトは
  `scripts/app-icon/` (上流 `SableClient/tauri-plugin-app-icon` を取込・MIT OR Apache-2.0、
  npx 固定の変更あり)
- `tauri android init` / `tauri ios init` 後に各 workflow が生成を実行:
  - Android: init 後に `npx tauri icon src-tauri/app-icons/dark.png` で primary を再適用
    (`gen/android` が存在すると生成先 `res/` へ直接書かれるため)、その後
    `npm run icons:generate:android` → light 用の mipmap 各密度 `ic_launcher_light*`
    と activity-alias を Manifest に注入 (既定 alias は dark の `ic_launcher`)
  - iOS: init 後に `npx tauri icon src-tauri/app-icons/dark.png` で既定アイコンを
    生成先 `gen/apple/Assets.xcassets/AppIcon.appiconset` へ直接書き込む
    (init 前だと `src-tauri/icons/ios` にしか生成されず既定アイコンのままになる)。
    その後 `project.yml` に `# APP-ICON ALIASES START/END` と
    `ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS: YES` を入れてから
    `npm run icons:generate:ios` → `AppIconLight.appiconset` のみ生成
    (既定は dark の `AppIcon.appiconset`)。**生成後に `xcodegen generate` を再実行**して
    pbxproj / Info.plist へ反映する (init 時に生成したものはパッチ前のまま)
- 注意: iOS は代替アイコン切替時に OS の確認ダイアログが出る。Android は alias 切替で
  ランチャーアイコンが一時的に消えることがある。実機確認は未実施

### 既知の CI 障害パターン (実測)
- **Android の gradle が Maven Central 429 (Too Many Requests) で失敗**: 一時的障害。
  次の push で再実行すれば解消 (Rust コンパイルは成功しているので failure でも慌てない)
- **Gradle プラグイン解決の失敗** (`Could not resolve org.jetbrains.kotlin:kotlin-gradle-plugin` / plugins.gradle.org の POM 取得失敗): 一時障害。`gh run rerun <id> --failed` で再実行 (実測: 0.3.1 push で発生)
- **同バージョン再 push での asset 衝突**: バージョンを上げてから push する
- **macos ジョブの cancelled**: runner 起因のフレークあり。他プラットフォームが
  success なら再ランで直る

## バージョニング

- 形式: `0.x.y` (main は 0.4 系)。**互換性を壊す変更はマイナー (0.x) を上げる**
- 更新箇所: `package.json` / `package-lock.json` (`npm install --package-lock-only`) /
  `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`
- v0.3.0 は破壊的変更 (内部キー・identifier・crate 名の全面改名)。**0.2.x からの
  引継ぎはバックアップ書き出し→読み込み**で行う
- **デバッグビルドの表示**: `x.y.z(<short commit>)` (例: `0.5.1 (6ed682e)`)。
  CI は `VITE_BUILD_COMMIT=github.sha`、ローカルは `vite.config.ts` が
  `git rev-parse --short=7 HEAD` を埋め込む。正式リリース
  (`VITE_BUILD_REV=release`) では commit を表示しない

## 手動リリース手順 (正式版)

1. バージョンを上げてコミット・push (デバッグビルドが回る)
2. Actions → 「Build Tauri」/「Android Build」/「iOS Build」/「macOS Build」→ Run workflow → `release=true`
3. 全ワークフロー success を確認 → リリース `pawkemoviewer-v{VER}` のアセットを確認
4. (将来) 正式配布時: リリース鍵を Secrets 化し debug.keystore をリポジトリから削除

## クロスプラットフォーム特記事項

- **Windows**: 未署名 exe は初回ファイアウォール許可が必要 (NSIS フックが
  「PawKemoViewer (outbound allow)」規則を自動登録)
- **Android**: WebView 157 / Chrome 157 挙動を前提。debug.keystore は
  Android Studio の debug ビルドと署名が揃う
- **macOS**: 未署名 (Gatekeeper の右クリック実行が必要)
- **iOS**: 端末向けの**未署名 IPA** のみ。実機/TestFlight 配布には Apple Developer
  プログラムと署名証明書・Provisioning Profile による再署名が必要 (現状未対応)


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


### Android API logcat (Full)
- push または手動の Android デバッグビルドは workflow が `--features debug-diag` を付けるため、API request / response body が logcat に出力される
- 正式リリース workflow (`inputs.release=true`) は feature を付けず、API本文ログを含めない
- 実機確認: `adb logcat | grep 'Pawchive::API'` で対象ログを絞り込める (Android logger の実際の tag 表示により grep 文字列は調整)
- API本文には投稿・アカウント等のデータが含まれる可能性がある。デバッグログを共有する前に内容を確認する
