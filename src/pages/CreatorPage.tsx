import { getApplication } from "../application/composition"
import { POST_PAGE_SIZE } from "../application/post-pages"
import { useCallback, useEffect, useRef, useState } from "react"
import { creatorUrl, ApiError, getSettings, updateSettings } from "../api"
import type { PawPost, PawTag } from "../types"
import { Spinner, PostGrid, ErrorBox } from "../components"
import { CreatorHeader } from "./Creators"
import { FollowButton } from "../components/FollowButton"
import { useScrollMemory } from "../hooks"
import { parseHash } from "../router"
import { t } from "../i18n"


export function CreatorPage({ service, id }: { service: string; id: string }) {
  const [posts, setPosts] = useState<PawPost[]>([])
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [tags, setTags] = useState<PawTag[] | null>(null)
  // 投稿詳細のタグチップからの深リンク (#creator/...?tag=xxx) を初期選択にする
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const t = parseHash().query.get("tag")
    return t ? [t] : []
  })
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [showAllTags, setShowAllTags] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">(getSettings().postViewMode)
  const reqSeq = useRef(0)

  const toggleViewMode = (mode: "grid" | "list") => {
    setViewMode(mode)
    updateSettings({ postViewMode: mode })
  }

  const tagKey = selectedTags.join(",")
  const scrollKey = `creator:${service}:${id}|t=${tagKey}`
  // タグ条件が変わったらリストをリセット
  const filterKey = `${service}:${id}:${tagKey}`

  const load = useCallback(
    async (o: number, replace: boolean) => {
      const seq = ++reqSeq.current
      setLoading(true)
      setError(null)
      try {
        const page = await getApplication().loadCreatorPosts({ service, id, tags: selectedTags, offset: o })
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
    [service, id, tagKey],
  )

  useEffect(() => {
    setPosts([])
    setDone(false)
    setError(null)
    load(0, true)
    return () => { reqSeq.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  useEffect(() => {
    let alive = true
    setTags(null)
    getApplication().loadCreatorTags(service, id)
      .then((t) => alive && setTags(t))
      .catch(() => alive && setTags([]))
    return () => {
      alive = false
    }
  }, [service, id])

  // 元サービス (fanbox / patreon) のクリエイターページ URL
  useEffect(() => {
    let alive = true
    setOriginalUrl(null)
    getApplication().loadOriginalCreatorUrl(service, id)
      .then((u) => {
        if (alive) setOriginalUrl(u)
      })
      .catch(() => {
        if (alive) setOriginalUrl(null)
      })
    return () => {
      alive = false
    }
  }, [service, id])

  useScrollMemory(scrollKey, posts.length > 0 || done)

  const toggleTag = (t: string) => {
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const visibleTags = tags ? (showAllTags ? tags : tags.slice(0, 20)) : []

  return (
    <div className="page">
      <div className="creator-head-wrap">
        <CreatorHeader service={service} id={id} />
        <div className="creator-actions">
          <FollowButton service={service} id={id} />
          <a
            className="btn btn-ghost"
            href={creatorUrl(service, id)}
            target="_blank"
            rel="noreferrer"
            referrerPolicy="no-referrer"
          >
            {t("common.openSite")}
          </a>
          {originalUrl && (
            <a
              className="btn"
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              referrerPolicy="no-referrer"
              title={t("creator.originalTitle")}
            >
              {t("common.openOn", { service })}
            </a>
          )}
        </div>
      </div>

      {tags === null && <Spinner label={t("creator.tags")} />}
      {tags && tags.length > 0 && (
        <div className="tag-chips">
          {visibleTags.map((t) => (
            <button
              key={t.tag}
              className={`chip ${selectedTags.includes(t.tag) ? "chip-active" : ""}`}
              onClick={() => toggleTag(t.tag)}
            >
              {t.tag} <span className="chip-count">{t.post_count}</span>
            </button>
          ))}
          {tags.length > 20 && (
            <button className="chip chip-more" onClick={() => setShowAllTags((s) => !s)}>
              {showAllTags ? t("common.close") : `+${tags.length - 20}`}
            </button>
          )}
        </div>
      )}

      <div className="view-mode-bar">
        <span className="small text-muted">{t("creator.posts")}</span>
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
      <PostGrid
        posts={posts}
        loading={loading}
        done={done}
        viewMode={viewMode}
        onEndReached={loading || done ? undefined : () => load(offset + POST_PAGE_SIZE, false)}
      />
      {!loading && !error && posts.length === 0 && done && <div className="empty">{t("home.empty")}</div>}
    </div>
  )
}

export function CreatorNotFound() {
  return (
    <div className="page">
      <ErrorBox error={new ApiError(404, t("creator.notFound"))} />
    </div>
  )
}
