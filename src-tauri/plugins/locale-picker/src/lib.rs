#![cfg(any(target_os = "android", target_os = "ios"))]

use tauri::{AppHandle, Manager, Runtime, plugin::{Builder, PluginHandle, TauriPlugin}};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_locale_picker);

struct LocalePicker<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("locale-picker")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin("org.pawkemoviewer.localepicker", "LocalePickerPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_locale_picker)?;
            app.manage(LocalePicker(handle));
            Ok(())
        })
        .build()
}

pub async fn run<R: Runtime>(
    app: &AppHandle<R>, command: &str, payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    app.state::<LocalePicker<R>>().0
        .run_mobile_plugin_async(command, payload)
        .await
        .map_err(|error| error.to_string())
}
