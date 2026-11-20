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
- Log dump export migration is pending.
- Clipboard native adapter, LifecycleService, PermissionService remain incomplete.
- Existing feature consumers remain to be migrated.
- No build, typecheck, CI, or device verification confirmed. No destructive migration.

## Recent increment
Typed LocaleService enumeration isolated in adapters; typed invoke result and progress/handover docs cleaned up.

## Next
1. Establish safe platform-specific secondary-storage semantics (Android/iOS).
2. Locale secondary overlay and developer JSON import.
3. Log dump export through FileExportService.
4. Clipboard, lifecycle, permission service integration.
5. Continue consumer migration and batch validation.


## 2026-11-20 additional correction
- Backup export now consistently calls the runtime `FileExportService`, removing the duplicated import and direct Tauri invocation. The web adapter's download implementation is therefore used as well.
- No build or runtime validation was performed in this increment.


## Additional increment
- Settings log dump export is migrated from direct Rust invocation to FileExportService. The Web adapter now exports generic text as `text/plain` rather than JSON MIME.
- No compilation or device checks were run.
