# 自己ホスト F-Droid リポジトリと Obtainium

IzzyOnDroid / F-Droid 本体の審査を通さず、自分で APK を配布するための手順です。
成人向け・非公式アーカイブという性質を維持したまま配布できます。

## 構成

- **Obtainium**: GitHub Releases を直接追跡。サーバー不要。
- **自己ホスト F-Droid**: `fdroidserver` でリポジトリを生成し、HTTPS で公開。
  F-Droid クライアントにリポジトリ URL を追加して更新を受け取る。

## 1. アプリのリリース鍵

正式配布用の鍵を作り、GitHub Secrets に登録します。

```bash
keytool -genkeypair -v -keystore release.jks -alias pawkemoviewer \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -dname "CN=PawKemoViewer, O=nsmr0604, C=JP"
```

GitHub の **Settings → Secrets and variables → Actions** に登録します。

| Secret | 値 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` の出力(Windows は `[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.jks"))`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore のパスワード |
| `ANDROID_KEY_ALIAS` | `pawkemoviewer` |
| `ANDROID_KEY_PASSWORD` | 鍵のパスワード(keystore と同じなら省略可) |

`release: true` の Android ビルドは、この Secrets がないと失敗します。
開発ビルドは従来どおり debug.keystore で署名します。

> 注意: 既存の debug.keystore 署名 APK とは別 identity になります。
> 既に配布済みの場合は、v3 署名ローテーションまたは再インストールが必要です。

## 2. リポジトリ署名鍵

F-Droid リポジトリの index を署名する鍵です。アプリの署名鍵とは別にします。

```bash
cd fdroid
keytool -genkeypair -v -keystore keystore.p12 -alias pawkemoviewer-repo \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -dname "CN=PawKemoViewer Repo, O=nsmr0604, C=JP"
cp config.example.yml config.yml
```

`config.yml` の `repo_url`・`keystorepass`・`keypass` を設定します。
`config.yml` と `keystore.p12` は**コミットしない**でください(`.gitignore` 済み)。

## 3. APK のビルドと署名

GitHub Actions の Android Build を `release=true` で実行するか、ローカルでビルドします。

```bash
npm run tauri android build
# 生成された APK を release.jks で署名
```

署名後は必ず指紋を確認します。

```bash
apksigner verify --print-certs PawKemoViewer.apk
```

## 4. リポジトリの生成

`fdroidserver` を用意します。

```bash
python3 -m pip install fdroidserver
```

署名済み APK をディレクトリに置き、スクリプトを実行します。

```bash
mkdir -p dist-apk
cp /path/to/PawKemoViewer.apk dist-apk/
scripts/fdroid/build-repo.sh dist-apk
```

`fdroid/repo/` に `index-v1.jar`、`index.xml`、APK、アイコンが生成されます。

## 5. 公開

`fdroid/repo/` の中身を HTTPS で公開します。GitHub Pages を使う場合:

1. `gh-pages` ブランチをチェックアウト
2. `fdroid/repo/` の中身を、`gh-pages` の `repo/` としてコピー
3. コミットして push

公開 URL:

```
https://nsmr0604.github.io/PawKemoViewer/repo
```

F-Droid クライアントでは「リポジトリを追加」からこの URL を登録します。
リポジトリ指紋は次で確認できます。

```bash
keytool -list -v -keystore fdroid/keystore.p12 -alias pawkemoviewer-repo
```

## 6. Obtainium

Obtainium では GitHub リポジトリを追加するだけで、GitHub Releases の APK を追跡できます。

1. Obtainium → Add App
2. URL に `https://github.com/nsmr0604/PawKemoViewer` を入力
3. リリースの APK を選択

APK の署名鍵が変わると更新できないため、リリース鍵を固定してください。

## 更新フロー

1. バージョンを上げる
2. `release=true` で Android Build を実行し、APK を GitHub Releases に添付
3. 必要に応じて `scripts/fdroid/build-repo.sh` でリポジトリを更新
4. `fdroid/repo/` の中身を公開先の `repo/` へコピー

## 注意

- 本アプリは 18 歳以上向けで、成人向け内容を含みます。自己ホストでも年齢確認と注意書きを維持してください。
- コンテンツの権利は各権利者に帰属します。保存は私的利用の範囲に限ります。
- pawchive.pw の API 仕様・利用条件は変更される可能性があります。
- IzzyOnDroid / F-Droid 本体への申請は、成人向け・権利・AI ポリシーの観点で受理が難しい状況です。
