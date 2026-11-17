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
  /** カタカナ→ひらがな正規化した名前 (かな入力での検索用)。パック v3 から */
  kanaLower?: string
  /** URL slug (fanbox: tateha 等)。索引 v1 には存在しない (再構築で付与) */
  publicId?: string
  publicIdLower?: string
  /** お気に入り数 (人気度タイブレーク用)。パック v2 から保存 */
  favorited?: number
}

/**
 * クリエイター索引のバージョン。
 * v1: per-row + name/id のみ / v2: per-row + publicId /
 * pack v2: 単一パック文字列 + favorited / **pack v3: + kanaLower (かな正規化)** — 現行
 *
 * パック形式: 1 行 =
 * service\u001fid\u001fname\u001fnameLower\u001fkanaLower\u001fslug\u001ffavorited、
 * 行区切り \u001e、nameLower 順ソート済み。99,231 行を 1 レコード (約 6MB) で保存し、
 * put × 99k / getAll × 99k オブジェクト復元を 1 put / 1 get + 文字列 split に置き換える。
 * 旧 per-row ストアは移行元としてのみ使用し、パック保存後に clear する。
 */
export const SEARCH_INDEX_VERSION = 3

const PACK_META_KEY = "creatorsPack"
const ROW_SEP = "\u001e"
const FIELD_SEP = "\u001f"

// ---------------------------------------------------------------------------
// かな正規化 / かな→ローマ字 (検索クエリと索引の表記ゆれ吸収)
// ---------------------------------------------------------------------------

/** カタカナ → ひらがな */
export function kataToHira(s: string): string {
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
  ヴぁ: "va", ヴぃ: "vi", ヴぇ: "ve", ヴぉ: "vo",
}

/** ひらがな/カタカナ混在文字列 → ローマ字 (検索クエリ変換用)。
 * かな入力「たては」→ "tateha" として slug (public_id) にマッチさせる */
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
 * 旧 v2 レイアウト (kanaLower 無し・6 フィールド) も自動判別して読む */
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
    let slug = ""
    let fav = 0
    if (f.length >= 7) {
      row.kanaLower = f[4] || kataToHira(nameLower)
      slug = f[5] || ""
      fav = Number(f[6]) || 0
    } else {
      slug = f[4] || ""
      fav = Number(f[5]) || 0
      row.kanaLower = kataToHira(nameLower)
    }
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
    .map((r) => {
      const nameLower = r.nameLower || (r.name || "").toLowerCase()
      return [
        sanitizeField(r.service),
        sanitizeField(r.id),
        sanitizeField(r.name),
        sanitizeField(nameLower),
        sanitizeField(r.kanaLower || kataToHira(nameLower)),
        sanitizeField(r.publicIdLower || ""),
        String(r.favorited || 0),
      ].join(FIELD_SEP)
    })
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

/**
 * マッチ度スコア: 0 = 完全一致, 1 = 前方一致, 2 = 部分一致, -1 = 対象外。
 * 名前は (入力値 / かな正規化)、ID・slug は (入力値 / かな→ローマ字) の
 * 両表記で判定する (「たては」→ tateha が slug 一致 → 立羽 がヒットする等)。
 */
function rankRow(
  row: CreatorRow,
  q: string,
  qHira: string,
  qRoma: string,
  service?: string,
): number {
  if (service && row.service !== service) return -1
  const ids = [row.id, row.publicIdLower].filter(Boolean) as string[]
  const names = [row.nameLower, row.kanaLower].filter(Boolean) as string[]
  const qsId = qRoma !== q ? [q, qRoma] : [q]
  const qsName = qHira !== q ? [q, qHira] : [q]
  for (const tier of [0, 1, 2]) {
    for (const x of ids) {
      for (const v of qsId) {
        if ((tier === 0 && x === v) || (tier === 1 && x.startsWith(v)) || (tier === 2 && x.includes(v))) {
          return tier
        }
      }
    }
    for (const x of names) {
      for (const v of qsName) {
        if ((tier === 0 && x === v) || (tier === 1 && x.startsWith(v)) || (tier === 2 && x.includes(v))) {
          return tier
        }
      }
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
  const qHira = kataToHira(q)
  const qRoma = kanaToRomaji(q)
  const scored: { row: CreatorRow; score: number; fav: number }[] = []
  for (const row of rows) {
    const score = rankRow(row, q, qHira, qRoma, service)
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
  await setMeta(PACK_META_KEY, encodePack(rows))
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
