import { useEffect, useRef, useState, useCallback } from "react"
import type { PawFile, PawPost } from "./types"
import { fileUrl, thumbUrl, proxyFileUrl, proxyLinkUrl, getSettings, pawchiveProxyUrl } from "./api"
import { navigate } from "./router"
import { logWarn, logError } from "./log"
import { isFollowed } from "./follows"
import { isFavPost, loadFavPosts, FAVPOSTS_CHANGED_EVENT } from "./favstate"
import { getCreatorIcon } from "./icons"

/** 投稿カード用のマーク状態 (フォロー中クリエイター / お気に入り投稿)。
 *  favstate / follows の変更イベントを購読して全カードが同期する。
 *  web はフォロー = クリエイターのお気に入り、☆ = 投稿のお気に入り */
function usePostMarks(
  service: string | undefined,
  userId: string | undefined,
  postId: string | undefined,
): { faved: boolean; followed: boolean } {
  const [marks, setMarks] = useState(() => ({
    faved: !!(service && postId && isFavPost(service, postId)),
    followed: !!(service && userId && isFollowed(service, userId)),
  }))
  useEffect(() => {
    const upd = () =>
      setMarks({
        faved: !!(service && postId && isFavPost(service, postId)),
        followed: !!(service && userId && isFollowed(service, userId)),
      })
    loadFavPosts()
    window.addEventListener(FAVPOSTS_CHANGED_EVENT, upd)
    window.addEventListener("pawkemo-follows-changed", upd)
    upd()
    return () => {
      window.removeEventListener(FAVPOSTS_CHANGED_EVENT, upd)
      window.removeEventListener("pawkemo-follows-changed", upd)
    }
  }, [service, userId, postId])
  return marks
}

// ---------------------------------------------------------------------------
// 汎用
// ---------------------------------------------------------------------------

export function Spinner({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const raw = error instanceof Error ? error.message : String(error)
  // Rust 側は "STATUS=401 BODY=..." 形式で返す。実ステータスと本文を取り出す
  const sm = raw.match(/STATUS=(\d+) BODY=([\s\S]*)/)
  const status = sm ? Number(sm[1]) : null
  const body = sm ? sm[2].trim() : raw

  // 状況に応じた説明 (JHenTai の Sad Panda 型: 固有名詞 + 対処を伝える)
  let title = "読み込みに失敗しました"
  let hint = ""
  if (raw.includes("Fake site")) {
    title = "サイトにブロックされた可能性 (Fake site)"
    hint = "pawchive 側が中継を検出し偽ページを返しています。しばらく時間を置いてから再試行してください。"
  } else if (status === 401) {
    title = "セッションキーが無効または期限切れです"
    hint = "設定 → アカウント からセッションキーを再設定するか、ID/パスワードでログインし直してください。"
  } else if (status === 429) {
    title = "リクエストが集中しています (429)"
    hint = "サーバー側の制限です。少し待ってから再試行してください。"
  } else if (status === 403) {
    title = "アクセスが拒否されました (403)"
    hint = "サーバー側の制限または中継検出の可能性があります。時間を置いて再試行してください。"
  } else if (status === 404) {
    title = "見つかりません (404)"
    hint = "投稿またはクリエイターが削除されたか、URL が正しくない可能性があります。"
  } else if (status === 502 || /upstream|network|timed?\s?out/i.test(raw)) {
    title = "サーバーに接続できません"
    hint = "ネットワーク状態を確認するか、時間を置いて再試行してください。"
  }

  return (
    <div className="error-box">
      <p className="error-title">⚠️ {title}</p>
      {hint && <p className="error-hint">{hint}</p>}
      {body && (
        <details className="error-detail">
          <summary>詳細 ({status !== null ? `HTTP ${status}` : "理由不明"})</summary>
          <pre className="mono small">{body.slice(0, 2000)}{body.length > 2000 ? "…" : ""}</pre>
        </details>
      )}
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          再試行
        </button>
      )}
    </div>
  )
}

export function Empty({ text = "何もありません" }: { text?: string }) {
  return <div className="empty">{text}</div>
}

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
    const handler = () => check()
    window.addEventListener("scroll", handler, { passive: true })
    window.addEventListener("resize", handler)
    return () => {
      window.removeEventListener("scroll", handler)
      window.removeEventListener("resize", handler)
    }
  }, [check])

  // 環境によっては scroll イベントが発火しない (非表示ウィンドウ等) ため、
  // 低頻度のポーリングでも末尾到達を判定する (getBoundingClientRect 1回のみで軽量)
  useEffect(() => {
    if (!onEndReached) return
    const iv = setInterval(check, 700)
    return () => clearInterval(iv)
  }, [check, onEndReached])

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
      {done && posts.length > 0 && <div className="grid-end">終わり</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// サムネイル
// ---------------------------------------------------------------------------

export function Thumb({ file, className }: { file: PawFile | undefined; className?: string }) {
  // 0=thumb, 1=full, 2=pkv:// プロキシ (DNS ブロック等の迂回), 3=giveup
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0)
  const noImage = getSettings().noImageMode

  useEffect(() => setStage(0), [file?.path])
  if (!file?.path || stage === 3)
    return <div className={`thumb thumb-fallback ${className || ""}`}>🖼️</div>
  if (noImage)
    return <div className={`thumb thumb-noimage ${className || ""}`}>🖼️ (通信節約)</div>

  const thumb = thumbUrl(file)
  const full = fileUrl(file)
  const src = stage === 0 ? thumb : stage === 1 ? full : pawchiveProxyUrl(full)

  return (
    <img
      className={`thumb ${className || ""}`}
      loading="lazy"
      decoding="async"
      src={src}
      alt={file.name || ""}
      onError={() => {
        setStage((s) => {
          if (s === 2) logError(`サムネイル取得失敗 file=${file?.path || ""} thumb=${thumb}`)
          return s < 3 ? ((s + 1) as 1 | 2 | 3) : s
        })
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// クリエイターアイコン (キャッシュ付き)
// ---------------------------------------------------------------------------

/** クリエイターのアイコンを表示する。取得・キャッシュは src/icons.ts
 *  (メモリ → IndexedDB → Rust ディスクキャッシュ)。
 *  アイコンが無いクリエイターは先頭文字のフォールバック。
 *  `big` はクリエイターページヘッダー用の大きいサイズ */
export function CreatorAvatar({
  service,
  id,
  name,
  className = "",
}: {
  service: string
  id: string
  name?: string
  className?: string
}) {
  const [icon, setIcon] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getCreatorIcon(service, id).then((url) => {
      if (alive) setIcon(url)
    })
    return () => {
      alive = false
    }
  }, [service, id])
  const letter = (name || id || "?").slice(0, 1).toUpperCase()
  if (icon) {
    return <img className={`creator-avatar ${className}`} src={icon} alt={name || id} loading="lazy" decoding="async" />
  }
  return <div className={`creator-avatar ${className}`}>{letter}</div>
}

// ---------------------------------------------------------------------------
// 投稿グリッド & リスト
// ---------------------------------------------------------------------------

/** 不完全な投稿データから壊れた投稿URLを生成しない */
function postPath(post: PawPost): string | null {
  const validService = post.service === "fanbox" || post.service === "patreon"
  const validIds = [post.user, post.id].every(
    (value) => typeof value === "string" && !!value.trim() &&
      value !== "undefined" && value !== "null" && !value.includes("/"),
  )
  if (!validService || !validIds) {
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
  const imageCount =
    (post.file?.path ? 1 : 0) + (post.attachments?.length || 0)
  // フォロー中クリエイター / お気に入り投稿のマーク (pawchive の ☆ / ★ と同期)
  const marks = usePostMarks(post.service, post.user, post.id)
  return (
    <div className={`post-card${marks.faved ? " is-fav" : ""}${marks.followed ? " is-follow" : ""}`} onClick={onClick}>
      <div className="post-card-thumb">
        <Thumb file={post.file?.path ? post.file : post.attachments?.[0]} />
        {isNew && <span className="badge-new">NEW</span>}
        {imageCount > 1 && <span className="badge-count">🖼{imageCount}</span>}
        {marks.faved && <span className="badge-fav">★</span>}
        {marks.followed && <span className="badge-follow">フォロー中</span>}
      </div>
      <div className="post-card-info">
        <div className="post-card-title">
          {marks.faved && <span className="title-mark">★</span>}
          {post.title || "(無題)"}
        </div>
        <div className="post-card-meta">
          {post.service} · {fmtDate(post.published || post.added)}
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
  const imageCount =
    (post.file?.path ? 1 : 0) + (post.attachments?.length || 0)
  const marks = usePostMarks(post.service, post.user, post.id)
  return (
    <div className={`post-row-item${marks.faved ? " is-fav" : ""}${marks.followed ? " is-follow" : ""}`} onClick={onClick}>
      <div className="post-row-thumb">
        <Thumb file={post.file?.path ? post.file : post.attachments?.[0]} />
        {imageCount > 1 && <span className="badge-count-mini">🖼{imageCount}</span>}
        {marks.faved && <span className="badge-fav mini">★</span>}
      </div>
      <div className="post-row-content">
        <div className="post-row-title">
          {marks.faved && <span className="title-mark">★</span>}
          {isNew && <span className="badge-new inline">NEW</span>}
          {post.title || "(無題)"}
        </div>
        <div className="post-row-meta">
          <span className="post-row-service">{post.service}</span>
          <span className="post-row-user">{marks.followed ? "★" : ""}{post.user}</span>
          <span className="post-row-date">{fmtDate(post.published || post.added)}</span>
        </div>
      </div>
    </div>
  )
}

export interface PostGridProps {
  posts: PawPost[]
  /** 続きを読み込む (末尾に到達したら呼ばれる) */
  onEndReached?: () => void
  loading?: boolean
  done?: boolean
  newIds?: Set<string>
  /** 表示モード: grid (既定) / list */
  viewMode?: "grid" | "list"
}

// ---------------------------------------------------------------------------
// その他
// ---------------------------------------------------------------------------

export function fmtDate(iso: string | undefined): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso.slice(0, 10)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  } catch {
    return iso
  }
}

/** 投稿本文 HTML を最小限サニタイズして返す。
 *  リファラーチェックでブロックされるホストの画像はプロキシ経由に、
 *  外部リンクはリファラー偽装プロキシ経由に書き換える。 */
export function sanitizeContent(html: string, service?: string): string {
  if (!html) return ""
  const doc = new DOMParser().parseFromString(html, "text/html")
  for (const el of Array.from(doc.querySelectorAll("script,style,iframe,object,embed,link,meta"))) {
    el.remove()
  }
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on") || (name === "href" && attr.value.trim().toLowerCase().startsWith("javascript"))) {
        el.removeAttribute(attr.name)
      }
    }
  }
  // 本文中の画像: fanbox / patreon のホットリンク対策を回避
  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src") || ""
    const proxied = proxyFileUrl(src)
    if (proxied && proxied !== src) {
      img.setAttribute("src", proxied)
      img.setAttribute("loading", "lazy")
      img.setAttribute("decoding", "async")
    }
  }
  // 外部リンク: リファラー偽装プロキシ経由に (新規タブで開く)
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") || ""
    if (/^(#|mailto:|javascript:|tel:)/i.test(href)) continue
    const proxied = proxyLinkUrl(href, service)
    if (proxied && proxied !== href) {
      a.setAttribute("href", proxied)
      a.setAttribute("target", "_blank")
      a.setAttribute("rel", "noopener")
    }
  }
  return doc.body.innerHTML
}
