# Stabilization and release evidence

## M7.1 — Import boundaries

`npm run check:boundaries` uses the project's TypeScript configuration and module resolver. Normal and diagnostic frontend builds run it before type checking. The check covers static imports, re-exports, explicit import-type references and literal dynamic imports recognized by TypeScript.

- The domain imports only domain modules. Its separate isolation test type-checks against the ES2022 library without DOM or ambient runtime packages.
- Application use cases can import peer use cases, domain rules and the shared `types.ts` model. The composition root is the explicit wiring point for infrastructure, platform services and legacy modules; use cases do not import it.
- Infrastructure may import application repository contracts, and presentation may use the composition root. Presentation cannot import infrastructure directly. Platform adapters cannot import application or infrastructure.
- Existing cross-layer calls through legacy root modules are outside this scoped rule. This is an import check, with computed module paths and runtime effects outside its coverage.

The checker passed on the project. A temporary page containing a literal dynamic import of the creator infrastructure repository failed with the offending source and resolved target as expected. Both builds run the same check.
