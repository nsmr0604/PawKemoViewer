import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { getSettings, initializeSettingsStorage } from "./api"
import { loadLocale, refreshLocales } from "./i18n"
import { initializePlatformRuntime } from "./platform/runtime"
import { initializeApplication } from "./application/composition"
import "./styles.css"

// Platform foundation is initialized before locale loading and UI mount.
async function bootstrap() {
  initializePlatformRuntime()
  initializeApplication()
  initializeSettingsStorage()
  await refreshLocales()
  await loadLocale(getSettings().locale)
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
