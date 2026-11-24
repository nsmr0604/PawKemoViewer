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

The user reported successful open and export on a device. The retain picker opened, but reading and releasing the remembered document raised IllegalStateException in 1.0 because the probe had no saved URI. The reason no URI was saved was not captured in that build. Version 1.1 exposes the returned flags and distinguishes denial, missing grants, and a failed save. In 1.1, the user observed flags `0x43` (read, write and persistable offered), a successful read with “Persisted read grant listed”, and “Grant released”. The probe retained read access only. The user clarified that this run included removing the app from the task switcher, force-stopping it from Android app info, and relaunching before the successful read. After releasing the grant, the user force-stopped and relaunched the probe again and observed “Read denied by Android”. This confirms the retain/restart/release lifecycle on the tested device and provider. Cancel and other providers were not reported. This Cloud container exposes neither USB nor KVM, and its ADB server could not create the expected user configuration directory. No production Tauri capability is added by the standalone APK.

## M5.3 — iOS Files prototype

[IOSLocalePicker.swift](prototypes/m5/IOSLocalePicker.swift) sketches import/export by copy using UIKit. A single delegate completion returns imported text, export completion, cancellation or failure. The host retains the delegate while presented, stages an export file in the app container, and removes the staged file after completion. The workflow avoids retaining provider handles between operations. For an eventual open-in-place flow, use an explicitly selected security-scoped URL, balance start/stop access and use coordinated I/O. Keep bookmarking out of the first slice.

GitHub Actions built the standalone arm64 device IPA on the `test/ios-files-probe` branch at `e9e59da`. The user confirmed that **Open** and **Export** both worked on an iOS device using that build. Cancellation, oversized or invalid files, other providers and export readback were not reported. The prototype has no production iOS wiring. [Build 44921047747](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44921047747).

### Unsigned iPhone probe IPA

[IOSProbeApp.swift](prototypes/m5/IOSProbeApp.swift) is the standalone host for the Files picker. It retains the picker delegate, stages an export fixture and removes the staged directory on completion or cancel.

On macOS with full Xcode selected and the iPhoneOS SDK installed:

```bash
PROBE_OUTPUT=/path/to/writable/output bash docs/architecture/prototypes/m5/build-ios-probe.sh
```

The script compiles an arm64 device executable, checks that it has no code-signature load command and packages `Payload/FilesProbe.app` into `PawKemoViewer-Files-Probe-unsigned.ipa`. An unsigned build requires signing before installation on a standard iPhone. The Linux cloud run exercised the shell syntax, plist parsing and missing-Xcode guard. The macOS Actions run subsequently compiled Swift/UIKit and packaged the IPA successfully.

## Native acceptance checks before M5.4

| Scenario | Android SAF | iOS Files |
|---|---|---|
| Cancel open/create | No document or state change | Cancel callback once, no locale change, staged export cleaned up |
| Round trip | Read selected JSON from provider; create a different JSON document and read it back | Import a copy from Files; export the staged file to the chosen provider and reopen it |
| Permissions and persistence | Observe returned grant flags on local/external providers. Persist only offered modes for this probe, reopen after process restart, release the grant, then verify access fails in a fresh process | Copy flow should succeed without bookmark persistence. Verify scope lifetime separately before implementing open-in-place |
| Provider and input errors | Include denied or revoked access, provider disappearance, malformed UTF-8 and >1 MiB | Include provider errors, missing selection, malformed UTF-8 and >1 MiB |

## Locale behavior to preserve in M5.5

Keep the existing overlay order (bundled, then private, then secondary, with later entries overriding earlier keys) and the locale repository's distinction between private and secondary writes. For a new picker path, validate the filename, byte limit and dictionary before cataloguing a file. Cancellation and validation failure leave the catalogue unchanged. Treat a duplicate locale code or export name as an explicit conflict decision when adding a new destination workflow. M5.4 adapter integration and the M5.5 locale flow depend on the native checks above.

## M5.4–M5.5 — Integrated mobile locale workflow

The app wires the selected-file commands to a bundled native plugin. Android uses SAF open/create and provider streams. iOS uses a copied import and a staged export via the Files picker. Cancel is distinct from failure. The plugin reads at most 1 MiB, and only the bounded UTF-8 text and filename cross the bridge. The selected-file commands retain no URI grant or broad Android storage permission. The app-owned folders below provide a separate secondary catalogue.

Settings imports a new private locale copy. It validates the locale code and dictionary, refuses a duplicate code (including case variants), and checks the conflict again in Rust under the private-write lock. Export writes the private file for the currently selected language. The existing bundled/private/desktop shared overlay precedence stays in place. The existing desktop and browser file input routes now match their respective private and shared labels.

Validation in Cloud covered the application and mock IPC tests, normal/debug frontend builds, and Linux Rust check with and without diagnostics. The earlier device probes establish system-picker feasibility. The integrated Android ARM64 APK and unsigned iOS IPA built in GitHub Actions from `test/mobile-locale` at `2765974`. The two packages were downloaded and checked for the native picker and the separate test app ID `com.nsmr0604.pawkemoviewer.localetest`. The APK signature also verified. Chromium with mock mobile IPC covered cancel, private import, duplicate rejection and export. A device pass still needs to cover the same interactions and readback. On iOS the picker requires iOS 14+.

- [Build run](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44923710378)
- [Android ARM64 APK](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44923710378/artifacts/14714862936)
- [Unsigned iOS IPA](https://github.com/nsmr0604/PawKemoViewer/actions/runs/44923710378/artifacts/14714494818)

### App-owned export folders

On Android the native plugin prepares `getExternalFilesDir(DIRECTORY_DOCUMENTS)/Languages` at startup. Settings can export the selected private locale there directly, without an additional runtime permission. The save result reports the actual path. If external storage was unavailable at startup, export retries folder creation and reports failure if it still cannot write. Android may hide `Android/data` from the system picker and file managers. Use the separate system-picker export when the destination should be visible there.

On iOS and iPadOS the app creates `Documents/Languages` at startup and exposes Documents in Files. Settings can export directly there or use the system picker with Languages as its initial location. Settings displays the secondary folder, and Reload Languages rescans it. Both exports require a selected language with a private copy created by import or manual addition. The private catalogue remains in app data.

### モバイル統合版の実機確認

確認対象の APK と署名済み IPA、または検証用パッケージを使用する。
端末名、OS バージョン、ファイルの保存先、アプリのバージョン、有効な結果を記録する。
iPhone・iPad は一度起動し、「ファイル」→「このiPhone内」または「このiPad内」
→「PawKemoViewer」→「Languages」を開く。Android は設定に表示される
アプリ専用の `Documents/Languages` を確認する。

1. ファイル選択をキャンセルし、言語一覧に変化がないことを確認する。
2. 未使用の言語コードで有効な JSON を取り込み、選択後に翻訳が反映されることを確認する。
   同じファイルを再度取り込んで重複が拒否されることと、不正 JSON・1 MiB 超のファイルで
   言語一覧が変化しないことも確認する。
3. 取り込んだ言語を選び、アプリ用フォルダーに書き出して JSON の内容を確認する。
   別の言語コードの JSON を追加フォルダーに置き、再読み込み後と再起動後に選択できることを確認する。
4. システムのファイル選択画面からローカルの保存先に書き出し、ファイルを開き直して内容を確認する。
   書き出しをキャンセルした場合は保存先にファイルが作成されないことを確認する。

確認用 JSON は [qaa.json（取り込み）](../fixtures/qaa.json)、[qab.json（追加フォルダー）](../fixtures/qab.json)、
[qac.json（値が不正）](../fixtures/qac.json) を使う。端末に同じ言語コードがある場合は未使用のコードにファイル名を変更する。
合格時には、取り込み後に `QA Home Import`、追加フォルダーの再読み込み後に `QA Home Folder` がホームのラベルに出る。
`qac.json` を選んだ後はエラーが表示され、言語一覧が維持される。検証後は元の言語に戻す。
