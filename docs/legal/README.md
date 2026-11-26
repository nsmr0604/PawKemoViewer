# 法務文書(テンプレート)

PawKemoViewer の配布に必要な最低限の法務文書です。**法的助言ではありません**。公開前に内容を確認し、必要に応じて弁護士のレビューを受けてください。

## ファイル

| ファイル | 内容 |
|---|---|
| `terms.ja.md` / `terms.en.md` | 利用規約 |
| `privacy.ja.md` / `privacy.en.md` | プライバシーポリシー |

## 公開前に埋めるプレースホルダー

- `{{JURISDICTION}}`: 第一審の専属的合意管轄裁判所(例: 東京地方裁判所)
- `{{CONTACT_EMAIL}}`: 権利侵害・削除依頼・プライバシー用の連絡先

`src/legal.ts` は次の URL を参照します(リポジトリの `main` ブランチ)。

```
https://github.com/nsmr0604/PawKemoViewer/blob/main/docs/legal/terms.ja.md
https://github.com/nsmr0604/PawKemoViewer/blob/main/docs/legal/privacy.ja.md
```

`main` へマージされるまではリンクが 404 になります。公開時には `main` に反映するか、`src/legal.ts` の `LEGAL_BASE` を実際の公開先へ変更してください。

## 非公式表記

- アプリ内: 初回の年齢確認と「設定 → 情報 → 法務情報」に表示
- README: 冒頭の注意書き
- ストア/IzzyOnDroid の説明文: 「非公式」を明記し、FANBOX / Patreon / pawchive のロゴは使わない

## 年齢確認

- 初回起動時に 18 歳以上の確認を表示(`src/components/AgeGate.tsx`)
- 確認状態は端末内の設定 `ageVerified` に保存
- バックアップからの復元では引き継がない
- 設定 → 情報 → 法務情報 から確認をやり直せる

## セルフチェック(無料)

- J-PlatPat で「PawKemoViewer」「pawchive」「FANBOX」「Patreon」を検索
- 各アプリストアで同名・類似名を検索
- ストア用スクリーンショットに第三者の画像・成人向け表現を使っていないか確認
- アプリ名・アイコン・説明文に第三者の商標・ロゴを使っていないか確認

## 注意

- 本アプリは非公式クライアントです。各サービスとの提携・承認を示す表現は使わないでください。
- 成人向けコンテンツを扱うため、18 歳以上の確認と、ストアごとのポリシー確認が必要です。
- 権利者からの削除依頼に備え、連絡先と対応フローを用意してください。
