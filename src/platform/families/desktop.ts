import { browserStorage, clipboard, indexedDatabase } from "./browser"
import { invoke } from "@tauri-apps/api/core"
import { pawchiveApiTransport } from "./native"
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

const locale: LocaleService = {
  listSecondary: async () => { try { return await invoke<import("../contracts").LocaleFileSet>("list_secondary_locale_files") } catch { return null } },
  writeSecondary: async (code, json) => { await invoke("write_secondary_locale_file", { code, json }) },
  listExternal: async () => { try { return await invoke<import("../contracts").LocaleFileSet>("list_locale_files") } catch { return null } },
  write: async (code, json, replaceExisting) => { await invoke("write_locale_file", { code, json, replaceExisting }) },
  delete: async (code) => await invoke<boolean>("delete_locale_file", { code }),
}

const files: FileExportService = { exportText: (filename, content) => invoke<string>("export_file", { fileName: filename, text: content }) }

/** Desktop family centralizes native path resolution behind the common contract. */
export function createDesktopServices(): PlatformServices {
  return {
    indexedDatabase,
    storage: browserStorage("localStorage"),
    sessionStorage: browserStorage("sessionStorage"),
    storageLocations,
    network: pawchiveApiTransport,
    logging,
    files,
    locale,
    clipboard,
  }
}
