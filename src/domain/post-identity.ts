export interface PostContext {
  service: string
  creatorId: string
  postId: string
}

function isValidId(value: string): boolean {
  return typeof value === "string" && !!value.trim() &&
    value !== "undefined" && value !== "null" && !value.includes("/")
}

export function isValidPostContext({ service, creatorId, postId }: PostContext): boolean {
  return (service === "fanbox" || service === "patreon") && isValidId(creatorId) && isValidId(postId)
}
