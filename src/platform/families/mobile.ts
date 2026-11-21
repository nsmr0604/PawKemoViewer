import { browserStorage, clipboard, indexedDatabase } from "./browser"
import { invoke } from "@tauri-apps/api/core"
import { pawchiveApiTransport } from "./native"
import { onBackButtonPress, exit } from "@tauri-apps/api/app"
import type { FileExportService, LocaleService, LocalePicker, PlatformDescriptor, PlatformServices, StorageArea, StorageLocationService, LifecycleService } from "../contracts"

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
  listSecondary: async () => {
    try { return await invoke<import("../contracts").LocaleFileSet>("list_secondary_locale_files") }
    catch { return null }
  },
  listExternal: async () => { try { return await invoke<import("../contracts").LocaleFileSet>("list_locale_files") } catch { return null } },
  write: async (code, json, replaceExisting) => { await invoke("write_locale_file", { code, json, replaceExisting }) },
  delete: async (code) => await invoke<boolean>("delete_locale_file", { code }),
}

const files: FileExportService = { exportText: (filename, content) => invoke<string>("export_file", { fileName: filename, text: content }) }

const localePicker: LocalePicker = {
  open: () => invoke("pick_locale_file"),
  save: (code, json) => invoke("save_locale_file", { code, json }),
}

/** Mobile family exposes only private storage until sharing adapters are implemented. */
export function createMobileServices(os?: PlatformDescriptor["os"]): PlatformServices {
  return {
    indexedDatabase,
    storage: browserStorage("localStorage"),
    sessionStorage: browserStorage("sessionStorage"),
    storageLocations,
    network: pawchiveApiTransport,
    logging,
    files,
    locale,
    localePicker: os === "android" ? {
      ...localePicker,
      saveToAppDirectory: (code, json) => invoke("save_locale_file_to_app_directory", { code, json }),
    } : localePicker,
    clipboard,
    lifecycle,
  }
}
