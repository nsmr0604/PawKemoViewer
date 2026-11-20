import { invoke } from "@tauri-apps/api/core"
import type { ClipboardService, FileExportService, LocaleService, PlatformServices, StorageArea, StorageLocationService } from "../contracts"

const storage = typeof localStorage !== "undefined" ? {
  get: (key: string) => localStorage.getItem(key),
  set: (key: string, value: string) => localStorage.setItem(key, value),
  remove: (key: string) => localStorage.removeItem(key),
} : undefined

const sessionStorageService = typeof sessionStorage !== "undefined" ? { get: (key: string) => sessionStorage.getItem(key), set: (key: string, value: string) => sessionStorage.setItem(key, value), remove: (key: string) => sessionStorage.removeItem(key) } : undefined

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
  listExternal: async () => { try { return await invoke<import("../contracts").LocaleFileSet>("list_locale_files") } catch { return null } },
  write: async (code, json) => { await invoke("write_locale_file", { code, json }) },
  delete: async (code) => await invoke<boolean>("delete_locale_file", { code }),
}

const clipboard: ClipboardService = {
  readText: async () => { try { return navigator.clipboard ? await navigator.clipboard.readText() : null } catch { return null } },
  writeText: async (text) => { try { if (!navigator.clipboard) return false; await navigator.clipboard.writeText(text); return true } catch { return false } },
}

const files: FileExportService = { exportText: (filename, content) => invoke<string>("export_file", { fileName: filename, text: content }) }

/** Desktop family centralizes native path resolution behind the common contract. */
export function createDesktopServices(): PlatformServices {
  return { storage, sessionStorage: sessionStorageService, storageLocations, logging, files, locale, clipboard }
}
