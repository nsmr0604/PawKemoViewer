# Project Status & Roadmap

> 2026-11-20 checkpoint. See `docs/PLATFORM_PROGRESS_2026-11-20.md`.

## PR #11 platform refactor
- Contract/runtime/family scaffold and Web localStorage/clipboard adapter are present.
- Desktop/Mobile invoke storage resolver; Rust command implementation/registration is not verified and may be missing.
- Mobile secondary-accessible resolution is deliberately unavailable.
- Existing log behavior remains in `src/log.ts`: ring buffer, Lite errors only, Full all levels, dynamic native persistence in Full. Consumer migration pending.
- Android workflow confirmed to have no pull_request trigger; filtered main pushes and manual workflow dispatch remain.
- No data migration/deletion, and no verified build/typecheck/CI/device tests.
- PR remains draft/open/unmerged.

## Next steps
Verify resolver registration and cfg; introduce LoggingService and migrate incrementally; then locale, backup, and secondary accessible exports.
