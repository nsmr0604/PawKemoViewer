import type { api } from "../api"

import { isValidPostContext, type PostContext } from "../domain/post-identity"

type Dependencies = Pick<typeof api, "post" | "postRevisions" | "postComments"> & {
  status: (error: unknown) => number | null
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

export function createPostDetailUseCases(deps: Dependencies) {
  return {
    async loadPostDetail(context: PostContext, signal?: AbortSignal) {
      const { service, creatorId, postId } = context
      const label = `service=${service} creatorId=${creatorId} postId=${postId}`
      if (!isValidPostContext(context)) {
        const message = `投稿識別子が不正です: ${label}`
        deps.error(message)
        throw new Error(message)
      }
      signal?.throwIfAborted()
      deps.info(`投稿詳細取得開始 ${label}`)
      const post = await deps.post(service, creatorId, postId)
      signal?.throwIfAborted()
      if (String(post.service) !== service || String(post.user) !== creatorId || String(post.id) !== postId) {
        deps.warn(`投稿API応答の識別子不一致 requested=${service}/${creatorId}/${postId} response=${String(post.service)}/${String(post.user)}/${String(post.id)}`)
      }
      const fileCount = (post.file?.path ? 1 : 0) + (post.attachments?.length || 0)
      deps.info(`投稿詳細取得完了 ${label} files=${fileCount}`)

      try {
        const result = await deps.postRevisions(service, creatorId, postId)
        signal?.throwIfAborted()
        const revisions = (Array.isArray(result) ? result : []).slice().sort((a, b) => {
          const aTime = Date.parse(a.added || "")
          const bTime = Date.parse(b.added || "")
          if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
          if (Number.isNaN(aTime)) return 1
          if (Number.isNaN(bTime)) return -1
          return bTime - aTime
        })
        deps.info(`投稿改訂履歴取得完了 ${label} revisions=${revisions.length}`)
        return { post, revisions, revisionsError: null }
      } catch (error) {
        signal?.throwIfAborted()
        if (deps.status(error) === 404) {
          deps.info(`投稿改訂履歴なし (404) ${label}`)
          return { post, revisions: [], revisionsError: null }
        }
        deps.error(`投稿改訂履歴取得失敗 ${label}: ${error instanceof Error ? error.message : String(error)}`)
        return { post, revisions: [], revisionsError: error }
      }
    },

    async loadPostComments({ service, creatorId, postId }: PostContext) {
      try {
        return await deps.postComments(service, creatorId, postId)
      } catch {
        return []
      }
    },
  }
}
