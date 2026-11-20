// This module is dynamically imported only by diagnostic builds.
const CHUNK_LEN = 1800

export function splitDebugLog(message: string): string[] {
  if (message.length <= CHUNK_LEN) return [message]
  const total = Math.ceil(message.length / CHUNK_LEN)
  return Array.from({ length: total }, (_, index) =>
    `[part ${index + 1}/${total}] ${message.slice(index * CHUNK_LEN, (index + 1) * CHUNK_LEN)}`,
  )
}
