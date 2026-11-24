# Stabilization and release evidence

> この文書は **0.5.0 系のマイルストーンで実施した検証記録** です。現在の状態は
> [開発状況](../STATUS.md) を参照してください。バージョン番号や実行 ID は記録時点のものです。

## M7.1 — Import boundaries

`npm run check:boundaries` uses the project's TypeScript configuration and module resolver. Normal and diagnostic frontend builds run it before type checking. The check covers static imports, re-exports, explicit import-type references and literal dynamic imports recognized by TypeScript.

- The domain imports only domain modules. Its separate isolation test type-checks against the ES2022 library without DOM or ambient runtime packages.
- Application use cases can import peer use cases, domain rules and the shared `types.ts` model. The composition root is the explicit wiring point for infrastructure, platform services and legacy modules; use cases do not import it.
- Infrastructure may import application repository contracts, and presentation may use the composition root. Presentation cannot import infrastructure directly. Platform adapters cannot import application or infrastructure.
- Existing cross-layer calls through legacy root modules are outside this scoped rule. This is an import check, with computed module paths and runtime effects outside its coverage.

The checker passed on the project. A temporary page containing a literal dynamic import of the creator infrastructure repository failed with the offending source and resolved target as expected. Both builds run the same check.

## M7.2 — Platform validation snapshot

| Target | Observed in Codex Cloud | Pending outside this environment |
|---|---|---|
| Frontend build and regression | Architecture check, 3 domain tests, 10 application tests, 14 platform tests, production and diagnostic builds passed. The existing Vite mixed-import warning for `db.ts` remained. | Package-level verification on each native target. |
| Chromium with fixture IPC | The [layout matrix](adaptive-ui.md) passed. An additional smoke run covered locale discovery, Home, invalid and valid post routes, revisions with HTTP 404, creator profile/posts, and index reload from browser IndexedDB without refetch. | Real WebView IPC, authentication, provider dialogs, OS insets and physical gestures. |
| Linux Tauri | Host Rust check passed with and without diagnostics. A linked Linux diagnostic build passed. With Xvfb, the binary stopped during startup because the system WebKitGTK child `/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitNetworkProcess` was unavailable. | Repeat the native smoke on a Linux machine with system WebKitGTK 4.1 and verify the packaging target. |
| Windows / macOS | No native execution in this Linux environment. | Build, launch and confirm login, backup, clipboard, keyboard and locale behavior. |
| Android | Standalone SAF probe compiled against SDK 35 and passed five JVM grant-mask checks. Chromium covered simulated navigation Back/exit. | Build and run the app. Validate the Android picker against a real provider, permission persistence/revocation, and physical Back. |
| iOS | Source-only document picker prototype, no Xcode/UIKit. | Compile on macOS, then test Files providers, cancel/export, safe-area placement and physical navigation. |
| Pawchive public HTTP | Schema request returned HTTP 200. One unauthenticated GET to `/api/v1/posts?o=0` returned HTTP 200 and a JSON list of 50 records with `id`, `service` and `user`. | Native IPC/reqwest end-to-end, login and authenticated flows. No account credentials were used in the HTTP probe. |

Commands run from the repository root included `npm run test:domain`, `npm run test:application`, `npm run test:platform`, `npm run build`, `npm run build:debug`, and `python tests/ui_layout_smoke.py` against Vite on port 5181. Rust checks used `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml -j 4`, then the same command with `--features debug-diag`. Native linking used `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features debug-diag -j 4`. Android probe commands are in the [storage handoff](os-storage.md).

M7.2 remains partial. M5 still requires native evidence, and a browser fixture is evidence for frontend wiring only.

### Mobile candidate 2af56d5

The former mobile locale workflow built both packages in
[Actions run 44934090212](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212).
The app ID is `com.nsmr0604.pawkemoviewer.localetest`. The [current build instructions](../BUILD.md) describe the `locale_test` option in Android and iOS.

| Target | Evidence |
|---|---|
| [Android arm64 APK](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212/artifacts/14718659514) | Debug signature verified in CI. Downloaded manifest contains both launcher aliases. The ARM64 library exposes the selected-file and direct folder-export commands. |
| [Unsigned iOS/iPadOS IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212/artifacts/14718772648) | Downloaded IPA contains iPhone and iPad device families, Files sharing and in-place settings, the iPad light icon, and the selected-file and direct folder-export commands. |
| Linux and browser | Rust checks with and without diagnostics, a Linux diagnostic link with embedded frontend, 33 tests, both frontend builds and the Chromium shell matrix passed. Xvfb did not yield a usable WebView for the Linux binary. |

The candidate permits an [integrated device pass](os-storage.md#モバイル統合版の実機確認).
Device behavior, real provider dialogs and desktop package startup still require validation.

### Desktop candidate 3ec9392

[Actions run 44936122546](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546)
used `npx tauri build --features debug-diag --bundles <platform-bundle>` on each native runner.
The downloaded packages passed these inspections:

| Target | Package inspection |
|---|---|
| [Windows x64 NSIS](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546/artifacts/14719098731) | Setup executable has the MZ and PE headers. |
| [macOS app ZIP](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546/artifacts/14719364345) | Archive passes ZIP integrity. The bundled Info.plist resolves to the app executable and icon, and reports version 0.5.0. |
| [Linux amd64 DEB](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122546/artifacts/14719728314) | `dpkg-deb` reports version 0.5.0. Extraction contains the ELF application executable, desktop entry and PNG icons. |

`node --test tests/{platform,application,domain}.test.mjs` passed all 33 tests.
The same source commit also built the [Android APK](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122488/artifacts/14719793355)
and [unsigned iPhone/iPad IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44936122488/artifacts/14719957324).
Inspection confirmed the separate test app ID and locale commands on both, plus Files sharing
and iPad icon declarations inside the IPA. Desktop installation, app startup, live API/IPC
and integrated provider checks remain pending.

### Installed Linux candidate

[Actions run 44937149049](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44937149049)
installed the `3ec9392` DEB using APT on Ubuntu 24.04. Under Xvfb and a fresh D-Bus
and XDG session, `/usr/bin/pawkemoviewer` exposed the Home search field via
WebKitGTK/AT-SPI. The same app logged HTTP 200 and a nonempty body from the native
public posts request. This covers installed startup, Home rendering and live
unauthenticated WebView-to-Rust API transport. Login and interactive desktop flows
remain pending.

## M7.3 — リリース判定と残課題

[0.5.1 は公開済み](https://github.com/nsmr0604/PawKemoViewer/releases/tag/pawkemoviewer-v0.5.1)。
全対象のデバッグ・リリースビルド、パッケージの内容、依存境界、自動テスト33件を確認した。
デスクトップの公開 API 検証は未認証の状態で行った。認証付き操作と統合版のモバイル実機確認は、
実行結果を得てから完了とする。

| 区分 | 残作業 |
|---|---|
| M5.4・M5.5 | Android・iPhone・iPad で、取り込み、書き出し、再起動、キャンセル、入力拒否を確認する。[実機確認手順](os-storage.md#モバイル統合版の実機確認) |
| M7.2 | 承認済みのテストアカウントでログインし、認証付きの API と操作を確認する。各端末のバージョン、ビルド、結果を記録する。 |
| 技術的な残課題 | クリエイター索引のデータとメタデータの原子性、IndexedDB の再接続、API キャッシュの競合、既存モジュールの依存チェック範囲、Vite と非診断 Rust ビルドの既知の警告を個別に扱う。 |

M7.3 の確定には M7.2 の残項目の結果を反映する。

### 0.5.6 実機の完了条件

| 範囲 | 完了とする実測 | 現時点の根拠 |
|---|---|---|
| iOS/iPadOS 診断 | 診断用 IPA を起動し、テストページと投稿リンクを試して Files に専用ログを書き出せる | iPadOS 16.5 + TrollStore で取得済み。テストページは HTTP 200。投稿リンクは OS 判定で停止した |
| iOS/iPadOS 修正確認 | 修正版で同じリンクを開き、ページの表示と元の記事への復帰を確認する | 診断ブランチの `25d3b721` で判定を修正。通常の Mac と iPad の回帰テストが通過。[修正版 IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/45369152333) |
| M5.4・M5.5 | Android・iPhone・iPad で、[Files/SAF の確認手順](os-storage.md#モバイル統合版の実機確認)を実行する | iPad の標準フォルダーへの診断ログ保存を確認。言語ファイルの一連の実機操作は別途記録する |
| M7.2 | 各対象でログイン状態のID表示、認証付きのお気に入り・フォロー参照、ログアウト確認のキャンセルと確定を確認する | 2026-11-24 に Windows からテストアカウントでログイン HTTP 302、投稿のお気に入りとフォロー一覧の参照 HTTP 200 を確認。アプリ UI の結果は端末ごとに記録する |
| M7.3 | 各対象のパッケージ生成、起動、M5・M7.2 の結果を照合し、公開判定を記録する | 0.5.6 の5対象のパッケージ生成済み。実機確認結果の反映待ち |

各ケースに端末・OS・アプリ版とコミット・結果を記録する。テストアカウントの入力値とセッション情報は記録から除く。結果は `成功`・`失敗`・`未実施` のいずれかで記載する。
