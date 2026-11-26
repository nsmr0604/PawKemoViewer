import { isLocalHost, isPawchiveHost, proxyFileUrl } from "./api"
import { isSafeHttpUrl } from "./safe-url"

/** 險ｱ蜿ｯ縺励↑縺・ｦ∫ｴ縲ゅヵ繧ｩ繝ｼ繝繧・沂繧∬ｾｼ縺ｿ縺ｯ譛ｬ譁・・陦ｨ遉ｺ縺ｫ荳崎ｦ√〒縲・・遘ｻ繝ｻ蜈･蜉帙・隱伜ｰ弱↓菴ｿ縺医ｋ縲・*/
const DROPPED_TAGS = "script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select"

/** URL 繧呈戟縺､螻樊ｧ縲Ｉttp / https 莉･螟・(javascript:, data:, file: 縺ｪ縺ｩ) 縺ｯ蜑企勁縺吶ｋ縲・*/
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

/** URL 縺ｮ荳隕ｧ繧呈戟縺､螻樊ｧ縲・*/
const URL_LIST_ATTRIBUTES = new Set(["srcset"])

/**
 * 謚慕ｨｿ譛ｬ譁・HTML 繧呈怙蟆城剞繧ｵ繝九ち繧､繧ｺ縺励※霑斐☆縲・ *
 * - script / style / 蝓九ａ霎ｼ縺ｿ / 繝輔か繝ｼ繝繧貞炎髯､
 * - `on*` 螻樊ｧ縺ｨ `srcdoc` 繧貞炎髯､
 * - URL 螻樊ｧ縺ｯ http / https 縺ｮ縺ｿ險ｱ蜿ｯ (`javascript:` 縺ｮ髮｣隱ｭ蛹悶ｒ蜷ｫ繧√※ `new URL` 縺ｧ蛻､螳・
 * - 繝帙ャ繝医Μ繝ｳ繧ｯ蟇ｾ遲悶・繧ｹ繝医・逕ｻ蜒上・ pkv 邨檎罰縺ｫ譖ｸ縺肴鋤縺・ * - 螟夜Κ繝ｪ繝ｳ繧ｯ縺ｫ縺ｯ蜈・URL 繧呈ｮ九＠縲√け繝ｪ繝・け譎ゅ↓螳溘が繝ｪ繧ｸ繝ｳ縺ｮ繝薙Η繝ｼ縺ｸ貂｡縺・ */
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
        // 蜷御ｸ繝壹・繧ｸ蜀・い繝ｳ繧ｫ繝ｼ縺ｨ繝｡繝ｼ繝ｫ / 髮ｻ隧ｱ縺ｯ險ｱ蜿ｯ縺吶ｋ
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
  // 譛ｬ譁・ｸｭ縺ｮ逕ｻ蜒・ fanbox / patreon 縺ｮ繝帙ャ繝医Μ繝ｳ繧ｯ蟇ｾ遲悶ｒ蝗樣∩
  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src") || ""
    const proxied = proxyFileUrl(src, service, postId, refererUrl)
    if (proxied && proxied !== src) {
      img.setAttribute("src", proxied)
      img.setAttribute("loading", "lazy")
      img.setAttribute("decoding", "async")
    }
  }
  // 螟夜Κ繝ｪ繝ｳ繧ｯ: 蜈・URL 繧呈ｮ九＠縲√け繝ｪ繝・け譎ゅ↓螳溘が繝ｪ繧ｸ繝ｳ縺ｮ繝薙Η繝ｼ縺ｧ髢九￥縲・  // (pkv 縺ｯ HTML 繧剃ｸｭ邯吶＠縺ｪ縺・◆繧√”ref 繧・pkv 縺ｸ譖ｸ縺肴鋤縺医↑縺・
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

