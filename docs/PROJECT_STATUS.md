# Project Status & Roadmap

> 最終更新: 2026-11-20  
> Platform Foundation の進捗引き継ぎ。詳細は `docs/PLATFORM_PROGRESS_2026-11-20.md`。

## Platform Foundation (PR #11)
- Stage 0 audit partial; Stage 1 contracts/runtime/family dispatch established.
- Storage location contract now distinguishes `primary-private` and `secondary-accessible`, with purposes `logs/locales/exports/backup/general`. Locations are adapter-resolved, not OS-specific hardcoded strings.
- This contract is not implemented by native adapters yet. Existing Tauri app_data_dir behavior is preserved; no migration or deletion.
- Web adapter provides localStorage and clipboard only; desktop/mobile adapter factories remain empty.
- Next: implement OS-aware location resolver and safe secondary-accessible semantics; then locale overlay and user-requested exports.
- PR #11 remains draft/open/unmerged. Do not merge without explicit authorization.
- No build, CI, or device verification has been confirmed for these architecture changes.
