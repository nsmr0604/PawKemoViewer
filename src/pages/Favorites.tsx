import { useCallback, useEffect, useState } from "react"
import { api, getSettings, clearApiCache, ApiError, apiStatus } from "../api"
import type { PawPost, AccountFavorite } from "../types"
import { getAllSeen, setSeen, getSeen } from "../db"
import { loadFollows, removeFollow, syncFollowsWithAccount } from "../follows"
import { ErrorBox, Empty, fmtDate } from "../components"
import { navigate } from "../router"

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
}

export function FavoritesPage() {
  const { sessionKey } = getSettings()
  // 選択タブを保存しておき、次回起動時に復元する (FANBOX Viewer「ホーム既定タブ」型)
  const [tab, setTabState] = useState<"follows" | "account">(() => {
    const t = localStorage.getItem("pawchive-fav-tab")
    return t === "account" ? "account" : "follows"
  })
  const setTab = (t: "follows" | "account") => {
    setTabState(t)
    localStorage.setItem("pawchive-fav-tab", t)
  }
  const [follows, setFollows] = useState<FollowState[]>([])
  const [accountFavs, setAccountFavs] = useState<AccountFavorite[] | null>(null)
  const [accountErr, setAccountErr] = useState<unknown>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async () => {
    const list = loadFollows()
    const base: FollowState[] = list.map((f) => ({ ...f }))
    // 既読状態を読み込み
    const seenAll = await getAllSeen()
    for (const s of base) {
      const e = seenAll.find((x) => x.key === `${s.service}:${s.id}`)
      if (e) s.lastSeen = e.lastSeenPostId
    }
    setFollows(base)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // ログイン中は画面を開いた時点でアカウントとローカルを自動同期する。
  useEffect(() => {
    if (!sessionKey) return
    syncFollowsWithAccount()
      .then(async (count) => {
        await refresh()
        setSyncResult("pawchive と同期しました (" + count + " 件)")
      })
      .catch((e) => setAccountErr(e))
  }, [sessionKey, refresh])

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
        const st: FollowState = { ...f, lastSeen: seen?.lastSeenPostId }
        if (seen.newest) {
          st.newest = seen.newest as unknown as PawPost
          st.isNew = seen.newest.id !== seen.lastSeenPostId
        }
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
        st.lastSeen = seen?.lastSeenPostId
        st.isNew = !!posts[0] && posts[0].id !== seen?.lastSeenPostId
        // チェック時刻と最新投稿を保存 (クールダウン中の再チェック用)
        await setSeen(key, seen?.lastSeenPostId || "", newestInfo)
        // lastSeenPostId が未設定のまま保存してしまうのを避ける (既読前は元の値を維持)
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
        x.service === f.service && x.id === f.id ? { ...x, lastSeen: f.newest!.id, isNew: false } : x,
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
    setFollows((prev) => prev.map((x) => ({ ...x, isNew: false, lastSeen: x.newest?.id })))
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

  const newCount = follows.filter((f) => f.isNew).length

  return (
    <div className="page">
      <div className="tabs">
        <button className={`tab ${tab === "follows" ? "tab-active" : ""}`} onClick={() => setTab("follows")}>
          フォロー {newCount > 0 && <span className="badge">{newCount}</span>}
        </button>
        <button className={`tab ${tab === "account" ? "tab-active" : ""}`} onClick={() => setTab("account")}>
          投稿お気に入り
        </button>
      </div>

      {tab === "follows" && (
        <>
          <div className="hint-row">
            <span>フォロー中クリエイターの新着をチェックします</span>
            <button
              className="btn"
              disabled={checking}
              onClick={() => {
                clearApiCache()
                checkNew(true)
              }}
            >
              {checking ? "チェック中…" : "新着チェック"}
            </button>
          </div>
          {follows.length > 0 && (
            <div className="hint-row">
              <span />
              <button className="btn btn-ghost" onClick={markAllRead}>
                すべて既読
              </button>
            </div>
          )}
          {follows.length === 0 && <Empty text="フォローはありません。クリエイターページで ☆ を押してください" />}
          <div className="creator-list">
            {follows.map((f) => (
              <div key={`${f.service}:${f.id}`} className="creator-row">
                <div
                  className="creator-row-main"
                  onClick={() => navigate(`/creator/${f.service}/${f.id}`)}
                >
                  <div className="creator-avatar">{(f.name || f.id).slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="creator-name">
                      {f.name || f.id}
                      {f.isNew && <span className="badge-new">NEW</span>}
                    </div>
                    <div className="creator-sub">
                      {f.service}
                      {f.newest ? ` · 最新 ${fmtDate(f.newest.published || f.newest.added)}` : ""}
                      {f.error ? ` · ${f.error}` : ""}
                    </div>
                    {f.newest && (
                      <div
                        className="creator-sub link"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/post/${f.newest!.service}/${f.newest!.user}/${f.newest!.id}`)
                        }}
                      >
                        {f.newest.title || "(無題)"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="creator-row-actions">
                  {f.isNew && (
                    <button className="btn btn-ghost" onClick={() => markRead(f)}>
                      既読
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      try {
                        await removeFollow(f.service, f.id)
                        await refresh()
                      } catch (e) {
                        setSyncResult("解除に失敗しました: " + (e instanceof Error ? e.message : String(e)))
                      }
                    }}
                  >
                    解除
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
              {sessionKey
                ? "pawchive アカウントの投稿お気に入りを取得します"
                : "ログインするとアカウントのお気に入りを取得できます"}
            </span>
            {sessionKey ? (
              <button className="btn" onClick={loadAccount}>
                投稿お気に入りを取得
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate("/login?next=/favorites")}>
                ログイン
              </button>
            )}
          </div>
          {syncResult && <div className="hint-row">{syncResult}</div>}
          {accountErr !== null && <ErrorBox error={accountErr} onRetry={loadAccount} />}
          {accountErr instanceof ApiError && apiStatus(accountErr) === 401 && (
            <div className="error-box">
              <p>セッションキーが無効です。pawchive.pw にログインして、cookie の session 値を設定欄に貼り付けてください。</p>
            </div>
          )}
          {accountFavs && accountFavs.length === 0 && <Empty text="アカウントのお気に入りはありません" />}
          <div className="creator-list">
            {accountFavs?.map((f) => (
              <div
                key={`${f.service}:${f.id}`}
                className="creator-row"
                onClick={() => f.service && f.id && navigate(`/creator/${f.service}/${f.id}`)}
              >
                <div className="creator-row-main">
                  <div className="creator-avatar">{(f.name || f.id).slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="creator-name">{f.name || f.id}</div>
                    <div className="creator-sub">
                      {f.service} · {f.id}
                      {f.updated ? ` · 更新 ${fmtDate(f.updated)}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
