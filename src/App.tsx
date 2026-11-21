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
import { loadLocale } from "./i18n"
import { resolveLayout, type ResolvedLayout } from "./platform"
import { getPlatformRuntime } from "./platform/runtime"
import { AppShell } from "./components/AppShell"
import { ErrorBox } from "./components"

export default function App() {
  const route = useRoute()
  const [followCount, setFollowCount] = useState(loadFollows().length)
  const [isWideLayout, setIsWideLayout] = useState(typeof window !== "undefined" ? window.innerWidth >= 768 : true)
  // 設定変更を検知して再レンダリングする (getSettings() はモジュール変数なので
  // これが無いとレイアウトモード等の変更が次の遷移まで反映されない)
  const [settingsRev, setSettingsRev] = useState(0)

  // 画面幅リスナー
  useEffect(() => {
    let frame = 0
    const onResize = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const nextIsWide = window.innerWidth >= 768
        setIsWideLayout((current) => current === nextIsWide ? current : nextIsWide)
      })
    }
    window.addEventListener("resize", onResize, { passive: true })
    return () => {
      window.removeEventListener("resize", onResize)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const onSettings = () => setSettingsRev((n) => n + 1)
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettings)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettings)
  }, [])

  const settings = getSettings()
  useEffect(() => {
    void loadLocale(settings.locale).then(() => setSettingsRev((n) => n + 1))
  }, [settings.locale])
  useEffect(() => {
    if (settings.sessionKey) syncFollowsWithAccount().catch(() => {
      // オフライン時は次回起動またはフォロー画面表示時に再試行する。
    })
  }, [settings.sessionKey])
  const layout: ResolvedLayout = resolveLayout(settings.layoutMode, isWideLayout ? 768 : 767)

  useEffect(() => {
    // ページ遷移のたびにフォロー数を同期
    setFollowCount(loadFollows().length)
  }, [route])

  useEffect(() => {
    const onFollowsChanged = () => setFollowCount(loadFollows().length)
    window.addEventListener("pawkemo-follows-changed", onFollowsChanged)
    return () => window.removeEventListener("pawkemo-follows-changed", onFollowsChanged)
  }, [])

  // テーマをルート要素に反映 (設定 → 表示 で切替、即時反映)
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [route, settingsRev, settings.theme])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.path, route.params.id])

  // 戻る操作は PlatformRuntime の LifecycleService に集約する。
  useEffect(() => {
    const lifecycle = getPlatformRuntime().services.lifecycle
    if (!lifecycle) return
    return lifecycle.onBackRequested((canGoBack) => {
      // WebView の履歴がある場合はルート種別に関係なく履歴を戻す。
      // 履歴がない場合はアプリ終了を試み、外部履歴への誤遷移を防ぐ。
      if (canGoBack) history.back()
      else void lifecycle.exit().catch(() => {
        // Web adapter などアプリ終了を提供しない環境では未対応。
      })
    })
  }, [])

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
      // key で確実に再マウント: クリエイター間の移動やタグ深リンク (?tag=) で
      // 状態 (選択タグ・エラー) を引きずらない。同一 URL への再遷移でも
      // エラー後の再試行ができるようになる
      content = (
        <CreatorPage
          key={`creator:${route.params.service}:${route.params.id}`}
          service={route.params.service}
          id={route.params.id}
        />
      )
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
    case "invalid-post":
      content = (
        <div className="page">
          <ErrorBox error="投稿URLが不正です。投稿一覧からもう一度開いてください。" />
        </div>
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

  return (
    <AppShell layout={layout} currentPath={route.path} followCount={followCount} hasSession={!!settings.sessionKey}>
      {content}
    </AppShell>
  )
}
