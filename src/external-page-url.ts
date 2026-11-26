/** 外部ページとして開いてよい URL か。
 *
 * Rust 側でも宛先を検査するが、本文由来の URL をそのまま渡さないよう入口でも確認する。
 * ループバック・プライベート・リンクローカルの IPv4 / IPv6 と .local を拒否する。 */
export function isAllowedExternalPageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    const host = url.hostname.toLowerCase()
    if (!host) return false
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false

    // IPv6 は角括弧付きで返る
    const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
    if (bare === "::1" || bare === "::" || bare === "0.0.0.0") return false
    if (/^f[cd][0-9a-f]{2}:/.test(bare)) return false // ユニークローカル (fc00::/7)
    if (/^fe[89ab][0-9a-f]?:/.test(bare)) return false // リンクローカル (fe80::/10)

    const parts = host.split(".")
    if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
      if (parts.some((part) => Number(part) > 255)) return false
      const [a, b] = parts.map(Number)
      if (a === 0 || a === 10 || a === 127) return false
      if (a === 169 && b === 254) return false
      if (a === 172 && b >= 16 && b <= 31) return false
      if (a === 192 && b === 168) return false
    }
    return true
  } catch {
    return false
  }
}
