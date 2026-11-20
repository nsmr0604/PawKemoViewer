import { navigate } from "../router"
import { t } from "../i18n"

export type NavIconName = "home" | "creators" | "favorites" | "settings" | "account"

export function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  }
  switch (name) {
    case "home":
      return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-7h6v7" /></svg>
    case "creators":
      return <svg {...common}><circle cx="9" cy="8" r="4" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0M16 4.5a4 4 0 0 1 0 7.5M18 15a5.5 5.5 0 0 1 3.5 5" /></svg>
    case "favorites":
      return <svg {...common}><path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z" /></svg>
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2 2.1-2 2-2.1-1.2-.2.1a8 8 0 0 1-1.7.7l-.6 2.2h-2.8l-.6-2.2a8 8 0 0 1-1.7-.7l-.2-.1-2.1 1.2-2-2 1.2-2.1-.1-.2a8 8 0 0 1-.7-1.7L1.9 12v-2.8l2.2-.6a8 8 0 0 1 .7-1.7l.1-.2-1.2-2.1 2-2 2.1 1.2.2-.1a8 8 0 0 1 1.7-.7l.6-2.2h2.8l.6 2.2a8 8 0 0 1 1.7.7l.2.1 2.1-1.2 2 2-1.2 2.1.1.2a8 8 0 0 1 .7 1.7l2.2.6V12l-2.2.6a8 8 0 0 1-.7 1.7Z" transform="translate(1 1) scale(.92)" /></svg>
    case "account":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
  }
}

export interface NavigationRailProps {
  currentPath: string
  followCount: number
  hasSession: boolean
}

export function NavigationRail({ currentPath, followCount, hasSession }: NavigationRailProps) {
  const items: { path: string; label: string; icon: NavIconName; active: boolean; badge?: number }[] = [
    { path: "/", label: t("nav.home"), icon: "home", active: currentPath === "home" || currentPath === "search" },
    { path: "/creators", label: t("nav.creators"), icon: "creators", active: currentPath === "creators" || currentPath === "creator" },
    { path: "/favorites", label: t("nav.favorites"), icon: "favorites", active: currentPath === "favorites", badge: followCount },
    { path: "/settings", label: t("nav.settings"), icon: "settings", active: currentPath === "settings" },
  ]

  return (
    <aside className="nav-rail">
      <div className="nav-rail-top">
        <button className="nav-rail-brand" onClick={() => navigate("/", true)} title="PawKemoViewer">
          <span className="nav-rail-brand-icon">🐾</span>
          <span className="nav-rail-brand-copy">
            <strong>PawKemoViewer</strong>
            <small>pawchive client</small>
          </span>
        </button>
      </div>

      <nav className="nav-rail-items" aria-label={t("nav.primary")}>
        <span className="nav-rail-caption">{t("nav.menu")}</span>
        {items.map((item) => (
          <button
            key={item.path}
            type="button"
            className={`nav-rail-btn ${item.active ? "active" : ""}`}
            onClick={() => navigate(item.path, item.path === "/")}
            aria-current={item.active ? "page" : undefined}
          >
            <span className="nav-rail-icon"><NavIcon name={item.icon} /></span>
            <span className="nav-rail-label">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="nav-rail-badge">{item.badge > 99 ? "99+" : item.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="nav-rail-bottom">
        <button
          type="button"
          className="nav-rail-account"
          onClick={() => navigate(hasSession ? "/settings" : "/login")}
        >
          <span className="nav-rail-account-icon"><NavIcon name="account" /></span>
          <span className="nav-rail-account-copy">
            <strong>{hasSession ? t("nav.account") : t("nav.login")}</strong>
            <small>{hasSession ? t("nav.accountConnected") : t("nav.accountGuest")}</small>
          </span>
          <span className={`nav-rail-status ${hasSession ? "is-connected" : ""}`} />
        </button>
        <div className="nav-rail-shortcut">{t("nav.keyboardHint")}</div>
      </div>
    </aside>
  )
}
