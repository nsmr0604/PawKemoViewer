# Platform Foundation — Interim Handoff (2026-11-20)

## Branch
PR #11 (`refactor/platform-foundation-phase1`) remains open, draft, unmerged. Branch head before this documentation checkpoint was `9ac1799a93e2d99c1ac3b9e8422b06ca411d60b6`.

## Confirmed scaffolding
- Typed platform contracts, runtime initialization and family selection.
- Web localStorage/clipboard adapter.
- Desktop and Mobile adapters invoke `resolve_storage_location`; Mobile returns null for secondary-accessible.
- Rust `resolve_storage_location` command exists and is registered in `invoke_handler`; desktop secondary area resolves to Documents, while mobile secondary remains unavailable.
- Current workflow `.github/workflows/android.yml` has no `pull_request` trigger. It triggers on filtered pushes to main and workflow_dispatch. PR commit builds therefore should not trigger automatically.

## Log architecture audit
- `src/log.ts`: 400-entry ring, 2000-character message cap, Lite error-only; Full keeps all levels.
- Full file persistence is routed via family `LoggingService`; `src/debug.ts` invokes native `debug_append_log`.
- Rust app log writes into app data logs; persistence is not yet routed through platform services.
- Global browser error/rejection listeners remain in `src/log.ts`.
- Log export/storage consumer migration remains pending.

## Logging migration checkpoint
- Typed `LoggingService` added to platform contracts.
- Desktop/mobile adapter expose Full-diagnostic append through dynamic `debug` import; Lite builds won't invoke it because `src/log.ts` retains Full-only condition.
- `src/log.ts` now calls platform logging service instead of importing native debug implementation directly. Web logging adapter is no-op for persistent append.

## File export service increment (PR #11)\n- Family adapters now expose typed FileExportService. Native desktop/mobile routes through existing Rust `export_file`; browser fallback downloads a generated JSON file.\n- `src/backup.ts` now delegates export to the runtime service instead of directly invoking Rust.\n- No data format changes or migration. No build/typecheck/CI/device verification performed.\n\n## File export service increment (PR #11)\n- Family adapters now expose typed FileExportService. Native desktop/mobile routes through existing Rust `export_file`; browser fallback downloads a generated JSON file.\n- `src/backup.ts` now delegates export to the runtime service instead of directly invoking Rust.\n- No data format changes or migration. No build/typecheck/CI/device verification performed.\n\n## Current increment
Storage resolver definition and registration were confirmed in Rust; this checkpoint added the typed logging service and routed frontend Full persistence through it. No migration or destructive data operation has occurred.

## Next
1. Verify Rust resolver definition and command registration (search the entire Rust file and invoke handler).
2. Confirm command availability under release vs debug-diag cfg.
3. Design typed LoggingService contract and adapters, then migrate `src/log.ts` only while preserving Lite/Full semantics.
4. Later route dump export through secondary accessible location/document picker.

## Verification
No build, typecheck, CI, or device verification confirmed. Do not merge without explicit approval.
