# Domain model boundaries

## M4.1 — Model mapping inventory

| Feature | Transport/input | Persistence | Application and view |
|---|---|---|---|
| Creator index | `CreatorIndexDto` from `GET /creators` | `toCreatorIndexRows` builds `CreatorRow`; `db.ts` encodes/decodes the pack and can read legacy per-row records. | Creator use cases return search rows and a derived direct-post link. `CreatorsPage` selects display ordering and visible results. The separate profile endpoint still returns `PawCreator`. |
| Post detail | The hash route supplies service, creator ID and post ID. API responses use `PawPost`, `PawRevision` and `PawComment` as declared in `src/types.ts`. | Request cache, plus a session-storage navigation record. Post bodies are not persisted by this slice. | The detail use case validates identifiers, combines the post with ordered revisions, and preserves a separate revision failure. Comments follow after the post. The screen selects the displayed revision and constructs media presentation. |
| Posts in Home and Creator | `PawPost[]` from list endpoints. | Request cache. | The paging use case returns rows and completion. React owns appending, filtering and scroll. |
| Locale | Platform locale inventories and selected JSON files. | Private/shared files behind the locale repository. | Import outcomes are typed; i18n validates and overlays dictionaries, and Settings owns UI messages and active language. |
| Favorites and backup | Account favorite response or imported backup JSON. | Local follow/settings mirrors and IndexedDB `SeenEntry`; backup has an explicit format/version. | The Favorites screen assembles UI state. Import validation and storage ordering live in `backup.ts`. |

The initial domain rule is the validity of a post identity used by detail loading and the revisions API. Their rules are identical. Hash parsing also checks route shape and intentionally retains its existing syntax-only acceptance. Wire records, DB codecs and view state are left with their current owners.
