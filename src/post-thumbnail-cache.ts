import { invoke } from "@tauri-apps/api/core"
import { getSettings } from "./api"
import { getPlatformRuntime } from "./platform/runtime"

const STORE = "thumbnails"
export const THUMBNAIL_CACHE_LIMITS = [100, 250, 500, 1000, 2000] as const
const MAX_ENTRY_BYTES = 200 * 1024
const pending = new Map<string, Promise<Blob>>()

interface ThumbRecord {
  image: Blob
  savedAt: number
  /** 近いサイズのキャッシュを探すための索引キー */
  path: string
  size: number
}

async function cropThumbnail(path: string, size: number): Promise<Blob> {
  const bytes = await invoke<ArrayBuffer | number[]>("fetch_post_thumbnail", { path })
  const source = new Blob([Array.isArray(bytes) ? Uint8Array.from(bytes) : bytes])
  const image = await createImageBitmap(source)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  try {
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas unavailable")
    const side = Math.min(image.width, image.height)
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Thumbnail encoding failed")), "image/webp", 0.8))
  } finally {
    image.close()
    canvas.width = canvas.height = 0
  }
}

async function openCache() {
  const storage = getPlatformRuntime().services.indexedDatabase
  return storage?.open("pawkemo-post-thumbnails", 2, (database) => {
    // v1 はパスで引ける索引が無かったため、作り直して近いサイズを索引で探す
    if (database.objectStoreNames.contains(STORE)) database.deleteObjectStore(STORE)
    const store = database.createObjectStore(STORE)
    store.createIndex("savedAt", "savedAt")
    store.createIndex("path", "path")
  }).catch(() => undefined)
}

function readCache(db: IDBDatabase | undefined, key: string) {
  return new Promise<Blob | undefined>((resolve) => {
    if (!db) return resolve(undefined)
    const request = db.transaction(STORE).objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result?.image)
    request.onerror = () => resolve(undefined)
  }).catch(() => undefined)
}

export async function readPostThumbnail(path: string, size: number) {
  const db = await openCache()
  if (!db) return undefined
  const exact = await readCache(db, `${size}:${path}`)
  if (exact) return exact

  // パスの索引で数件だけ読み、サイズが近いものを選ぶ (全キー走査をしない)
  const closest = await new Promise<string | undefined>((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).index("path").getAll(IDBKeyRange.only(path))
    request.onsuccess = () => {
      let best: string | undefined
      let distance = Infinity
      for (const record of request.result as ThumbRecord[]) {
        if (!record || typeof record.size !== "number") continue
        const difference = Math.abs(record.size - size)
        if (difference >= distance) continue
        best = `${record.size}:${path}`
        distance = difference
      }
      resolve(best)
    }
    request.onerror = () => resolve(undefined)
  }).catch(() => undefined)
  return closest ? readCache(db, closest) : undefined
}

async function load(path: string, size: number, key: string): Promise<Blob> {
  const db = await openCache()
  const hit = await readCache(db, key)
  if (hit) return hit

  const image = await cropThumbnail(path, size)
  if (db && image.size <= MAX_ENTRY_BYTES) {
    await limitCache(db, { key, image, path, size })
  }
  return image
}

export function getThumbnailCacheLimit(): number {
  return THUMBNAIL_CACHE_LIMITS.find((limit) => limit === getSettings().thumbnailCacheLimit) ?? 500
}

function limitCache(db: IDBDatabase, entry?: { key: string; image: Blob; path: string; size: number }) {
  return new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    if (entry) store.put({ image: entry.image, savedAt: Date.now(), path: entry.path, size: entry.size }, entry.key)
    const count = store.count()
    count.onsuccess = () => {
      let excess = count.result - getThumbnailCacheLimit()
      if (excess <= 0) return
      const oldest = store.index("savedAt").openKeyCursor()
      oldest.onsuccess = () => {
        const cursor = oldest.result
        if (!cursor || excess-- <= 0) return
        store.delete(cursor.primaryKey)
        cursor.continue()
      }
    }
    tx.oncomplete = tx.onabort = () => resolve()
  }).catch(() => undefined)
}

export async function trimThumbnailCache() {
  const db = await openCache()
  if (db) await limitCache(db)
}

export function cachedPostThumbnail(path: string, size: number): Promise<Blob> {
  const key = `${size}:${path}`
  const existing = pending.get(key)
  if (existing) return existing
  const request = load(path, size, key).finally(() => pending.delete(key))
  pending.set(key, request)
  return request
}
