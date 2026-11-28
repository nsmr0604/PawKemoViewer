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
mkdir -p fdroid && cd fdroid
# テンプレートは gh-pages に公開しています
curl -fsSL -o config.example.yml \
  "https://nsmr0604.github.io/PawKemoViewer/fdroid/config.example.yml"
keytool -genkeypair -v -keystore keystore.p12 -alias pawkemoviewer-repo \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -dname "CN=PawKemoViewer Repo, O=nsmr0604, C=JP"
cp config.example.yml config.yml
```

`config.yml` の `repo_url`・`keystorepass`・`keypass` を設定します。
`config.yml` と `keystore.p12` は**コミットしない**でください(`.gitignore` 済み)。

F-Droid のメタデータ (`fdroid/metadata/`) も gh-pages にあります。ローカルで生成する場合は
`gh-pages` からコピーしてください。

## 3. APK のビルドと署名

GitHub Actions の Android Build を `release=true` で実行するか、ローカルでビルドします。

```bash
npm run tauri -- android build --apk
npm run tauri -- android build --apk --split-per-abi --target aarch64
# 生成された universal / arm64 APK を release.jks で署名
```

F-Droid リポジトリには universal（`PawKemoViewer.apk`）を置きます。

署名後は必ず指紋を確認します。

```bash
apksigner verify --print-certs PawKemoViewer.apk
```

## 4. リポジトリの生成

GitHub Actions の **F-Droid repository** (`fdroid.yml`) を使うのが標準です。

1. リリース (`pawkemoviewer-vX.Y.Z`) を公開する
2. Actions の `F-Droid repository` を、tag を指定して実行する
   (リリース公開時にも自動で実行されます)

ワークフローは release から universal APK を取得し、`gh-pages` の `repo/index*` を
F-Droid リポジトリ鍵で署名し直してから push します。必要な Secrets:

| Secret | 内容 |
|---|---|
| `FDROID_KEYSTORE_BASE64` | `keystore.p12` を base64 にしたもの |
| `FDROID_KEYSTORE_PASSWORD` | keystore のパスワード |
| `FDROID_KEY_PASSWORD` | 鍵のパスワード |

`gh-pages` の `repo/` には apt (`dists`, `pool`)・rpm (`repodata`)・AltStore (`apps.json`)
も同居しているため、ワークフローは F-Droid 管理分 (`index*`, `entry*`, `icons`, `diff`,
`status`, `PawKemoViewer.apk`) だけを差し替えます。

### ローカルで生成する場合

`fdroidserver` を用意します。Ubuntu 24.04 の apt 版 (2.2) は新しい AAPT2 の
`resources.arsc` を解析できず `res1 must be zero!` で落ちるため、pip 版を使います。

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

ワークフローが `gh-pages` の `repo/` を更新します。ローカルで生成した場合は、
`fdroid/repo/` の中身を `gh-pages` の `repo/` へコピーしてコミット・push します。

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
