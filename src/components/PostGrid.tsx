import { useCallback, useEffect, useRef, useState } from "react"
import { getSettings } from "../api"
import { isValidPostContext } from "../domain/post-identity"
import { isFollowed } from "../follows"
import { t } from "../i18n"
import { logWarn } from "../log"
import { FAVORITE_POSTS_CHANGED_EVENT, isFavoritePost, loadFavoritePosts } from "../post-favorites"
import { navigate } from "../router"
import type { PawPost } from "../types"
import { Spinner } from "./Feedback"
import { PostThumbnail } from "./PostThumbnail"
import { formatDate } from "../format-date"
import { listPostFiles } from "../post-files"

/** 無限スクロール用ローダー: scroll イベント + 幾何判定で確実に発火する
 *  (IntersectionObserver は環境によって再発火しないため不採用) */
export function PostGrid({ posts, onEndReached, loading, done, newIds, viewMode }: PostGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const cbRef = useRef(onEndReached)
  cbRef.current = onEndReached
  const currentView = viewMode || getSettings().postViewMode

  const check = useCallback(() => {
    const el = sentinelRef.current
    if (!el || !cbRef.current) return
    const rect = el.getBoundingClientRect()
    // 末尾がビューポート + 800px 以内なら次ページを読み込む
    if (rect.top < window.innerHeight + 800) cbRef.current()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    let frame = 0
    const handler = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        check()
      })
    }
    window.addEventListener("scroll", handler, { passive: true })
    window.addEventListener("resize", handler, { passive: true })
    return () => {
      window.removeEventListener("scroll", handler)
      window.removeEventListener("resize", handler)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [check])

  // ロード完了後にもう一度判定 (セントリーポジションが残っていれば連続ロード)
  useEffect(() => {
    if (loading || !onEndReached) return
    const t = setTimeout(check, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, posts.length])

  return (
    <div className="post-grid-wrap">
      {currentView === "list" ? (
        <div className="post-list">
          {posts.map((p) => (
            <PostRow key={`${p.service}:${p.id}`} post={p} isNew={newIds?.has(p.id)} />
          ))}
        </div>
      ) : (
        <div className="post-grid">
          {posts.map((p) => (
            <PostCard key={`${p.service}:${p.id}`} post={p} isNew={newIds?.has(p.id)} />
          ))}
        </div>
      )}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && <Spinner />}
      {done && posts.length > 0 && <div className="grid-end">{t("common.end")}</div>}
    </div>
  )
}


interface PostGridProps {
  posts: PawPost[]
  /** 続きを読み込む (末尾に到達したら呼ばれる) */
  onEndReached?: () => void
  loading?: boolean
  done?: boolean
  newIds?: Set<string>
  /** 表示モード: grid (既定) / list */
  viewMode?: "grid" | "list"
}


/** 投稿カード用のマーク状態 (フォロー中クリエイター / お気に入り投稿)。
 *  お気に入りとフォローの変更イベントを購読して全カードが同期する。
 *  web はフォロー = クリエイターのお気に入り、☆ = 投稿のお気に入り */
function usePostMarks(
  service: string | undefined,
  userId: string | undefined,
  postId: string | undefined,
): { faved: boolean; followed: boolean } {
  const [marks, setMarks] = useState(() => ({
    faved: !!(service && postId && isFavoritePost(service, postId)),
    followed: !!(service && userId && isFollowed(service, userId)),
  }))
  useEffect(() => {
    const upd = () =>
      setMarks({
        faved: !!(service && postId && isFavoritePost(service, postId)),
        followed: !!(service && userId && isFollowed(service, userId)),
      })
    loadFavoritePosts()
    window.addEventListener(FAVORITE_POSTS_CHANGED_EVENT, upd)
    window.addEventListener("pawkemo-follows-changed", upd)
    upd()
    return () => {
      window.removeEventListener(FAVORITE_POSTS_CHANGED_EVENT, upd)
      window.removeEventListener("pawkemo-follows-changed", upd)
    }
  }, [service, userId, postId])
  return marks
}


/** 不完全な投稿データから壊れた投稿URLを生成しない */
function postPath(post: PawPost): string | null {
  if (!isValidPostContext({ service: post.service, creatorId: post.user, postId: post.id })) {
    logWarn(
      `投稿遷移を中止: 不正な識別子 service=${String(post.service)} creatorId=${String(post.user)} postId=${String(post.id)}`,
    )
    return null
  }
  return `/post/${post.service}/${encodeURIComponent(post.user)}/${encodeURIComponent(post.id)}`
}

export function PostCard({ post, isNew }: { post: PawPost; isNew?: boolean }) {
  const onClick = useCallback(() => {
    const path = postPath(post)
    if (path) navigate(path)
  }, [post])
  // 画像枚数バッジ (EhViewer のページ数バッジ相当): 本体 + 添付の合計
  const files = listPostFiles(post)
  const imageCount = files.length
  // フォロー中クリエイター / お気に入り投稿のマーク (pawchive の ☆ / ★ と同期)
  const marks = usePostMarks(post.service, post.user, post.id)
  return (
    <div className={`post-card${marks.faved ? " is-fav" : ""}${marks.followed ? " is-follow" : ""}`} onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={post.title || t("common.untitled")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}>
      <div className="post-card-thumb">
        <PostThumbnail file={files[0]} />
        {isNew && <span className="badge-new">NEW</span>}
        {imageCount > 1 && <span className="badge-count">🖼{imageCount}</span>}
        {marks.faved && <span className="badge-fav">★</span>}
        {marks.followed && <span className="badge-follow">{t("follow.following")}</span>}
      </div>
      <div className="post-card-info">
        <div className="post-card-title">
          {marks.faved && <span className="title-mark">★</span>}
          {post.title || t("common.untitled")}
        </div>
        <div className="post-card-meta">
          {post.service} · {formatDate(post.published || post.added)}
        </div>
      </div>
    </div>
  )
}

/** リスト表示用の行カード (EhViewer / FANBOX Viewer の行型レイアウト参考) */
export function PostRow({ post, isNew }: { post: PawPost; isNew?: boolean }) {
  const onClick = useCallback(() => {
    const path = postPath(post)
    if (path) navigate(path)
  }, [post])
  const files = listPostFiles(post)
  const imageCount = files.length
  const marks = usePostMarks(post.service, post.user, post.id)
  return (
    <div className={`post-row-item${marks.faved ? " is-fav" : ""}${marks.followed ? " is-follow" : ""}`} onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={post.title || t("common.untitled")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}>
      <div className="post-row-thumb">
        <PostThumbnail file={files[0]} />
        {imageCount > 1 && <span className="badge-count-mini">🖼{imageCount}</span>}
        {marks.faved && <span className="badge-fav mini">★</span>}
      </div>
      <div className="post-row-content">
        <div className="post-row-title">
          {marks.faved && <span className="title-mark">★</span>}
          {isNew && <span className="badge-new inline">NEW</span>}
          {post.title || t("common.untitled")}
        </div>
        <div className="post-row-meta">
          <span className="post-row-service">{post.service}</span>
          <span className="post-row-user">{marks.followed ? "★" : ""}{post.user}</span>
          <span className="post-row-date">{formatDate(post.published || post.added)}</span>
        </div>
      </div>
    </div>
  )
}
