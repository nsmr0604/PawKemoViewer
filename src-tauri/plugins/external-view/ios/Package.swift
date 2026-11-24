// swift-tools-version:5.3
import PackageDescription
import Foundation

let diagnostics: [SwiftSetting] = ProcessInfo.processInfo.environment["PKV_IOS_EXTERNAL_DIAG"] == "1"
    ? [.define("PKV_EXTERNAL_DIAG")] : []

let package = Package(
    name: "tauri-plugin-external-view",
    platforms: [.iOS(.v13)],
    products: [.library(name: "tauri-plugin-external-view", type: .static, targets: ["ExternalView"])],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [.target(name: "ExternalView", dependencies: [.byName(name: "Tauri")], path: "Sources", swiftSettings: diagnostics)]
)
