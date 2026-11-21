import { getPlatformRuntime } from "../platform/runtime"

function createApplication() {
  return {
    localeService: getPlatformRuntime().services.locale,
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
