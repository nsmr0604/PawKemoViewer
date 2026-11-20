# Project Status & Roadmap

> PR #11 platform foundation checkpoint: 2026-11-20. See progress document for chronological details.

## Platform refactor (PR #11)
- Runtime and family adapters (Desktop/Mobile/Web) are scaffolded.
- Typed LoggingService, StorageLocationService, FileExportService and LocaleService are present.
- Backup export consumer uses FileExportService.
- Locale enumeration uses LocaleService; locale loading/overlay still uses private app-data directory only.
- Rust storage resolver: private app-data locations; desktop secondary Documents location. Mobile secondary accessible location remains unavailable.
- Web fallback includes localStorage, clipboard, download export; external locale enumeration is no-op.
- Android workflow does not run for each PR commit; main path-filtered pushes and manual dispatch remain.
- PR is open, draft, and unmerged. Do not merge without explicit authorization.
- No build/typecheck/CI/device verification has been confirmed for this work. No destructive migration.

## Next
1. Implement user-accessible secondary storage/export picker on Android and iOS.
2. Locale private-primary plus accessible-secondary overlay/import, without replacing private primary.
3. Route log dump export through FileExportService.
4. Continue migrating feature consumers to runtime contracts.
5. Batch validation; avoid per-commit Android build runs.
