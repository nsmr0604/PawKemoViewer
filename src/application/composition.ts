import { parseLocaleJson } from "../i18n"
import { createLocaleUseCases } from "./locales"
import { getPlatformRuntime } from "../platform/runtime"

function createApplication() {
  return {
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
