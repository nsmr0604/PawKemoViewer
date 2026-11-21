# Architecture Refactor Status

- Baseline: `0.5.0` at `cf81e3d` (PR #12). M0 `7a6e898`, M1 `3565050`, M2 `24ea538`, M3 `e4a0726`, M4 `11592a4`.
- **M5 advanced. M5.1 complete. Native validation blocks M5.2–M5.5.** See [OS storage capabilities and acceptance checks](os-storage.md).
  - M5.1 `9a94852`: documented storage, file selection and grant boundaries by OS.
  - M5.2: the standalone Android SAF source compiled against Android SDK 35. Its JVM checks passed all five grant-mask cases. Actual picker, provider and permission persistence tests require an Android device or emulator. The available Tauri initialization lacked SDK/NDK configuration. Cloud ADB could not create its user directory, and the host exposes neither USB devices nor KVM.
  - M5.3: a standalone iOS Files copy-based prototype is available for a host view controller. Swift/UIKit compilation and provider tests require macOS/Xcode. Linux Tauri CLI rejected the iOS initialization command.
  - M5.4/M5.5: adapter and locale integration await the native acceptance checks. Current production capabilities remain unchanged.
- Files touched: `docs/architecture/{README,TASKS,STATUS,os-storage}.md` and `docs/architecture/prototypes/m5/{AndroidLocalePicker.java,AndroidGrantProbe.java,IOSLocalePicker.swift}`.
- Regression validation: `npm run test:domain` (3), `npm run test:application` (10), `npm run test:platform` (14), `npm run build`, `npm run build:debug`, and `git diff --check` passed.
- Next milestone work: run the provider and grant lifecycle tests on Android and the UIKit/Files probe on macOS, then wire the validated adapter. M6.1 adaptive UI design is independently ready.
