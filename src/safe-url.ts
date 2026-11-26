/**
 * 投稿本文など、外部由来の HTML に含まれる URL を安全に扱うための判定。
 *
 * `javascript:` は URL パーサがタブ・改行・先頭の空白を除去してから解釈するため、
 * `java&#9;script:` のような難読化も `new URL()` を通せば `javascript:` として
 * 判定できます。ここでは http / https 以外をすべて拒否します。
 */

const FALLBACK_BASE = "https://pawkemoviewer.invalid/"

/** `value` が http / https の URL として解釈できるか。相対 URL は `base` で解決する。 */
export function isSafeHttpUrl(value: string, base: string = FALLBACK_BASE): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const url = new URL(trimmed, base)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
