import React, { useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { AgeGate } from "./components/AgeGate"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { getSettings, initializeSettingsStorage, updateSettings, SETTINGS_CHANGED_EVENT } from "./api"
import { loadLocale } from "./i18n"
import { initializePlatformRuntime } from "./platform/runtime"
import { getApplication, initializeApplication } from "./application/composition"
import { applyHttpUserAgent } from "./http-user-agent"
import "./styles.css"

/** 年齢確認が済むまでアプリ本体を描画しない。 */
function Root() {
  const [ageVerified, setAgeVerified] = useState(() => getSettings().ageVerified)
  useEffect(() => {
    const update = () => setAgeVerified(getSettings().ageVerified)
    window.addEventListener(SETTINGS_CHANGED_EVENT, update)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, update)
  }, [])
  if (!ageVerified) {
    return (
      <AgeGate
        onAccept={() => {
          updateSettings({ ageVerified: true })
          setAgeVerified(true)
        }}
      />
    )
  }
  return <App />
}

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
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </React.StrictMode>,
  )
}

void bootstrap()
