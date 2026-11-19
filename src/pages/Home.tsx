import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, getSettings, normalizeTags, updateSettings } from "../api"
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
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const reqSeq = useRef(0)
  const tooShort = q.length > 0 && q.length < MIN_QUERY
  const scrollKey = `home:${q}:service=${serviceFilter}:tags=${selectedTags.join(",")}`
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const post of posts) {
      for (const tag of normalizeTags(post.tags)) counts.set(tag, (counts.get(tag) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [posts])
  const filteredPosts = useMemo(() => posts.filter((post) => {
    if (serviceFilter !== "all" && post.service !== serviceFilter) return false
    if (selectedTags.length > 0) {
      const postTags = normalizeTags(post.tags)
      if (!selectedTags.some((tag) => postTags.includes(tag))) return false
    }
    return true
  }), [posts, serviceFilter, selectedTags])
  const hasActiveFilters = serviceFilter !== "all" || selectedTags.length > 0
  const toggleTag = (tag: string) => setSelectedTags((current) =>
    current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag],
  )

  const toggleViewMode = (mode: "grid" | "list") => {
    setViewMode(mode)
    updateSettings({ postViewMode: mode })
  }

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
        <div className="home-filter-group">
          <span className="small text-muted">{t("home.serviceFilter")}</span>
          <div className="tag-chips">
            {(["all", "fanbox", "patreon"] as const).map((service) => (
              <button key={service} type="button"
                className={`chip ${serviceFilter === service ? "chip-active" : ""}`}
                aria-pressed={serviceFilter === service}
                onClick={() => setServiceFilter(service)}>
                {service === "all" ? t("home.allServices") : service}
              </button>
            ))}
          </div>
        </div>
        <div className="home-filter-group">
          <span className="small text-muted">{t("home.tagFilter")}</span>
          {tagOptions.length > 0 ? (
            <div className="tag-chips">
              {tagOptions.slice(0, 40).map(([tag, count]) => (
                <button key={tag} type="button"
                  className={`chip ${selectedTags.includes(tag) ? "chip-active" : ""}`}
                  aria-pressed={selectedTags.includes(tag)}
                  onClick={() => toggleTag(tag)}>
                  {tag} <span className="chip-count">{count}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="small text-muted">{t("home.tagsUnavailable")}</span>
          )}
        </div>
        {hasActiveFilters && (
          <div className="hint-row">
            <span className="small text-muted">{t("home.filteredCount", { shown: filteredPosts.length, total: posts.length })}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              setServiceFilter("all")
              setSelectedTags([])
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
      {!loading && !error && filteredPosts.length === 0 && (done || hasActiveFilters) && (
        <div className="empty">{hasActiveFilters && posts.length > 0 ? t("home.noFilterResults") : t("home.empty")}</div>
      )}
      {hasActiveFilters && filteredPosts.length === 0 && !done && !loading && !tooShort && (
        <div className="hint-row">
          <button type="button" className="btn" onClick={() => load(offset + PAGE, false)}>{t("home.loadMoreForFilter")}</button>
        </div>
      )}
    </div>
  )
}

export { MIN_QUERY }
