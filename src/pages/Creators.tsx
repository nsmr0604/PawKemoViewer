import { useCallback, useEffect, useRef, useState } from "react"
import { api, clearApiCache, creatorBannerUrl } from "../api"
import {
  searchCreators,
  saveCreators,
  creatorsCount,
  getAllCreatorRows,
  getMeta,
  invalidateCreatorIndex,
  SEARCH_INDEX_VERSION,
  type CreatorRow,
} from "../db"
import type { PawCreator } from "../types"
import { Spinner, ErrorBox, Empty, fmtDate, CreatorAvatar } from "../components"
import { navigate } from "../router"
import { logError } from "../log"
import { isFollowed } from "../follows"
import { readClipboardTextSafe, extractCreatorFromText, type ExtractedCreator } from "../platform"
import { getSearchHistory, addSearchHistory, clearSearchHistory } from "../history"
import { normalizeCreatorQuery } from "../db"
import { t } from "../i18n"

/** API の日時値 (Unix 秒/ミリ秒または ISO 文字列) を比較用数値へ変換 */
function toTimestamp(value: number | string | undefined): number {
  if (value === undefined || value === "") return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** API レスポンス → 索引行 (slug / 人気度 / 更新日を保持) */
function toRow(c: PawCreator): CreatorRow {
  const slug = (c.public_id || "").toLowerCase()
  return {
    key: `${c.service}:${c.id}`,
    id: c.id,
    service: c.service,
    name: c.name,
    nameLower: (c.name || "").toLowerCase(),
    ...(slug ? { publicId: c.public_id, publicIdLower: slug } : {}),
    ...(c.favorited !== undefined ? { favorited: Number(c.favorited) || 0 } : {}),
    ...(c.updated !== undefined ? { updated: toTimestamp(c.updated) } : {}),
    ...(c.indexed !== undefined ? { indexed: toTimestamp(c.indexed) } : {}),
  }
}

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

  // クリップボードの URL 検出 (JHenTai の Check Gallery URL in Clipboard 参考)
  useEffect(() => {
    let active = true
    const checkClip = async () => {
      const text = await readClipboardTextSafe()
      if (!active || !text) return
      const found = extractCreatorFromText(text)
      if (found) setClipCreator(found)
    }
    checkClip()
    window.addEventListener("focus", checkClip)
    return () => {
      active = false
      window.removeEventListener("focus", checkClip)
    }
  }, [])

  // メモリ索引から即時検索 (構築途中でも部分結果を表示)
  const runSearch = useCallback(async (value: string) => {
    const seq = ++searchSeq.current
    const res = await searchCreators(value, 100000)
    if (seq !== searchSeq.current) return
    setRows(res)
    // fanbox 投稿 URL 貼り付け (@{slug}/posts/{id} 両パターン) → 直接開けるリンクを出す
    const norm = normalizeCreatorQuery(value)
    if (norm.postId && norm.service && res[0] && res[0].service === norm.service) {
      setPostLink({ service: norm.service, creatorId: res[0].id, postId: norm.postId, name: res[0].name })
    } else {
      setPostLink(null)
    }
  }, [])

  // 初期表示
  useEffect(() => {
    let alive = true
    ;(async () => {
      const count = await creatorsCount()
      if (!alive) return
      setBuilt(count > 0 ? count : null)
      await runSearch("")
      if (alive) setReady(true)
      // パック索引が現行バージョンなら何もしない
      const version = count > 0 ? await getMeta<number>("creatorsIndexVersion") : null
      if (version === SEARCH_INDEX_VERSION) return
      setBuilding(true)
      setError(null)
      try {
        // 移行: slug 付き per-row 索引 (v2 で構築済み) があれば API 不要でパック化。
        // 無ければ (未構築 or v1) API から取得して構築
        const legacy = count > 0 ? await getAllCreatorRows() : []
        const hasCurrentFields = legacy.length > 0 && legacy.every((row) => row.publicIdLower !== undefined && row.updated !== undefined)
        let total: number
        if (hasCurrentFields) {
          invalidateCreatorIndex()
          await saveCreators(legacy)
          total = legacy.length
        } else {
          const all = await api.creators()
          if (!alive) return
          const mapped = all.map(toRow)
          await saveCreators(mapped)
          total = mapped.length
        }
        if (!alive) return
        setBuilt(total)
        // 構築完了で現在の検索をやり直す (フルデータで)
        await runSearch(qRef.current)
      } catch (e) {
        if (alive) setError(e)
      } finally {
        if (alive) setBuilding(false)
      }
    })()
    return () => {
      alive = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = useCallback(
    async (value: string) => {
      setQ(value)
      setVisibleCount(60)
      await runSearch(value)
    },
    [runSearch],
  )

  /** Enter で確定した場合のみ履歴に追加 (キー入力ごとの追加を避ける) */
  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = qRef.current.trim()
    if (t) {
      addSearchHistory(t)
      setHistory(getSearchHistory())
    }
  }

  const visibleRows = rows
    .filter((row) => serviceFilter === "all" || row.service === serviceFilter)
    .sort((a, b) => {
      if (sortBy === "updated") return (b.updated || 0) - (a.updated || 0) || (b.favorited || 0) - (a.favorited || 0)
      if (sortBy === "popular") return (b.favorited || 0) - (a.favorited || 0) || (b.updated || 0) - (a.updated || 0)
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    })
  const displayedRows = visibleRows.slice(0, visibleCount)

  return (
    <div className="page">
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

      <form className="search-bar" onSubmit={onSearchSubmit}>
        <input
          type="search"
          placeholder={t("creators.searchPlaceholder")}
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
        {q && (
          <button type="button" className="btn btn-ghost" onClick={() => onSearch("")}>
            ×
          </button>
        )}
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
          <span className="small text-muted">{t("creators.serviceFilter")}</span>
          <div className="tag-chips">
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
              clearApiCache()
              invalidateCreatorIndex()
              setBuilding(true)
              try {
                const all = await api.creators()
                const mapped = all.map(toRow)
                await saveCreators(mapped)
                setBuilt(mapped.length)
                await runSearch(q)
                setVisibleCount(60)
              } catch (e) {
                setError(e)
              } finally {
                setBuilding(false)
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

export function CreatorHeader({ service, id }: { service: string; id: string }) {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof api.creatorProfile>> | null>(null)
  const [error, setError] = useState<unknown>(null)
  // バナーは存在しない場合 204 が返るので、読み込み失敗時はフォールバック表示
  // (アイコンは CreatorAvatar がキャッシュ付きで処理)
  const [bannerOk, setBannerOk] = useState(true)
  useEffect(() => {
    let alive = true
    setProfile(null)
    setBannerOk(true)
    api
      .creatorProfile(service, id)
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [service, id])
  if (error)
    return (
      <div className="creator-head error-box">
        <p>{t("creators.profileError")}</p>
      </div>
    )
  if (!profile) return <Spinner label={t("creators.profileLoading")} />
  return (
    <div className="creator-head creator-head-col">
      {bannerOk && (
        <img
          className="creator-banner"
          src={creatorBannerUrl(service, id)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            logError(`クリエイターバナー取得失敗 service=${service} id=${id} url=${creatorBannerUrl(service, id)}`)
            setBannerOk(false)
          }}
        />
      )}
      <div className="creator-head-row">
        {/* アイコンはキャッシュ (icons.ts + Rust ディスクキャッシュ) から表示 */}
        <CreatorAvatar service={service} id={id} name={profile.name} className="big" />
        <div>
          <h2>{profile.name}</h2>
          <div className="creator-sub">
            {service} · {id} · {t("creators.lastUpdated")} {fmtDate(String(profile.updated))}
          </div>
        </div>
      </div>
    </div>
  )
}
