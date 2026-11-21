# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12). M0 `7a6e898`, M1 `3565050`, M2 `24ea538`, M3 `e4a0726`.
- **M4 complete. M5.1 ready.** See [domain model boundaries](domain.md).
  - M4.1 `81a44cf`: inventoried transport, persistence, application and view models.
  - M4.2 `f924191`: shared the pure post identity predicate between post detail, the revisions API gate and the post page.
  - M4.3 `2febbeb`: documented domain conventions and exposed a stable validation error code at the existing rejection points.
  - M4.4: isolated compilation and transitive source dependency check using only the ES2022 library.
- Files touched: `src/domain/post-identity.ts`, `src/{api.ts,application/post-detail.ts,pages/PostPage.tsx}`, `tests/{domain,application,platform}.test.mjs`, `package.json`, and `docs/architecture/{README,TASKS,STATUS,domain}.md`.
- Validation: `npm run test:domain` (3 passed), `npm run test:application` (10 passed), `npm run test:platform` (14 passed), `npm run build`, `npm run build:debug`, and `git diff --check`. Chromium with fixture IPC exercised an invalid post route and a valid post with revision 404, plus Home, creator profile and warm index reload. The platform test also verifies invalid input never reaches IPC and valid revision paths retain percent encoding.
- Open: native IPC, live API and physical devices were not exercised. The existing Vite mixed-import warning for `db.ts` persists.
- Next: M5.1 map private/shared storage, permission grants and file selection by OS using the M1 capability design. M6.1 is also ready.
