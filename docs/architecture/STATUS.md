# アプリ基盤の進捗・引き継ぎ

## 0.5.1 リリースとリモートの状態

- 検証ブランチ `arch/m7-native-validation` の `bf00644` は `0.5.0` に統合済み。リリースタグ `pawkemoviewer-v0.5.1` は同ブランチのビルドコミット `d9cac68` を指す。
- 同じコミットで [PC デバッグ](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44937715356)、[Android デバッグ](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44937718053)、[iOS/iPadOS デバッグ](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44937721526) が成功。その後の [PC リリース](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44938664361)、[Android リリース](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44938667164)、[iOS/iPadOS リリース](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44938670365) も成功した。
- [0.5.1 リリース](https://github.com/nsmr0604/PawKemoViewer/releases/tag/pawkemoviewer-v0.5.1) に Windows、macOS、Linux、Android、iPhone・iPad 共通の無署名 IPA を含む計9ファイルを確認。リリースビルドの成功とマイルストーンの実機検証は個別に記録する。

## マイルストーン

| 範囲 | 状態 | 確認済みの内容と残作業 |
|---|---|---|
| M0〜M4 | 完了 | 棚卸し、プラットフォーム契約、ユースケース、リポジトリ、ドメイン境界。起点は PR #12 の `cf81e3d`。 |
| M5.1〜M5.3 | 完了 | ストレージの機能表、Android SAF の保持・再起動・解放・解放後のアクセス拒否、iOS の試作での開く・書き出す操作を確認。 |
| M5.4〜M5.5 | 実装済み・実機確認待ち | Android と iOS/iPadOS で言語ファイルの取り込み、書き出し、追加フォルダーを実装。実機で選択のキャンセル、重複・不正入力、直接保存、再読み込み、書き出したファイルの再読込を確認する。[実機確認手順](os-storage.md#integrated-device-pass) |
| M6 | 完了 | デスクトップとモバイルの画面構成を分離。Chromium で幅の切り替え、フォーカス、キーボード、タッチ、戻る操作を確認。 |
| M7.1 | 完了 | 通常・診断ビルドに依存境界チェックを追加。 |
| M7.2 | 一部完了 | 5対象のパッケージと Linux のインストール・ホーム表示・公開 API を確認。Windows/macOS の起動、認証付き通信、M5 の実機操作が残る。 |
| M7.3 | 暫定 | リリース判定の資料と残課題を記録済み。M7.2 の結果を反映して確定する。 |

## 検証の根拠

- `node --test tests/{platform,application,domain}.test.mjs` の33件、通常・診断フロントエンドビルド、Chromium の画面検証、Linux Rust チェックと診断リンクが通過。
- `3ec9392` の [デスクトップ候補](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546) と [モバイル候補](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122488) を生成・検査。iOS/iPadOS では Files 公開設定と代替アイコンを確認した。
- [Linux 起動検証](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44937149049) では同候補の DEB を Ubuntu 24.04 にインストールし、WebKitGTK にホームの検索欄が表示され、公開投稿 API が HTTP 200 と本文を返すことを確認した。認証はこの検証に含まれない。
- 変更対象は本書、[作業チェックリスト](TASKS.md)、[ロードマップ](ROADMAP.md)、[作業・引き継ぎ手順](AGENT_WORKFLOW.md)、[資料の目次](README.md)、`AGENTS.md`。詳細な検証ログは [安定化の検証記録](stabilization.md) を参照。
