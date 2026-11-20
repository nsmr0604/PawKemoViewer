# Project Status & Roadmap

> 最終更新: 2026-11-20
> 引き継ぎ: `docs/PLATFORM_PROGRESS_2026-11-20.md`

## Platform Foundation (PR #11)
- Stage 0 audit partial; Stage 1 typed contracts/runtime/family dispatch scaffold.
- Web adapter implements localStorage and Clipboard.
- Desktop/Mobile factories call a Tauri `resolve_storage_location` command via invoke, but actual Rust command implementation/registration is not verified at current inspected branch head; treat as transitional and potentially failing.
- Mobile secondary-accessible requests are blocked in frontend adapter.
- Existing consumers are not migrated; no data migration/deletion.
- Log ring-buffer and Lite/Full policies remain in existing `src/log.ts`; persistence/export not yet migrated.
- Earlier notes claiming resolver command implementation are reconciled as unverified: inspected Rust source and indexed search did not confirm it.
- Android PR per-commit builds are intended to be disabled via removal of workflow pull_request trigger, but workflow file was not re-inspected during this checkpoint.
- No build, typecheck, CI, or device verification confirmed.
- PR #11 draft/open/unmerged; do not merge absent explicit authorization.

## Next
1. Inspect command implementation/registration, workflow, and existing locale/export APIs.
2. Define logging service migration carefully preserving Lite/Full behavior.
3. Implement and verify platform storage/document adapters, then migrate consumers incrementally.
