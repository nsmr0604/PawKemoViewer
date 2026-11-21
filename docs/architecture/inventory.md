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
| Post detail | `PostPage` → post/revisions/comments, original link, favorite and flag API calls; `favstate`, `FollowButton`, icon and media helpers | ID matching, revisions 404 handling, view state, session post context, DOM rendering and attachments; preserve both the validated route and media-host policy |
| Favorites and follows | `FavoritesPage` → `api.creatorPosts` / `accountFavorites`, `db.getSeen` / `setSeen` / `updateSeenCheck`, `follows`; `favstate` loads account post favorites | Five-minute per-creator cooldown, tab persistence and local/remote synchronization decisions. `FollowButton` also persists follow metadata through runtime storage |
| Login | `LoginPage` → direct `invoke("login_request")`, Tauri `getVersion`, settings and follow sync | Login orchestration, error presentation and post-login navigation |
| Settings and diagnostics | `SettingsPage` → settings/account API, cache info and clearing via `db`/`icons`, `i18n`, `backup`, runtime locale/files/clipboard, Tauri `getVersion` | Locale import and size checks, desktop gating, backup interaction, log export. `debug.ts` invokes native log helpers directly |
| Backup and locales | `backup` uses settings, follows, `db.replaceSeen` and runtime file export. `i18n` uses bundled Japanese, lazy English and runtime locale enumeration | Backup validates and restores read state before updating follows; locale discovery and dictionary merge remain outside adapters |
| Creator avatars and media | `components.tsx` → `icons.getCreatorIcon`, URL helpers in `api`; post content/media use shared URL policy | `icons` owns in-memory cache, IndexedDB and direct invokes `fetch_creator_icon`, `creator_icon_cache_info`, `clear_creator_icon_cache`. Media uses browser URLs and the registered `pkv` path for eligible external assets |

Persistence and request boundaries:

- `db.ts` opens IndexedDB `pawkemoviewer` (v1) and owns `creators`, `seen`, `meta`, creator pack/index handling and atomic read-state replacement. `icons.ts` owns a separate `pawkemo-icons` database and delegates file caching to Rust.
- `api.request` invokes `api_request` directly. Preserve the three-request concurrency limit, 250 ms spacing, GET cache TTL of 60 s and 150-entry cap when moving the transport. `apiStatus` extracts the native status from the wrapped error. Rust owns direct reqwest HTTPS.
- Several consumers use `services.storage ?? localStorage` or the corresponding session fallback, then call adapter-shaped `get`/`set`/`remove` methods. Native Web Storage exposes `getItem`/`setItem`/`removeItem`. This is a source-level mismatch if the fallback runs. Cover absent or inaccessible storage in M1.2/M1.4.
- Router history, viewport/layout and DOM interactions remain presentation concerns. Creator search and backed-up read state cross persistence and workflow boundaries. Use these ownership distinctions when defining use cases and repositories.
