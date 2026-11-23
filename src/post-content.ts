import { proxyFileUrl, proxyLinkUrl } from "./api"

/** 投稿本文 HTML を最小限サニタイズして返す。
 *  リファラーチェックでブロックされるホストの画像はプロキシ経由に、
 *  外部リンクはリファラー偽装プロキシ経由に書き換える。 */
export function sanitizePostContent(html: string, service?: string, postId?: string, refererUrl?: string): string {
  if (!html) return ""
  const doc = new DOMParser().parseFromString(html, "text/html")
  for (const el of Array.from(doc.querySelectorAll("script,style,iframe,object,embed,link,meta"))) {
    el.remove()
  }
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on") || (name === "href" && attr.value.trim().toLowerCase().startsWith("javascript"))) {
        el.removeAttribute(attr.name)
      }
    }
  }
  // 本文中の画像: fanbox / patreon のホットリンク対策を回避
  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src") || ""
    const proxied = proxyFileUrl(src, service, postId, refererUrl)
    if (proxied && proxied !== src) {
      img.setAttribute("src", proxied)
      img.setAttribute("loading", "lazy")
      img.setAttribute("decoding", "async")
    }
  }
  // 外部リンク: リファラー偽装プロキシ経由に (新規タブで開く)
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") || ""
    if (/^(#|mailto:|javascript:|tel:)/i.test(href)) continue
    const proxied = proxyLinkUrl(href, service, postId, refererUrl)
    if (proxied && proxied !== href) {
      a.setAttribute("href", proxied)
      a.setAttribute("target", "_blank")
      a.setAttribute("rel", "noopener")
    }
  }
  return doc.body.innerHTML
}
