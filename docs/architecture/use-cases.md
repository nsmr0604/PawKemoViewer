# Application use cases

## M2.1 — Conventions

- Name workflows with a verb and the feature it acts on, such as `loadPostDetail` or `importLocaleFiles`. Inject only the operations the workflow needs. The composition root binds those operations to the current API, persistence and platform modules.
- Use named inputs for related identifiers and typed results for expected outcomes. Let operational failures reject with the original error when the caller already handles it. Keep translation, confirmation prompts, React state and display policy in the screen.
- Represent expected partial results explicitly. For example, a missing revision history is an empty list, a different revision failure can accompany a valid post, and locale import reports a reason for each skipped input.
- Keep response ordering under the screen's control. Before committing a result, check that its route/request is still current. A workflow that may persist after an await can receive an AbortSignal and check it before starting a subsequent write. This is cooperative cancellation. It does not cancel native requests already sent or writes already started.
- Preserve API cache/scheduler policy and IndexedDB schema. Tests inject operations and assert data, sequencing, partial results and cancellation without live API calls.

## Scope

Settings locale CRUD is the first slice. Post detail loading, home paging and creator paging/index workflows follow. React retains subscriptions, loading indicators, scroll, navigation and the rendering state. Existing media URL, login, favorite and flag paths keep their separate responsibilities.

## M2 implementation

| Slice | Application behavior | Presentation behavior |
|---|---|---|
| Locales | Trim and validate a locale code, validate a dictionary, snapshot selected files before the input resets, enforce the 1 MiB import limit, and report per-file results. Private and secondary writes stay separate. | Confirm deletion, display messages, refresh available locales and reapply the active locale. |
| Post detail | Validate the route, fetch the post followed by revisions, order revisions and preserve the 404/no-history outcome. Comments load separately after the post is available. | Reset state on navigation and ignore stale results. Keep lightbox, favorite/flag interactions and media presentation in the screen. |
| Home and creator posts | Keep the API query/offset/tag arguments and compute whether a page ends the list. | Retain paging, filter/scroll state, retry and response sequence guards. |
| Creator index and profile | Keep cached search, direct post links, legacy migration without a download when possible, and refresh order. The composition root also binds profile, tag and origin URL reads. | Show cached rows while checking the index, confirm manual refresh and render the profile. Abort stale rebuild work before beginning a new write. |

The entrypoint initializes platform services, then constructs the use cases, reloads settings and locales, and mounts React. The use cases receive current backend functions in the composition root. Existing API and persistence modules remain the implementations for M3 to review. Run `npm run test:application` for the workflow tests.
