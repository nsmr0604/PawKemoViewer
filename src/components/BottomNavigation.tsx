import { createPortal } from "react-dom"
import { t } from "../i18n"
import { navigate } from "../router"
import { NavIcon } from "./NavigationRail"
import { navigationItems } from "./navigation-items"

export function BottomNavigation({ currentPath, followCount }: { currentPath: string; followCount: number }) {
  return createPortal(
    <nav className="bottom-nav" aria-label={t("nav.primary")}>
      {navigationItems(currentPath, followCount).map(({ path, label, icon, active, badge }) => (
        <button
          key={path}
          type="button"
          className={active ? "nav-active" : ""}
          onClick={() => navigate(path)}
          aria-current={active ? "page" : undefined}
        >
          <span className="bottom-nav-icon">
            <NavIcon name={icon} />
            {badge !== undefined && badge > 0 && <small className="bottom-nav-badge" aria-label={String(badge)}>{badge > 99 ? "99+" : badge}</small>}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>,
    document.body,
  )
}
