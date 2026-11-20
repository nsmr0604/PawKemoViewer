# Platform Foundation — Interim Handoff (2026-11-20, CI trigger + storage scope)

## Progress
Stage 0 audit partial. Stage 1 runtime scaffolding and typed service contracts/family dispatch exist on PR #11.

## Current increment
- StorageLocationService / StorageArea contract distinguishes primary-private and secondary-accessible and uses purpose scopes (logs, locales, exports, backup, general).
- Android workflow: removed pull_request event trigger on this branch so commits to PR #11 will not each start an Android build. Push to main with paths filter and manual workflow_dispatch remain.
- No runtime or data migration in this increment.

## Storage policy
- Primary: app private/sandbox storage.
- Secondary: user-accessible area resolved using native platform APIs; Android scoped storage and iOS Files constraints respected.
- Normal logs in primary, log dump explicitly exported to secondary.
- Locale loading primary first then secondary overlay; secondary failure must not break startup.
- Avoid hardcoded paths and destructive migrations.

## Resolver increment (unverified)
- Added an additive `resolve_storage_location` Tauri command: primary-private uses app-data directory; desktop secondary uses OS document directory; purpose-scoped folders are created.
- Android/iOS secondary currently returns `None` pending native sharing/document API integration. This deliberately does not equate sandbox paths with user-accessible storage.
- Existing consumers are not yet migrated to the resolver; command is not yet wired into frontend runtime services.
- No Rust/frontend build or device verification performed.

## Frontend family wiring increment
- Desktop and Mobile family adapters now expose `StorageLocationService` and call the Rust resolver through Tauri `invoke`.
- Mobile adapter intentionally refuses secondary-accessible requests and returns `null`; primary-private requests use the Rust command.
- Resolver failures are handled as `null` with a warning, keeping consumers responsible for fallback.
- Consumer migration is still pending. No build/typecheck/device verification performed.

## Limitations
- Native location resolution not implemented.
- Desktop/Mobile adapters now expose scoped resolver (mobile secondary unavailable); Web adapter currently localStorage/Clipboard.
- Consumer migration pending.
- No CI/build/typecheck/device verification confirmed. With pull_request trigger disabled, PR builds must be manually dispatched or wait for main push.

## Next
1. Inspect native directory APIs and permissions before implementing Rust resolver.
2. Introduce safe native path/document API and centralized family routing.
3. Migrate locale overlay/export and log dump incrementally.

## PR
#11 draft/open, branch `refactor/platform-foundation-phase1`, not merged.
