// IndexedDB ヘルパー: クリエイターキャッシュと未読管理

const DB_NAME = "pawchive-viewer"
const DB_VERSION = 1

type StoreName = "creators" | "seen" | "meta"

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("creators")) {
        const s = db.createObjectStore("creators", { keyPath: "key" })
        s.createIndex("name", "nameLower")
      }
      if (!db.objectStoreNames.contains("seen")) {
        db.createObjectStore("seen", { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ---------------------------------------------------------------------------
// creators キャッシュ: /creators (約10万件) を 1 回取得して永続化
// ---------------------------------------------------------------------------

export interface CreatorRow {
  key: string // "service:id"
  id: string
  service: string
  name: string
  nameLower: string
  /** URL slug (fanbox: tateha 等)。索引 v1 には存在しない (再構築で付与) */
  publicId?: string
  publicIdLower?: string
}

/**
 * クリエイター索引のバージョン。
 * v1: name + id のみ。v2: publicId (URL slug) を追加。
 * 古い索引はクリエイター tab 初回表示時にバックグラウンドで自動再構築する。
 */
export const SEARCH_INDEX_VERSION = 2

// ---------------------------------------------------------------------------
// メモリ内検索索引: getAll を 1 回だけ読んで再利用する。
// 旧実装 (カーソル全走査) は 1 検索に数秒かかり、古いクエリの結果が表示され続ける
// レースを起こしていたため、メモリ索引 + スコアリングで即時化した
// ---------------------------------------------------------------------------

let indexRows: CreatorRow[] | null = null
let indexPromise: Promise<CreatorRow[]> | null = null

/** 索引再構築 (saveCreators) 後に呼んでメモリ索引を作り直させる */
export function invalidateCreatorIndex() {
  indexRows = null
  indexPromise = null
}

function loadIndex(): Promise<CreatorRow[]> {
  if (indexRows) return Promise.resolve(indexRows)
  if (!indexPromise) {
    indexPromise = openDb()
      .then(
        (db) =>
          new Promise<CreatorRow[]>((resolve, reject) => {
            const req = db.transaction("creators", "readonly").objectStore("creators").getAll()
            req.onsuccess = () => resolve(req.result as CreatorRow[])
            req.onerror = () => reject(req.error)
          }),
      )
      .then((rows) => {
        indexRows = rows
        return rows
      })
  }
  return indexPromise
}

/**
 * 検索クエリの正規化。URL 貼り付け (https://tateha.fanbox.cc 等) から
 * slug / ID とサービスを取り出す。
 */
export function normalizeCreatorQuery(raw: string): { q: string; service?: string } {
  const s = raw.trim()
  if (!s) return { q: "" }
  let m = s.match(/^(?:https?:\/\/)?([a-z0-9_-]+)\.fanbox\.cc/i)
  if (m) return { q: m[1].toLowerCase(), service: "fanbox" }
  m = s.match(/^(?:https?:\/\/)?(?:www\.)?fanbox\.cc\/@([a-z0-9_-]+)/i)
  if (m) return { q: m[1].toLowerCase(), service: "fanbox" }
  m = s.match(/^(?:https?:\/\/)?(?:www\.)?patreon\.com\/user\?u=(\d+)/i)
  if (m) return { q: m[1], service: "patreon" }
  m = s.match(/^(?:https?:\/\/)?(?:www\.)?patreon\.com\/@?([A-Za-z0-9_-]+)/i)
  if (m) return { q: m[1].toLowerCase(), service: "patreon" }
  return { q: s }
}

/** マッチ度スコア: 0 = 完全一致, 1 = 前方一致, 2 = 部分一致, -1 = 対象外 */
function rankRow(row: CreatorRow, q: string, ql: string, service?: string): number {
  if (service && row.service !== service) return -1
  const pid = row.publicIdLower || ""
  if (row.id === q || pid === ql || row.nameLower === ql) return 0
  if (row.id.startsWith(q) || pid.startsWith(ql) || row.nameLower.startsWith(ql)) return 1
  if (row.id.includes(q) || (pid && pid.includes(ql)) || row.nameLower.includes(ql)) return 2
  return -1
}

/** 名前/ID/slug で検索。完全一致 > 前方一致 > 部分一致 の順で返す */
export async function searchCreators(qRaw: string, limit = 60): Promise<CreatorRow[]> {
  const { q, service } = normalizeCreatorQuery(qRaw)
  if (!q) {
    const rows = await loadIndex()
    return rows.slice(0, limit)
  }
  const ql = q.toLowerCase()
  let rows: CreatorRow[]
  try {
    rows = await loadIndex()
  } catch {
    // メモリ索引が作れない環境 (ストア巨大等) はカーソル走査にフォールバック
    return searchCreatorsByCursor(q, ql, service, limit)
  }
  const scored: { row: CreatorRow; score: number }[] = []
  for (const row of rows) {
    const score = rankRow(row, q, ql, service)
    if (score >= 0) scored.push({ row, score })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((s) => s.row)
}

/** フォールバック: IndexedDB カーソルで全走査 (旧実装) */
async function searchCreatorsByCursor(
  q: string,
  ql: string,
  service: string | undefined,
  limit: number,
): Promise<CreatorRow[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction("creators", "readonly")
    const out: CreatorRow[] = []
    const cursorReq = t.objectStore("creators").openCursor()
    cursorReq.onsuccess = () => {
      const c = cursorReq.result
      if (!c || out.length >= limit) return resolve(out)
      const row = c.value as CreatorRow
      if (rankRow(row, q, ql, service) >= 0) out.push(row)
      c.continue()
    }
    cursorReq.onerror = () => reject(cursorReq.error)
  })
}

export async function saveCreators(rows: CreatorRow[]) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("creators", "readwrite")
    const s = t.objectStore("creators")
    for (const r of rows) s.put(r)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
  await setMeta("creatorsFetchedAt", Date.now())
  await setMeta("creatorsIndexVersion", SEARCH_INDEX_VERSION)
  // 次回検索でメモリ索引を作り直させる (v1 行から v2 行への混在を防ぐ)
  invalidateCreatorIndex()
}

export async function creatorsCount(): Promise<number> {
  return tx("creators", "readonly", (s) => s.count())
}

export async function getCreatorRow(key: string): Promise<CreatorRow | undefined> {
  return tx("creators", "readonly", (s) => s.get(key))
}

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

export async function setMeta(key: string, value: unknown) {
  await tx("meta", "readwrite", (s) => s.put({ key, value }))
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T } | undefined>("meta", "readonly", (s) => s.get(key))
  return row?.value
}

// ---------------------------------------------------------------------------
// 未読管理: クリエイターごとに「最後に確認した最新投稿ID」を保存
// ---------------------------------------------------------------------------

export interface SeenEntry {
  key: string // "service:id"
  lastSeenPostId: string
  checkedAt: number
  /** 最後に確認した最新投稿 (クールダウン中の再チェックでネットワークを避けるため) */
  newest?: { id: string; title?: string; published?: string }
}

export async function setSeen(
  key: string,
  lastSeenPostId: string,
  newest?: { id: string; title?: string; published?: string },
) {
  await tx("seen", "readwrite", (s) =>
    s.put({ key, lastSeenPostId, checkedAt: Date.now(), newest }),
  )
}

export async function getSeen(key: string): Promise<SeenEntry | undefined> {
  return tx("seen", "readonly", (s) => s.get(key))
}

export async function getAllSeen(): Promise<SeenEntry[]> {
  return tx("seen", "readonly", (s) => s.getAll())
}

export async function deleteSeen(key: string) {
  await tx("seen", "readwrite", (s) => s.delete(key))
}
