# Project Status & Roadmap

> 最終更新: 2026-11-20  
> この文書は、ローカル環境の `notes/` や過去の会話を参照できない開発者・エージェントが、Pawchive の現状と次の作業を把握するための共有引き継ぎです。  
> 状態が変わったら、このファイルを実装・CI の実態に合わせて更新してください。

## 1. 現在の状態

- リポジトリ: [nsmr0604/pawchive](https://github.com/nsmr0604/pawchive)
- アプリ: PawKemoViewer (pawchive.pw の非公式クライアント)
- 技術構成: React 18 + TypeScript + Vite + Tauri 2 + Rust + reqwest
- 対象: Windows / Linux / macOS / Android
- main の既知バージョン: `0.3.2`
- 現在の作業 PR: [#7 UX/UI刷新と通信・描画処理の効率化](https://github.com/nsmr0604/pawchive/pull/7)
  - ブランチ: `improve/ux-ui-codebase`
  - 直近の追加機能: 設定画面の情報設計を整理し、キャッシュ項目を統合。ホーム投稿一覧のサービスフィルターと公式 `hide=(ai)` AI除外、クリエイター一覧の更新日 / 人気 / 名前ソートとサービスフィルター。ホームの任意タグフィルターは実装しない。Android CIで検出されたCreators.tsxの日時パース型エラーを修正
  - 直近の実装修正: 設定画面再編成 `fa0542f98b63e4f6414cc00b0f94d70039faedab`、日本語/英語・引き継ぎ更新 `89d835fd99bd0f96564e4c50467ea5b5bc2ec69b`。Creators.tsx の日時パース修正 `3f06879` も含む
  - AI除外は初期値 OFF。設定を localStorage / バックアップに保存し、ホームの一覧・検索 API に適用
  - 旧 head `cf48a4e` の Android Actions run `44640938963` は failure。`src/pages/Creators.tsx:28` の `Date.parse(string | number)` 型エラーで Frontend build が停止したため、修正コミット `3f06879` で `Date.parse(String(value))` に変更。ドキュメント更新を含む head `589c855` の Android Actions run `44641284559` は確認時点で in_progress。完了後に最新HEADのCIを再確認する
  - 状態: Open。最新HEAD `89d835f` で GitHub API は `mergeable=true` を返却。競合は現時点で検出されていない
  - バージョン番号は変更していない
  - **マージしないこと。ユーザーから明示的な依頼があるまで PR は open のままにする。**
- PR #7 の Android Actions: [run 44634915879](https://github.com/nsmr0604/pawchive/actions/runs/44634915879)
  - 対象 SHA はドキュメント追加前の `8036d31bf7aa8f88583e154378551a6c3cc493b0`
  - 2026-11-20 時点の前回確認では `in_progress`。ドキュメントのみの後続コミットに対する新しい run は確認できていない
  - 成功・失敗は確定していない。作業開始時に Actions の最新状態を確認すること
- PC 向け Tauri workflow は現状 main への push でのみ実行される。PR #7 では PC ビルド未検証。マージして CI を起動してはならない。ユーザーの明示指示を待つ
- 実機での UI/UX の視覚確認は未完了

## 2. PR #7 で実施した内容

### 設定画面の情報設計 (2026-11-20)
- [x] 設定画面冒頭にカテゴリ構成と反映タイミングの説明を追加。セッションキーは保存ボタンが必要なことを明示
- [x] ナビゲーションとセクション見出しを「通信」「バックアップ」「キャッシュ・保存領域」に統一
- [x] クリエイター索引とクリエイターアイコンのキャッシュ管理をキャッシュセクションに集約
- [x] 日本語 / 英語の両方を更新
- [ ] Android / PC 実機でナビゲーション・小画面表示・各操作の視認性を確認

### UI / UX
- 設定画面の情報設計を再整理: キャッシュ関連項目を「キャッシュ」へ集約し、アイコンキャッシュを独立カテゴリから移動。ナビゲーション名と各セクション見出しを「通信 / バックアップ / キャッシュ・保存領域」に具体化し、画面冒頭に設定の反映タイミングに関する案内を追加
- デスクトップナビゲーションをアイコン中心の細いレールから、ラベル付きサイドバーへ変更
- モバイル / デスクトップでナビゲーションアイコンと選択状態を統一
- ヘッダーに現在の画面名とログイン / アカウント設定への導線を追加
- 設定画面にカテゴリーナビゲーションを追加
- フォーカス表示、タップ領域、カード、フォーム、余白、ライト / ダークテーマを調整
- 投稿カードとクリエイター一覧をキーボード操作可能に
- 日本語 / 英語のナビゲーション文言を追加
- 設定内の移動はボタン + `scrollIntoView` を使用。アプリの hash router と衝突する `<a href="#...">` は使用しない

### ホーム投稿一覧のフィルター
- [x] FANBOX / Patreon / すべて のサービスフィルターをクライアント側に実装
- [x] 任意タグ選択 UI は実装しない (公式 API の任意タグ検索はグローバル投稿一覧の契約として確認できていないため)
- [x] 設定にグローバル「AI投稿を除外」を追加。公式 API の `GET /posts?hide=(ai)` を利用し、ホームの一覧・検索に適用
- [x] AI除外設定は localStorage に永続化し、バックアップ対象の Settings に含める
- [ ] 公式 API の hide パラメーターが検索時・オフセットページング時も一貫して適用されるか実機で確認

### クリエイター一覧
- [x] 既存のクリエイター検索ページを一覧として拡張。サービス (すべて / FANBOX / Patreon) で絞り込み
- [x] API の `updated` による更新日順、`favorited` による人気順、名前順でソート
- [x] IndexedDB のクリエイター索引 v3 に `updated` / `indexed` / `favorited` を保存。v2以前の索引は API から再構築
- [x] 10万件規模の一覧を一度に描画せず、60件ずつ段階表示
- [ ] 実機で更新日時の単位・人気指標の意味・並び順を確認

### フォロー一覧のソート
- 最新投稿日・最終確認日・名前・フォロー順で並べ替え可能。各項目で昇順 / 降順を切替
- 最新投稿日と最終確認日は新着チェックのキャッシュを利用し、余計な通信は発生させない

### フォロー新着表示・既読キャッシュ
- フォロー中クリエイターの NEW 表示は公開日時が直近 7 日以内の投稿に限定
- IndexedDB の `seen` ストアに最新投稿情報・チェック時刻・最後に既読にした投稿 ID を保存し、画面再表示やアカウント再同期後も未読状態を復元
- 新着チェック結果の保存は readwrite transaction 内で既読 ID を読み直し、通信中に押された「既読」を古い値で上書きしない
- アカウント同期後にも新着チェックを実行し、同期で追加されたフォローも対象にする
- フォロー同期は既読キャッシュを削除しない。解除後に再フォローした場合も既読 ID が残るため、同じ投稿の NEW は復活しない

### パフォーマンス / 安定性
- Rust の reqwest Client を API / ログイン / blocking proxy 用にアプリ全体で再利用し、接続プールを共有
- 無限スクロールの 700ms 定期ポーリングを廃止し、scroll / resize イベントを `requestAnimationFrame` で集約
- API scheduler の重複 pump timer を抑止
- Home / Creators の検索で古いレスポンスが後から表示される競合を防止
- ウィンドウ幅変更時、768px ブレークポイントを跨いだ場合だけレイアウト状態を更新

### ドキュメント
- `docs/DEVELOPMENT.md` と `docs/API.md` のアプリ / React バージョン表記を実装に合わせて修正

### 変更ファイル
`src/App.tsx`, `src/components.tsx`, `src/styles.css`, `src/api.ts`, `src-tauri/src/lib.rs`, `src/pages/Home.tsx`, `src/pages/Creators.tsx`, `src/pages/Settings.tsx`, `src/locales/ja.json`, `src/locales/en.json`, `docs/DEVELOPMENT.md`, `docs/API.md` および関連ファイル。正確な一覧は PR #7 の Files changed を参照。

## 3. 次に行う作業

以下は優先順位付きの候補・未完了項目です。実装済みと誤認しないこと。着手時にコードと GitHub の最新状態を確認し、完了した項目は状態と根拠を更新する。

### P0 — PR #7 の検証と完了判断
- [x] PR #7 の Android Actions run `44640938963` の失敗ログを確認。原因は `src/pages/Creators.tsx:28` の `Date.parse` に `string | number` を渡す TypeScript エラー
- [x] 上記を `Date.parse(String(value))` に修正 (commit `3f06879`)
- [ ] 最新HEAD `89d835fd99bd0f96564e4c50467ea5b5bc2ec69b` の Android Actions run `44641968656` (run #142) は queued。完了結果を確認する
- [ ] TypeScript / Frontend / Rust のチェック結果を確認
- [ ] PC ビルドは PR の現行 workflow では未検証であることを維持し、main への push が必要な場合もユーザーの許可なくマージしない
- [ ] Android 実機と PC でナビゲーション、設定カテゴリ移動、ログイン導線、ライト / ダークテーマ、キーボード操作、狭い画面幅を確認
- [ ] レイアウト崩れ、操作不能、コントラスト不足、タップ領域不足があれば PR #7 で修正
- [ ] 検証結果をこの文書に追記し、ユーザーが判断できる状態にしてからマージ可否を確認する

### P1 — フォロー同期の状態表示と失敗処理
- [x] NEW 表示を直近 7 日以内の投稿に限定し、既読状態を IndexedDB に永続化。アカウント再同期後も既読状態を復元し、同期中の既読操作との競合を防止
- [ ] Pawchive 側をフォロー情報の正 (canonical source)、ローカル保存をミラーとして扱う既存仕様を維持
- [ ] ログイン後の同期成功 / 失敗 / 未実行をユーザーが区別できる表示にする
- [ ] 同期失敗をログイン成功として誤認させない。再試行導線とエラー理由を検討
- [ ] 旧来のローカル単独 `toggleFollow` が残っていないか呼び出し元を監査し、全経路が canonical sync と整合することを確認
- [ ] 既存の一回限りのローカルデータ移行とアカウント同期の互換性を壊さない

### P2 — 投稿詳細の表示速度
- [ ] 投稿詳細を開いてから本文・メタデータ・画像一覧が表示されるまでを計測
- [ ] 先行表示できるデータと遅延ロード可能なデータを分離
- [ ] service / creatorId / postId の投稿コンテキストを維持し、詳細画像・改訂履歴等の取得で再利用
- [ ] 重複 API リクエストや不要な再レンダーを調査
- [ ] 既存の API scheduler / cache / cooldown を迂回しない

### P3 — 設定画面の情報設計
- [x] 設定カテゴリを利用目的に合わせて再整理。アイコンキャッシュをキャッシュカテゴリに統合し、ナビゲーション名を具体化
- [x] 設定画面冒頭にカテゴリと即時反映の案内を追加
- [ ] 個々の設定項目名と説明をさらに短く具体化し、専門用語には補足を付ける
- [ ] アカウント、表示、投稿、接続、データ、キャッシュ、診断、アプリ情報の分類が実際の利用目的に合うか確認
- [ ] 変更が即時反映か保存操作を要するかを明示
- [ ] 日本語 / 英語の文言、長いラベル、小画面での折り返しを確認

### P4 — データ / キャッシュの堅牢性
- [ ] キャッシュの保存・読み込み・破損時フォールバック・容量増大を監査
- [ ] バックアップ / 復元の不正データ検証と失敗時の安全性を確認
- [ ] 既読・お気に入り・フォロー・設定の既存データを失わない移行手順を維持
- [ ] データ削除・再構築の操作は対象と影響範囲を明示し、誤操作を防ぐ

## 4. 絶対に維持する設計・仕様

### ネットワーク / アーキテクチャ
- 正式構成は **React + Tauri 2 + Rust + reqwest の直接通信**。
- Cloudflare Pages / Workers / Functions / Wrangler / Reverse Proxy 等の中継インフラを導入・提案しない。Cloudflare 由来の中継は pawchive 側で Fake site と判定される実測がある
- reqwest は `default-features = false` + `rustls-tls` を維持し、OpenSSL に依存させない
- Tauri v2 の JS → Rust コマンド引数は camelCase。Rust 側 snake_case のまま JS から渡さない
- pawchive API は `pawchive.pw/api/v1` に直接アクセスし、Swagger スキーマに準拠
- `pkv://` は FANBOX / Patreon の対象メディアに限って使用。pawchive 本体と `*.pawchive.pw` は常に直接通信
- pkv の Referer / User-Agent / host allowlist の制御を維持し、Pawchive の画像を pkv 経由で再試行しない
- API scheduler / cache / request spacing / concurrency 制限を維持
- Favorites の cooldown を維持
- API の意図的な未実装である `fancards` / `links` / GET flag を追加しない

### フォロー / 投稿コンテキスト
- フォロー情報は Pawchive 側が正。ローカルはミラー
- 初回のローカルデータ移行後はアカウント側と同期する。ローカル単独を正とする設計に戻さない
- 投稿 URL は `/post/{service}/{creatorId}/{postId}` の形式を検証し、undefined を含む URL を生成しない
- 投稿画面を開いた際の `service` / `creatorId` / `postId` を後続の詳細・画像・改訂履歴取得に引き継ぐ

### セキュリティ / リリース
- セッションキー、パスワード、API キー、正式署名鍵などの秘密情報をソース・ドキュメント・コミット・ログへ記録しない
- ビルドは GitHub Actions を正とし、成功を確認する前に「ビルド成功」と報告しない
- Android の debug keystore は公開標準値のもの。正式リリース鍵は GitHub Secrets で管理し、debug keystore を正式配布に使わない
- Windows 実行ファイルは現状未署名。将来 eMudhra コード署名を予定
- バージョンはユーザーのリリース方針に従い、依頼なしに変更しない

## 5. 変更履歴の要点

| PR / commit | 内容 | 状態 |
|---|---|---|
| PR #1 / `878c18a` | Pawchive を正とするクリエイターフォロー同期 | main に統合済み |
| PR #2 / `6513aec` | 投稿 URL 検証、service / creatorId / postId の記録と後続処理への引き継ぎ | main に統合済み |
| PR #3 / `2d0ad73` | 改訂履歴セレクター | main に統合済み |
| PR #4 / `e4f0908` | PC 同一バージョンビルドのクリーンアップ | main に統合済み |
| PR #5 / `d0868b0` | TypeScript ビルド修正 | main に統合済み。Android / PC Actions 成功確認済み |
| PR #6 | サムネイル優先表示、FANBOX cover.jpeg 除外、pkv proxy 制御修正 | この文書作成時点の統合状態は要確認。PR / main を確認すること |
| PR #7 | UX/UI 刷新、通信・描画効率化、直近 7 日のフォロー新着表示と既読キャッシュ改善 | Open。検証中。未マージ |

※ PR #6 の状態や PR #7 の CI は時間とともに変わるため、作業開始時に GitHub で必ず再確認する。

## 6. 作業開始・完了時のチェックリスト

### 作業開始時
1. `AGENTS.md` を読む
2. この `docs/PROJECT_STATUS.md` と関連する `docs/DEVELOPMENT.md` / `docs/API.md` / `docs/BUILD.md` を読む
3. GitHub の main、対象 PR、Actions の最新状態を確認する。ここに書かれた SHA / 状態を最新と決めつけない
4. 変更対象のコードと呼び出し元を追い、既存仕様への影響を把握する
5. 既存の PR があれば新規ブランチや重複 PR を作る前に、そのブランチ上で継続できるか確認する

### 作業完了時
1. 実装内容・未実施項目・検証結果・CI URL をこの文書に反映
2. 新しい仕様・制約・既知の罠は適切な開発ドキュメントにも追記
3. 変更を小さな単位でコミットし、秘密情報が含まれないことを確認
4. PR を作成 / 更新し、CI の最終結果を確認
5. マージ・リリース・バージョン変更はユーザーの明示指示を得る

## 7. ドキュメントの役割

- `AGENTS.md`: エージェント共通の作業規約と絶対制約
- `docs/PROJECT_STATUS.md`: 現在の進捗、未完了作業、改善ロードマップ、重要な引き継ぎ
- `docs/DEVELOPMENT.md`: アーキテクチャとコード構成
- `docs/API.md`: API / Tauri コマンド仕様
- `docs/BUILD.md`: ビルド・CI・リリース手順

このファイルはローカル専用 `notes/` の代替となる共有可能な要約であり、秘密情報やローカル端末固有の情報は記載しない。
