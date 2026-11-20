import type { FileExportService, PlatformServices } from "../contracts"

const logging = { append: (_line: string) => { /* browser runtime has no persistent log sink */ } }

const files: FileExportService = { exportText: async (filename, content) => {\n    const blob = new Blob([content], { type: "application/json;charset=utf-8" });\n    const url = URL.createObjectURL(blob);\n    try { const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); return filename } finally { URL.revokeObjectURL(url) }\n  } }\n\n/** Browser fallback adapter bundle. Services are selectively implemented during migration. */
export function createWebServices(): PlatformServices {
  return {
    storage: typeof localStorage !== "undefined" ? {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
      remove: (key) => localStorage.removeItem(key),
    } : undefined,
    files,\n    clipboard: {
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
