import { api, clearApiCache } from "../api"
import type { CreatorIndexRepository } from "../application/creator-index-repository"
import {
  creatorsCount, getAllCreatorRows, getMeta, invalidateCreatorIndex, normalizeCreatorQuery,
  saveCreators, searchCreators, SEARCH_INDEX_VERSION,
} from "../db"
import { toCreatorIndexRows } from "./creator-index-dto"

export const creatorIndexRepository: CreatorIndexRepository = {
  count: creatorsCount,
  isCurrent: async () => await getMeta<number>("creatorsIndexVersion") === SEARCH_INDEX_VERSION,
  async search(query, limit) {
    const rows = await searchCreators(query, limit)
    const { service, postId } = normalizeCreatorQuery(query)
    return { rows, service, postId }
  },
  legacyRows: getAllCreatorRows,
  fetchRows: async () => toCreatorIndexRows(await api.creators()),
  save: saveCreators,
  resetIndex: invalidateCreatorIndex,
  clearApiCache,
}
