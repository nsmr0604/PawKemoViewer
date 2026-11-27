<p align="center">
  <img src="src-tauri/app-icons/pc.png" width="132" height="132" alt="PawKemoViewerのPC版アイコン">
</p>

<h1 align="center">PawKemoViewer</h1>

<p align="center">pawchive の公開 API を使う、非公式のデスクトップ / モバイルビューア</p>

> **非公式ビューア**: 本アプリは pawchive.pw の公式 API を利用する非公式のビューアです。
> pawchive.pw およびコンテンツ提供元の各サービス・運営者とは関係ありません。
> 18 歳以上の方のみご利用ください(成人向けの内容が含まれる場合があります)。
> [利用規約](docs/legal/terms.ja.md) / [プライバシーポリシー](docs/legal/privacy.ja.md)

[![最新リリース](https://img.shields.io/badge/Release-Latest-087f73?style=flat-square)](../../releases/latest)
[![ビルド状況](https://img.shields.io/badge/GitHub_Actions-Builds-2563eb?style=flat-square&logo=githubactions&logoColor=white)](../../actions)
[![利用ガイド](https://img.shields.io/badge/Guide-Wiki-5b4bb7?style=flat-square&logo=github&logoColor=white)](../../wiki)
[![MITライセンス](https://img.shields.io/badge/License-MIT-5b6472?style=flat-square)](LICENSE)

[![PC対応: Windows、macOS、Linux](https://img.shields.io/badge/PC-Windows_%7C_macOS_%7C_Linux-24546c?style=flat-square)](#ダウンロード)
[![モバイル対応: Android、iOS、iPadOS](https://img.shields.io/badge/Mobile-Android_%7C_iOS_%7C_iPadOS-24546c?style=flat-square)](#ダウンロード)

pawchive の投稿・クリエイター・お気に入りを、デスクトップとモバイルの両方で閲覧するためのビューアです。ブラウザを開かずに、フォローしたクリエイターの新着や保存済みの投稿を確認できます。

- **最新の公開版**: 0.6.0（一括画像保存、外部ページ、署名付きリリース、配布リポジトリ）
- **開発中の版**: 0.6.1（不具合修正と配布まわりの調整）

## 主な機能

- **投稿一覧**: 新着投稿、グリッド / リスト、無限スクロール、投稿元サービスでの絞り込み、AI 投稿の除外
- **クリエイター**: 名前・ID・クリエイター slug での検索、プロフィール、バナー、タグ、投稿一覧、フォロー
- **投稿詳細**: 本文、画像・動画、コメント、改訂履歴、タグ、取得日時、前後の投稿への移動
- **サムネイル優先表示**: 一覧は保存済みサムネイルを優先し、必要に応じて元画像を読み込み
- **カバー画像の除外**: `cover.jpeg` を投稿詳細のファイル一覧と一括保存の添付候補から外せます
- **一括画像保存**: 本文・添付・外部リンク先の画像を選んでまとめて保存。進捗、中止、失敗理由、保存先を表示
- **外部ページ**: 元記事の Referer を付けて実オリジンのまま表示します（全 OS）。モバイルはネイティブビュー、デスクトップは専用ウィンドウ
- **外部ページの画像保存**: 表示中の画像をサムネイルのチェック式から選んで保存（全 OS）
- **フォローとお気に入り**: フォロー中の新着、既読、投稿 / クリエイターのお気に入りと並べ替え
- **元サービスで開く**: 投稿・クリエイターページを OS のブラウザで開く
- **キャッシュ**: クリエイター索引、アイコン、投稿サムネイルを端末に保存
- **省データ表示**: 低通信モード、投稿ファイルのリスト表示、サムネイル保存上限
- **バックアップとログ**: 設定・フォロー・既読をバックアップし、ログを書き出し
- **表示言語**: 日本語 / 英語と、追加フォルダーの外部翻訳 JSON
- **テーマとレイアウト**: ダーク / ライト、自動 / デスクトップ / モバイル。モバイルアイコンもテーマに同期
- **プライバシー**: 開発者・配布者は利用者の個人情報を一切収集しません。アクセス解析・広告・クラッシュ収集もありません

## 使い方

### ログイン

設定 → アカウントから、pawchive の ID / パスワードでログインします。ログインするとお気に入りとフォローが利用できます。ログインしなくても、投稿とクリエイターの閲覧は可能です。

手動のセッションキーは、設定 → 情報 → **開発項目を表示** → 開発・診断 → **手動 session** から入力します。通常のログインで問題がある場合だけ使い、他人へ共有しないでください。

### URL を検索する

- ホームの検索欄に pawchive の投稿 / クリエイター URL を貼り付けると、検索語として送信します。
- クリエイター画面では pawchive と各サービスのクリエイター URL を認識します。
- 各サービスの投稿 URL は対応するクリエイターを検索し、「この投稿を開く」を表示します。

### 画像が表示されない場合

DNS フィルタ（AdGuard など）で `pawchive.pw` が遮断される環境では、API と画像に接続できません。端末またはルーターの DNS を通常の DNS サーバーへ変更してください。

### 外部リンクについて

外部リンクは、Android / iOS はネイティブビュー、デスクトップは専用ウィンドウで開きます。どちらも画面上部で現在の URL を確認でき、「戻る」「画像を保存」「閉じる」を使えます。「閉じる」または戻る操作で投稿へ復帰します。

### 保存先

- 設定・フォロー・既読・キャッシュ: 端末内（アプリ専用領域 / IndexedDB）
- バックアップ・ログ: モバイルはアプリの `Documents/{Backups,Logs}`、デスクトップは選択した保存先
- 追加言語: モバイルは `Documents/Languages`、デスクトップは固定の `Documents/Pawchive/languages`
- 一括画像: デスクトップは `Downloads/PawKemoView/<クリエイター名>`、Android 10 以降は端末の `Download/PawKemoViewer/<クリエイター名>`、Android 9 以下と iOS は `Documents/Downloads/<クリエイター名>`

## プライバシー

- **開発者・配布者は、利用者の個人情報を一切収集しません。**
- アクセス解析、広告、クラッシュ収集、トラッキング SDK は組み込んでいません。
- 設定、フォロー、お気に入り、既読、セッションキー、キャッシュは**端末内にのみ**保存されます。
- 認証情報や検索語は、機能提供のため pawchive.pw への通信にのみ使用され、開発者のサーバーへ送信・保存されることはありません。
- 詳細は[プライバシーポリシー](docs/legal/privacy.ja.md)を参照してください。
- 不具合・要望は [GitHub Issues](https://github.com/nsmr0604/PawKemoViewer/issues)、権利侵害・削除依頼・プライバシーは GitHub Issues(メール: nsmr0604@users.noreply.github.com) へお願いします。

## ダウンロード

[GitHub Releases](../../releases/latest) から、お使いの環境のファイルを取得します。0.6.0 以降の正式版は固定名で公開しています。

### Obtainium / 自己ホスト F-Droid

- **Obtainium**: `https://github.com/nsmr0604/PawKemoViewer` を追加すると、GitHub Releases の APK を追跡できます。
- **自己ホスト F-Droid**: リポジトリの追加手順と公開 URL は [自己ホスト F-Droid](docs/distribution/self-hosted-fdroid.md) を参照してください。
- **apt / rpm**: Linux 向けリポジトリの追加方法は [apt / rpm リポジトリ](docs/distribution/linux-repositories.md) を参照してください。
- **AltStore / LiveContainer**: iOS 向けソース URL は [AltStore / LiveContainer](docs/distribution/altstore-livecontainer.md) を参照してください。

| プラットフォーム | ファイル名 |
|---|---|
| Windows | `PawKemoViewer.exe` / `PawKemoViewer.msi` |
| Linux | `PawKemoViewer.AppImage` / `PawKemoViewer.deb` / `PawKemoViewer.rpm` |
| macOS | `PawKemoViewer.dmg` / `PawKemoViewer.app.tar.gz` |
| Android | `PawKemoViewer.apk`（universal） / `PawKemoViewer_arm64.apk` |
| iOS / iPadOS | `PawKemoViewer.ipa` |

- Windows / macOS の実行ファイルは未署名です。Windows では SmartScreen とファイアウォールの許可が必要になる場合があります。macOS では右クリックから開いてください。
- Android APK は release key で署名しています。Play ストアでは配布していません。「提供元不明のアプリ」を許可してインストールしてください。`PawKemoViewer_arm64.apk` は arm64 端末向けの軽量版で、ほぼすべての現行端末で利用できます。迷ったら `PawKemoViewer.apk`（universal）を使ってください。
- iOS IPA は未署名です。そのままでは実機にインストールできず、再署名が必要です。
- 開発版は [debug-latest](../../releases/tag/debug-latest) にあります。プラットフォームごとに更新時刻が異なるため、ファイル名の版を確認してください。

## ドキュメント

- [Wiki](../../wiki): インストール、使い方、設定、言語、ファイル、困ったとき
- [開発状況・残課題](docs/STATUS.md): 0.6.0 の実装範囲、検証結果、既知の制約
- [開発ガイド](docs/DEVELOPMENT.md): コード構成、実装規約、テスト
- [ビルドガイド](docs/BUILD.md): ローカルビルド、CI、リリース
- [API 仕様](docs/API.md): pawchive API、Tauri コマンド、pkv
- [画面設計](docs/screens/README.md): 画面一覧、遷移、各画面と共通コンポーネントの仕様
- [データ設計](docs/data/schema.md): IndexedDB、Web Storage、ファイル配置
- [フロントエンドリファレンス](docs/reference/frontend.md): 全モジュールと関数
- [Rust リファレンス](docs/reference/rust.md): コマンド、関数、資源制約
- [一括画像保存](docs/features/image-download.md): 対象、保存先、進捗、外部ページ連携
- [変更履歴](docs/HISTORY.md): 版ごとの変更
- [引き継ぎ手順](docs/handoff/README.md): 作業・検証・申し送りのルール
- [ライセンス](LICENSE) / [第三者ソフトウェア](docs/LICENSES.md)

## 開発

```bash
npm ci
npm run tauri:dev
```

テストとビルドの詳細は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) と [docs/BUILD.md](docs/BUILD.md) を参照してください。

## 免責事項

- 本アプリは pawchive.pw の非公式ビューアであり、pawchive.pw およびコンテンツ提供元の各サービスとは提携していません。
- 本アプリの利用に起因するトラブルや損害について、開発者・配布者は一切の責任を負いません。

## ライセンス

[MIT License](LICENSE) で公開しています。第三者ソフトウェアの帰属は [docs/LICENSES.md](docs/LICENSES.md) を参照してください。
