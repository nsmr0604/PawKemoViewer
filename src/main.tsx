import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { getSettings } from "./api"
import { loadLocale, refreshLocales } from "./i18n"
import "./styles.css"

// 初回描画の前に外部の言語ファイルを読み込み、選択中の言語を適用する。
// ファイルが無い / 読込失敗した場合は i18n 側で日本語にフォールバックする。
async function bootstrap() {
  await refreshLocales()
  await loadLocale(getSettings().locale)
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
