import type { ReactNode } from "react"
import { t } from "../i18n"
import type { ResolvedLayout } from "../platform"
import { navigate } from "../router"
import { BottomNavigation } from "./BottomNavigation"
import { NavigationRail, NavIcon } from "./NavigationRail"

interface AppShellProps {
  layout: ResolvedLayout
  currentPath: string
  followCount: number
  hasSession: boolean
  children: ReactNode
}

export function AppShell({ layout, currentPath, followCount, hasSession, children }: AppShellProps) {
  const isDetail = currentPath === "post"
  const isLogin = currentPath === "login"
  const isDesktopLayout = layout === "desktop"
  const pageLabel = currentPath === "home" || currentPath === "search"
    ? t("nav.home")
    : currentPath === "creators" || currentPath === "creator"
      ? t("nav.creators")
      : currentPath === "favorites"
        ? t("nav.favorites")
        : currentPath === "settings"
          ? t("nav.settings")
          : currentPath === "post"
            ? t("nav.postDetail")
            : ""

  return (
    <div className={`app ${isDesktopLayout ? "app-desktop" : "app-mobile"}`}>
      {/* デスクトップ環境では左側ナビゲーションレール (JHenTai 型) */}
      {isDesktopLayout && !isLogin && (
        <NavigationRail currentPath={currentPath} followCount={followCount} hasSession={hasSession} />
      )}

      <div className="app-main-wrapper">
        {!isDetail && !isLogin && (
          <header className="top-bar">
            <div className="top-bar-brand">
              <button type="button" className="logo" onClick={() => navigate("/", true)}>
                <span aria-hidden="true">🐾</span> PawKemoViewer
              </button>
              {pageLabel && <span className="topbar-context">{pageLabel}</span>}
            </div>
            <div className="top-bar-actions">
              {isDesktopLayout && (
                <div className="desktop-shortcuts-hint" title={t("nav.shortcuts")}>
                  <span className="kbd">/</span> {t("common.search")}
                  <span className="kbd">H</span> {t("nav.home")}
                  <span className="kbd">C</span> {t("nav.creators")}
                  <span className="kbd">F</span> {t("nav.favorites")}
                  <span className="kbd">S</span> {t("nav.settings")}
                </div>
              )}
              <button
                type="button"
                className="btn btn-account"
                onClick={() => navigate(hasSession ? "/settings" : "/login")}
              >
                <NavIcon name="account" />
                <span>{hasSession ? t("nav.account") : t("nav.login")}</span>
              </button>
            </div>
          </header>
        )}
        {(isDetail || isLogin) && (
          <header className="top-bar detail-bar">
            <button
              className="btn btn-ghost"
              onClick={() => history.back()}
              title={`${t("common.back")} (Esc)`}
            >
              ← {t("common.back")} <span className="kbd small">Esc</span>
            </button>
            <button type="button" className="logo small" onClick={() => navigate("/", true)}>🐾 PawKemoViewer</button>
          </header>
        )}

        <main className={`content ${isLogin ? "content-naked" : ""}`}>{children}</main>

        {/* モバイル環境では下部ボトムナビ */}
        {!isDesktopLayout && !isLogin && (
          <BottomNavigation currentPath={currentPath} followCount={followCount} />
        )}
      </div>
    </div>
  )
}
