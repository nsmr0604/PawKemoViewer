import { useRoute, navigate } from "./router"
import { HomePage } from "./pages/Home"
import { CreatorsPage } from "./pages/Creators"
import { CreatorPage } from "./pages/CreatorPage"
import { PostPage } from "./pages/PostPage"
import { FavoritesPage } from "./pages/Favorites"
import { SettingsPage } from "./pages/Settings"
import { loadFollows, syncFollowsWithAccount } from "./follows"
import { useEffect, useState, useCallback } from "react"
import { LoginPage } from "./pages/Login"
import { getSettings, SETTINGS_CHANGED_EVENT } from "./api"
import { resolveLayout, type ResolvedLayout } from "./platform"
import { NavigationRail } from "./components/NavigationRail"

export default function App() {
  const route = useRoute()
  const [followCount, setFollowCount] = useState(loadFollows().length)
  const [winWidth, setWinWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200)
  // 設定変更を検知して再レンダリングする (getSettings() はモジュール変数なので
  // これが無いとレイアウトモード等の変更が次の遷移まで反映されない)
  const [settingsRev, setSettingsRev] = useState(0)

  // 画面幅リスナー
  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    const onSettings = () => setSettingsRev((n) => n + 1)
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettings)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettings)
  }, [])

  const settings = getSettings()
  useEffect(() => {
    if (settings.sessionKey) syncFollowsWithAccount().catch(() => {
      // オフライン時は次回起動またはフォロー画面表示時に再試行する。
    })
  }, [settings.sessionKey])
  const layout: ResolvedLayout = resolveLayout(settings.layoutMode, winWidth)

  useEffect(() => {
    // ページ遷移のたびにフォロー数を同期
    setFollowCount(loadFollows().length)
  }, [route])

  useEffect(() => {
    const onFollowsChanged = () => setFollowCount(loadFollows().length)
    window.addEventListener("pawchive-follows-changed", onFollowsChanged)
    return () => window.removeEventListener("pawchive-follows-changed", onFollowsChanged)
  }, [])

  // テーマをルート要素に反映 (設定 → 表示 で切替、即時反映)
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [route, settingsRev, settings.theme])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.path, route.params.id])

  // デスクトップ向けキーボードショートカット (JHenTai 参考: H/C/F/S/Esc//)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 入力フォーム操作中はスキップ
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)

      if (e.key === "Escape") {
        if (route.path === "post" || route.path === "login") {
          e.preventDefault()
          history.back()
        }
        return
      }

      if (isInput) return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      if (e.key === "/") {
        const searchInput = document.querySelector<HTMLInputElement>("input[type='search']")
        if (searchInput) {
          e.preventDefault()
          searchInput.focus()
          searchInput.select()
        }
      } else if (e.key === "h" || e.key === "H") {
        navigate("/", true)
      } else if (e.key === "c" || e.key === "C") {
        navigate("/creators")
      } else if (e.key === "f" || e.key === "F") {
        navigate("/favorites")
      } else if (e.key === "s" || e.key === "S") {
        navigate("/settings")
      }
    },
    [route.path],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  let content: React.ReactNode
  switch (route.path) {
    case "home":
    case "search":
      content = <HomePage query={route.query} />
      break
    case "creators":
      content = <CreatorsPage />
      break
    case "creator":
      content = <CreatorPage service={route.params.service} id={route.params.id} />
      break
    case "post":
      content = (
        <PostPage
          service={route.params.service}
          creatorId={route.params.creator}
          postId={route.params.id}
        />
      )
      break
    case "favorites":
      content = <FavoritesPage />
      break
    case "settings":
      content = <SettingsPage />
      break
    case "login":
      content = <LoginPage />
      break
    default:
      content = <HomePage query={route.query} />
  }

  const isDetail = route.path === "post"
  const isLogin = route.path === "login"
  const isDesktopLayout = layout === "desktop"

  return (
    <div className={`app ${isDesktopLayout ? "app-desktop" : "app-mobile"}`}>
      {/* デスクトップ環境では左側ナビゲーションレール (JHenTai 型) */}
      {isDesktopLayout && !isLogin && (
        <NavigationRail currentPath={route.path} followCount={followCount} />
      )}

      <div className="app-main-wrapper">
        {!isDetail && !isLogin && (
          <header className="top-bar">
            <div className="logo" onClick={() => navigate("/", true)}>
              🐾 Pawchive Viewer
            </div>
            {isDesktopLayout && (
              <div className="desktop-shortcuts-hint" title="キーボードショートカットが利用可能です">
                <span className="kbd">/</span> 検索
                <span className="kbd">H</span> ホーム
                <span className="kbd">C</span> 作者
                <span className="kbd">F</span> フォロー
                <span className="kbd">S</span> 設定
              </div>
            )}
          </header>
        )}
        {(isDetail || isLogin) && (
          <header className="top-bar detail-bar">
            <button className="btn btn-ghost" onClick={() => history.back()} title="戻る (Esc)">
              ← 戻る <span className="kbd small">Esc</span>
            </button>
            <div className="logo small" onClick={() => navigate("/", true)}>🐾 Pawchive</div>
          </header>
        )}

        <main className={`content ${isLogin ? "content-naked" : ""}`}>{content}</main>

        {/* モバイル環境では下部ボトムナビ */}
        {!isDesktopLayout && !isLogin && (
          <nav className="bottom-nav">
            <button
              className={route.path === "home" || route.path === "search" ? "nav-active" : ""}
              onClick={() => navigate("/", true)}
            >
              🏠<span>ホーム</span>
            </button>
            <button
              className={route.path === "creators" || route.path === "creator" ? "nav-active" : ""}
              onClick={() => navigate("/creators")}
            >
              👤<span>クリエイター</span>
            </button>
            <button
              className={route.path === "favorites" ? "nav-active" : ""}
              onClick={() => navigate("/favorites")}
            >
              ⭐<span>フォロー{followCount > 0 ? ` (${followCount})` : ""}</span>
            </button>
            <button
              className={route.path === "settings" ? "nav-active" : ""}
              onClick={() => navigate("/settings")}
            >
              ⚙️<span>設定</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  )
}
