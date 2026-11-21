import { t } from "../i18n"
import type { NavIconName } from "./NavigationRail"

export function navigationItems(currentPath: string, followCount: number) {
  const items: { path: string; label: string; icon: NavIconName; active: boolean; badge?: number }[] = [
    { path: "/", label: t("nav.home"), icon: "home", active: currentPath === "home" || currentPath === "search" },
    { path: "/creators", label: t("nav.creators"), icon: "creators", active: currentPath === "creators" || currentPath === "creator" },
    { path: "/favorites", label: t("nav.favorites"), icon: "favorites", active: currentPath === "favorites", badge: followCount },
    { path: "/settings", label: t("nav.settings"), icon: "settings", active: currentPath === "settings" },
  ]
  return items
}
