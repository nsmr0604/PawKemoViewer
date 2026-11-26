# コード監査 2026-11-26

対象: PawKemoViewer 0.6.0(`0.6.0` ブランチ / `45d324d7` 時点)
方法: コードベース全体を 5 領域に分けて読み、重要度(重大 / 中 / 低)で分類した。
この文書は要約と対応順を示す。領域ごとの詳細(根拠・修正案)は
[findings/](findings/) に置いた。

## 1. 件数

| 領域 | 重大 | 中 | 低 | 計 | 詳細 |
|---|---:|---:|---:|---:|---|
| フロントエンド | 4 | 18 | 15 | 37 | [findings/frontend.md](findings/frontend.md) |
| Rust | 4 | 14 | 20 | 38 | [findings/rust.md](findings/rust.md) |
| ネイティブ(Android / iOS) | 1 | 12 | 17 | 30 | [findings/native.md](findings/native.md) |
| ビルド・CI・依存 | 5 | 13 | 9 | 27 | [findings/build-ci.md](findings/build-ci.md) |
| ドキュメント整合 | 3 | 4 | 8 | 15 | [findings/docs.md](findings/docs.md) |
| **合計** | **17** | **61** | **69** | **147** | |

## 2. 重大(17 件)

### 2.1 フロントエンド

**F1. 投稿本文サニタイザーが `javascript:` を迂回できる**
`src/post-content.ts` の `sanitizePostContent`。href の判定が
`startsWith("javascript")` のみで、`java&#9;script:` のような制御文字入りや SVG の
`xlink:href` を除去できない。本文は `dangerouslySetInnerHTML` で描画するため、投稿を
作成できる第三者がアプリのオリジンでスクリプトを実行できる。`localStorage` の
sessionKey と Tauri `invoke` に到達し得る。
→ 許可タグ・属性・スキームのホワイトリストに変え、`URL` で解決して http/https 以外を落とす。

**F2. バックアップ書き出しで sessionKey をクリップボードへコピー**
`SettingsPage.doExportBackup` が `buildBackup` の JSON(sessionKey を含む)を無条件で
`clipboard.writeText` する。クリップボード履歴・クラウド同期・他アプリから読める。
→ sessionKey を除いた JSON を渡す、または既定でコピーしない。

**F3. Home のサービス絞り込みが 0 件だと次ページ取得が止まらない**
`HomePage.filteredPosts` と `PostGrid.check`。フィルタ後 0 件でもセンチネルが画面内に残り、
`done` まで 50 件ずつ取得し続ける(既知・未修正)。API 負荷が設計を超える。
→ 絞り込み中は自動次頁を止める、または読み込み済みだけを絞り込む。

**F4. アカウント切替後も前アカウントのお気に入りが残る**
`App.tsx` の `FavoritesPage key` がサインイン状態の 2 値のみで、取得 effect も
`accountFavs === null` のときだけ動く。共有端末では他人の一覧と ★ が見える。
→ key に sessionKey を含める、または session 変更時にキャッシュを破棄する。

### 2.2 Rust

**R1. pkv が中継した HTML がローカルオリジンで実行され、全コマンドを invoke できる**
`pkv_proxy_fetch` は外部 HTML をそのまま返し、Tauri は登録済みカスタムプロトコルを
ローカルオリジンと扱う。`capabilities/default.json` にアプリ独自コマンドの ACL が無いため、
`proxyLinkUrl`(=`proxyImages` 設定と無関係に外部リンクを pkv 化)で開いた任意サイトの JS が
`download_post_images` / `export_file` / `open_in_browser` など 29 コマンドを呼べる。
pkv は全中継先で同一オリジン、CSP は `null`。
→ pkv で HTML を返さない(画像・バイト列のみ)か、HTML 用の専用ウィンドウ + capability に分離する。
アプリ独自コマンドの ACL manifest を定義し、pkv オリジンからの invoke を拒否する。

**R2. `host_is_public` が DNS 解決失敗で fail-open、検査 IP と接続先も不一致**
`lib.rs` の `host_is_public` は `Err(_) => true`。pkv・一括保存・リダイレクト検査が同じ関数を
共有し、検査時と接続時で解決結果が変わり得る(DNS rebinding)。
→ 解決失敗は拒否。`ClientBuilder::resolve()` などで検査済み IP へ固定する。

**R3. Linux のデスクトップ外部ページが Rust 側で任意 URL を取得(SSRF)**
`external_page_desktop.rs` の `fetch_page` は `is_proxyable` / `host_is_public` を通さず、
リダイレクトも無検査で最大 5 回追従、本文は全量読み。投稿本文の `http://192.168.x.x/` が
LAN へ飛ぶ。応答 HTML は `load_html` で実オリジンとして描画される。
→ 初回 URL と全ホップを検査し、本文上限(例 16 MiB)を設ける。

**R4. 外部ページの「画像を保存」が `document.title` の接頭辞だけで発火**
`on_document_title_changed` が `pawkemo-save#` を見て保存キューを書き、ウィンドウを閉じる。
ページ側 JS が任意の公開画像 URL を並べたタイトルを設定するだけで、同意なしに
`Download/PawKemoViewer/<creator>` へ書き込ませ、外部ページを強制クローズできる。
→ ワンタイムトークン付きの専用経路(カスタムスキーム + 検証)に変え、保存前に確認 UI を挟む。

### 2.3 ネイティブ

**N1. iOS 製品ビルドで外部ページの「画像を保存」が無反応**
`ExternalView.swift` の `ExternalPageController.viewDidLoad` で
`webView.navigationDelegate = self` が `#if PKV_EXTERNAL_DIAG` の中にある。
製品ビルドでは `pawkemo-save:` を拾えず、選択グリッドは出るが保存できない
(iOS の画像保存が未確認のままだった主因の可能性)。
→ delegate の代入を `#if` の外へ出し、トレースだけを条件化する。

### 2.4 ビルド・CI

**B1. `Cargo.lock` が未追跡で Rust 依存がビルド毎に再解決される**
`.gitignore` の `Cargo.lock` 行が原因。同じコミットでも日によって依存が変わり、
`cargo audit` / SBOM / 再現ビルドの基礎が無い。**対応済み**(追跡してコミット)。

**B2. `tauri.conf.json` の CSP が `null`**
pkv が同一オリジンで HTML を返す構成のため、スクリプト実行がそのまま 29 コマンドへ届く
(R1 と同根)。→ CSP を明示し、pkv は HTML を返さない構成にする。

**B3. 正式リリース公開にブランチ・環境のゲートが無く、既存タグを `--clobber` で上書きする**
`workflow_dispatch` は任意ブランチから実行でき、`publish` に `environment` も main 条件も無い。
→ `publish` を main 限定にし、release モードでは既存アセットの上書きを禁止する。

**B4. 4 ワークフローが同一タグへ並行集約し、タグのコミットと成果物の SHA がずれ得る**
`gh release create --target` は初回のみ。2 本目以降はタグの指すコミットを検査しない。
→ アップロード前に `targetCommitish` と `GITHUB_SHA` を比較して失敗させる。

**B5. Actions が可変参照(`@vN` / `@stable`)**
`publish` は `contents: write` でリポジトリのスクリプトを実行するため、参照差し替えが
リリース改ざんに直結する。→ 完全な SHA 固定にし、更新は Dependabot / Renovate に任せる。

### 2.5 ドキュメント整合

**D1. STATUS のリリース状態が実タグ・他文書と矛盾**
「最新 = 0.5.7、0.5.8 はタグ・リリースなし」と書かれていたが、`pawkemoviewer-v0.5.8` は
実在し、HISTORY / README / Wiki は 0.5.8 を最新としていた。→ 訂正済み。

**D2. モバイルの一括保存先が README / Wiki で古い**
Android 10 以降は `Download/PawKemoViewer/<creator>` だが、README と `wiki/Files.md` は
`Documents/Downloads` のままだった。→ 分割して訂正済み。

**D3. cover.jpeg 除外を「一覧にも適用」と 4 文書が記載**
実装が除外するのは投稿詳細のファイル一覧と一括保存の添付候補だけ。一覧カードの
サムネイルと枚数には残る。→ 4 文書を訂正済み。

## 3. 中(61 件)の要約

詳細は [findings/](findings/) を参照。対応判断に必要なものだけ抜粋する。

| 領域 | 主な項目 |
|---|---|
| フロント | ライトボックスの Esc で画面離脱 / ログイン後の同期失敗が通信エラー表示 / 初回フォロー移行の消失 / 壊れた follows で描画例外 / コメントの HTML エスケープ / 投稿移動後も保存選択が残る / カード毎の window リスナー / CreatorsPage の全件 sort / 新着チェックの二重実行 / アイコン保存毎の全件読み出し / ErrorBoundary なし / クリップボードの自動読み取り / 外部 URL をネイティブビューへ渡す前の検査なし |
| Rust | API エラー本文の永続ログ / `api_request` の 302 追従で書き込みが成功扱い / pkv キュー・POST 本文が無制限 / ワーカー panic で恒久 503 / `DOWNLOAD_RUNNING` の解放漏れ(要確認) / `imageReferer` のホスト検査なし / `login_request` の誤った原因表示 / pkv が実質オープンプロキシ / `Content-Encoding` 非同梱 / 読取エラーに URL が残る / 投稿文脈 4 引数の未検証 / 受け渡しファイルが固定名 |
| ネイティブ | URL・内部アドレスの検証なし / `saveToDownloads` の path 未検証 / モバイルでも遠隔 HTML が同一 WebView / MediaStore 同名衝突 / `allowContentAccess` 未指定 / iOS の提示失敗で未解決 / `target="_blank"` 無効 / predictive back / 保存キューの非アトミック / キューの第三者改ざん / `openBrowser` の intent / `invoke.resolve` を素のスレッドから |
| ビルドCI | CI で unit test を実行しない / `npm audit` / `cargo audit` なし / APK が debug keystore / NSIS の firewall ルール / 診断コード混入検査が iOS のみ / toolchain が `@stable` / compileSdk 36 と SDK 35 の不一致 / Cargo・Gradle キャッシュなし / updater なし / リリースノート固定文言 / Wiki push の検査が denylist のみ |
| ドキュメント | 保存先解決失敗時のロック残留の記述が古い(修正済み) / `data/schema.md` のストア作成の記述 / アイコン null の保存期間 / rust.md の早期 return 記述 / 件数・文言のずれ |

## 4. 低(61 件)の要約

- フロント: 未使用 export / `AccountFavorite` のキャスト / API パスの encode 不統一 /
  進捗 total の数え方 / 未使用翻訳キー / キーボード操作 / `window.confirm` / 破壊的操作の確認 /
  診断 dump に sessionKey / スクロール保存の JSON 往復 / 既読操作の未処理 rejection など
- Rust: `safe_log_url` の `e`/`s`/`k` 未マスク / 外部ページ状態の解放漏れ / macOS の非 retain
  deref / FreeBSD cfg の不整合 / 警告 6 件 / 未使用コマンド 3 本 / `api_request` の method・path
  未検証 / アイコンのサイズ上限なし / `store_shared` の失敗時削除 / キュー削除の順序 /
  `export_log` の同名上書き / pkv のメソッド・charset / `list_locale_directory` の全量展開 /
  `unique_file_path` の O(n) / `probe_api.rs` のダミー認証 など
- ネイティブ: `IS_PENDING` 解除失敗 / サブフレームからの保存受理 / Cookie の永続化 /
  ファイル名検証の片手落ち / ピッカーの二重起動 / ProGuard keep / UI 文言の日本語ハードコード /
  `gen/android` の不完全さ / iOS 13 の JSON 入出力 / ATS / version 文字列 など
- ビルドCI: AGENTS の `debug_diag` 記述 / BUILD の `VITE_BUILD_REV` / `paths` の不足 /
  `run-name` へのコミットメッセージ展開 / publish の Node 依存 / debug と release の同一 ID /
  `ubuntu-latest` / SDK ライセンス全承諾 / Node メジャー差 など

## 5. ブランチとワークフローの整理(実施済み)

### ブランチ

リモートは `main` / `0.6.0` / `gh-pages` の 3 本にした。

| ブランチ | 対応 |
|---|---|
| `main` / `0.6.0` / `gh-pages` | 維持 |
| `feature/shared-json-files`、`test/*`(5 本)、`ui/account-navigation-055` | main にマージ済みのため削除 |
| `feature/m2-native-file-dialog` | 未マージ(218 コミット遅れ)。`archive/feature-m2-native-file-dialog` タグに保存して削除 |
| ローカル `0.5.0` | 追跡先が消滅しているため削除 |

変更の無い worktree 7 本を削除した。`.agent-work/m2-native` は未コミット変更が 8 ファイル
残っているため残している。

### ワークフロー

6 本(`Build Tauri` / `Android Build` / `iOS Build` / `macOS Build` / `紹介サイトを公開` /
`Wiki Sync`)はいずれも現役で、削除対象は無かった。GitHub 上にファイルの無い登録が 2 本
残っていたため無効化した(`Desktop installed smoke` / `iOS Files Probe`)。

## 6. 実施済みの対応

監査と整理の中で、安全に直せるものを先に反映した。

| 対象 | 内容 | コミット |
|---|---|---|
| Cargo.lock | `.gitignore` から外して追跡(依存の再現性) | `83427c96` |
| 監査レポート | `docs/audit/` に要約と根拠一覧を追加 | `1ea81577` |
| CI | Android SDK 36 の導入、`pages.yml` の OS 固定、`paths` にスクリプト追加、AGENTS の `debug_diag` 記述 | `b49a222a` |
| ドキュメント | 監査で見つかった 15 件の不一致を訂正 | 本コミット |

## 7. 推奨対応順

| 優先 | 内容 | 対象 |
|---|---|---|
| P0 | 本文サニタイザーの XSS / バックアップのクリップボード / pkv のローカルオリジン実行 / 外部ページの保存トリガー / iOS の delegate | F1, F2, R1, R4, N1 |
| P0 | DNS fail-open と Linux 外部ページの SSRF / `imageReferer` の制限 | R2, R3 |
| P1 | CSP の明示 / リリース公開のゲートと上書き禁止 / Actions の SHA 固定 | B2, B3, B4, B5 |
| P1 | アカウント切替・フォロー移行・同期失敗の表示 / Home の 0 件ループ | F3, F4 ほか |
| P2 | CI の unit test・監査・Cargo/Gradle キャッシュ / SDK 36 / リリースノート | 中・低 |
| P2 | 性能(カード毎リスナー、アイコン全件読み出し、CreatorsPage) | 中 |
| P3 | 未使用 export・コマンド、警告、ドキュメントの細かなずれ | 低 |

## 8. 未確認事項

監査では断定できず、実測が必要な項目がある。

- コメント `content` が HTML かどうか(HTML ならタグが生表示される)
- Tauri が IPC の Future を drop する条件(`DOWNLOAD_RUNNING` の解放漏れ)
- pkv が `Content-Encoding` を中継しない影響(br / zstd を返す取得先の有無)
- macOS `navigate` の unsafe 健全性、Windows WebView2 のフィルター多重登録
- Android の targetSdk(predictive back)、`gen/android` の生成物
- CI の npm 版と `allowScripts` の解釈、`compileSdk 36` の自動取得
- Actions 既定権限・ブランチ保護・Secrets の実値(リポジトリからは確認できない)
