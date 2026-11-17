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
}

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
  return { sessionKey: "", theme: "dark" }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

let settings: Settings = loadSettings()

export function getSettings(): Settings {
  return settings
}

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch }
  saveSettings(settings)
}

/** GET レスポンスキャッシュを全消去 (手動更新時などに使用) */
export function clearApiCache() {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase()
  const url = `${path}`

  // GET はキャッシュ / 実行中リクエストの統合を行う
  if (method === "GET") {
    const cached = cacheGet(url)
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
            settings.sessionKey || null,
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

  if (method === "GET") {
    const entry: CacheEntry = { expires: Date.now() + CACHE_TTL_MS, promise: exec }
    cachePut(url, entry)
    try {
      const data = await exec
      entry.data = data
      entry.promise = undefined
      return data
    } catch (e) {
      // 失敗はキャッシュしない (再試行可能に)
      getCache.delete(url)
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

  postRevisions: (service: string, creatorId: string, postId: string) =>
    request<PawRevision[]>(
      `/${service}/user/${creatorId}/post/${postId}/revisions`,
    ),

  postComments: (service: string, creatorId: string, postId: string) =>
    request<PawComment[]>(
      `/${service}/user/${creatorId}/post/${postId}/comments`,
    ),

  /** ハッシュ (SHA-256) でファイルを検索 */
  searchHash: (hash: string) => request<HashLookupResult>(`/search_hash/${hash}`),

  // ----- 認証必要 (session cookie を x-pawchive-session 経由で転送) -----

  /** アカウントのお気に入り一覧 type: "post" | "artist" */
  accountFavorites: (type: "post" | "artist") =>
    request<AccountFavorite[]>(`/account/favorites?type=${type}`),

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
  if (f.temp_download_url) return proxyFileUrl(f.temp_download_url)
  if (!f.path && f.temp_url) return proxyFileUrl(f.temp_url)
  if (!f.path) return ""
  const server = f.server?.replace(/\/$/, "") || "https://n1.pawchive.pw"
  const name = f.name ? `?f=${encodeURIComponent(f.name)}` : ""
  return `${server}/data${f.path}${name}`
}

/** サムネイル URL (縮小画像が無い場合は画像側でフォールバック) */
export function thumbUrl(f: PawFile | undefined): string {
  if (!f?.path) return ""
  return `https://img.pawchive.pw/thumbnail/data${f.path}`
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
function pawProxyUrl(url: string, referer: string): string {
  return `http://paw.localhost/file?u=${encodeURIComponent(url)}&r=${encodeURIComponent(referer)}`
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
