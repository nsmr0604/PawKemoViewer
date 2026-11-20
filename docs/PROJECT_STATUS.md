# Project Status & Roadmap

> PR #11 platform foundation checkpoint: 2026-11-20. See progress document for chronological details.

## Platform refactor (PR #11)
- Runtime and family adapters (Desktop/Mobile/Web) are scaffolded.
- Typed LoggingService, StorageLocationService, FileExportService and LocaleService are present.
- Backup export consumer uses FileExportService (migration cleanup verified in latest increment).
- Locale enumeration uses LocaleService; locale loading/overlay still uses private app-data directory only.
- Rust storage resolver: private app-data locations; desktop secondary Documents location. Mobile secondary accessible location remains unavailable.
- Web fallback includes localStorage, clipboard, download export; external locale enumeration is no-op.
- Android workflow does not run for each PR commit; main path-filtered pushes and manual dispatch remain.
- PR is open, draft, and unmerged. Do not merge without explicit authorization.
- No build/typecheck/CI/device verification has been confirmed for this work. No destructive migration.

## Next
1. Implement user-accessible secondary storage/export picker on Android and iOS (requires native SAF / Files picker integration; native generated project files were not found at the expected paths during inspection).
2. Locale private-primary plus accessible-secondary overlay/import, without replacing private primary.
3. ~~Route log dump export through FileExportService.~~ (completed; Settings diagnostic export now uses runtime service)
4. Continue migrating feature consumers to runtime contracts.
5. Batch validation; avoid per-commit Android build runs.


## Latest increment
- Removed duplicated platform-runtime import and corrected backup export consumer to use the injected FileExportService rather than direct Rust invoke. This also makes the Web export fallback reachable for backups.
- This is a source-level correction only; build/typecheck and runtime checks remain unverified.


## Latest increment
- Settings log-dump export migrated from direct `export_log` Rust invocation to the runtime FileExportService, sharing the same platform boundary as backup export.
- Build/typecheck/device validation remains unconfirmed.


## Secondary storage investigation
- Native generated Android/iOS project files were not available at the expected `src-tauri/gen/...` paths; native user-accessible storage implementation needs locating the generated/configured native project structure and confirming plugin/permissions before modifying it.


## Locale service CRUD migration
- Settings locale creation/deletion now delegates through the PlatformRuntime LocaleService contract instead of invoking native commands directly. Desktop and mobile adapters invoke the native locale commands; Web adapter explicitly reports unsupported write behavior.
- This is a boundary migration of private locale file management; secondary user-accessible locale overlay remains unimplemented.
- No build/typecheck/device validation was performed.


## Platform foundation milestone roadmap (sequence)
- **M1 capability boundary coverage:** clipboard and file export, locale CRUD, log routing consumers migrated. Clipboard integration is now completed for backup copy/paste via runtime service (desktop/mobile/web adapters).
- **M2 user-accessible storage:** investigate and implement Android SAF and iOS Files/document-picker access, including persistent grants and cancellation/error handling; no native implementation yet.
- **M3 layered locale loading:** private locale files primary; secondary user-accessible locale files overlay/override, safe import/export and validation.
- **M4 storage/persistence migration:** [x] consumer inventory and selective service migration completed (compatibility fallback retained; IndexedDB transaction layer remains feature-owned). Validation deferred to M6.
- **M5 lifecycle/permissions and remaining native integrations:** centralize only genuinely platform-dependent behavior.
- **M6 batch validation:** typecheck/build, targeted tests and device checks where available; keep PR build automation disabled per-commit.

### M1 latest checkpoint
- Desktop/mobile runtime adapters now provide ClipboardService using browser-webview clipboard capability, returning null/false on failure (no exception propagation).
- Settings backup copy and clipboard import now use the runtime service, including browser adapter.
- No build or platform validation has been run; permission behavior may vary by OS/WebView.


## M2 incremental progress — locale file picker import
- Added a Settings file-picker flow for selecting one or multiple locale JSON files. Files are validated with existing locale parser/code checks and copied to app-private locale storage via LocaleService; refresh and currently selected locale are reapplied.
- This is an import workflow, not persistent shared-directory access. Android SAF/iOS Files integration and secondary-location overlay are still outstanding; picker/WebView behavior is unverified on devices.
- Failure/skipped files are reported in Settings. No build/typecheck/device verification performed.


## Latest increment — Web file-export lifecycle
- Browser fallback FileExportService now delays object-URL revocation briefly after triggering download, to avoid premature cleanup during browser download handling.
- This is a source-level mitigation, not verified in browser/device testing.


## Latest increment — Key/value service consumers
- Desktop/mobile adapter bundles expose the key/value service backed by the existing WebView localStorage.
- Follow mirror/migration marker and search-history operations now use that service instead of direct localStorage calls.
- Existing backend semantics/data location are unchanged; this is not a native storage migration. Validation remains pending.


## Latest increment — settings storage migration
- Settings persistence now routes through the platform key/value storage service with a guarded localStorage fallback for pre-bootstrap access.
- Bootstrap reloads persisted settings after platform runtime initialization, so the runtime adapter is available before settings are applied to locale/UI.
- Existing settings key and JSON schema remain unchanged. No data migration or destructive operation.
- Validation remains pending.


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


## IndexedDB migration follow-up
- Creator icon cache database (`pawkemo-icons`) now opens through PlatformRuntime's IndexedDatabaseService instead of calling IndexedDB directly.
- Creator-cache DB opening resets its cached promise on failure, allowing retry, and closes the connection on versionchange to avoid blocking upgrades.
- These are source changes only; build and runtime validation remain pending. Other IndexedDB transaction operations remain within feature modules.


## Icon database retry correction
- Icon-cache database open failures no longer remain cached as a rejected promise; subsequent calls may retry. The DB connection also closes on versionchange.
- Validation remains pending.


## Source-integrity correction checkpoint
- Corrected escaped newline sequences that had been inadvertently written as literal characters in imports/comments and the web platform adapter, restoring normal source line structure.
- Normalized adapter type-import punctuation.
- Build/typecheck is still unverified; treat these corrections as source-level fixes pending CI validation.


## IndexedDB transaction reliability checkpoint
- The shared transaction helper in `src/db.ts` now captures request results but resolves successful operations only after the transaction's `complete` event. Transaction error/abort reject paths are explicit.
- Icon-cache reads similarly wait for transaction completion, rather than resolving on request success alone.
- This reduces the risk of reporting write/read operations complete before the transaction lifecycle settles. Source-only change; validation remains unconfirmed.


## Latest implementation checkpoint — IndexedDB transaction semantics
- Generic creator/seen/meta transaction helper waits for the IndexedDB transaction `complete` event before resolving, and explicitly rejects transaction errors/aborts.
- Icon-cache reads and writes likewise handle transaction lifecycle events rather than treating request success alone as operation completion.
- No schema or persistence-key changes. Build/typecheck/device validation has not been run.

## Next work
- Continue auditing platform-specific lifecycle and storage consumers; avoid conflating UI/browser event APIs with OS capability services.
- Native Android SAF / iOS Files secondary-storage integration and layered locale overlay remain high-priority but require validated native project/plugin configuration.


## M4 storage consumer audit checkpoint (2026-11-20)
- Audited branch implementations of settings, follows, search history, favorites tab, scroll restoration, current-post context, creator/seen database, and icon cache.
- Main feature storage consumers now use PlatformRuntime storage/session/IndexedDatabase services; direct browser storage references are limited to adapter-absence fallback and pre-runtime/bootstrap defensive access. The fallback is intentionally retained to preserve access when runtime initialization is not yet available.
- IndexedDB schema, keys, version, and transactions remain in feature modules; the service abstracts opening/upgrade dispatch, not full transaction semantics. This is a partial boundary, not a complete storage-engine abstraction.
- Avoid broad transaction abstraction changes without validation; next focus is safely removing/isolating unintended direct-storage fallback and documenting intentional browser-only fallbacks.
- No build/typecheck/device validation was run.


## M4 milestone completion (audit + consumer boundary, validation deferred)
- Completed the targeted audit of persistence consumers and their runtime service routing; retained compatibility fallback paths where runtime services may not yet be initialized/available.
- IndexedDB remains intentionally split: opening/upgrade is routed through IndexedDatabaseService, while transactions remain feature-owned.
- No storage keys, schema, DB versions or stored formats changed.
- M4 is considered complete as a consumer-migration milestone; M6 remains responsible for validation. Native shared storage and locale overlay are M2/M3.
- Next: M5 lifecycle/permissions audit, only centralizing native-specific behavior where justified by platform differences.


## Prioritized unfinished milestones (2026-11-20)
1. **P1 M2 mobile shared storage** — SAF on Android and Files picker on iOS, backed by native integration, export and import, cancellation/error handling, and durable grants where available. Do not substitute a browser picker.
2. **P2 M3 locale overlay** — private locale source primary; accessible shared folder/picked locale files secondary with deterministic overlay, validation, and non-destructive import.
3. **P3 M5 native lifecycle/permissions** — implement platform-specific back/exit and capability permission behavior once native plugin/API setup is located and validated; avoid permission requests without a capability-specific reason.
4. **P4 M6 validation** — batch typecheck/build/test and device validation after implementation; no per-commit CI runs.

M5 browser-only slice: added lifecycle popstate handler subscription to the Web adapter; native Tauri lifecycle remains unimplemented. Browser exit intentionally rejects as unsupported. This does not complete M5.


## M5 re-audit correction (2026-11-20)
- Rechecked App.tsx: Android native hardware/gesture back handling already exists directly via Tauri `onBackButtonPress` and `exit`, unregistering its listener on unmount. This existing behavior is not yet routed through LifecycleService; therefore M5 is a refactor/integration gap, not missing basic Android back behavior.
- Browser lifecycle adapter was added in the previous increment but is not yet consumed by App.tsx. Avoid treating it as app-level back behavior until wired to a consumer and validated.
- Current M2 blocker: repository tree/native plugin configuration needs further inspection; avoid speculative dependency additions.


## M5 lifecycle service integration (source checkpoint)
- Routed App back handling through PlatformRuntime LifecycleService.
- Mobile adapter now implements lifecycle registration using Tauri `onBackButtonPress` and app exit through Tauri `exit(0)`; it forwards native `canGoBack` state to the consumer and unregisters on cleanup.
- Contract now carries `canGoBack` in callback, preventing app-level guessing about navigation state.
- Web lifecycle registration is intentionally inert to avoid synthesizing browser-history loops; browser navigation remains browser/router-owned and browser exit is unsupported.
- Source changes only. No typecheck/build/device test; M5 remains incomplete pending native integration validation and other platform lifecycle needs.

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
