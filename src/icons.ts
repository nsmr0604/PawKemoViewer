// ---------------------------------------------------------------------------
// クリエイターアイコンのキャッシュ (メモリ → IndexedDB → Rust ディスクキャッシュ)
//
// - Rust fetch_creator_icon が app_data/icons/ へ保存した data URL を返す
//   (2 回目以降は Rust 側ディスクヒットで通信なし)
// - ここではさらにメモリ Map と IndexedDB ("pawkemo-icons" DB) を重ね、
//   アプリ内の複数箇所 (一覧・フォロー・投稿詳細) で同時リクエストせず再利用する
// - アイコンが存在しないクリエイター (204) は null をキャッシュし再取得しない
//   (セッション内のみ。再起動後に再試行される)
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core"
import { logError } from "./log"

const DB_NAME = "pawkemo-icons"
const STORE = "icons"
/** キャッシュ上限 (1 件あたり data URL ~30-60KB。超過分は古い順に削除) */
const MAX_ENTRIES = 2000

interface IconRecord {
  d: string | null // data URL (null = アイコン無し)
  t: number // 保存時刻 (退避用)
}

const memory = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db: IDBDatabase, key: string): Promise<IconRecord | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const r = tx.objectStore(STORE).get(key)
    r.onsuccess = () => resolve(r.result as IconRecord | undefined)
    r.onerror = () => reject(r.error)
  })
}

function idbPut(db: IDBDatabase, key: string, rec: IconRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(rec, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 上限超過時に古い順に削除 (軽量: 全件走査は put 時のみ) */
async function prune(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    const all = store.getAll()
    const keys = store.getAllKeys()
    tx.oncomplete = () => {
      const entries = (all.result as IconRecord[]).map((rec, i) => ({
        key: keys.result[i] as IDBValidKey,
        t: rec?.t ?? 0,
      }))
      if (entries.length <= MAX_ENTRIES) return resolve()
      entries.sort((a, b) => a.t - b.t)
      const del = entries.slice(0, entries.length - MAX_ENTRIES)
      const tx2 = db.transaction(STORE, "readwrite")
      for (const e of del) tx2.objectStore(STORE).delete(e.key)
      tx2.oncomplete = () => resolve()
      tx2.onerror = () => resolve()
    }
    tx.onerror = () => resolve()
  })
}

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      logError(`アイコンキャッシュ DB を開けません: ${String(e)}`)
      throw e
    })
  }
  return dbPromise
}

/** クリエイターアイコンの data URL を取得 (無い場合は null)。
 *  メモリ → IndexedDB → Rust (fetch + ディスクキャッシュ) の順に参照し、
 *  結果を全レイヤへ保存する。同一キーの並行呼び出しは 1 リクエストに統合 */
export function getCreatorIcon(service: string, id: string): Promise<string | null> {
  const key = `${service}:${id}`
  const cached = memory.get(key)
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = inflight.get(key)
  if (pending) return pending

  const task = (async () => {
    // IndexedDB
    try {
      const d = await db()
      const rec = await idbGet(d, key)
      if (rec && rec.d !== undefined) {
        memory.set(key, rec.d)
        return rec.d
      }
    } catch {
      /* IDB 不使用でも Rust キャッシュは使える */
    }
    // Rust (ネットワーク + app_data/icons ディスクキャッシュ)
    try {
      const dataUrl = await invoke<string | null>("fetch_creator_icon", {
        service,
        id,
      })
      memory.set(key, dataUrl)
      try {
        const d = await db()
        await idbPut(d, key, { d: dataUrl, t: Date.now() })
        await prune(d)
      } catch {
        /* 保存失敗は無視 */
      }
      return dataUrl
    } catch (e) {
      logError(`クリエイターアイコン取得失敗 ${key}: ${e instanceof Error ? e.message : String(e)}`)
      // 失敗はキャッシュしない (再試行可能)
      return null
    }
  })()

  inflight.set(key, task)
  return task.finally(() => {
    inflight.delete(key)
  })
}

/** アイコンのキャッシュ (メモリ・IndexedDB・ディスク) をすべて消去する。戻り値はディスクから消した件数 */
export async function clearIconCache(): Promise<number> {
  memory.clear()
  try {
    const d = await db()
    await new Promise<void>((resolve) => {
      const tx = d.transaction(STORE, "readwrite")
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* IDB 不使用でもディスク側は消す */
  }
  try {
    return await invoke<number>("clear_creator_icon_cache")
  } catch {
    return 0
  }
}

/** アイコンのディスクキャッシュの件数・合計バイト数 */
export async function creatorIconInfo(): Promise<{ count: number; bytes: number }> {
  return invoke<{ count: number; bytes: number }>("creator_icon_cache_info")
}

/** アイコンの保存・キャッシュ動作確認用 (設定 → キャッシュに表示する件数) */
export async function iconCacheCount(): Promise<number> {
  try {
    const d = await db()
    return await new Promise<number>((resolve) => {
      const tx = d.transaction(STORE, "readonly")
      const r = tx.objectStore(STORE).count()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(0)
    })
  } catch {
    return 0
  }
}
