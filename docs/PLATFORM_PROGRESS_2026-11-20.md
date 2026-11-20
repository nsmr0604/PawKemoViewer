# Platform foundation progress — 2026-11-20

## Current baseline
PR #11 `refactor/platform-foundation-phase1` is open and draft. No merge or build verification is confirmed.

## Scaffold
- Runtime initialization and Desktop/Mobile/Web family separation.
- LoggingService integrated with `src/log.ts` (Full diagnostic persistence; Lite remains error-only).
- StorageLocationService contract and Rust resolver: private app-data plus desktop secondary Documents; mobile secondary intentionally unavailable pending native semantics.
- FileExportService integrated into family adapters; backup export consumer migrated.
- LocaleService introduced; i18n external-file enumeration migrated from direct Tauri invocation.

## Current limitations
- Locale files remain private app-data only; secondary accessible locale overlays/import/export are not implemented.
- Android/iOS user-accessible export/file picker/share adapters are pending.
- Log dump export migration is complete through FileExportService.
- ClipboardService integrated for desktop/mobile/web; native WebView clipboard behavior remains unverified. LifecycleService and PermissionService remain incomplete.
- Existing feature consumers remain to be migrated.
- No build, typecheck, CI, or device verification confirmed. No destructive migration.

## Recent increment
Typed LocaleService enumeration isolated in adapters; typed invoke result and progress/handover docs cleaned up.

## Next
1. Establish safe platform-specific secondary-storage semantics (Android/iOS).
2. Locale secondary overlay and developer JSON import.
3. Log dump export through FileExportService.
4. Clipboard integration is completed for Settings backup operations; lifecycle and permission service integration remain.
5. Continue consumer migration and batch validation.


## 2026-11-20 additional correction
- Backup export now consistently calls the runtime `FileExportService`, removing the duplicated import and direct Tauri invocation. The web adapter's download implementation is therefore used as well.
- No build or runtime validation was performed in this increment.


## Additional increment
- Settings log dump export is migrated from direct Rust invocation to FileExportService. The Web adapter now exports generic text as `text/plain` rather than JSON MIME.
- No compilation or device checks were run.


## Next high-priority storage work blocked pending native layout discovery
- Expected generated native Android/iOS files were not present at the probed paths. Implementing a SAF / iOS Files picker without locating the configured native project and its plugin/permissions setup would risk an incomplete or broken mobile integration.
- Log export service migration is complete source-wise; native secondary storage picker and locale overlay remain pending.


## Locale service CRUD migration
- Settings locale creation/deletion now delegates through the PlatformRuntime LocaleService contract instead of invoking native commands directly. Desktop and mobile adapters invoke the native locale commands; Web adapter explicitly reports unsupported write behavior.
- This is a boundary migration of private locale file management; secondary user-accessible locale overlay remains unimplemented.
- No build/typecheck/device validation was performed.


## M1 checkpoint — Clipboard boundary integration
- Desktop and mobile family adapters expose ClipboardService; reads return null and writes false on capability or permission failure.
- Settings backup copy and import-from-clipboard use runtime clipboard instead of direct navigator access.
- Browser clipboard adapter remains explicit.
- No build/typecheck/device verification performed.
- Roadmap order recorded in PROJECT_STATUS.md: capability migrations → accessible secondary storage → layered locale → persistence consumers → lifecycle/permissions → batch validation.


## M2 incremental checkpoint — locale JSON import picker
- Settings now offers multi-file JSON selection; existing locale-code and dictionary validation is applied before writing via LocaleService into private locale storage.
- Successful imports refresh locale catalog and reapply active locale. Failures are reported as skipped filenames.
- This is not yet a secondary shared storage location or SAF/document-picker persistent grant. Device validation remains outstanding.
- Next: native Android SAF/iOS Files integration research and secondary locale overlay design; avoid asserting native folder access until confirmed.


## Web export reliability checkpoint
- Adjusted browser FileExportService cleanup to revoke generated object URLs after a short delay instead of synchronously in the download-click path, reducing the risk of invalidating the URL before browser download handling consumes it.
- Source change only; download behavior is not device/browser verified.
- Native Android SAF/iOS document-picker integration remains blocked on verified plugin/native project setup. Avoid presenting the HTML picker as shared-storage access.


## Incremental persistence service migration — follows and search history
- Desktop and mobile family adapters now expose the same synchronous key/value service over their WebView localStorage backing, matching the current persistence behavior while creating an explicit migration seam.
- `follows.ts` now reads/writes follow mirror and account-migration marker through the platform storage service (fallback remains localStorage if runtime storage is absent).
- `history.ts` now uses the platform storage service for search-history read/write/delete.
- This is an adapter-boundary migration, not a move into native app-private database/storage; the underlying persistence backend remains localStorage.
- Validation not performed (build/typecheck/device).


## Incremental settings persistence migration
- `src/api.ts` settings reads/writes now use the platform KeyValueStorage service, with a guarded fallback when the runtime is not initialized.
- Bootstrap explicitly reloads settings once runtime adapters are initialized, preventing the module-load ordering issue from causing settings to remain at defaults.
- Preserves existing `pawkemo-settings` key and JSON format; no destructive migration.
- Build/typecheck/device validation remains unverified.


## Session-storage boundary increment
- Added a distinct `SessionStorageService` contract and wired desktop/mobile/web adapters to the existing WebView/browser `sessionStorage` implementation.
- Scroll restoration (`src/hooks.ts`) now reads, writes, and removes its scroll map through the session-storage service. The session-only semantics and key remain unchanged; this does not claim native or cross-session storage.
- Validation is pending (no build/typecheck/device checks run).


## Latest persistence consumer increment
- FollowButton creator-name enrichment now writes the follow mirror through the PlatformRuntime key/value storage service.
- Favorites page remembered-tab read/write now also uses the service. Keys and values are unchanged; fallback localStorage remains for adapter absence.
- This does not alter IndexedDB schema or native storage behavior. Validation remains pending.


## Session storage consumer increment
- PostPage's session-scoped current-post context now uses the platform SessionStorageService instead of directly accessing sessionStorage. Existing key, JSON shape and session lifetime are preserved. Adapter absence is handled without blocking page display.
- Remaining direct sessionStorage references are concentrated in scroll restoration (already service-migrated) and any platform adapter implementation; no IndexedDB schema change in this increment.
- Build and runtime validation not performed.


## IndexedDB boundary increment
- Added `IndexedDatabaseService` contract and implementations for desktop/mobile/web family adapters. The adapter owns opening IndexedDB and upgrade callback dispatch; it does not alter storage engine or data format.
- `src/db.ts` now requests database opening through PlatformRuntime. Database name (`pawkemoviewer`), version (1), object stores/index, pack encoding, transactions and existing data remain unchanged.
- This is an adapter-boundary migration only; IDB transactions/query functions remain in `src/db.ts`. No validation/build/device testing has been run; follow-up must inspect for type/build errors before advancing.


## IndexedDB follow-up checkpoint
- The icon cache (`pawkemo-icons`) was moved to the IndexedDatabaseService adapter boundary, so both the creator search/seen database and icon-cache database opening are now platform-mediated.
- The creator DB open promise is cleared after failure to permit retry; its connection closes on versionchange. This does not migrate transaction code or change DB schemas.
- Validation has not yet been performed. Next work remains transaction-service boundaries, native shared-storage (Android SAF / iOS Files), layered locale, and remaining consumer audit.


## Icon database retry correction
- Icon-cache database open failures no longer remain cached as a rejected promise; subsequent calls may retry. The DB connection also closes on versionchange.
- Validation remains pending.


## Source-integrity correction checkpoint
- Corrected escaped newline sequences that had been inadvertently written as literal characters in imports/comments and the web platform adapter, restoring normal source line structure.
- Normalized adapter type-import punctuation.
- Build/typecheck is still unverified; treat these corrections as source-level fixes pending CI validation.


## Transaction lifecycle follow-up
- `src/db.ts` helper now waits for transaction completion for success and handles error/abort paths.
- Icon-cache IDB read helper in `src/icons.ts` also waits for completion. Schema and keys are unchanged.
- Audit still pending for remaining direct storage/browser API use and native shared-storage integration; no validation claimed.


## Continuation handoff — 2026-11-20 (secondary locale import UI)

- PR #11 remains Draft/Open/unmerged. Branch: `refactor/platform-foundation-phase1`. Keep commit-triggered Android builds suppressed.
- Latest implementation commit: `5fffa68a09f0ddaa2540626e4d183dad13c93cde` (Settings UI for secondary locale import). Documentation checkpoint commits: `e5614c74f466fdb14d5acc4f5135d918f3f963c2`, `033a3aad25543bd6db631c10ec7eab3df6de7b6e`.
- Settings now separates secondary shared locale import from app-private import. It calls optional `LocaleService.writeSecondary`, validates locale code and parsed JSON, handles multiple files, records failures, refreshes locale list and applies current locale after import. Mobile/Web do not advertise a secondary writer, so UI reports unsupported.
- Desktop secondary locale storage/listing commands use Documents/Pawchive/languages. i18n dictionary merge order: bundled < private external < secondary. Locale selection includes secondary-only codes; private external marker remains separate for deletion affordance.
- Audit caveat: secondary list command creates the Documents folder when enumerated, and native command bodies are densely formatted; readability cleanup could be deferred but compile validation is needed. Rust native command registration is present.
- M2 remains the highest priority and not completed: Android SAF and iOS Files picker/document integration, export destination and grants. Current dependency blockers: no tracked Cargo.lock, generated Android/iOS project directories were not located in GitHub tree, Tauri capabilities only core:default, and package-lock synchronization is required for npm plugins. Avoid introducing unverified plugin/dependency edits that risk breaking the branch.
- Suggested next sequence: (1) locate/reconstruct native generated project and lockfile workflow; (2) add narrowly scoped native file picker plugin/capabilities with synchronized npm dependencies; (3) implement per-platform import/export flows and cancellation/errors; (4) add tests/validation batch. Persistent directory access may not be supported identically; file-level selection is acceptable as a separate incremental slice but must not be claimed as directory grant.
- Validation is still unconfirmed: no build, typecheck, tests, or device run. M3 desktop layer/import UI is source-level only; M2 mobile remains outstanding.


## Follow-up re-audit checkpoint (2026-11-20)
- Re-confirmed mobile FileExportService calls the `export_file` Rust command, writing timestamped output under app-private `app_data/backup`; this is not Files-app or Android user-selected export.
- Locale secondary overlay/import is source-level Desktop only. Mobile LocaleService has no secondary list/write hooks, so M3 cannot be considered cross-platform.
- Rechecked `tauri.conf.json`, npm/Cargo dependencies and default capability: no dialog plugin dependency/configuration is present and capability currently only contains `core:default`. Generated native project sources are not tracked in the accessible tree. Native plugin integration remains blocked pending a synchronized dependency/config path.
- Do not reinterpret the HTML locale file input as SAF/Files support or app-private export as user-accessible export. Keep M2/M3 mobile tasks open.
- No code change or validation was made in this audit slice. Next step remains native picker integration with dependency/capability synchronization, followed by user-visible save/open and cancel/error handling.


## Native integration continuation checkpoint
- PR metadata refreshed; PR #11 remains open, Draft, unmerged. Current head matches latest docs audit commits.
- Rechecked the mobile family service and platform contracts: private export remains `invoke(export_file)` and mobile locale service exposes private CRUD only. There is no native document picker service contract yet.
- GitHub content search again did not locate generated AndroidManifest/iOS project source or dialog-plugin setup. `docs/BUILD.md` documents `tauri android init` as the generation workflow, suggesting native project scaffolding is reproducible locally rather than committed, but this cannot be verified remotely in this session.
- Refrained from adding an uncoordinated plugin dependency or native permission/config changes without package-lock synchronization and a reproducible generated-project check; this could introduce build-breaking changes. M2 remains active and this is a dependency/config validation blocker rather than implementation completion.
- Next action: establish/reproduce `tauri android init` locally and dependency install/lockfile update, then implement picker-based file import/export with scoped capabilities and platform-specific handling; batch validate once several slices are ready.


## Native setup recheck — continuation
- Android workflow uses `npm ci`, then regenerates the native Android project with `npx tauri android init`; generated files are not a committed setup baseline.
- Native dialog plugin not found in inspected dependency/config files. No plugin wiring added without lockfile sync and build environment.
- M2 (user-directed native import/export and secondary-accessible storage) remains open; source/device validation is not claimed.


## Locale import correction
- Fixed `.json` filename extension parsing for both app-private and secondary locale file import handlers; ordinary selected locale filenames now yield the locale code before validation. Commit `5792d089`.
- Source-level only; validation unconfirmed.


## Secondary locale listing error reporting
- Added surfacing of secondary storage's listing-invalid entries in locale diagnostics, with `secondary:` labels. Commit `ccbf20dc`. No build/typecheck/test performed.


## M5 lifecycle follow-up
- Back-handler now uses the platform-reported `canGoBack` state, invoking history.back only when available and otherwise attempting app exit. Commit `1a670b57`; no build/test validation.


## Backup export filename collision safeguard (2026-11-20)
- Native `export_file` now uses exclusive file creation (`create_new`) so repeated/concurrent exports with the same timestamp and sanitized filename cannot silently truncate/overwrite an existing export. It retries bounded numbered suffixes and returns an error if no unique path can be allocated.
- Empty/sanitization-only filenames fall back to `export.txt`. Source-level change in Rust commit `4dc63f5a`; no compilation/tests/device validation performed. Native export is still app-private; this does not resolve M2 user-accessible export.
