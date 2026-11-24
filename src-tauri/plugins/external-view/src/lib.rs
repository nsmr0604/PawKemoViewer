#![cfg(any(target_os = "android", target_os = "ios"))]

use tauri::{AppHandle, Manager, Runtime, plugin::{Builder, PluginHandle, TauriPlugin}};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_external_view);

struct ExternalView<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("external-view")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin("org.pawkemoviewer.externalview", "ExternalViewPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_external_view)?;
            app.manage(ExternalView(handle));
            Ok(())
        })
        .build()
}

#[cfg(all(target_os = "ios", feature = "debug-diag"))]
pub async fn diagnostic_events<R: Runtime>(app: &AppHandle<R>) -> Result<serde_json::Value, String> {
    app.state::<ExternalView<R>>()
        .0
        .run_mobile_plugin_async("diagnosticEvents", ())
        .await
        .map_err(|error| error.to_string())
}

/// 実オリジンの外部ページを Referer 付きで開く (Android / iOS)
pub async fn open<R: Runtime>(
    app: &AppHandle<R>,
    url: String,
    referer: String,
) -> Result<(), String> {
    let _: serde_json::Value = app
        .state::<ExternalView<R>>()
        .0
        .run_mobile_plugin_async("open", serde_json::json!({ "url": url, "referer": referer }))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub async fn open_browser<R: Runtime>(app: &AppHandle<R>, url: String) -> Result<(), String> {
    let _: serde_json::Value = app
        .state::<ExternalView<R>>()
        .0
        .run_mobile_plugin_async("openBrowser", serde_json::json!({ "url": url }))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}
