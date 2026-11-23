# Architecture baseline inventory

Baseline: `0.5.0` at `cf81e3d` (PR #12). This inventory describes the existing code.

## M0.1 — Entrypoints and dependencies

| Entrypoint | Startup and dependencies |
|---|---|
| Browser / Vite | [index.html](../../index.html) loads [src/main.tsx](../../src/main.tsx). `bootstrap()` initializes PlatformRuntime, initializes settings storage, awaits locale discovery and activation, then mounts React StrictMode and `App`. `npm run dev` starts Vite and `npm run build` runs TypeScript then Vite. |
| UI shell and routes | [App.tsx](../../src/App.tsx) uses [router.ts](../../src/router.ts) for hash parsing, route changes and navigation. It selects Home, Creators, Creator, Post, Favorites, Settings or Login and handles invalid post routes. The shared navigation rail, layout selection, follow sync and native back handling live in the shell. |
| Desktop / mobile host | [main.rs](../../src-tauri/src/main.rs) calls `pawkemoviewer_lib::run()`. [lib.rs](../../src-tauri/src/lib.rs) also exposes `run` as the mobile entrypoint and registers Tauri commands, logging and the `pkv` media protocol. [build.rs](../../src-tauri/build.rs) invokes `tauri_build::build()`. |
| Tauri frontend wiring | [tauri.conf.json](../../src-tauri/tauri.conf.json) runs Vite at port 5173 during development and packages `dist` after the frontend build. [default.json](../../src-tauri/capabilities/default.json) declares `core:default` for the main window. |

```text
index.html -> main.bootstrap -> PlatformRuntime -> desktop / mobile / web services
                           -> settings + locales -> App -> router + feature screens
Feature screens -> api / db / icons / follows / backup / i18n -> platform services or direct host APIs
api.request / Login / icons -> Tauri invoke -> Rust commands -> reqwest / app-local files
Rendered media -> origin/CDN or pkv protocol -> Rust handler for eligible external media
```

There is no application composition root or repository layer between screens and the feature modules. In particular, `api.ts` owns settings, request policy and endpoint helpers. `db.ts` and `icons.ts` own persistence details while delegating IndexedDB opening to the platform adapters.

## M0.2 — PlatformRuntime and service coverage

[Runtime](../../src/platform/runtime.ts) initializes a singleton before feature consumers run. A Tauri window is detected by `__TAURI_INTERNALS__`. The OS helper selects desktop or mobile for native windows, while the absence of the marker selects web. `getPlatformRuntime()` throws before initialization. `resetPlatformRuntimeForTests()` clears the singleton.

The [contracts](../../src/platform/contracts.ts) mark all services optional. The matrix describes the registered adapters, including placeholders and unsupported operations. See [desktop](../../src/platform/families/desktop.ts), [mobile](../../src/platform/families/mobile.ts) and [web](../../src/platform/families/web.ts).

| Service | Desktop | Mobile | Web | Consumers |
|---|---|---|---|---|
| `storage` / `sessionStorage` | WebView local/session storage | Same | Browser local/session storage | Settings, follows, search history, favorite tab, scroll, post context and follow metadata |
| `indexedDatabase` | IndexedDB open/upgrade | Same | Same | `db.openDb`, `icons.openDb`; schema and transactions stay with consumers |
| `storageLocations` | Native private and secondary path resolver | Native private, secondary returns null | Absent | No feature consumer found |
| `files` | Native app-private export | Same | Blob download | `backup.exportBackup`, Settings log export |
| `locale` | Native private CRUD and secondary list/write | Native private CRUD | Listing returns null, write rejects, delete returns false | `i18n.refreshLocales`, Settings locale actions |
| `clipboard` | WebView Clipboard API | Same | Browser Clipboard API | Settings backup copy/paste; Creators still uses a separate helper |
| `logging` | Diagnostic append through Tauri | Same | Absent | `log` gates persistent output on `DEBUG_DIAG` |
| `lifecycle` | Absent | Tauri back event and exit | No-op back listener, exit rejects | `App` native back effect |
| `permissions`, `database`, `network` | Absent | Absent | Absent | No consumers. `database` and `network` are typed as `unknown`. |

The runtime already exposes a typed IndexedDB opener. The `database` slot has no established responsibility beyond that boundary. Current transport calls provide evidence for a network boundary, while scheduling, cache and endpoint policy belong to `api.ts`. Before factoring shared adapters, capture missing-service behavior, placement of storage detection (native modules currently evaluate it at import time), and rejection/cleanup behavior for IndexedDB and lifecycle registration.

## M0.3 — Feature and data access

| Feature | Application and data dependencies | Direct access or policy still owned by the feature |
|---|---|---|
| Home | `HomePage` → `api.posts`, settings, `history`, `useScrollMemory`, shared grids | Paging, filtering, retry state and route query state |
| Creator discovery | `CreatorsPage` → `api.creators`, `db.searchCreators` / `saveCreators`, `history`; `CreatorHeader` → profile API and icon helpers | Index refresh and search strategy; `platform.readClipboardTextSafe` calls `navigator.clipboard` directly |
| Creator profile | `CreatorPage` → `api.creatorPosts`, `CreatorHeader`, `FollowButton`, settings and scroll memory | Paging, sorting and tag selection |
| Post detail | `PostPage` → post/revisions/comments, original link, favorite and flag API calls; `post-favorites`, `FollowButton`, icon and media helpers | ID matching, revisions 404 handling, view state, session post context, DOM rendering and attachments; preserve both the validated route and media-host policy |
| Favorites and follows | `FavoritesPage` → `api.creatorPosts` / `accountFavorites`, `db.getSeen` / `setSeen` / `updateSeenCheck`, `follows`; `post-favorites` loads account post favorites | Five-minute per-creator cooldown, tab persistence and local/remote synchronization decisions. `FollowButton` also persists follow metadata through runtime storage |
| Login | `LoginPage` → direct `invoke("login_request")`, Tauri `getVersion`, settings and follow sync | Login orchestration, error presentation and post-login navigation |
| Settings and diagnostics | `SettingsPage` → settings/account API, cache info and clearing via `db`/`icons`, `i18n`, `backup`, runtime locale/files/clipboard, Tauri `getVersion` | Locale import and size checks, desktop gating, backup interaction, log export. `native-debug-log.ts` invokes native log helpers directly |
| Backup and locales | `backup` uses settings, follows, `db.replaceSeen` and runtime file export. `i18n` uses bundled Japanese, lazy English and runtime locale enumeration | Backup validates and restores read state before updating follows; locale discovery and dictionary merge remain outside adapters |
| Creator avatars and media | `components/CreatorAvatar.tsx` → `icons.getCreatorIcon`, URL helpers in `api`; post content/media use shared URL policy | `icons` owns in-memory cache, IndexedDB and direct invokes `fetch_creator_icon`, `creator_icon_cache_info`, `clear_creator_icon_cache`. Media uses browser URLs and the registered `pkv` path for eligible external assets |

Persistence and request boundaries:

- `db.ts` opens IndexedDB `pawkemoviewer` (v1) and owns `creators`, `seen`, `meta`, creator pack/index handling and atomic read-state replacement. `icons.ts` owns a separate `pawkemo-icons` database and delegates file caching to Rust.
- `api.request` invokes `api_request` directly. Preserve the three-request concurrency limit, 250 ms spacing, GET cache TTL of 60 s and 150-entry cap when moving the transport. `apiStatus` extracts the native status from the wrapped error. Rust owns direct reqwest HTTPS.
- Several consumers use `services.storage ?? localStorage` or the corresponding session fallback, then call adapter-shaped `get`/`set`/`remove` methods. Native Web Storage exposes `getItem`/`setItem`/`removeItem`. This is a source-level mismatch if the fallback runs. Cover absent or inaccessible storage in M1.2/M1.4.
- Router history, viewport/layout and DOM interactions remain presentation concerns. Creator search and backed-up read state cross persistence and workflow boundaries. Use these ownership distinctions when defining use cases and repositories.

## M0.4 — Validation baseline

Ran on Debian 13 x86-64 in Codex Cloud against `cf81e3d`, using Node.js 24, Rust 1.100.0 and the workspace WebKitGTK 4.1 libraries.

| Check | Result |
|---|---|
| `npm ci --cache /workspace/scratch/pawkemoviewer-npm` | Passed. Installed from the committed npm lockfile. |
| `npm run build` and `npm run build:debug` | Passed. Both runs reported the existing Vite warning that `db.ts` is imported both statically and dynamically. |
| `cargo check --offline --manifest-path src-tauri/Cargo.toml -j 4` | Passed with five unused-variable warnings in the non-diagnostic login implementation. The first `--locked` attempt rejected the local Cargo.lock from the previous app version. The offline check refreshed the ignored lockfile using cached dependencies. |
| `cargo check --locked --manifest-path src-tauri/Cargo.toml --features debug-diag -j 4` | Passed with the refreshed lockfile. |
| `npm run dev -- --host 127.0.0.1 --port 5176 --strictPort` plus headless Chromium via CDP | Passed. The home/search UI rendered, the settings hash route showed its heading, and browser Back returned to Home. No native command, authenticated API or external media behavior was asserted. |

### Platform coverage and gaps

| Target | Coverage in M0 | Remaining checks |
|---|---|---|
| Browser | Startup, settings route and browser Back | Storage-denied/Web Clipboard cases, IndexedDB failures, download behavior |
| Linux Tauri | Rust host check with and without diagnostic code | Native GUI, IPC, filesystem/locale behavior, backup and login |
| Windows / macOS Tauri | Source review only | Native builds, WebView runtime, locale replacement and clipboard |
| Android | Source review only | Native build, back button/exit, shared-file selection feasibility |
| iOS | Source review only | Build and device validation, lifecycle behavior, Files picker feasibility |

There is no npm test script or tracked platform contract suite in this baseline. The local notes search script is outside the tracked suite. Desktop/Android workflows target `main` for push builds and also support manual dispatch. Android has no PR trigger, and this baseline has no iOS workflow. No GitHub Actions runs, packages, native UI tests, devices or live API operations were exercised for M0.

M1.1 can now use the recorded call sites to scope a typed transport boundary and resolve the redundant, unused `database` slot. Keep the existing IndexedDB schema and API request policy in place until their planned migration.
