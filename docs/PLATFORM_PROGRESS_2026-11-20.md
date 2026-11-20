# Platform Foundation — Interim Handoff (2026-11-20, Stage 1 bootstrap)

## Objective
Incrementally separate common UI/domain, shared foundation contracts, Mobile/Desktop family runtime, and OS-specific adapters. Preserve existing app behavior and data.

## Current progress
- Stage 0 source inventory remains partial, not exhaustive.
- Stage 1 has begun: introduced contract types and centralized runtime bootstrap selection. No consuming services have been migrated yet.

## Stage 1 scaffolding added
- `src/platform/contracts.ts`: `PlatformFamily`, `PlatformDescriptor`, `PlatformServices`, `PlatformRuntime` contract shapes.
- `src/platform/runtime.ts`: centralized native Tauri presence detection and family selection (native mobile/desktop; web fallback), one-time initialization and accessor.
- `src/platform/index.ts`: module exports.
- `src/main.tsx`: initialize runtime before locale loading and React mount.
- Service slots are optional and currently empty; this is an integration boundary, not a claim that storage, DB, networking, logs, permissions or files have been migrated.

## Audited sources
`platform.ts`, `App.tsx`, `api.ts`, `db.ts`, `log.ts`, `debug.ts`, `backup.ts`, `i18n.ts`, `icons.ts`, `follows.ts`, `history.ts`, `router.ts`, `hooks.ts`, `favstate.ts`, `debug-log.ts`, `DeveloperDiagnostics.tsx`, UI/page components and Rust `src-tauri/src/lib.rs`.
Additional page scan found storage/event/clipboard/native command usage in `FollowButton.tsx`, `Favorites.tsx`, `Creators.tsx`, `Login.tsx`, `PostPage.tsx`, and `Settings.tsx`.

## Native commands confirmed
`api_request`, `login_request`, `fetch_creator_icon`, `export_log`, `export_file`, `debug_append_log`, `debug_open_log_folder`, `creator_icon_cache_info`, `clear_creator_icon_cache`, `list_locale_files`, `write_locale_file`, `delete_locale_file`.

## Architecture boundary
Browser UI events/DOM manipulation should remain UI-side unless there is a platform behavior need. Native capabilities (paths, storage, exports, clipboard, lifecycle, permissions) should be accessed through family/OS contracts. Detection is centralized and not scattered.

## Verification caveat
No build, typecheck, unit test, CI or native device test was run or verified for these scaffold changes.

## PR
PR #11: https://github.com/nsmr0604/pawchive/pull/11
Branch `refactor/platform-foundation-phase1`, draft/open.

## Next
1. Check compilation and bootstrap/runtime assumptions in CI.
2. Add typed signatures for persistence and file/export services.
3. Implement Desktop/Mobile family wiring and OS adapters, then migrate consumer-by-consumer.
4. Continue broader storage, permission, clipboard, OS-specific API inventory.
5. Generate dated handoff report after each progress report and append project status.
