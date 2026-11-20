import { invoke } from "@tauri-apps/api/core"
import type { PlatformServices, StorageArea, StorageLocationService } from "../contracts"

const logging = { append: (line: string) => { void import("../../debug").then(({ debugAppendLog }) => debugAppendLog(line)) } }

const storageLocations: StorageLocationService = {
  resolve: async (area: StorageArea, purpose) => {
    try {
      return await invoke<string | null>("resolve_storage_location", { area, purpose })
    } catch (error) {
      console.warn("Storage location resolution failed", area, purpose, error)
      return null
    }
  },
}

/** Desktop family centralizes native path resolution behind the common contract. */
export function createDesktopServices(): PlatformServices {
  return { storageLocations, logging }
}
