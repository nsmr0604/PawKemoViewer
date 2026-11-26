# ストア掲載情報(ドラフト)

F-Droid / IzzyOnDroid / 自前配布向けの掲載文とスクリーンショットの方針です。Play ストアは対象外です。

## タイトル

```
PawKemoViewer
```

第三者のサービス名・ロゴをタイトルやアイコンに入れないでください。

## 短文(80 文字以内の目安)

**日本語**

```
pawchive.pw の公式 API を利用する非公式ビューア
```

**英語**

```
An unofficial viewer for the pawchive.pw API
```

## 説明文

- 日本語: [description.ja.md](description.ja.md)
- 英語: [description.en.md](description.en.md)

## スクリーンショット

- **SFW の画像のみ**を使用する。成人向け表現を含めない。
- クリエイター名・アイコン・投稿画像は、**許諾済みまたは自作**のものに置き換える。
- 第三者のロゴ(サービス名・企業ロゴ)を写さない。
- 実在のアカウント名・URL・セッションキーを写さない。
- 18 歳以上の確認画面を含める場合は、ボタンと注意書きが読める構図にする。

## 配布チャネル

- **自己ホスト F-Droid**: `fdroidserver` で生成したリポジトリを公開。手順は [自己ホスト F-Droid](../distribution/self-hosted-fdroid.md)。
- **Obtainium**: GitHub リポジトリ URL を追加して Releases を追跡。
- **IzzyOnDroid / F-Droid 本体**: 成人向け・権利・AI ポリシーにより受理が難しいため、現状は申請しない。
- アンチフィーチャー(自己ホスト metadata): `NonFreeNet` と `TetheredNet`。

## 署名指紋(公開用)

リリース鍵を確定したら、`apksigner verify --print-certs` の SHA-256 をここに記録し、ストア申請・README に掲載する。

```
(未設定)
```

## 連絡先

- 一般: https://github.com/nsmr0604/PawKemoViewer/issues
- 権利侵害・削除依頼・プライバシー: X の DM (@nsmr0604) / https://x.com/nsmr0604
