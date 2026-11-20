# Platform-independent foundation and adapters

## Goal

Consolidate cross-platform operations behind common interfaces while retaining platform-specific execution in adapters. Supported targets: Windows, macOS, Linux, Android and iOS. This is a migration target; this document does not claim the refactor is already implemented.

## Dependency direction

UI and domain modules -> common services/interfaces -> platform adapter contracts -> target-specific adapters. Common/domain code must not import OS APIs, Tauri plugins, platform-specific paths or native command details directly.

The existing `src/platform.ts` platform detection and layout helpers remain a compatibility entry point initially; gradually move capability and adapter selection into a platform bootstrap without duplicating platform detection.

## Common contracts

- **Storage**: Primary and optional Secondary roots; read/write/append/list/remove/create-directory, metadata and atomic-write where supported. Primary is private app storage. Secondary is user-accessible storage; capability availability and limits are surfaced, never silently assumed.
- **Logging**: shared structured events, levels, ring buffer, formatting, retention policy and routing. Native persistence sinks are adapters. Preserve Lite/Full logging scope, redaction and release feature gating. Lite API failure details remain destination + response body as currently specified; Full diagnostics remain debug-only.
- **Database**: common repository/domain operations, schema/version migration, transaction/error semantics and cache invalidation. Platform adapter owns IndexedDB/native persistence choices. Migration must preserve existing creator packs, seen state, icon cache, favorites/follows and settings; no destructive migration.
- **Cache**: common policy (TTL, keying, invalidation, size/eviction contracts) and repositories; persistence backend is adapter-owned. Existing API scheduler, request spacing, TTL and Favorites cooldown remain.
- **Networking**: common request/response model, Pawchive API client, scheduling, retry/cancellation policy, cache and error mapping. Adapter owns actual HTTP execution. Desktop/mobile should share policy and reqwest semantics. Keep direct Rust reqwest; do not add Cloudflare or external reverse-proxy infrastructure.
- **PKV proxy**: common target allowlist, canonical Referer/UA policy, validation and error contracts; platform executor routes through native adapter. Pawchive hosts remain direct and never use PKV. Preserve SSRF protections and sensitive-data log redaction.
- **Permissions and capability**: common capability state / request / result types. Android SAF/scoped storage, iOS sandbox/security-scoped access, and desktop paths/dialogs are adapter implementations; avoid raw path assumptions on mobile.
- **Export/import and file sharing**: common archive/JSON validation, export generation and restore policy. Adapters implement destination/save/share presentation.
- **Clipboard and external navigation**: common interface and safe error semantics; adapter performs platform operations.
- **App environment/config**: common configuration contracts, adapter supplies platform paths, OS version/capabilities and app lifecycle hooks.

## Primary/Secondary semantics

Primary is required and app-private: language resources, ordinary logs, internal state and databases/cache according to their existing ownership. Secondary is optional, user-accessible: user exports/log dumps and supplemental language JSON. Language loading order is Primary then Secondary, with Secondary overriding duplicate keys. A missing/unavailable Secondary must not prevent app startup.

Android Secondary candidate: app-specific external storage under `Android/data/<package>/files/`, with `languages/` and `exports/`; use platform APIs to resolve, not hard-coded absolute paths. iOS Secondary must be exposed to Files through a supported app container/document mechanism; access is capability-based and can be unavailable. Desktop Secondary is a user-accessible app folder.

Language JSON import UI is developer-build-only; release UI must hide it, but loading externally stored supplemental language files remains enabled in release. Validated imports are saved to Secondary.

## Migration plan (incremental, not one breaking rewrite)

1. Inventory direct platform/IO/native/database/network imports and document callsites, tests and invariants.
2. Define typed interfaces and adapter selection/initialization; add capability reporting.
3. Route logging and filesystem operations through adapters, preserve outputs and redaction.
4. Route database/cache repositories and migrations; verify existing data continuity.
5. Consolidate API networking/scheduler and PKV policy with native executor adapters; preserve direct reqwest and current API behavior.
6. Implement Secondary storage, language overlay/import and dump export per platform.
7. Remove direct platform calls from common/domain modules, add static guard tests and cross-platform CI.

Each step should be independently reviewable and tested; no platform migration should delete or overwrite user data. Native/device verification is separate from CI.

## Non-negotiable invariants

- Direct reqwest networking; no Cloudflare Pages/Workers/Functions or external reverse proxy.
- Tauri v2 JS command arguments use camelCase.
- Preserve API scheduler/cache, Favorites cooldown, canonical follow sync and post context.
- Preserve PKV host restrictions, Referer/UA rules, SSRF safeguards and log redaction.
- Keep debug diagnostics build-gated; do not leak credentials/session secrets.
- Keep platform-specific paths/API calls inside adapter modules.
