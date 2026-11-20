# Project Status & Roadmap

> 最終更新: 2026-11-20
> 最新のPlatform Foundation引き継ぎ: `docs/PLATFORM_PROGRESS_2026-11-20.md`

## Platform Foundation (PR #11)
- Stage 0 audit partial; Stage 1 typed contracts/runtime/family dispatch established.
- Storage location contract distinguishes primary-private and secondary-accessible, purpose-scoped resolution (logs/locales/exports/backup/general). Adapter resolution; no hardcoded OS paths.
- Contract-only: native resolver and consumers not yet wired; current app_data_dir behavior unchanged, no data migration/deletion.
- Web adapter localStorage/Clipboard; Desktop/Mobile native factories not yet wired.
- CI change: Android workflow pull_request trigger removed on this branch to prevent per-commit builds. Main pushes (paths filtered) and explicit workflow_dispatch remain. PR code changes will not be auto-validated until manual dispatch or merge to main.
- No CI, typecheck, build, or device verification confirmed.
- PR #11 draft/open/unmerged; do not merge absent explicit authorization.

## Next
1. Validate workflow trigger change.
2. Complete native storage resolution design and capability validation.
3. Route logs/locales/export incrementally, with compatibility and verification.
