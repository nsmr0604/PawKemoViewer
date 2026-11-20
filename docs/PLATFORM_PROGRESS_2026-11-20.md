# Platform Foundation — Interim Handoff (2026-11-20)

## Goal
Refactor Pawchive cross-platform foundations incrementally, covering common UI/domain, a platform-family layer (Desktop vs Mobile), and OS adapters (Windows/macOS/Linux/Android/iOS). Preserve existing functionality.

## Current phase
Stage 0 audit, in progress. No runtime implementation changes yet.

## Audited sources
- `src/platform.ts`: UA-based OS detection, mobile/desktop predicates, layout resolver, clipboard reader, URL extraction.
- `src/App.tsx`: Tauri back-button/exit; window resize/keyboard/events; theme DOM mutation; scroll/search focus.
- `src/api.ts`: Tauri invoke `api_request`; localStorage settings; scheduler and GET cache.
- `src/db.ts`: IndexedDB.
- `src/log.ts`: logging and Window error/unhandled rejection hooks.
- `src/debug.ts`: debug append/open-folder commands.
- `src/backup.ts`: `export_file`.
- `src/i18n.ts`: locale listing; dynamic locale write/delete require further call-site checks.
- `src/icons.ts`: IndexedDB and native icon-cache commands.
- `src/follows.ts`: localStorage mirror/migration and account sync.
- `src/history.ts`: localStorage CRUD.
- `src/router.ts`: hash navigation/hashchange.
- `src/hooks.ts`: sessionStorage scroll memory, scroll events, requestAnimationFrame.
- `src/favstate.ts`: window custom events.
- `src/debug-log.ts`: diagnostic log chunking.
- `src/components/DeveloperDiagnostics.tsx`: window timeout.
- Rust `src-tauri/src/lib.rs`: commands, reqwest, PKV protocol, filesystem, path manager, icon cache, locale files, OS-specific folder opening.

## Native commands confirmed
`api_request`, `login_request`, `fetch_creator_icon`, `export_log`, `export_file`, `debug_append_log`, `debug_open_log_folder`, `creator_icon_cache_info`, `clear_creator_icon_cache`, `list_locale_files`, `write_locale_file`, `delete_locale_file`.

## Audit caveats
Selected source inspection/pattern search only, not exhaustive AST analysis. Dynamic invocation, all browser API use, permission APIs and every Rust target-specific branch remain to be checked. No build/device test was run.

## Design guidance
- UI browser APIs (DOM, resize, scroll, keyboard, hash routing) should not automatically become OS adapters; retain in UI/navigation modules unless family differences justify abstraction.
- OS integrations (storage, export, clipboard, native lifecycle/back navigation, permissions, app paths) should use contracts and platform-family implementation.
- Centralize capability/runtime detection. Avoid scattered UA branches.
- Preserve data formats/keys, scheduler/cache, Favorites cooldown, canonical follow sync, PKV policy/SSRF protection, log redaction and camelCase Tauri arguments.

## PR
- PR #11: https://github.com/nsmr0604/pawchive/pull/11
- Branch: `refactor/platform-foundation-phase1`
- Head: `9b196f004eae05873f86f19585c54c51d1fb37cf`
- Open/draft, docs only, not merged.

## Next steps
1. Audit direct/dynamic commands, local/session storage, clipboard, permissions, OS branches, file/process operations.
2. Establish dependency direction and concise contracts.
3. Implement centralized initialization and Desktop/Mobile family selection, without migrating all consumers at once.
4. Add focused tests; report only observed verification.
5. Update this handoff and `docs/PROJECT_STATUS.md` every progress report.
