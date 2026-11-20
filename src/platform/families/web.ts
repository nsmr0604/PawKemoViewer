import type { FileExportService, LocaleService, PlatformServices, IndexedDatabaseService} from "../contracts"

const indexedDatabase: IndexedDatabaseService = { open: (name, version, upgrade) => new Promise((resolve, reject) => { if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return } const request = indexedDB.open(name, version); request.onupgradeneeded = () => upgrade(request.result); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("IndexedDB upgrade blocked")) }) }

const sessionStorageService = typeof sessionStorage !== "undefined" ? { get: (key: string) => sessionStorage.getItem(key), set: (key: string, value: string) => sessionStorage.setItem(key, value), remove: (key: string) => sessionStorage.removeItem(key) } : undefined

const logging = { append: (_line: string) => { /* browser runtime has no persistent log sink */ } }

const files: FileExportService = {
  exportText: async (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.click()
      return filename
    } finally {
      // Browser download handling is asynchronous; immediate revocation can invalidate
      // the URL before the browser has consumed it.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  },
}

const locale: LocaleService = {
  listExternal: async () => null,
  write: async () => { throw new Error("External locale storage unavailable in browser runtime") },
  delete: async () => false,
}

/** Browser fallback adapter bundle. Services are selectively implemented during migration. */
export function createWebServices(): PlatformServices {
  return {
    indexedDatabase, sessionStorage: sessionStorageService,
    storage: typeof localStorage !== "undefined" ? {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
      remove: (key) => localStorage.removeItem(key),
    } : undefined,
    files,
    locale,
    clipboard: {
      readText: async () => {
        try { return typeof navigator !== "undefined" && navigator.clipboard ? await navigator.clipboard.readText() : null }
        catch { return null }
      },
      writeText: async (text) => {
        try { if (!navigator.clipboard) return false; await navigator.clipboard.writeText(text); return true }
        catch { return false }
      },
    },
  }
}
