# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12). [M0 inventory](inventory.md) complete at `7a6e898`. [M1 platform contract consolidation](platform-contracts.md) complete at `3565050`.
- **M2 complete. M3.1 ready.** See [application use cases](use-cases.md) for the migration boundaries.
  - M2.1 `f21b1c0`: workflow naming, partial results, error propagation and cooperative cancellation.
  - M2.2 `ad83c3a`: startup composition before settings/locale initialization and UI mount.
  - M2.3 `6b6bacb`: private/shared locale writes, import results and deletion.
  - M2.4 `00020bc`: post detail, revisions and separate comment loading. Changed routes cancel follow-on work and suppress stale responses.
  - M2.5 `a85cafc`: Home page fetch and termination rule.
  - M2.6: creator index search/build/refresh, profile read wiring and tagged post paging. Legacy rows and refresh order were retained.
- Files touched: `src/main.tsx`, `src/application/{composition,locales,post-detail,post-pages,creators}.ts`, `src/pages/{Settings,PostPage,Home,Creators,CreatorPage}.tsx`, `tests/application.test.mjs`, `package.json`, and `docs/architecture/{README,TASKS,STATUS,use-cases}.md`.
- Validation: `npm run test:application` (8 passed), `npm run test:platform` (10 passed), `npm run build`, `npm run build:debug`, and `git diff --check`. Chromium with fixture Tauri IPC exercised Home, Post with revisions returning 404, Creator index, and Creator profile/post list through the running Vite app.
- Remaining checks: real native IPC, live API and device workflows are unverified. Rust and workflow files were outside this milestone. Cancellation prevents subsequent writes or stale display updates. Requests and writes already started are not terminated by the UI.
- Next task: M3.1 design a repository contract for a migrated slice. Locale CRUD is the initial candidate because its operations and existing failure semantics are already explicit. M3.3 DB ownership inventory and M5.1 platform storage capability matrix have their prerequisites.
