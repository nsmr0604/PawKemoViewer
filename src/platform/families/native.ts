import { invoke } from "@tauri-apps/api/core"
import { DEBUG_DIAG } from "../../build-flags"
import type { UserFilePicker, LocalePicker, LocaleFileSet, LocaleService, PlatformServices, StorageLocationService } from "../contracts"
import { browserStorage, clipboard, indexedDatabase } from "./browser"

async function listLocaleFiles(command: string): Promise<LocaleFileSet | null> {
  try {
    return await invoke<LocaleFileSet>(command)
  } catch {
    return null
  }
}

const locale: LocaleService = {
  listExternal: () => listLocaleFiles("list_locale_files"),
  listSecondary: () => listLocaleFiles("list_secondary_locale_files"),
  exportToFolder: (code, json) => invoke<boolean>("export_locale_to_folder", { code, json }),
  ...(DEBUG_DIAG ? {
    write: async (code: string, json: string, replaceExisting?: boolean) => {
      await invoke("write_locale_file", { code, json, replaceExisting })
    },
    delete: (code: string) => invoke<boolean>("delete_locale_file", { code }),
  } : {}),
}

export const resolveNativeStorageLocation: StorageLocationService["resolve"] = async (area, purpose) => {
  try {
    return await invoke<string | null>("resolve_storage_location", { area, purpose })
  } catch (error) {
    console.warn("Storage location resolution failed", area, purpose, error)
    return null
  }
}

const userFiles: UserFilePicker = {
  open: (purpose) => invoke("pick_json_file", { purpose }),
  save: (purpose, filename, text) => invoke("save_user_file", { purpose, filename, text }),
}

const localePicker: LocalePicker = {
  open: () => userFiles.open("locale"),
  save: (code, json) => userFiles.save("locale", `${code}.json`, json),
}

export function createNativeServices() {
  return {
    indexedDatabase,
    storage: browserStorage("localStorage"),
    sessionStorage: browserStorage("sessionStorage"),
    network: {
      request: ({ path, method, sessionKey, timeoutSecs }) =>
        invoke<string>("api_request", { path, method, sessionKey, timeoutSecs }),
    },
    logging: DEBUG_DIAG ? {
      append: (line) => {
        void import("../../native-debug-log").then(({ debugAppendLog }) => debugAppendLog(line))
      },
    } : undefined,
    locale,
    userFiles,
    localePicker: DEBUG_DIAG ? localePicker : undefined,
    clipboard,
  } satisfies PlatformServices
}
