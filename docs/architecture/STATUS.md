# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12).
- **M0 complete. M1.1 ready.** The [inventory](inventory.md) records entrypoints (M0.1, `cdf0411`), platform services (M0.2, `89dca95`), feature/data dependencies (M0.3, `2363080`) and the validation baseline (M0.4).
- Milestone files: `inventory.md`, `README.md`, `TASKS.md`, `STATUS.md`. The milestone changes documentation only.
- Validation: `npm ci`, `npm run build`, `npm run build:debug`, Linux `cargo check` with and without `debug-diag`, and Chromium home/settings/back smoke check passed. See M0.4 for exact commands, warnings and untested targets.
- Open risks: raw Web Storage fallbacks have a different method shape from the adapter contract. Native GUI/IPC and device behavior remain unverified. Android workflow has no pull-request trigger in this baseline.
- Next task: M1.1. Use the existing transport and IndexedDB call sites to define the smallest typed replacements for the unused `database` and `network` slots.
