# 安定化とリリースの証跡

> この文書は **0.5.0 系のマイルストーンで実施した検証記録** です。現在の状態は
> [開発状況](../STATUS.md) を参照してください。バージョン番号や実行 ID は記録時点のものです。

## M7.1 — インポート境界

`npm run check:boundaries` はプロジェクトの TypeScript 設定とモジュールリゾルバーを使う。通常ビルドと診断ビルドは、型チェックの前にこれを実行する。このチェックは、静的インポート、再エクスポート、明示的な import type の参照、TypeScript が認識するリテラルの動的インポートを対象とする。

- ドメインはドメインのモジュールだけをインポートする。分離テストは、DOM やアンビエントなランタイムパッケージを使わず、ES2022 ライブラリに対して型チェックする。
- アプリケーションのユースケースは、同階層のユースケース、ドメインのルール、共有の `types.ts` モデルをインポートできる。コンポジションルートは、インフラ、プラットフォームサービス、レガシーモジュールを明示的に配線する場所であり、ユースケースはこれをインポートしない。
- インフラはアプリケーションのリポジトリ契約をインポートでき、表示層はコンポジションルートを使える。表示層はインフラを直接インポートできない。プラットフォームアダプターは、アプリケーションもインフラもインポートできない。
- レガシーのルートモジュール経由の既存の層またぎ呼び出しは、この限定ルールの対象外である。これはインポートの検査であり、計算されたモジュールパスと実行時の効果は対象外となる。

チェッカーはプロジェクトで合格した。クリエイターのインフラリポジトリをリテラルで動的インポートする一時ページは、想定どおり違反元と解決先を報告して失敗した。両方のビルドが同じチェックを実行する。

## M7.2 — プラットフォーム検証スナップショット

| 対象 | Codex Cloud で観測した内容 | この環境の外で残る確認 |
|---|---|---|
| フロントエンドのビルドとリグレッション | アーキテクチャチェック、ドメインテスト 3 件、アプリケーションテスト 10 件、プラットフォームテスト 14 件、本番ビルドと診断ビルドが合格。`db.ts` に関する既存の Vite 混在インポート警告は残った。 | 各ネイティブ対象でのパッケージ単位の検証。 |
| フィクスチャ IPC 付き Chromium | [レイアウトマトリクス](adaptive-ui.md) が合格。追加のスモーク実行で、ロケール検出、ホーム、不正/正当な投稿ルート、HTTP 404 を返すリビジョン、クリエイタープロフィール/投稿、再取得なしのブラウザ IndexedDB からの索引再読み込みを確認した。 | 実際の WebView IPC、認証、プロバイダーのダイアログ、OS のインセット、物理ジェスチャー。 |
| Linux Tauri | ホストの Rust チェックが診断あり/なしで合格。リンクした Linux 診断ビルドも合格。Xvfb では、システムの WebKitGTK 子プロセス `/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitNetworkProcess` が利用できなかったため、バイナリは起動中に停止した。 | システムの WebKitGTK 4.1 を備えた Linux マシンでネイティブのスモークを再実行し、パッケージ対象を検証する。 |
| Windows / macOS | この Linux 環境ではネイティブ実行なし。 | ビルド、起動、ログイン、バックアップ、クリップボード、キーボード、ロケールの挙動を確認する。 |
| Android | SDK 35 に対してコンパイルした単体の SAF プローブが、JVM のグラントマスク検査 5 件に合格。Chromium でシミュレートしたナビゲーションの戻る/終了を確認した。 | アプリをビルドして実行する。実際のプロバイダーに対する Android ピッカー、権限の永続化/取り消し、物理的な戻るを検証する。 |
| iOS | ソースのみのドキュメントピッカーのプロトタイプで、Xcode/UIKit なし。 | macOS でコンパイルし、次に Files プロバイダー、キャンセル/書き出し、セーフエリアの配置、物理ナビゲーションを試す。 |
| Pawchive 公開 HTTP | スキーマ要求が HTTP 200 を返した。`/api/v1/posts?o=0` への未認証 GET 1 回が HTTP 200 と、`id`、`service`、`user` を含む 50 件のレコードの JSON リストを返した。 | ネイティブの IPC/reqwest のエンドツーエンド、ログイン、認証付きフロー。HTTP プローブではアカウントの資格情報を使っていない。 |

リポジトリルートから実行したコマンドには `npm run test:domain`、`npm run test:application`、`npm run test:platform`、`npm run build`、`npm run build:debug`、ポート 5181 の Vite に対する `python tests/ui_layout_smoke.py` が含まれる。Rust のチェックは `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml -j 4` を使い、続いて同じコマンドに `--features debug-diag` を付けた。ネイティブのリンクは `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features debug-diag -j 4` を使った。Android プローブのコマンドは [ストレージの引き継ぎ](os-storage.md) にある。

M7.2 は依然として部分的である。M5 にはまだネイティブの証跡が必要であり、ブラウザのフィクスチャはフロントエンドの配線に対する証跡にすぎない。

### モバイル候補 2af56d5

以前のモバイルロケールのワークフローは、
[Actions run 44934090212](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212) で両方のパッケージをビルドした。
アプリ ID は `com.nsmr0604.pawkemoviewer.localetest` である。[現在のビルド手順](../BUILD.md) は
Android と iOS の `locale_test` オプションを説明している。

| 対象 | 証跡 |
|---|---|
| [Android arm64 APK](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212/artifacts/14718659514) | CI でデバッグ署名を検証。ダウンロードしたマニフェストには両方のランチャーエイリアスが含まれる。ARM64 ライブラリは、選択ファイルと直接フォルダー書き出しのコマンドを公開している。 |
| [署名なし iOS/iPadOS IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212/artifacts/14718772648) | ダウンロードした IPA には、iPhone と iPad のデバイスファミリー、Files 共有とインプレース設定、iPad 用のライトアイコン、選択ファイルと直接フォルダー書き出しのコマンドが含まれる。 |
| Linux とブラウザ | 診断あり/なしの Rust チェック、フロントエンドを埋め込んだ Linux 診断リンク、33 件のテスト、両方のフロントエンドビルド、Chromium のシェルマトリクスが合格。Xvfb では Linux バイナリ用の使用可能な WebView が得られなかった。 |

この候補により [統合版の実機確認](os-storage.md#モバイル統合版の実機確認) が可能になる。
端末の挙動、実際のプロバイダーのダイアログ、デスクトップパッケージの起動は、まだ検証が必要である。

### デスクトップ候補 3ec9392

[Actions run 44936122546](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546)
は、各ネイティブランナーで `npx tauri build --features debug-diag --bundles <platform-bundle>` を使った。
ダウンロードしたパッケージは次の検査に合格した:

| 対象 | パッケージの検査 |
|---|---|
| [Windows x64 NSIS](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546/artifacts/14719098731) | セットアップ実行ファイルは MZ と PE のヘッダーを持つ。 |
| [macOS app ZIP](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546/artifacts/14719364345) | アーカイブは ZIP の整合性検査に合格。同梱の Info.plist はアプリの実行ファイルとアイコンを指し、バージョン 0.5.0 を報告する。 |
| [Linux amd64 DEB](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546/artifacts/14719728314) | `dpkg-deb` はバージョン 0.5.0 を報告する。展開内容には ELF のアプリ実行ファイル、デスクトップエントリー、PNG アイコンが含まれる。 |

`node --test tests/{platform,application,domain}.test.mjs` は 33 件すべてのテストに合格した。
同じソースコミットから [Android APK](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122488/artifacts/14719793355)
と [署名なし iPhone/iPad IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122488/artifacts/14719957324) もビルドされた。
検査により、両方で別個のテスト用アプリ ID とロケールコマンド、さらに IPA 内の Files 共有
と iPad アイコンの宣言が確認された。デスクトップのインストール、アプリの起動、ライブ API/IPC
と統合されたプロバイダーの確認は、まだ残っている。

### インストール済みの Linux 候補

[Actions run 44937149049](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44937149049)
は Ubuntu 24.04 で APT を使って `3ec9392` の DEB をインストールした。Xvfb と新しい D-Bus
および XDG セッションの下で、`/usr/bin/pawkemoviewer` は WebKitGTK/AT-SPI 経由で
ホームの検索フィールドを公開した。同じアプリは、ネイティブの公開投稿リクエストから
HTTP 200 と空でない本文をログに記録した。これはインストール済みの起動、ホームの描画、
未認証の WebView から Rust へのライブ API 通信を対象とする。ログインと対話的な
デスクトップのフローは、まだ残っている。

## M7.3 — リリース判定と残課題

[0.5.1 は公開済み](https://github.com/nsmr0604/PawKemoViewer/releases/tag/pawkemoviewer-v0.5.1)。
全対象のデバッグ・リリースビルド、パッケージの内容、依存境界、自動テスト33件を確認した。
デスクトップの公開 API 検証は未認証の状態で行った。認証付き操作と統合版のモバイル実機確認は、
実行結果を得てから完了とする。

| 区分 | 残作業 |
|---|---|
| M5.4・M5.5 | Android・iPhone・iPad で、取り込み、書き出し、再起動、キャンセル、入力拒否を確認する。[実機確認手順](os-storage.md#モバイル統合版の実機確認) |
| M7.2 | 承認済みのテストアカウントでログインし、認証付きの API と操作を確認する。各端末のバージョン、ビルド、結果を記録する。 |
| 技術的な残課題 | クリエイター索引のデータとメタデータの原子性、IndexedDB の再接続、API キャッシュの競合、既存モジュールの依存チェック範囲、Vite と非診断 Rust ビルドの既知の警告を個別に扱う。 |

M7.3 の確定には M7.2 の残項目の結果を反映する。

### 0.5.6 実機の完了条件

| 範囲 | 完了とする実測 | 現時点の根拠 |
|---|---|---|
| iOS/iPadOS 診断 | 診断用 IPA を起動し、テストページと投稿リンクを試して Files に専用ログを書き出せる | iPadOS 16.5 + TrollStore で取得済み。テストページは HTTP 200。投稿リンクは OS 判定で停止した |
| iOS/iPadOS 修正確認 | 修正版で同じリンクを開き、ページの表示と元の記事への復帰を確認する | `25d3b721` の iPadOS 16.5 のログで `platform=ios` とテストページの HTTP 200 を確認。利用者が元の投稿リンクの表示と記事への復帰を実機確認。iPhone は未実施。[修正版 IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/45369152333/artifacts/14909410581) |
| M5.4・M5.5 | Android・iPhone・iPad で、[Files/SAF の確認手順](os-storage.md#モバイル統合版の実機確認)を実行する | iPad の標準フォルダーへの診断ログ保存、Redmi K20 Pro の 0.5.6 検証版で言語設定の表示と SAF 選択・キャンセルを確認。取り込みの確定、書き出し、再読み込みは端末別に確認する。[Android 検証 APK](https://github.com/nsmr0604/PawKemoViewer/actions/runs/45370707339/artifacts/14909207760) |
| M7.2 | 各対象でログイン状態のID表示、認証付きのお気に入り・フォロー参照、ログアウト確認のキャンセルと確定を確認する | 2026-11-24 に Windows からテストアカウントでログイン HTTP 302、投稿のお気に入りとフォロー一覧の参照 HTTP 200 を確認。アプリ UI の結果は端末ごとに記録する |
| M7.3 | 各対象のパッケージ生成、起動、M5・M7.2 の結果を照合し、公開判定を記録する | 0.5.6 の5対象のパッケージ生成済み。実機確認結果の反映待ち |

各ケースに端末・OS・アプリ版とコミット・結果を記録する。テストアカウントの入力値とセッション情報は記録から除く。結果は `成功`・`失敗`・`未実施` のいずれかで記載する。

追加の実機ログで、追加フォルダー内の不正な確認用ファイル `qac.json` が読み込み対象から除外されたことを確認した。ファイル選択画面からの不正入力、正常な取り込み・書き出し・再起動後の読み込み、認証 UI は個別に確認する。
