#![cfg(target_os = "android")]

//! Android の共有 Downloads (`Download/`) へ画像を書き出すプラグイン。
//!
//! Android 10 以降はスコープドストレージのため、`/storage/emulated/0/Download` へ
//! 直接ファイルを書けません。MediaStore に登録して保存します。
//! Rust 側はいったんアプリのキャッシュへ書き、このプラグインにファイルパスを渡します。

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime,
};

struct DownloadsStore<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("downloads-store")
        .setup(|app, api| {
            let handle = api.register_android_plugin(
                "org.pawkemoviewer.downloadsstore",
                "DownloadsStorePlugin",
            )?;
            app.manage(DownloadsStore(handle));
            Ok(())
        })
        .build()
}

/// MediaStore 経由で共有 Downloads へ保存できるか (Android 10 以降)。
pub async fn is_supported<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let value: serde_json::Value = app
        .state::<DownloadsStore<R>>()
        .0
        .run_mobile_plugin_async("isSupported", ())
        .await
        .map_err(|error| error.to_string())?;
    Ok(value
        .get("supported")
        .and_then(|value| value.as_bool())
        .unwrap_or(false))
}

/// キャッシュ上のファイルを共有 Downloads の `relative_dir` へ移す。
///
/// 成功すると MediaStore 上の表示パス (`Download/<relative_dir>/<file_name>`) を返す。
pub async fn save_to_downloads<R: Runtime>(
    app: &AppHandle<R>,
    path: String,
    file_name: String,
    relative_dir: String,
    mime_type: String,
) -> Result<String, String> {
    let value: serde_json::Value = app
        .state::<DownloadsStore<R>>()
        .0
        .run_mobile_plugin_async(
            "saveToDownloads",
            serde_json::json!({
                "path": path,
                "fileName": file_name,
                "relativeDir": relative_dir,
                "mimeType": mime_type,
            }),
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(value
        .get("path")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string())
}
