# Architecture Refactor Task Breakdown

Status legend: `TODO`, `BLOCKED`, `IN_PROGRESS`, `DONE`. No task is considered done without evidence recorded.
Each task is intended as a small independent agent context. Read AGENT_WORKFLOW.md before execution.

## M0 — Inventory
- [x] **M0.1** Inventory app entrypoints and dependency map. Deliver `docs/architecture/inventory.md`. No code changes. Dependencies: none.
- [x] **M0.2** Inventory PlatformRuntime bootstrap, contract fields, adapter coverage and consumers. Deliver contract matrix in inventory. Depends: M0.1.
- [x] **M0.3** Map feature-to-API/DB/cache/platform direct accesses. Include file and symbols. Depends: M0.1.
- [x] **M0.4** Establish validation baseline and test gaps. Report checks actually run, not assumed. Depends: M0.1-M0.3.

## M1 — Platform contracts
- [x] **M1.1** Design typed replacements for `database?: unknown` and `network?: unknown`; implementation only for clearly scoped consumers. Depends: M0.2,M0.3.
- [x] **M1.2** Define service capability/unsupported/error semantics (design doc). Depends: M1.1.
- [x] **M1.3** Identify/factor common adapter code without altering behavior. Tests first; scope small. Depends: M0.2.
- [x] **M1.4** Add contract tests for adapter behavior and runtime initialization edge cases. Depends: M1.1-M1.3.

## M2 — Use cases
- [x] **M2.1** Establish Application use-case naming, error, result and cancellation conventions. Deliver design doc. Depends: M0.3.
- [x] **M2.2** Introduce composition root and dependency wiring, without changing workflows. Depends: M1.1,M2.1.
- [x] **M2.3** Migrate a low-risk slice (select based on inventory; default locale CRUD or favorites) to a Use Case. Depends: M2.2.
- [x] **M2.4** Migrate post-detail workflow to Use Case with behavior preservation. Depends: M2.3.
- [x] **M2.5** Migrate home-post workflow. Depends: M2.4.
- [x] **M2.6** Migrate creator listing/profile workflow. Depends: M2.4; can parallelize with M2.5 only if no shared-file conflicts.

## M3 — Repositories / infrastructure
- [x] **M3.1** Repository contract design for one migrated slice. Depends: M2.3.
- [x] **M3.2** Implement repository and move data-source details for that slice. Depends: M3.1.
- [x] **M3.3** Inventory DB ownership and transactions; design schema/transaction boundary. Depends: M0.3.
- [x] **M3.4** Separate transport DTO normalization from domain/presentation types for one API path. Depends: M3.1.
- [x] **M3.5** Cache/scheduler contract review and tests (no policy changes without separate task). Depends: M0.3,M3.1.
- [x] **M3.6** Expand repository migration to other slices, one task per feature. Depends: M3.2-M3.5.

## M4 — Domain
- [x] **M4.1** Model/DTO/DB/view model mapping inventory. Depends: M3.4.
- [x] **M4.2** Extract one pure domain rule and tests. Depends: M4.1.
- [x] **M4.3** Define domain error and policy conventions; migrate only justified cases. Depends: M4.2.
- [x] **M4.4** Verify domain dependency isolation. Depends: M4.2,M4.3.

## M5 — OS storage and capabilities
- [x] **M5.1** Document storage capability matrix (private/shared, permissions, persistable grant, file picker) per OS. Depends: M1.2.
- [ ] **M5.2** Android SAF feasibility prototype and permission/grant tests. Depends: M5.1. **BLOCKED on device/provider validation.** SDK compile and flag-mask checks passed.
- [ ] **M5.3** iOS Files/document picker feasibility prototype. Depends: M5.1. **BLOCKED on macOS/Xcode build and Files validation.**
- [ ] **M5.4** Implement shared storage adapters on the validated platform(s), task per OS. Depends: M5.2,M5.3.
- [ ] **M5.5** Locale secondary overlay/import/export, validation and conflict semantics. Depends: M5.4.

## M6 — UI shells
- [ ] **M6.1** Decide adaptive UI strategy and capabilities. Design-only. Depends: M2.2.
- [ ] **M6.2** Split desktop/mobile shell/navigation with no workflow changes. Depends: M6.1.
- [ ] **M6.3** Migrate screen to adaptive presentation, one screen per task. Depends: M2.3,M6.2.
- [ ] **M6.4** Layout and interaction test matrix. Depends: M6.2,M6.3.

## M7 — Stabilization
- [ ] **M7.1** Add dependency-boundary enforcement. Depends: M2-M4.
- [ ] **M7.2** Run platform validation matrix and record gaps. Depends: M1-M6.
- [ ] **M7.3** Prepare release-readiness/debt report. Depends: M7.2.

## Agent task completion template
- Task ID and title
- Files changed
- Dependency assumptions
- Behavior impact / migration notes
- Tests and checks run (include exact commands/results)
- Known limitations / follow-up task IDs
- Update this checklist and `docs/architecture/STATUS.md` in the same task if status changes
