import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { getSettings, initializeSettingsStorage } from "./api"
import { loadLocale } from "./i18n"
import { initializePlatformRuntime } from "./platform/runtime"
import { getApplication, initializeApplication } from "./application/composition"
import { applyHttpUserAgent } from "./http-user-agent"
import "./styles.css"

// Platform foundation is initialized before locale loading and UI mount.
async function bootstrap() {
  initializePlatformRuntime()
  initializeApplication()
  initializeSettingsStorage()
  await applyHttpUserAgent()
  await getApplication().refreshLocales()
  await loadLocale(getSettings().locale)
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
