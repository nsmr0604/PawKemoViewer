# Project Status & Roadmap

> 2026-11-20 checkpoint. See `docs/PLATFORM_PROGRESS_2026-11-20.md`.

## PR #11 platform refactor
- Contract/runtime/family scaffold and Web localStorage/clipboard adapter are present.
- Desktop/Mobile invoke storage resolver; Rust command is implemented and registered. Desktop secondary path currently resolves Documents; mobile secondary remains unavailable.
- Mobile secondary-accessible resolution is deliberately unavailable.
- `LoggingService` typed contract and family adapters are wired; `src/log.ts` uses injected service for Full persistence, preserving Lite error-only and Full all-level ring behavior.
- Android workflow confirmed to have no pull_request trigger; filtered main pushes and manual workflow dispatch remain.
- No data migration/deletion, and no verified build/typecheck/CI/device tests.
- PR remains draft/open/unmerged.

## Progress update\n- FileExportService wired in Desktop/Mobile/Web adapters; backup export consumer migrated. Native uses existing Rust export command and web creates a download.\n- No build or device validation; no data migrations.\n\n## Progress update\n- FileExportService wired in Desktop/Mobile/Web adapters; backup export consumer migrated. Native uses existing Rust export command and web creates a download.\n- No build or device validation; no data migrations.\n\n## Progress update\n- LocaleService abstraction now isolates native locale enumeration from i18n consumer; Web adapter safely returns no external files. Locale overlay and accessible secondary storage remain unfinished.\n\n## Next steps
Continue log-dump export, locale overlay and secondary accessible exports; mobile accessible sharing remains outstanding. File picker/share UI is not implemented yet. File picker/share UI is not implemented yet.
