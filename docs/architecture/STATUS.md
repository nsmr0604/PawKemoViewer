# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12). M0 `7a6e898`, M1 `3565050`, M2 `24ea538`.
- **M3 complete. M4.1 ready.** See [repository and infrastructure design](repositories.md).
  - M3.1 `ab5bf4a`: locale repository contract and capability semantics.
  - M3.2 `d84a6a7`: bind private/shared catalogue and mutations to the platform through the locale repository.
  - M3.3 `99163a4`: inventory schema and transaction ownership. Documented the future atomic creator-pack boundary.
  - M3.4 `e3f6791`: isolate the creator index wire DTO and conversion.
  - M3.5 `610e497`: verify API scheduler, capacity, expiry, retry and session invalidation while keeping the current policy.
  - M3.6: use the creator index repository for cached search, migration and refresh.
- Files touched: `src/application/{composition,locales,creators,locale-repository,creator-index-repository}.ts`, `src/infrastructure/{locale-repository,creator-index-dto,creator-index-repository}.ts`, `src/{api,db,i18n}.ts`, `src/main.tsx`, `src/pages/{Creators,Settings}.tsx`, `tests/{application,platform}.test.mjs`, and `docs/architecture/{README,TASKS,STATUS,repositories}.md`.
- Validation: `npm run test:application` (10 passed), `npm run test:platform` (13 passed), `npm run build`, `npm run build:debug`, and `git diff --check`. Chromium with fixture Tauri IPC loaded locale listings and exercised Home, Post revision 404, Creator profile/posts, and warm reload of the creator index from real browser IndexedDB without refetching `/creators`.
- Open: native IPC, live API and physical devices were not exercised. The existing split pack/metadata transactions and cache edge cases are recorded for follow-up. No schema or scheduler policy changes were made.
- Next: M4.1 inventory DTO, persistence, domain and view model mappings. M5.1 also remains ready.
