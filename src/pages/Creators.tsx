import { useCallback, useEffect, useRef, useState } from "react"
import { api, clearApiCache, creatorIconUrl, creatorBannerUrl } from "../api"
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
import { Spinner, ErrorBox, Empty, fmtDate } from "../components"
import { navigate } from "../router"
import { logError } from "../log"
import { readClipboardTextSafe, extractCreatorFromText, type ExtractedCreator } from "../platform"
import { getSearchHistory, addSearchHistory, clearSearchHistory } from "../history"

/** API レスポンス → 索引行 (パック v2: slug / favorited を保持) */
function toRow(c: PawCreator): CreatorRow {
  const slug = (c.public_id || "").toLowerCase()
  return {
    key: `${c.service}:${c.id}`,
    id: c.id,
    service: c.service,
    name: c.name,
    nameLower: (c.name || "").toLowerCase(),
    ...(slug ? { publicId: c.public_id, publicIdLower: slug } : {}),
    ...(c.favorited ? { favorited: c.favorited } : {}),
  }
}

export function CreatorsPage() {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<CreatorRow[]>([])
  const [ready, setReady] = useState(false)
  const [building, setBuilding] = useState(false)
  const [built, setBuilt] = useState<number | null>(null) // 構築済み件数 (進捗表示)
  const [error, setError] = useState<unknown>(null)
  const [clipCreator, setClipCreator] = useState<ExtractedCreator | null>(null)
  const [history, setHistory] = useState<string[]>(getSearchHistory)
  const qRef = useRef(q)
  qRef.current = q

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
    const res = await searchCreators(value)
    setRows(res)
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
        const hasSlug = legacy.length > 0 && legacy[0].publicIdLower !== undefined
        let total: number
        if (hasSlug) {
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

  return (
    <div className="page">
      {clipCreator && (
        <div className="clipboard-banner">
          <div className="clipboard-banner-info">
            <span className="clipboard-badge">📋 クリップボード</span>
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
              検索に入力
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
          placeholder="クリエイター名 / ID / URL で検索"
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
            title="検索履歴を消去"
            onClick={() => {
              clearSearchHistory()
              setHistory([])
            }}
          >
            履歴消去 ×
          </button>
        </div>
      )}
      <div className="hint-row">
        <span>
          {building && built !== null
            ? `クリエイター索引を構築中… ${built.toLocaleString()} 件 (検索はすぐ使えます)`
            : built !== null
              ? `クリエイター ${built.toLocaleString()} 件をキャッシュ済み`
              : "クリエイター一覧"}
        </span>
        {built !== null && !building && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (!window.confirm("クリエイター一覧 (約10万件) を再取得します。よろしいですか?")) return
              clearApiCache()
              invalidateCreatorIndex()
              setBuilding(true)
              try {
                const all = await api.creators()
                const mapped = all.map(toRow)
                await saveCreators(mapped)
                setBuilt(mapped.length)
                await runSearch(q)
              } catch (e) {
                setError(e)
              } finally {
                setBuilding(false)
              }
            }}
          >
            更新
          </button>
        )}
      </div>
      {building && built === null && <Spinner label="クリエイター一覧を取得中 (約10万件・初回のみ)…" />}
      {error !== null && <ErrorBox error={error} onRetry={() => onSearch(q)} />}
      {ready && rows.length === 0 && !building && <Empty text="該当するクリエイターがいません" />}
      <div className="creator-list">
        {rows.map((r) => (
          <div
            key={r.key}
            className="creator-row"
            onClick={() => navigate(`/creator/${r.service}/${r.id}`)}
          >
            <div className="creator-avatar">{r.name.slice(0, 1).toUpperCase()}</div>
            <div className="creator-row-main">
              <div className="creator-name">{r.name}</div>
              <div className="creator-sub">
                {r.service} · {r.id}
                {r.publicId ? ` · ${r.publicId}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CreatorHeader({ service, id }: { service: string; id: string }) {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof api.creatorProfile>> | null>(null)
  const [error, setError] = useState<unknown>(null)
  // アイコン/バナーは存在しない場合 204 が返るので、読み込み失敗時はフォールバック表示
  const [iconOk, setIconOk] = useState(true)
  const [bannerOk, setBannerOk] = useState(true)
  useEffect(() => {
    let alive = true
    setProfile(null)
    setIconOk(true)
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
        <p>プロフィール取得失敗 (投稿一覧は表示できます)</p>
      </div>
    )
  if (!profile) return <Spinner label="プロフィール…" />
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
        {iconOk ? (
          <img
            className="creator-avatar big"
            src={creatorIconUrl(service, id)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => {
              logError(`クリエイターアイコン取得失敗 service=${service} id=${id} url=${creatorIconUrl(service, id)}`)
              setIconOk(false)
            }}
          />
        ) : (
          <div className="creator-avatar big">{(profile.name || "?").slice(0, 1).toUpperCase()}</div>
        )}
        <div>
          <h2>{profile.name}</h2>
          <div className="creator-sub">
            {service} · {id} · 最終更新 {fmtDate(String(profile.updated))}
          </div>
        </div>
      </div>
    </div>
  )
}
