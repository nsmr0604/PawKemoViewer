import { useCallback, useEffect, useRef, useState } from "react"
import { api, creatorUrl, ApiError, getSettings, updateSettings } from "../api"
import type { PawPost, PawTag } from "../types"
import { Spinner, PostGrid, ErrorBox } from "../components"
import { CreatorHeader } from "./Creators"
import { FollowButton } from "../components/FollowButton"
import { useDebounced, useScrollMemory } from "../hooks"
import { parseHash } from "../router"
import { MIN_QUERY } from "./Home"

const PAGE = 50

export function CreatorPage({ service, id }: { service: string; id: string }) {
  const [posts, setPosts] = useState<PawPost[]>([])
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [tags, setTags] = useState<PawTag[] | null>(null)
  // 投稿詳細のタグチップからの深リンク (#creator/...?tag=xxx) を初期選択にする
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const t = parseHash().query.get("tag")
    return t ? [t] : []
  })
  const [input, setInput] = useState("")
  const q = useDebounced(input, 400)
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

  const qValid = q.length >= MIN_QUERY
  const tagKey = selectedTags.join(",")
  const scrollKey = `creator:${service}:${id}|t=${tagKey}|q=${qValid ? q : ""}`
  // 検索条件が変わったらリストをリセット (q はデバウンス済み)
  const filterKey = `${service}:${id}:${tagKey}:${qValid ? q : ""}`

  const load = useCallback(
    async (o: number, replace: boolean) => {
      const seq = ++reqSeq.current
      setLoading(true)
      setError(null)
      try {
        const res = await api.creatorPosts(service, id, {
          q: qValid ? q : undefined,
          tag: selectedTags.length ? selectedTags : undefined,
          o,
        })
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
    [service, id, q, qValid, tagKey],
  )

  useEffect(() => {
    setPosts([])
    setDone(false)
    setError(null)
    load(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  useEffect(() => {
    let alive = true
    setTags(null)
    api
      .creatorTags(service, id)
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
    api
      .originalCreatorUrl(service, id)
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
  const searching = input.length > 0 && input.length < MIN_QUERY

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
            サイトで開く ↗
          </a>
          {originalUrl && (
            <a
              className="btn"
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              referrerPolicy="no-referrer"
              title="元の fanbox / patreon のクリエイターページを開きます (リファラーは送信しません)"
            >
              {service === "fanbox" ? "fanbox で開く ↗" : "patreon で開く ↗"}
            </a>
          )}
        </div>
      </div>

      <form className="search-bar" onSubmit={(e) => e.preventDefault()}>
        <input
          type="search"
          placeholder="このクリエイター内で検索 (3文字以上)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {input && (
          <button type="button" className="btn btn-ghost" onClick={() => setInput("")}>
            ×
          </button>
        )}
      </form>
      {searching && <div className="hint-row">検索ワードは3文字以上入力してください (入力から少し待って自動検索)</div>}

      {tags === null && <Spinner label="タグ…" />}
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
              {showAllTags ? "閉じる" : `+${tags.length - 20}`}
            </button>
          )}
        </div>
      )}

      <div className="view-mode-bar">
        <span className="small text-muted">投稿一覧</span>
        <div className="view-mode-toggles">
          <button
            type="button"
            className={`btn-icon ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => toggleViewMode("grid")}
            title="グリッド表示"
          >
            🔲
          </button>
          <button
            type="button"
            className={`btn-icon ${viewMode === "list" ? "active" : ""}`}
            onClick={() => toggleViewMode("list")}
            title="リスト表示"
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
        onEndReached={loading || done ? undefined : () => load(offset + PAGE, false)}
      />
      {!loading && !error && posts.length === 0 && done && <div className="empty">投稿がありません</div>}
    </div>
  )
}

export function CreatorNotFound() {
  return (
    <div className="page">
      <ErrorBox error={new ApiError(404, "クリエイターが見つかりません")} />
    </div>
  )
}
