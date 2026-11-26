# 一括画像保存

投稿の本文・添付・外部リンク先から画像を選び、端末へまとめて保存する機能です。取得とファイル書き込みは Rust が行います。

## 操作の流れ

1. 投稿詳細で **画像を一括保存** を押します。
2. 本文・添付・外部リンク先の件数を確認し、保存する対象を選びます。
3. **保存する** を押すと、右下の常時表示ボタンに `n/N` の進捗が出ます。
4. 完了すると成功件数、失敗件数、保存先を表示します。失敗理由は最大 5 件まで表示します。
5. 実行中は右下ボタンのパネルから **中止** できます。

- 既定は 3 種類すべて選択。0 件の項目は選択不可。
- 候補が 0 件、またはすべての選択を外した場合は、ネイティブの保存コマンドを呼び出しません。
- 状態はアプリ内のメモリで共有し、投稿画面を離れても保持します。アプリ終了では失われます。
- 完了・失敗から 20 秒後、右下ボタンは待機表示へ戻ります。

## 保存対象

### 本文の画像

- 投稿本文の `<img src>`
- 画像ファイルへの `<a href>`（ミラーの `?f=name.jpg` も含む）
- 相対 URL は元記事 URL を base に解決
- pawchive のサムネイル、`data:` / `blob:`、http(s) 以外、動画拡張子は除外
- 完全一致する重複 URL は順序を保って 1 回だけにまとめる

### 添付画像

- 投稿の `file` と `attachments`
- JPEG / PNG / WebP / GIF / AVIF / BMP / HEIC
- 動画、PDF、ZIP などは除外
- 「FANBOX の cover.jpeg を除外」設定を反映
- pkv 変換前のダイレクト URL を使う

### 外部リンク先

- 投稿本文の外部 `<a href>` を最大 10 URL 収集
- pawchive / FANBOX / Patreon とそのサブドメインは除外
- 画像への直リンクは「本文の画像」として扱う
- リンク先が HTML なら画像 URL を抽出し、画像ならそのまま保存
- 外部ページは最大 3 ページ、1 ページ最大 100 画像

HTML からは `src`、`data-src`、`data-original`、`data-lazy-src`、`srcset` / `data-srcset`、`og:image` / `og:image:url`、`twitter:image` を収集します。

次の画像は除外します。

- `<header>` / `<nav>` / `<footer>` 内の画像
- Twitter のアバター・バナー、Gravatar、Facebook、YouTube の UI / アバター
- 512 バイト未満の画像（トラッキングピクセル）
- 動画拡張子

JavaScript で画像を描画するページは、HTTP で取得した HTML だけでは検出できません。モバイルの外部ページビューでは、表示中 DOM を使う別経路を利用できます。

## 保存先

| 環境 | 保存先 |
|---|---|
| Windows / macOS / Linux | `Downloads/PawKemoView/<クリエイター名>/` |
| Android 10 以降 | 端末の共有 `Download/PawKemoViewer/<クリエイター名>/`（MediaStore 経由） |
| Android 9 以下 | `Android/data/<アプリ ID>/files/Documents/Downloads/<クリエイター名>/` |
| iOS / iPadOS | Files の `PawKemoViewer/Documents/Downloads/<クリエイター名>/` |

デスクトップで `Downloads/PawKemoView` を作成できない場合は、`Documents/Pawchive/Downloads/<クリエイター名>/`、それも使えない場合はアプリデータの `Downloads/<クリエイター名>/` へフォールバックします。

Android 10 以降はスコープドストレージのため、Rust がいったんアプリのキャッシュへ書き、`downloads-store` プラグインが MediaStore に登録して共有 `Download/` へ移します。結果表示の保存先は `Download/PawKemoViewer/<クリエイター名>` です。

- クリエイター名は禁止文字を `_` に置換し、前後の空白とドットを除去、最大 80 文字。
- 空になる場合は `service_creatorId`。
- ディレクトリーは最初の保存成功時に作成します。0 件では作りません。
- ファイル名は `001_<元の名前>`、`002_...`。元名がなければ URL の末尾、それもなければ連番。
- 既存ファイルと衝突する場合は `-2`、`-3` を付けます。
- 一時 `.<name>.part` に書き込み、完成後に rename します。

## 取得制限と負荷配慮

| 項目 | 値 |
|---|---:|
| 1 ファイル | 64 MiB |
| 合計 | 512 MiB |
| 保存成功数 | 最大 300 ファイル |
| 外部ページ | 最大 3 ページ |
| 1 ページの画像 | 最大 100 件 |
| 外部 HTML | 16 MiB |
| connect / total timeout | 10 秒 / 120 秒 |
| リダイレクト | 最大 5 回、各ホップを検査 |
| 取得方法 | 逐次 1 件 |
| 取得間隔 | 200 ms |

- 1 件失敗しても後続を継続します。
- キャンセルは次のファイル・ページ取得前に効きます。転送中の強制中断ではありません。
- 同時に実行できる保存は 1 件です。
- pawchive の session Cookie は pawchive 系ホストにだけ送ります。
- ミラー対策として、Accept / Accept-Language / Sec-Fetch-* を付与します。

## Referer

- 通常の投稿・添付画像: 元記事 URL。FANBOX / Patreon のみ許可。
- 外部ページ: 元記事 URL。
- 外部ページ内の画像: そのページ自身の URLを `imageReferer` として指定可能。
- 取得先とリダイレクト先は内部アドレスと DNS 解決 IP を検査します。

## 外部ページビューからの保存（全 OS）

reCAPTCHA や JavaScript のギャラリーを表示した後に、表示中の画像を保存できます。

1. 外部ページのツールバーで **画像を保存** を押します。
2. 表示中 DOM から最大 300 件を収集し、サムネイルのグリッドを重ねます。
3. 各画像の丸チェック、「すべて選択 / すべて解除」、**保存 (n)**、✕ を操作します。
4. 選択結果をアプリへ渡します（Android / iOS は `pawkemo-save:` custom scheme、
   デスクトップは `document.title` の `pawkemo-save#<JSON>`）。
5. `Documents/.external-download.json` にいったん保存し、アプリ復帰時にフロントが読み取って削除します。
6. 通常の一括保存へ渡し、開いた投稿のクリエイター名フォルダーへ保存します。

デスクトップのツールバーはページへ差し込んだ HTML で、URL 表示・戻る・画像を保存・閉じるを
提供します。Linux は Referer 付き取得の都合で、初回応答の Cookie が WebView に入りません。

## 進捗と結果

Tauri イベント:

```ts
{ event: "download-progress", payload: { done: number, total: number } }
```

コマンド結果:

```ts
{
  directory: string;
  saved: number;
  skipped: number;
  cancelled: boolean;
  failed: Array<{ url: string; reason: string }>;
}
```

画面には `host — reason` の形式で最初の 5 件まで失敗理由を表示します。HTTP 403 / 404、サイズ超過、画像でない、書き込みエラーなどを区別できます。

## 既知の制約

- pawchive にサムネイルだけしかない投稿は、原画 URL が 404 になり保存に失敗します。サムネイルを本体として保存しません。
- Android 9 以下は共有 `Download/` へ書き込めないため、アプリ専用の `Documents/Downloads` へ保存します。
- 保存先の解決に失敗すると、ネイティブの同時実行 lock が解除されず、次の保存をブロックし得る既存不具合があります。
- 投稿画面を離れると途中進捗イベントの購読が外れ、右下ボタンの数値が完了まで止まる場合があります。最終結果は共有ストアへ反映されます。
- 外部ページの受け渡し JSON は検証前に削除されるため、壊れたデータを再取得できません。
- サイズ違いの画像の統合、実行をまたいだ重複スキップ、動画 / PDF の一括保存は未対応です。

## 実装場所

- `src/pages/PostPage.tsx`: 候補収集、選択、進捗、結果
- `src/post-download.ts` / `src/post-image-urls.ts`: URL 抽出とコマンド呼び出し
- `src/download-status.ts` / `src/components/DownloadFab.tsx`: 共有状態と右下ボタン
- `src-tauri/src/downloads.rs`: 保存先、取得、抽出、ファイル書き込み
- `src-tauri/plugins/external-view/`: 外部ページの DOM 収集と選択 UI
- `tests/post-download.test.mjs`: フロントの URL 抽出テスト（npm scripts には未含む）
