# Repositories and infrastructure

## M3.1 — Locale repository

The locale repository provides private listing, writing and deletion, plus optional secondary listing and writing. It accepts validated language codes and raw JSON. A listing keeps file names and the invalid-file report needed by Settings. Keep the native deletion boolean and platform failures intact. If the platform does not supply a locale service, the repository is absent. Secondary methods are present only when supported by the platform adapter.

Application code owns form and batch validation, per-file outcomes, and catalogue composition. Infrastructure binds those operations to the current platform service. The screen continues to own confirmation, display messages and active language selection. No new database schema, file location, picker or permissions are introduced by this contract.
