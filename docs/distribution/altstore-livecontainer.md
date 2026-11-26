# AltStore / LiveContainer ソース

AltStore Classic と LiveContainer の両方で使える、AltStore 形式のソース JSON です。
同じ URL を両方に追加できます。

## ソース URL

```
https://nsmr0604.github.io/PawKemoViewer/repo/apps.json
```

GitHub Pages は `https://www.nsmr0604.geek.jp/PawKemoViewer/` へリダイレクトされます。
クライアントがリダイレクトを扱えない場合は、次の正規 URL を使用してください。

```
https://www.nsmr0604.geek.jp/PawKemoViewer/repo/apps.json
```

## 公開

`altstore/apps.json` を `gh-pages` の `repo/apps.json` にコピーします。

```
gh-pages/
└─ repo/
   └─ apps.json
```

## AltStore Classic での追加

1. PC で AltServer を起動し、iOS 端末を接続
2. AltStore の **Sources** → **+**
3. 上記のソース URL を入力
4. PawKemoViewer を選び **Install**

AltStore は未署名 IPA を、利用者の Apple ID で署名してインストールします。
無料の Apple ID の場合、7 日ごとの再署名(AltStore の Refresh)が必要です。

## LiveContainer での追加

1. LiveContainer の **Sources** タブ → **+**
2. 上記のソース URL を入力
3. PawKemoViewer の **Install**

LiveContainer は未署名 IPA をそのまま実行するためのアプリです。
JIT / entitlements の設定が必要な場合があります。

ディープリンク:

```
livecontainer://source?url=https%3A%2F%2Fnsmr0604.github.io%2FPawKemoViewer%2Frepo%2Fapps.json
```

## バージョン更新

リリースごとに `altstore/apps.json` を更新します。

1. `versions` の先頭に新しいエントリを追加
   - `version`: IPA の `CFBundleShortVersionString`
   - `buildVersion`: IPA の `CFBundleVersion`
   - `downloadURL`: 新しい IPA の URL
   - `size`: IPA のバイト数
   - `minOSVersion`: 例 `15.0`
2. 互換性のため、アプリ直下の `version` / `downloadURL` / `size` も最新に更新
3. `news` にリリース告知を追加(任意)
4. `gh-pages` の `repo/apps.json` を更新

## 注意

- IPA は**未署名**の `PawKemoViewer.ipa` を使用します。AltStore が署名します。
- アプリは **iOS 15.0 以上**が対象です。
- 本アプリは 18 歳以上向けで、成人向け内容を含みます。AltStore / LiveContainer は
  App Store ではないため、各自の判断と責任で利用してください。
- 公式・提携を示す表現は使わず、「非公式」であることを維持してください。
