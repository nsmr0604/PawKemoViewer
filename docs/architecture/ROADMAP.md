# Layered Architecture Refactor Roadmap

> Status: proposal, derived from experimental platform separation in branch `0.5.0`. This document defines work; it does not claim tasks are implemented.
> Baseline: branch `0.5.0`. Preserve React + Tauri 2 + Rust + reqwest direct API architecture.

## Goal
Evolve the existing PlatformRuntime/family adapters into a maintainable architecture with clear Presentation, Application, Domain, Infrastructure and Platform boundaries. Keep cross-platform support (Windows, macOS, Linux, Android, iOS) and preserve existing behavior. Avoid a big-bang rewrite.

## Non-negotiable constraints
- Read `AGENTS.md`, this roadmap, task list, and workflow before starting; look for handoffs.
- No Cloudflare Pages/Workers/Functions/Wrangler/reverse proxy.
- API requests to Pawchive remain direct Rust reqwest; pkv only for eligible external media URLs.
- Do not weaken scheduler, cooldown, concurrency, cache, logging or security behavior.
- Tauri v2 JS command args use camelCase.
- Keep secrets/session tokens out of code, logs, docs and commits.
- Do not merge PRs without explicit authorization. Batch CI/build validation; do not trigger build on every commit if workflows permit.
- One focused task per commit. Keep handoffs in tracked docs (notes is gitignored and not shared).

## Milestones and exit criteria

### M0 — Baseline inventory & architecture guardrails
**Purpose:** establish evidence and dependency baseline before moving code.
- M0.1 inventory entrypoints, feature consumers, API/database/cache dependencies and direct platform calls.
- M0.2 document PlatformRuntime bootstrapping, service contract usage and missing/optional services.
- M0.3 record baseline checks and platform behavior matrix; tests only where existing scripts permit.
Exit: inventory is reviewed, risks and boundaries documented, no runtime behavior changes.

### M1 — Platform contract consolidation
**Purpose:** mature 0.5.0 experimental contract without breaking consumers.
- M1.1 replace `unknown` service slots with explicit interfaces (only when concrete contracts are understood).
- M1.2 factor truly shared adapter implementations; retain family-specific overrides.
- M1.3 define service availability/capability and unsupported-operation semantics.
- M1.4 verify bootstrap ordering, uninitialized runtime handling, and adapter contract tests.
Exit: contract types explicit; adapters tested; no regression in existing service consumers.

### M2 — Application composition and Use Case boundary
**Purpose:** decouple UI from operational workflows.
- M2.1 add composition root/factory for wiring repositories and services.
- M2.2 define use-case conventions (input/output, errors, cancellation, loading policy).
- M2.3 migrate one low-risk vertical slice (recommended: favorites or locale CRUD) end-to-end.
- M2.4 migrate post detail loading; keep API/cache behavior intact.
- M2.5 migrate home/creator list workflows incrementally.
Exit: selected screens call application use cases; workflow logic not embedded in UI; tests cover use cases.

### M3 — Repository and Infrastructure boundaries
**Purpose:** isolate data sources, persistence and transport.
- M3.1 define repository interfaces for posts, creators, favorites/follows, settings as evidence dictates.
- M3.2 move repository implementations into infrastructure; API transport and DTO normalization remain distinct.
- M3.3 separate DB schema/transaction primitives from repository policy.
- M3.4 formalize cache and scheduler interaction contracts; avoid duplicated policy.
- M3.5 migrate remaining consumers in small slices.
Exit: feature consumers no direct transport/storage access for migrated areas; regression checks pass.

### M4 — Domain rules and model ownership
**Purpose:** establish stable app-level rules without unnecessary abstraction.
- M4.1 map DTO, persistence, domain and view models; document conversions.
- M4.2 extract only validated business rules/policies from features.
- M4.3 define repository contracts and domain error vocabulary.
- M4.4 test pure rules independently.
Exit: domain layer has no React/Tauri/IndexedDB/network dependency; migration scope justified.

### M5 — Platform capability expansion and storage
**Purpose:** address platform-specific access consistently.
- M5.1 capability matrix for private/shared storage, file picker, permission, lifecycle.
- M5.2 Android SAF and iOS Files picker research/prototype with grant lifecycle/cancellation/error cases.
- M5.3 implement shared-secondary access only after platform feasibility and security review.
- M5.4 locale private-primary + secondary overlay/import/export behavior and validation.
Exit: access is least-privilege, OS-specific behavior documented and tested; no assumptions of unrestricted filesystem access.

### M6 — Presentation split and adaptive UI
**Purpose:** allow desktop/mobile UI divergence without duplicating business workflows.
- M6.1 define presentation capability/layout selection strategy.
- M6.2 separate desktop shell/navigation and mobile shell/navigation.
- M6.3 migrate one screen at a time to shared use cases and screen-specific presentation.
- M6.4 validate narrow screens, keyboard/mouse, touch, back navigation, window resize.
Exit: shared workflow logic; platform/family UI can differ; layout regression checks documented.

### M7 — Validation, dependency rules and stabilization
**Purpose:** prevent architecture erosion.
- M7.1 add automated dependency-boundary checks if feasible.
- M7.2 test matrix (Windows/macOS/Linux/Android/iOS plus browser fallback as supported).
- M7.3 batch typecheck, tests, Rust check, build and device verification; record unavailable checks.
- M7.4 document release readiness and remaining debt.
Exit: validations reported honestly; no merge or release without authorization.

## Sequencing
M0 -> M1 -> M2 -> M3 -> M4. M5 can proceed in parallel after M1 contract/capability design, but platform implementation depends on feasibility. M6 begins after M2 and proceeds screen-by-screen; M7 runs as final stabilization and periodically at milestone boundaries.

## Scope control
Each task should normally fit one agent context and one commit. If task touches >5 unrelated files, split it. Avoid mass renames and parallel edits to shared contracts. Task dependencies are listed in TASKS.md. The task list is the source of truth for actionable work; update status and handoff when work changes.
