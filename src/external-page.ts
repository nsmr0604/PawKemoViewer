import { invoke } from "@tauri-apps/api/core"
import { DEBUG_DIAG } from "./build-flags"
import { traceExternalPage, traceExternalPageError } from "./external-page-diagnostics"
import { getPlatformRuntime } from "./platform/runtime"

/** 実オリジンのまま外部ページを開けるプラットフォームか (Android / iOS のネイティブのみ) */
export function canOpenExternalPage(): boolean {
  const descriptor = getPlatformRuntime().descriptor
  return descriptor.isNative && (descriptor.os === "android" || descriptor.os === "ios")
}

/** 元記事 URL を Referer にして、外部ページをネイティブビューで開く */
export async function openExternalPage(url: string, referer: string): Promise<void> {
  if (DEBUG_DIAG) {
    traceExternalPage("invoke_started")
    const timer = setTimeout(() => traceExternalPage("invoke_pending"), 5000)
    try {
      await invoke("open_external_page", { url, referer })
      traceExternalPage("invoke_resolved")
    } catch (error) {
      traceExternalPageError(error)
      throw error
    } finally {
      clearTimeout(timer)
    }
    return
  }
  await invoke("open_external_page", { url, referer })
}
