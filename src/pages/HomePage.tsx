import { POST_PAGE_SIZE } from "../application/post-pages"
import { getApplication } from "../application/composition"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSettings, updateSettings, SETTINGS_CHANGED_EVENT } from "../api"
import type { PawPost } from "../types"
import { PostGrid } from "../components/PostGrid"
import { ErrorBox } from "../components/Feedback"
import { useNavigate } from "../router"
import { useScrollMemory } from "../hooks"
import { getSearchHistory, addSearchHistory, clearSearchHistory } from "../history"
import { t } from "../i18n"

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
  const [showSearchError, setShowSearchError] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">(getSettings().postViewMode)
  const [history, setHistory] = useState<string[]>(getSearchHistory)
  const [serviceFilter, setServiceFilter] = useState<"all" | "fanbox" | "patreon">("all")
  const [excludeAiPosts, setExcludeAiPosts] = useState<boolean>(getSettings().excludeAiPosts)
  const reqSeq = useRef(0)
  const searchInput = useRef<HTMLInputElement>(null)
  const tooShort = q.length > 0 && q.length < MIN_QUERY
  const scrollKey = `home:${q}:service=${serviceFilter}:excludeAi=${excludeAiPosts}`
  const filteredPosts = useMemo(() => posts.filter((post) =>
    serviceFilter === "all" || post.service === serviceFilter,
  ), [posts, serviceFilter])
  const hasActiveFilters = serviceFilter !== "all"

  useEffect(() => {
    if (query.get("focus") === "search") searchInput.current?.focus()
  }, [query])

  const toggleViewMode = (mode: "grid" | "list") => {
    setViewMode(mode)
    updateSettings({ postViewMode: mode })
  }

  useEffect(() => {
    setInput(q)
    setShowSearchError(false)
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
        const page = await getApplication().loadHomePosts({ query: q, offset: o })
        if (seq !== reqSeq.current) return // 古いレスポンスは破棄
        setPosts((prev) => (replace ? page.posts : [...prev, ...page.posts]))
        setOffset(o)
        if (page.done) setDone(true)
      } catch (e) {
        if (seq === reqSeq.current) setError(e)
      } finally {
        if (seq === reqSeq.current) setLoading(false)
      }
    },
    [q],
  )

  useEffect(() => {
    const syncSettings = () => {
      const next = getSettings().excludeAiPosts
      if (next !== excludeAiPosts) {
        setExcludeAiPosts(next)
        load(0, true)
      }
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, syncSettings)
  }, [excludeAiPosts, load])

  useEffect(() => {
    if (tooShort) return
    load(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useScrollMemory(scrollKey, posts.length > 0 || done)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const keyword = input.trim()
    if (keyword && keyword.length < MIN_QUERY) {
      setShowSearchError(true)
      return
    }
    setShowSearchError(false)
    if (keyword) {
      addSearchHistory(keyword)
      setHistory(getSearchHistory())
    }
    nav(keyword ? `/search?q=${encodeURIComponent(keyword)}` : "/", true)
  }

  const submitHistory = (h: string) => {
    addSearchHistory(h)
    setHistory(getSearchHistory())
    nav(`/search?q=${encodeURIComponent(h)}`, true)
  }

  return (
    <div className="page home-page">
      <h1 className="page-title home-title">{t("home.browseTitle")}</h1>
      <div className="discovery-panel">
        <form className="search-bar" role="search" onSubmit={submit}>
          <input
            ref={searchInput}
            type="search"
            placeholder={t("home.searchPlaceholder")}
            value={input}
            aria-label={t("common.search")}
            aria-invalid={showSearchError || undefined}
            aria-describedby={showSearchError ? "home-search-error" : undefined}
            onChange={(e) => {
              setInput(e.target.value)
              setShowSearchError(false)
            }}
          />
          <button type="submit" className="btn btn-primary">
            {t("common.search")}
          </button>
        </form>
        {showSearchError && <p id="home-search-error" className="search-error" role="alert">{t("home.tooShort")}</p>}
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
          <div className="home-filter-group">
            <div className="tag-chips" role="group" aria-label={t("home.serviceFilter")}>
              {(["all", "fanbox", "patreon"] as const).map((service) => (
                <button key={service} type="button"
                  className={`chip ${serviceFilter === service ? "chip-active" : ""}`}
                  aria-pressed={serviceFilter === service}
                  onClick={() => setServiceFilter(service)}>
                  {service === "all" ? t("home.allServices") : service === "fanbox" ? "FANBOX" : "Patreon"}
                </button>
              ))}
            </div>
          </div>
          {hasActiveFilters && (
            <div className="hint-row">
              <span className="small text-muted">{t("home.filteredCount", { shown: filteredPosts.length, total: posts.length })}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                setServiceFilter("all")
              }}>{t("home.clearFilters")}</button>
            </div>
          )}
        </section>
      </div>
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
        {!q && <h2 className="feed-title">{t("home.latestTitle")}</h2>}
        <div className="view-mode-toggles" role="group" aria-label={t("home.viewMode")}>
          <button
            type="button"
            className={`btn-icon ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => toggleViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            title={t("common.grid")}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M2 2h6v6H2zM12 2h6v6h-6zM2 12h6v6H2zM12 12h6v6h-6z" /></svg>
          </button>
          <button
            type="button"
            className={`btn-icon ${viewMode === "list" ? "active" : ""}`}
            onClick={() => toggleViewMode("list")}
            aria-pressed={viewMode === "list"}
            title={t("common.list")}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 4h14M3 10h14M3 16h14" /></svg>
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
          onEndReached={
            loading || done || filteredPosts.length === 0
              ? undefined
              : () => load(offset + POST_PAGE_SIZE, false)
          }
        />
      )}
      {!loading && !error && filteredPosts.length === 0 && done && (
        <div className="empty">{t("home.empty")}</div>
      )}
    </div>
  )
}

export { MIN_QUERY }
