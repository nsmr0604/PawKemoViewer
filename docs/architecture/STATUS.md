# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12). M0 `7a6e898`, M1 `3565050`, M2 `24ea538`, M3 `e4a0726`, M4 `11592a4`.
- **M6 complete.** See [adaptive presentation](adaptive-ui.md).
  - M6.1 `b680aa4`: documented layout resolution and shared presentation ownership.
  - M6.2 `7ce5e0d`: separated the shared shell, desktop rail and mobile navigation. Route and lifecycle logic remain in App.
  - M6.3 `1fb0acd`: adapted Home search and view controls while retaining a single mounted screen.
  - M6.4: recorded the interaction matrix and added a reproducible Playwright/Chromium smoke test.
- Files touched: `src/App.tsx`, `src/components/{AppShell,BottomNavigation,NavigationRail}.tsx`, `src/components/navigation-items.ts`, `src/pages/Home.tsx`, `src/styles.css`, `tests/ui_layout_smoke.py`, and `docs/architecture/{README,TASKS,STATUS,adaptive-ui}.md`.
- Validation: domain, application and platform suites passed (27 tests total), as did normal/debug builds and the Chromium UI matrix. Chromium exercised the 768 px desktop breakpoint, focus retention, explicit layout switches, touch at 320 px, query wrapping and simulated native Back/exit. Real WebViews, device insets and physical gestures remain unverified.
- **M5.1 complete. M5.2–M5.5 still depend on native validation.** The storage handoff at `2b177a0` records the Android SDK 35 compile and five JVM flag tests and the unbuilt iOS prototype. See [OS storage and native acceptance checks](os-storage.md).
- Next ready: M7.1 dependency-boundary enforcement. M7.2 and M7.3 depend on the remaining native validation and milestone evidence.
