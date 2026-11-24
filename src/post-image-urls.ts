/** 画像 URL の選別ロジック (DOM に依存しない純粋関数) */

const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v|m3u8|gifv)$/i

/** サムネイル配信は本体画像ではないため対象外にする */
export function isThumbnailUrl(url: URL): boolean {
  return url.hostname === "img.pawchive.pw" && url.pathname.startsWith("/thumbnail/")
}

/**
 * `<img src>` の値を保存対象の絶対 URL に変換する。
 * 対象外 (data: / blob: / サムネイル / 動画 / 非 http) は null を返す。
 */
export function resolveImageUrl(source: string, baseUrl?: string): string | null {
  const trimmed = source.trim()
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null
  let url: URL
  try {
    url = new URL(trimmed, baseUrl)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (isThumbnailUrl(url)) return null
  if (VIDEO_EXTENSION.test(url.pathname)) return null
  return url.toString()
}

/** URL の一覧から重複を除いて保存対象だけを残す */
export function collectImageUrls(sources: Iterable<string>, baseUrl?: string): { url: string }[] {
  const seen = new Set<string>()
  const images: { url: string }[] = []
  for (const source of sources) {
    const absolute = resolveImageUrl(source, baseUrl)
    if (!absolute || seen.has(absolute)) continue
    seen.add(absolute)
    images.push({ url: absolute })
  }
  return images
}

/** 画像ファイル名か (拡張子で判定) */
export function isImageFileName(name: string): boolean {
  const clean = name.split("?")[0].split("#")[0]
  return /\.(jpe?g|png|webp|gif|avif|bmp|heic)$/i.test(clean)
}

/** 記事のリンク先として扱わないホスト (サービス本体とミラー) */
const INTERNAL_HOSTS = ["pawchive.pw", "fanbox.cc", "patreon.com"]

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif|bmp|heic)$/i

/** 画像ファイルへの直リンクか (`?f=name.jpg` 形式も含む) */
export function isImageFileUrl(href: string): boolean {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  if (IMAGE_EXTENSION.test(url.pathname)) return true
  const name = url.searchParams.get("f")
  return !!name && IMAGE_EXTENSION.test(name)
}

export function isInternalHost(host: string): boolean {
  const lower = host.toLowerCase()
  return INTERNAL_HOSTS.some((internal) => lower === internal || lower.endsWith(`.${internal}`))
}

/** 投稿本文から外部ページの URL を集める (重複除去・最大 10 件) */
export function collectExternalLinks(
  hrefs: Iterable<string>,
  baseUrl?: string,
  limit = 10,
): string[] {
  const links: string[] = []
  const seen = new Set<string>()
  for (const href of hrefs) {
    const trimmed = href.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("mailto:")) continue
    let url: URL
    try {
      url = new URL(trimmed, baseUrl)
    } catch {
      continue
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue
    if (isInternalHost(url.hostname)) continue
    const absolute = url.toString()
    if (seen.has(absolute)) continue
    seen.add(absolute)
    links.push(absolute)
    if (links.length >= limit) break
  }
  return links
}
