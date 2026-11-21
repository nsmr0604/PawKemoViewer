import { creatorIndexRepository } from "../infrastructure/creator-index-repository"
import { createLocaleRepository } from "../infrastructure/locale-repository"
import { createCreatorUseCases } from "./creators"
import { createHomePostUseCase, createCreatorPostUseCase } from "./post-pages"
import { api, apiStatus } from "../api"
import { logError, logInfo, logWarn } from "../log"
import { createPostDetailUseCases } from "./post-detail"
import { parseLocaleJson, refreshLocales } from "../i18n"
import { createLocaleUseCases } from "./locales"
import { getPlatformRuntime } from "../platform/runtime"

function createApplication() {
  const locales = createLocaleRepository(getPlatformRuntime().services.locale)
  return {
    creators: createCreatorUseCases(creatorIndexRepository),
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
