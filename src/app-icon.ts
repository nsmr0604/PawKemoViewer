import { invoke } from "@tauri-apps/api/core"
import { getPlatformRuntime } from "./platform/runtime"

export type AppIconTheme = "light" | "dark"

let pending = Promise.resolve()

export function syncAppIcon(theme: AppIconTheme): Promise<void> {
  pending = pending.then(async () => {
    const { isNative, os } = getPlatformRuntime().descriptor
    if (!isNative) return

    if (os === "android") {
      await invoke("set_android_launcher_icon", { light: theme === "light" })
      return
    }

    const { value: supported } = await invoke<{ value: boolean }>("plugin:app-icon|is_supported")
    if (!supported) return

    const name = theme === "light" ? "AppIconLight" : null
    const { value: current } = await invoke<{ value: string | null }>("plugin:app-icon|get_name")
    if (current === name) return
    if (name) {
      await invoke("plugin:app-icon|change", { options: { name } })
    } else {
      await invoke("plugin:app-icon|reset", { options: {} })
    }
  }).catch((error) => console.warn("Could not update launcher icon", error))

  return pending
}
