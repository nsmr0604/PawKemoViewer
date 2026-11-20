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

## Limitations
- Native location resolution not implemented.
- Desktop/Mobile family factories empty; Web adapter currently localStorage/Clipboard.
- Consumer migration pending.
- No CI/build/typecheck/device verification confirmed. With pull_request trigger disabled, PR builds must be manually dispatched or wait for main push.

## Next
1. Inspect native directory APIs and permissions before implementing Rust resolver.
2. Introduce safe native path/document API and centralized family routing.
3. Migrate locale overlay/export and log dump incrementally.

## PR
#11 draft/open, branch `refactor/platform-foundation-phase1`, not merged.
