import { getApplication } from "../application/composition"
import { isValidPostContext } from "../domain/post-identity"
import { normalizeFanboxSlug, originalPostReferer } from "../domain/post-referer"
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"
import { api, apiStatus, getSettings, updateSettings, clearApiCache, normalizeTags, fileUrl, postUrl, thumbUrl, isVideoFile } from "../api"
import { setFavoritePost } from "../post-favorites"
import { CreatorAvatar } from "../components/CreatorAvatar"
import { isFanboxCoverFile } from "../post-files"
import type { PawComment, PawPost, PawRevision, PawFile } from "../types"
import { Spinner, ErrorBox, Empty } from "../components/Feedback"
import { formatDate } from "../format-date"
import { sanitizePostContent } from "../post-content"
import { navigate } from "../router"
import { FollowButton } from "../components/FollowButton"
import { logError, logInfo, logWarn } from "../log"
import { t as tr } from "../i18n"
import { getPlatformRuntime } from "../platform/runtime"
import { canOpenExternalPage, openExternalPage } from "../external-page"
import { parseOriginalPostLink } from "../original-post-link"
import { resolveOriginalPost } from "../original-post-navigation"

export function PostPage({
  service,
  creatorId,
  postId,
}: {
  service: string
  creatorId: string
  postId: string
}) {
  // 投稿画面を開いた時点で識別子を確定し、詳細・関連API・画面遷移で共通利用する。
  const postContext = { service, creatorId, postId }
  const validContext = isValidPostContext(postContext)
  const currentLoad = useRef<AbortController | null>(null)
  const linkRequest = useRef(0)
  const [linkState, setLinkState] = useState<{ kind: "loading" } | { kind: "missing"; url: string } | null>(null)

  const [post, setPost] = useState<PawPost | null>(null)
  const [comments, setComments] = useState<PawComment[] | null>(null)
  const [revisions, setRevisions] = useState<PawRevision[] | null>(null)
  const [revisionsError, setRevisionsError] = useState<unknown>(null)
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(null)
  const [flagged, setFlagged] = useState<"none" | "busy" | "ok" | "dup" | "err">("none")
  /** ライトボックスで開いているファイルの allFiles 内インデックス (null=閉じている) */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  // お気に入り状態 (web の ☆ Favorite 相当)。セッションが無い場合は表示しない
  const [faved, setFaved] = useState<"none" | "checking" | "yes" | "no" | "busy" | "err">("none")
  // 元サービス (fanbox / patreon) の投稿 URL。構成できない場合は表示しない
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [loadedFiles, setLoadedFiles] = useState<Set<number>>(() => new Set())
  // 投稿内の画像はサムネイルを初期表示し、操作時に元画像へ一括切替する。
  const [loadOriginalImages, setLoadOriginalImages] = useState(false)
  // FANBOX の cover.jpeg は作品カバー画像のため除外できる。設定はグローバル (投稿を跨いで維持)
  const [excludeFanboxCover, setExcludeFanboxCover] = useState(getSettings().excludeFanboxCover)
  const toggleFanboxCover = (value: boolean) => {
    setExcludeFanboxCover(value)
    updateSettings({ excludeFanboxCover: value })
  }

  // 元サービスの記事URLを Referer に使用する。FANBOX は slug サブドメインの
  // URLから slug を取り出し、www.fanbox.cc の記事URLへ正規化する。
  const proxyReferer = (() => {
    if (service === "patreon") return originalPostReferer("patreon", postId)
    if (service !== "fanbox") return undefined
    let slug = ""
    if (originalUrl) {
      try {
        slug = normalizeFanboxSlug(new URL(originalUrl).hostname.replace(/\.fanbox\.cc$/i, ""))
      } catch {
        slug = ""
      }
    }
    return originalPostReferer("fanbox", postId, slug)
  })()

  // 外部リンクはモバイルのネイティブビューで実オリジンのまま開く。
  // pkv プロキシでは reCAPTCHA 付きのページを表示できないため。
  const openExternalLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const element = event.target as Element
    const anchor = element.closest?.("a[href]") as HTMLAnchorElement | null
    if (!anchor) return
    const original = anchor.getAttribute("data-external-url") || anchor.getAttribute("href") || ""
    const postLink = parseOriginalPostLink(original)
    if (postLink) {
      if (linkState?.kind === "missing" && linkState.url === anchor.href) return
      event.preventDefault()
      const requestId = ++linkRequest.current
      const current = currentLoad.current
      setLinkState({ kind: "loading" })
      void resolveOriginalPost(postLink, postContext, anchor.textContent || "").catch(() => null).then((target) => {
        if (requestId !== linkRequest.current || current?.signal.aborted) return
        if (target) {
          setLinkState(null)
          navigate(`/post/${target.service}/${encodeURIComponent(target.creatorId)}/${encodeURIComponent(target.postId)}`)
        } else {
          setLinkState({ kind: "missing", url: anchor.href })
        }
      })
      return
    }
    if (!proxyReferer) return
    if (!canOpenExternalPage()) return
    const url = anchor.getAttribute("data-external-url")
    if (!url) return
    event.preventDefault()
    event.stopPropagation()
    void openExternalPage(url, proxyReferer).catch(() => {
      const fallback = anchor.getAttribute("href")
      if (fallback) window.open(fallback, "_blank", "noopener")
    })
  }

  const load = useCallback(async () => {
    currentLoad.current?.abort()
    const controller = new AbortController()
    currentLoad.current = controller
    const { signal } = controller
    const context = { service, creatorId, postId }
    ++linkRequest.current
    setLinkState(null)
    setPost(null)
    setError(null)
    setComments(null)
    setRevisions(null)
    setRevisionsError(null)
    setSelectedRevisionId(null)
    try {
      const useCases = getApplication().postDetail
      const detail = await useCases.loadPostDetail(context, signal)
      if (signal.aborted) return
      setRevisions(detail.revisions)
      setRevisionsError(detail.revisionsError)
      setPost(detail.post)
      const result = await useCases.loadPostComments(context)
      if (!signal.aborted) setComments(result)
    } catch (error) {
      if (!signal.aborted) setError(error)
    }
  }, [service, creatorId, postId])

  useEffect(() => {
    const contextRecord = {
      service: postContext.service,
      creatorId: postContext.creatorId,
      postId: postContext.postId,
      openedAt: new Date().toISOString(),
    }
    try {
      getPlatformRuntime().services.sessionStorage?.set("pawkemo-current-post-context", JSON.stringify(contextRecord))
    } catch {
      // sessionStorage が利用できない環境でも画面表示は継続する。
    }
    if (validContext) {
      logInfo(`投稿画面を開く service=${service} creatorId=${creatorId} postId=${postId}`)
    } else {
      logError(`不正な投稿URL service=${String(service)} creatorId=${String(creatorId)} postId=${String(postId)}`)
    }
  }, [service, creatorId, postId, validContext])

  const { sessionKey } = getSettings()
  // お気に入り状態の初期判定 (アカウントお気に入り一覧に含まれるか・キャッシュ 60 秒)
  useEffect(() => {
    if (!sessionKey) {
      setFaved("none")
      return
    }
    let alive = true
    setFaved("checking")
    api
      .accountFavorites("post")
      .then((list) => {
        if (!alive) return
        setFaved(list.some((p) => String(p.id) === postId) ? "yes" : "no")
      })
      .catch(() => {
        if (alive) setFaved("no")
      })
    return () => {
      alive = false
    }
  }, [postId, sessionKey])

  // 元サービス投稿 URL の構成 (fanbox は索引の slug が必要)
  useEffect(() => {
    let alive = true
    setOriginalUrl(null)
    api
      .originalPostUrl(postContext.service, postContext.creatorId, postContext.postId)
      .then((u) => {
        if (alive) setOriginalUrl(u)
      })
      .catch(() => {
        if (alive) setOriginalUrl(null)
      })
    return () => {
      alive = false
    }
  }, [service, creatorId, postId])

  useEffect(() => {
    load()
    setFlagged("none")
    window.scrollTo(0, 0)
    return () => currentLoad.current?.abort()
  }, [load])

  // ライトボックス: 投稿変更時に閉じる (cover 除外はグローバル設定なのでリセットしない)
  useEffect(() => {
    setLightboxIndex(null)
    setLoadOriginalImages(false)
  }, [service, creatorId, postId, selectedRevisionId])

  // タッチスワイプによる前後投稿遷移 (FANBOX Viewer「左右スワイプで投稿を見る」型)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0]
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || lightboxIndex !== null) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // 横方向優位のスワイプのみ (縦スクロールを妨害しない)
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return
    if (dx > 0) navPost(post?.prev)
    else navPost(post?.next)
  }

  // キーボード操作 (JHenTai の Keyboard Shortcuts 相当:
  // ライトボックス表示中: Esc=閉じる / ←→=前後の画像
  // 通常表示中: ←→=前後の投稿へ遷移 / Esc=戻る)
  const filesCountRef = useRef(0)
  filesCountRef.current =
    (post ? (post.file?.path ? 1 : 0) : 0) + (post?.attachments?.length || 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // フォーム入力中は除外
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return

      if (lightboxIndex !== null) {
        if (e.key === "Escape") {
          e.stopPropagation()
          setLightboxIndex(null)
        } else if (e.key === "ArrowRight") {
          e.preventDefault()
          setLightboxIndex((i) => (i === null ? null : Math.min(i + 1, filesCountRef.current - 1)))
        } else if (e.key === "ArrowLeft") {
          e.preventDefault()
          setLightboxIndex((i) => (i === null ? null : Math.max(i - 1, 0)))
        }
      } else {
        if (e.key === "ArrowRight" && post?.next) {
          e.preventDefault()
          navPost(post.next)
        } else if (e.key === "ArrowLeft" && post?.prev) {
          e.preventDefault()
          navPost(post.prev)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxIndex, post?.prev, post?.next])

  if (error) {
    return (
      <div className="page">
        <ErrorBox error={error} onRetry={load} />
      </div>
    )
  }
  if (!post) {
    return (
      <div className="page">
        <Spinner />
      </div>
    )
  }

  const activeRevision =
    selectedRevisionId !== null && revisions
      ? (revisions.find((r) => r.revision_id === selectedRevisionId) || null)
      : null
  const displayPost: PawPost = activeRevision || post

  const onFlag = async () => {
    setFlagged("busy")
    try {
      await api.flagPost(postContext.service, postContext.creatorId, postContext.postId)
      setFlagged("ok")
    } catch (e) {
      setFlagged(e instanceof Error && /409|already/i.test(e.message) ? "dup" : "err")
    }
  }

  const navPost = (targetId: string | null | undefined) => {
    if (targetId && validContext) navigate(`/post/${postContext.service}/${encodeURIComponent(postContext.creatorId)}/${encodeURIComponent(targetId)}`)
  }

  /** お気に入りの追加/解除 (web の ☆ Favorite 相当) */
  const toggleFav = async () => {
    if (!sessionKey || (faved !== "yes" && faved !== "no")) return
    const next = faved === "no" ? "yes" : "no"
    setFaved("busy")
    try {
      if (next === "yes") {
        await api.favPostAdd(postContext.service, postContext.creatorId, postContext.postId)
      } else {
        await api.favPostRemove(postContext.service, postContext.creatorId, postContext.postId)
      }
      if (getSettings().sessionKey !== sessionKey) return
      // キャッシュを消して次の詳細表示で最新状態を判定させる
      clearApiCache()
      setFavoritePost(postContext.service, postContext.postId, next === "yes")
      setFaved(next)
      logInfo(`お気に入り${next === "yes" ? "追加" : "解除"} service=${postContext.service} postId=${postContext.postId}`)
    } catch (e) {
      if (getSettings().sessionKey !== sessionKey) return
      logError(`お気に入り操作失敗 service=${postContext.service} postId=${postContext.postId}: ${e instanceof Error ? e.message : String(e)}`)
      const st = apiStatus(e)
      if (st === 401) {
        setFaved("none") // セッション無効 → ボタン非表示 (設定で再設定を促す)
      } else {
        setFaved("err")
      }
    }
  }

  const sourceFiles: PawFile[] = [
    ...(displayPost.file?.path ? [displayPost.file] : []),
    ...(displayPost.attachments || []),
  ]
  const allFiles = sourceFiles.filter(
    (f) => !(postContext.service === "fanbox" && excludeFanboxCover && isFanboxCoverFile(f)),
  )
  filesCountRef.current = allFiles.length
  const listMode = getSettings().postFileListMode || getSettings().noImageMode

  return (
    <div className="page post-page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="post-title-wrap">
        <h1 className="post-title">{displayPost.title || tr("common.untitled")}</h1>
        <div className="post-meta">
          <div className="post-creator">
            <div aria-hidden="true">
              <CreatorAvatar service={postContext.service} id={postContext.creatorId} name={postContext.creatorId} className="small" />
            </div>
            <button type="button" className="link post-creator-link" onClick={() => navigate(`/creator/${postContext.service}/${encodeURIComponent(postContext.creatorId)}`)}>
              {postContext.service} / {postContext.creatorId}
            </button>
          </div>
          <span>
            {tr("post.published", { date: formatDate(displayPost.published) })}
            {displayPost.edited && displayPost.edited !== displayPost.published && ` · ${tr("post.edited", { date: formatDate(displayPost.edited) })}`}
            {displayPost.added && ` · ${tr("post.added", { date: formatDate(displayPost.added) })}`}
            {revisions && revisions.length > 0 && (activeRevision ? ` · ${tr("post.oldVersion", { i: revisions.findIndex((r) => r.revision_id === activeRevision.revision_id) + 1, n: revisions.length })}` : ` · ${tr("post.latestVersion")}`)}
          </span>
        </div>
        {(() => {
          const tags = normalizeTags(displayPost.tags)
          return tags.length > 0 ? (
            <div className="tag-chips">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  onClick={() =>
                    navigate(`/creator/${postContext.service}/${encodeURIComponent(postContext.creatorId)}?tag=${encodeURIComponent(t)}`)
                  }
                  title={tr("post.filterTag", { tag: String(t) })}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null
        })()}
        <div className="creator-actions">
          <FollowButton service={postContext.service} id={postContext.creatorId} />
          {sessionKey && faved !== "none" && (
            <button
              className="btn btn-ghost"
              onClick={toggleFav}
              disabled={faved === "checking" || faved === "busy"}
              title={faved === "err" ? tr("post.favError") : tr("post.favAdd")}
            >
              {faved === "checking" ? "…" : faved === "yes" ? tr("post.favYes") : faved === "err" ? tr("post.favErrorShort") : tr("post.favNo")}
            </button>
          )}
          {(post.prev || post.next) && <div className="post-quick-nav">
            <button
              className="btn btn-sm"
              disabled={!post.prev}
              onClick={() => navPost(post.prev)}
              title={tr("post.prevTitle")}
            >
              {tr("post.prev")}
            </button>
            <button
              className="btn btn-sm"
              disabled={!post.next}
              onClick={() => navPost(post.next)}
              title={tr("post.nextTitle")}
            >
              {tr("post.next")}
            </button>
          </div>}
          <a
            className="btn btn-ghost"
            href={postUrl(postContext.service, postContext.creatorId, postContext.postId)}
            target="_blank"
            rel="noreferrer"
            referrerPolicy="no-referrer"
          >
            {tr("common.openSite")}
          </a>
          {originalUrl && (
            <a
              className="btn"
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              referrerPolicy="no-referrer"
              title={tr("post.originalTitle")}
            >
              {tr("common.openOn", { service: postContext.service })}
            </a>
          )}
        </div>
      </div>

      {displayPost.content && (
        <>
          <div className="post-content" onClick={openExternalLink} dangerouslySetInnerHTML={{ __html: sanitizePostContent(displayPost.content, postContext.service, postContext.postId, proxyReferer) }} />
          {linkState && (
            <div className="hint-row" role="status">
              {tr(linkState.kind === "loading" ? "common.loading" : "post.mirrorLinkMissing")}
              {linkState.kind === "missing" && (
                <a className="btn" href={linkState.url} target="_blank" rel="noreferrer">{tr("post.openOriginalLink")}</a>
              )}
            </div>
          )}
        </>
      )}

      {sourceFiles.length > 0 && !listMode && (
        <div className="post-files">
          <div className="section-row">
            <span className="small">{tr("post.filesCount", { n: allFiles.length })} · {tr(loadOriginalImages ? "post.originalImage" : "post.thumbnail")}</span>
            {postContext.service === "fanbox" && (
              <label className="small">
                <input
                  type="checkbox"
                  checked={excludeFanboxCover}
                  onChange={(e) => toggleFanboxCover(e.target.checked)}
                />
                {tr("post.excludeCover")}
              </label>
            )}
            <button className="btn btn-sm" onClick={() => setLoadOriginalImages((current) => !current)}>
              {tr(loadOriginalImages ? "post.backToThumbnail" : "post.loadOriginals")}
            </button>
          </div>
          {allFiles.length === 0 && <p className="small">{tr("post.noFiles")}</p>}
          {allFiles.map((f, i) => (
            <figure key={i} className="post-file">
              {isVideoFile(f) ? (
                <video
                  src={fileUrl(f, postContext.service, postContext.postId, proxyReferer)}
                  controls
                  preload="metadata"
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <img
                  loading="lazy"
                  src={loadOriginalImages ? fileUrl(f, postContext.service, postContext.postId, proxyReferer) : thumbUrl(f)}
                  alt={f.name}
                  onClick={() => setLightboxIndex(i)}
                  onError={(e) => {
                    const el = e.currentTarget
                    const full = fileUrl(f, postContext.service, postContext.postId, proxyReferer)
                    const src = el.getAttribute("src") || ""
                    if (src !== full) {
                      logWarn(`投稿画像サムネイル取得失敗 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId} file=${f.path}; full URL で再試行`)
                      el.setAttribute("src", full)
                    } else {
                      logError(`投稿画像取得失敗 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId} file=${f.path}`)
                      el.style.display = "none"
                    }
                  }}
                />
              )}
              <figcaption>
                <a href={fileUrl(f, postContext.service, postContext.postId, proxyReferer)} target="_blank" rel="noreferrer" download>
                  {f.name}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {sourceFiles.length > 0 && listMode && (
        <div className="post-file-list-wrap">
          <div className="section-row">
            <span className="small">{tr("post.listModeFiles", { n: allFiles.length })}</span>
            <div className="creator-actions">
              {postContext.service === "fanbox" && (
                <label className="small">
                  <input
                    type="checkbox"
                    checked={excludeFanboxCover}
                    onChange={(e) => toggleFanboxCover(e.target.checked)}
                  />
                  {tr("post.excludeCover")}
                </label>
              )}
              <button className="btn btn-sm" onClick={() => setLoadedFiles(new Set(allFiles.map((_, i) => i)))}>
                {tr("post.loadAll")}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  if (loadOriginalImages) {
                    setLoadOriginalImages(false)
                  } else {
                    setLoadedFiles(new Set(allFiles.map((_, i) => i)))
                    setLoadOriginalImages(true)
                  }
                }}
              >
                {tr(loadOriginalImages ? "post.backToThumbnail" : "post.loadOriginals")}
              </button>
            </div>
          </div>
          <ul className="post-file-list">
            {allFiles.map((f, i) => (
              <li key={i} className="post-file-row">
                <div className="post-file-head">
                  <span className="post-file-name">{f.name || tr("post.unnamed")}</span>
                  <span className="small">{tr(isVideoFile(f) ? "post.video" : "post.image")}</span>
                  {loadedFiles.has(i) ? (
                    <a href={fileUrl(f, postContext.service, postContext.postId, proxyReferer)} target="_blank" rel="noreferrer" download>
                      {tr("post.save")}
                    </a>
                  ) : (
                    <button className="btn btn-sm" onClick={() => setLoadedFiles((prev) => new Set(prev).add(i))}>
                      {tr("post.load")}
                    </button>
                  )}
                </div>
                {loadedFiles.has(i) &&
                  (isVideoFile(f) ? (
                    <video src={fileUrl(f, postContext.service, postContext.postId, proxyReferer)} controls preload="metadata" playsInline />
                  ) : (
                    <img loading="lazy" decoding="async" src={loadOriginalImages ? fileUrl(f, postContext.service, postContext.postId, proxyReferer) : thumbUrl(f)} alt={f.name} />
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(displayPost.embed || {}).length > 0 && (
        <pre className="post-embed">{JSON.stringify(displayPost.embed, null, 2)}</pre>
      )}

      {(post.prev || post.next) && <div className="post-nav">
        <button className="btn" disabled={!post.prev} onClick={() => navPost(post.prev)}>
          {tr("post.prevPost")}
        </button>
        <button className="btn" disabled={!post.next} onClick={() => navPost(post.next)}>
          {tr("post.nextPost")}
        </button>
      </div>}

      <div className="section">
        <div className="section-row">
          <h3>{tr("post.other")}</h3>
          <button className="btn btn-ghost" onClick={onFlag} disabled={flagged === "busy" || flagged === "ok" || flagged === "dup"}>
            {flagged === "ok" ? tr("post.flagged") : flagged === "dup" ? tr("post.duplicate") : flagged === "err" ? tr("post.failed") : tr("post.flag")}
          </button>
        </div>
      </div>

      <div className="section">
        <h3>{tr("post.comments")}</h3>
        {comments === null && <Spinner label={tr("post.commentsLoading")} />}
        {comments && comments.length === 0 && <Empty text={tr("post.noComments")} />}
        {comments && comments.length > 0 && (
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id} className="comment">
                <div className="comment-head">
                  <b>{c.commenter_name || c.commenter}</b> · {formatDate(c.published)}
                </div>
                <div className="comment-body" onClick={openExternalLink}>{sanitizePostContent(c.content, postContext.service, postContext.postId, proxyReferer)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="section">
        <div className="section-row">
          <h3>{tr("post.revisions")}{revisions && revisions.length > 0 ? ` (${revisions.length})` : ""}</h3>
          {revisions && revisions.length > 0 && (
            <label className="revision-selector-label">
              <span className="small">{tr("post.revisionSelect")}</span>
              <select
                className="revision-selector"
                value={String(activeRevision?.revision_id ?? "latest")}
                onChange={(e) => {
                  const nextId = e.target.value === "latest" ? null : Number(e.target.value)
                  setSelectedRevisionId(nextId === null || !Number.isFinite(nextId) ? null : nextId)
                  setLightboxIndex(null)
                }}
              >
                <option value="latest">{tr("post.latestOption")}</option>
                {revisions.map((r, index) => (
                  <option key={r.revision_id} value={String(r.revision_id)}>
                    {tr("post.oldOption", { i: index + 1 })} · {formatDate(r.added)} · {r.title || tr("common.untitled")}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {revisions === null && <Spinner label={tr("post.revisionsLoading")} />}
        {revisionsError !== null && revisionsError !== undefined && <ErrorBox error={revisionsError} />}
        {revisions && revisions.length === 0 && !revisionsError && (
          <Empty text={tr("post.noRevisions")} />
        )}
        {revisions && revisions.length > 0 && (
          <p className="small revision-hint">{tr("post.revisionHint")}</p>
        )}
      </div>

      {lightboxIndex !== null && allFiles[lightboxIndex] && (() => {
        const lightbox = allFiles[lightboxIndex]
        const hasPrev = lightboxIndex > 0
        const hasNext = lightboxIndex < allFiles.length - 1
        return (
          <div className="lightbox" onClick={() => setLightboxIndex(null)}>
            {isVideoFile(lightbox) ? (
              <video
                src={fileUrl(lightbox, postContext.service, postContext.postId, proxyReferer)}
                controls
                autoPlay
                playsInline
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img src={fileUrl(lightbox, postContext.service, postContext.postId, proxyReferer)} alt={lightbox.name} onClick={(e) => e.stopPropagation()} />
            )}
            <div className="lightbox-caption" onClick={(e) => e.stopPropagation()}>
              {allFiles.length > 1 && (
                <span className="lightbox-pos">
                  {lightboxIndex + 1} / {allFiles.length}
                </span>
              )}
              <button className="btn" onClick={() => hasPrev && setLightboxIndex(lightboxIndex - 1)} disabled={!hasPrev}>
                ←
              </button>
              <a href={fileUrl(lightbox, postContext.service, postContext.postId, proxyReferer)} target="_blank" rel="noreferrer" download>
                {lightbox.name}
              </a>
              <button className="btn" onClick={() => hasNext && setLightboxIndex(lightboxIndex + 1)} disabled={!hasNext}>
                →
              </button>
              <button className="btn" onClick={() => setLightboxIndex(null)}>
                {tr("common.close")}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
