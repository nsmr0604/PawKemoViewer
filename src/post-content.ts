import { isLocalHost, isPawchiveHost, proxyFileUrl } from "./api"
import { isSafeHttpUrl } from "./safe-url"

/** 許可しない要素。フォームや埋め込みは本文の表示に不要で、誤操作・入力の隠れ蓑に使える。 */
const DROPPED_TAGS = "script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select"

/** URL を持つ属性。http / https 以外 (javascript:, data:, file: など) は削除する。 */
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "poster",
  "action",
  "formaction",
  "xlink:href",
  "background",
  "cite",
])

/** URL の一覧を持つ属性。 */
const URL_LIST_ATTRIBUTES = new Set(["srcset"])

/**
 * 投稿本文 HTML を最小限にサニタイズして返す。
 *
 * - script / style / 読み込み / フォームを削除
 * - `on*` 属性と `srcdoc` を削除
 * - URL 属性は http / https のみ許可 (`javascript:` の誤読化を含めて `new URL` で判定)
 * - ホットリンク対策のストック画像は pkv 経由に書き換え
 * - 外部リンクには元 URL を残し、クリック時に実オリジンのビューへ渡す
 */
export function sanitizePostContent(html: string, service?: string, postId?: string, refererUrl?: string): string {
  if (!html) return ""
  const doc = new DOMParser().parseFromString(html, "text/html")
  for (const el of Array.from(doc.querySelectorAll(DROPPED_TAGS))) {
    el.remove()
  }
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on") || name === "srcdoc") {
        el.removeAttribute(attr.name)
        continue
      }
      if (URL_ATTRIBUTES.has(name)) {
        const value = attr.value.trim()
        // 同一ページ内アンカーとメール / 電話は許可する
        if (name === "href" && (value.startsWith("#") || /^(mailto:|tel:)/i.test(value))) continue
        if (!isSafeHttpUrl(value)) el.removeAttribute(attr.name)
        continue
      }
      if (URL_LIST_ATTRIBUTES.has(name)) {
        const kept = attr.value
          .split(",")
          .map((candidate) => candidate.trim())
          .filter((candidate) => candidate && isSafeHttpUrl(candidate.split(/\s+/)[0]))
        if (kept.length > 0) el.setAttribute(attr.name, kept.join(", "))
        else el.removeAttribute(attr.name)
      }
    }
  }
  // 本文中の画像は fanbox / patreon のホットリンク対策を回避
  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src") || ""
    const proxied = proxyFileUrl(src, service, postId, refererUrl)
    if (proxied && proxied !== src) {
      img.setAttribute("src", proxied)
      img.setAttribute("loading", "lazy")
      img.setAttribute("decoding", "async")
    }
  }
  // 外部リンク: 元 URL を残し、クリック時に実オリジンのビューで開く。
  // (pkv は HTML を中継しないため、href を pkv へ書き換えない)
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") || ""
    if (!/^https?:\/\//i.test(href)) continue
    let host = ""
    try {
      host = new URL(href).hostname
    } catch {
      continue
    }
    if (!host) continue
    if (isPawchiveHost(host) || isLocalHost(host)) continue
    a.setAttribute("data-external-url", href)
    a.setAttribute("target", "_blank")
    a.setAttribute("rel", "noopener")
  }
  return doc.body.innerHTML
}


/** コメントなどが HTML かプレーンテキストかをざっくり判別する。 */
export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value)
}
