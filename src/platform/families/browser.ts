import type { ClipboardService, IndexedDatabaseService, KeyValueStorage } from "../contracts"

export function browserStorage(name: "localStorage" | "sessionStorage"): KeyValueStorage | undefined {
  try {
    const storage = globalThis[name]
    if (!storage) return undefined
    return {
      get: (key) => storage.getItem(key),
      set: (key, value) => storage.setItem(key, value),
      remove: (key) => storage.removeItem(key),
    }
  } catch {
    // The browser can deny access to the Storage object itself.
    return undefined
  }
}

export const indexedDatabase: IndexedDatabaseService = {
  open: (name, version, upgrade) => new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"))
      return
    }

    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => upgrade(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"))
  }),
}

export const clipboard: ClipboardService = {
  readText: async () => {
    try {
      return navigator.clipboard ? await navigator.clipboard.readText() : null
    } catch {
      return null
    }
  },
  writeText: async (text) => {
    try {
      if (!navigator.clipboard) return false
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  },
}
