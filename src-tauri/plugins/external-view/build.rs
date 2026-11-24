fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        let enabled = std::env::var_os("CARGO_FEATURE_DEBUG_DIAG").is_some();
        // Set before invoking the Swift package build from this single-threaded build script.
        unsafe { std::env::set_var("PKV_IOS_EXTERNAL_DIAG", if enabled { "1" } else { "0" }) };
    }
    tauri_plugin::Builder::new(&[])
        .android_path("android")
        .ios_path("ios")
        .build();
}
