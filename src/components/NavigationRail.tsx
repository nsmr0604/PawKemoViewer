import { navigate } from "../router"
import { t } from "../i18n"

export interface NavigationRailProps {
  currentPath: string
  followCount: number
}

/**
 * デスクトップ用ナビゲーションレール (JHenTai の左アイコンレール型)
 * デスクトップの横長画面で無駄な縦スペースを消費せず、左側に固定配置する
 */
export function NavigationRail({ currentPath, followCount }: NavigationRailProps) {
  const isHome = currentPath === "home" || currentPath === "search"
  const isCreators = currentPath === "creators" || currentPath === "creator"
  const isFavorites = currentPath === "favorites"
  const isSettings = currentPath === "settings"

  return (
    <aside className="nav-rail">
      <div className="nav-rail-top">
        <div className="nav-rail-logo" onClick={() => navigate("/", true)} title="PawKemoViewer">
          🐾
        </div>
      </div>

      <nav className="nav-rail-items">
        <button
          className={`nav-rail-btn ${isHome ? "active" : ""}`}
          onClick={() => navigate("/", true)}
          title={`${t("nav.home")} (H)`}
        >
          <span className="nav-rail-icon">🏠</span>
          <span className="nav-rail-label">{t("nav.home")}</span>
        </button>

        <button
          className={`nav-rail-btn ${isCreators ? "active" : ""}`}
          onClick={() => navigate("/creators")}
          title={`${t("nav.creators")} (C)`}
        >
          <span className="nav-rail-icon">👤</span>
          <span className="nav-rail-label">{t("nav.creators")}</span>
        </button>

        <button
          className={`nav-rail-btn ${isFavorites ? "active" : ""}`}
          onClick={() => navigate("/favorites")}
          title={`${t("nav.favorites")} (F)`}
        >
          <span className="nav-rail-icon">
            ⭐
            {followCount > 0 && <span className="nav-rail-badge">{followCount}</span>}
          </span>
          <span className="nav-rail-label">{t("nav.favorites")}</span>
        </button>

        <button
          className={`nav-rail-btn ${isSettings ? "active" : ""}`}
          onClick={() => navigate("/settings")}
          title={`${t("nav.settings")} (S)`}
        >
          <span className="nav-rail-icon">⚙️</span>
          <span className="nav-rail-label">{t("nav.settings")}</span>
        </button>
      </nav>

      <div className="nav-rail-bottom">
        <div className="nav-rail-hint" title={t("nav.shortcuts")}>
          ⌨️
        </div>
      </div>
    </aside>
  )
}
