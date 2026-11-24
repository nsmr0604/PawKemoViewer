import { invoke } from "@tauri-apps/api/core"
import { getPlatformRuntime } from "./platform/runtime"

/** 実オリジンのまま外部ページを開けるプラットフォームか (Android / iOS のネイティブのみ) */
export function canOpenExternalPage(): boolean {
  const descriptor = getPlatformRuntime().descriptor
  return descriptor.isNative && (descriptor.os === "android" || descriptor.os === "ios")
}

/** 元記事 URL を Referer にして、外部ページをネイティブビューで開く */
export async function openExternalPage(url: string, referer: string): Promise<void> {
  await invoke("open_external_page", { url, referer })
}
