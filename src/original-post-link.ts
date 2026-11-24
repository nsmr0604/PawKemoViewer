export interface OriginalPostLink {
  service: "fanbox" | "patreon"
  postId: string
  creatorSlug?: string
  titleQuery?: string
}

export function parseOriginalPostLink(href: string): OriginalPostLink | null {
  let url: URL
  try {
    const value = href.trim()
    url = new URL(value.startsWith("//") ? `https:${value}` : value)
  } catch {
    return null
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null
  const host = url.hostname
  const path = url.pathname
  if (host === "fanbox.cc" || host === "www.fanbox.cc") {
    const match = path.match(/^\/@([a-z0-9_-]+)\/posts\/(\d+)\/?$/i)
    if (match) return { service: "fanbox", creatorSlug: match[1].toLowerCase(), postId: match[2] }
    const bare = path.match(/^\/posts\/(\d+)\/?$/)
    return bare ? { service: "fanbox", postId: bare[1] } : null
  }
  const fanbox = host.match(/^([a-z0-9_-]+)\.fanbox\.cc$/)
  if (fanbox) {
    const match = path.match(/^\/posts\/(\d+)\/?$/)
    return match ? { service: "fanbox", creatorSlug: fanbox[1], postId: match[1] } : null
  }
  if (host !== "patreon.com" && host !== "www.patreon.com") return null
  const match = path.match(/^\/(?:@?([a-z0-9_-]+)\/)?posts\/(?:([^/]+)-)?(\d+)\/?$/i)
  if (!match) return null
  const [, creatorSlug, titleSlug, postId] = match
  return { service: "patreon", creatorSlug: creatorSlug?.toLowerCase(), postId, titleQuery: titleSlug?.replace(/-/g, " ") }
}
