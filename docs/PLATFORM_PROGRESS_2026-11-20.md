# Platform Foundation — Interim Handoff (2026-11-20, Stage 1 contracts/family adapters)

## Progress
Stage 0 audit is partial. Stage 1 now has contract definitions and family-specific service registration entry points.

## This increment
- Typed service contracts: key/value storage, text export, clipboard, lifecycle, permissions; existing DB/network/log/locale slots remain transitional `unknown` pending focused migration.
- Web adapter currently implements localStorage and clipboard with defensive failure handling.
- Desktop and Mobile family factories exist as separate modules, deliberately empty while Native adapters are not wired.
- Runtime dispatch selects family factories centrally. Family selection: Tauri mobile -> mobile; Tauri desktop -> desktop; non-Tauri -> web.
- Runtime initializes before UI mount (previous commit).

## Files in this increment
`src/platform/contracts.ts`, `src/platform/families/web.ts`, `desktop.ts`, `mobile.ts`, `families/index.ts`, `src/platform/runtime.ts`, `src/platform/index.ts`.

## Limitations / risks
- Web fallback only: localStorage and browser Clipboard; the same web adapter currently applies to non-native browser.
- Native family service objects intentionally empty; native integrations are not implemented yet.
- Existing app consumers still use their original code paths. No service migration is complete.
- This service API currently provides contracts/registration scaffolding only, not platform-specific permission/path guarantees.
- No CI, build, typecheck or native device tests have been verified.

## Next steps
1. Test compile and runtime assumptions via CI.
2. Implement Native storage/file export adapters with explicit scoped paths and OS-specific constraints, avoiding breaking migration.
3. Begin migration of settings/localStorage consumers only after adapter compatibility and preservation tests.
4. Continue audit for direct native and browser service use.
5. Update dated handoff and project status at each checkpoint.

## PR
PR #11 draft/open, branch `refactor/platform-foundation-phase1`. No merge authorization received.
