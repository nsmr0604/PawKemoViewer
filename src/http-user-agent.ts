import { invoke } from "@tauri-apps/api/core"
import { getVersion } from "@tauri-apps/api/app"
import { getSettings } from "./api"

/** 外部アクセス時の User-Agent の選び方 */
export type UserAgentMode = "device" | "app" | "desktop"

/** 互換用の固定 UA (旧来の既定値) */
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"

/** 実行中の WebView の UA (端末の実 UA) */
export function deviceUserAgent(): string {
  if (typeof navigator !== "undefined" && navigator.userAgent) return navigator.userAgent
  return DESKTOP_UA
}

/** アプリ独自 UA (pawchive の公開 API では許容される) */
export async function appUserAgent(): Promise<string> {
  let version = "0"
  try {
    version = await getVersion()
  } catch {
    // 取得できなくても UA は作る
  }
  return `PawKemoViewer/${version} (${platformName()})`
}

function platformName(): string {
  const ua = deviceUserAgent()
  if (/Android/i.test(ua)) return "Android"
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS"
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS"
  if (/Linux/i.test(ua)) return "Linux"
  return "Windows"
}

/** 設定に応じた UA 文字列 */
export async function selectedUserAgent(): Promise<string> {
  switch (getSettings().userAgentMode) {
    case "app":
      return appUserAgent()
    case "desktop":
      return DESKTOP_UA
    case "device":
    default:
      return deviceUserAgent()
  }
}

/** 設定を Rust 側へ反映する (起動時と設定変更時) */
export async function applyHttpUserAgent(): Promise<void> {
  const userAgent = await selectedUserAgent()
  try {
    await invoke("set_http_user_agent", { userAgent })
  } catch {
    // 失敗しても既定 UA で動作を続ける
  }
}
