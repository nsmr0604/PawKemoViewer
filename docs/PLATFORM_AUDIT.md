# Platform abstraction audit (Stage 0)

> Audit baseline: main at 15403e13 (Pawchive 0.4.0). This is a focused inventory based on inspected files; not an exhaustive static scan.

## Frontend dependency inventory

| Area | Current entry points | Direct dependency / responsibility | Migration destination |
|---|---|---|---|
| Platform / layout | src/platform.ts, src/App.tsx | UA detection, layout mode, clipboard helper, window size and app back/exit | Common capability contracts; Desktop/Mobile family; OS adapters |
| API/network | src/api.ts | Tauri invoke, settings stored in localStorage, scheduler and GET cache | Network service, Settings storage, cache/scheduler contracts |
| Persistent DB | src/db.ts | IndexedDB open/schema/transactions | Common DB contract + family adapters; preserve schema |
| Logs | src/log.ts, src/debug.ts, src/debug-log.ts | ring buffer, debug native commands/file logging | Common Log service + family-specific persistence/export |
| Backup | src/backup.ts | backup assembly and native export command | Common backup serialization + file/export service |
| Locale | src/i18n.ts | locale listing and native commands, JSON validation/overlay | Locale service + layered storage |
| Follow | src/follows.ts | localStorage mirror and account synchronization/API | storage contract + domain sync workflow |
| Search history | src/history.ts | localStorage CRUD | common storage contract |
| UI lifecycle | src/App.tsx | app back button/exit, responsive layout | lifecycle/navigation family layer |
| Icon cache | src/icons.ts, Rust commands | memory/IndexedDB/Rust disk cache | cache contract + OS adapters |

## Native command inventory

Commands registered from src-tauri/src/lib.rs:
- api_request — direct reqwest API request handling
- login_request — login flow
- fetch_creator_icon — icon retrieval/cache
- export_log — log dump file export
- export_file — generic text backup export
- debug_append_log — Full diagnostics only
- debug_open_log_folder — Full diagnostics only
- creator_icon_cache_info — disk icon cache metadata
- clear_creator_icon_cache — disk icon cache deletion
- list_locale_files — app-data locale files
- write_locale_file — locale write
- delete_locale_file — locale delete

Other Rust responsibilities visible in lib.rs:
- reqwest client initialization and HTTP headers/redirect behavior
- PKV custom URI protocol and external media proxy policy/host restrictions
- OS paths via Tauri path manager, app data, logs, backup, icon and locale directories
- log export and diagnostic folder opener selected via target_os branches
- icon disk cache filesystem operations
- locale file validation, filesystem CRUD

## Initial direct-use patterns requiring further search

- Frontend imports `@tauri-apps/api/core` and invokes commands from domain modules (api, debug, backup, i18n and potentially icons).
- `localStorage` use in settings, follows, history and other UI state should be catalogued and routed through contracts.
- IndexedDB is accessed in db.ts and icon cache implementation.
- App.tsx imports app-level back-button and exit commands.
- Window/document/navigator use should be classified as UI vs capability operations before migrating.

## Migration guardrails

1. No destructive migrations or data directory/key changes in initial adapter work.
2. Keep reqwest direct networking; no intermediary infrastructure.
3. Preserve API scheduling, caching, cooldowns, canonical follow sync, PKV allowlist and SSRF protections, and log redaction.
4. JS-to-Rust Tauri argument naming remains camelCase.
5. Every migration phase should add tests/verification and update this inventory.
6. Do not claim native-device testing unless performed.

## Next audit tasks

- Inventory all Tauri invoke sites and registered command argument/result contracts.
- Inspect icons.ts, favstate.ts, router.ts, hooks.ts and settings state for browser/native dependencies.
- Categorize OS branches in Rust and enumerate filesystem / process / clipboard / lifecycle capabilities.
- Build a dependency map before adding interfaces, so adapter selection is centralized and no service duplicates capability detection.


## Follow-up audit (20 Nov 2026)

### Confirmed frontend command call-sites

| Source | Command(s) |
|---|---|
| src/api.ts | api_request |
| src/debug.ts | debug_append_log, debug_open_log_folder |
| src/backup.ts | export_file |
| src/i18n.ts | list_locale_files; locale write/delete operations should be checked for dynamic invocation forms |
| src/icons.ts | fetch_creator_icon, clear_creator_icon_cache, creator_icon_cache_info |
| src/App.tsx | Tauri app plugin imports onBackButtonPress, exit (not registered custom commands) |

### Browser/platform APIs confirmed in selected modules

- App.tsx: window width/resize, event listeners, theme document attribute, scroll reset, querySelector for search focus, keyboard handling, app back-button/exit plugin.
- api.ts: localStorage for API-related settings and CustomEvent dispatch; request scheduler/cache logic remains within this module at this audit stage.
- db.ts: IndexedDB open and persistent database operations.
- log.ts: window error and unhandled rejection listeners.
- follows.ts: localStorage data and migration flag, window event dispatch.
- history.ts: localStorage read/write/remove.
- icons.ts: IndexedDB and native icon-cache commands.
- router.ts: hashchange listener; hooks.ts: scroll event and scroll restore; favstate.ts: window custom event.
- DeveloperDiagnostics.tsx: window timeout for UI feedback.

### Important architecture distinction

Browser APIs that are inherently UI interaction (DOM, resize, keyboard, scroll and hash navigation) are not automatically OS adapters. They should remain in UI/navigation hooks or receive a common UI-facing abstraction if platform-family behavior differs. Persistence, file access, native commands, networking, permission and lifecycle integrations belong behind common service contracts and family/OS adapters.

### Audit caveat

This audit is based on selected module source inspection and text pattern checks, not a full AST scan. Dynamic invocations, indirect imports, other browser API usage and all Rust platform branches still need to be examined before Stage 1 service migration.
