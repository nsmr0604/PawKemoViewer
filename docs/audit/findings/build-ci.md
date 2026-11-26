# PawKemoViewer ビルド・CI・依存・リリース運用 監査

- 対象: 0.6.0 ブランチ / `45d324d7` 時点の作業ツリー (未コミット変更を含む)
- 対象範囲: `.github/workflows/*.yml`、`scripts/`、`package.json` / `package-lock.json`、`src-tauri/Cargo.toml` / `Cargo.lock`、`src-tauri/tauri.conf.json`、`capabilities/`、`src-tauri/plugins/*`、`AGENTS.md` / `docs/BUILD.md`
- 監査のみ。ファイル変更・コミットは行っていない。
- リポジトリ設定 (Actions 既定権限、ブランチ保護、Secrets の実値、Pages の公開元) は**リポジトリからは確認できない**。

集計: 重大 5 / 中 13 / 低 9 (計 27)

---

## [重大] Cargo.lock が未追跡で Rust 依存がビルド毎に再解決される
- 分類: 再現性 / 依存
- 場所: `.gitignore` の `# rust` 直後の `Cargo.lock` 行、`src-tauri/Cargo.lock`(作業ツリーには存在するが `git ls-files` に出ない)、各ワークフローの Cargo 解決ステップ
- 根拠: `git ls-files src-tauri/Cargo.lock` が空。`docs/BUILD.md` の「Cargo.lock」節も未追跡と明記し、「再現性は npm lock ほど高くない」としている。`Cargo.lock` の version は 4。
- 影響: 同じコミットからでも日によって異なる crate バージョンが入る。Windows/Linux/Android/iOS で依存が揃わない可能性。yank・侵害・ライセンス変化の検知もできず、配布バイナリを第三者が再現検証できない。`cargo audit` / SBOM の基礎データも失われる。
- 修正案: `.gitignore` の `Cargo.lock` 行を削除して `src-tauri/Cargo.lock` を追跡し、CI を `cargo build --locked` 相当に切り替える。

## [重大] `tauri.conf.json` の CSP が null
- 分類: 設定
- 場所: `src-tauri/tauri.conf.json` の `app.security.csp`
- 根拠: `"csp": null`。同一オリジンで HTML を返す `pkv://` プロキシがあり、`docs` 側でも CSP 未設定は「未対策」と記録されている。
- 影響: 投稿本文・外部ページ・pkv 応答のいずれかでスクリプトが実行されると、アプリ独自 29 コマンドを含む Tauri IPC にそのまま到達できる (session は localStorage 平文保存)。配布物全体の脆弱性の増幅器になる。
- 修正案: `app.security.csp` に `default-src 'self'; script-src 'self'; object-src 'none'` 等を明示し、pkv 応答にも CSP ヘッダを付ける。

## [重大] 正式リリース公開にブランチ・環境のゲートが無く、既存タグの成果物を無言で上書きする
- 分類: リリース
- 場所: `tauri.yml` / `android.yml` / `ios.yml` / `macos.yml` の `publish` ジョブ、`scripts/ci/publish-build.sh` の `release` 分岐
- 根拠: `workflow_dispatch` は任意ブランチから実行でき、`publish` に `environment:` も `github.ref == 'refs/heads/main'` 条件も無い。既存タグがある場合は `gh release upload --clobber` で置き換える。`docs/BUILD.md` も「運用として main から実行」としか書いていない。
- 影響: 版を上げ忘れたまま別ブランチで `release=true` を回すと、公開済み `pawkemoviewer-vX.Y.Z` の中身だけが差し替わる。同じバージョン番号で別バイナリが出回り、第三者のハッシュ照合も崩れる。
- 修正案: `publish` に main 限定の `if` と `environment`(required reviewers) を付け、release モードでは既存アセットの clobber を禁止して失敗させる。

## [重大] 4 ワークフローが同一タグへ並行集約し、タグのコミットと成果物の SHA がずれ得る
- 分類: リリース
- 場所: `scripts/ci/publish-build.sh` の `gh release create ... --target "$GITHUB_SHA"` と、以降の `gh release upload`
- 根拠: `--target` はリリース未作成時のみ効く。2 本目以降のワークフローはアップロードのみで、既存タグが指すコミットを検査しない。
- 影響: 別コミットで回した 4 ワークフローが同じタグに集まると、タグが指すソースと配布バイナリが一致しない。GitHub 上は「タグ = リリース」に見えるため監査時に判別できない。
- 修正案: アップロード前に `gh release view "$tag" --json targetCommitish` と `$GITHUB_SHA` を比較し、不一致なら即失敗させる。

## [重大] GitHub Actions が可変参照 (major タグ / ブランチ) で SHA 固定されていない
- 分類: CIセキュリティ
- 場所: 全ワークフローの `uses:`。`actions/checkout@v6`、`actions/upload-artifact@v6`、`actions/download-artifact@v7`、`actions/setup-node@v6`、`actions/setup-python@v6`、`actions/setup-java@v5`、`android-actions/setup-android@v4`、`dtolnay/rust-toolchain@stable`
- 根拠: `@vN` は付け替え可能なタグで、`dtolnay/rust-toolchain@stable` はブランチ参照。`publish` ジョブは `permissions: contents: write` で同一ランナー上で `actions/checkout` 直後にリポジトリのスクリプトを実行する。
- 影響: 上流アクションの侵害・タグ付け替えで、書き込み権限トークンを使ったリリース改ざんまで到達し得る。ビルドジョブも `contents: read` とはいえ成果物 (配布バイナリ) の完全性が保証されない。
- 修正案: すべて完全な SHA 固定にし、Renovate / Dependabot で更新する。少なくとも `@stable` はバージョン固定に変更する。

## [中] CI で unit test が動かず、pull_request トリガも無い
- 分類: 再現性 / ドキュメント
- 場所: 全ワークフロー。`tests/*.test.mjs` (platform / application / domain / post-download) と `cargo test` を呼ぶステップが存在しない
- 根拠: `npm run build` は `check:boundaries` と `check:locales` のみ。`docs/BUILD.md` は「Node / Rust の unit test は CI では実行しません」と明記し、PR トリガも無い。
- 影響: マージ前に自動検証が一切走らず、退行が release ビルドまで到達する。手元で回し忘れた場合の防波堤が無い。
- 修正案: build ジョブに `npm run test:*` と `cargo test --locked` を追加し、`pull_request` (contents: read のみ) の検証ワークフローを用意する。

## [中] `npm audit` / `cargo audit` と依存更新の自動化が無い
- 分類: 依存
- 場所: `.github/`(dependabot.yml / renovate 設定なし)、各ワークフローの `npm ci`
- 根拠: `.github` 直下は `workflows` のみ。監査系ステップはどのワークフローにも無い。
- 影響: 既知脆弱性が入っても気づかない。`npm ci` の監査結果はゲートにならず、ログに流れるだけ。
- 修正案: Dependabot (npm / cargo / actions) を有効化し、`npm audit --omit=dev --audit-level=high` と `cargo audit` を定期ジョブに置く。

## [中] 正式配布 APK を debug keystore で署名している
- 分類: リリース
- 場所: `android.yml` の `Sign APKs` ステップ、`src-tauri/android-debug.keystore`(追跡対象)
- 根拠: `apksigner sign --ks src-tauri/android-debug.keystore --ks-pass 'pass:android' --ks-key-alias androiddebugkey` を release ビルドにも適用。パスワード `android` は公開定数であり AGENTS の例外規定に沿うが、鍵自体は誰でも生成できる。
- 影響: 第三者が同一署名の APK を作れるため真正性の担保にならない。将来リリース鍵へ移行すると署名が変わり、既存ユーザーはアンインストールしないと更新できない。Play 配布も不可。
- 修正案: 正式版はリリース鍵 (GitHub Secrets) で署名し、debug.keystore は debug ビルド専用に限定する。移行時のアップグレード断絶を README に明記する。

## [中] Windows インストーラが firewall の送信許可ルールを恒久的に追加する
- 分類: 設定 / セキュリティ
- 場所: `src-tauri/nsis-hooks.nsh` の `NSIS_HOOK_POSTINSTALL` / `NSIS_HOOK_POSTUNINSTALL`、`tauri.conf.json` の `bundle.windows.nsis.installerHooks`
- 根拠: インストール時に `netsh advfirewall firewall add rule ... dir=out action=allow program="$INSTDIR\pawkemoviewer.exe"` を実行し、管理者権限が無い場合の失敗は無視する。アンインストールは名前一致で削除。
- 影響: 利用者のホスト FW ポリシーを暗黙に緩める。ルールはパス指定のため `$INSTDIR` に置かれた同名 exe が許可対象になり、インストーラのログからも気づきにくい。企業管理端末では GPO 違反になり得る。
- 修正案: ルール追加をインストール時オプション (既定オフ) にし、README に明記する。少なくとも追加した事実を UI/ログに出す。

## [中] iOS 以外は「リリース成果物に診断コードが混入していない」検査をしない
- 分類: リリース / セキュリティ
- 場所: `ios.yml` の `Verify external-view diagnostics in the IPA` に対し、`tauri.yml` / `android.yml` / `macos.yml` には相当する検査が無い
- 根拠: iOS のみ `diagnosticEvents:` の有無を `EXPECT_EXTERNAL_DIAG` と突き合わせる。デスクトップと APK はバンドル内容を検査しない。
- 影響: `VITE_DEBUG_DIAG` の三項演算子 (`inputs.release == true && '0' || '1'`) や YAML の真偽解釈が壊れると、診断ビルドが正式版として公開され得る。過去に `&& ||` の空文字罠を踏んだ履歴がある。
- 修正案: デスクトップと APK でも「診断文字列が含まれないこと」を検査するステップを追加する (バンドル grep / dex 検査)。

## [中] Rust toolchain が `@stable` 浮動でクレート側 `rust-version = "1.90"` と一致しない
- 分類: 再現性
- 場所: 各ワークフローの `dtolnay/rust-toolchain@stable`、`src-tauri/Cargo.toml` の `rust-version`
- 根拠: CI は常に最新 stable を取得する。`rust-toolchain.toml` / `.nvmrc` は無い。
- 影響: stable 更新でビルドが突然壊れる。同じコミットでも時期により異なるコンパイラでビルドされ、動作差・warning 差が出る。`rust-version` は下限の宣言でしかない。
- 修正案: `rust-toolchain.toml` を置くか `dtolnay/rust-toolchain@1.9x.y` に固定し、`rust-version` と揃える。

## [中] Android プラグインの compileSdk 36 に対し CI は SDK 35 しか導入しない (要確認)
- 分類: 再現性 / 設定
- 場所: `src-tauri/plugins/{downloads-store,external-view,locale-picker}/android/build.gradle.kts` の `compileSdk = 36` と、`android.yml` の `sdkmanager "platforms;android-35" "build-tools;35.0.0"`
- 根拠: 3 プラグインすべてが `compileSdk = 36` / `minSdk = 24`。ワークフローは 35 系のみ導入し、`docs/BUILD.md` も「Android SDK 35 / Build Tools 35.0.0」と記載。
- 影響: AGP が不足 SDK をビルド時に自動ダウンロードする構成なら、その分だけ時間が伸び、取得失敗でフレークする。取得不可の設定ならビルドが落ちる。どちらかは CI ログでしか判別できない。
- 修正案: `sdkmanager` に `platforms;android-36` `build-tools;36.0.0` を追加し、BUILD.md の記載を実態に合わせる。

## [中] Rust / Android のビルドキャッシュが無く、フロントエンドを二重ビルドしている
- 分類: 再現性 / ビルド時間
- 場所: `tauri.yml` / `macos.yml` は `actions/setup-node` の npm キャッシュのみ、`android.yml` / `ios.yml` はさらに `npm run build` を明示実行した後 `npx tauri build` の `beforeBuildCommand` で再度 `npm run build`
- 根拠: `Swatinem/rust-cache` 等の Cargo キャッシュが無い。`tauri.conf.json` の `beforeBuildCommand` は `npm run build`。
- 影響: 45 分のタイムアウトに対する余裕が小さい。二重ビルドは数分を無駄にし、キャンセル・タイムアウト時の失敗要因になる。
- 修正案: Cargo と Gradle のキャッシュを追加し、明示ビルドを外して `beforeBuildCommand` に一本化する。

## [中] 署名なし配布で自動更新機構も無い
- 分類: 設定 / リリース
- 場所: `tauri.conf.json`(updater 設定なし)、`bundle`、各ビルドで署名ステップ無し
- 根拠: `plugins.updater` / `createUpdaterArtifacts` が無く、Windows/macOS/iOS はすべて未署名。README は SmartScreen と Gatekeeper の回避を案内している。
- 影響: 修正版が出ても利用者に届く経路が「再ダウンロード」しかない。ユーザーは未知の発行元 exe を実行する習慣になり、偽サイト・改ざん版のリスクを高める。
- 修正案: Windows コード署名 (AGENTS 記載の eMudhra) と Tauri updater を導入し、`release.json` と合わせて更新導線を作る。

## [中] リリースノートが固定文言のみで変更内容が分からない
- 分類: リリース / ドキュメント
- 場所: `scripts/ci/publish-build.sh` の `notes="製品版 v${version}。"` / debug 固定文
- 根拠: タグ付きリリースの本文は常に同じ 1 文。`android.yml` / `ios.yml` は直近コミットを `$GITHUB_STEP_SUMMARY` に出すが、リリース本文には反映しない。
- 影響: 利用者が更新判断をできず、後から「どのコミットが入った版か」をリリースページで追えない。紹介サイトの `release.json` も published 日時だけ。
- 修正案: `gh release edit --notes-file` で `git log` 由来の変更点を本文に反映する。

## [中] `webkit2gtk` を `=2.0.2` で完全固定している (要確認)
- 分類: 依存
- 場所: `src-tauri/Cargo.toml` の `[target.'cfg(target_os = "linux")'.dependencies]`
- 根拠: `webkit2gtk = { version = "=2.0.2", features = ["v2_38"] }`。他の Tauri 依存は `"2"` の範囲指定。
- 影響: `tauri` 側が webkit2gtk の下限/排他を上げた場合、依存解決が衝突して Linux ビルドだけが落ちる。Cargo.lock 未追跡なので発覚は push 後になる。
- 修正案: 固定を外して `"2"` に戻し (または `"2.0"`)、必要なら lock で固定する。少なくとも更新手順を docs に残す。

## [中] `allowScripts` の解釈が CI の npm バージョンに依存する (要確認)
- 分類: 依存 / CIセキュリティ
- 場所: `package.json` の `allowScripts`、`package-lock.json`、各ワークフローの `actions/setup-node` `node-version: 24`
- 根拠: `allowScripts` は npm 11 系の仕組み (`npm approve-scripts` 系) で、`npm ci` 時に strict な事前検査が走る。手元は npm 11.20.0 だが CI の npm 版は node 24 イメージ依存。`sharp@0.33.5` は lock に存在しない古い指定。
- 影響: npm 版が古いと指定が無視され、依存の postinstall が無制限に走る。新しいと未承認パッケージ追加時に `npm ci` が失敗し、ビルドが止まる可能性がある (どちらかは要確認)。
- 修正案: CI で `npm --version` をログ出力して版を固定し、`allowScripts` の不要エントリ (`sharp`) を整理する。

## [中] 公開 Wiki への自動 push は denylist 検査のみ
- 分類: CIセキュリティ / ドキュメント
- 場所: `scripts/sync-wiki.mjs` の `assertPublic`、`wiki.yml` の `Push wiki`
- 根拠: 禁止パターンは `notes/`、`agent-work`、`secret.md`、Windows 絶対パス、`docs/` リンクの 5 種。トークン・メール・内部 URL の検査は無い。Wiki は公開リポジトリの Wiki。
- 影響: `docs/wiki/` に機微な記述が混ざると、そのまま公開 Wiki に恒久コミットされる (履歴が残る)。
- 修正案: 汎用シークレットスキャン (`gitleaks` 等) を Wiki Sync の前に挟み、失敗時は push しない。

## [低] AGENTS.md が参照する `debug_diag` 入力が現行 android.yml に存在しない
- 分類: ドキュメント
- 場所: `AGENTS.md` の「デバッグ診断コードの注入規約」、`android.yml` の `workflow_dispatch.inputs`
- 根拠: AGENTS は `android.yml` の input `debug_diag`(リリース添付スキップ) を前提に書かれているが、現行は `release` / `locale_test` / `artifact_only` のみで、debug が既定。
- 影響: 規約どおりに操作しようとすると該当入力が見つからず、意図しないリリース公開 (release=true) に進む恐れがある。
- 修正案: AGENTS.md の該当記述を「`release=false`(既定) が診断ビルド、`artifact_only` で添付をスキップ」に更新する。

## [低] BUILD.md の `VITE_BUILD_REV` 記述と実装が一致しない
- 分類: ドキュメント
- 場所: `docs/BUILD.md` の「開発版の表示」、`tauri.yml` / `android.yml` / `ios.yml` / `macos.yml` の `env`
- 根拠: 文書は「`VITE_BUILD_REV` / run number は現行の表示には使用しない」とするが、4 ワークフローすべてが今も `VITE_BUILD_REV` を設定している。`vite.config.ts` も `define` で埋め込む。
- 影響: 読者が env の有無を誤解する。将来この値に依存した表示を復活させると二重管理になる。
- 修正案: どちらかに寄せる (env を削除する、または文書を「未使用だが互換のため設定」と明記する)。

## [低] push トリガの `paths` に開発スクリプトが含まれていない
- 分類: ドキュメント / 再現性
- 場所: `tauri.yml` / `android.yml` の `on.push.paths`、`scripts/dev-version.mjs`、`scripts/ci/set-locale-test-id.mjs`、`scripts/sync-version.mjs`
- 根拠: `paths` は `scripts/app-icon/**`、`generate-icons.mjs`、`check-locales.mjs`、`ci/publish-build.sh`、`ci/stage-desktop-assets.mjs` のみ。`docs/BUILD.md` の「既知の CI 障害」も同旨。
- 影響: バージョン決定や署名対象 ID を変えてもビルドが走らず、検証されないままリリースされる。
- 修正案: `scripts/**` を paths に含める (少なくとも `dev-version.mjs` / `sync-version.mjs` / `ci/**`)。

## [低] コミットメッセージを `run-name` とステップサマリへ直接展開している
- 分類: CIセキュリティ
- 場所: `android.yml` の `run-name` (`github.event.head_commit.message`)、`android.yml` / `ios.yml` の `Show recent commits` (`git log -5` を `$GITHUB_STEP_SUMMARY` へ)
- 根拠: 外部入力 (コミットメッセージ) を UI とサマリの Markdown に無加工で流している。
- 影響: 細工したメッセージでサマリの表示を偽装できる (成功に見せる等)。コード実行には至らないが監査時のノイズになる。
- 修正案: 改行・Markdown 記号をエスケープし、`run-name` は先頭 1 行に切り詰める。

## [低] `publish` ジョブが Node をセットアップせず preinstalled に依存している
- 分類: 再現性
- 場所: 4 ワークフローの `publish` ジョブ、`scripts/ci/publish-build.sh` の `node -p "require('./package.json').version"`
- 根拠: `publish` は `actions/checkout` → `download-artifact` → `bash publish-build.sh` のみで `actions/setup-node` が無い。ubuntu ランナーの同梱 Node と `gh` に依存。
- 影響: ランナーイメージ更新で Node が消える/変わると、リリース直前にバージョン取得で落ちる。版も固定されない。
- 修正案: `publish` にも `actions/setup-node` を置き、バージョン取得は jq など Node 非依存にする。

## [低] debug と release が同一アプリケーション ID を共有する
- 分類: リリース / 設定
- 場所: `tauri.conf.json` の `bundle.android.debugApplicationIdSuffix`、`android.yml` の `npx tauri android build`(release バリアント)
- 根拠: CI は release バリアントをビルドして debug keystore で再署名するため、`debug-latest` の APK も ID は `com.nsmr0604.pawkemoviewer`。suffix が付くのは `--debug` ビルドのみで、CI では使われない。
- 影響: 利用者が診断版を製品版の上に上書きインストールでき、診断ログや Full ログ経路を持つビルドが製品版と同じデータ領域で動く。
- 修正案: 診断版は `debugApplicationIdSuffix` を効かせた `--debug` か専用 ID でビルドし、ストア/配布物の説明にも区別を書く。

## [低] `pages.yml` の実行環境と権限の扱い
- 分類: CIセキュリティ / 再現性
- 場所: `pages.yml` の `runs-on: ubuntu-latest` と `workflow_run` トリガ
- 根拠: 他の 5 ワークフローは `ubuntu-24.04` 固定だが、ここだけ `ubuntu-latest`。`workflow_run` は既定ブランチのワークフローとして `contents: write` で動く (head_repository 一致の条件あり)。
- 影響: イメージ更新で挙動が変わり得る。条件は入っているが、同一リポジトリ内ブランチからの push ビルドでも gh-pages へ書き込む経路が常時有効。
- 修正案: `ubuntu-24.04` に固定し、書き込みを release イベント由来の成功時のみに絞る条件を検討する。

## [低] Android SDK のライセンス全承諾と `platform-tools` の浮動取得
- 分類: 再現性
- 場所: `android.yml` の `Install Android SDK Packages`
- 根拠: `yes | sdkmanager --licenses` で全ライセンスに同意し、`platform-tools` はバージョン指定なし。
- 影響: 取得物が時期で変わり、再現性が下がる。同意範囲も広い。
- 修正案: ライセンス同意を必要なパッケージに限定し、`platform-tools` も版指定する。

## [低] ローカルと CI で Node のメジャーが異なり `engines` 指定も無い
- 分類: 再現性
- 場所: `package.json`(`engines` なし、`.nvmrc` / `.node-version` なし)、各ワークフローの `node-version: 24`
- 根拠: 開発機は Node 26 (実測)、CI は 24。`docs/BUILD.md` にも前提バージョンの記載は 24 のみ。
- 影響: 手元で通ったビルドが CI で落ちる (またはその逆)。`allowScripts` のような npm 版依存の挙動差もここに集約される。
- 修正案: `engines.node` と `.nvmrc` を追加し、ドキュメントと CI を一致させる。
