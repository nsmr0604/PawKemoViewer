import { getPlatform, isMobile } from "../platform"
import type { PlatformFamily, PlatformRuntime, PlatformServices } from "./contracts"
import { createDesktopServices, createMobileServices, createWebServices } from "./families"

// Keep native-runtime detection centralized. OS detection alone does not imply Tauri/native access.
function isNativeRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

let runtime: PlatformRuntime | null = null

function createFamilyServices(family: PlatformFamily): PlatformServices {
  switch (family) {
    case "desktop": return createDesktopServices()
    case "mobile": return createMobileServices()
    case "web": return createWebServices()
  }
}

/** Initialize the platform foundation once during application bootstrap. */
export function initializePlatformRuntime(): PlatformRuntime {
  if (runtime) return runtime
  const native = isNativeRuntime()
  const os = getPlatform()
  const family: PlatformFamily = native ? (isMobile() ? "mobile" : "desktop") : "web"
  runtime = { descriptor: { family, os, isNative: native }, services: createFamilyServices(family) }
  return runtime
}

/** Retrieve initialized runtime; intentionally fails early if bootstrap ordering is broken. */
export function getPlatformRuntime(): PlatformRuntime {
  if (!runtime) throw new Error("Platform runtime has not been initialized")
  return runtime
}

/** Allows controlled service replacement in tests; should not be used by app features. */
export function resetPlatformRuntimeForTests(): void {
  runtime = null
}
