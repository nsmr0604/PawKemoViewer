import { useCallback, useEffect, useMemo, useState } from "react"
import { api, getSettings, clearApiCache, ApiError, apiStatus } from "../api"
import type { PawPost, AccountFavorite } from "../types"
import { getAllSeen, setSeen, getSeen, updateSeenCheck } from "../db"
import { loadFollows, removeFollow, syncFollowsWithAccount } from "../follows"
import { ErrorBox, Empty } from "../components/Feedback"
import { PostGrid } from "../components/PostGrid"
import { formatDate } from "../format-date"
import { CreatorAvatar } from "../components/CreatorAvatar"
import { navigate } from "../router"
import { t } from "../i18n"
import { getPlatformRuntime } from "../platform/runtime"

/** NEW を表示する投稿の公開日時の範囲 (直近 7 日)。 */
const NEW_POST_WINDOW_MS = 7 * 24 * 60 * 60_000

/** 自動新着チェックのクールダウン (この間はネットワークを叩かない) */
const CHECK_COOLDOWN_MS = 5 * 60_000

interface FollowState {
  service: string
  id: string
  name: string
  newest?: PawPost
  isNew?: boolean
  lastSeen?: string
  error?: string
  checking?: boolean
  checkedAt?: number
}

/** 公開日時が直近 7 日以内の投稿だけ NEW 対象にする。日時不明・不正値は対象外。 */
function isRecentPost(post?: { published?: string; added?: string }): boolean {
  const timestamp = [post?.published, post?.added]
    .map((value) => Date.parse(value || ""))
    .find((value) => Number.isFinite(value))
  if (timestamp === undefined) return false
  const age = Date.now() - timestamp
  return age >= 0 && age <= NEW_POST_WINDOW_MS
}

/** IndexedDB に保存した最小限の投稿情報を一覧表示用に復元する。 */
function restoreCachedPost(
  follow: FollowState,
  cached?: { id: string; title?: string; published?: string },
): PawPost | undefined {
  if (!cached) return undefined
  return { ...cached, service: follow.service, user: follow.id } as PawPost
}

export function FavoritesPage() {
  const { sessionKey } = getSettings()
  // 選択タブを保存しておき、次回起動時に復元する (FANBOX Viewer「ホーム既定タブ」型)
  const storage = getPlatformRuntime().services.storage
  const [tab, setTabState] = useState<"follows" | "account">(() => {
    const t = storage?.get("pawkemo-fav-tab")
    return t === "account" ? "account" : "follows"
  })
  const setTab = (t: "follows" | "account") => {
    setTabState(t)
    storage?.set("pawkemo-fav-tab", t)
  }
  const [follows, setFollows] = useState<FollowState[]>([])
  const [accountFavs, setAccountFavs] = useState<AccountFavorite[] | null>(null)
  const [accountErr, setAccountErr] = useState<unknown>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  // ソート (web の favorites UI 相当: お気に入り日 / 投稿日 / 取得日 + 降順/昇順)
  const [favSort, setFavSort] = useState<"faved" | "published" | "added">("faved")
  const [favOrder, setFavOrder] = useState<"desc" | "asc">("desc")
  // フォロー一覧も投稿お気に入りと同じ操作感でソート可能にする
  const [followSort, setFollowSort] = useState<"published" | "checked" | "name" | "followed">("published")
  const [followOrder, setFollowOrder] = useState<"desc" | "asc">("desc")

  const sortedFollows = useMemo(() => {
    const indexed = follows.map((follow, index) => ({ follow, index }))
    const timestamp = (value?: string) => {
      const parsed = Date.parse(value || "")
      return Number.isFinite(parsed) ? parsed : 0
    }
    indexed.sort((a, b) => {
      let result = 0
      if (followSort === "published") {
        result = timestamp(a.follow.newest?.published || a.follow.newest?.added) -
          timestamp(b.follow.newest?.published || b.follow.newest?.added)
      } else if (followSort === "checked") {
        result = (a.follow.checkedAt || 0) - (b.follow.checkedAt || 0)
      } else if (followSort === "name") {
        result = a.follow.name.localeCompare(b.follow.name, undefined, { sensitivity: "base" })
      } else {
        // 元の配列は新しくフォローした順 (先頭が最新)
        result = a.index - b.index
        return followOrder === "desc" ? result : -result
      }
      if (result === 0) return a.index - b.index
      return followOrder === "desc" ? -result : result
    })
    return indexed.map(({ follow }) => follow)
  }, [follows, followSort, followOrder])

  const sortedFavs = useMemo(() => {
    if (!accountFavs) return []
    const key = (p: AccountFavorite): number => {
      if (favSort === "faved") return p.faved_seq ?? 0
      const iso = favSort === "published" ? p.published || p.added : p.added || p.published
      const t = Date.parse(iso || "")
      return isNaN(t) ? 0 : t
    }
    const arr = [...accountFavs]
    arr.sort((a, b) => (favOrder === "desc" ? key(b) - key(a) : key(a) - key(b)))
    return arr
  }, [accountFavs, favSort, favOrder])

  const refresh = useCallback(async () => {
    const list = loadFollows()
    const base: FollowState[] = list.map((f) => ({ ...f }))
    // 既読状態を読み込み
    const seenAll = await getAllSeen()
    for (const s of base) {
      const e = seenAll.find((x) => x.key === `${s.service}:${s.id}`)
      if (!e) continue
      s.lastSeen = e.lastSeenPostId
      s.checkedAt = e.checkedAt
      s.newest = restoreCachedPost(s, e.newest)
      s.isNew = !!s.newest && s.newest.id !== e.lastSeenPostId && isRecentPost(s.newest)
    }
    setFollows(base)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** 新着チェック: 各フォローの最新投稿を取得して既読IDと比較 (4並列)。
   *  force=false (自動) の場合はチェック済みのものをクールダウン中スキップして API 負荷を抑える */
  const checkNew = useCallback(async (force = false) => {
    setChecking(true)
    const list = loadFollows()
    const queue = [...list]

    const checkOne = async (f: (typeof list)[number]) => {
      const key = `${f.service}:${f.id}`
      const seen = await getSeen(key)

      // クールダウン中 (自動チェックのみ): 保存済みの最新情報で判定して API を叩かない
      if (!force && seen?.checkedAt && Date.now() - seen.checkedAt < CHECK_COOLDOWN_MS) {
        const st: FollowState = { ...f, lastSeen: seen?.lastSeenPostId, checkedAt: seen?.checkedAt }
        st.newest = restoreCachedPost(st, seen.newest)
        st.isNew = !!st.newest && st.newest.id !== seen?.lastSeenPostId && isRecentPost(st.newest)
        setFollows((prev) => {
          const copy = [...prev]
          const idx = copy.findIndex((x) => x.service === f.service && x.id === f.id)
          if (idx >= 0) copy[idx] = st
          return copy
        })
        return
      }

      const st: FollowState = { ...f, checking: true }
      try {
        const posts = await api.creatorPosts(f.service, f.id, { o: 0 })
        st.newest = posts[0]
        const newestInfo = posts[0]
          ? { id: posts[0].id, title: posts[0].title, published: posts[0].published || posts[0].added }
          : undefined
        // API 待機中に「既読」が押されていても、その既読IDを上書きしないよう
        // IndexedDB の readwrite transaction 内で最新状態を読み直してから更新する。
        const latestSeen = await updateSeenCheck(key, newestInfo)
        st.lastSeen = latestSeen.lastSeenPostId
        st.checkedAt = latestSeen.checkedAt
        st.isNew = !!posts[0] &&
          posts[0].id !== latestSeen.lastSeenPostId &&
          isRecentPost(posts[0])
      } catch (e) {
        st.error = e instanceof Error ? e.message : String(e)
      }
      setFollows((prev) => {
        const copy = [...prev]
        const idx = copy.findIndex((x) => x.service === f.service && x.id === f.id)
        if (idx >= 0) copy[idx] = st
        return copy
      })
    }

    const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const f = queue.shift()
        if (f) await checkOne(f)
      }
    })
    await Promise.all(workers)
    setChecking(false)
  }, [])

  useEffect(() => {
    checkNew(false) // 自動チェック (クールダウン適用)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // アカウント同期後にも新着を確認する。同期で追加された購読先も対象に含める。
  useEffect(() => {
    if (!sessionKey) return
    let active = true
    syncFollowsWithAccount()
      .then(async (count) => {
        if (!active) return
        await refresh()
        setSyncResult(t("favorites.synced", { n: count }))
        await checkNew(false)
      })
      .catch((e) => {
        if (active) setSyncResult(t("favorites.syncFailed", { msg: e instanceof Error ? e.message : String(e) }))
      })
    return () => {
      active = false
    }
  }, [sessionKey, refresh, checkNew])

  const markRead = async (f: FollowState) => {
    if (!f.newest) return
    const info = {
      id: f.newest.id,
      title: f.newest.title,
      published: f.newest.published || f.newest.added,
    }
    await setSeen(`${f.service}:${f.id}`, f.newest.id, info)
    setFollows((prev) =>
      prev.map((x) =>
        x.service === f.service && x.id === f.id ? { ...x, lastSeen: f.newest!.id, isNew: false, checkedAt: Date.now() } : x,
      ),
    )
  }

  const markAllRead = async () => {
    for (const f of follows) {
      if (f.newest) {
        const info = {
          id: f.newest.id,
          title: f.newest.title,
          published: f.newest.published || f.newest.added,
        }
        await setSeen(`${f.service}:${f.id}`, f.newest.id, info)
      }
    }
    setFollows((prev) => prev.map((x) => ({ ...x, isNew: false, lastSeen: x.newest?.id, checkedAt: x.newest ? Date.now() : x.checkedAt })))
  }

  const loadAccount = useCallback(async () => {
    setAccountFavs(null)
    setAccountErr(null)
    try {
      const posts = await api.accountFavorites("post")
      setAccountFavs(posts)
    } catch (e) {
      setAccountErr(e)
    }
  }, [])

  // アカウントタブを開いた時点で自動取得 (web の favorites と同じ挙動)
  useEffect(() => {
    if (tab === "account" && sessionKey && accountFavs === null) {
      loadAccount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sessionKey])

  const newCount = follows.filter((f) => f.isNew).length

  return (
    <div className="page">
      <div className="tabs">
        <button className={`tab ${tab === "follows" ? "tab-active" : ""}`} onClick={() => setTab("follows")}>
          {t("nav.favorites")} {newCount > 0 && <span className="badge">{newCount}</span>}
        </button>
        <button className={`tab ${tab === "account" ? "tab-active" : ""}`} onClick={() => setTab("account")}>
          {t("favorites.tabAccount")}
        </button>
      </div>

      {tab === "follows" && (
        <>
          <div className="hint-row">
            <span>{t("favorites.desc")}</span>
            {syncResult && <span role="status">{syncResult}</span>}
            <button
              className="btn"
              disabled={checking}
              onClick={() => {
                clearApiCache()
                checkNew(true)
              }}
            >
              {checking ? t("favorites.checking") : t("favorites.check")}
            </button>
          </div>
          {follows.length > 0 && (
            <>
            <div className="hint-row">
              <span>{t("favorites.count", { n: follows.length })}</span>
              <div className="segmented">
                <button className={`seg ${followSort === "published" ? "seg-active" : ""}`} onClick={() => setFollowSort("published")}>
                  {t("favorites.sortLatestPost")}
                </button>
                <button className={`seg ${followSort === "checked" ? "seg-active" : ""}`} onClick={() => setFollowSort("checked")}>
                  {t("favorites.sortChecked")}
                </button>
                <button className={`seg ${followSort === "name" ? "seg-active" : ""}`} onClick={() => setFollowSort("name")}>
                  {t("favorites.sortName")}
                </button>
                <button className={`seg ${followSort === "followed" ? "seg-active" : ""}`} onClick={() => setFollowSort("followed")}>
                  {t("favorites.sortFollowed")}
                </button>
                <button
                  className={`seg ${followOrder === "asc" ? "seg-active" : ""}`}
                  onClick={() => setFollowOrder(followOrder === "desc" ? "asc" : "desc")}
                  title={followOrder === "desc" ? t("favorites.orderAsc") : t("favorites.orderDesc")}
                >
                  {followOrder === "desc" ? t("favorites.descOrder") : t("favorites.asc")}
                </button>
              </div>
            </div>
            <div className="hint-row">
              <span />
              <button className="btn btn-ghost" onClick={markAllRead}>
                {t("favorites.markAllRead")}
              </button>
            </div>
            </>
          )}
          {follows.length === 0 && <Empty text={t("favorites.emptyFollows")} />}
          <div className="creator-list">
            {sortedFollows.map((f) => (
              <div key={`${f.service}:${f.id}`} className="creator-row">
                <div
                  className="creator-row-main"
                  onClick={() => navigate(`/creator/${f.service}/${f.id}`)}
                >
                  <CreatorAvatar service={f.service} id={f.id} name={f.name} />
                  <div className="creator-row-copy">
                    <div className="creator-name">
                      {f.name || f.id}
                      {f.isNew && <span className="badge-new">NEW</span>}
                    </div>
                    <div className="creator-sub">
                      {f.service}
                      {f.newest ? ` · ${t("favorites.latest", { date: formatDate(f.newest.published || f.newest.added) })}` : ""}
                      {f.error ? ` · ${f.error}` : ""}
                    </div>
                    {f.newest && (
                      <div
                        className="creator-post-title link"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/post/${f.newest!.service}/${f.newest!.user}/${f.newest!.id}`)
                        }}
                      >
                        {f.newest.title || t("common.untitled")}
                      </div>
                    )}
                  </div>
                </div>
                <div className="creator-row-actions">
                  {f.isNew && (
                    <button className="btn btn-ghost" onClick={() => markRead(f)}>
                      {t("favorites.markRead")}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      try {
                        await removeFollow(f.service, f.id)
                        await refresh()
                      } catch (e) {
                        setSyncResult(t("favorites.unfollowFailed", { msg: e instanceof Error ? e.message : String(e) }))
                      }
                    }}
                  >
                    {t("favorites.unfollow")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "account" && (
        <>
          <div className="hint-row">
            <span>
              {sessionKey ? t("favorites.accountDesc") : t("favorites.loginDesc")}
            </span>
            {sessionKey ? (
              <button className="btn" onClick={loadAccount}>
                {t("favorites.fetch")}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate("/login?next=/favorites")}>
                {t("login.submit")}
              </button>
            )}
          </div>

          {accountErr !== null && <ErrorBox error={accountErr} onRetry={loadAccount} />}
          {accountErr instanceof ApiError && apiStatus(accountErr) === 401 && (
            <div className="error-box">
              <p>{t("favorites.sessionInvalid")}</p>
            </div>
          )}
          {accountFavs && accountFavs.length === 0 && <Empty text={t("favorites.emptyAccount")} />}
          {accountFavs && accountFavs.length > 0 && (
            <div className="hint-row">
              <span>{t("favorites.count", { n: accountFavs.length })}</span>
              <div className="segmented">
                <button
                  className={`seg ${favSort === "faved" ? "seg-active" : ""}`}
                  onClick={() => setFavSort("faved")}
                >
                  {t("favorites.sortFaved")}
                </button>
                <button
                  className={`seg ${favSort === "published" ? "seg-active" : ""}`}
                  onClick={() => setFavSort("published")}
                >
                  {t("favorites.sortPublished")}
                </button>
                <button
                  className={`seg ${favSort === "added" ? "seg-active" : ""}`}
                  onClick={() => setFavSort("added")}
                >
                  {t("favorites.sortAdded")}
                </button>
                <button
                  className={`seg ${favOrder === "asc" ? "seg-active" : ""}`}
                  onClick={() => setFavOrder(favOrder === "desc" ? "asc" : "desc")}
                  title={favOrder === "desc" ? t("favorites.orderAsc") : t("favorites.orderDesc")}
                >
                  {favOrder === "desc" ? t("favorites.descOrder") : t("favorites.asc")}
                </button>
              </div>
            </div>
          )}
          {sortedFavs.length > 0 && (
            <PostGrid posts={sortedFavs as PawPost[]} />
          )}
        </>
      )}
    </div>
  )
}
