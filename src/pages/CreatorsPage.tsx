import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getApplication } from "../application/composition"
import type { CreatorRow } from "../application/creator-index-repository"
import { Spinner, ErrorBox, Empty } from "../components/Feedback"
import { CreatorAvatar } from "../components/CreatorAvatar"
import { navigate } from "../router"
import { isFollowed } from "../follows"
import { readClipboardTextSafe, extractCreatorFromText, type ExtractedCreator } from "../platform/environment"
import { getSearchHistory, addSearchHistory, clearSearchHistory } from "../history"
import { t } from "../i18n"

export function CreatorsPage() {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<CreatorRow[]>([])
  const [serviceFilter, setServiceFilter] = useState<"all" | "fanbox" | "patreon">("all")
  const [sortBy, setSortBy] = useState<"updated" | "popular" | "name">("updated")
  const [visibleCount, setVisibleCount] = useState(60)
  const [ready, setReady] = useState(false)
  const [building, setBuilding] = useState(false)
  const [built, setBuilt] = useState<number | null>(null) // 構築済み件数 (進捗表示)
  const [error, setError] = useState<unknown>(null)
  const [clipCreator, setClipCreator] = useState<ExtractedCreator | null>(null)
  const [history, setHistory] = useState<string[]>(getSearchHistory)
  const [postLink, setPostLink] = useState<{ service: string; creatorId: string; postId: string; name: string } | null>(null)
  const qRef = useRef(q)
  qRef.current = q
  const searchSeq = useRef(0)
  const indexLoad = useRef<AbortController | null>(null)

  // クリップボードの URL 検出 (JHenTai の Check Gallery URL in Clipboard 参考)。
  // 常時の読み取りは OS の許可ダイアログやプライバシー問題になるため、明示操作でのみ読む。
  const checkClip = useCallback(async () => {
    const text = await readClipboardTextSafe()
    if (!text) return
    const found = extractCreatorFromText(text)
    setClipCreator(found ?? null)
  }, [])

  // メモリ索引から即時検索 (構築途中でも部分結果を表示)
  const runSearch = useCallback(async (value: string) => {
    const seq = ++searchSeq.current
    try {
      const result = await getApplication().creators.searchCreatorIndex(value)
      if (seq !== searchSeq.current) return
      setRows(result.rows)
      setPostLink(result.postLink)
      setError(null)
    } catch (error) {
      if (seq === searchSeq.current) setError(error)
    }
  }, [])

  // Show the cached results before checking whether the index needs a rebuild.
  useEffect(() => {
    const controller = new AbortController()
    indexLoad.current = controller
    const { signal } = controller
    const useCases = getApplication().creators
    const initializeIndex = async () => {
      try {
        const count = await useCases.countCreators()
        if (signal.aborted) return
        setBuilt(count > 0 ? count : null)
        await runSearch("")
        if (signal.aborted) return
        setReady(true)
        const needsBuild = await useCases.needsCreatorIndexBuild(count)
        if (signal.aborted || !needsBuild) return
        setBuilding(true)
        setError(null)
        const total = await useCases.buildCreatorIndex(count, signal)
        if (signal.aborted) return
        setBuilt(total)
        await runSearch(qRef.current)
      } catch (error) {
        if (!signal.aborted) setError(error)
      } finally {
        if (!signal.aborted) setBuilding(false)
      }
    }
    void initializeIndex()
    return () => {
      controller.abort()
      searchSeq.current++
    }
  }, [runSearch])

  const searchTimer = useRef<number | null>(null)

  const onSearch = useCallback(
    (value: string) => {
      setQ(value)
      setVisibleCount(60)
      // 1 文字ごとの全件検索を避ける
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
      searchTimer.current = window.setTimeout(() => {
        searchTimer.current = null
        void runSearch(value)
      }, 150)
    },
    [runSearch],
  )

  useEffect(() => () => {
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
  }, [])

  /** Enter で確定した場合のみ履歴に追加 (キー入力ごとの追加を避ける) */
  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = qRef.current.trim()
    if (t) {
      addSearchHistory(t)
      setHistory(getSearchHistory())
    }
  }

  const visibleRows = useMemo(
    () =>
      rows
        .filter((row) => serviceFilter === "all" || row.service === serviceFilter)
        .sort((a, b) => {
          if (sortBy === "updated") return (b.updated || 0) - (a.updated || 0) || (b.favorited || 0) - (a.favorited || 0)
          if (sortBy === "popular") return (b.favorited || 0) - (a.favorited || 0) || (b.updated || 0) - (a.updated || 0)
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        }),
    [rows, serviceFilter, sortBy],
  )
  const displayedRows = useMemo(() => visibleRows.slice(0, visibleCount), [visibleRows, visibleCount])

  return (
    <div className="page creators-page">
      <h1 className="page-title">{t("nav.creators")}</h1>
      {clipCreator && (
        <div className="clipboard-banner">
          <div className="clipboard-banner-info">
            <span className="clipboard-badge">📋 {t("creators.clipboard")}</span>
            <span className="clipboard-text">
              {clipCreator.service} / {clipCreator.idOrSlug}
            </span>
          </div>
          <div className="clipboard-banner-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                onSearch(clipCreator.idOrSlug)
                setClipCreator(null)
              }}
            >
              {t("creators.useClipboard")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setClipCreator(null)}>
              ×
            </button>
          </div>
        </div>
      )}

      <div className="discovery-panel creator-discovery">
      <form className="search-bar" role="search" onSubmit={onSearchSubmit}>
        <input
          type="search"
          aria-label={t("creators.searchPlaceholder")}
          placeholder={t("creators.searchPlaceholder")}
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
        {q && (
          <button type="button" className="btn btn-ghost" aria-label={t("common.clear")} onClick={() => onSearch("")}>
            ×
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => void checkClip()}>
          {t("creators.readClipboard")}
        </button>
      </form>
      {!q && history.length > 0 && (
        <div className="history-chips">
          {history.map((h) => (
            <button key={h} className="chip" onClick={() => onSearch(h)}>
              {h}
            </button>
          ))}
          <button
            className="chip chip-more"
            title={t("creators.historyClear")}
            onClick={() => {
              clearSearchHistory()
              setHistory([])
            }}
          >
            {t("creators.historyClearShort")}
          </button>
        </div>
      )}
      <div className="creator-list-controls">
        <div className="home-filter-group">
          <div className="tag-chips" role="group" aria-label={t("creators.serviceFilter")}>
            {(["all", "fanbox", "patreon"] as const).map((service) => (
              <button key={service} type="button"
                className={`chip ${serviceFilter === service ? "chip-active" : ""}`}
                aria-pressed={serviceFilter === service}
                onClick={() => { setServiceFilter(service); setVisibleCount(60) }}>
                {service === "all" ? t("creators.allServices") : service === "fanbox" ? "FANBOX" : "Patreon"}
              </button>
            ))}
          </div>
        </div>
        <div className="home-filter-group">
          <label className="small text-muted" htmlFor="creator-sort">{t("creators.sortBy")}</label>
          <select id="creator-sort" className="input" value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setVisibleCount(60) }}>
            <option value="updated">{t("creators.sortUpdated")}</option>
            <option value="popular">{t("creators.sortPopular")}</option>
            <option value="name">{t("creators.sortName")}</option>
          </select>
        </div>
        <div className="small text-muted">{t("creators.resultCount", { shown: displayedRows.length, total: visibleRows.length })}</div>
      </div>
      </div>
      <div className="hint-row">
        <span>
          {building && built !== null
            ? t("creators.building", { count: built.toLocaleString() })
            : built !== null
              ? t("creators.cached", { count: built.toLocaleString() })
              : t("creators.list")}
        </span>
        {built !== null && !building && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (!window.confirm(t("creators.refreshConfirm"))) return
              const signal = indexLoad.current?.signal
              setBuilding(true)
              try {
                const total = await getApplication().creators.refreshCreatorIndex(signal)
                if (signal?.aborted) return
                setBuilt(total)
                await runSearch(qRef.current)
                if (!signal?.aborted) setVisibleCount(60)
              } catch (error) {
                if (!signal?.aborted) setError(error)
              } finally {
                if (!signal?.aborted) setBuilding(false)
              }
            }}
          >
            {t("common.refresh")}
          </button>
        )}
      </div>
      {building && built === null && <Spinner label={t("creators.loading")} />}
      {error !== null && <ErrorBox error={error} onRetry={() => onSearch(q)} />}
      {ready && visibleRows.length === 0 && !building && <Empty text={t("creators.empty")} />}
      <div className="hint-row">
        {postLink && (
          <div className="clipboard-banner" style={{ width: "100%" }}>
            <div className="clipboard-banner-info">
              <span className="clipboard-badge">🔗 {t("creators.postLink")}</span>
              <span className="clipboard-text">
                {t("creators.postLinkText", { name: postLink.name })}
              </span>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/post/${postLink.service}/${postLink.creatorId}/${postLink.postId}`)}
            >
              {t("creators.openPost")}
            </button>
          </div>
        )}
      </div>
      <div className="creator-list">
        {displayedRows.map((r) => (
          <div
            key={r.key}
            className={`creator-row${isFollowed(r.service, r.id) ? " is-followed" : ""}`}
            onClick={() => navigate(`/creator/${r.service}/${r.id}`)}
            role="button"
            tabIndex={0}
            aria-label={r.name}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                navigate(`/creator/${r.service}/${r.id}`)
              }
            }}
          >
            <CreatorAvatar service={r.service} id={r.id} name={r.name} />
            <div className="creator-row-main">
              <div className="creator-name">
                {isFollowed(r.service, r.id) && <span className="badge-new inline">{t("creators.following")}</span>}
                {r.name}
              </div>
              <div className="creator-sub">
                {r.service} · {r.id}
                {r.publicId ? ` · ${r.publicId}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
      {visibleCount < visibleRows.length && (
        <div className="hint-row">
          <button className="btn" onClick={() => setVisibleCount((n) => Math.min(n + 60, visibleRows.length))}>
            {t("creators.showMore", { count: Math.min(60, visibleRows.length - visibleCount) })}
          </button>
        </div>
      )}
    </div>
  )
}
