# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12).
- M0.1 (`cdf0411`), M0.2 and M0.3 complete. The [inventory](inventory.md) maps startup, adapter coverage, feature data access and direct platform calls.
- Validation: cross-checked screen imports and calls against `api.ts`, `db.ts`, `icons.ts`, `backup.ts`, `i18n.ts` and relevant Rust command registrations.
- Files changed: `inventory.md`, `TASKS.md`, `STATUS.md`.
- Next: M0.4 validation baseline. M1.1 has the M0.2/M0.3 evidence it requires.
