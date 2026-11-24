import { api } from "./api"
import { getApplication } from "./application/composition"
import type { PostContext } from "./domain/post-identity"
import type { OriginalPostLink } from "./original-post-link"

export async function resolveOriginalPost(
  link: OriginalPostLink, current: PostContext, label: string,
): Promise<PostContext | null> {
  const { service, postId, creatorSlug } = link
  const candidates = new Set<string>()
  if (creatorSlug) {
    const index = await getApplication().creators.searchCreatorIndex(creatorSlug).catch(() => null)
    const exact = index?.rows.find(row => row.service === service && row.publicIdLower === creatorSlug)
    const remote = exact ?? (await api.creators().catch(() => [])).find(row =>
      row.service === service && row.public_id?.toLowerCase() === creatorSlug)
    if (remote) candidates.add(String(remote.id))
  }

  if (service === current.service) candidates.add(current.creatorId)
  for (const creatorId of candidates) {
    const post = await api.post(service, creatorId, postId).catch(() => null)
    if (post && post.service === service && String(post.id) === postId && String(post.user) === creatorId) {
      return { service, postId, creatorId }
    }
  }

  // 投稿だけの URL には投稿者 ID が無い。検索結果から投稿 ID を完全一致で確認する。
  const cleanedLabel = label.trim().slice(0, 120)
  const queries = new Set([link.titleQuery, /^https?:/i.test(cleanedLabel) ? undefined : cleanedLabel, postId])
  for (const q of queries) {
    if (!q || q.length < 3) continue
    const posts = await api.posts({ q }).catch(() => [])
    const post = posts.find(row => row.service === service && String(row.id) === postId && row.user)
    if (post) return { service, postId, creatorId: String(post.user) }
  }
  return null
}
