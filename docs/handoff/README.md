# 引き継ぎ手順

引き継ぎ、作業状況、検証結果、エージェントへの申し送りは日本語で書きます。コマンド、ファイル名、識別子、エラーの原文はそのまま引用します。

## 状態の正本

- 現在の実装範囲・検証結果・残課題: [STATUS.md](../STATUS.md)
- 現在の設計: [architecture/](../architecture/README.md)
- リリースごとの変更: [HISTORY.md](../HISTORY.md)
- ローカル用の作業メモ: `notes/`（Git 管理外）

`docs/handoff/` には、次の人が作業を始めるための手順とテンプレートだけを残します。日付付きの状態は `STATUS.md` に集約します。

## 着手前

1. `AGENTS.md`、`notes/index.md`、`notes/sessions.md`、関連する concept を読みます。
2. `git status --short --branch` と `git log` でブランチ、未コミット変更、最新コミットを確認します。
3. [STATUS.md](../STATUS.md) と関連する設計・API 資料を読み、既存の作業と重複しないか確認します。
4. 変更範囲、依存関係、検証方法を決めてから着手します。

## 作業中

- 選択した作業と、それに必要な修正に範囲を絞ります。
- 仕様や原因が分かった時点で、関連文書とローカルノートへ記録します。
- 1 コミットにつき 1 作業内容とし、コミットメッセージは端的にします。
- 実行できなかった検証と、その理由を明記します。
- 複数エージェントで並行する場合は、変更ファイルと契約が重ならないようにします。

## 完了・中断時

次の形式で申し送ぎます。

```markdown
# 引き継ぎ（YYYY-MM-DD / X.Y.Z）

- ブランチ / HEAD:
- 対象バージョン:
- 変更ファイル:
- 実装内容:
- 検証コマンドと結果:
- 未確認・失敗した検証:
- 既知の制約:
- 次に着手できる作業:
- 関連 Issue / PR / Actions run:
```

## 必須の確認

- [ ] `git diff --check`
- [ ] `npm run check:boundaries`
- [ ] `npm run check:locales`
- [ ] `npm run test:domain`
- [ ] `npm run test:application`
- [ ] `npm run test:platform`
- [ ] `npm run build`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml --features debug-diag`
- [ ] 変更した `docs/wiki/` を同期し、GitHub Wiki の差分を確認
- [ ] 実機確認が必要な項目は、端末・OS・アプリ版・結果を記録
- [ ] パスワード、セッションキー、Cookie、署名鍵をコミット・文書・ログへ含めていない

## リリース判定

[ビルドガイド](../BUILD.md#正式リリース手順)と[開発状況](../STATUS.md)の残課題を照合します。CI の success だけを実機確認の代替にせず、確認できた範囲と未確認の範囲を分けて報告します。
