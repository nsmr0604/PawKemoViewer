# Platform Foundation Handoff

Date: 2026-11-20
Repository: nsmr0604/pawchive
PR: #11 refactor/platform-foundation-phase1

## Current state
- Runtime contracts/adapters established across desktop/mobile/web.
- Feature persistence consumers migrated: settings, follow mirror, follow migration marker, search history, favorites-tab state, scroll restoration, current-post context.
- IndexedDatabaseService controls database opening/upgrade dispatch; creator/seen and icon-cache operations retain local transaction handling.
- IndexedDB schema/version and existing data keys were intentionally preserved.
- Log-dump and backup export route through FileExportService.
- Locale CRUD routed through LocaleService; locale JSON picker validates and imports into private storage.

## Storage audit
- Direct localStorage/sessionStorage references remain as fallback paths when runtime services are unavailable and in bootstrap/pre-runtime code. Treat these as compatibility fallback, not a platform-native storage implementation.
- IndexedDB transaction semantics remain in feature modules; service migration is partial and should not be overextended without typecheck/tests.
- Mobile shared-storage support (Android SAF/iOS Files) is still not implemented/confirmed. Generic file picker import is not equivalent.
- Locale files currently load from private primary only; secondary-location overlay remains outstanding.

## Roadmap
1. M1 platform boundary consumer coverage — largely migrated; validation still outstanding.
2. M2 native user-accessible storage — SAF and Files/document picker, persistent grants, cancellation/error handling.
3. M3 locale layered loading — private primary, secondary overlay/import, validation.
4. M4 persistence migration — [x] consumer audit/selective boundary migration complete; retain keys/schema and compatibility fallbacks. Validation deferred to M6.
5. M5 lifecycle/permissions — add centralized handling only for native-specific capabilities.
6. M6 batch validation — typecheck/build/tests/device checks. Keep CI suppressed for every individual PR commit.

## Validation status
No build, typecheck, CI success, or device testing is asserted by this handoff.

## Latest checkpoint
The storage consumer audit found no new feature path needing immediate invasive migration. Current next task is locate native plugin/project setup and identify supported Android/iOS file-access integration points before implementing M2.


## Milestone advance
M4 consumer migration has been marked complete in `docs/PROJECT_STATUS.md`; next milestone is M5. Investigation confirmed `src-tauri/tauri.conf.json` and Cargo config, but native generated project layouts were not yet established by this check. Mobile adapter still has no lifecycle service and secondary storage returns null. Avoid implementing SAF/Files via generic browser picker.


## Priority update
Unfinished roadmap ordered by impact and dependencies:
1. M2 Android SAF/iOS Files user-accessible storage and export.
2. M3 locale private-primary/shared-secondary overlay.
3. M5 native lifecycle and permission adapters, only after native integration surface is located.
4. M6 batch validation.

Browser-only lifecycle slice was implemented: web adapter can subscribe to popstate as a back-navigation event and explicitly rejects unsupported exit. Native lifecycle remains outstanding. No test/build performed.


## Re-audit notes
- `src/App.tsx` already registers Tauri `onBackButtonPress` for Android and calls history.back() or exit(0), unregistering on cleanup. M5 should consolidate/integrate this into the LifecycleService contract rather than duplicate it.
- `src/platform/families/web.ts` popstate listener service exists but currently no app consumer wires it.
- Native secondary shared storage remains unavailable; current `resolve_storage_location` returns null on mobile.
- `src/i18n.ts` loads private external locale JSON over bundled locale dictionaries; secondary accessible folder overlay is not yet implemented.


## Latest work
- M5: centralized App back handling via LifecycleService.
- Contract callback now receives native `canGoBack` state. Mobile adapter bridges Tauri back events and app exit; listener cleanup is included.
- App consumer calls history.back() when native stack can go back, otherwise lifecycle exit.
- Web lifecycle hook is inert; browser navigation remains owned by browser/router and exit is unsupported.
- Validation has not been run; milestone remains open.

## M2 native picker research checkpoint (2026-11-20)
- Confirmed Tauri v2 dialog plugin supports native file open/save on Android and iOS; mobile dialogs return content URI (Android) or file URI (iOS), and mobile directory picker is not supported. This can provide user-directed individual-file import/export, but not persistent folder access or an always-mounted secondary directory.
- Tauri filesystem plugin is sandbox-restricted by default on Android/iOS and requires capability scope/permissions; do not grant broad path access as a shortcut.
- This repository branch does not include the expected generated native Android manifest/capability project paths in the fetchable tree/search results. Package lock and generated native setup remain to be inspected locally.
- No plugin/dependency change was made yet: adding native plugins without updating lockfile and verifying capability/native generated setup would leave a potentially broken PR. M2 is still incomplete. Next implementation slice: native dialog-driven file export/import (rather than folder access), then native directory/persistent access only if platform-specific support is available.


## M2 dependency/native setup blocker re-audit (2026-11-20)
- Refreshed PR #11 and current branch head; PR remains open/draft and unmerged.
- Confirmed package-lock.json exists and needs synchronized npm plugin dependency changes. `src-tauri/Cargo.lock` is absent from the tracked branch, and expected generated Android manifest/Gradle paths are not tracked/fetchable. `tauri.conf.json` currently has no dialog/fs plugin configuration; capabilities enable core:default only.
- Native import currently uses HTML `input[type=file]` in Settings, validating JSON and copying to private locale storage. This is a basic import, not SAF/Files native integration or shared-storage overlay. The native export command writes to app-private backup directory; not user-accessible export.
- Avoid adding plugin calls without dependencies, lockfile sync, and capability/native setup: that risks leaving the branch uncompilable. Next safe implementation work is to establish a reproducible native project/plugin configuration path and then implement a dialog save/open flow; Android directory grants and iOS Files document exposure remain distinct requirements.
- M3 overlay remains blocked on secondary-accessible locale source; current refresh loads only private external locale files and bundled locale dictionaries.
- No build, typecheck, or device validation performed.


## M3 implementation increment — desktop shared locale overlay (2026-11-20)
- Added optional LocaleService secondary-list/write hooks and wired the Desktop adapter to native commands for the user-accessible Documents/Pawchive/languages directory.
- Rust commands enumerate and write JSON files there with locale-code and 1 MiB size checks, matching private locale validation limits. This implementation is desktop-only; Android/iOS secondary access deliberately remains unavailable pending SAF/Files integration.
- i18n refresh now loads private external locale dictionaries, then secondary dictionaries; shared entries override private entries and bundled dictionaries (including ja), preserving bundled Japanese fallback. Invalid shared dictionaries are skipped and reported in invalid file list.
- Secondary writing/listing is service-level, not yet surfaced as a dedicated Settings import/export flow. M2 remains incomplete; M3 partial.
- Source changes only; no build, typecheck or runtime validation.


## M3 follow-up — secondary locale import UI (2026-11-20)
- Settings now has a distinct import action for the secondary user-accessible locale destination, routed through `LocaleService.writeSecondary`; it does not overwrite the private locale files.
- File names/code and JSON contents are validated before write, import failures are collected, and locale dictionaries refresh after the batch.
- The desktop adapter currently provides this operation (Documents/Pawchive/languages). Platforms without the secondary writer show an unsupported message. This is a file-picker import UX, not a persistent folder grant or SAF/iOS directory access.
- Source-only change; no build/typecheck/runtime verification performed. M2 mobile storage remains a priority and incomplete.
