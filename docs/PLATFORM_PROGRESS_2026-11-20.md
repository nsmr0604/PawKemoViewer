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
