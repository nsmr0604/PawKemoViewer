import type { PlatformServices } from "../contracts"

/** Browser fallback adapter bundle. Services are selectively implemented during migration. */
export function createWebServices(): PlatformServices {
  return {
    storage: typeof localStorage !== "undefined" ? {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
      remove: (key) => localStorage.removeItem(key),
    } : undefined,
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
