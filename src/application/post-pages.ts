import type { PawPost } from "../types"

export const POST_PAGE_SIZE = 50

function postPage(posts: PawPost[]) {
  return { posts, done: posts.length < POST_PAGE_SIZE }
}

type HomePosts = (options: { q?: string; o: number }) => Promise<PawPost[]>
type CreatorPosts = (service: string, id: string, options: { tag?: string[]; o: number }) => Promise<PawPost[]>

export function createHomePostUseCase(posts: HomePosts) {
  return async ({ query, offset }: { query: string; offset: number }) => {
    return postPage(await posts({ q: query || undefined, o: offset }))
  }
}

export function createCreatorPostUseCase(posts: CreatorPosts) {
  return async ({ service, id, tags, offset }: { service: string; id: string; tags: string[]; offset: number }) => {
    return postPage(await posts(service, id, { tag: tags.length ? tags : undefined, o: offset }))
  }
}
