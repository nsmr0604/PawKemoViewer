import { Component, type ReactNode } from "react"
import { t } from "../i18n"

interface ErrorBoundaryState {
  error: Error | null
}

/** 描画例外でアプリ全体が白画面になるのを防ぎ、再読み込みの導線を出す。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="page error-page" role="alert">
        <h1 className="page-title">{t("app.errorTitle")}</h1>
        <p className="small">{error.message}</p>
        <div className="settings-actions">
          <button className="btn btn-primary" type="button" onClick={() => location.reload()}>
            {t("app.errorReload")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              location.hash = "#/"
              location.reload()
            }}
          >
            {t("app.errorHome")}
          </button>
        </div>
      </div>
    )
  }
}
