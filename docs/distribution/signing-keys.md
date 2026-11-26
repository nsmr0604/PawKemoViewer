# 署名鍵の生成

APK のリリース署名と、apt / rpm リポジトリの GPG 署名に使う鍵を生成します。
**生成した鍵・パスワードは絶対にコミットしないでください。**

## ウィザード

```bash
node scripts/signing/generate-keys.mjs
```

対話形式で次を入力できます。

- APK 鍵の保存先 / alias
- パスワード(APK と GPG で共通)
- RSA 鍵長 / 有効日数
- 証明書の CN / OU / O / L / ST / C
- GPG の名前 / メール / 有効期限

### オプションで指定する場合

```bash
SIGNING_PASSWORD='...' node scripts/signing/generate-keys.mjs \
  --out-dir .agent-work/signing2 \
  --alias pawkemoviewer \
  --key-size 4096 \
  --validity-days 10950 \
  --cn PawKemoViewer \
  --ou Development \
  --o nsmr0604 \
  --l Tokyo \
  --st Tokyo \
  --c JP \
  --gpg-name 'PawKemoViewer Repository' \
  --gpg-email nsmr0604@users.noreply.github.com \
  --gpg-expire 10y
```

`--skip-apk` / `--skip-gpg` で片方だけ生成できます。
既存ファイルを上書きする場合だけ `--force` を付けてください。
`--help` で全オプションを表示します。

パスワードを対話で入力したくない場合:

```bash
SIGNING_PASSWORD='...' node scripts/signing/generate-keys.mjs --out-dir .agent-work/signing
```

Linux の GPG 鍵は Linux / WSL 上で生成してください(GnuPG が必要)。
Windows で GnuPG が無い場合、APK 鍵だけ生成して終了します。

## 生成物

`.agent-work/signing/`(gitignore 済み)に次を出力します。

| ファイル | 内容 |
|---|---|
| `pawkemo-release.p12` | APK 署名鍵(PKCS#12) |
| `android-keystore.b64` | GitHub Secret 用 base64 |
| `linux-repo-private.asc` | GPG 秘密鍵(armored) |
| `linux-repo-public.asc` | GPG 公開鍵 |
| `linux-repo-private.b64` | GitHub Secret 用 base64 |
| `linux-repo-key-id.txt` | GPG fingerprint |
| `signing-info.json` | alias / SHA-256 / fingerprint(秘密鍵は含まない) |

## GitHub Secrets

| Secret | 値 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `android-keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | パスワード |
| `ANDROID_KEY_ALIAS` | 生成時の alias |
| `ANDROID_KEY_PASSWORD` | パスワード |
| `LINUX_REPO_GPG_PRIVATE_KEY` | `linux-repo-private.b64` |
| `LINUX_REPO_GPG_PASSPHRASE` | パスワード |

```bash
gh secret set ANDROID_KEYSTORE_BASE64 --body "$(cat .agent-work/signing/android-keystore.b64)"
gh secret set ANDROID_KEYSTORE_PASSWORD --body '...'
gh secret set ANDROID_KEY_ALIAS --body 'pawkemoviewer'
gh secret set ANDROID_KEY_PASSWORD --body '...'
gh secret set LINUX_REPO_GPG_PRIVATE_KEY --body "$(cat .agent-work/signing/linux-repo-private.b64)"
gh secret set LINUX_REPO_GPG_PASSPHRASE --body '...'
```

## 注意

- APK の署名鍵を変更すると、既存インストールとの更新互換がなくなります。
- GPG 鍵を変更すると、利用者は公開鍵の再インポートが必要です。
- 鍵はオフラインの安全な場所に 2 箇所以上バックアップしてください。
- `signing-info.json` 以外の生成物は秘密情報です。共有・コミットしないでください。
