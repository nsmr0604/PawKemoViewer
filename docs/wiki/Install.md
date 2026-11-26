# インストールとログイン

## ダウンロード

[GitHub Releases]({{REPOSITORY_URL}}/releases)から、お使いの環境のファイルを取得します。

最新の公開版 0.5.8 は固定名です。

| 環境 | ファイル名 |
|---|---|
| Windows | `PawKemoViewer.exe` / `PawKemoViewer.msi` |
| Linux | `PawKemoViewer.AppImage` / `PawKemoViewer.deb` / `PawKemoViewer.rpm` |
| macOS | `PawKemoViewer.dmg` / `PawKemoViewer.app.tar.gz` |
| Android | `PawKemoViewer.apk` |
| iOS / iPadOS | `PawKemoViewer.ipa` |

0.5.7 以前は `PawKemoViewer_0.5.7_x64-setup.exe` のような版入り名です。各リリースの実際のファイル名を確認してください。

開発版は `debug-latest` プレリリースにあります。

## インストール

### Windows

1. `PawKemoViewer.exe` または `PawKemoViewer.msi` を実行します。
2. 初回起動時にファイアウォールの確認が出たら許可します。
3. 未署名のため、SmartScreen の警告が出る場合は「詳細情報」から実行します。

### Linux

- `.deb`: `sudo apt install ./PawKemoViewer.deb`
- `.rpm`: お使いのディストリビューションのパッケージ操作でインストールします。
- `.AppImage`: 実行権限を付けて起動します（`chmod +x`）。

### macOS

1. `.dmg` を開き、アプリを Applications へ移します。
2. 未署名のため、初回はアプリを右クリック →「開く」で起動します。

### Android

1. APK を端末へコピーします。
2. 「提供元不明のアプリ」を一時的に許可し、インストールします。
3. インストール後は許可を戻して構いません。

APK は標準 debug.keystore で署名しています。同じ署名の APK への更新ではデータが保持されます。

### iOS / iPadOS

配布 IPA は未署名です。そのままでは実機にインストールできないため、Apple Developer の証明書で再署名するか、署名済みの手段で導入してください。

## ログイン

設定 → アカウントから、pawchive の ID / パスワードでログインします。ログインは任意で、未ログインでも投稿とクリエイターの閲覧はできます。

1. **ID / パスワードでログイン** を押します。
2. pawchive の ID とパスワードを入力します。
3. 成功するとセッションが保存され、お気に入りとフォローが使えます。

ログイン状態は設定 → アカウントの **ログイン状態** で確認できます。

### 手動 session を使う場合

通常のログインで問題がある場合だけ、次から入力します。

1. 設定 → 情報 → **開発項目を表示** を有効にします。
2. 開発・診断 → **手動 session** を開きます。
3. pawchive の session を入力して検証・保存します。

session は認証情報です。他人へ共有したり、バックアップやログと一緒に公開したりしないでください。

## 最初に確認すること

1. ホームに投稿が表示されるか
2. 設定 → 情報のアプリバージョン
3. 設定 → 表示のテーマとレイアウト
4. 必要なら設定 → 言語・翻訳ファイルで表示言語を切り替える

画像が表示されない場合は[困ったとき](Troubleshooting)を参照してください。
