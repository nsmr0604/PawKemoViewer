import {
  invoke
} from "@tauri-apps/api/core"

import type {
  PawAnnouncement,
  PawComment,
  PawCreator,
  PawPost,
  PawRevision,
  PawTag,
  HashLookupResult,
  AccountFavorite,
  PawFile,
} from "./types"
import { logApiFailure } from "./log"

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "pawchive-settings"

export interface Settings {
  /** pawchive.pw の session cookie の値 (お気に入り同期に使用) */
  sessionKey: string
  /** テーマ: dark (既定) / light */
  theme: "dark" | "light"
  /** レイアウトモード (JHenTai 参考): auto (既定) / desktop / mobile */
  layoutMode: "auto" | "desktop" | "mobile"
  /** 低通信モード (No Image Mode - JHenTai/EhViewer 参考): 画像を読み込まない */
  noImageMode: boolean
  /** 投稿一覧の表示形式 (FANBOX Viewer 参考): grid (既定) / list */
  postViewMode: "grid" | "list"
  /** 通信タイムアウト秒 (JHenTai の Connect/Receive Timeout 参考)。既定 30 秒 */
  timeoutSecs: number
  /** 画像を paw:// プロキシ経由で読み込む。
   *  実機の DNS フィルタリング (AdGuard sinkhole) で *.pawchive.pw が
   *  WebView 直読みできない環境向け (bugs.md 参照)。Rust (reqwest) 経路は実測正常 */
  proxyImages: boolean
}

/** 設定変更を上位コンポーネント (App) に通知するイベント名。
 *  モジュール変数 settings を読むだけのコンポーネントは再レンダリングされないため、
 *  変更をイベントで通知する (レイアウトモード即時反映バグの再発防止) */
export const SETTINGS_CHANGED_EVENT = "pawchive-settings-changed"

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultSettings()
}

function defaultSettings(): Settings {
  return {
    sessionKey: "",
    theme: "dark",
    layoutMode: "auto",
    noImageMode: false,
    postViewMode: "grid",
    timeoutSecs: 30,
    proxyImages: false,
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

let settings: Settings = loadSettings()

export function getSettings(): Settings {
  return settings
}

export function updateSettings(patch: Partial<Settings>) {
  const sessionChanged =
    patch.sessionKey !== undefined && patch.sessionKey !== settings.sessionKey
  settings = { ...settings, ...patch }
  if (sessionChanged) clearApiCache()
  saveSettings(settings)
  // App 等の上位コンポーネントに変更を通知 (即時反映)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT))
  }
}

/** GET レスポンスキャッシュを全消去 (手動更新時などに使用) */
export function clearApiCache() {
  cacheGeneration++
  getCache.clear()
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * エラーメッセージから実 HTTP ステータスを復元する。
 * Rust 側は失敗時に "STATUS=401 BODY=..." 形式の文字列を返すため
 * ApiError.status は常に 500 になる。ここで実値を取り出す。
 */
export function apiStatus(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err)
  const m = msg.match(/STATUS=(\d+)/)
  return m ? Number(m[1]) : null
}

// ---------------------------------------------------------------------------
// 負荷制御: 同時実行数の制限 + リクエスト間隔 + GET レスポンスキャッシュ
// (pawchive 側に過度な負荷をかけないための仕組み)
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 3 // 同時に飛ばす API リクエストの上限
const MIN_GAP_MS = 250 // リクエスト開始の最小間隔
const CACHE_TTL_MS = 60_000 // GET レスポンスのキャッシュ生存時間
const CACHE_MAX = 150 // キャッシュ最大エントリ数

let activeCount = 0
let lastStartAt = 0
const waiting: (() => void)[] = []

function pump() {
  while (activeCount < MAX_CONCURRENT && waiting.length > 0) {
    const wait = Math.max(0, lastStartAt + MIN_GAP_MS - Date.now())
    if (wait > 0) {
      setTimeout(pump, wait)
      return
    }
    const run = waiting.shift()!
    lastStartAt = Date.now()
    activeCount++
    run()
  }
}

/** リクエストをスケジューラ経由で実行する */
function scheduled<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeCount--
          pump()
        })
    }
    waiting.push(run)
    pump()
  })
}

interface CacheEntry {
  expires: number
  promise?: Promise<unknown>
  data?: unknown
}

const getCache = new Map<string, CacheEntry>()

// セッション変更や手動更新より前に開始したリクエストが、
// 古いアカウントの結果を新しいキャッシュへ戻さないための世代番号。
let cacheGeneration = 0

function cacheGet(key: string): CacheEntry | undefined {
  const e = getCache.get(key)
  if (!e) return undefined
  if (e.expires < Date.now()) {
    getCache.delete(key)
    return undefined
  }
  return e
}

function cachePut(key: string, entry: CacheEntry) {
  getCache.set(key, entry)
  // 上限超過時はもっとも古い (先頭の) エントリを削除
  while (getCache.size > CACHE_MAX) {
    const first = getCache.keys().next().value
    if (first === undefined) break
    getCache.delete(first)
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  sessionKey = settings.sessionKey,
  useCache = true,
): Promise<T> {
  const method = (init?.method || "GET").toUpperCase()
  const url = `${path}`
  // 呼び出し時点のセッションを固定し、キュー待機中にアカウントが
  // 切り替わっても別アカウントの資格情報で送らない。
  const requestSessionKey = sessionKey
  const requestGeneration = cacheGeneration
  const cacheKey = `${requestGeneration}:${url}`

  // GET はキャッシュ / 実行中リクエストの統合を行う
  if (method === "GET" && useCache) {
    const cached = cacheGet(cacheKey)
    if (cached) {
      if (cached.promise) return cached.promise as Promise<T>
      if (cached.data !== undefined) return cached.data as T
    }
  }

  const exec = scheduled(async () => {
    try {
      // 注意: Tauri v2 のコマンド引数は Rust 側 snake_case を camelCase で渡す
      // (session_key ではなく sessionKey。snake_case だとバインドされず
      //  常にセッション無しになり認証系 API が 401 になる)
      const result = await invoke<string>(
        "api_request",
        {
          path,
          method,
          sessionKey:
            requestSessionKey || null,
          timeoutSecs:
            settings.timeoutSecs || null,
        }
      )

      try {
        return JSON.parse(result) as T
      } catch {
        return result as T
      }

    } catch (err) {

      const message =
        err instanceof Error
          ? err.message
          : String(err)

      // 診断ログに残す (エラー source chain: パス/メソッド/ステータス/本文抜粋)
      logApiFailure(url, method, message)

      throw new ApiError(
        500,
        message
      )
    }
  })

  if (method === "GET" && useCache) {
    const entry: CacheEntry = { expires: Date.now() + CACHE_TTL_MS, promise: exec }
    cachePut(cacheKey, entry)
    try {
      const data = await exec
      entry.data = data
      entry.promise = undefined
      return data
    } catch (e) {
      // 失敗はキャッシュしない (再試行可能に)
      getCache.delete(cacheKey)
      throw e
    }
  }

  return exec
}

// ---------------------------------------------------------------------------
// エンドポイント
// ---------------------------------------------------------------------------

export const api = {
  /** 最近の投稿 (サイト全体)。q= 検索, o= オフセット (50刻み) */
  posts: (opts: { q?: string; o?: number } = {}) => {
    const p = new URLSearchParams()
    if (opts.q) p.set("q", opts.q)
    if (opts.o) p.set("o", String(opts.o))
    const qs = p.toString()
    return request<PawPost[]>(`/posts${qs ? `?${qs}` : ""}`)
  },

  /** 全クリエイター (約10万件) */
  creators: () => request<PawCreator[]>("/creators"),

  /** クリエイター投稿一覧 */
  creatorPosts: (
    service: string,
    creatorId: string,
    opts: { q?: string; tag?: string[]; o?: number } = {},
  ) => {
    const p = new URLSearchParams()
    if (opts.q) p.set("q", opts.q)
    for (const t of opts.tag || []) p.append("tag", t)
    if (opts.o) p.set("o", String(opts.o))
    const qs = p.toString()
    return request<PawPost[]>(
      `/${service}/user/${creatorId}${qs ? `?${qs}` : ""}`,
    )
  },

  creatorProfile: (service: string, creatorId: string) =>
    request<PawCreator>(`/${service}/user/${creatorId}/profile`),

  creatorTags: (service: string, creatorId: string) =>
    request<PawTag[]>(`/${service}/user/${creatorId}/tags`),

  creatorAnnouncements: (service: string, creatorId: string) =>
    request<PawAnnouncement[]>(`/${service}/user/${creatorId}/announcements`),

  post: (service: string, creatorId: string, postId: string) =>
    request<PawPost>(`/${service}/user/${creatorId}/post/${postId}`),

  postRevisions: (service: string, creatorId: string, postId: string) => {
    // 投稿詳細と同じ識別子を使い、URL segment ごとに encode して要求する。
    // 不正な識別子は /undefined/... のような API URL に変換しない。
    const validService = service === "fanbox" || service === "patreon"
    const validIds = [creatorId, postId].every(
      (value) => typeof value === "string" && !!value.trim() &&
        value !== "undefined" && value !== "null" && !value.includes("/"),
    )
    if (!validService || !validIds) {
      return Promise.reject(new Error(
        `Invalid post revision context: service=${String(service)} creatorId=${String(creatorId)} postId=${String(postId)}`,
      ))
    }
    return request<PawRevision[]>(
      `/${encodeURIComponent(service)}/user/${encodeURIComponent(creatorId)}/post/${encodeURIComponent(postId)}/revisions`,
    )
  },

  postComments: (service: string, creatorId: string, postId: string) =>
    request<PawComment[]>(
      `/${service}/user/${creatorId}/post/${postId}/comments`,
    ),

  /** ハッシュ (SHA-256) でファイルを検索 */
  searchHash: (hash: string) => request<HashLookupResult>(`/search_hash/${hash}`),

  // ----- 認証必要 (session cookie を Cookie ヘッダーで転送) -----

  /** アカウントのお気に入り一覧 type: "post" | "artist"
   *  sessionKey を指定すると、未保存の入力値を使った疎通確認もできる。 */
  accountFavorites: (type: "post" | "artist", sessionKey = settings.sessionKey) =>
    request<AccountFavorite[]>(
      `/account/favorites?type=${type}`,
      undefined,
      sessionKey,
      sessionKey === settings.sessionKey,
    ),

  favPostAdd: (service: string, creatorId: string, postId: string) =>
    request<void>(`/favorites/post/${service}/${creatorId}/${postId}`, {
      method: "POST",
    }),

  favPostRemove: (service: string, creatorId: string, postId: string) =>
    request<void>(`/favorites/post/${service}/${creatorId}/${postId}`, {
      method: "DELETE",
    }),

  favCreatorAdd: (service: string, creatorId: string) =>
    request<void>(`/favorites/creator/${service}/${creatorId}`, {
      method: "POST",
    }),

  favCreatorRemove: (service: string, creatorId: string) =>
    request<void>(`/favorites/creator/${service}/${creatorId}`, {
      method: "DELETE",
    }),

  /** 投稿を re-import 申請する */
  flagPost: (service: string, creatorId: string, postId: string) =>
    request<void>(`/${service}/user/${creatorId}/post/${postId}/flag`, {
      method: "POST",
    }),

  version: () => request<string>("/app_version"),

  /** 元サービス (fanbox / patreon) の投稿 URL。fanbox は slug サブドメイン (クリエイター
   *  索引から取得・実測: https://{slug}.fanbox.cc/posts/{id} = 200)。patreon は bare ID で
   *  実ブラウザが canonical URL へリダイレクト (実測 2026-11-18)。構成不可なら null */
  originalPostUrl: async (
    service: string,
    creatorId: string,
    postId: string,
  ): Promise<string | null> => {
    if (service === "fanbox") {
      const slug = await fanboxSlug(creatorId)
      if (!slug) return null
      return `https://${slug}.fanbox.cc/posts/${encodeURIComponent(postId)}`
    }
    if (service === "patreon") return `https://www.patreon.com/posts/${encodeURIComponent(postId)}`
    return null
  },

  /** 元サービスのクリエイターページ URL。
   *  patreon は user?u={id} が creator name へリダイレクト (実測 307)。 */
  originalCreatorUrl: async (service: string, creatorId: string): Promise<string | null> => {
    if (service === "fanbox") {
      const slug = await fanboxSlug(creatorId)
      if (!slug) return null
      return `https://${slug}.fanbox.cc`
    }
    if (service === "patreon") return `https://www.patreon.com/user?u=${encodeURIComponent(creatorId)}`
    return null
  },
}

/** fanbox の creator slug (public_id) をクリエイター索引から取得 */
async function fanboxSlug(creatorId: string): Promise<string | null> {
  try {
    const { getCreatorRow } = await import("./db")
    const row = await getCreatorRow(`fanbox:${creatorId}`)
    return row?.publicId || null
  } catch {
    return null
  }
}

/** 投稿の tags を正規化する。
 *  詳細 API は tags を **PostgreSQL 配列リテラル文字列**で返すことがある
 *  (実測 2026-11-18: "tags":"{\"one piece\"}" = text[] の文字列化)。
 *  配列 / JSON 文字列 / PG 配列リテラルの両方に対応 */
export function normalizeTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string")
  if (typeof v === "string") {
    const s = v.trim()
    try {
      const p = JSON.parse(s) as unknown
      if (Array.isArray(p)) return normalizeTags(p)
    } catch {
      /* JSON でなければ下で PG 配列リテラルとして試す */
    }
    // PostgreSQL 配列リテラル (例: {"one piece"} / {"a","b c"})
    if (s.startsWith("{") && s.endsWith("}")) {
      const inner = s.slice(1, -1).trim()
      if (!inner) return []
      const out: string[] = []
      const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(inner))) {
        if (m[1] !== undefined) {
          out.push(m[1].replace(/\\(.)/g, "$1"))
        } else if (m[2] !== undefined) {
          const t = m[2].trim()
          if (t) out.push(t)
        }
      }
      return out
    }
  }
  return []
}

// ---------------------------------------------------------------------------
// ファイル URL
// ---------------------------------------------------------------------------

/** 本体ファイル URL (元ファイル名を付けてダウンロード時の名前にする)。
 *  fanbox / patreon 由来の一時 URL (署名付き) はリファラーチェックでブロックされるため
 *  同一オリジンプロキシ経由にする。 */
export function fileUrl(f: PawFile | undefined): string {
  if (!f) return ""
  // deferred ファイル (動画等) は署名付き一時 URL を使う
  if (f.temp_download_url) return maybeProxyPawchive(proxyFileUrl(f.temp_download_url))
  if (!f.path && f.temp_url) return maybeProxyPawchive(proxyFileUrl(f.temp_url))
  if (!f.path) return ""
  const server = f.server?.replace(/\/$/, "") || "https://n1.pawchive.pw"
  const name = f.name ? `?f=${encodeURIComponent(f.name)}` : ""
  return maybeProxyPawchive(`${server}/data${f.path}${name}`)
}

/** サムネイル URL (縮小画像が無い場合は画像側でフォールバック) */
export function thumbUrl(f: PawFile | undefined): string {
  if (!f?.path) return ""
  const url = `https://img.pawchive.pw/thumbnail/data${f.path}`
  return getSettings().proxyImages ? pawchiveProxyUrl(url) : url
}

/** 動画ファイルかどうか */
export function isVideoFile(f: PawFile | undefined): boolean {
  if (!f) return false
  if (f.deferred) return /\.(mp4|webm|mov|m4v|m3u8)$/i.test(f.name || f.temp_url || "")
  return /\.(mp4|webm|mov|m4v|gifv)$/i.test(f.name || f.path || "")
}

export function postUrl(service: string, userId: string, postId: string) {
  return `https://pawchive.pw/${service}/user/${userId}/post/${postId}`
}

// ---------------------------------------------------------------------------
// リファラーチェック回避プロキシ (paw:// プロトコル)
//
// Tauri の WebView からは Referer を設定できないため、リファラーチェックで
// ブロックされる URL は Rust 側 (paw:// プロトコルハンドラ) 経由にする。
// ---------------------------------------------------------------------------

/** ホットリンク対策 (Referer チェック) をしている可能性のあるホスト */
const HOTLINK_HOSTS = ["fanbox.cc", "patreon.com", "patreonusercontent.com", "pximg.net"]

function isHotlinkHost(hostname: string): boolean {
  return HOTLINK_HOSTS.some((d) => hostname === d || hostname.endsWith("." + d))
}

/** paw プロトコル経由 URL (Rust 側でリファラーを偽装して中継) */
function pawProxyUrl(url: string, referer: string, force = false): string {
  return `http://paw.localhost/file?u=${encodeURIComponent(url)}&r=${encodeURIComponent(referer)}${force ? "&f=1" : ""}`
}

/** pawchive 自身のホストを paw:// 強制プロキシ経由に変換する (f=1)。
 *  端末 DNS が *.pawchive.pw をブロックする環境 (AdGuard sinkhole) の迂回用。
 *  pawchive 以外の URL はそのまま返す */
export function pawchiveProxyUrl(url: string): string {
  if (!url) return url
  try {
    const h = new URL(url)
    if (!h.hostname.endsWith("pawchive.pw")) return url
    return pawProxyUrl(h.toString(), "https://pawchive.pw/", true)
  } catch {
    return url
  }
}

/** proxyImages 設定が有効なときのみ pawchive ホストを paw:// 経由にする */
function maybeProxyPawchive(url: string): string {
  return getSettings().proxyImages ? pawchiveProxyUrl(url) : url
}

/** リファラーチェックでブロックされる可能性のあるファイル URL を paw 経由に変換する。
 *  pawchive 自身のミラー (n1 / img) はそのまま。 */
export function proxyFileUrl(url: string): string {
  if (!url) return url
  let h: URL
  try {
    h = new URL(url)
  } catch {
    return url
  }
  if (h.protocol !== "https:" && h.protocol !== "http:") return url
  if (!isHotlinkHost(h.hostname)) return url
  const referer =
    h.hostname.endsWith("patreon.com") || h.hostname.endsWith("patreonusercontent.com")
      ? "https://www.patreon.com/"
      : "https://www.fanbox.cc/"
  return pawProxyUrl(h.toString(), referer)
}

/** 投稿本文から張られた外部リンクを paw 経由に変換する。
 *  リンク先がリファラー (元サイト = fanbox / patreon) を検証してブロックする
 *  ケースに対応。fanbox / patreon / pawchive 自体へのリンクはそのまま開く。 */
export function proxyLinkUrl(url: string, service?: string): string {
  if (!url) return url
  let h: URL
  try {
    h = new URL(url)
  } catch {
    return url
  }
  if (h.protocol !== "https:" && h.protocol !== "http:") return url
  if (h.origin === location.origin) return url
  // fanbox / patreon 自体は SPA のためそのまま (リファラーチェックが無い・実測)
  if (h.hostname.endsWith("pawchive.pw") || isHotlinkHost(h.hostname)) return url
  const referer = service === "patreon" ? "https://www.patreon.com/" : "https://www.fanbox.cc/"
  return pawProxyUrl(h.toString(), referer)
}

export function creatorUrl(service: string, userId: string) {
  return `https://pawchive.pw/${service}/user/${userId}`
}

/** クリエイターアイコン (webp。存在しない場合は 204 が返る) */
export function creatorIconUrl(service: string, userId: string) {
  return `https://pawchive.pw/icons/${service}/${userId}`
}

/** クリエイターバナー (webp。存在しない場合は 204 が返る) */
export function creatorBannerUrl(service: string, userId: string) {
  return `https://pawchive.pw/banners/${service}/${userId}`
}
