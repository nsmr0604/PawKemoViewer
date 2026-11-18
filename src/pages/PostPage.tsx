import { useCallback, useEffect, useRef, useState } from "react"
import { api, apiStatus, fileUrl, postUrl, thumbUrl, isVideoFile, pawchiveProxyUrl } from "../api"
import type { PawComment, PawPost, PawRevision, HashLookupResult, PawFile } from "../types"
import {
  Spinner,
  ErrorBox,
  Empty,
  fmtDate,
  sanitizeContent,
  PostCard,
} from "../components"
import { navigate } from "../router"
import { FollowButton } from "../components/FollowButton"
import { logError, logInfo, logWarn } from "../log"

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
  const validContext =
    (service === "fanbox" || service === "patreon") &&
    [creatorId, postId].every(
      (value) => typeof value === "string" && !!value.trim() &&
        value !== "undefined" && value !== "null" && !value.includes("/"),
    )

  const [post, setPost] = useState<PawPost | null>(null)
  const [comments, setComments] = useState<PawComment[] | null>(null)
  const [revisions, setRevisions] = useState<PawRevision[] | null>(null)
  const [revisionsError, setRevisionsError] = useState<unknown>(null)
  const [selectedRevisionId, setSelectedRevisionId] = useState<number | null>(null)
  const [hashResult, setHashResult] = useState<HashLookupResult | null>(null)
  const [showHash, setShowHash] = useState(false)
  const [flagged, setFlagged] = useState<"none" | "busy" | "ok" | "dup" | "err">("none")
  /** ライトボックスで開いているファイルの allFiles 内インデックス (null=閉じている) */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    if (!validContext) {
      const message = `投稿識別子が不正です: service=${String(service)} creatorId=${String(creatorId)} postId=${String(postId)}`
      logError(message)
      setPost(null)
      setError(new Error(message))
      return
    }
    setPost(null)
    setError(null)
    setComments(null)
    setRevisions(null)
    setRevisionsError(null)
    setSelectedRevisionId(null)
    setHashResult(null)
    setShowHash(false)
    try {
      logInfo(`投稿詳細取得開始 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId}`)
      const p = await api.post(postContext.service, postContext.creatorId, postContext.postId)
      if (
        String(p.service) !== postContext.service ||
        String(p.user) !== postContext.creatorId ||
        String(p.id) !== postContext.postId
      ) {
        logWarn(
          `投稿API応答の識別子不一致 requested=${postContext.service}/${postContext.creatorId}/${postContext.postId} response=${String(p.service)}/${String(p.user)}/${String(p.id)}`,
        )
      }
      const fileCount = (p.file?.path ? 1 : 0) + (p.attachments?.length || 0)
      logInfo(`投稿詳細取得完了 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId} files=${fileCount}`)
      // 改訂履歴を確定してから投稿本文を表示し、旧版が一瞬先に表示されるのを防ぐ。
      try {
        const r = await api.postRevisions(postContext.service, postContext.creatorId, postContext.postId)
        const ordered = (Array.isArray(r) ? r : []).slice().sort((a, b) => {
          const aTime = Date.parse(a.added || "")
          const bTime = Date.parse(b.added || "")
          if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
          if (Number.isNaN(aTime)) return 1
          if (Number.isNaN(bTime)) return -1
          return bTime - aTime
        })
        setRevisions(ordered)
        // 投稿詳細APIが現在の最新版。改訂履歴APIの内容は切替用の旧版として保持する。
        setSelectedRevisionId(null)
        logInfo(`投稿改訂履歴取得完了 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId} revisions=${ordered.length}`)
      } catch (e) {
        if (apiStatus(e) === 404) {
          // 改訂が無い投稿では API が 404 + 空配列を返す (実測・bugs.md 参照)。
          // 404 は「改訂なし」扱いにして ErrorBox を出さない
          setRevisions([])
          setRevisionsError(null)
          logInfo(`投稿改訂履歴なし (404) service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId}`)
        } else {
          setRevisions([])
          setRevisionsError(e)
          logError(`投稿改訂履歴取得失敗 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      setPost(p)
      api.postComments(postContext.service, postContext.creatorId, postContext.postId).then(setComments).catch(() => setComments([]))
    } catch (e) {
      setError(e)
    }
  }, [service, creatorId, postId, validContext])

  useEffect(() => {
    const contextRecord = {
      service: postContext.service,
      creatorId: postContext.creatorId,
      postId: postContext.postId,
      openedAt: new Date().toISOString(),
    }
    try {
      sessionStorage.setItem("pawchive-current-post-context", JSON.stringify(contextRecord))
    } catch {
      // sessionStorage が利用できない環境でも画面表示は継続する。
    }
    if (validContext) {
      logInfo(`投稿画面を開く service=${service} creatorId=${creatorId} postId=${postId}`)
    } else {
      logError(`不正な投稿URL service=${String(service)} creatorId=${String(creatorId)} postId=${String(postId)}`)
    }
  }, [service, creatorId, postId, validContext])

  useEffect(() => {
    load()
    setFlagged("none")
    window.scrollTo(0, 0)
  }, [load])

  // ライトボックス: 投稿変更時に閉じる
  useEffect(() => {
    setLightboxIndex(null)
  }, [service, creatorId, postId])

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

  const hashFromPath = (path: string) => {
    const name = path.split("/").pop() || ""
    return name.replace(/\.[^.]+$/, "")
  }
  const activeRevision =
    selectedRevisionId !== null && revisions
      ? (revisions.find((r) => r.revision_id === selectedRevisionId) || null)
      : null
  const displayPost: PawPost = activeRevision || post
  const mainHash = displayPost.file?.path ? hashFromPath(displayPost.file.path) : ""

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

  const allFiles: PawFile[] = [
    ...(displayPost.file?.path ? [displayPost.file] : []),
    ...(displayPost.attachments || []),
  ]
  filesCountRef.current = allFiles.length

  return (
    <div className="page post-page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="post-title-wrap">
        <h1 className="post-title">{displayPost.title || "(無題)"}</h1>
        <div className="post-meta">
          <span className="link" onClick={() => navigate(`/creator/${postContext.service}/${encodeURIComponent(postContext.creatorId)}`)}>
            {postContext.service} / {postContext.creatorId}
          </span>
          {" · "}
          公開 {fmtDate(displayPost.published)}
          {displayPost.edited && displayPost.edited !== displayPost.published && ` · 編集 ${fmtDate(displayPost.edited)}`}
          {revisions && revisions.length > 0 && (activeRevision ? ` · 旧版 ${revisions.findIndex((r) => r.revision_id === activeRevision.revision_id) + 1}/${revisions.length}` : " · 最新版")}
        </div>
        <div className="creator-actions">
          <FollowButton service={postContext.service} id={postContext.creatorId} />
          <div className="post-quick-nav">
            <button
              className="btn btn-sm"
              disabled={!post.prev}
              onClick={() => navPost(post.prev)}
              title="前の投稿 (←)"
            >
              ← 前
            </button>
            <button
              className="btn btn-sm"
              disabled={!post.next}
              onClick={() => navPost(post.next)}
              title="次の投稿 (→)"
            >
              次 →
            </button>
          </div>
          <a
            className="btn btn-ghost"
            href={postUrl(postContext.service, postContext.creatorId, postContext.postId)}
            target="_blank"
            rel="noreferrer"
            referrerPolicy="no-referrer"
          >
            サイトで開く ↗
          </a>
        </div>
      </div>

      {allFiles.length > 0 && (
        <div className="post-files">
          {allFiles.map((f, i) => (
            <figure key={i} className="post-file">
              {isVideoFile(f) ? (
                <video
                  src={fileUrl(f)}
                  controls
                  preload="metadata"
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <img
                  loading="lazy"
                  src={f === displayPost.file ? thumbUrl(f) : fileUrl(f)}
                  alt={f.name}
                  onClick={() => setLightboxIndex(i)}
                  onError={(e) => {
                    const el = e.currentTarget
                    const full = fileUrl(f)
                    const src = el.getAttribute("src") || ""
                    const proxy = pawchiveProxyUrl(full)
                    if (src !== full && src !== proxy) {
                      logWarn(`投稿画像サムネイル取得失敗 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId} file=${f.path}; full URL で再試行`)
                      el.setAttribute("src", full)
                    } else if (src !== proxy && f.path) {
                      // 端末 DNS ブロック等の迂回: paw:// プロキシ (Rust reqwest) 経由で再試行
                      logWarn(`投稿画像取得失敗 file=${f.path}; paw:// プロキシで再試行`)
                      el.setAttribute("src", proxy)
                    } else {
                      logError(`投稿画像取得失敗 service=${postContext.service} creatorId=${postContext.creatorId} postId=${postContext.postId} file=${f.path}`)
                      el.style.display = "none"
                    }
                  }}
                />
              )}
              <figcaption>
                <a href={fileUrl(f)} target="_blank" rel="noreferrer" download>
                  {f.name}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {displayPost.content && (
        <div className="post-content" dangerouslySetInnerHTML={{ __html: sanitizeContent(displayPost.content, postContext.service) }} />
      )}

      {Object.keys(displayPost.embed || {}).length > 0 && (
        <pre className="post-embed">{JSON.stringify(displayPost.embed, null, 2)}</pre>
      )}

      <div className="post-nav">
        <button className="btn" disabled={!post.prev} onClick={() => navPost(post.prev)}>
          ← 前の投稿
        </button>
        <button className="btn" disabled={!post.next} onClick={() => navPost(post.next)}>
          次の投稿 →
        </button>
      </div>

      {mainHash && (
        <div className="section">
          <div className="section-row">
            <span className="mono small">{mainHash}</span>
            <button
              className="btn"
              onClick={async () => {
                setShowHash(true)
                if (!hashResult) {
                  try {
                    setHashResult(await api.searchHash(mainHash))
                  } catch {
                    setHashResult(null)
                  }
                }
              }}
            >
              同一ファイル検索
            </button>
          </div>
          {showHash && (
            <div className="hash-results">
              {!hashResult && <Spinner label="検索中…" />}
              {hashResult && (hashResult.posts?.length || 0) === 0 && (
                <Empty text="同一ファイルは他に見つかりません" />
              )}
              {hashResult?.posts?.map((p) => (
                <PostCard key={`${p.service}:${p.id}`} post={p as unknown as PawPost} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="section">
        <div className="section-row">
          <h3>その他</h3>
          <button className="btn btn-ghost" onClick={onFlag} disabled={flagged === "busy" || flagged === "ok" || flagged === "dup"}>
            {flagged === "ok" ? "申請済み" : flagged === "dup" ? "既に申請済み" : flagged === "err" ? "失敗" : "再取得を申請 (flag)"}
          </button>
        </div>
      </div>

      <div className="section">
        <h3>コメント</h3>
        {comments === null && <Spinner label="コメント…" />}
        {comments && comments.length === 0 && <Empty text="コメントはありません" />}
        {comments && comments.length > 0 && (
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id} className="comment">
                <div className="comment-head">
                  <b>{c.commenter_name || c.commenter}</b> · {fmtDate(c.published)}
                </div>
                <div className="comment-body">{sanitizeContent(c.content, postContext.service)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="section">
        <div className="section-row">
          <h3>改訂履歴{revisions && revisions.length > 0 ? ` (${revisions.length})` : ""}</h3>
          {revisions && revisions.length > 0 && (
            <label className="revision-selector-label">
              <span className="small">表示する版</span>
              <select
                className="revision-selector"
                value={String(activeRevision?.revision_id ?? "latest")}
                onChange={(e) => {
                  const nextId = e.target.value === "latest" ? null : Number(e.target.value)
                  setSelectedRevisionId(nextId === null || !Number.isFinite(nextId) ? null : nextId)
                  setLightboxIndex(null)
                }}
              >
                <option value="latest">最新版（現在の投稿）</option>
                {revisions.map((r, index) => (
                  <option key={r.revision_id} value={String(r.revision_id)}>
                    旧版 {index + 1} · {fmtDate(r.added)} · {r.title || "(無題)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {revisions === null && <Spinner label="改訂履歴…" />}
        {revisionsError !== null && revisionsError !== undefined && <ErrorBox error={revisionsError} />}
        {revisions && revisions.length === 0 && !revisionsError && (
          <Empty text="改訂履歴はありません" />
        )}
        {revisions && revisions.length > 0 && (
          <p className="small revision-hint">現在の投稿（最新版）を初期表示しています。プルダウンから過去の版へ切り替えられます。</p>
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
                src={fileUrl(lightbox)}
                controls
                autoPlay
                playsInline
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img src={fileUrl(lightbox)} alt={lightbox.name} onClick={(e) => e.stopPropagation()} />
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
              <a href={fileUrl(lightbox)} target="_blank" rel="noreferrer" download>
                {lightbox.name}
              </a>
              <button className="btn" onClick={() => hasNext && setLightboxIndex(lightboxIndex + 1)} disabled={!hasNext}>
                →
              </button>
              <button className="btn" onClick={() => setLightboxIndex(null)}>
                閉じる
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
