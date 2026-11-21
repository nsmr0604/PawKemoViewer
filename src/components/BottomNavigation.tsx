import { t } from "../i18n"
import { navigate } from "../router"
import { NavIcon } from "./NavigationRail"
import { navigationItems } from "./navigation-items"

export function BottomNavigation({ currentPath, followCount }: { currentPath: string; followCount: number }) {
  return (
    <nav className="bottom-nav" aria-label={t("nav.primary")}>
      {navigationItems(currentPath, followCount).map(({ path, label, icon, active, badge }) => (
        <button
          key={path}
          type="button"
          className={active ? "nav-active" : ""}
          onClick={() => navigate(path, path === "/")}
          aria-current={active ? "page" : undefined}
        >
          <NavIcon name={icon} />
          <span>{label}{badge !== undefined && badge > 0 ? ` (${badge})` : ""}</span>
        </button>
      ))}
    </nav>
  )
}
