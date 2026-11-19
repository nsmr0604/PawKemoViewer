import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, getSettings, updateSettings, SETTINGS_CHANGED_EVENT } from "../api"
import type { PawPost } from "../types"
import { PostGrid, ErrorBox } from "../components"
import { useNavigate } from "../router"
import { useScrollMemory } from "../hooks"
import { getSearchHistory, addSearchHistory, clearSearchHistory } from "../history"
import { t } from "../i18n"

const PAGE = 50
const MIN_QUERY = 3

export function HomePage({ query }: { query: URLSearchParams }) {
  const q = query.get("q") || ""
  const nav = useNavigate()
  const [posts, setPosts] = useState<PawPost[]>([])
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [input, setInput] = useState(q)
  const [viewMode, setViewMode] = useState<"grid" | "list">(getSettings().postViewMode)
  const [history, setHistory] = useState<string[]>(getSearchHistory)
  const [serviceFilter, setServiceFilter] = useState<"all" | "fanbox" | "patreon">("all")
  const [excludeAiPosts, setExcludeAiPosts] = useState<boolean>(getSettings().excludeAiPosts)
  const reqSeq = useRef(0)
  const tooShort = q.length > 0 && q.length < MIN_QUERY
  const scrollKey = `home:${q}:service=${serviceFilter}:excludeAi=${excludeAiPosts}`
  const filteredPosts = useMemo(() => posts.filter((post) =>
    serviceFilter === "all" || post.service === serviceFilter,
  ), [posts, serviceFilter])
  const hasActiveFilters = serviceFilter !== "all"


  const toggleViewMode = (mode: "grid" | "list") => {
    setViewMode(mode)
    updateSettings({ postViewMode: mode })
  }

  useEffect(() => {
    const syncSettings = () => setExcludeAiPosts(getSettings().excludeAiPosts)
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
  }, [])

  useEffect(() => {
    setInput(q)
    setPosts([])
    setOffset(0)
    setDone(false)
    setError(null)
    // クエリ切替/画面離脱後に前の検索結果が遅れて反映されるのを防ぐ。
    return () => {
      reqSeq.current += 1
    }
  }, [q])

  const load = useCallback(
    async (o: number, replace: boolean) => {
      const seq = ++reqSeq.current
      setLoading(true)
      setError(null)
      try {
        const res = await api.posts({ q: q || undefined, o })
        if (seq !== reqSeq.current) return // 古いレスポンスは破棄
        setPosts((prev) => (replace ? res : [...prev, ...res]))
        setOffset(o)
        if (res.length < PAGE) setDone(true)
      } catch (e) {
        if (seq === reqSeq.current) setError(e)
      } finally {
        if (seq === reqSeq.current) setLoading(false)
      }
    },
    [q],
  )

  useEffect(() => {
    if (tooShort) return
    load(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useScrollMemory(scrollKey, posts.length > 0 || done)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && input.trim().length < MIN_QUERY) return
    const t = input.trim()
    if (t) {
      addSearchHistory(t)
      setHistory(getSearchHistory())
    }
    nav(t ? `/search?q=${encodeURIComponent(t)}` : "/", true)
  }

  const submitHistory = (h: string) => {
    addSearchHistory(h)
    setHistory(getSearchHistory())
    nav(`/search?q=${encodeURIComponent(h)}`, true)
  }

  return (
    <div className="page">
      <form className="search-bar" onSubmit={submit}>
        <input
          type="search"
          placeholder={t("home.searchPlaceholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn">
          {t("common.search")}
        </button>
      </form>
      {!q && history.length > 0 && (
        <div className="history-chips">
          {history.map((h) => (
            <button key={h} className="chip" onClick={() => submitHistory(h)}>
              {h}
            </button>
          ))}
          <button
            className="chip chip-more"
            title={t("home.historyClear")}
            onClick={() => {
              clearSearchHistory()
              setHistory([])
            }}
          >
            {t("home.historyClearShort")}
          </button>
        </div>
      )}
      <section className="home-filters" aria-label={t("home.filters")}>
        {hasActiveFilters && (
          <div className="hint-row">
            <span className="small text-muted">{t("home.filteredCount", { shown: filteredPosts.length, total: posts.length })}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              setServiceFilter("all")
            }}>{t("home.clearFilters")}</button>
          </div>
        )}
      </section>
      <div className="view-mode-bar">
        {tooShort && <div className="hint-row">{t("home.tooShort")}</div>}
        {q && !tooShort && (
          <div className="hint-row">
            <span>{t("home.results", { q })}</span>
            <button className="btn btn-ghost" onClick={() => nav("/", true)}>
              {t("common.clear")}
            </button>
          </div>
        )}
        <div className="view-mode-toggles">
          <button
            type="button"
            className={`btn-icon ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => toggleViewMode("grid")}
            title={t("common.grid")}
          >
            🔲
          </button>
          <button
            type="button"
            className={`btn-icon ${viewMode === "list" ? "active" : ""}`}
            onClick={() => toggleViewMode("list")}
            title={t("common.list")}
          >
            ☰
          </button>
        </div>
      </div>
      {error !== null && <ErrorBox error={error} onRetry={() => load(offset, offset === 0)} />}
      {!tooShort && (
        <PostGrid
          posts={filteredPosts}
          loading={loading}
          done={done}
          viewMode={viewMode}
          onEndReached={loading || done ? undefined : () => load(offset + PAGE, false)}
        />
      )}
      {!loading && !error && filteredPosts.length === 0 && done && (
        <div className="empty">{t("home.empty")}</div>
      )}
    </div>
  )
}

export { MIN_QUERY }
