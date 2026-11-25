# 一括画像ダウンロード機能 実装計画

対象: PawKemoViewer 0.5.8 以降 / 作成日: 2026-11-24 / 状態: M1〜M3 実装済み・M4 Windows / Android 確認済み (iOS 未)

## 進捗

- **M1 完了** (2026-11-24): `src-tauri/src/downloads.rs` に保存先の解決、
  クリエイター名 / ファイル名のサニタイズ、連番付与、アトミック書き込みを追加。
  `resolve_download_directory` コマンドを登録。単体テスト 3 件が通過
- **M2 完了** (2026-11-24): 投稿本文の `<img>` を収集する `src/post-image-urls.ts` /
  `src/post-download.ts` を追加。`download_post_images` で逐次取得し、
  `download-progress` イベントで進捗通知。投稿詳細に「画像を一括保存」「中止」を追加。
  フロント単体テスト 5 件、Rust 単体テスト 7 件が通過
- **M3 完了** (2026-11-24): 本文の外部リンクを最大 10 件収集し、Rust 側で
  最大 3 ページを取得。HTML から `<img src>` を最大 100 件抽出して相対 URL を解決し、
  その記事のクリエイター名ディレクトリへ保存する。画像への直リンクは 1 枚として保存
- **M4 一部完了** (2026-11-25 / Windows 実機・開発ビルド): 投稿詳細にボタンが出ること、
  画像 0 件のとき「保存できる画像が見つかりませんでした。」を出すこと、
  0 件のときは空のフォルダーを作らないことを確認。CDP から同じコマンドを直接呼び、
  次の 3 経路の保存を実測した (いずれも `Downloads/PawKemoView/<名前>/` に
  `001_…` 形式で保存)。
  - 記事内画像 (pawchive ミラー `n2.pawchive.pw`) → `001_Jodi00238.png`
  - 外部ページの `<img>` (`iana.org`) → `002_iana-logo-header….svg`
  - 画像への直リンク (`httpbin.org/image/jpeg`) → `003_jpeg.jpg`
  - Android / iOS の実機確認は未実施
- **取りこぼし対策** (2026-11-25): 記事内の画像ファイル直リンク (`<a href="….jpg">`) を対象に追加。
  外部ページは `src` に加えて `data-src` / `data-original` / `data-lazy-src` / `srcset` /
  `og:image` / `twitter:image` も拾う。Rust 単体テスト 9 件・フロント 6 件が通過
- **添付と選択 UI** (2026-11-25): `file` / `attachments` の画像を保存対象に追加
  (動画・PDF・ZIP と、設定オンの cover.jpeg は除外)。保存前に
  「本文 / 添付 / 外部リンク」の件数を見て対象を選ぶ UI を追加。失敗理由
  (HTTP 403 / too large / 画像でない など) をホスト名付きで最大 5 件表示する。
  Windows 開発ビルドで、添付 5 件 + 外部 2 件の計 7 件保存、対象を外したとき 0 件、
  失敗理由の表示 (404 の壊れた投稿) を実測
- **ヘッダー・アバター除外** (2026-11-25): 外部ページの `<header>` / `<nav>` / `<footer>` を
  除外し、SNS のアバター・バナー・UI 素材 (Twitter / Gravatar / Facebook / YouTube) と
  512 バイト未満の画像を対象外にした。Rust 単体テスト 11 件が通過
- **外部ページ上の保存ボタン** (2026-11-25): ネイティブビュー (Android / iOS) の
  ツールバーに「画像を保存」を追加。表示中の DOM から画像 URL を集めて
  `Documents/.external-download.json` に書き、アプリ復帰時に通常の保存処理へ渡す。
  reCAPTCHA や JavaScript のギャラリーでも、表示できた画像を保存できる。
  Android 実機 (Redmi K20 Pro) で、sakura.ne.jp のギャラリーページから
  `Documents/Downloads/sasorigatame/001_まみれタペラフハロウィン.jpg` を保存できることを
  確認 (画像の Referer はページ自身にした。投稿 URL のままだと 403)
- **外部ページの選択 UI をチェック式に** (2026-11-25 / `4a662be1` / `db7d4fbe` / `de190bc4`):
  「画像を保存」で 3 列のサムネイルグリッドを重ね、各画像の右上に円形チェックを置く。
  既定はすべて選択で、「すべて選択 / すべて解除」「保存 (n)」、✕ で閉じる。
  選択は `window.__pawkemoSelected` に入れて `pawkemo-save://` に遷移し、
  `WebViewClient` / iOS のナビゲーション delegate が受け取る (JS ブリッジは使わない)。
  Android 実機で 1 枚を選択して保存できることを確認
- **Android 確認 (2026-11-25 / Redmi K20 Pro・debug APK)**: 投稿詳細の
  「画像を一括保存」と 0 件メッセージを実機で確認。`Documents` は既存で、
  `Downloads` は未作成のまま (0 件時に空フォルダーを作らない)。
  さらに、外部リンク (Twitter の埋め込みページ) を持つ投稿で **5 枚を実際に保存**し、
  `Documents/Downloads/sasorigatame/001_…jpg` に書き込まれること、
  「5 件を保存しました (失敗 0 件)」と保存先が表示されることを確認した。
- **Android 再確認 (2026-11-25 / 添付 + 選択 UI 版 `39d21d64`)**: 添付 34 件の投稿で
  選択パネル (本文 0 / 添付 34 / 外部 0) と選択状態を確認。原画が 404 の投稿では
  「0 件を保存しました (失敗 34 件)」と失敗理由 (n1.pawchive.pw — HTTP 404) を表示。
  原画が取得できる投稿では「1 件を保存しました (失敗 0 件)」となり、
  `Documents/Downloads/Ping/001_stream banner.png` に書き込まれることを確認した。

### 実測で分かったこと (2026-11-25)

- **ミラー (n1〜n4.pawchive.pw) はブラウザ相当のヘッダーが無いと 403**。
  `Accept` / `Accept-Language` / `Sec-Fetch-Dest` / `Sec-Fetch-Mode` / `Sec-Fetch-Site`
  を付けて解消した。UA と Referer だけでは 403 のまま (Cloudflare の判定)
- セッション Cookie (`session=`) は **pawchive のホストにだけ**付ける。
  外部ホストへは送らない (単体テスト `session_cookie_is_only_sent_to_pawchive_hosts`)
- **pawchive の投稿は画像が `file` / `attachments` に入っていることが多く、
  本文の `<img>` はまれ**。今回の仕様 (attachments は対象外) では、
  記事内画像が 0 件の投稿が多い。外部リンク先の取得が主な用途になる
- 外部ページが JavaScript で画像を描画する場合 (例: サークルのイベントページ) は
  HTML に `<img>` が無いため 0 枚になる。必要なら今後の課題
- プログレスバーは実装済みだが、数十枚を超えると確認しづらい。実機で再確認する

## 1. 目的

投稿記事の画像と、記事から開ける外部 URL 先の画像を、**まとめて端末へ保存**できるようにする。

## 2. 要件

1. ダウンロード先は、Log / Language ファイルと同じ基準ディレクトリの下に `Downloads` を作る
2. `Downloads/<クリエイター名>/` に保存する
3. 記事内の画像を保存できる
4. 記事内の外部 URL 先にある画像も保存できる
5. 外部 URL 先の画像は、**その記事のクリエイター名ディレクトリ**に保存する
6. 進行状況と結果 (成功 / 失敗 / 保存先) を画面に表示する
7. 失敗した画像があっても、他の画像の保存は継続する

## 3. 保存先

基準は OS の Documents。モバイルは Logs / Languages と同じ場所、デスクトップは
ユーザーが開ける Documents 配下に置く。

| 環境 | 保存先 |
|---|---|
| Android | `Android/data/com.nsmr0604.pawkemoviewer/files/Documents/Downloads/<クリエイター名>/` |
| iOS / iPadOS | Files → このiPhone内／このiPad内 → PawKemoViewer → Downloads/<クリエイター名>/ |
| Windows / macOS | `Downloads/PawKemoView/<クリエイター名>/` (ユーザーのダウンロードフォルダー) |
| Linux | `~/Downloads/PawKemoView/<クリエイター名>/` |

- デスクトップで `Downloads/PawKemoView` を作成できない場合は、Logs / Languages と同じ
  Documents 配下 (`Documents/Pawchive/Downloads/<クリエイター名>`) にフォールバックする
- それも使えない場合は、アプリデータ領域の `Downloads` にフォールバックする
- クリエイター名はファイル名として安全な文字に変換する (`/ \ : * ? " < > |`、制御文字、
  先頭・末尾の空白とドットを除去)。空になる場合は service と creatorId を使う
- ディレクトリは初回保存時に作成する

## 4. ダウンロード対象

### 4.1 記事内の画像

- 投稿本文の `<img src>` (pawchive ミラーと外部ホストの両方) の**本体画像**
- 本文内の画像ファイルへの直リンク `<a href="….jpg">` (`?f=name.jpg` 形式も含む)
- 投稿の `file` / `attachments` のうち**画像** (2026-11-25 追加。本文に画像が無い投稿が多いため)
  - 動画・PDF・ZIP・テキストなどは対象外
  - `cover.jpeg` は「cover.jpeg を除外」設定がオンのとき対象外
  - 元のファイル名を `001_<名前>` として使う
- サムネイル (`img.pawchive.pw/thumbnail/...` など) は対象外
- 元画像が判別できる URL をそのまま保存する (縮小版への置き換えはしない)

### 4.2 外部 URL 先の画像

- 投稿本文の `<a href>` のうち、pawchive / fanbox / patreon 以外の http(s) リンク
- リンク先が HTML の場合: 取得して画像 URL を抽出し、相対 URL を解決して保存
  - `<img>` の `src` / `data-src` / `data-original` / `data-lazy-src` / `srcset`
  - `<meta property="og:image">` / `twitter:image` (画像が 1 枚も無いページの保険)
  - `<header>` / `<nav>` / `<footer>` の中は対象外 (ロゴ・バナー・ナビ画像を避ける)
  - SNS のアバター・バナー・UI 素材は対象外
    (`pbs.twimg.com/profile_images|profile_banners`、`abs.twimg.com`、
    `*.gravatar.com/avatar`、`graph.facebook.com`、`yt3.ggpht.com`)
  - 512 バイト未満の画像はトラッキングピクセルとみなして保存しない
- リンク先が画像 (拡張子または Content-Type が image/*) の場合: そのまま保存
- 外部ページは最大 3 ページまで。1 ページあたりの画像は最大 100 件
- JavaScript で画像を描画するページは対象外 (HTML に URL が無いため)
- YouTube など動画・SNS の埋め込みページは、画像が取れなければスキップする

## 5. 取得と保存の仕様

- 取得は Rust 側で行う (WebView の CORS・Referer 制約を避けるため)
- Referer:
  - 記事内の画像: 記事の元 URL (`src/domain/post-referer.ts` と同じ導出)
  - 外部ページ: 記事の元 URL
  - 外部ページ内の画像: そのページの URL (取得できなければ記事の元 URL)
- 既存の pkv 方針を再利用する:
  - http(s) のみ、pawchive 本体は直接
  - Referer は fanbox.cc / patreon.com のみ許可
  - SSRF 検査 (内部アドレス・名前解決 IP)、リダイレクト検査
  - connect 10 秒 / 全体 180 秒、1 ファイル 64 MiB
- 1 回の実行で保存する上限: 300 ファイル / 合計 512 MiB
- 取得は順次 (1 件ずつ)、リクエスト間隔は 200ms (サーバー負荷への配慮)
- ファイル名: `001_<元のファイル名>`。元の名前が無い場合は URL の末尾、
  それも無ければ連番のみ。既存ファイルと衝突する場合は `-2` を付ける
- 同一 URL は 1 回だけ保存する (実行内で重複排除)
- 失敗した URL は結果に残し、成功分は保存する。画面には失敗の理由
  (HTTP 403 / too large / 画像でない など) をホスト名とともに最大 5 件表示する

## 5.1 ダウンロード前の選択 UI

「画像を一括保存」を押すと、対象と件数を確認してから実行する。

| 選択肢 | 内容 |
|---|---|
| 本文の画像 (n 件) | 本文の `<img>` と画像直リンク |
| 添付画像 (n 件) | `file` / `attachments` の画像 |
| 外部リンク先の画像 (n ページ) | 本文の外部リンクから取得するページ数 |

- すべて既定でオン。0 件の項目はチェック不可
- 「保存する」で実行、「閉じる」で取り消す
- 実行中は件数と中止ボタンを表示する

## 5.2 外部ページ上の「画像を保存」(Android / iOS)

外部ページは reCAPTCHA や JavaScript の遷移があり、HTTP で HTML を取るだけでは
画像を拾えないことが多い。そこで、外部ページを表示するネイティブビューの
ツールバーに「画像を保存」を置く。

1. 投稿本文の外部リンクを開く (実オリジンの WebView / WKWebView)
2. ページ上で必要な操作 (CAPTCHA・遷移) を行う
3. ツールバーの「画像を保存」を押す
4. 表示中の DOM から画像候補を集め (`img` の `currentSrc` / `src`、
   `data-src` / `srcset`、`og:image`。ヘッダー・ナビ・フッターと SNS アバターは除外)、
   **サムネイルのチェック式選択画面**をページ上に重ねる
   - 3 列のグリッド、各画像の右上に円形チェック、既定はすべて選択
   - 「すべて選択 / すべて解除」「保存 (n)」、✕ で閉じる
5. 選んだ画像だけを `Documents/.external-download.json` に書き、ページを閉じる
6. アプリ復帰時に一覧を読み、通常の一括保存 (Rust) で保存する
   - 画像の Referer は**そのページ自身**にする (サイトによっては投稿 URL だと 403)
   - 保存先のクリエイター名は、外部ページを開いた投稿のもの

- 保存先はこれまでと同じ `Downloads/<クリエイター名>/`
- デスクトップは対象外 (ブラウザで開くため、ボタンを置けない)

## 6. アーキテクチャ

```text
PostPage (React)
  ↓ 対象 (本文 / 添付 / 外部リンク) を選ぶ
src/post-download.ts
  ↓ invoke("download_post_images", { creatorName, referer, images, pages, sessionKey })
src-tauri/src/downloads.rs
  ├ 保存先の解決とクリエイター名のサニタイズ
  ├ 外部ページの取得と画像 URL 抽出
  ├ 画像の取得 (pkv と同じポリシー + ブラウザ相当のヘッダー)
  └ 連番ファイル名で保存
```

- 進捗は Tauri イベント (`download-progress`) で `done / total` を通知する
- UI は投稿詳細の操作行に「画像を一括保存」を置き、実行中は件数と中止ボタンを表示する

## 7. マイルストーンと見積もり

| ID | 内容 | 成果物 | 見積もり | 状態 |
|---|---|---|---|---|
| M1 | 保存基盤 | `downloads.rs` の保存先解決・サニタイズ・連番保存・単体テスト | 0.5〜1 日 | 完了 |
| M2 | 記事内画像の一括保存 | URL 収集、Rust 取得、進捗イベント、投稿詳細のボタン | 1〜1.5 日 | 完了 |
| M3 | 外部 URL 先の画像 | 外部リンク検出、HTML の `<img>` 抽出、相対 URL 解決、上限 | 1〜2 日 | 完了 |
| M4 | 検証と仕上げ | 単体テスト、Chromium、Android / Windows 実機、ドキュメント | 1 日 | Windows / Android 済、iOS 未 |

合計の目安: **4〜5 日**(実装 3〜4 日 + 検証 1 日)。

### M1 の完了条件

- `downloads.rs` が保存先を返し、ディレクトリを作成できる
- クリエイター名・ファイル名のサニタイズと連番付与の単体テストが通る
- `cargo check` (通常 / `debug-diag`) が通る

### M2 の完了条件

- 投稿詳細から記事内の画像をまとめて保存できる
- 進捗と結果 (件数・保存先・失敗) が表示される
- 同じ URL を二重に保存しない

### M3 の完了条件

- 外部ページの画像が、その記事のクリエイター名ディレクトリに保存される
- 3 ページ / 100 件 / サイズ上限を超えた場合に、理由を表示して継続する

### M4 の完了条件

- Android の Files / ファイルマネージャーで `Documents/Downloads/<クリエイター名>/` を確認
- Windows の `Documents/Pawchive/Downloads/<クリエイター名>/` を確認
- 失敗 URL があっても成功分が残ることを確認

## 8. テスト計画

- Rust 単体テスト
  - クリエイター名・ファイル名のサニタイズ (記号、空白、先頭ドット、長い名前)
  - 連番と衝突時の `-2`
  - HTML からの `<img>` 抽出と相対 URL 解決
  - URL の重複排除
- JS 単体テスト
  - 本文 HTML から画像 URL と外部リンクを収集する
  - 動画・PDF・pawchive 本体を除外する
- 画面
  - Chromium でボタン、進捗、中止、結果表示
- 実機
  - Android: 保存先、Files からの見え方、再実行時の重複
  - Windows: 保存先とエクスプローラーでの確認

## 9. リスクと対策

| リスク | 対策 |
|---|---|
| 外部ページの構造が多様で画像を誤検出する | `src` のみ対象、上限と失敗許容、抽出結果を結果表示に含める |
| 大量ファイルでメモリ・通信が増える | 同時 2、1 ファイル 64 MiB、合計 512 MiB、300 件上限 |
| サイト側の負荷・拒否 | 200ms 間隔、Referer を記事に限定、失敗はスキップ |
| ファイル名の衝突・不正文字 | サニタイズと連番、既存名には `-2` |
| モバイルの保存先が見えない | 既存の Documents 公開設定 (Files / Android/data) を使用 |

## 10. 決定事項と今後の課題

決定:

1. 記事内画像は本文の `<img>` と画像直リンク、および `file` / `attachments` の画像。
   サムネイルは除外し、本体画像だけを保存する
   (2026-11-25 変更: 本文に画像が無い投稿が多いため添付を含めた)
2. 外部 URL 先は「基本すべての画像ファイル」を対象にする
3. デスクトップは `Downloads/PawKemoView/<クリエイター名>` を既定にし、
   作成できない場合は Documents 配下 (`Documents/Pawchive/Downloads`) にフォールバックする
4. キャンセルは次のファイル取得前に停止する
5. 保存前に対象 (本文 / 添付 / 外部リンク) を選ぶ。既定はすべてオン

今後の課題:

- 同一画像のサイズ違い (`_normal` / `_400x400` など) を 1 つにまとめる
- JavaScript で画像を描画する外部ページへの対応 (現状は HTML の `<img>` のみ)
- 実行をまたいだ重複スキップ (現在は `-2` を付けて再保存する)
- 外部ページのページ数・画像数上限の調整
- 動画・PDF など画像以外の一括保存

## 11. 更新ルール

- 各マイルストーン完了時に、この文書の状態と [開発状況](../STATUS.md) を更新する
- 仕様変更は「未確定事項」に追記してから実装する
- 検証結果と残課題は [引継ぎ資料](../handoff/README.md) にも要約する
