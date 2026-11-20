# Platform Foundation — Interim Handoff (2026-11-20, storage location contract)

## Progress
Stage 0 audit remains partial. Stage 1 runtime scaffolding and typed service contracts/family dispatch are present on PR #11.

## This increment
- Introduced `StorageLocationService` and `StorageArea` contract distinguishing primary private storage from user-accessible secondary storage, with locations resolved by adapters rather than hardcoded paths.
- Purpose scopes (`logs`, `locales`, `exports`, `backup`, `general`) let consumers request area-specific locations.
- Contract-only: native path resolution and consumers are not migrated. No data moves and no existing storage is deleted.

## Platform storage policy to implement
- Primary private area: app sandbox/private storage on each platform.
- Secondary accessible area: user-visible or app-accessible storage, resolved through platform APIs. Android scoped storage constraints apply; iOS Files-visible access is limited to supported sandbox/document APIs.
- Logs stay in primary private storage during normal operation; explicit log dumps go to secondary accessible area.
- Locale loading is primary first, then secondary overlay; secondary failures should not prevent startup.
- Do not hardcode Android external paths or claim unrestricted file-manager access.

## Existing storage
Rust currently uses Tauri app_data_dir for log files, backup, icon cache and locale file commands. This remains untouched for compatibility. The new contract is not wired to Rust.

## Limitations
- Desktop/Mobile native family adapters are still empty.
- Web adapter currently implements localStorage and Clipboard only.
- Existing app consumers remain on legacy code paths.
- No CI, typecheck, build, or device verification confirmed.

## Next
1. Verify/design native path/document access APIs and capability permissions for each OS.
2. Implement location resolver in Rust using Tauri APIs with explicit scope and no destructive migration.
3. Route log dump, locale overlay/import/export and backup incrementally.
4. Update handoff at each checkpoint.

## PR
PR #11 draft/open, branch `refactor/platform-foundation-phase1`; not merged.
