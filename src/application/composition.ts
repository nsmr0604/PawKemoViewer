import { creatorIndexRepository } from "../infrastructure/creator-index-repository"
import { createLocaleRepository } from "../infrastructure/locale-repository"
import { createCreatorUseCases } from "./creators"
import { createHomePostUseCase, createCreatorPostUseCase } from "./post-pages"
import { api, apiStatus } from "../api"
import { logError, logInfo, logWarn } from "../log"
import { createPostDetailUseCases } from "./post-detail"
import { validateExternalLocale, refreshLocales } from "../i18n"
import { createLocaleUseCases, exportPrivateLocaleToFolder } from "./locales"
import { getPlatformRuntime } from "../platform/runtime"
import { DEBUG_DIAG } from "../build-flags"

function createApplication() {
  const services = getPlatformRuntime().services
  const locales = createLocaleRepository(services.locale)
  const validateLocale = (json: string) => validateExternalLocale(json).issues
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
    locales: DEBUG_DIAG ? createLocaleUseCases(locales, validateLocale, services.localePicker) : undefined,
    exportLocaleToFolder: (code: string) => exportPrivateLocaleToFolder(locales, code, validateLocale),
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
