# ビルドガイド

PawKemoViewer 0.5.5 のビルド・パッケージング・CI 構成です。

## ビルドフロー (原則: CI 委任)

**通常のビルドは GitHub Actions に委任する** (ローカルは検証のみ)。

| ワークフロー | main への push | 手動実行 |
|---|---|---|
| Build Tauri (`tauri.yml`) | Windows・Linux のデバッグ版 | デバッグ版・製品版 |
| Android Build (`android.yml`) | Android のデバッグ版 | デバッグ版・製品版 |
| iOS Build (`ios.yml`) | なし | iPhone・iPad のデバッグ版・製品版 |
| macOS Build (`macos.yml`) | なし | macOS のデバッグ版・製品版 |
| Wiki Sync (`wiki.yml`) | `docs/**` などの変更時 | 手動 |
| Pages (`pages.yml`) | ビルド完了時 | 手動 |

- デバッグ版は `VITE_DEBUG_DIAG=1` と Cargo の `debug-diag` を有効にし、
  `debug-latest` プレリリースへ公開する。バージョン欄には短い commit ID を表示する
- 製品版は手動で `release=true` を指定し、診断コードを除外して
  `pawkemoviewer-v{VER}` へ公開する。`artifact_only=true` なら Actions の成果物だけを作る
- 同名ファイルは置き換え、デバッグ版の古いファイルはアップロード成功後に担当分だけ削除する

### 紹介サイト (gh-pages)

- Pages の公開元は **`gh-pages` ブランチ (legacy)**。`pages.yml` は Actions からの
  アーティファクトデプロイではなく、`gh-pages` の `release.json` を更新して push する
- サイトは実行時に `release.json` を読み、プラットフォームごとの最新バージョンとリンクを表示する
- 5 プラットフォームが揃っていなくても、**取得できた最新のアセット**を各プラットフォームに表示する
- 正式リリース (prerelease / draft を除く) のアセットだけを対象にする
- 手動実行 (`workflow_dispatch`) では、その時点の最新アセットで更新する

### 検証モード (手動のデバッグビルド専用)

- `windows_smoke` (Build Tauri) / `installed_smoke` (macOS Build):
  その実行で作ったインストーラーから起動し、公開投稿 API の応答を確認する
- `linux_smoke` (Build Tauri): その実行で作った DEB をインストールし、
  WebView の起動と公開投稿 API の応答を確認する
- `locale_test` (Android / iOS): アプリ ID `com.nsmr0604.pawkemoviewer.localetest` で
  言語ファイル検証用パッケージを作る。通常版と並べてインストールできる

## 成果物

| プラットフォーム | 製品版ファイル名 |
|---|---|
| Windows | `PawKemoViewer.exe` / `PawKemoViewer.msi` |
| Linux | `PawKemoViewer.AppImage` / `PawKemoViewer.deb` / `PawKemoViewer.rpm` |
| macOS | `PawKemoViewer.dmg` / `PawKemoViewer.app.tar.gz` |
| Android | `PawKemoViewer.apk` (universal、debug.keystore 署名) |
| iOS | `PawKemoViewer.ipa` (未署名) |

製品版の固定URLは `<リポジトリのURL>/releases/latest/download/<ファイル名>`。
全対象の製品パッケージが揃った時点で最新版を切り替える。各バージョンのリリースタグは従来どおり保持する。

- 実行ファイル名は `pawkemoviewer` (crate 名由来)。Android packageId は
  `com.nsmr0604.pawkemoviewer`
- Android 署名は標準 debug.keystore (`src-tauri/android-debug.keystore`、パスワード `android`
  は公開定数のため直書き可)。正式配布時はリリース鍵を GitHub Secrets へ移す

## ローカルビルド (検証用)

```bash
npm install
npm run build                                   # 境界チェック + 型検査 + フロントエンドビルド (dist/)
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --features debug-diag
npm run build:debug                             # VITE_DEBUG_DIAG=1 のフロントエンド
npm run tauri:dev                               # 開発実行 (Vite + Tauri + debug-diag)
npm run tauri:android:dev                       # Android 開発実行 + debug-diag
npm run tauri:build                             # ローカルリリースバンドル (通常は不要)
npm run icons:generate                          # pc.png / dark.png から src-tauri/icons/ を生成
```

- デバッグ診断ビルド (PC): `npm run dev` / `npm run tauri:dev` は `.env.development` により
  `VITE_DEBUG_DIAG` が自動有効。`tauri:dev` は Cargo feature `debug-diag` も指定する。
  debug exe は `src-tauri/target/debug/pawkemoviewer.exe`
- アイコンの素材と設計は [アイコン引継ぎ](handoff/icons.md) を参照
- Rust のテストは `cargo test --lib`。既定の debuginfo で LLVM が OOM する環境では
  `CARGO_PROFILE_TEST_DEBUG=0` を指定する
- ワークフロー YAML の検証: `npx --yes js-yaml .github/workflows/*.yml`

## CI 構成の詳細

### PC と macOS

- `tauri.yml` は Windows と Linux を別ランナーでビルドする
- `macos.yml` は `macos-15` で Apple Silicon 向け DMG とアプリのアーカイブを作る

### Android と iOS/iPadOS

- Android は Tauri で生成した APK を zipalign し、開発用キーストアで署名する
- iOS は `macos-15` と XcodeGen で Xcode プロジェクトを生成し、
  iPhone・iPad 共通の arm64 IPA を作る。実機インストールには再署名が必要
- 診断の有無は全対象で共通。デバッグ版だけ `--features debug-diag` を付ける

### モバイルのネイティブプラグイン

- `src-tauri/plugins/locale-picker`: 言語ファイルの選択・書き出し、ランチャーアイコン切替
- `src-tauri/plugins/external-view`: 外部ページを実オリジンのまま Referer 付きで開く
  (Android は Activity + WebView、iOS は WKWebView)
- いずれも `cfg(any(target_os = "android", target_os = "ios"))` の依存として追加し、
  `run()` で `plugin(...)` に登録する

### 既知の CI 障害パターン (実測)

- **Maven Central 429 (Too Many Requests)** / Gradle プラグイン解決の失敗: 一時障害。
  Rust コンパイルが成功していれば `gh run rerun <id> --failed` で再実行する
- **同バージョン再 push での asset 衝突**: バージョンを上げてから push する
- **macOS ジョブの cancelled**: runner 起因のフレーク。再実行で解消することが多い

## バージョニング

- 形式: `0.x.y`。互換性を壊す変更はマイナー (0.x) を上げる
- 更新箇所: `package.json` / `package-lock.json` (`npm version <ver> --no-git-tag-version`) と
  `src-tauri/Cargo.toml` (`npm run sync:version` が `package.json` から同期)。
  `src-tauri/tauri.conf.json` は `../package.json` を参照する
- **デバッグビルドの表示**: `x.y.z (short commit)`。CI は `VITE_BUILD_COMMIT=github.sha`、
  ローカルは `vite.config.ts` が `git rev-parse --short=7 HEAD` を埋め込む。
  正式リリース (`VITE_BUILD_REV=release`) では commit を表示しない

## 手動リリース手順 (正式版)

1. バージョンを上げてコミット・push (デバッグビルドが走る)
2. Actions → 「Build Tauri」「Android Build」「iOS Build」「macOS Build」→ Run workflow → `release=true`
3. 4 ワークフローすべての success と、リリース `pawkemoviewer-v{VER}` のアセットを確認する
4. (将来) 正式配布時: リリース鍵を Secrets 化し、debug.keystore をリポジトリから削除する

## クロスプラットフォーム特記事項

- **Windows**: 未署名 exe は初回ファイアウォール許可が必要
  (NSIS フックが「PawKemoViewer (outbound allow)」規則を自動登録)
- **Android**: debug.keystore は Android Studio の debug ビルドと署名が揃う
- **macOS**: 未署名 (Gatekeeper の右クリック実行が必要)
- **iOS**: 端末向けの未署名 IPA のみ。実機 / TestFlight 配布には Apple Developer プログラムと
  署名証明書・Provisioning Profile による再署名が必要 (現状未対応)

## Lite / Full 開発機能

- **Lite (製品版にも含む)**: セッション ID の手動入力・検証・保存。
  製品版では「開発項目」トグルで表示する
- **Full (デバッグビルド専用)**: 詳細ログ、ログフォルダを開く、バックアップ JSON ダンプ、
  API レスポンス本文、pkv 疎通テスト
- Full はフロントの `VITE_DEBUG_DIAG=1` と Rust の `debug-diag` の両方で有効にする。
  正式リリースではどちらも指定せず、UI・Rust コマンド・詳細ログ処理をコンパイル対象から除外する
- 製品版で Lite を有効にしても Full 機能は有効化されない

### Android API logcat (Full)

- デバッグビルドは `--features debug-diag` を付けるため、API request / response が logcat に出る
- 正式リリースは feature を付けず、API 本文ログを含めない
- 実機確認: `adb logcat | grep 'Pawchive::'` で対象ログを絞り込める
- 本文には投稿・アカウント等のデータが含まれる可能性がある。共有前に内容を確認する

### iOS・iPadOS の外部 URL を実機で診断する

1. GitHub Actions の **iOS Build** を `release=false`、`artifact_only=true` で実行し、`pawchive-ios` の IPA を取得する。TrollStore を利用している検証端末では、普段の手順で未署名 IPA をインストールする。
2. 設定のバージョン表示を Actions のコミットと照合する。**設定 → 開発・診断 → 詳細診断 → iOS・iPadOS 外部URL診断** で **テストページを開く** を押す。表示結果を確認し、外部ページを閉じる。
3. 同じ起動セッションで問題の投稿リンクをタップし、リンク先の表示を確認する。診断画面に戻って **診断ログを保存** を押す。
4. **ファイル → このiPad内（またはこのiPhone内）→ PawKemoViewer → Logs** の `external-page-diagnostic.txt` を共有する。診断ログには端末種別、OS とアプリの版、リンク処理、画面表示、HTTP ステータス、WebKit のエラーコードが入る。URL、リファラー、認証情報、レスポンス本文は記録対象から外している。

ログは起動中のメモリーに保持する。アプリを終了する前に保存する。書き出しは同じ名前のファイルを更新する。

| 記録 | 確認箇所 |
|---|---|
| `device=pad platform=macos` に相当する記録と `post_link_unsupported_runtime` | iPadOS のプラットフォーム判定で処理が止まった |
| `invoke_started` の後に `open_received` がない | Tauri コマンドの入力検査、IPC、プラグイン登録 |
| `present_requested` の後に `present_completed` がない | UIKit の提示元。ログの `attached` と `busy` を確認する |
| `navigation_http`、`navigation_provisional_failed`、`navigation_failed` | HTTP ステータス、WebKit のエラードメインとコード |
| `navigation_finished` | WebKit の読み込み完了。画面内容と戻る操作は実機で確認する |

端末名、OS、コミット、テストページと投稿リンクの表示結果をログと一緒に記録する。外部 URL の調査には専用の `external-page-diagnostic.txt` を使用する。言語と認証の実機判定は [プラットフォーム別の確認表](architecture/stabilization.md#056-実機の完了条件) に記録する。
