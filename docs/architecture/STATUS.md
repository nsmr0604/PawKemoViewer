# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12).
- M0.1 complete (`cdf0411`). M0.2 complete. The [inventory](inventory.md) maps runtime bootstrap, optional contracts, registered adapters and consumers.
- Validation: cross-checked `src/main.tsx`, `src/platform/{runtime,contracts}.ts`, all three family factories and service reads in `src/`.
- Files changed: `inventory.md`, `TASKS.md`, `STATUS.md`.
- Next ready: M0.3 feature/data inventory, then M0.4 validation baseline. M1.1 also depends on M0.3.
