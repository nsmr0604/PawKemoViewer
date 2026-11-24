import { invoke } from "@tauri-apps/api/core"
import { collectExternalLinks, collectImageUrls, isImageFileUrl } from "./post-image-urls"

/** 保存対象の画像 URL */
export interface DownloadImage {
  url: string
  name?: string
}

export interface DownloadFailure {
  url: string
  reason: string
}

export interface DownloadSummary {
  directory: string
  saved: number
  skipped: number
  cancelled: boolean
  failed: DownloadFailure[]
}

export { isImageFileName, isThumbnailUrl, resolveImageUrl } from "./post-image-urls"

/**
 * 投稿本文 HTML から保存対象の画像 URL を集める。
 * 本文の `<img src>` と、画像ファイルへの直リンク `<a href>` を対象にする。
 */
export function collectArticleImages(html: string, baseUrl?: string): DownloadImage[] {
  if (!html) return []
  if (typeof DOMParser === "undefined") return []
  const document = new DOMParser().parseFromString(html, "text/html")
  const sources = Array.from(document.querySelectorAll("img[src]")).map(
    (img) => img.getAttribute("src") || "",
  )
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const href = anchor.href
    if (isImageFileUrl(href)) sources.push(href)
  }
  return collectImageUrls(sources, baseUrl)
}

/**
 * 投稿本文 HTML から外部ページの URL を集める。
 * サービス本体とミラーは除外し、最大 10 件まで。
 */
export function collectExternalPages(html: string, baseUrl?: string): string[] {
  if (!html) return []
  if (typeof DOMParser === "undefined") return []
  const document = new DOMParser().parseFromString(html, "text/html")
  const hrefs = Array.from(document.querySelectorAll("a[href]")).map(
    (anchor) => anchor.getAttribute("href") || "",
  )
  return collectExternalLinks(hrefs, baseUrl).filter((href) => !isImageFileUrl(href))
}

/**
 * 投稿の `file` / `attachments` から保存対象の画像を組み立てる。
 * URL はプロキシ変換前のもの (Rust 側で取得する)。
 */
export function collectAttachmentImages(
  files: { url: string; name?: string }[],
): DownloadImage[] {
  const seen = new Set<string>()
  const images: DownloadImage[] = []
  for (const file of files) {
    if (!file.url || seen.has(file.url)) continue
    seen.add(file.url)
    images.push({ url: file.url, name: file.name })
  }
  return images
}

/** 画像をまとめて保存する。保存先は Rust 側で解決する。 */
export function downloadArticleImages(
  creatorName: string,
  service: string,
  creatorId: string,
  referer: string,
  images: DownloadImage[],
  pages: string[],
  sessionKey?: string,
): Promise<DownloadSummary> {
  return invoke<DownloadSummary>("download_post_images", {
    creatorName,
    service,
    creatorId,
    referer,
    images,
    pages,
    sessionKey: sessionKey || null,
  })
}

/** 次のファイル取得前に停止する */
export function cancelImageDownload(): Promise<void> {
  return invoke("cancel_download")
}
