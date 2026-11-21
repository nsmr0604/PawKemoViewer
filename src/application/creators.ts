import type { CreatorRow, normalizeCreatorQuery, searchCreators } from "../db"

type Dependencies = {
  search: typeof searchCreators
  normalize: typeof normalizeCreatorQuery
  count: () => Promise<number>
  version: () => Promise<number | undefined>
  indexVersion: number
  legacyRows: () => Promise<CreatorRow[]>
  fetchRows: () => Promise<CreatorRow[]>
  save: (rows: CreatorRow[]) => Promise<void>
  resetIndex: () => void
  clearApiCache: () => void
}

export function createCreatorUseCases(deps: Dependencies) {
  async function downloadIndex(signal?: AbortSignal) {
    signal?.throwIfAborted()
    const rows = await deps.fetchRows()
    signal?.throwIfAborted()
    await deps.save(rows)
    return rows.length
  }

  return {
    countCreators: deps.count,

    async searchCreatorIndex(value: string) {
      const rows = await deps.search(value, 100000)
      const { postId, service } = deps.normalize(value)
      const first = rows[0]
      const postLink = postId && service && first?.service === service
        ? { service, creatorId: first.id, postId, name: first.name }
        : null
      return { rows, postLink }
    },

    async needsCreatorIndexBuild(count: number) {
      return count === 0 || await deps.version() !== deps.indexVersion
    },

    async buildCreatorIndex(count: number, signal?: AbortSignal) {
      signal?.throwIfAborted()
      const legacy = count > 0 ? await deps.legacyRows() : []
      signal?.throwIfAborted()
      if (legacy.length && legacy.every((row) => row.publicIdLower !== undefined && row.updated !== undefined)) {
        deps.resetIndex()
        await deps.save(legacy)
        return legacy.length
      }
      return downloadIndex(signal)
    },

    refreshCreatorIndex(signal?: AbortSignal) {
      signal?.throwIfAborted()
      deps.clearApiCache()
      deps.resetIndex()
      return downloadIndex(signal)
    },
  }
}
