import { createHomePostUseCase } from "./post-pages"
import { api, apiStatus } from "../api"
import { logError, logInfo, logWarn } from "../log"
import { createPostDetailUseCases } from "./post-detail"
import { parseLocaleJson } from "../i18n"
import { createLocaleUseCases } from "./locales"
import { getPlatformRuntime } from "../platform/runtime"

function createApplication() {
  return {
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
    locales: createLocaleUseCases(getPlatformRuntime().services.locale, (json) => Boolean(parseLocaleJson(json))),
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
