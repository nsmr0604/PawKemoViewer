import type { api } from "../api"
import type { CreatorRow, normalizeCreatorQuery, searchCreators } from "../db"
import type { PawCreator } from "../types"

type Dependencies = {
  search: typeof searchCreators
  normalize: typeof normalizeCreatorQuery
  count: () => Promise<number>
  version: () => Promise<number | undefined>
  indexVersion: number
  legacyRows: () => Promise<CreatorRow[]>
  fetchCreators: typeof api.creators
  save: (rows: CreatorRow[]) => Promise<void>
  resetIndex: () => void
  clearApiCache: () => void
}

/** API の日時値 (Unix 秒/ミリ秒または ISO 文字列) を比較用数値へ変換 */
function toTimestamp(value: number | string | undefined): number {
  if (value === undefined || value === "") return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

/** API レスポンス → 索引行 (slug / 人気度 / 更新日を保持) */
function toRow(c: PawCreator): CreatorRow {
  const slug = (c.public_id || "").toLowerCase()
  return {
    key: `${c.service}:${c.id}`,
    id: c.id,
    service: c.service,
    name: c.name,
    nameLower: (c.name || "").toLowerCase(),
    ...(slug ? { publicId: c.public_id, publicIdLower: slug } : {}),
    ...(c.favorited !== undefined ? { favorited: Number(c.favorited) || 0 } : {}),
    ...(c.updated !== undefined ? { updated: toTimestamp(c.updated) } : {}),
    ...(c.indexed !== undefined ? { indexed: toTimestamp(c.indexed) } : {}),
  }
}

export function createCreatorUseCases(deps: Dependencies) {
  async function downloadIndex(signal?: AbortSignal) {
    signal?.throwIfAborted()
    const all = await deps.fetchCreators()
    signal?.throwIfAborted()
    const rows = all.map(toRow)
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
