import type { api } from "../api"
import type { PawPost } from "../types"

export const POST_PAGE_SIZE = 50

function postPage(posts: PawPost[]) {
  return { posts, done: posts.length < POST_PAGE_SIZE }
}

export function createHomePostUseCase(posts: typeof api.posts) {
  return async ({ query, offset }: { query: string; offset: number }) => {
    return postPage(await posts({ q: query || undefined, o: offset }))
  }
}
