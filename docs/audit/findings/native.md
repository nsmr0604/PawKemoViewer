# ネイティブ側 (Android / iOS) プラグイン・設定 監査

対象: `src-tauri/plugins/{external-view,locale-picker,downloads-store}` の android/ios、
`src-tauri/gen/android`・`src-tauri/gen/apple`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/`。
コードは変更していない (監査のみ)。

件数: **重大 1 / 中 12 / 低 17 = 30 件**

前提: MediaStore による共有 `Download/` 保存、外部ページの Android/iOS 実装は現行仕様として正しいものとして扱う。

---

## [重大] iOS の製品ビルドで外部ページの「画像を保存」が無反応になる
- 分類: 正確性
- 場所: `src-tauri/plugins/external-view/ios/Sources/ExternalView.swift` — `ExternalPageController.viewDidLoad` と `ExternalPageController: WKNavigationDelegate`
- 根拠: `webView.navigationDelegate = self` が `#if PKV_EXTERNAL_DIAG` の中にだけある。一方 `pawkemo-save:` を拾う `decidePolicyFor navigationAction` は条件外に定義されている
- 影響: `PKV_EXTERNAL_DIAG` 未定義の製品ビルドでは delegate が nil のままなので、選択画面の「保存」が実行する `location.href = 'pawkemo-save://start'` が捕捉されない。グリッドは表示されるが押しても何も起きず、`.external-download.json` も書かれない (クラッシュもエラーも出ない)。iOS の画像保存が「未確認」のままなのはこの経路が動いていないためと考えられる
- 修正案: `navigationDelegate` の代入を `#if` の外へ出し、トレース呼び出しだけを条件化する

## [中] 外部ページ WebView に URL・内部アドレスの検証がない (Android / iOS 共通)
- 分類: セキュリティ
- 場所: `external-view/android/.../ExternalViewPlugin.kt` `open` / `ExternalPageActivity.onCreate`、`external-view/ios/Sources/ExternalView.swift` `ExternalViewPlugin.open`
- 根拠: Android は `Uri` 文字列をそのまま extra へ入れ、Activity は `intent.getStringExtra(EXTRA_URL)` を無検証で `loadUrl` する。iOS も `URL(string: args.url)` を通すだけ (scheme 検査なし)
- 影響: 検証は Rust `open_external_page` の scheme と Referer だけで、ホスト検査 (`host_is_public`) を通していない。投稿本文の外部リンクは攻撃者が指定できるため、`http://192.168.0.1/` 等の LAN アドレスをアプリの WebView で開かせ、GET ベースの CSRF (ルーター/IoT 管理画面) を成立させられる。ネイティブ層に多層防御がないため、将来 Rust 側の呼び出しが増えると素通りする
- 修正案: ネイティブ側でも `https`/`http` のみ許可し、Rust と同じ公開ホスト判定 (`host_is_public` 相当) を通してから読み込む

## [中] `saveToDownloads` の `path` を検証しておらず、アプリ専用領域の任意ファイルを公開領域へ複製できる
- 分類: セキュリティ
- 場所: `downloads-store/android/.../DownloadsStorePlugin.kt` `saveToDownloads`
- 根拠: `File(args.path)` をそのまま開き、`relativeDir` と `fileName` の検査もしない。呼び出し元がアプリのキャッシュ配下であることを前提にしている
- 影響: WebView 側から到達できる経路 (Tauri コマンド経由) が増えた場合や、`pkv` の HTML が同一 WebView に載る現構成 (CSP null) で XSS が成立した場合、アプリ専用領域のファイル (バックアップ JSON・言語ファイル等) を誰でも読める `Download/` へ持ち出せる。`..` を含む `relativeDir` は MediaStore が弾くが、拒否理由がそのままユーザー向けエラーになる
- 修正案: `path` がアプリのキャッシュディレクトリ配下であることを `canonicalize` で確認し、`relativeDir` / `fileName` をセグメント単位で許可文字に制限する

## [中] モバイルでも遠隔 HTML が同一 WebView・CSP null・`core:default` のまま動く
- 分類: セキュリティ
- 場所: `src-tauri/tauri.conf.json` `app.security.csp`、`src-tauri/capabilities/default.json`、`src-tauri/src/lib.rs` `register_asynchronous_uri_scheme_protocol("pkv", ...)`
- 根拠: `"csp": null` でスクリプト制限がなく、capability は `core:default` と `app-icon:default` のみ。pkv プロトコルは外部 HTML を同一 origin (Android は `http://pkv.localhost`、iOS は `pkv://localhost`) で返す
- 影響: 投稿本文に含まれる HTML がそのまま実行されると、同一 origin の localStorage (セッションキー) を読めるだけでなく、`core:*` の IPC (パス取得・ウィンドウ操作・イベント) まで到達する。Android/iOS でも WebView はアプリ本体と同一なので影響はデスクトップと同じ。既知の制約として docs に記載済みだが、モバイル構成でも同じである点が監査上は未整理
- 修正案: pkv が返す HTML には最低限の CSP (`default-src 'none'; img-src ...`) を付け、`capabilities` はモバイルで必要な `core:*` だけに絞る

## [中] MediaStore の同名衝突で返却パスが実在しない (重複ファイルも増える)
- 分類: データ
- 場所: `downloads-store/android/.../DownloadsStorePlugin.kt` `saveToDownloads` / `saveWithMediaStore`、`src-tauri/src/downloads.rs` `Downloader.store`
- 根拠: プラグインは要求した `displayName` から `"Download/$relative/$displayName"` を組み立てて返すが、MediaStore は同名の `DISPLAY_NAME` を自動リネーム (`001_x (1).jpg`) する。Rust 側の `unique_file_path` はステージング (キャッシュ) を見るため、毎回ファイルが消える結果として常に `001_...` から採番される
- 影響: 同じ投稿を 2 回保存すると実ファイルは `(1)` 付きになる一方、UI と結果一覧は `Download/PawKemoViewer/<creator>/001_x.jpg` と表示する。ユーザーが表示された場所を開いても目的のファイルがない。共有 Downloads に同名の重複が無言で蓄積する
- 修正案: 挿入後に `resolver.query(uri, [DISPLAY_NAME, RELATIVE_PATH])` で実値を読み、それを返す。あわせて保存前に MediaStore 側の既存有無を確認して採番する

## [中] Android 外部 WebView の `allowContentAccess` / `allowFileAccess` を明示していない
- 分類: セキュリティ
- 場所: `external-view/android/.../ExternalPageActivity.kt` `onCreate` の `view.settings.apply`
- 根拠: 設定しているのは `javaScriptEnabled` / `domStorageEnabled` / `loadsImagesAutomatically` / `mixedContentMode` のみ
- 影響: `allowFileAccess` は targetSdk 30 以降の既定 false だが、`allowContentAccess` は既定 true。任意の外部ページの JavaScript が同一プロセスの WebView から `content://` 解決を試行でき、許可 URI 次第でアプリ権限のコンテンツへ到達しうる。設定が暗黙の既定値に依存しており、targetSdk 変更で挙動が変わる
- 修正案: `allowFileAccess = false` / `allowContentAccess = false` / `allowFileAccessFromFileURLs = false` / `allowUniversalAccessFromFileURLs = false` を明示する

## [中] iOS で外部ページの提示に失敗すると invoke が永久に未解決のまま
- 分類: 正確性
- 場所: `external-view/ios/Sources/ExternalView.swift` `ExternalViewPlugin.open`
- 根拠: `invoke.resolve()` は `host.present(navigation, animated: true) { invoke.resolve() }` の完了ハンドラ内だけ。`host.presentedViewController` の事前確認はデバッグ時のみトレースしている
- 影響: 既にモーダル (別の外部ページやファイルピッカー) が出ている状態でリンクを押すと、UIKit は提示を拒否し完了ハンドラが呼ばれない。フロントの `openExternalPage` は製品ビルドでタイムアウトを持たないため、Promise が宙に浮き「押しても何も起きない」状態になる
- 修正案: `presentedViewController != nil` を事前に reject し、提示失敗時も reject する (Android と同じ即時 resolve にそろえる)

## [中] iOS で `target="_blank"` / `window.open` のリンクが無効
- 分類: 互換性
- 場所: `external-view/ios/Sources/ExternalView.swift` `ExternalPageController` (WKUIDelegate 未実装)
- 根拠: `navigationDelegate` のみ設定し、`WKUIDelegate.webView(_:createWebViewWith:...)` を実装していない
- 影響: WKWebView は新しいウィンドウ要求を delegate に委譲し、未実装なら遷移をキャンセルする。ギャラリー系の外部ページは `target="_blank"` のリンクが多いため、iOS ではクリックしても遷移せず「壊れている」ように見える (Android は同一ビュー内で遷移する)
- 修正案: `WKUIDelegate` を実装し、要求された URL を同一 WebView で `load` する

## [中] Android の戻る操作が predictive back 有効時に効かない可能性
- 分類: 互換性
- 場所: `external-view/android/.../ExternalPageActivity.kt` `onBackPressed`
- 根拠: 旧 `onBackPressed()` を override して `WebView.goBack()` している。`enableOnBackInvokedCallback` の指定も `OnBackPressedDispatcher` の利用もない
- 影響: Android 15 以降を target する (targetSdk 35 以上) と predictive back が既定有効になり、`onBackPressed()` が呼ばれず Activity が終了する可能性がある。その場合、外部ページ内の戻るが「1 階層戻る」ではなく「ビューを閉じる」になる。要確認 (実際の targetSdk は生成物側で確定するため)
- 修正案: `androidx.activity` の `OnBackPressedDispatcher` にコールバックを登録し、`canGoBack()` のときだけ `goBack()` する

## [中] 外部ページの保存キューが単一ファイル上書き・非アトミック
- 分類: データ
- 場所: `external-view/android/.../ExternalPageActivity.kt` `writeAndFinish`、`external-view/ios/Sources/ExternalView.swift` `saveSelected`、`src-tauri/src/lib.rs` `take_external_page_images`
- 根拠: どちらも `Documents/.external-download.json` 1 個に上書きし、Android は `File.writeText` (アトミックでない)。Rust は読み出し時に削除する
- 影響: アプリへ戻る前に 2 つの外部ページで「保存」すると先の選択が失われる。Android で書き込み中にプロセスが落ちると壊れた JSON が残り、Rust 側は黙って削除するため保存が始まらない (ユーザーには理由が出ない)
- 修正案: 連番または UUID 付きのキュー複数ファイルにして Rust が全件処理する。Android も一時ファイル + rename で書く

## [中] 外部ページのキューは第三者アプリから改ざんできる場所にある
- 分類: データ
- 場所: `external-view/android/.../ExternalPageActivity.kt` `writeAndFinish` (`getExternalFilesDir(DIRECTORY_DOCUMENTS)`)
- 根拠: アプリ専用 external files 配下に保存し、Rust は内容をそのまま信頼してダウンロードを実行する
- 影響: Android 9 以下 (minSdk 24 で対象) では `WRITE_EXTERNAL_STORAGE` を持つ他アプリがこの JSON を書き換えられる。任意の画像 URL とクリエイター名を注入して、ユーザーの `Download/` に意図しない内容を保存させられる (URL は `host_is_public` で内部アドレスは弾かれるが、公開 URL は自由)。iOS では逆に Files から利用者が直接編集できる
- 修正案: アプリ内部 (`filesDir`) へ移すか、`creatorName` 等の文脈をキューに載せず保存時にアプリ側の状態から復元する

## [中] `openBrowser` の intent 組み立てが不自然で、ブラウザが起動しない可能性
- 分類: 互換性
- 場所: `external-view/android/.../ExternalViewPlugin.kt` `openBrowser`
- 根拠: `Intent.makeMainSelectorActivity(ACTION_MAIN, CATEGORY_APP_BROWSER)` の返り値に対し、あとから `action = ACTION_VIEW` と `data` を上書きしている
- 影響: selector は「ブラウザのメイン Activity」を選ぶためのものなので、外側 intent の action/data を書き換えると解決結果と引数が食い違う。Android 11 以降はパッケージ可視性の宣言 (`<queries>`) もないため、端末によって `ActivityNotFoundException` →「Could not open the browser」になる。要確認
- 修正案: `Intent(ACTION_VIEW, uri).addCategory(CATEGORY_BROWSABLE)` を素直に使い、必要なら manifest に `<queries><intent><action VIEW/><data scheme="https"/></intent></queries>` を追加する

## [中] `invoke.resolve` を素のスレッドから呼び、失敗時はファイル操作が恒久ロックされる
- 分類: 正確性
- 場所: `locale-picker/android/.../LocalePickerPlugin.kt` `exportToAppDirectory` / `handle`、`src-tauri/src/json_files.rs` `run_mobile_picker`
- 根拠: `Thread { ... invoke.resolve(...) }` を直接使い、`BUSY` フラグは `run_mobile_picker` の await が返ったときにだけ解放される
- 影響: resolve/reject がどのスレッドで実行されるかが Tauri 側の実装依存で、UI スレッド前提の処理と競合すると callback が失われる。callback が失われると Rust の await が返らず `BUSY` が立ちっぱなしになり、以降のバックアップ/言語の入出力が「A file operation is already open」で全て失敗する (再起動まで復旧しない)。要確認
- 修正案: 既存の `activity.runOnUiThread` と同様に resolve/reject もメインスレッドへ戻す。または `tauri::async_runtime::spawn_blocking` 側で待つ

---

## [低] MediaStore の `IS_PENDING` 解除失敗時に不可視エントリが残る
- 分類: データ
- 場所: `downloads-store/android/.../DownloadsStorePlugin.kt` `saveWithMediaStore`
- 根拠: `resolver.update(uri, finished, null, null)` の戻り値と例外を無視している
- 影響: 更新に失敗すると `IS_PENDING=1` のままの行が残り、ユーザーから見えないまま容量だけ消費する。同じ `DISPLAY_NAME` を押さえるため後続の保存名もずれる
- 修正案: `update` の戻り値が 0 または例外なら `resolver.delete(uri, null, null)` して reject する

## [低] 保存キューをサブフレームからの遷移でも受理する
- 分類: セキュリティ
- 場所: `external-view/android/.../ExternalPageActivity.kt` `shouldOverrideUrlLoading`、`external-view/ios/Sources/ExternalView.swift` `decidePolicyFor navigationAction`
- 根拠: `request.isForMainFrame` / `navigationAction.targetFrame?.isMainFrame` を確認していない
- 影響: ページ内の広告 iframe などが `pawkemo-save://start` へ遷移させるだけで、選択中の候補が保存され画面が閉じる。候補外 URL は弾いているため被害は限定的。要確認 (サブフレーム遷移が delegate に来るかは WebView 実装依存)
- 修正案: メインフレームの遷移だけを受理する

## [低] 外部 WebView の Cookie が永続化され、破棄もされない
- 分類: セキュリティ
- 場所: `external-view/android/.../ExternalPageActivity.kt` `onCreate` / `onDestroy`、`external-view/ios/Sources/ExternalView.swift` `ExternalPageController` (既定の `WKWebsiteDataStore.default()`)
- 根拠: `CookieManager.getInstance().setAcceptCookie(true)` を呼び、`CookieManager.flush()` も `removeAllCookies` も行わない。iOS も default data store のまま
- 影響: 外部サイトのログイン Cookie・localStorage がアプリの WebView プロファイルに残り続け、同じプロファイルを使う他機能と共有される。第三者 Cookie による追跡も残る。ユーザーが「閉じた」つもりでもセッションが保持される
- 修正案: 外部ビュー専用の `WKWebsiteDataStore.nonPersistent()` / Android の一時プロファイルを使うか、`onDestroy` で `removeAllCookies` + `flush` する

## [低] ファイル名・フォルダー名の検証がネイティブ側で片手落ち
- 分類: セキュリティ
- 場所: `locale-picker/android/.../LocalePickerPlugin.kt` `saveDocument` / `exportResult`、`locale-picker/ios/Sources/LocalePicker.swift` `filesDirectory` / `saveDocument`
- 根拠: Android は `exportToAppDirectory` だけ `File(name).name == name` を検査し、iOS は `args.filename` と `args.folder` を `appendingPathComponent` にそのまま渡す
- 影響: 現状 Rust 側 (`safe_name` と固定 `folder`) が守っているが、多層防御がない。`..` を含む名前が渡ると一時ディレクトリ外や別フォルダーへ書き込む
- 修正案: ネイティブ側でも「拡張子付き・区切り文字なし」を共通関数で検査する

## [低] Android でピッカーの二重起動を防いでいない
- 分類: 正確性
- 場所: `locale-picker/android/.../LocalePickerPlugin.kt` `launch`
- 根拠: iOS には `pending` ガードがあるが Android 側にはなく、`startActivityForResult` を連続で呼べる
- 影響: 二重タップで 2 つのピッカーが積まれ、片方の結果だけが返る。Rust の `BUSY` が上位で守っているため実害は小さいが、ネイティブ単体では無防備
- 修正案: 実行中フラグを持ち、2 回目は即 reject する

## [低] ピッカーが delegate 通知なしに閉じると invoke が未解決のまま残る
- 分類: 正確性
- 場所: `locale-picker/ios/Sources/LocalePicker.swift` `present` / `documentPickerWasCancelled`、`locale-picker/android/.../LocalePickerPlugin.kt` `handle`
- 根拠: 解決は `didPickDocumentsAt` / `documentPickerWasCancelled` / ActivityResult の到着のみに依存する
- 影響: 画面回転やプロセス再生成、シーン復帰でピッカーが破棄されると callback が来ず、`pending` と Rust の `BUSY` が残る。以後のファイル操作が再起動まで失敗する
- 修正案: タイムアウトまたは `viewDidDisappear` 相当でキャンセル扱いにし、`pending` を必ず解放する

## [低] ProGuard keep ルールがプラグイン間で不統一
- 分類: 保守性
- 場所: `downloads-store/android/consumer-rules.pro` (空)、`external-view/android/consumer-rules.pro`、`locale-picker/android/consumer-rules.pro`
- 根拠: downloads-store は空。external-view は `ExternalViewPlugin` と `OpenArgs` のみ、locale-picker は `LocalePickerPlugin` と `LocaleExportArgs` のみを keep している
- 影響: `@InvokeArg` のクラスは reflection でフィールド名を解決するため、minify を有効化した時点で `SaveArgs` / `BrowserArgs` / `LauncherIconArgs` / `JsonReadArgs` が壊れ、プラグインが「見つからない」または引数が null になる。現状は minify 無効で顕在化していない
- 修正案: `-keep class org.pawkemoviewer.** { *; }` 相当を 3 プラグインでそろえる

## [低] 画像抽出・選択画面のスクリプトが Kotlin / Swift / Rust の三重管理
- 分類: 保守性
- 場所: `external-view/android/.../ExternalPageActivity.kt` の `COLLECT_SCRIPT` / `PICKER_SCRIPT`、`external-view/ios/Sources/ExternalView.swift` の同名定義、`src-tauri/src/downloads.rs` の `extract_page_images` / `is_avatar_or_ui`
- 根拠: 約 100 行の JS がほぼ同一内容で 2 言語に複製され、除外規則 (アバター・動画拡張子・header/nav/footer) は Rust にも別実装がある
- 影響: 片方だけ直すと Android と iOS で候補がずれる (例: `og:image` はネイティブが 1 件のみ、Rust は複数)。Rust 側とネイティブ側で条件が食い違うと「選択画面に出たのに保存されない」ことが起きる
- 修正案: JS を 1 つのアセット (plugins 配下の共通ファイル) に切り出し、両プラグインが読み込む。除外規則は Rust 側を正として揃える

## [低] ネイティブ UI の文言・配色が日本語ハードコード
- 分類: 保守性
- 場所: `external-view/android/.../ExternalPageActivity.kt` `onCreate` / `openPicker`、`external-view/ios/Sources/ExternalView.swift` `viewDidLoad` / `pickerScript`
- 根拠: 「画像を保存」「閉じる」「保存する画像を選択」「すべて解除」等をそのまま埋め込み、バー色も `0xFF1A1B1E` 固定
- 影響: アプリは i18n (ja/en) を持つがネイティブ画面だけ日本語のまま。配色もテーマ (ライト/ダーク) に追従しない
- 修正案: 文言を `strings.xml` / `Localizable.strings` へ出し、色は `?attr/colorSurface` などのテーマ属性を使う

## [低] `gen/android` が不完全で、targetSdk 等のモバイル設定を監査できない
- 分類: 保守性
- 場所: `src-tauri/gen/android`、`src-tauri/gen/apple`
- 根拠: `gen/android` には `app/src/main/AndroidManifest.xml` と `res/` しかなく、`build.gradle.kts` / `MainActivity.kt` / `res/xml/file_paths.xml` が無い。manifest には `@style/Theme.{{snake-case app.name}}` と `${usesCleartextTraffic}` のプレースホルダが残る。`gen/apple` も `project.yml` と `Assets.xcassets` のみ
- 影響: `gen/` は gitignore され CI が `tauri android init` / `tauri ios init` で作り直すため、リポジトリ上は targetSdk・minSdk・`usesCleartextTraffic`・FileProvider の公開パス・Info.plist の最終形を確認できない。監査と障害調査は CI 生成物を見る必要がある。要確認
- 修正案: 生成後の `build.gradle.kts` と `file_paths.xml` を CI で artifact 保存し、設定差分を追えるようにする

## [低] プラグインの `compileSdk = 36` と CI の SDK 導入 (android-35) が不一致
- 分類: 互換性
- 場所: `external-view/android/build.gradle.kts` / `locale-picker/android/build.gradle.kts` / `downloads-store/android/build.gradle.kts`、`.github/workflows/android.yml`
- 根拠: 3 モジュールとも `compileSdk = 36`。CI は `platforms;android-35` と `build-tools;35.0.0` のみを明示導入する
- 影響: 現状は AGP の自動ダウンロード (ライセンス同意済み) に依存して通っている。ネットワークやライセンス状態が変わるとビルドが落ちる。また app 側の compileSdk が 36 未満だと AAR メタデータ検査で失敗する。要確認
- 修正案: CI の `sdkmanager` に `platforms;android-36` を追加するか、`compileSdk` を CI と一致させる

## [低] iOS 13 では JSON の入出力が使えない (deploymentTarget 13.0)
- 分類: 互換性
- 場所: `locale-picker/ios/Package.swift`、`src-tauri/gen/apple/project.yml`、`locale-picker/ios/Sources/LocalePicker.swift` `pickJson` / `saveDocument`
- 根拠: `platforms: [.iOS(.v13)]` / `deploymentTarget: iOS: 13.0` に対し、`UIDocumentPickerViewController(forOpeningContentTypes:)` は iOS 14 以降で `guard #available(iOS 14.0, *)` により reject する
- 影響: iOS 13 端末ではバックアップ復元・ログ書き出し・言語の入出力がすべて「The JSON picker requires iOS 14 or later」で失敗する。対応バージョンとして掲げているのに主要機能が欠ける
- 修正案: 最低バージョンを 14.0 に上げるか、iOS 13 用に `UIDocumentPickerViewController(documentTypes:in:)` の分岐を用意する

## [低] `UniformTypeIdentifiers` を iOS 13 ターゲットで import している
- 分類: 互換性
- 場所: `locale-picker/ios/Sources/LocalePicker.swift`
- 根拠: ファイル先頭で `import UniformTypeIdentifiers` し、`.json` の利用箇所だけ `#available(iOS 14.0, *)` で囲んでいる
- 影響: フレームワーク自体は iOS 14 以降の提供のため、iOS 13 実機で起動時リンクに失敗する可能性がある。要確認 (SwiftPM の自動リンクは弱リンクにならない場合がある)
- 修正案: import も `#if canImport` / `@available` の内側に寄せる、または最低バージョンを 14 に上げる

## [低] http の外部ページが iOS で開けない (ATS 例外なし) / Android は設定次第
- 分類: 互換性
- 場所: `src-tauri/Info.ios.plist`、`src-tauri/gen/android/app/src/main/AndroidManifest.xml` (`android:usesCleartextTraffic="${usesCleartextTraffic}"`)
- 根拠: Info.plist に `NSAppTransportSecurity` の例外がなく、Android はプレースホルダで実値がリポジトリから不明
- 影響: 投稿本文の外部リンクが `http://` の個人サイトだと、iOS の WKWebView は ATS で読み込みを拒否する。Android では `usesCleartextTraffic` の値次第で同じく失敗し、プラットフォーム間で挙動が揃わない。要確認
- 修正案: どちらも https のみ許可する仕様に統一し、UI 側で http リンクを開く前に案内する (ATS 例外を足すのは最終手段)

## [低] `UISupportsDocumentBrowser` と `UIFileSharingEnabled` の併用が冗長
- 分類: 互換性
- 場所: `src-tauri/Info.ios.plist`
- 根拠: `UISupportsDocumentBrowser` / `UIFileSharingEnabled` / `LSSupportsOpeningDocumentsInPlace` の 3 キーを同時に true にしている
- 影響: `UISupportsDocumentBrowser` は本来 `UIDocumentBrowserViewController` を root にするドキュメントブラウザアプリ向けの宣言で、Tauri の WebView アプリには該当しない。Files への公開は残り 2 キーで足りるため、審査や「このアプリで開く」の挙動が意図とずれる可能性がある。要確認
- 修正案: 実機で Files 表示を確認したうえで `UISupportsDocumentBrowser` を外し、残り 2 キーだけにする

## [低] 開発版 iOS の CFBundleShortVersionString に semver のビルドメタデータが入る
- 分類: 互換性
- 場所: `scripts/dev-version.mjs`、`src-tauri/tauri.conf.json` (`"version": "../package.json"`)
- 根拠: 非リリースビルドで `package.json` を `x.y.z+<コミット数>` に書き換え、tauri がその値をバンドル版数へ使う
- 影響: Apple の規定では `CFBundleShortVersionString` は数字をピリオドで区切った最大 3 要素で、`+` を含む値はインストール/審査で拒否されうる。TrollStore 等の非署名配布でも版数解釈で弾かれる可能性がある。要確認 (IPA の実値を確認していない)
- 修正案: iOS だけ `CFBundleShortVersionString` を `x.y.z`、`CFBundleVersion` をコミット数にする

## [低] ランチャーアイコン切替がエイリアス名に依存し、失敗時に戻せない
- 分類: 保守性
- 場所: `locale-picker/android/.../LauncherIcons.kt` `setLauncherIcon`
- 根拠: `AppIconDefault` / `AppIconLight` という名前をハードコードして `singleOrNull` で探し、見つからなければ何もせず return する。選択状態は保存していない
- 影響: アイコン生成スクリプトの命名が変わると切替が無言で効かなくなる。API 33 未満の逐次切替が途中で失敗すると両方有効のまま (ランチャーに 2 つ並ぶ) になる。アプリ更新後は manifest の `enabled` に戻るため、設定表示とホーム画面のアイコンが食い違う
- 修正案: エイリアス名を `app-icons.json` 由来の定数として共有し、切替結果を設定へ保存して起動時に再適用する
