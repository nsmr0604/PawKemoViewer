import { invoke } from "@tauri-apps/api/core"
import { DEBUG_DIAG } from "./build-flags"
import { isAllowedExternalPageUrl } from "./external-page-url"
import { traceExternalPage, traceExternalPageError } from "./external-page-diagnostics"
import { getPlatformRuntime } from "./platform/runtime"

/** 外部ページの「画像を保存」でアプリへ引き渡される内容 */
export interface ExternalPageDownload {
  creatorName?: string
  service?: string
  creatorId?: string
  postId?: string
  referer?: string
  pageUrl?: string
  images: string[]
}

/** 外部ページを開くときに引き回す投稿の文脈 (保存先のクリエイター名に使う) */
export interface ExternalPageContext {
  creatorName: string
  service: string
  creatorId: string
  postId: string
}

/** 外部ページとして開いてよい URL か。判定は external-page-url に置く。 */
export { isAllowedExternalPageUrl }

/**
 * 実オリジンのまま外部ページを開けるプラットフォームか。
 * Android / iOS はネイティブビュー、デスクトップは専用ウィンドウで
 * 最初のナビゲーションに Referer を付ける (Windows / macOS / Linux)。
 */
export function canOpenExternalPage(): boolean {
  const descriptor = getPlatformRuntime().descriptor
  return descriptor.isNative && descriptor.os !== "unknown"
}

/** 元記事 URL を Referer にして、外部ページをネイティブビューで開く */
export async function openExternalPage(
  url: string,
  referer: string,
  context?: ExternalPageContext,
): Promise<void> {
  if (!isAllowedExternalPageUrl(url)) {
    if (DEBUG_DIAG) traceExternalPage("external_page_url_rejected")
    return
  }
  const args = {
    url,
    referer,
    creatorName: context?.creatorName ?? "",
    service: context?.service ?? "",
    creatorId: context?.creatorId ?? "",
    postId: context?.postId ?? "",
  }
  if (DEBUG_DIAG) {
    traceExternalPage("invoke_started")
    const timer = setTimeout(() => traceExternalPage("invoke_pending"), 5000)
    try {
      await invoke("open_external_page", args)
      traceExternalPage("invoke_resolved")
    } catch (error) {
      traceExternalPageError(error)
      throw error
    } finally {
      clearTimeout(timer)
    }
    return
  }
  await invoke("open_external_page", args)
}

/**
 * 外部ページの「画像を保存」で書き出された一覧を取り出す。
 * 何も無ければ null。取り出したファイルは Rust 側で削除される。
 */
export async function takeExternalPageImages(): Promise<ExternalPageDownload | null> {
  if (!canOpenExternalPage()) return null
  try {
    const payload = await invoke<ExternalPageDownload | null>("take_external_page_images")
    if (!payload || !Array.isArray(payload.images) || payload.images.length === 0) return null
    return payload
  } catch {
    return null
  }
}
