import { browserStorage, clipboard, indexedDatabase } from "./browser"
import { DEBUG_DIAG } from "../../build-flags"
import type { FileExportService, LocaleService, PlatformServices, LifecycleService } from "../contracts"

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
  ...(DEBUG_DIAG ? {
    write: async () => { throw new Error("External locale storage unavailable in browser runtime") },
    delete: async () => false,
  } : {}),
}

const lifecycle: LifecycleService = {
  onBackRequested: (_handler) => () => {},
  exit: async () => { throw new Error("Exit is not supported by the browser platform adapter") },
}

/** Browser fallback adapter bundle. Services are selectively implemented during migration. */
export function createWebServices(): PlatformServices {
  return {
    indexedDatabase,
    storage: browserStorage("localStorage"),
    sessionStorage: browserStorage("sessionStorage"),
    lifecycle,
    files,
    locale,
    clipboard,
  }
}
