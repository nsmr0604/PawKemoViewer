import { useRoute, navigate } from "./router"
import { HomePage } from "./pages/Home"
import { CreatorsPage } from "./pages/Creators"
import { CreatorPage } from "./pages/CreatorPage"
import { PostPage } from "./pages/PostPage"
import { FavoritesPage } from "./pages/Favorites"
import { SettingsPage } from "./pages/Settings"
import { loadFollows } from "./follows"
import { useEffect, useState } from "react"
import { LoginPage } from "./pages/Login"
import { getSettings } from "./api"

export default function App() {
  const route = useRoute()
  const [followCount, setFollowCount] = useState(loadFollows().length)

  useEffect(() => {
    // ページ遷移のたびにフォロー数を同期
    setFollowCount(loadFollows().length)
  }, [route])

  // テーマをルート要素に反映 (設定 → 表示 で切替、即時反映)
  useEffect(() => {
    document.documentElement.dataset.theme = getSettings().theme
  }, [route])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.path, route.params.id])

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

  return (
    <div className="app">
      {!isDetail && !isLogin && (
        <header className="top-bar">
          <div className="logo" onClick={() => navigate("/", true)}>
            🐾 Pawchive Viewer
          </div>
        </header>
      )}
      {(isDetail || isLogin) && (
        <header className="top-bar detail-bar">
          <button className="btn btn-ghost" onClick={() => history.back()}>
            ← 戻る
          </button>
          <div className="logo small">🐾</div>
        </header>
      )}
      <main className={`content ${isLogin ? "content-naked" : ""}`}>{content}</main>
      {!isLogin && (
        <nav className="bottom-nav">
          <button className={route.path === "home" || route.path === "search" ? "nav-active" : ""} onClick={() => navigate("/", true)}>
            🏠<span>ホーム</span>
          </button>
          <button className={route.path === "creators" || route.path === "creator" ? "nav-active" : ""} onClick={() => navigate("/creators")}>
            👤<span>クリエイター</span>
          </button>
          <button className={route.path === "favorites" ? "nav-active" : ""} onClick={() => navigate("/favorites")}>
            ⭐<span>フォロー{followCount > 0 ? ` (${followCount})` : ""}</span>
          </button>
          <button className={route.path === "settings" ? "nav-active" : ""} onClick={() => navigate("/settings")}>
            ⚙️<span>設定</span>
          </button>
        </nav>
      )}
    </div>
  )
}
