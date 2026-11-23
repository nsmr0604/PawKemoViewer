import { invoke } from "@tauri-apps/api/core"
import { onBackButtonPress, exit } from "@tauri-apps/api/app"
import type { LifecycleService, PlatformDescriptor, PlatformServices } from "../contracts"
import { createNativeServices, resolveNativeStorageLocation } from "./native"

const lifecycle: LifecycleService = {
  onBackRequested: (handler) => {
    let active = true
    let listener: Awaited<ReturnType<typeof onBackButtonPress>> | null = null
    void onBackButtonPress(({ canGoBack }) => { if (active) handler(canGoBack) }).then((registered) => {
      if (active) listener = registered
      else void registered.unregister()
    }).catch((error) => console.warn("Native back listener registration failed", error))
    return () => { active = false; if (listener) void listener.unregister() }
  },
  exit: async () => { await exit(0) },
}

export function createMobileServices(os?: PlatformDescriptor["os"]): PlatformServices {
  const native = createNativeServices()
  return {
    ...native,
    storageLocations: {
      resolve: async (area, purpose) => {
        if (area === "secondary-accessible") return null
        return resolveNativeStorageLocation(area, purpose)
      },
    },
    userFiles: {
      ...native.userFiles,
      appDirectory: {
        openBackup: () => invoke("pick_json_file", { purpose: "backup", appDirectory: true }),
        save: (purpose, filename, text) => invoke("save_user_file", { purpose, filename, text, appDirectory: true }),
      },
    },
    localePicker: os === "android" || os === "ios" ? {
      ...native.localePicker,
      saveToAppDirectory: (code, json) => invoke("save_locale_file_to_app_directory", { code, json }),
    } : native.localePicker,
    lifecycle,
  }
}
