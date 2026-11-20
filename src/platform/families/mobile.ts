import { invoke } from "@tauri-apps/api/core"
import type { PlatformServices, StorageArea, StorageLocationService } from "../contracts"

const storageLocations: StorageLocationService = {
  resolve: async (area: StorageArea, purpose) => {
    // Native private storage is supported; secondary user-accessible locations
    // await platform-specific sharing/document adapters before being advertised.
    if (area === "secondary-accessible") return null
    try {
      return await invoke<string | null>("resolve_storage_location", { area, purpose })
    } catch (error) {
      console.warn("Private storage location resolution failed", purpose, error)
      return null
    }
  },
}

/** Mobile family exposes only private storage until sharing adapters are implemented. */
export function createMobileServices(): PlatformServices {
  return { storageLocations }
}
