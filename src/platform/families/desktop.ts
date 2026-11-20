import { invoke } from "@tauri-apps/api/core"
import type { FileExportService, LocaleService, PlatformServices, StorageArea, StorageLocationService } from "../contracts"

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

const locale: LocaleService = { listExternal: async () => { try { return await invoke<import("../contracts").LocaleFileSet>("list_locale_files") } catch { return null } } }

const files: FileExportService = { exportText: (filename, content) => invoke<string>("export_file", { fileName: filename, text: content }) }

/** Desktop family centralizes native path resolution behind the common contract. */
export function createDesktopServices(): PlatformServices {
  return { storageLocations, logging, files, locale }
}
