import type { CreatorIndexRepository } from "./creator-index-repository"

export function createCreatorUseCases(repository: CreatorIndexRepository) {
  async function downloadIndex(signal?: AbortSignal) {
    signal?.throwIfAborted()
    const rows = await repository.fetchRows()
    signal?.throwIfAborted()
    await repository.save(rows)
    return rows.length
  }

  return {
    countCreators: repository.count,

    async searchCreatorIndex(value: string) {
      const { rows, postId, service } = await repository.search(value, 100000)
      const first = rows[0]
      const postLink = postId && service && first?.service === service
        ? { service, creatorId: first.id, postId, name: first.name }
        : null
      return { rows, postLink }
    },

    async needsCreatorIndexBuild(count: number) {
      return count === 0 || !(await repository.isCurrent())
    },

    async buildCreatorIndex(count: number, signal?: AbortSignal) {
      signal?.throwIfAborted()
      const legacy = count > 0 ? await repository.legacyRows() : []
      signal?.throwIfAborted()
      if (legacy.length && legacy.every((row) => row.publicIdLower !== undefined && row.updated !== undefined)) {
        repository.resetIndex()
        await repository.save(legacy)
        return legacy.length
      }
      return downloadIndex(signal)
    },

    refreshCreatorIndex(signal?: AbortSignal) {
      signal?.throwIfAborted()
      repository.clearApiCache()
      repository.resetIndex()
      return downloadIndex(signal)
    },
  }
}
