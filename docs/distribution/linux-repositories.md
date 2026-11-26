# apt / rpm リポジトリ

GitHub Releases の `.deb` / `.rpm` から、apt と rpm のリポジトリを生成して
GitHub Pages で公開する手順です。

## 公開 URL

- apt: `https://nsmr0604.github.io/PawKemoViewer/apt`
- rpm: `https://nsmr0604.github.io/PawKemoViewer/rpm`

パッケージ名はどちらも `paw-kemo-viewer` です。

## 署名鍵

apt の `Release`/`InRelease` と rpm の `repomd.xml` を署名する GPG 鍵を用意します。
アプリの APK 署名鍵とは別の鍵で構いません。

```bash
gpg --quick-generate-key "PawKemoViewer Repository" rsa4096 sign 10y
gpg --list-secret-keys --with-colons | awk -F: '/^sec:/{print $5; exit}'
```

GitHub の **Settings → Secrets and variables → Actions** に登録します。

| Secret | 内容 |
|---|---|
| `LINUX_REPO_GPG_PRIVATE_KEY` | `gpg --armor --export-secret-keys <KEY_ID> \| base64 -w0` |
| `LINUX_REPO_GPG_PASSPHRASE` | 鍵のパスフレーズ(不要なら未設定) |

公開鍵はリポジトリ生成時に以下へ出力されます。

- `apt/public.key`
- `rpm/RPM-GPG-KEY-pawkemoviewer`

## 自動生成

`.github/workflows/linux-repo.yml` が、リリース公開時に `.deb` / `.rpm` を取得し、
リポジトリを生成して `gh-pages` の `apt/` と `rpm/` へ push します。

- トリガー: Release published / 手動実行
- リリースには `PawKemoViewer.deb` と `PawKemoViewer.rpm` が必要
- 署名鍵の Secret がない場合は失敗します

## ローカルで生成

```bash
# Ubuntu/Debian
sudo apt-get install -y dpkg-dev apt-utils gnupg createrepo-c

mkdir -p dist-deb dist-rpm
cp /path/to/PawKemoViewer.deb dist-deb/
cp /path/to/PawKemoViewer.rpm dist-rpm/

LINUX_REPO_GPG_KEY_ID=<KEY_ID> \
  scripts/linux-repo/build-repos.sh dist-deb dist-rpm linux-repo
```

`linux-repo/apt` と `linux-repo/rpm` を公開先の `apt/` と `rpm/` にコピーします。

## apt でのインストール

```bash
curl -fsSL https://nsmr0604.github.io/PawKemoViewer/apt/public.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/pawkemoviewer.gpg

echo "deb [signed-by=/usr/share/keyrings/pawkemoviewer.gpg] https://nsmr0604.github.io/PawKemoViewer/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/pawkemoviewer.list

sudo apt update
sudo apt install paw-kemo-viewer
```

## rpm でのインストール

```bash
sudo rpm --import https://nsmr0604.github.io/PawKemoViewer/rpm/RPM-GPG-KEY-pawkemoviewer

sudo tee /etc/yum.repos.d/pawkemoviewer.repo >/dev/null <<'EOF'
[pawkemoviewer]
name=PawKemoViewer
baseurl=https://nsmr0604.github.io/PawKemoViewer/rpm
enabled=1
gpgcheck=0
repo_gpgcheck=1
gpgkey=https://nsmr0604.github.io/PawKemoViewer/rpm/RPM-GPG-KEY-pawkemoviewer
EOF

sudo dnf install paw-kemo-viewer
```

`repo_gpgcheck=1` はリポジトリメタデータ(`repomd.xml`)の署名を検証します。
RPM パッケージ自体への署名は行っていないため、`gpgcheck=0` としています。
パッケージ署名も必要な場合は `rpm --addsign` を追加してください。

## 注意

- apt は `amd64`、rpm は `x86_64` のみを対象にしています。
- リリースの `.deb` / `.rpm` は CI の Linux ビルド成果物を使用してください。
- 署名鍵を変更すると、利用者は公開鍵の再インポートが必要になります。
- 本アプリは 18 歳以上向けで、成人向け内容を含みます。配布時は年齢確認と注意書きを維持してください。
