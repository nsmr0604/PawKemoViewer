<p align="center">
  <img src="src-tauri/app-icons/pc.png" width="132" height="132" alt="PawKemoViewerのPC版アイコン">
</p>

<h1 align="center">PawKemoViewer</h1>

<p align="center">Pawchiveの公開APIを使用する、Pawchiveの非公式ビューアー</p>

[![最新リリース](https://img.shields.io/badge/Release-Latest-087f73?style=flat-square)](../../releases/latest)
[![ビルド状況](https://img.shields.io/badge/GitHub_Actions-Builds-2563eb?style=flat-square&logo=githubactions&logoColor=white)](../../actions)
[![利用ガイド](https://img.shields.io/badge/Guide-Wiki-5b4bb7?style=flat-square&logo=github&logoColor=white)](../../wiki)
[![MITライセンス](https://img.shields.io/badge/License-MIT-5b6472?style=flat-square)](LICENSE)

[![PC対応: Windows、macOS、Linux](https://img.shields.io/badge/PC-Windows_%7C_macOS_%7C_Linux-24546c?style=flat-square)](#ダウンロード)
[![モバイル対応: Android、iOS、iPadOS](https://img.shields.io/badge/Mobile-Android_%7C_iOS_%7C_iPadOS-24546c?style=flat-square)](#ダウンロード)

pawchive の投稿・クリエイター・お気に入りを、デスクトップとモバイルの両方で快適に閲覧するためのビューアです。ブラウザを開かずに、フォローしたクリエイターの新着や保存済みの投稿を確認できます。

## 主な機能

- **投稿一覧**: 新着投稿 (グリッド / リスト切替)、無限スクロール、サービス絞り込み (すべて / FANBOX / Patreon)、AI 投稿の除外
- **クリエイター**: 検索 (名前 / ID / URL)、プロフィール・タグ・告知、フォロー (★ バッジ)、更新日・人気・名前での並べ替え
- **投稿詳細**: 本文、画像・動画、コメント、改訂履歴、タグ、取得日時、前後の投稿への移動
- **サムネイル優先表示**: 一覧はサムネイルを先に読み込み、必要なときだけ本体を取得
- **FANBOX のカバー画像除外**: `cover.jpeg` を表示から外せます (グローバル設定)
- **外部リンク**: 投稿本文からリンク先を開けます。投稿上部のサイトボタンは OS のブラウザで開きます
- **お気に入り**: 投稿・クリエイターの一覧、並べ替え
- **URL 貼り付け**: pawchive の投稿 URL / クリエイター URL / fanbox の投稿 URL を貼り付けて直接開く
- **元サービスで開く**: fanbox / patreon の投稿・クリエイターページを開く
- **アイコンキャッシュ**: クリエイターアイコンを端末に保存し、2 回目以降は通信せずに表示
- **省データ表示**: 低通信モードでは投稿一覧の保存済みサムネイルを表示し、新しい画像の自動取得を止めます。投稿内のファイルは省データのリスト表示でも確認できます
- **投稿サムネイル**: 保存上限は設定 → キャッシュ・保存領域で 100〜2,000 件の5段階から選べます (既定は500件)
- **ファイルの書き出し・読み込み**: バックアップ / ログ / 言語ファイルを標準フォルダーまたは選択した保存先へ書き出し、外部ファイルから読み込み
- **テーマ**: ダーク / ライト、レイアウト自動判定 (PC / モバイル切替可)。モバイルのアプリアイコンは既定が dark で、light テーマ時に light へ切り替わります
- **多言語対応**: 設定 → 言語・翻訳ファイルで切り替えられます。外部の翻訳ファイルも追加できます

## 使い方

### ログイン

設定 → アカウント から次のどちらかでログインします。

- **ID / パスワード**でログイン
- pawchive のセッションキーを直接入力 (通常のログインで問題がある場合)

ログインすると、お気に入りとフォローが利用できるようになります。ログインしなくても、投稿とクリエイターの閲覧は可能です。

### 画像が表示されない場合

DNS フィルタ (AdGuard など) で pawchive.pw が遮断される環境では、API と画像に接続できません。この場合は DNS の設定を通常の DNS サーバーに変更してください。

### 外部リンクについて

Android・iOSの外部ページビューでは、画面上部で現在のURLを確認できます。「閉じる」または戻る操作で投稿へ戻れます。

### 保存先

- 設定・フォロー・既読・アイコンキャッシュ: 端末内 (アプリ専用領域 / IndexedDB)
- バックアップ・ログ・言語ファイル: モバイルはアプリの書類領域 (`Documents/Backups` など)、デスクトップはアプリデータ領域。設定から別の保存先も選べます

## ダウンロード

[GitHub Releases](../../releases/latest) から入手できます。以下は製品版の固定ファイル名です。

| プラットフォーム | ファイル |
|---|---|
| Windows | `PawKemoViewer.exe` / `PawKemoViewer.msi` |
| Linux | `PawKemoViewer.AppImage` / `PawKemoViewer.deb` / `PawKemoViewer.rpm` |
| macOS | `PawKemoViewer.dmg` (Apple Silicon) / `PawKemoViewer.app.tar.gz` |
| Android | `PawKemoViewer.apk` |
| iOS / iPadOS | `PawKemoViewer.ipa` (未署名) |

- Windows / macOS の実行ファイルは現在未署名です。Windows では初回起動時にファイアウォールの許可が必要になる場合があります。macOS では右クリックから開いてください。
- Android の APK は開発用キーで署名しています。Play ストアでは配布していません。端末の「提供元不明のアプリ」を許可してインストールしてください。
- iOS の IPA は未署名のため、そのままでは実機にインストールできません (再署名が必要)。
- 開発中のビルドは [debug-latest](../../releases/tag/debug-latest) (プレリリース) に置かれます。

## ドキュメント

- [Wiki](../../wiki): インストール、使い方、設定、言語、バックアップ、困ったとき (利用者向け)
- [開発状況・残課題](docs/STATUS.md): 現在のリリース状態、既知の制約、次の作業
- [開発ガイド](docs/DEVELOPMENT.md): アーキテクチャ、ディレクトリ構成、実装規約、テスト
- [ビルドガイド](docs/BUILD.md): ローカルビルド、CI、リリース手順
- [API 仕様](docs/API.md): pawchive API と Tauri コマンドの仕様
- [変更履歴](docs/HISTORY.md): リリースごとの主な変更
- [引継ぎ資料](docs/handoff/README.md): 経緯、決定事項、未完了事項
- [ライセンス一覧](docs/LICENSES.md): 利用しているオープンソースソフトウェア

## 開発

```bash
npm install
npm run tauri:dev     # 開発実行 (Vite + Tauri)
```

テストとビルドの詳細は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) と [docs/BUILD.md](docs/BUILD.md) を参照してください。

## 免責事項

- 本アプリは pawchive.pw の非公式クライアントであり、pawchive・fanbox・patreon などの各サービスとは提携していません。
- 本アプリの利用に起因するトラブルや損害について、開発者・配布者は一切の責任を負いません。

## ライセンス

[MIT License](LICENSE) で公開しています。
第三者ソフトウェアの帰属は [docs/LICENSES.md](docs/LICENSES.md) を参照してください。
