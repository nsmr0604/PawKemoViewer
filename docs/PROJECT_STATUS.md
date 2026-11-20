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
- **M4 storage/persistence migration:** inventory and migrate localStorage/IndexedDB consumers selectively without changing keys or schema.
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
