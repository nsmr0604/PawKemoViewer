# ドキュメントと実装の一致監査 (2026-11-26)

対象: `docs/screens/`(10)、`docs/data/`(3)、`docs/reference/`(2)、`docs/API.md`、
`docs/DEVELOPMENT.md`、`docs/features/image-download.md`、`docs/architecture/*.md`(6)、
`docs/STATUS.md`、`docs/HISTORY.md`、`README.md`、`docs/README.md`、`docs/wiki/*.md`(8)。
比較対象: `src/`(80 ファイル)と `src-tauri/src/`、`src-tauri/plugins/`。
コード・ドキュメントは変更していない。行番号は記載しない。

照合した検証可能事実: 関数・シグネチャ約 70 件、Tauri コマンド 29 件(登録条件含む)、
IndexedDB / Web Storage のキー・ストア・上限、保存先パス、タイムアウト・サイズ上限、
エラー文字列、ルートと画面分岐、CSS ブレークポイント、テスト件数、パック形式。

---

## [重大] STATUS.md のリリース状態が他文書・実タグと矛盾する
- ドキュメント: `docs/STATUS.md` 「1. リリース状態」 —「最新の公開版 | **`pawkemoviewer-v0.5.7`**（Latest、2026-11-24、9 アセット）」「0.5.8 | タグ・リリースなし。版番号のコミットのみで、機能は 0.6.0 に継承」
- 実装: リポジトリ実体として `pawkemoviewer-v0.5.8` タグが存在する（`git tag --list`）。`docs/HISTORY.md` は 0.5.8 を「**最新の公開版**（2026-11-25）」、`README.md`・`docs/README.md`・`docs/wiki/Home.md`・`docs/wiki/Install.md`・`docs/wiki/Releases.md` も 0.5.8 を最新の公開版とする
- 不一致の内容: STATUS は「最新 = 0.5.7 / 0.5.8 はタグ・リリースなし」、他文書と実タグは「最新 = 0.5.8」。STATUS 自身が「現在の事実だけをまとめます」と宣言しているため影響が大きい
- 修正案: 最新の公開版を 0.5.8 に更新し、0.5.8 行の「タグ・リリースなし」を撤回する（HISTORY の手動リリース注記に合わせる）

## [重大] モバイルの一括画像保存先が README / wiki で Android 10 以降と異なる
- ドキュメント: `README.md` 「保存先」—「一括画像: デスクトップは `Downloads/PawKemoView/<クリエイター名>`、モバイルは `Documents/Downloads/<クリエイター名>`」、`docs/wiki/Files.md` 「標準フォルダー」の表の「一括画像」行（同じ文言）
- 実装: `src-tauri/src/downloads.rs` の `creator_target` — Android 10 以降（`downloads-store` の `is_supported` が真）は `app_cache_dir()/downloads/<creator>` へ書き、`store_shared` で MediaStore へ登録して共有 `Download/PawKemoViewer/<creator>` へ移す。`display` も `Download/PawKemoViewer/<creator>`。`Documents/Downloads` は Android 9 以下と iOS のみ
- 不一致の内容: ドキュメントはモバイル一律 `Documents/Downloads`、実装は Android 10 以降 `Download/PawKemoViewer`。`docs/features/image-download.md`・`docs/architecture/data.md`・`docs/wiki/Usage.md` は正しく更新済みで、この 2 文書だけ古い
- 修正案: モバイル欄を「Android 10 以降 = 共有 `Download/PawKemoViewer`、Android 9 以下 = `Documents/Downloads`、iOS = `Documents/Downloads`」に分割する

## [重大] cover.jpeg 除外は一覧に適用されない（4 文書が「一覧にも適用」と記載）
- ドキュメント: `docs/API.md` 「Settings」表の `excludeFanboxCover`（「一覧・詳細・一括保存の添付候補から `cover.jpeg` を除外」）、`README.md` 「主な機能」（「一覧・詳細・一括保存の対象から外せます」）、`docs/architecture/adaptive-ui.md` 「クリエイターと投稿」（「一覧にも適用します」）、`docs/wiki/Settings.md` 「投稿表示」（「一覧・投稿詳細・一括保存の添付候補から…除外」）
- 実装: `src/post-files.ts` の `listPostFiles` は `cover.jpeg` を除外せず、コメントでも「一覧カードのサムネイル・枚数は cover.jpeg を含めて常に表示する」と明記。`isFanboxCoverFile` の呼び出しは `src/pages/PostPage.tsx` の `attachmentImages` と `allFiles` のみ。`src/components/PostGrid.tsx` の `PostCard` / `PostRow` は `listPostFiles(post)[0]` をそのまま使う
- 不一致の内容: ドキュメントは一覧にも除外が効く、実装は投稿詳細と一括保存の添付候補だけ。一覧のサムネイル・枚数バッジには cover.jpeg が残る（コードのコメントが仕様を明示しており、ドキュメント側の誤り）
- 修正案: 4 文書の「一覧」を削除し、「投稿詳細のファイル一覧と一括保存の添付候補のみ」に統一する

## [中] 保存先解決失敗時の同時実行ロック残留は修正済み（2 文書が既知の不具合として残す）
- ドキュメント: `docs/features/image-download.md` 「既知の制約」—「保存先の解決に失敗すると、ネイティブの同時実行 lock が解除されず、次の保存をブロックし得る既存不具合があります」、`docs/wiki/Troubleshooting.md` 「一括画像保存が失敗する」—「保存先の解決に失敗した後も…lock が残り…アプリを再起動してください」
- 実装: `src-tauri/src/downloads.rs` の `download_post_images` — `creator_target` は `spawn_blocking` の内側で呼ばれ、`.await` の後に無条件で `DOWNLOAD_RUNNING.store(false, …)` を実行する（`f954e1e2` で移動）。`swap(true)` 後の早期 return 経路は無い
- 不一致の内容: ドキュメントは保存先エラーでロックが残る、実装はエラーでも解除される。同じリポジトリの `docs/reference/rust.md` は「`spawn_blocking` の内側へ移したため、`creator_target` の失敗でも解除されます」と修正後の挙動を書いており、文書間でも矛盾
- 修正案: 2 文書から当該の既知不具合を削除する（未確認として残すなら「IPC の Future が破棄された場合」に限定）

## [中] `docs/data/schema.md` の「3 DB ともストア存在確認」が誤り
- ドキュメント: `docs/data/schema.md` 「データベース一覧」の箇条書き —「バージョンは 3 DB とも `1`。`onupgradeneeded` ではストアの存在確認後に作成するため、再実行しても破壊しません」
- 実装: `src/post-thumbnail-cache.ts` の `openCache` は `database.createObjectStore(STORE).createIndex("savedAt", "savedAt")` を存在確認なしで呼ぶ。`src/db.ts` の `openDb` と `src/icons.ts` の `openDb` は `objectStoreNames.contains` で確認する
- 不一致の内容: 3 DB のうち `pawkemo-post-thumbnails` だけ確認が無い。将来 DB バージョンを上げると `createObjectStore` が `ConstraintError` を投げ、upgrade トランザクションが中断して open が reject する（`openCache` は `.catch(() => undefined)` で握りつぶすため、キャッシュが黙って無効化される）
- 修正案: 「存在確認するのは `pawkemoviewer` と `pawkemo-icons`。thumbnails は無条件作成なので、バージョンを上げる際は存在確認を追加する」に書き換える

## [中] アイコン「204 = null はセッション中キャッシュ」は誤り（IndexedDB に永続保存）
- ドキュメント: `docs/reference/frontend.md` 「src/icons.ts」の失敗時 —「204（アイコン無し）は null としてセッション中キャッシュ」
- 実装: `src/icons.ts` の `getCreatorIcon` は `invoke("fetch_creator_icon")` の戻り値（null を含む）を `idbPut(d, key, { d: dataUrl, t: Date.now() })` で `pawkemo-icons` に保存し、`idbGet` 側も `rec.d !== undefined` で null をヒット扱いにする。TTL は無く、削除は件数上限の `prune` と `clearIconCache` のみ
- 不一致の内容: ドキュメントは再起動で消える前提、実装は再起動後も null を返し続ける（後からアイコンが用意されても再取得しない）。`docs/data/schema.md` の「204 / 非画像 / 空ボディは `null` として保存します」と文書内でも食い違う
- 修正案: 「メモリと `pawkemo-icons` に null を保存し、再起動後も再取得しない（消去は設定 → キャッシュ）」に修正する（`src/icons.ts` のコメント「セッション内のみ」も同様に誤り）

## [中] `docs/reference/rust.md` の「実行ロックは早期 return で残る」が現行コードに無い
- ドキュメント: `docs/reference/rust.md` 「7. 並行性・資源」—「一括保存 | `spawn_blocking` + `AtomicBool` 2 個 | … 実行ロックは早期 return で残ることがある」／「3. モジュール別リファレンス」の失敗時の挙動（「`spawn_blocking` の外で早期 return すると解除されません」）
- 実装: `src-tauri/src/downloads.rs` の `download_post_images` — ロック取得後に失敗し得る処理（`creator_target`）はすべて `spawn_blocking` の内側にあり、`swap(true)` 後に `Err` で早期 return する経路が無い
- 不一致の内容: 現行コードには「早期 return でロックが残る」経路が存在しない（残留し得るのは IPC の Future が drop された場合で、これは未確認事項）
- 修正案: 「早期 return」の記述を削除し、未確認の「Future drop 時」だけを注記する

## [低] `docs/reference/frontend.md` 冒頭のファイル数・export 行数が 1 件ずつ古い
- ドキュメント: `docs/reference/frontend.md` 冒頭 —「`src/` 配下の TypeScript モジュール全 79 ファイル」「`^\s*export ` の grep では 285 行」
- 実装: `src/**/*.{ts,tsx}` は 80 ファイル、`^\s*export ` は 286 行（`949c9d83` で `src/domain/session-account.ts` を追加した際に件数だけ未更新。本文のモジュール表と節は追加済み）
- 不一致の内容: 79 / 285 は現状 80 / 286。「275 シンボル」も同じ追加分だけずれている可能性が高い
- 修正案: 80 / 286 に更新し、TypeScript Compiler API でのシンボル数も再計測して置き換える

## [低] `docs/STATUS.md` の domain テスト件数が古い
- ドキュメント: `docs/STATUS.md` 「4. 自動検証」—「`npm run test:domain` | 5 件成功」
- 実装: `tests/domain.test.mjs` の `test()` は 7 件（`949c9d83` で session-account の 2 件を追加）。application 17 / platform 18 / post-download 7 / Rust 16 は一致
- 不一致の内容: 5 件成功とあるが実際は 7 件
- 修正案: 7 件に更新する

## [低] `docs/screens/navigation.md` の「App の key は creator のみ」が不正確
- ドキュメント: `docs/screens/navigation.md` 「既知の制約」—「`route.query` の変更ではコンポーネントが再マウントされません（`App` の `key` は `creator` の `service` / `id` のみ）」
- 実装: `src/App.tsx` は `CreatorPage` に加え `FavoritesPage` にも `key={settings.sessionKey ? "signed-in" : "signed-out"}` を渡す
- 不一致の内容: key を持つ画面は creator だけではない（クエリ変更で再マウントされない結論自体は正しい）
- 修正案: 「key を持つのは `creator`（service/id）と `favorites`（ログイン状態の 2 値）だけ」に修正する

## [低] 外部ページの画像ピッカーは全 OS で「3 列」ではない
- ドキュメント: `docs/reference/rust.md` 「5. 外部ページ」の画像の受け渡し —「3 列グリッドのチェック式ピッカーを重ねる」
- 実装: モバイルは `ExternalPageActivity.kt` / `ExternalView.swift` の `grid-template-columns:repeat(3,1fr)`。デスクトップの `src-tauri/assets/external-page-overlay.js` は `repeat(auto-fill, minmax(140px, 1fr))`
- 不一致の内容: デスクトップは列数固定ではなく幅に応じた auto-fill
- 修正案: 「モバイルは 3 列、デスクトップのオーバーレイは幅に応じた auto-fill」に修正する

## [低] `docs/reference/rust.md` の iOS locale-picker エラー文字列が 2 件欠落
- ドキュメント: `docs/reference/rust.md` 「8. プラグイン」の「ネイティブ側のエラー文字列」locale-picker（iOS）—「The JSON picker requires iOS 14 or later」「A JSON picker is already open」「File exceeds the size limit」「Could not stage the export」
- 実装: `src-tauri/plugins/locale-picker/ios/Sources/LocalePicker.swift` は上記に加えて `Could not open the system file picker` と `No document was selected` を `invoke.reject` する（Android 側の一覧は一致）
- 不一致の内容: iOS の reject 文言が 2 件不足
- 修正案: 2 文言を表に追加する

## [低] `docs/architecture/data.md` の「取得失敗の null も保存」が実装・他文書と食い違う
- ドキュメント: `docs/architecture/data.md` 「アイコンと投稿サムネイル」—「取得失敗の `null` も IndexedDB に保存される」
- 実装: `src/icons.ts` の `getCreatorIcon` は通信例外時に `logError` して null を返し、保存しない。保存するのは Rust が `Ok(None)` を返した場合（204・非成功・非画像・空ボディ）だけ。`docs/data/schema.md` はこの区別を正しく記載
- 不一致の内容: 「取得失敗」と「アイコン無し（204 等）」を同一視している
- 修正案: 「アイコン無し（204 等）の null は保存し、通信失敗は保存しない（再試行可能）」に修正する

## [低] `export_file` の衝突時ファイル名がドキュメントの形式にならない
- ドキュメント: `docs/data/files.md` 「フォルダー構成」—「`<timestamp>[_n]_<name>`」／「書き込み方式」—「`create_new` を最大 100 回試し、`_1`〜`_99` を付けて衝突回避」
- 実装: `src-tauri/src/lib.rs` の `export_file` は `format!("{}_{}{}", chrono_free_name(), suffix, safe)`（`suffix` は `_1`…）。衝突時は `2026-11-26_12-00-00__1foo.json` のように区切りが二重になり、名前に区切りが入らない
- 不一致の内容: ドキュメントの `<timestamp>_1_<name>` 形式にならない
- 修正案: 実形式（`<timestamp>__<n><name>`）に直す。形式を意図どおりにするならコード側を `_<n>_<name>` に直す（現行フロントからは未使用の経路）

## [低] `docs/data/storage.md` の設定イベント購読者に HomePage が無い
- ドキュメント: `docs/data/storage.md` 「通知イベント」—「`pawkemo-settings-changed` | … | 発火元 `updateSettings` | 主な購読側 `App`、`SettingsPage`」
- 実装: `src/pages/HomePage.tsx` も `SETTINGS_CHANGED_EVENT` を購読し、`excludeAiPosts` の変化で `load(0, true)` を実行する（`docs/reference/frontend.md` のイベント表は HomePage を含む）
- 不一致の内容: 購読側が 1 画面欠落
- 修正案: 購読側に `pages/HomePage.tsx` を追加する
