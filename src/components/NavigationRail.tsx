import { navigate } from "../router"

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
        <div className="nav-rail-logo" onClick={() => navigate("/", true)} title="Pawchive Viewer">
          🐾
        </div>
      </div>

      <nav className="nav-rail-items">
        <button
          className={`nav-rail-btn ${isHome ? "active" : ""}`}
          onClick={() => navigate("/", true)}
          title="ホーム (H)"
        >
          <span className="nav-rail-icon">🏠</span>
          <span className="nav-rail-label">ホーム</span>
        </button>

        <button
          className={`nav-rail-btn ${isCreators ? "active" : ""}`}
          onClick={() => navigate("/creators")}
          title="クリエイター (C)"
        >
          <span className="nav-rail-icon">👤</span>
          <span className="nav-rail-label">クリエイター</span>
        </button>

        <button
          className={`nav-rail-btn ${isFavorites ? "active" : ""}`}
          onClick={() => navigate("/favorites")}
          title="フォロー (F)"
        >
          <span className="nav-rail-icon">
            ⭐
            {followCount > 0 && <span className="nav-rail-badge">{followCount}</span>}
          </span>
          <span className="nav-rail-label">フォロー</span>
        </button>

        <button
          className={`nav-rail-btn ${isSettings ? "active" : ""}`}
          onClick={() => navigate("/settings")}
          title="設定 (S)"
        >
          <span className="nav-rail-icon">⚙️</span>
          <span className="nav-rail-label">設定</span>
        </button>
      </nav>

      <div className="nav-rail-bottom">
        <div className="nav-rail-hint" title="ショートカット: Esc=戻る / H=ホーム / C=作者 / F=フォロー / S=設定">
          ⌨️
        </div>
      </div>
    </aside>
  )
}
