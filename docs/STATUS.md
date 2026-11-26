# 開発状況と残課題

最終更新: 2026-11-26 / 対象バージョン: **0.6.0（開発中）**

この文書は現在の事実だけをまとめます。公開済み版と開発版を混同しないでください。

## 1. リリース状態

| 項目 | 状態 |
|---|---|
| 最新の公開版 | **`pawkemoviewer-v0.5.8`**（Latest、2026-11-25、9 アセット） |
| 0.5.8 | `1e522668` のビルド。publish の権限エラーで自動作成に失敗したため、同じ実行の成果物から手動でリリースを作成した |
| 開発版 | **0.6.0**。`package.json` と `src-tauri/Cargo.toml` に設定 |
| 開発ビルド | `debug-latest` プレリリース。プラットフォームごとに最新の更新時刻が異なる |
| 開発ブランチ | `0.6.0`。番号ブランチへの push で Windows / Linux / Android の開発ビルドを実行 |
| 正式リリース | `main` へ統合後、4 つのビルドワークフローを `release=true` で実行 |

`debug-latest` の macOS DMG と iOS IPA は自動更新対象外です。ファイル名だけを見て全プラットフォームが同じ版と判断しないでください。

## 2. 0.6.0 の主な変更

- 投稿本文、添付、外部リンク先の画像を一括保存。
- 保存前の対象選択、右下の常時表示ボタン、進捗・中止・失敗理由の表示。
- 外部ページを全 OS で実オリジンのまま表示し、表示中の画像をチェック式で選んで保存。デスクトップは専用ウィンドウ + ツールバー。
- User-Agent を「端末 / アプリ / Chrome」から選択。
- 投稿の前後移動後でも、一覧へ戻る「ホーム」導線。
- 開発版の表示を `X.Y.Z+コミット数 (SHA)` に統一。

詳細は[一括画像保存](features/image-download.md)と[変更履歴](HISTORY.md)を参照してください。

## 3. プラットフォームの確認状況

| 対象 | 確認済み | 未確認・制約 |
|---|---|---|
| Windows | パッケージ、起動、公開 API、一括画像保存（本文・添付・外部ページ）、外部ページの Referer / チェック式保存 | 認証付き操作の全ケース |
| Linux | DEB インストール、起動、公開 API、外部ページのビルド | 一括画像保存と外部ページの実機確認 |
| macOS | Apple Silicon の DMG 起動、公開 API、外部ページのビルド | 一括画像保存、外部ページの実機確認、認証付き操作 |
| Android | Redmi K20 Pro / Android 11 で起動、設定、投稿、外部ページ、画像保存（共有 `Download/PawKemoViewer`）、前後移動とホームへ戻る操作 | 他機種差、設定レイアウトの再確認 |
| iOS / iPadOS | iPadOS 16.5 + TrollStore で外部ページ、診断ログ、投稿リンクの表示と復帰 | 一括画像保存、iPhone、署名配布 |
| Web / ブラウザー | モック IPC による画面とレイアウト確認 | 製品配布対象ではない。ネイティブ機能の代替にはならない |

## 4. 自動検証（2026-11-26）

| 確認 | 結果 |
|---|---|
| `npm run test:domain` | 9 件成功 |
| `npm run test:application` | 17 件成功 |
| `npm run test:platform` | 18 件成功 |
| `node --test tests/post-download.test.mjs` | 7 件成功（通常の npm test スクリプトには未含む） |
| `npm run check:boundaries` | 成功 |
| `npm run check:locales` | 成功 |
| `npm run build` | 成功 |
| `npm run build:debug` | 成功 |
| `cargo test --lib --manifest-path src-tauri/Cargo.toml` | 16 件成功 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 成功（warning 6 件） |
| `cargo check --manifest-path src-tauri/Cargo.toml --features debug-diag` | 成功（warning 1 件） |
| CI: Build Tauri（Windows + Linux、`cf04b3ff`） | 成功 |
| CI: macOS Build（`cf04b3ff`） | 成功 |

デスクトップの外部ページは Windows 実機で Referer 送信と画像保存を確認しました。macOS / Linux は CI のビルド確認までです。

通常構成の warning は `login_request` の未使用変数 5 件と `downloads.rs` の `unused_mut` 1 件です。診断構成では `unused_mut` 1 件が残ります。機能失敗ではないため、別途整理します。

## 5. 既知の制約・残課題

### 優先度: 高

- **iOS / iPadOS の一括画像保存**: 実機で未確認。外部ページのチェック式選択と `Documents/Downloads` への保存を確認する。
- **iPhone**: 実機確認がない。iPad の結果を iPhone の確認として扱わない。
- **認証付き操作のプラットフォーム Matrix**: ログイン、お気に入り、フォロー、ログアウトを全対象で確認する。
- **Android の設定レイアウト**: Redmi K20 Pro で項目名が 1 文字幅へ潰れる事象を確認。縦積みへ変更済みだが、最新ビルドでの再確認が必要。
- **ログイン後の同期失敗**: ログインと session 保存は成功していても、フォロー同期の失敗がログイン全体の「通信エラー」として表示される。
- **アカウント切替のお気に入り表示**: 投稿お気に入りのメモリキャッシュが session 変更時に消去されず、前のアカウントの状態が残り得る。
- **バックアップの設定復元**: `accountId` と `userAgentMode` が復元対象外。ほかの設定・フォロー・既読は復元される。

### 優先度: 中

- **デスクトップの外部ページ**: 全 OS で実オリジンのビューを使う。macOS / Linux は実機で未確認。Linux は Referer 付き取得後に `load_html` するため、初回応答の Set-Cookie が WebView の Cookie ジャーに入らない。
- **pkv の HTML 中継**: `text/html` は 415 で拒否する（pkv がローカルオリジン扱いになるため）。画像・バイト列のみ中継する。
- **pkv の宛先制約**: Rust 側は外部ホストを広く許可し、投稿文脈を検証しない。内部 IP と DNS 解決先は検査し、名前解決失敗は拒否するが、DNS rebinding の TOCTOU が残る。
- **ネイティブ外部ページの宛先制約**: `open_external_page` は http(s) と Referer を検証する。デスクトップ (Linux) の Rust 取得は `host_is_public` と各リダイレクトを検査するが、モバイルのネイティブビューは内部 IP の検査を通さない。
- **HTTP による外部ページの画像抽出**: JavaScript 描画のギャラリーは HTML だけでは取得できない。ネイティブ外部ページの「画像を保存」は表示中 DOM を使う。
- **pawchive のサムネイルのみ投稿**: 原画 URL が 404 の場合、一括保存は失敗理由を表示する。サムネイルを本体として保存しない。
- **ホームのサービス絞り込み**: 絞り込み後 0 件が続くと、無限スクロールが次ページを自動取得し続ける場合がある。
- **コメント取得エラー**: 取得失敗を「コメントなし」と同じ空配列として扱うため、区別できない。
- **クリエイター索引のアトミック性**: パックとメタデータの書き込みは別トランザクション。中断時に古いメタデータと新しいパックが併存し得る。
- **session とログの機密性**: session は localStorage に平文保存。Full の response body と製品版の API error body には秘密情報が残り得る。

### 優先度: 低

- Windows / macOS の実行ファイルは未署名。
- Android APK は標準 debug.keystore で署名。Play ストア配布ではない。
- iOS IPA は未署名。実機導入には再署名が必要。
- `target="_blank"` の外部リンクの開き方は OS / WebView に依存する。
- iOS の代替アイコン切替では OS の確認ダイアログが出る場合がある。

## 6. 維持する設計

- React + Tauri 2 + Rust + reqwest の直接通信。Cloudflare 系の中継は禁止。
- reqwest は `default-features = false` + `rustls-tls`。OpenSSL を使用しない。
- pawchive API は `pawchive.pw/api/v1`。`fancards` / `links` / GET flag は実装しない。
- フォローは pawchive を正とし、ローカルをミラーとして扱う。
- API スケジューラ（同時 3 / 最小間隔 250ms / GET キャッシュ）と Favorites のクールダウンを維持。
- pawchive の session Cookie は pawchive ホストにだけ送る。
- Full 診断はフロントの `VITE_DEBUG_DIAG` と Cargo の `debug-diag` でビルド時に分離。
- アプリの CSP は `script-src 'self'` などを明示し、`object-src`/`frame-src`/`base-uri` を禁止。
- 正式リリースの公開は main からのみ行い、タグのコミットと成果物が一致しない場合は失敗する。
- 秘密情報をコード、文書、ログ、コミットへ含めない。
- CI の成功、ソースレビュー、実機確認を区別して報告する。

## 7. 0.6.0 リリース前の作業

1. iOS / iPadOS と iPhone の一括画像保存を確認し、結果を記録する。
2. Android の設定レイアウトを最新ビルドで再確認する。
3. 認証付き操作のプラットフォーム Matrix を埋める。
4. Linux / macOS で一括画像保存を確認する。
5. 通常構成の Rust warning を整理する。
6. `main` へ統合し、4 系統の `release=true` とリリースアセットを確認する。

手順は[ビルドガイド](BUILD.md#正式リリース手順)と[検証ガイド](verification.md)を参照してください。
