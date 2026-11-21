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
