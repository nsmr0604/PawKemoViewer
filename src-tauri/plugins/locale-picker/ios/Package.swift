// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "tauri-plugin-locale-picker",
    platforms: [.iOS(.v13)],
    products: [.library(name: "tauri-plugin-locale-picker", type: .static, targets: ["LocalePicker"])],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [.target(name: "LocalePicker", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
