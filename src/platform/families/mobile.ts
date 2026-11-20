import { invoke } from "@tauri-apps/api/core"
import type { FileExportService, LocaleService, PlatformServices, StorageArea, StorageLocationService } from "../contracts"

const logging = { append: (line: string) => { void import("../../debug").then(({ debugAppendLog }) => debugAppendLog(line)) } }

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

const locale: LocaleService = { listExternal: async () => { try { return await invoke<import("../contracts").LocaleFileSet>("list_locale_files") } catch { return null } } }

const files: FileExportService = { exportText: (filename, content) => invoke<string>("export_file", { fileName: filename, text: content }) }

/** Mobile family exposes only private storage until sharing adapters are implemented. */
export function createMobileServices(): PlatformServices {
  return { storageLocations, logging, files, locale }
}
