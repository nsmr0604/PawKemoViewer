#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum JsonPurpose {
    Locale,
    Backup,
}

impl JsonPurpose {
    fn max_bytes(self) -> usize {
        match self {
            Self::Locale => 1024 * 1024,
            Self::Backup => 5 * 1024 * 1024,
        }
    }
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
        return Err("A JSON file operation is already open".into());
    }
    let _guard = PickerGuard;
    tauri_plugin_locale_picker::run(app, command, payload).await
}

#[tauri::command]
pub(crate) async fn pick_json_file(
    app: tauri::AppHandle,
    purpose: JsonPurpose,
) -> Result<serde_json::Value, String> {
    let max_bytes = purpose.max_bytes();
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return run_mobile_picker(
        &app,
        "pickJson",
        serde_json::json!({ "maxBytes": max_bytes }),
    )
    .await;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
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
        let mut bytes = Vec::new();
        std::fs::File::open(&path)
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
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn save_json_file(
    app: tauri::AppHandle,
    purpose: JsonPurpose,
    filename: String,
    json: String,
) -> Result<serde_json::Value, String> {
    let max_bytes = purpose.max_bytes();
    let safe_name = filename.strip_suffix(".json").is_some_and(|stem| {
        !stem.is_empty()
            && stem
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    });
    if !safe_name || json.len() > max_bytes {
        return Err("Invalid JSON file name or size".into());
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    return run_mobile_picker(
        &app,
        "saveJson",
        serde_json::json!({ "filename": filename, "json": json, "maxBytes": max_bytes, "locale": matches!(purpose, JsonPurpose::Locale) }),
    ).await;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;

        let Some(file) = app
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(serde_json::json!({ "kind": "cancelled" }));
        };
        let path = file.into_path().map_err(|error| error.to_string())?;
        std::fs::write(&path, json).map_err(|error| error.to_string())?;
        Ok(serde_json::json!({ "kind": "saved", "path": path.to_string_lossy() }))
    })
    .await
    .map_err(|error| error.to_string())?
}
