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


## Backup data completeness (2026-11-20)
- Backup serialization now asynchronously reads the IndexedDB `seen` store (`getAllSeen`) and includes those entries instead of exporting an always-empty list. File export and clipboard backup paths await serialization.
- Commits `b2705004` (`backup.ts`) and `23f58276` (Settings clipboard callsite). No build/tests performed; M2 native shared-file selection/export remains outstanding.


## Backup async declaration follow-up
- Corrected the `buildBackup` signature to `async`/`Promise<string>` to match its IndexedDB await. Source commit `a2a1efba`. This is a source inspection correction; compilation is still not verified.


## Read-state restore integrity improvement (2026-11-20)
- Added IndexedDB `replaceSeen` which clears and inserts the complete read-state set in a single transaction, so backup restore is replacement semantics and atomic instead of retaining stale rows or partially applying sequential writes.
- Backup restore validates basic entry shape and uses `replaceSeen`. Commits `191286f6` (initial clear API), `8fe38b4e` (restore integration), `fd621eb0` (atomic transaction), `429d8b6d` (final integration).
- Source review only; no build/test validation. Native SAF/Files milestone remains uncompleted.


## Lifecycle listener stability increment (2026-11-20)
- App now registers the platform back-request listener once at component mount rather than recreating it on every route path change. This reduces listener churn and avoids repeated asynchronous native registration/unregistration races during navigation.
- The callback still uses the platform-provided `canGoBack` signal; when history is unavailable it invokes the adapter exit operation. No change to platform-specific exit behavior.
- Source-level correction only. No build, typecheck, automated test, or device verification was run. M2 shared-storage integration and remaining lifecycle/permissions validation remain open.


## Backup restore validation increment (2026-11-20)
- Backup parsing now rejects malformed top-level settings/follows/seen types and unsupported future or invalid versions, while retaining compatibility for version 1 payloads.
- Restore normalizes/deduplicates follow entries, restricts imported services to FANBOX/Patreon, bounds identifiers and display names, and fills missing creator names safely.
- Read-state restore now validates key shape against supported services, deduplicates keys, and rejects oversized IDs; timestamps are normalized to finite nonnegative values.
- Settings restoration applies a per-field validator for booleans/enums/timeout/locale/session-key rather than blindly copying arbitrary values into live settings.
- Commits `72a52585` and `6581646f`. Source review only; no build/typecheck/test/device verification performed. M2 native picker/SAF/Files and M3 mobile secondary locale remain unresolved.


## Locale input hardening increment (2026-11-20)
- `parseLocaleJson` now rejects payloads larger than 1 MiB, object entry counts above 10,000, keys over 512 characters, and individual translation values over 10,000 characters. It continues to require `locale.name` and at least one additional string entry.
- This protects both private and desktop-secondary import paths and refresh-time overlay parsing from unnecessarily large payloads. Native Rust listing/writing already enforces its file size bound; this adds frontend validation for picker imports and in-memory parsing.
- Commit `81cc9571`. Source-only; validation not run. Android SAF/iOS Files picker remains blocked/incomplete.


## Locale parser prototype-key hardening (2026-11-20)
- Changed imported locale dictionaries to null-prototype objects and excluded `__proto__`, `prototype`, and `constructor` keys from accepted dictionary entries.
- Commit `1d36f83e`. No build/typecheck/tests run.
- M2 still needs synchronized native file-picker dependencies/capabilities and generated project verification; M3 remains desktop-only; M6 validation not performed.


## Backup import bounds (2026-11-20)
- Parser now rejects oversized backup payloads (>5 MiB) and overly large follows/seen arrays (>100,000 entries), limiting resource-exhaustion risk during restore.
- Commit `b6836d80`; no tests/build executed.


## 2026-11-20: Backup restore robustness follow-up
- Restore validation now bounds read-state post IDs and cached newest-post metadata fields.
- Restore now completes the atomic IndexedDB read-state replacement before overwriting follows, avoiding follow-list mutation when the read-state transaction fails.
- Validation/device testing remains outstanding.


## 2026-11-20: Atomic locale writes
- Native locale writes now stage into a unique sibling temporary file, flush it, then rename to the destination; both private and desktop secondary locale paths use the helper.
- Intended to avoid partially written locale JSON if interrupted. Runtime/build compatibility still needs validation, especially platform-specific rename replacement behavior.


## 2026-11-20: Locale rename replacement compatibility
- Atomic locale-write helper now includes a fallback for platforms (notably Windows) where rename cannot replace an existing destination: it removes the old file and retries the staged rename, cleaning up temporary files on failure.
- This fallback has a brief non-atomic replacement window; platform testing is still required.


## 2026-11-20: Locale import bounds and diagnostics
- Settings import flows for private and secondary locale JSON now reject files larger than 1 MiB before reading, and report per-file validation/save failure reasons.


## 2026-11-20: Secondary locale UI capability gating
- The secondary-locale import picker is now shown only for the desktop platform family, avoiding a UI affordance on mobile/web where the secondary storage adapter is not implemented.


## Bottleneck-focused work kickoff — M2 (2026-11-20)
- Highest-priority blocker confirmed: user-accessible Android SAF/iOS Files operations are absent; existing mobile backup export is app-private only.
- Implementation direction: selected-file open/save abstraction, Tauri v2 picker integration with minimal scoped permissions, explicit cancellation and error handling; migrate backup and logs, then locale secondary overlay.
- This checkpoint is a source/config audit and plan update, not native picker implementation. Dependency lockfile sync, generated project setup and build/device validation remain prerequisites in the current tool-limited environment.


## M2 native dialog plugin branch kickoff (2026-11-20)
- Work is now isolated on `feature/m2-native-file-dialog`, branched from the platform-foundation PR branch.
- Added Rust `tauri-plugin-dialog` dependency, initialized the plugin in Tauri runtime, and granted narrowly scoped dialog open/save capabilities.
- npm guest package `@tauri-apps/plugin-dialog` and `package-lock.json` synchronization remain pending: this environment cannot execute npm install/lockfile generation. Do not claim the JS plugin is installed or builds are validated until lockfile synchronization is completed.
- Next slice: add synchronized npm dependency/lockfile, then implement selected-file read/write bridge. Android content URIs require special handling and should not be treated as ordinary filesystem paths; iOS file URI support must likewise be validated. No device/build validation yet.


### M2 follow-up audit
- Native dialog plugin wiring (Rust dependency, registration, capability permissions) is present on the M2 branch; frontend package/lockfile synchronization and URI-safe read/write integration remain outstanding.
- Locale import currently uses browser FileList and private storage, not native SAF/Files or secondary shared storage.
- No validation/build/device test has been run. PR #11 remains draft and has not been historically split into replacement PRs.


## Backup file import UX slice (2026-11-20)
- Settings now exposes direct JSON backup-file selection alongside existing clipboard/paste restore. The file size is checked against the 5 MiB backup limit before reading; restoration still uses the existing confirmation and validation/apply flow. This is browser-backed selection and does not yet represent native dialog-plugin URI integration or user-accessible export.
- Validation remains pending; no build or CI was run.

## Continuation checkpoint — 2026-11-20 (M2 native dialog integration)
- Rechecked `feature/m2-native-file-dialog`: Rust `tauri-plugin-dialog = "2"` dependency, plugin registration, and `dialog:allow-open` / `dialog:allow-save` capability permissions are present. Settings backup restore currently accepts one selected JSON file via the WebView `input[type=file]`, enforces a 5 MiB file-size limit before reading, and then reuses the existing validated restore flow.
- The frontend `@tauri-apps/plugin-dialog` dependency is not present in `package.json` or `package-lock.json`; no frontend dialog API is called. Therefore this is not yet a native dialog integration, and the current backup export still uses the app-private `export_file` command. Do not describe either as user-accessible shared-storage export.
- The Rust plugin/capability wiring and the existing HTML file input have not been build- or device-verified. Local network/package registry access was unavailable in the prior work session, so lockfile synchronization must be done with npm in a network-enabled checkout rather than hand-editing package-lock.
- Next M2 slice: add and lock the official JS dialog plugin dependency, implement open/save dialog flows behind `FileExportService` and a corresponding import contract, then verify Android content-URI and iOS file-URL read/write semantics before claiming SAF/Files support. Folder-persistent grants remain a separate, unresolved capability.
- Keep PR #11 open and Draft; do not trigger per-commit CI/builds. No build, typecheck, CI or device test is claimed in this checkpoint.

## M2 checkpoint — native save-dialog slice
- Added Rust command `save_user_file`, using Tauri dialog plugin native Save UI and writing selected destination. Registered the command.
- Mobile and desktop `FileExportService.exportText` now route to this save dialog, so backup export and log export destinations are user-selected rather than silently app-private. Web adapter remains browser-download behavior.
- Dialog cancellation currently returns a Japanese cancellation string; caller-side UI handling is a follow-up refinement. Import still uses HTML file picker and does not yet implement URI persistence or SAF folder grants.
- Commits: `f289149` Rust command/registration; `8424707` mobile adapter; `59f3ea0` desktop adapter. Build/device verification remains pending, and frontend dialog plugin dependency/lockfile remains absent.


## M2 continuation — save-dialog cancellation UX (2026-11-21)
- Settings backup and log export now recognize the native save command's `キャンセル` sentinel and display an explicit cancellation message rather than reporting a successful export or attempting clipboard copy.
- Cancellation handling is caller-side; the service contract still returns a string sentinel, which is fragile and should be replaced with a typed result (cancelled vs saved path) in a future contract slice.
- No build/typecheck/device/CI validation was run. Native file-path conversion and Android/iOS SAF/Files semantics remain unverified; JS dialog dependency and package-lock synchronization are still blocked.


## M2 continuation — typed export outcome (2026-11-21)
- Replaced the FileExportService string/sentinel return contract with a discriminated result: `{ status: "saved", path }` or `{ status: "cancelled" }`. Native adapters translate the command sentinel into this result; the web adapter returns the saved filename result.
- Backup export and Settings log export consume the typed result and treat cancellation as a distinct non-success outcome, avoiding string/path ambiguity.
- Source edits only; no build, typecheck, automated tests, CI or platform/device verification. Dialog plugin npm dependency/lockfile and native open/import path remain pending.


## M2 continuation — native backup open picker (2026-11-21)
- Added Rust `open_user_backup` command with a JSON-filtered native open dialog; it reads selected UTF-8 file contents, caps file size at 5 MiB, and returns None on cancellation.
- Settings backup restore now calls this command instead of the HTML file input for the backup restore entry point. The existing HTML-based locale import pickers remain.
- This remains unverified: the dialog plugin's selected-path conversion may differ on mobile/content-URI providers, and no build/typecheck/device test was run. JS plugin package synchronization is still outstanding.

- Preserved the browser/Web fallback for backup restore: non-native runtimes still use the HTML file input, while native runtimes use the Rust open-dialog command.


## M2 follow-up — bounded native backup reads (2026-11-21)
- `open_user_backup` now enforces the 5 MiB ceiling during the actual read (read at most limit + 1 bytes), rather than relying solely on a metadata check that could race with file changes. UTF-8 decoding errors are reported explicitly.
- Commit `4ebb0e34`. Source-level only; native dialog selected-path conversion remains potentially incompatible with Android content URIs/iOS file-provider URLs and is not validated. No build/typecheck/device test/CI was run.


## M2 native-picker API audit (2026-11-21)
- Consulted official Tauri v2 Dialog plugin documentation: selected paths on iOS are file:// URIs and on Android are content URIs; the Rust dialog plugin docs explicitly note Android files are behind content URIs and recommend the filesystem plugin for reading. Thus `FilePath.into_path()` in `open_user_backup` is not a cross-platform mobile solution and can fail on mobile.
- `save_user_file` similarly assumes a filesystem path and direct `std::fs::File::create`, which is not valid for Android content URI destinations and may not correctly handle iOS scoped file access.
- The required next change should use dialog + Tauri filesystem plugin URI-aware APIs, with a JS/Rust bridge that enforces size limits, rather than translating content URI to `PathBuf`. Package-lock is present; dependency integration needs proper npm synchronization, which this session cannot perform reliably.
- No build, typecheck, or device test was run. Do not mark mobile file selection/import/export complete yet.


## Mobile WebView export fallback (2026-11-21)
- Mobile FileExportService now attempts a WebView/browser download using Blob + object URL instead of immediately rejecting backup/log export requests.
- This is a transitional fallback only: download handling and file location behavior depend on Android/iOS WebView/device configuration. It is not a SAF/Files URI writer and cannot claim user-selected destination support.
- Build, typecheck, and device testing remain pending; do not mark M2 export fully complete.
