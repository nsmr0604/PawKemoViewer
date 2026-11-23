import { invoke } from "@tauri-apps/api/core"
import type { PlatformServices } from "../contracts"
import { createNativeServices, resolveNativeStorageLocation } from "./native"

export function createDesktopServices(): PlatformServices {
  const native = createNativeServices()
  return {
    ...native,
    storageLocations: { resolve: resolveNativeStorageLocation },
    locale: {
      ...native.locale,
      writeSecondary: async (code, json) => {
        await invoke("write_secondary_locale_file", { code, json })
      },
    },
  }
}
