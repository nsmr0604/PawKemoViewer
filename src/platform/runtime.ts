import { getPlatform, isMobile } from "../platform"
import type { PlatformFamily, PlatformRuntime, PlatformServices } from "./contracts"

// Keep native-runtime detection centralized. OS detection alone does not imply Tauri/native access.
function isNativeRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window
}

let runtime: PlatformRuntime | null = null

/** Initialize the platform foundation once during application bootstrap. */
export function initializePlatformRuntime(services: PlatformServices = {}): PlatformRuntime {
  if (runtime) return runtime
  const native = isNativeRuntime()
  const os = getPlatform()
  const family: PlatformFamily = native ? (isMobile() ? "mobile" : "desktop") : "web"
  runtime = { descriptor: { family, os, isNative: native }, services }
  return runtime
}

/** Retrieve initialized runtime; intentionally fails early if bootstrap ordering is broken. */
export function getPlatformRuntime(): PlatformRuntime {
  if (!runtime) throw new Error("Platform runtime has not been initialized")
  return runtime
}
