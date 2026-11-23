import { invoke } from "@tauri-apps/api/core"
import { onBackButtonPress, exit } from "@tauri-apps/api/app"
import type { LifecycleService, LocalePicker, PlatformDescriptor, PlatformServices } from "../contracts"
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

const localePicker: LocalePicker = {
  open: () => invoke("pick_locale_file"),
  save: (code, json) => invoke("save_locale_file", { code, json }),
}

export function createMobileServices(os?: PlatformDescriptor["os"]): PlatformServices {
  return {
    ...createNativeServices(),
    storageLocations: {
      resolve: async (area, purpose) => {
        if (area === "secondary-accessible") return null
        return resolveNativeStorageLocation(area, purpose)
      },
    },
    localePicker: os === "android" || os === "ios" ? {
      ...localePicker,
      saveToAppDirectory: (code, json) => invoke("save_locale_file_to_app_directory", { code, json }),
    } : localePicker,
    lifecycle,
  }
}
