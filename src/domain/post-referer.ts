/**
 * 元サービス (FANBOX / Patreon) の記事 URL を、pawchive 側の
 * service / creatorId / postId から導出する。
 *
 * pkv プロキシの Referer に使う。外部サイトが fanbox / patreon からの
 * アクセスだけを許可している場合、記事 URL を接続元として送る必要がある。
 */

/** fanbox の creator slug (public_id) を URL に使える形へ正規化する */
export function normalizeFanboxSlug(value?: string | null): string {
  const slug = (value ?? "").trim().toLowerCase().replace(/^@/, "")
  if (!slug || slug === "www") return ""
  return /^[a-z0-9_-]+$/.test(slug) ? slug : ""
}

/**
 * 元記事 URL。fanbox は slug が分かる場合に `www.fanbox.cc/@slug/posts/{id}` の
 * 正規 URL へ組み立て、不明なら `www.fanbox.cc/posts/{id}` にする。
 * 未対応 service は undefined。
 */
export function originalPostReferer(
  service: string,
  postId: string,
  fanboxSlug?: string | null,
): string | undefined {
  const id = encodeURIComponent(postId)
  if (service === "patreon") return `https://www.patreon.com/posts/${id}`
  if (service !== "fanbox") return undefined
  const slug = normalizeFanboxSlug(fanboxSlug)
  return slug
    ? `https://www.fanbox.cc/@${slug}/posts/${id}`
    : `https://www.fanbox.cc/posts/${id}`
}
