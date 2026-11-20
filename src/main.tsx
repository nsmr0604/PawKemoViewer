import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { getSettings, initializeSettingsStorage } from "./api"
import { loadLocale, refreshLocales } from "./i18n"
import { initializePlatformRuntime } from "./platform/runtime"
import "./styles.css"

// Platform foundation is initialized before locale loading and UI mount.
// Adapters are intentionally not wired yet; this is the incremental migration boundary.
async function bootstrap() {
  initializePlatformRuntime()
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
