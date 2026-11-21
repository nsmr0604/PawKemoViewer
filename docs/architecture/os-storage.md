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
