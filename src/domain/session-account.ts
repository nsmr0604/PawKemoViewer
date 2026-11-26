/**
 * pawchive の session Cookie から account_id を取り出す。
 *
 * session は `<base64url(JSON)>.<timestamp>.<signature>` 形式で、JSON は
 * `{"_permanent":true,"account_id":558155}` のような内容です。
 * ログイン画面を経由せずに session だけが復元された場合でも、
 * どのアカウントでログインしているかを表示できるようにするために使います。
 *
 * 解析できない場合は null を返します (呼び出し側は「不明」表示のままにします)。
 * ドメイン層は ES2022 の範囲だけで動かすため、`atob` や `TextDecoder` は使わず
 * base64url を自前で復号します。
 */

const ACCOUNT_ID_KEY = "account_id"
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function accountIdFromSession(sessionKey: string): string | null {
  const [payload] = sessionKey.split(".")
  if (!payload) return null
  const decoded = decodeBase64Url(payload)
  if (!decoded) return null
  try {
    const value: unknown = JSON.parse(decoded)
    if (!value || typeof value !== "object") return null
    const accountId = (value as Record<string, unknown>)[ACCOUNT_ID_KEY]
    if (typeof accountId === "number" && Number.isFinite(accountId)) {
      return String(Math.trunc(accountId))
    }
    if (typeof accountId === "string" && accountId.trim()) return accountId.trim()
    return null
  } catch {
    return null
  }
}

/** base64url を ASCII 文字列へ復号する。JSON は ASCII 前提。 */
function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "")
  if (!normalized || !/^[A-Za-z0-9+/]+$/.test(normalized)) return null
  if (normalized.length % 4 === 1) return null

  let buffer = 0
  let bits = 0
  let out = ""
  for (const char of normalized) {
    const index = BASE64_ALPHABET.indexOf(char)
    if (index < 0) return null
    buffer = (buffer << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  return out
}
