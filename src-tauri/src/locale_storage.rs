use tauri::Manager;

// ---------------------------------------------------------------------------
// 言語ファイル (app_data/locales/<code>.json)。利用者が追加・差し替え・削除できる。
// 中身の検証 (JSON・locale.name) は JS 側 (src/i18n.ts) で行う
// ---------------------------------------------------------------------------

const LOCALE_MAX_BYTES: u64 = 1024 * 1024;

// Write locale JSON to a sibling temp file and rename only after the full write.
// This prevents readers from observing a truncated locale file after interruption.
fn atomic_locale_write(path: &std::path::Path, contents: &[u8]) -> Result<(), String> {
    use std::io::Write;
    static NEXT_TEMP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let parent = path
        .parent()
        .ok_or_else(|| "locale path has no parent".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = None;
    for _ in 0..20 {
        let n = NEXT_TEMP.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let candidate = parent.join(format!(".locale-{}-{}.tmp", std::process::id(), n));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                if let Err(e) = file.write_all(contents).and_then(|_| file.sync_all()) {
                    let _ = std::fs::remove_file(&candidate);
                    return Err(e.to_string());
                }
                temp = Some(candidate);
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    let temp = temp.ok_or_else(|| "could not allocate locale temp file".to_string())?;
    if let Err(first_error) = std::fs::rename(&temp, path) {
        // Windows rename may not replace an existing destination.
        if path.exists() {
            if let Err(remove_error) = std::fs::remove_file(path) {
                let _ = std::fs::remove_file(&temp);
                return Err(format!(
                    "replace locale destination failed (rename: {}; remove: {})",
                    first_error, remove_error
                ));
            }
            if let Err(rename_error) = std::fs::rename(&temp, path) {
                let _ = std::fs::remove_file(&temp);
                return Err(rename_error.to_string());
            }
        } else {
            let _ = std::fs::remove_file(&temp);
            return Err(first_error.to_string());
        }
    }
    Ok(())
}

fn locale_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("locales"))
}

/// ファイル名に使える言語コード (ja / en / zh-Hant-TW など)。パス区切りを含めない
fn valid_locale_code(code: &str) -> bool {
    let parts: Vec<&str> = code.split('-').collect();
    parts.len() <= 3
        && (2..=3).contains(&parts[0].len())
        && parts[0].chars().all(|c| c.is_ascii_alphabetic())
        && parts[1..]
            .iter()
            .all(|p| (2..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

#[derive(serde::Serialize)]
pub struct LocaleFile {
    code: String,
    json: String,
}

#[derive(serde::Serialize)]
pub struct LocaleList {
    dir: String,
    files: Vec<LocaleFile>,
    invalid: Vec<String>,
}

#[tauri::command]
pub(crate) fn list_locale_files(app: tauri::AppHandle) -> Result<LocaleList, String> {
    list_locale_directory(locale_dir(&app)?)
}

fn list_locale_directory(dir: std::path::PathBuf) -> Result<LocaleList, String> {
    use std::io::Read;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    let mut invalid = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        if !entry.file_type().is_ok_and(|kind| kind.is_file()) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(code) = name.strip_suffix(".json") else {
            continue;
        };
        let too_big = entry
            .metadata()
            .map(|m| m.len() > LOCALE_MAX_BYTES)
            .unwrap_or(true);
        if !valid_locale_code(code) || too_big {
            invalid.push(name);
            continue;
        }
        let mut json = String::new();
        let read = std::fs::File::open(&path)
            .and_then(|file| file.take(LOCALE_MAX_BYTES + 1).read_to_string(&mut json));
        if read.is_ok_and(|bytes| bytes as u64 <= LOCALE_MAX_BYTES) {
            files.push(LocaleFile {
                code: code.to_string(),
                json,
            });
        } else {
            invalid.push(name);
        }
    }
    Ok(LocaleList {
        dir: dir.to_string_lossy().to_string(),
        files,
        invalid,
    })
}

#[tauri::command]
pub(crate) fn write_locale_file(
    app: tauri::AppHandle,
    code: String,
    json: String,
    replace_existing: Option<bool>,
) -> Result<String, String> {
    if !valid_locale_code(&code) {
        return Err("invalid locale code".into());
    }
    if json.len() as u64 > LOCALE_MAX_BYTES {
        return Err("locale file too large".into());
    }
    let dir = locale_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    static PRIVATE_LOCALE_WRITES: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = PRIVATE_LOCALE_WRITES
        .lock()
        .map_err(|_| "Locale write lock unavailable")?;
    let filename = format!("{code}.json");
    if replace_existing == Some(false) {
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            if entry
                .map_err(|e| e.to_string())?
                .file_name()
                .to_string_lossy()
                .eq_ignore_ascii_case(&filename)
            {
                return Err("A locale file with this code already exists".into());
            }
        }
    }
    let path = dir.join(filename);
    atomic_locale_write(&path, json.as_bytes())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn delete_locale_file(app: tauri::AppHandle, code: String) -> Result<bool, String> {
    if !valid_locale_code(&code) {
        return Err("invalid locale code".into());
    }
    let path = locale_dir(&app)?.join(format!("{}.json", code));
    if !path.is_file() {
        return Ok(false);
    }
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(true)
}

// Use the app's external Documents on Android and the Files-visible Documents on iOS.
fn secondary_locale_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| error.to_string())?;
    #[cfg(any(target_os = "android", target_os = "ios"))]
    return Ok(documents.join("Languages"));
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    Ok(documents.join("Pawchive").join("languages"))
}

#[tauri::command]
pub(crate) fn list_secondary_locale_files(app: tauri::AppHandle) -> Result<LocaleList, String> {
    list_locale_directory(secondary_locale_dir(&app)?)
}

#[tauri::command]
pub(crate) fn write_secondary_locale_file(
    app: tauri::AppHandle,
    code: String,
    json: String,
) -> Result<String, String> {
    if !valid_locale_code(&code) {
        return Err("invalid locale code".into());
    }
    if json.len() as u64 > LOCALE_MAX_BYTES {
        return Err("locale file too large".into());
    }
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        let dir = secondary_locale_dir(&app)?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{}.json", code));
        atomic_locale_write(&path, json.as_bytes())?;
        return Ok(path.to_string_lossy().to_string());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = app;
        Err("secondary locale storage unavailable".into())
    }
}
// Foundation storage-location resolver (additive; consumers are migrated separately).
// Secondary storage is intentionally desktop-only until mobile sharing semantics are
// implemented and verified per platform. This avoids claiming a user-visible path
// on Android/iOS where sandbox/Files exposure depends on platform configuration.
#[tauri::command]
pub(crate) fn resolve_storage_location(
    app: tauri::AppHandle,
    area: String,
    purpose: String,
) -> Result<Option<String>, String> {
    let purpose_dir = match purpose.as_str() {
        "logs" => "logs",
        "locales" => "languages",
        "exports" => "exports",
        "backup" => "backup",
        "general" => "",
        _ => return Err("invalid storage purpose".into()),
    };
    let base = match area.as_str() {
        "primary-private" => app.path().app_data_dir().map_err(|e| e.to_string())?,
        "secondary-accessible" => {
            #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
            {
                app.path().document_dir().map_err(|e| e.to_string())?
            }
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                return Ok(None);
            }
            #[cfg(not(any(
                target_os = "windows",
                target_os = "macos",
                target_os = "linux",
                target_os = "android",
                target_os = "ios"
            )))]
            {
                return Ok(None);
            }
        }
        _ => return Err("invalid storage area".into()),
    };
    let path = if purpose_dir.is_empty() {
        base
    } else {
        base.join(purpose_dir)
    };
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
struct LocalePickerGuard;

#[cfg(any(target_os = "android", target_os = "ios"))]
static LOCALE_PICKER_BUSY: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

#[cfg(any(target_os = "android", target_os = "ios"))]
impl Drop for LocalePickerGuard {
    fn drop(&mut self) {
        LOCALE_PICKER_BUSY.store(false, std::sync::atomic::Ordering::Release);
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
async fn run_locale_picker(
    app: &tauri::AppHandle,
    command: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if LOCALE_PICKER_BUSY.swap(true, std::sync::atomic::Ordering::AcqRel) {
        return Err("A locale picker is already open".into());
    }
    let _guard = LocalePickerGuard;
    tauri_plugin_locale_picker::run(app, command, payload).await
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub(crate) async fn pick_locale_file(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    run_locale_picker(&app, "importLocale", serde_json::json!({})).await
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub(crate) async fn save_locale_file(
    app: tauri::AppHandle,
    code: String,
    json: String,
) -> Result<serde_json::Value, String> {
    if !valid_locale_code(&code) || json.len() as u64 > LOCALE_MAX_BYTES {
        return Err("Invalid locale export".into());
    }
    run_locale_picker(
        &app,
        "exportLocale",
        serde_json::json!({ "filename": format!("{code}.json"), "json": json }),
    )
    .await
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub(crate) async fn save_locale_file_to_app_directory(
    app: tauri::AppHandle,
    code: String,
    json: String,
) -> Result<serde_json::Value, String> {
    if !valid_locale_code(&code) || json.len() as u64 > LOCALE_MAX_BYTES {
        return Err("Invalid locale export".into());
    }
    let filename = format!("{code}.json");
    #[cfg(target_os = "ios")]
    {
        prepare_ios_files_directory(&app)?;
        let path = secondary_locale_dir(&app)?.join(&filename);
        atomic_locale_write(&path, json.as_bytes())?;
        Ok(serde_json::json!({ "kind": "saved", "path": filename }))
    }
    #[cfg(target_os = "android")]
    {
        let payload = serde_json::json!({ "filename": filename, "json": json });
        run_locale_picker(&app, "exportToAppDirectory", payload).await
    }
}

#[cfg(target_os = "ios")]
pub(crate) fn prepare_ios_files_directory(app: &tauri::AppHandle) -> Result<(), String> {
    use std::io::{ErrorKind, Write};
    let languages = secondary_locale_dir(app)?;
    std::fs::create_dir_all(&languages).map_err(|error| error.to_string())?;

    // A visible file in Documents gives Files an item to index for this app.
    let documents = languages
        .parent()
        .ok_or("Missing iOS Documents directory")?;
    let guide = documents.join("PawKemoViewer-Files.txt");
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&guide) {
        Ok(mut file) => file.write_all(
            b"PawKemoViewer\n\nLanguages is the suggested destination for exported language JSON files.\n",
        ).map_err(|error| error.to_string()),
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
