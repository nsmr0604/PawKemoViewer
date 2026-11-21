# Stabilization and release evidence

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

The [candidate workflow](../../.github/workflows/mobile-locale-test.yml) built both packages in
[Actions run 44934090212](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212).
The app ID is `com.nsmr0604.pawkemoviewer.localetest`.

| Target | Evidence |
|---|---|
| [Android arm64 APK](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212/artifacts/14718659514) | Debug signature verified in CI. Downloaded manifest contains both launcher aliases. The ARM64 library exposes the selected-file and direct folder-export commands. |
| [Unsigned iOS/iPadOS IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44934090212/artifacts/14718772648) | Downloaded IPA contains iPhone and iPad device families, Files sharing and in-place settings, the iPad light icon, and the selected-file and direct folder-export commands. |
| Linux and browser | Rust checks with and without diagnostics, a Linux diagnostic link with embedded frontend, 33 tests, both frontend builds and the Chromium shell matrix passed. Xvfb did not yield a usable WebView for the Linux binary. |

The candidate permits an [integrated device pass](os-storage.md#integrated-device-pass).
Device behavior, real provider dialogs and desktop package startup still require validation.

## M7.3 — Provisional release readiness

**Current decision: continue validation before release.** The scoped dependency check, browser regressions, public HTTP, Rust compilation and Linux linking provide baseline evidence. The native app, mobile selected-file workflows and release packages need validation.

| Priority | Remaining evidence |
|---|---|
| Release gate | Run the [M5 provider/grant acceptance checks](os-storage.md) on Android and iOS. Integrate only validated adapters, then verify locale catalogue, cancellation and conflict behavior. |
| Release gate | Run native package builds and startup/smoke on Linux, Windows, macOS, Android and iOS. Include live app IPC and login with authorized test credentials, and verify desktop/mobile navigation using real inputs. |
| Release gate | Record results for the exact candidate commit. The mobile candidate workflow produced verification artifacts. Desktop packages and live device evidence remain open. |
| Follow-up debt | Address creator-pack/metadata atomicity and reopened IndexedDB connection handling separately. Review the documented API cache race and keep request limits intact. |
| Follow-up debt | Extend boundary coverage to legacy modules after migrating their callers. Track the existing frontend mixed-import and Rust non-diagnostic login warnings. |

This is an interim readiness record. Final completion of M7.3 depends on the native matrix in M7.2.
