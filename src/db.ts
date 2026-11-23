import type { CreatorRow } from "./application/creator-index-repository"
export type { CreatorRow } from "./application/creator-index-repository"
// IndexedDB ヘルパー: クリエイターキャッシュと未読管理
import { getPlatformRuntime } from "./platform/runtime"
// 注意: DB_NAME は v0.3.0 (PawKemoViewer 改名) で "pawkemoviewer" に変更。
// v0.2.x からの引継ぎは バックアップ書き出し→読み込み で行う

const DB_NAME = "pawkemoviewer"
const DB_VERSION = 1

type StoreName = "creators" | "seen" | "meta"

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  const service = getPlatformRuntime().services.indexedDatabase
  if (!service) return Promise.reject(new Error("IndexedDB platform service unavailable"))
  const opening = service.open(DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains("creators")) {
      const s = db.createObjectStore("creators", { keyPath: "key" })
      s.createIndex("name", "nameLower")
    }
    if (!db.objectStoreNames.contains("seen")) db.createObjectStore("seen", { keyPath: "key" })
    if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" })
  }).then((db) => {
    db.onversionchange = () => db.close()
    return db
  }).catch((error) => {
    // Failed open must not poison the cache permanently; allow later retry.
    if (dbPromise === opening) dbPromise = null
    throw error
  })
  dbPromise = opening
  return opening
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        let result: T
        let requestFailed = false
        const req = fn(t.objectStore(store))
        req.onsuccess = () => { result = req.result }
        req.onerror = () => { requestFailed = true; reject(req.error) }
        t.oncomplete = () => { if (!requestFailed) resolve(result) }
        t.onerror = () => reject(t.error || new Error("IndexedDB transaction failed"))
        t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"))
      }),
  )
}

// ---------------------------------------------------------------------------
// creators キャッシュ: /creators (約10万件) を 1 回取得して永続化
// ---------------------------------------------------------------------------

/**
 * クリエイター索引のバージョン。
 * v1: per-row + name/id のみ / v2: pack (name + id + slug + favorited)
 * **pack v3: updated / indexed を追加** — 現行
 *
 * パック形式: 1 行 = service\u001fid\u001fname\u001fnameLower\u001fslug\u001ffavorited\u001fupdated\u001findexed、
 * 行区切り \u001e、nameLower 順ソート済み。99,231 行を 1 レコード (約 6MB) で保存し、
 * put × 99k / getAll × 99k オブジェクト復元を 1 put / 1 get + 文字列 split に置き換える。
 * 旧 per-row ストアは移行元としてのみ使用し、パック保存後に clear する。
 *
 * 注: 一時的に v3 (kanaLower 追加) を出したが、かな正規化は複雑すぎるため撤去。
 * かな入力はクエリ側のローマ字変換 (kanaToRomaji) のみで slug にマッチさせる。
 * decode は v3 レイアウト (7 フィールド) も自動判別して読める。
 */
export const SEARCH_INDEX_VERSION = 3

const PACK_META_KEY = "creatorsPack"
const ROW_SEP = "\u001e"
const FIELD_SEP = "\u001f"

// ---------------------------------------------------------------------------
// かな→ローマ字 (検索クエリの表記ゆれ吸収。索引側の正規化はしない)
// ---------------------------------------------------------------------------

/** カタカナ → ひらがな (kanaToRomaji 内部用) */
function kataToHira(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

const ROMA_BASE: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "wi", ゑ: "we", を: "wo", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "di", づ: "du", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ゔ: "vu",
}

const ROMA_COMBO: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
  てぃ: "thi", でぃ: "dhi", とぅ: "tu", うぇ: "we", うぃ: "wi",
}

/** ひらがな/カタカナ混在文字列 → ローマ字 (検索クエリ変換用)。
 * かな入力「たては」「タテハ」→ "tateha" として slug (public_id) にマッチさせる */
export function kanaToRomaji(s: string): string {
  const hira = kataToHira(s)
  let out = ""
  for (let i = 0; i < hira.length; i++) {
    const two = hira.slice(i, i + 2)
    const combo = ROMA_COMBO[two]
    if (combo) {
      out += combo
      i++
      continue
    }
    const ch = hira[i]
    const next = hira[i + 1] || ""
    if (ch === "っ") {
      // 促音: 直後の子音を重ねる (っか→kk)
      const r = ROMA_BASE[next] || (next && ROMA_COMBO[hira.slice(i + 1, i + 3)])
      if (r) out += r[0]
      else out += "xtu"
      continue
    }
    const r = ROMA_BASE[ch]
    out += r !== undefined ? r : ch // 漢字・英数・記号はそのまま
  }
  return out
}

// ---------------------------------------------------------------------------
// メモリ内検索索引: パックを 1 回だけ読んで再利用する。
// ---------------------------------------------------------------------------
let indexRows: CreatorRow[] | null = null
let indexPromise: Promise<CreatorRow[]> | null = null

/** 索引再構築 (saveCreators) 後に呼んでメモリ索引を作り直させる */
export function invalidateCreatorIndex() {
  indexRows = null
  indexPromise = null
}

function sanitizeField(s: string): string {
  return s.replace(/[\u001e\u001f]/g, " ")
}

/** パック文字列 → 行配列 (nameLower 順 = パック保存順)。
 * 一時リリースした v3 レイアウト (kanaLower を挟んだ 7 フィールド) も
 * 自動判別で読み飛ばす (互換維持)。現行は 6 フィールド */
function decodePack(pack: string): CreatorRow[] {
  const out: CreatorRow[] = []
  for (const line of pack.split(ROW_SEP)) {
    if (!line) continue
    const f = line.split(FIELD_SEP)
    const service = f[0]
    const id = f[1]
    if (!service || !id) continue
    const name = f[2] || id
    const nameLower = f[3] || name.toLowerCase()
    const row: CreatorRow = { key: `${service}:${id}`, id, service, name, nameLower }
    const current = f.length >= 8
    const legacyV3 = f.length === 7
    const slug = (current ? f[4] : legacyV3 ? f[5] : f[4]) || ""
    const fav = Number((current ? f[5] : legacyV3 ? f[6] : f[5]) || "") || 0
    const updated = current ? Number(f[6]) : 0
    const indexed = current ? Number(f[7]) : 0
    if (updated > 0) row.updated = updated
    if (indexed > 0) row.indexed = indexed
    if (slug) {
      row.publicId = slug
      row.publicIdLower = slug
    }
    if (fav > 0) row.favorited = fav
    out.push(row)
  }
  return out
}

/** 行配列 → パック文字列 (nameLower / id 順にソートして固定順を保証) */
function encodePack(rows: CreatorRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    if (a.nameLower !== b.nameLower) return a.nameLower < b.nameLower ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return sorted
    .map((r) =>
      [
        sanitizeField(r.service),
        sanitizeField(r.id),
        sanitizeField(r.name),
        sanitizeField(r.nameLower),
        sanitizeField(r.publicIdLower || ""),
        String(r.favorited || 0),
        String(r.updated || 0),
        String(r.indexed || 0),
      ].join(FIELD_SEP),
    )
    .join(ROW_SEP)
}

/** 旧 per-row ストアの全行 (移行元) */
export async function getAllCreatorRows(): Promise<CreatorRow[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction("creators", "readonly").objectStore("creators").getAll()
    req.onsuccess = () => resolve((req.result as CreatorRow[]).filter(Boolean))
    req.onerror = () => reject(req.error)
  })
}

async function clearCreatorRows(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("creators", "readwrite")
    t.objectStore("creators").clear()
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

function loadIndex(): Promise<CreatorRow[]> {
  if (indexRows) return Promise.resolve(indexRows)
  if (!indexPromise) {
    indexPromise = (async () => {
      // パック (単一レコード) を優先。無ければ旧 per-row ストア (移行元)
      const pack = await getMeta<string>(PACK_META_KEY)
      if (pack) return decodePack(pack)
      return getAllCreatorRows()
    })()
      .then((rows) => {
        indexRows = rows
        return rows
      })
      .catch((e) => {
        indexPromise = null
        throw e
      })
  }
  return indexPromise
}

/**
 * 検索クエリの正規化。URL 貼り付け (https://tateha.fanbox.cc 等) から
 * slug / ID とサービスを取り出す。
 */
export function normalizeCreatorQuery(raw: string): { q: string; service?: string; postId?: string } {
  const s = raw.trim()
  if (!s) return { q: "" }
  // 投稿 URL (slug サブドメイン / www + @slug の両パターン・実測どちらも同着地):
  //   https://{slug}.fanbox.cc/posts/{id} / https://www.fanbox.cc/@{slug}/posts/{id}
  let m = s.match(/^(?:https?:\/\/)?([a-z0-9_-]+)\.fanbox\.cc\/posts\/(\d+)/i)
  if (m) return { q: m[1].toLowerCase(), service: "fanbox", postId: m[2] }
  m = s.match(/^(?:https?:\/\/)?(?:www\.)?fanbox\.cc\/@([a-z0-9_-]+)\/posts\/(\d+)/i)
  if (m) return { q: m[1].toLowerCase(), service: "fanbox", postId: m[2] }
  m = s.match(/^(?:https?:\/\/)?([a-z0-9_-]+)\.fanbox\.cc/i)
  if (m) return { q: m[1].toLowerCase(), service: "fanbox" }
  m = s.match(/^(?:https?:\/\/)?(?:www\.)?fanbox\.cc\/@([a-z0-9_-]+)/i)
  if (m) return { q: m[1].toLowerCase(), service: "fanbox" }
  m = s.match(/^(?:https?:\/\/)?(?:www\.)?patreon\.com\/user\?u=(\d+)/i)
  if (m) return { q: m[1], service: "patreon" }
  m = s.match(/^(?:https?:\/\/)?(?:www\.)?patreon\.com\/@?([A-Za-z0-9_-]+)/i)
  if (m) return { q: m[1].toLowerCase(), service: "patreon" }
  return { q: s }
}

/**
 * マッチ度スコア: 0 = 完全一致, 1 = 前方一致, 2 = 部分一致, -1 = 対象外。
 * ID・slug は (入力値 / かな→ローマ字) の両表記で判定する
 * (「たては」→ tateha が slug 一致 → 立羽 がヒットする等)。
 * 名前は nameLower のみ (かな正規化は索引側で行わない方針)。
 */
function rankRow(row: CreatorRow, q: string, qRoma: string, service?: string): number {
  if (service && row.service !== service) return -1
  const qs = qRoma !== q ? [q, qRoma] : [q]
  for (const tier of [0, 1, 2]) {
    for (const x of [row.id, row.publicIdLower].filter(Boolean) as string[]) {
      for (const v of qs) {
        if ((tier === 0 && x === v) || (tier === 1 && x.startsWith(v)) || (tier === 2 && x.includes(v))) {
          return tier
        }
      }
    }
    const n = row.nameLower
    if ((tier === 0 && n === q) || (tier === 1 && n.startsWith(q)) || (tier === 2 && n.includes(q))) {
      return tier
    }
  }
  return -1
}

/** 名前/ID/slug (表記ゆれ吸収込み) で検索。完全一致 > 前方一致 > 部分一致 の順で返す */
export async function searchCreators(qRaw: string, limit = 60): Promise<CreatorRow[]> {
  const { q: rawQ, service } = normalizeCreatorQuery(qRaw)
  const q = rawQ.toLowerCase() // nameLower / slug は小文字統一で比較
  const rows = await loadIndex()
  if (!q) return rows.slice(0, limit)
  const qRoma = kanaToRomaji(q)
  const scored: { row: CreatorRow; score: number; fav: number }[] = []
  for (const row of rows) {
    const score = rankRow(row, q, qRoma, service)
    if (score >= 0) scored.push({ row, score, fav: row.favorited || 0 })
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    if (a.fav !== b.fav) return b.fav - a.fav // 同スコアは人気度順
    return a.row.nameLower < b.row.nameLower ? -1 : 1
  })
  return scored.slice(0, limit).map((s) => s.row)
}

/**
 * 索引をパック (単一レコード) として保存。
 * 旧 per-row ストア (99k put) と比べ、1 put / 1 文字列で済み高速・小容量。
 */
export async function saveCreators(rows: CreatorRow[]) {
  const pack = encodePack(rows)
  await setMeta(PACK_META_KEY, pack)
  // パック文字列の実サイズ (設定 → キャッシュ に表示)
  await setMeta("creatorsPackBytes", new Blob([pack]).size)
  await setMeta("creatorsCount", rows.length)
  await setMeta("creatorsIndexVersion", SEARCH_INDEX_VERSION)
  await setMeta("creatorsFetchedAt", Date.now())
  // 旧 per-row ストアは移行元としてのみ使用。パック保存済みなら空にして容量解放
  try {
    await clearCreatorRows()
  } catch {
    /* clear 失敗は無害 (次回再構築で上書き) */
  }
  invalidateCreatorIndex()
}

export async function creatorsCount(): Promise<number> {
  const packed = await getMeta<string>(PACK_META_KEY)
  if (packed !== undefined) {
    const n = await getMeta<number>("creatorsCount")
    if (typeof n === "number") return n
    return decodePack(packed).length // メタが無い場合の保険 (通常到達しない)
  }
  return tx("creators", "readonly", (s) => s.count())
}

export async function getCreatorRow(key: string): Promise<CreatorRow | undefined> {
  try {
    const rows = await loadIndex()
    const hit = rows.find((r) => r.key === key)
    if (hit) return hit
  } catch {
    /* fallthrough: 旧ストア直接参照 */
  }
  return tx("creators", "readonly", (s) => s.get(key))
}

/** キャッシュ情報 (設定 → キャッシュ にサイズ表示) */
export interface CreatorCacheInfo {
  count: number
  bytes: number
  fetchedAt?: number
}

export async function creatorCacheInfo(): Promise<CreatorCacheInfo> {
  const count = await creatorsCount()
  let bytes = await getMeta<number>("creatorsPackBytes")
  if (typeof bytes !== "number") {
    // 旧データ (サイズメタが無い) はパック文字列から算出
    const packed = await getMeta<string>(PACK_META_KEY)
    bytes = packed ? new Blob([packed]).size : 0
  }
  const fetchedAt = await getMeta<number>("creatorsFetchedAt")
  return { count, bytes: bytes || 0, fetchedAt }
}

/** クリエイターキャッシュを全消去 (パック索引 + 旧 per-row ストア + メタ) */
export async function clearCreatorCache() {
  await setMeta(PACK_META_KEY, undefined)
  await setMeta("creatorsPackBytes", undefined)
  await setMeta("creatorsCount", undefined)
  await setMeta("creatorsIndexVersion", undefined)
  await setMeta("creatorsFetchedAt", undefined)
  await clearCreatorRows()
  invalidateCreatorIndex()
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
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("seen", "readwrite")
    const store = t.objectStore("seen")
    const req = store.get(key)
    req.onsuccess = () => {
      const current = req.result as SeenEntry | undefined
      store.put({
        ...current,
        key,
        lastSeenPostId,
        checkedAt: Date.now(),
        ...(newest ? { newest } : {}),
      })
    }
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error("既読状態の保存に失敗しました"))
  })
}

/** 新着チェック結果だけを更新し、チェック中に変更された既読IDを上書きしない。 */
export async function updateSeenCheck(
  key: string,
  newest?: { id: string; title?: string; published?: string },
): Promise<SeenEntry> {
  const db = await openDb()
  let saved: SeenEntry | undefined
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("seen", "readwrite")
    const store = t.objectStore("seen")
    const req = store.get(key)
    req.onsuccess = () => {
      const current = req.result as SeenEntry | undefined
      saved = {
        ...current,
        key,
        lastSeenPostId: current?.lastSeenPostId || "",
        checkedAt: Date.now(),
        ...(newest ? { newest } : {}),
      }
      store.put(saved)
    }
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error("新着状態の保存に失敗しました"))
  })
  return saved!
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

/** Replace the complete read-state set atomically (backup restore). */
export async function replaceSeen(entries: SeenEntry[]): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("seen", "readwrite")
    const store = t.objectStore("seen")
    store.clear()
    for (const entry of entries) store.put(entry)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error("既読状態の復元に失敗しました"))
  })
}
