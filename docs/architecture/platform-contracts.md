# Platform contract semantics

## Request and persistence boundaries

- `network` is an optional `PawchiveApiTransport` on native desktop/mobile. The input mirrors the Rust command arguments and the result is the raw response string. Tauri failures propagate to `api.ts`, which continues to wrap them in `ApiError` and preserve status recovery. A web runtime has no native transport. It reports the missing capability through the same API error boundary.
- Cache, request deduplication, scheduling, session snapshotting and response decoding stay in `api.ts`. Login, icon IO and media keep their existing separate paths.
- `indexedDatabase` is the typed database opening boundary. Its clients retain their schema, transactions and caching. The unused generic database slot is removed.

## Capability and failure rules

An optional service or method is absent when the adapter cannot provide the operation. A registered service can still fail at call time. Check optional methods for capabilities such as secondary locale storage. Keep the existing platform behavior until the consumer is migrated.

| Surface | Absence and failure |
|---|---|
| Key/value and session storage | An inaccessible browser storage getter means the service is unavailable. Use the typed service, since a raw Web Storage object has a different API. Settings, scroll and tab preferences can fall back to their default or in-memory state in the consumer. Follow writes and restores require storage and must surface a failure when data cannot be persisted. |
| IndexedDB | `open` rejects when unavailable or blocked and propagates request errors. It does not report a database handle on failure. |
| Network and file export | A failed operation rejects. File export keeps the existing returned path or filename. File picker cancellation will need an explicit result when a picker is introduced. |
| Clipboard | Reads return null and writes return false for unavailable/denied access. No clipboard permission probe is required. |
| Locale and storage locations | Listing or resolving may return null when unavailable or on probe failure. Native mutations reject on failure. Web locale write rejects and web deletion returns false. |
| Lifecycle and diagnostics | Desktop lifecycle is absent. The web adapter has a no-op back listener and rejects exit. Mobile unregisters the listener on cleanup, including when registration finishes late. Diagnostics remain build-gated. |

These contracts do not infer SAF or iOS Files support from a user agent or a path. A separate feasibility check is required for the selected-file workflows in M5.
