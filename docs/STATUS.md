# 開発状況と残課題

最終更新: 2026-11-26 / 対象バージョン: **0.5.8**

この文書は現在の状態だけをまとめたものです。リリースごとの変更は [変更履歴](HISTORY.md)、
アーキテクチャの詳細は [開発ガイド](DEVELOPMENT.md) と [設計資料](architecture/README.md) を参照してください。

## 1. 現在のリリース状態

- 最新リリース: **`pawkemoviewer-v0.5.7`**(Latest / prerelease=false)
  - Windows setup.exe / msi、Linux rpm / AppImage / deb、macOS dmg / app.tar.gz、
    Android universal APK、iOS 無署名 IPA の 9 アセット
  - 4 系統のリリースビルド (Android / Build Tauri / iOS / macOS) が success
- 開発ビルド: `debug-latest` プレリリース (push 時に自動更新)
- main のバージョン: `0.5.8` (`package.json` / `src-tauri/Cargo.toml`)
- ブランチ運用: 統合先は `main`。リリースは `workflow_dispatch` の `release=true` で作成する

## 2. 対象プラットフォーム

| 対象 | 状態 |
|---|---|
| Windows | ビルド・起動・公開 API を確認済み |
| Linux | DEB インストール・起動・公開 API を確認済み |
| macOS | Apple Silicon の DMG 起動・公開 API を確認済み |
| Android | 実機 (Redmi K20 Pro) で起動・設定・投稿閲覧・外部ページを確認済み |
| iOS / iPadOS | iPadOS 16.5 + TrollStore で修正版の iOS 判定、テストページ表示、診断ログ書き出し、投稿リンクの表示と復帰を確認。iPhone は確認待ち |

## 3. 実装済みの基盤

- **レイヤー分離**: `domain` / `application` / `infrastructure` / `platform` / `components` / `pages`。
  依存境界は `npm run check:boundaries` で検証する
- **プラットフォーム層**: 実行環境・ストレージ・ログ・ネットワーク・ファイル選択を型付き契約の背後に置き、
  デスクトップ / モバイル / Web のアダプターを切り替える
- **ファイル I/O**: 言語ファイルとバックアップの JSON を、デスクトップのダイアログ、
  Android の SAF、iOS の Files から共通 IPC で読み書きする (用途別のサイズ上限あり)
- **標準フォルダー**: Android は `Android/data/<アプリ ID>/files/Documents`、
  iOS/iPadOS は Files 公開の `PawKemoViewer/Documents` に `Languages` / `Backups` / `Logs` を置く
- **外部ページ**: 投稿本文の外部リンクを、元記事 URL を Referer にした実オリジンの
  ネイティブビュー (Android / iOS) で開く。デスクトップは pkv プロキシ
- **pkv プロキシ**: ホットリンク対策ホストと投稿コンテキストのある外部メディアを中継する。
  OS 別 URL 形式、Referer 許可リスト、SSRF 検査 (名前解決 IP を含む)、リダイレクト検査、
  タイムアウトとサイズ上限、固定ワーカーでの処理を実装済み
- **元記事リンクの解決**: 投稿本文内の fanbox / patreon の投稿 URL を解析し、
  対応する pawchive の投稿へアプリ内で遷移する。見つからない場合は元記事を開く導線を出す
- **キャッシュ**: クリエイター索引、アイコン、投稿サムネイルを端末に保存する

## 4. マイルストーン

| 範囲 | 状態 | 内容 |
|---|---|---|
| M0〜M4 | 完了 | 棚卸し、プラットフォーム契約、ユースケース、リポジトリ、ドメイン境界 |
| M5.1〜M5.3 | 完了 | OS 別ストレージの整理、Android SAF の権限ライフサイクル、iOS Files の試作 |
| M5.4〜M5.5 | 実装済み・実機確認待ち | 言語ファイルの取り込み / 書き出し / 追加フォルダーの統合版 |
| M6 | 完了 | デスクトップとモバイルの画面構成の分離 |
| M7.1 | 完了 | 依存境界の自動検証 |
| M7.2 | 一部完了 | 5 対象のパッケージ生成と Linux / Windows / macOS の起動・公開 API を確認。認証付き操作と M5 の実機操作が残る |
| M7.3 | 暫定 | リリース判定の資料。M7.2 の結果を反映して確定する |

## 5. 検証済みの根拠

- 診断検証ブランチで `npm run test:domain` / `test:application` / `test:platform` の合計 39 件が通過
- `npm run build` (境界チェック + 型検査 + Vite) と `cargo check` (通常 / `debug-diag`) が通過
- 0.5.5 のリリースビルド 4 系統が success。9 アセットを確認
- 0.5.7 のリリースビルド 4 系統が success。`pawkemoviewer-v0.5.7` に 9 アセットを確認
- Android 実機で、設定・投稿一覧・投稿詳細・外部ページ (sakura.ne.jp) の表示と戻る操作を確認
- iPadOS 16.5 + TrollStore で、iOS 判定・テストページ・診断ログ・投稿リンクの表示と復帰を確認
- 詳細な検証記録は [安定化の検証記録](architecture/stabilization.md) と各設計資料にある

## 6. 既知の制約・未解決事項

### 優先度: 高

- **M5.4 / M5.5 の実機確認**: 統合 APK / IPA で、言語ファイルの選択キャンセル、重複・不正入力、
  追加フォルダーへの直接保存、再読み込み、書き出したファイルの再読込を確認する
- **設定画面のラベル崩れ**: Android 実機 (Redmi K20 Pro) で、一部セクションの項目名が
  1 文字幅に潰れる事象を確認。再入場で正常に戻ることがある。原因調査中

### 優先度: 中

- **デスクトップの外部ページ**: wry が Referer 付きナビゲーションを公開していないため、
  pkv プロキシを使う。reCAPTCHA を含むページは表示できない
- **M7.2 の残り**: 認証付き通信 (ログイン・お気に入り・フォロー) の全対象での確認、
  iOS/iPadOS 実機の確認
- **pkv の追加強化**: プロキシした HTML のオリジン分離 (CSP / ホスト別サブドメイン) は未対応

### 優先度: 低

- `target="_blank"` を伴う外部リンクの開き方は OS / WebView の既定に依存する
- iOS の代替アイコン切替は OS の確認ダイアログが出る (仕様)
- Windows / macOS の実行ファイルは未署名 (将来 eMudhra / Apple 署名を検討)

## 7. 維持する設計・制約

- 正式構成は **React + Tauri 2 + Rust + reqwest の直接通信**。Cloudflare Pages / Workers /
  Functions / Wrangler / リバースプロキシは導入しない (pawchive 側で Fake site と判定される)
- reqwest は `default-features = false` + `rustls-tls` を維持する (OpenSSL 不使用)
- pawchive API (`pawchive.pw/api/v1`) は Swagger に準拠し、`fancards` / `links` / GET flag は実装しない
- フォロー情報は pawchive を正とし、ローカルはミラーとして扱う
- pkv と外部ページビューの Referer は fanbox.cc / patreon.com に限定する。
  pawchive 本体と `*.pawchive.pw` は常に直接通信する
- API スケジューラ (同時 3 / 最小間隔 250ms / キャッシュ)、Favorites のクールダウンを維持する
- セッションキー・パスワード・署名鍵などの秘密情報をコード・資料・ログ・コミットに含めない
- ビルドは GitHub Actions を正とし、成功を確認する前に「成功」と報告しない

## 8. 次の作業

1. M5.4 / M5.5 の実機確認 (Android / iOS) と結果の記録
2. 設定画面のラベル崩れの修正と回帰確認
3. M7.2 の認証付き操作 (ログイン・お気に入り・フォロー) の検証
4. デスクトップの外部ページ対応方針の決定 (現状維持 / ネイティブ実装)
5. パフォーマンス計測 (投稿詳細の初期表示) とキャッシュの監査
6. 一括画像ダウンロード機能 ([計画](plan/bulk-image-download.md)) — 本文・添付・外部リンクを選択して保存できる。
   Windows / Android で保存まで確認済み (iOS と、ヘッダー・アバター除外などの改善が残り)

## 9. 関連資料

- [変更履歴](HISTORY.md)
- [開発ガイド](DEVELOPMENT.md) / [ビルドガイド](BUILD.md) / [API 仕様](API.md)
- [設計資料の目次](architecture/README.md)
- 作業・引き継ぎのルール: [作業・引き継ぎ手順](architecture/AGENT_WORKFLOW.md)、`AGENTS.md`
