# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12). [M0 inventory and validation baseline](inventory.md) complete at `7a6e898`.
- **M1 complete. M2.1 ready.**
  - M1.1 (`0269166`): moved the Pawchive API command behind a typed native transport and removed the unused generic database slot. The IndexedDB opener remains the persistence boundary.
  - M1.2 (`e65f61b`): documented capability and failure behavior. See [platform contracts](platform-contracts.md).
  - M1.3 (`680122e`): consolidated Web Storage, IndexedDB and Clipboard adapters. Ran the initial adapter tests before and after the extraction.
  - M1.4: added contract tests for startup, capability gaps, IPC arguments, native listener cleanup, GET coalescing, native status propagation and unavailable storage. Core storage consumers use the typed adapters. Backup restore checks for missing follow storage before altering read state.
- Files touched: `src/platform/contracts.ts`, `src/platform/families/{browser,desktop,mobile,native,web}.ts`, `src/{api,backup,follows,history,hooks}.ts`, `src/components/FollowButton.tsx`, `src/pages/Favorites.tsx`, `tests/platform.test.mjs`, `package.json`, and `docs/architecture/{README,STATUS,TASKS,platform-contracts}.md`.
- Validation: `npm run test:platform` (10 passed), `npm run build`, and `npm run build:debug`. Linux `cargo check --locked --offline --manifest-path src-tauri/Cargo.toml -j 4` passed with existing login warnings. It also passed with `--features debug-diag`. Headless Chromium confirmed browser startup, settings persistence, settings route and Back on the Vite dev server.
- Remaining checks: mock IPC tests verify JavaScript command wiring. Native WebView/IPC, API connectivity and physical-device testing remain open.
- Next task: M2.1 use-case naming, errors, results and cancellation conventions. M2.2 composition depends on M2.1. M5.1 is also ready from the storage capability design.
