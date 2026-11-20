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
