import type { ReactNode } from "react"
import { t } from "../i18n"
import type { ResolvedLayout } from "../platform/environment"
import { goBack, navigate } from "../router"
import { BottomNavigation } from "./BottomNavigation"
import { NavigationRail, NavIcon } from "./NavigationRail"
import { activateAccount } from "../account-action"

interface AppShellProps {
  headerIcon: string
  layout: ResolvedLayout
  currentPath: string
  followCount: number
  hasSession: boolean
  accountId: string
  children: ReactNode
}

export function AppShell({ headerIcon, layout, currentPath, followCount, hasSession, accountId, children }: AppShellProps) {
  const accountLabel = hasSession ? accountId || t("nav.accountIdUnknown") : t("nav.login")
  const isPost = currentPath === "post" || currentPath === "invalid-post"
  const isDetail = isPost || currentPath === "creator"
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
          : isPost
            ? t("nav.postDetail")
            : t("nav.login")

  const backButton = (
    <button
      className="btn btn-ghost"
      onClick={() => goBack(currentPath === "creator" ? "/creators" : "/")}
      title={isDesktopLayout ? `${t("common.back")} (Esc)` : t("common.back")}
    >
      <span className="detail-back-label">← {t("common.back")}</span>
      {isDesktopLayout && <span className="kbd small">Esc</span>}
    </button>
  )
  // 投稿を前後にたどった後でも、すぐ一覧へ戻れる導線
  const homeButton = (
    <button
      className="btn btn-ghost"
      onClick={() => navigate("/")}
      title={t("nav.home")}
      aria-label={t("nav.home")}
    >
      <NavIcon name="home" />
      {isDesktopLayout && <span>{t("nav.home")}</span>}
    </button>
  )

  return (
    <div className={`app ${isDesktopLayout ? "app-desktop" : "app-mobile"}`}>
      {/* デスクトップ環境では左側ナビゲーションレール (JHenTai 型) */}
      {isDesktopLayout && !isLogin && (
        <NavigationRail currentPath={currentPath} followCount={followCount} hasSession={hasSession} accountLabel={accountLabel} />
      )}

      <div className={`app-main-wrapper ${isDetail || isLogin ? "app-reading" : ""}`}>
        {!isDesktopLayout && !isDetail && !isLogin && (
          <header className="top-bar">
            <div className="top-bar-brand">
              <button type="button" className="logo" aria-label="PawKemoViewer" onClick={() => navigate("/")}>
                <img className="logo-icon" src={headerIcon} alt="" />
              </button>
              <span className="topbar-context">{pageLabel}</span>
            </div>
            <div className="top-bar-actions">
              <button
                type="button"
                className="btn btn-account"
                onClick={() => activateAccount()}
                title={accountLabel}
              >
                <NavIcon name="account" />
                <span>{accountLabel}</span>
              </button>
            </div>
          </header>
        )}
        {!isDesktopLayout && (isDetail || isLogin) && (
          <header className="top-bar detail-bar">
            {backButton}
            {homeButton}
            <span className="detail-context">{pageLabel}</span>
          </header>
        )}

        <main className={`content ${isDesktopLayout && isLogin ? "content-naked" : ""} ${isPost ? "content-post" : ""}`}>
          {isDesktopLayout && (isDetail || isLogin) && <div className="desktop-back">{backButton}{homeButton}{isDetail && <span>{pageLabel}</span>}</div>}
          {children}
        </main>
      </div>
      {!isDesktopLayout && !isDetail && !isLogin && <BottomNavigation currentPath={currentPath} followCount={followCount} />}
    </div>
  )
}
