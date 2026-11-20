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
