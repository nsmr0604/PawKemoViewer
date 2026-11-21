# Application use cases

## M2.1 — Conventions

- Name workflows with a verb and the feature it acts on, such as `loadPostDetail` or `importLocaleFiles`. Inject only the operations the workflow needs. The composition root binds those operations to the current API, persistence and platform modules.
- Use named inputs for related identifiers and typed results for expected outcomes. Let operational failures reject with the original error when the caller already handles it. Keep translation, confirmation prompts, React state and display policy in the screen.
- Represent expected partial results explicitly. For example, a missing revision history is an empty list, a different revision failure can accompany a valid post, and locale import reports a reason for each skipped input.
- Keep response ordering under the screen's control. Before committing a result, check that its route/request is still current. A workflow that may persist after an await can receive an AbortSignal and check it before starting a subsequent write. This is cooperative cancellation. It does not cancel native requests already sent or writes already started.
- Preserve API cache/scheduler policy and IndexedDB schema. Tests inject operations and assert data, sequencing, partial results and cancellation without live API calls.

## Scope

Settings locale CRUD is the first slice. Post detail loading, home paging and creator paging/index workflows follow. React retains subscriptions, loading indicators, scroll, navigation and the rendering state. Existing media URL, login, favorite and flag paths keep their separate responsibilities.
