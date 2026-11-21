# Repositories and infrastructure

## M3.1 — Locale repository

The locale repository provides private listing, writing and deletion, plus optional secondary listing and writing. It accepts validated language codes and raw JSON. A listing keeps file names and the invalid-file report needed by Settings. Keep the native deletion boolean and platform failures intact. If the platform does not supply a locale service, the repository is absent. Secondary methods are present only when supported by the platform adapter.

Application code owns form and batch validation, per-file outcomes, and catalogue composition. Infrastructure binds those operations to the current platform service. The screen continues to own confirmation, display messages and active language selection. No new database schema, file location, picker or permissions are introduced by this contract.

## M3.3 — IndexedDB ownership and transaction boundary

| Owner | Storage | Commit and compatibility behavior |
|---|---|---|
| `src/db.ts`, creator index | `pawkemoviewer` v1. Legacy per-row `creators` by `key` with a name index, and a packed index in `meta` with size, count, version and fetch time. | `saveCreators` writes the pack and each metadata field in separate transactions, then best-effort clears legacy rows. The reader prefers a pack and falls back to legacy rows. `clearCreatorCache` clears metadata and legacy rows in separate transactions. |
| `src/db.ts`, read state | `seen` in the same database, keyed by creator. | Individual writes use one store transaction. `replaceSeen` clears and replaces the full set in one transaction and resolves on completion. Backup follow/settings writes use Web Storage separately. |
| `src/db.ts`, metadata | `meta` keyed by metadata name with typed reads at the caller. | The generic single-store helper resolves after transaction completion and reports request/abort errors. Pack fields are an implementation detail of the index. |
| `src/icons.ts` | Separate `pawkemo-icons` v1 database, in-memory cache, and Rust app-local files. | Browser record IO, pruning and clearing are separate from Rust disk caching. No atomicity spans those stores. |
| Platform IndexedDB opener | Opens the requested database and calls the owner-provided schema upgrade. | Owners choose names, versions and stores, cache their open promises, and close on version change. Browser blocked/unavailable errors reject the open. |

The infrastructure boundary should own the schema, upgrade callback and transactions. Application-facing repositories receive finished values or rejected operations. They never receive an `IDBDatabase`, object store, raw metadata key, or transaction. A creator-pack replacement and its metadata belong in a single future read/write transaction over `meta`; include the legacy store in the same transaction only if clearing it becomes part of the commit promise. Until a dedicated schema/atomicity change is tested, retain the current pack format, version and legacy fallback.

Known follow-ups: readers may observe a new pack alongside old metadata after interruption, and the connection owners close on version change without resetting a resolved cached handle. A transaction refactor should cover interrupted writes, upgrade/reopen and legacy compatibility with a real IndexedDB engine. Avoid a cross-store atomicity claim for backup or icon caches.
