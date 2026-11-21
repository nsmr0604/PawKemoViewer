import { invoke } from "@tauri-apps/api/core"
import { onBackButtonPress, exit } from "@tauri-apps/api/app"
import type { ClipboardService, FileExportService, LocaleService, PlatformServices, StorageArea, StorageLocationService, IndexedDatabaseService, LifecycleService} from "../contracts"

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

const indexedDatabase: IndexedDatabaseService = { open: (name, version, upgrade) => new Promise((resolve, reject) => { if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return } const request = indexedDB.open(name, version); request.onupgradeneeded = () => upgrade(request.result); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("IndexedDB upgrade blocked")) }) }

const storage = typeof localStorage !== "undefined" ? {
  get: (key: string) => localStorage.getItem(key),
  set: (key: string, value: string) => localStorage.setItem(key, value),
  remove: (key: string) => localStorage.removeItem(key),
} : undefined

const sessionStorageService = typeof sessionStorage !== "undefined" ? { get: (key: string) => sessionStorage.getItem(key), set: (key: string, value: string) => sessionStorage.setItem(key, value), remove: (key: string) => sessionStorage.removeItem(key) } : undefined

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

const locale: LocaleService = {
  listExternal: async () => { try { return await invoke<import("../contracts").LocaleFileSet>("list_locale_files") } catch { return null } },
  write: async (code, json) => { await invoke("write_locale_file", { code, json }) },
  delete: async (code) => await invoke<boolean>("delete_locale_file", { code }),
}

const clipboard: ClipboardService = {
  readText: async () => { try { return navigator.clipboard ? await navigator.clipboard.readText() : null } catch { return null } },
  writeText: async (text) => { try { if (!navigator.clipboard) return false; await navigator.clipboard.writeText(text); return true } catch { return false } },
}

const files: FileExportService = {
  exportText: async (filename, content) => {
    // Use WebView download handling as a transitional fallback. This does not
    // provide SAF/Files URI targeting or guarantee provider behavior on devices.
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
      throw new Error("この環境ではファイルダウンロードを利用できません")
    }
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.style.display = "none"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      return { status: "saved", path: filename }
    } finally {
      // Keep the object URL briefly; WebView download processing is asynchronous.
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    }
  },
}

/** Mobile family exposes only private storage until sharing adapters are implemented. */
export function createMobileServices(): PlatformServices {
  return { indexedDatabase, storage, sessionStorage: sessionStorageService, storageLocations, logging, files, locale, clipboard, lifecycle }
}
