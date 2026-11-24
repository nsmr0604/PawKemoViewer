#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum JsonPurpose {
    #[cfg(feature = "debug-diag")]
    Locale,
    Backup,
}

impl JsonPurpose {
    fn max_bytes(self) -> usize {
        match self {
            #[cfg(feature = "debug-diag")]
            Self::Locale => 1024 * 1024,
            Self::Backup => 5 * 1024 * 1024,
        }
    }
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ExportPurpose {
    #[cfg(feature = "debug-diag")]
    Locale,
    Backup,
    Log,
}

impl ExportPurpose {
    fn format(self) -> (&'static str, &'static str, usize) {
        match self {
            #[cfg(feature = "debug-diag")]
            Self::Locale => ("JSON", "json", JsonPurpose::Locale.max_bytes()),
            Self::Backup => ("JSON", "json", JsonPurpose::Backup.max_bytes()),
            Self::Log => ("Text", "txt", 5 * 1024 * 1024),
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
impl ExportPurpose {
    fn folder(self) -> &'static str {
        match self {
            #[cfg(feature = "debug-diag")]
            Self::Locale => "Languages",
            Self::Backup => "Backups",
            Self::Log => "Logs",
        }
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub(crate) fn app_document_directory(
    app: &tauri::AppHandle,
    folder: &str,
) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let path = app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?
        .join(folder);
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn read_json_file(path: &std::path::Path, max_bytes: usize) -> Result<serde_json::Value, String> {
    use std::io::Read;

    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .and_then(|file| file.take((max_bytes + 1) as u64).read_to_end(&mut bytes))
        .map_err(|error| error.to_string())?;
    if bytes.len() > max_bytes {
        return Err("JSON file exceeds the size limit".into());
    }
    let json = String::from_utf8(bytes).map_err(|_| "JSON file is not UTF-8")?;
    let name = path
        .file_name()
        .ok_or("Missing file name")?
        .to_string_lossy();
    Ok(serde_json::json!({ "kind": "selected", "name": name, "json": json }))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub(crate) async fn run_mobile_picker(
    app: &tauri::AppHandle,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use std::sync::atomic::{AtomicBool, Ordering};

    static BUSY: AtomicBool = AtomicBool::new(false);
    struct PickerGuard;
    impl Drop for PickerGuard {
        fn drop(&mut self) {
            BUSY.store(false, Ordering::Release);
        }
    }

    if BUSY.swap(true, Ordering::AcqRel) {
        return Err("A file operation is already open".into());
    }
    let _guard = PickerGuard;
    tauri_plugin_locale_picker::run(app, command, payload).await
}

#[tauri::command]
pub(crate) async fn pick_json_file(
    app: tauri::AppHandle,
    purpose: JsonPurpose,
    app_directory: Option<bool>,
) -> Result<serde_json::Value, String> {
    let max_bytes = purpose.max_bytes();
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let _ = app_directory;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let folder = match purpose {
            #[cfg(feature = "debug-diag")]
            JsonPurpose::Locale => "Languages",
            JsonPurpose::Backup => "Backups",
        };
        if app_directory == Some(true) {
            if !matches!(purpose, JsonPurpose::Backup) {
                return Err("Only backups can be opened directly".into());
            }
            return tauri::async_runtime::spawn_blocking(move || {
                let path = app_document_directory(&app, folder)?.join("pawkemoviewer-backup.json");
                if !path.try_exists().map_err(|error| error.to_string())? {
                    return Ok(serde_json::json!({ "kind": "missing" }));
                }
                read_json_file(&path, max_bytes)
            })
            .await
            .map_err(|error| error.to_string())?;
        }
        return run_mobile_picker(
            &app,
            "pickJson",
            serde_json::json!({ "maxBytes": max_bytes, "folder": folder }),
        )
        .await;
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;

        let Some(file) = app
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
            .blocking_pick_file()
        else {
            return Ok(serde_json::json!({ "kind": "cancelled" }));
        };
        let path = file.into_path().map_err(|error| error.to_string())?;
        read_json_file(&path, max_bytes)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn save_user_file(
    app: tauri::AppHandle,
    purpose: ExportPurpose,
    filename: String,
    text: String,
    app_directory: Option<bool>,
) -> Result<serde_json::Value, String> {
    let (_label, extension, max_bytes) = purpose.format();
    let safe_name = filename.rsplit_once('.').is_some_and(|(stem, suffix)| {
        suffix == extension
            && !stem.is_empty()
            && stem
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    });
    if !safe_name || text.len() > max_bytes {
        return Err("Invalid export file name or size".into());
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let folder = purpose.folder();
        if app_directory == Some(true) {
            return tauri::async_runtime::spawn_blocking(move || {
                let path = app_document_directory(&app, folder)?.join(&filename);
                crate::locale_storage::atomic_document_write(&path, text.as_bytes())?;
                #[cfg(target_os = "android")]
                let path = path.to_string_lossy().into_owned();
                #[cfg(target_os = "ios")]
                let path = format!("{folder}/{filename}");
                Ok(serde_json::json!({ "kind": "saved", "path": path }))
            })
            .await
            .map_err(|error| error.to_string())?;
        }
        return run_mobile_picker(
            &app,
            "saveDocument",
            serde_json::json!({ "filename": filename, "json": text, "maxBytes": max_bytes, "folder": folder, "extension": extension }),
        ).await;
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let _ = app_directory;
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;

        let Some(file) = app
            .dialog()
            .file()
            .add_filter(_label, &[extension])
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(serde_json::json!({ "kind": "cancelled" }));
        };
        let path = file.into_path().map_err(|error| error.to_string())?;
        std::fs::write(&path, text).map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "kind": "saved", "path": path.to_string_lossy() }))
    })
    .await
    .map_err(|error| error.to_string())?
}
