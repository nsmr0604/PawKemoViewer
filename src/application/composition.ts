import { toCreatorIndexRows } from "../infrastructure/creator-index-dto"
import { createLocaleRepository } from "../infrastructure/locale-repository"
import { createCreatorUseCases } from "./creators"
import { creatorsCount, getAllCreatorRows, getMeta, invalidateCreatorIndex, normalizeCreatorQuery, saveCreators, searchCreators, SEARCH_INDEX_VERSION } from "../db"
import { createHomePostUseCase, createCreatorPostUseCase } from "./post-pages"
import { api, apiStatus, clearApiCache } from "../api"
import { logError, logInfo, logWarn } from "../log"
import { createPostDetailUseCases } from "./post-detail"
import { parseLocaleJson, refreshLocales } from "../i18n"
import { createLocaleUseCases } from "./locales"
import { getPlatformRuntime } from "../platform/runtime"

function createApplication() {
  const locales = createLocaleRepository(getPlatformRuntime().services.locale)
  return {
    creators: createCreatorUseCases({
      search: searchCreators,
      normalize: normalizeCreatorQuery,
      count: creatorsCount,
      version: () => getMeta<number>("creatorsIndexVersion"),
      indexVersion: SEARCH_INDEX_VERSION,
      legacyRows: getAllCreatorRows,
      fetchRows: async () => toCreatorIndexRows(await api.creators()),
      save: saveCreators,
      resetIndex: invalidateCreatorIndex,
      clearApiCache,
    }),
    loadCreatorPosts: createCreatorPostUseCase(api.creatorPosts),
    loadCreatorProfile: api.creatorProfile,
    loadCreatorTags: api.creatorTags,
    loadOriginalCreatorUrl: api.originalCreatorUrl,
    loadHomePosts: createHomePostUseCase(api.posts),
    postDetail: createPostDetailUseCases({
      post: api.post,
      postRevisions: api.postRevisions,
      postComments: api.postComments,
      status: apiStatus,
      info: logInfo,
      warn: logWarn,
      error: logError,
    }),
    locales: createLocaleUseCases(locales, (json) => Boolean(parseLocaleJson(json))),
    refreshLocales: () => refreshLocales(locales),
  }
}

let application: ReturnType<typeof createApplication> | undefined

export function initializeApplication() {
  application ??= createApplication()
}

export function getApplication() {
  if (!application) throw new Error("Application has not been initialized")
  return application
}
