# OS storage capabilities

## M5.1 — Current support and candidate boundaries

| Runtime | Private storage today | User-accessible storage today | Candidate for explicitly selected files |
|---|---|---|---|
| Windows | Tauri app data | Desktop locale overlay and writes in `Documents/Pawchive/languages` | Desktop open/save picker. Process filesystem permissions apply. No mobile grant semantics. |
| macOS | Tauri app data | Same Documents locale backend, subject to macOS privacy and sandbox configuration | Desktop open/save picker. Sandboxed builds need the applicable entitlements and access lifecycle. |
| Linux | Tauri app data | Same Documents locale backend using Tauri's document directory resolution | Desktop picker or document portal when sandboxed. Verify the selected path can be accessed in the installed package. |
| Android | Tauri app data, including private exports | No secondary locale adapter | SAF `ACTION_OPEN_DOCUMENT` for input and `ACTION_CREATE_DOCUMENT` for export. Work through `ContentResolver` on the selected URI. A provider may offer persistable URI access; accept only returned modes if required. |
| iOS | Tauri app container, including private exports | No secondary locale adapter | UIKit document picker with copy semantics for the first import/export slice. Use security-scoped access only for an explicit open-in-place path, with balanced scope management and coordinated I/O. |
| Web | Browser origin storage | Download via Blob and native browser file input for explicitly chosen input | A file input grants access to selected files. A download initiation does not establish a retained writable file or directory. No requirement for File System Access API support. |

The general path resolver and desktop locale backend are separate and return different directory layouts. Android content URIs and iOS document URLs require provider-aware I/O. Keep picker capabilities optional and expose distinct completed, cancelled and failed outcomes. A cancelled pick must not modify the locale catalogue. The first native slice should select a single file at a time, retain access only for the operation and enforce the existing locale input limit. Directory selection and persistent grants require their own justified workflow.

References: [Android SAF](https://developer.android.com/training/data-storage/shared/documents-files), [Android ContentResolver](https://developer.android.com/reference/android/content/ContentResolver), [Apple UIDocumentPickerViewController](https://developer.apple.com/documentation/uikit/uidocumentpickerviewcontroller), [Apple security-scoped URL access](https://developer.apple.com/documentation/foundation/url/startaccessingsecurityscopedresource).

## M5.2 — Android SAF prototype

[AndroidLocalePicker.java](prototypes/m5/AndroidLocalePicker.java) creates open/create intents, keeps the selected content URI opaque, and reads or writes through the provider streams. It bounds UTF-8 payloads to 1 MiB. A cancelled activity result returns no document. The explicitly invoked grant probe intersects the offered read/write flags with the requested modes, and lets Android decide whether those modes can be retained. The probe verifies that Android lists the grant and that the URI was saved before reporting success. Normal access is per operation.

The standalone host is [ProbeActivity.java](prototypes/m5/ProbeActivity.java). It exercises transient open, fixture export, explicit read-grant retention, reopening and release. Grant state is kept in the probe application's private preferences. Build and sign the APK by running [build-android-probe.sh](prototypes/m5/build-android-probe.sh) with JRE 17+, ECJ 3.40.0, Python 3, zip, Android SDK Platform 35 and Android Build Tools 35.0.0. The SDK and compiler downloads were checked against published digests.

```bash
ANDROID_JAR=/path/to/android-35/android.jar \
BUILD_TOOLS=/path/to/build-tools/35.0.0 \
ECJ_JAR=/path/to/ecj.jar PROBE_OUTPUT=/path/to/writable/output \
bash docs/architecture/prototypes/m5/build-android-probe.sh
adb install -r /path/to/writable/output/saf-probe.apk
adb shell am start -n org.pawkemoviewer.safprobe/.ProbeActivity
```

The script compiles the fixture, runs six grant-mask cases, links and aligns the APK, signs it with a local debug key, and checks its signature. All of these steps passed in Codex Cloud. AAPT2 confirmed the launchable activity and API 23 minimum. The APK is a standalone test application without additional manifest permissions.

Before retaining a different document, release the existing grant. After retaining one, force-stop and relaunch the test package, then use **Read remembered document**. After release, force-stop and relaunch again to test denial without the transient grant from the original selection. Use a disposable fixture and check cancellation, import, export and readback against local and external providers. The probe leaves the remembered URI available for the denial test after release.

The user reported successful open and export on a device. The retain picker opened, but reading and releasing the remembered document raised IllegalStateException in 1.0 because the probe had no saved URI. The reason no URI was saved was not captured in that build. Version 1.1 exposes the returned flags and distinguishes denial, missing grants, and a failed save. In 1.1, the user observed flags `0x43` (read, write and persistable offered), a successful read with “Persisted read grant listed”, and “Grant released”. The probe retained read access only. The user clarified that this run included removing the app from the task switcher, force-stopping it from Android app info, and relaunching before the successful read. Read denial after force-stop and relaunch following release remains unverified. This Cloud container exposes neither USB nor KVM, and its ADB server could not create the expected user configuration directory. No production Tauri capability is added by the standalone APK.

## M5.3 — iOS Files prototype

[IOSLocalePicker.swift](prototypes/m5/IOSLocalePicker.swift) sketches import/export by copy using UIKit. A single delegate completion returns imported text, export completion, cancellation or failure. The host retains the delegate while presented, stages an export file in the app container, and removes the staged file after completion. The workflow avoids retaining provider handles between operations. For an eventual open-in-place flow, use an explicitly selected security-scoped URL, balance start/stop access and use coordinated I/O. Keep bookmarking out of the first slice.

The Linux Tauri CLI rejects `ios init`; this environment has no Xcode/UIKit SDK. The Swift source needs compilation and execution in a macOS iOS 14+ simulator target or on a device. On that target, embed the helper in a small host view controller and check actual Files providers, copied input, export destination and cancellation. The prototype has no production iOS wiring.

## Native acceptance checks before M5.4

| Scenario | Android SAF | iOS Files |
|---|---|---|
| Cancel open/create | No document or state change | Cancel callback once, no locale change, staged export cleaned up |
| Round trip | Read selected JSON from provider; create a different JSON document and read it back | Import a copy from Files; export the staged file to the chosen provider and reopen it |
| Permissions and persistence | Observe returned grant flags on local/external providers. Persist only offered modes for this probe, reopen after process restart, release the grant, then verify access fails in a fresh process | Copy flow should succeed without bookmark persistence. Verify scope lifetime separately before implementing open-in-place |
| Provider and input errors | Include denied or revoked access, provider disappearance, malformed UTF-8 and >1 MiB | Include provider errors, missing selection, malformed UTF-8 and >1 MiB |

## Locale behavior to preserve in M5.5

Keep the existing overlay order (bundled, then private, then secondary, with later entries overriding earlier keys) and the locale repository's distinction between private and secondary writes. For a new picker path, validate the filename, byte limit and dictionary before cataloguing a file. Cancellation and validation failure leave the catalogue unchanged. Treat a duplicate locale code or export name as an explicit conflict decision when adding a new destination workflow. M5.4 adapter integration and the M5.5 locale flow depend on the native checks above.
