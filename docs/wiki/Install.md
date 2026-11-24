# インストールとログイン

## ダウンロード

[GitHub Releases](https://github.com/nsmr0604/pawchive/releases) から、お使いの環境のファイルを取得します。

| 環境 | ファイル |
|---|---|
| Windows | `PawKemoViewer_x.y.z_x64-setup.exe` または `_x64_en-US.msi` |
| Linux | `.AppImage` / `.deb` / `.rpm` |
| macOS | `.dmg` (Apple Silicon) / `app.tar.gz` |
| Android | `PawKemoViewer_x.y.z_universal.apk` |
| iOS / iPadOS | `PawKemoViewer_x.y.z_ios-unsigned.ipa` (未署名) |

開発中のビルドは `debug-latest` (プレリリース) にあります。

## インストール

### Windows

1. `setup.exe` または `msi` を実行します。
2. 初回起動時に Windows ファイアウォールの確認が出たら許可します。
3. 実行ファイルは未署名のため、SmartScreen の警告が出る場合は「詳細情報」から実行します。

### Linux

- `.deb`: `sudo apt install ./PawKemoViewer_x.y.z_amd64.deb`
- `.rpm`: お使いのディストリビューションのパッケージ操作でインストールします。
- `.AppImage`: 実行権限を付けて起動します (`chmod +x`)。

### macOS

1. `.dmg` を開き、アプリを Applications へ移します。
2. 未署名のため、初回はアプリを右クリック →「開く」で起動します。

### Android

1. `PawKemoViewer_x.y.z_universal.apk` を端末へコピーします。
2. 設定で「提供元不明のアプリ」を一時的に許可し、APK をインストールします。
3. インストール後は許可を戻して構いません。

### iOS / iPadOS

配布されている IPA は未署名です。そのままでは実機にインストールできないため、
Apple Developer の証明書で再署名するか、署名済みの手段で導入してください。

## ログイン

設定 → アカウント からログインします。ログインは任意で、未ログインでも投稿とクリエイターの閲覧はできます。

1. **ID / パスワードでログイン** を押します。
2. pawchive の ID とパスワードを入力します。
3. ログインするとセッションキーが自動で保存され、お気に入りとフォローが使えます。

- ログイン状態は設定 → アカウント の「ログイン状態」で確認できます。
  「ログイン済み」「未ログイン・無効」「通信エラー」が表示されます。

## 最初に確認すること

1. ホームに投稿が表示されるか
2. 設定 → 情報 のアプリバージョン
3. 設定 → 表示 のテーマとレイアウト (PC / モバイル)
4. 必要なら設定 → 言語・翻訳ファイル で表示言語を切り替える

画像が表示されない場合は [困ったとき](Troubleshooting) を参照してください。
