import { invoke } from "@tauri-apps/api/core"
import type { PlatformServices } from "../contracts"
import { createNativeServices, resolveNativeStorageLocation } from "./native"
import { DEBUG_DIAG } from "../../build-flags"

export function createDesktopServices(): PlatformServices {
  const native = createNativeServices()
  return {
    ...native,
    storageLocations: { resolve: resolveNativeStorageLocation },
    locale: DEBUG_DIAG ? {
      ...native.locale,
      writeSecondary: async (code, json) => {
        await invoke("write_secondary_locale_file", { code, json })
      },
    } : native.locale,
  }
}
