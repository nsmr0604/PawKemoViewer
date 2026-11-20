// クリエイターフォローは pawchive アカウントを同期元とし、ローカルはそのミラーとして扱う。
import { api, getSettings } from "./api"
import { getPlatformRuntime } from "./platform/runtime"

const KEY = "pawkemo-follows"
const CHANGED_EVENT = "pawkemo-follows-changed"
const MIGRATED_KEY = "pawkemo-follows-migrated-to-account"
let syncInFlight: Promise<number> | null = null

function storage() { return getPlatformRuntime().services.storage ?? localStorage }

export interface FollowEntry {
  service: string
  id: string
  name: string
}

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function loadFollows(): FollowEntry[] {
  try {
    const raw = storage().get(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return []
}

function save(list: FollowEntry[]) {
  storage().set(KEY, JSON.stringify(list))
  notifyChanged()
}

export function isFollowed(service: string, id: string): boolean {
  return loadFollows().some((f) => f.service === service && f.id === id)
}

export function follow(f: FollowEntry) {
  const list = loadFollows()
  if (!list.some((x) => x.service === f.service && x.id === f.id)) {
    list.unshift(f)
    save(list)
  }
}

export function unfollow(service: string, id: string) {
  save(loadFollows().filter((f) => !(f.service === service && f.id === id)))
}

/** 一括差し替え (バックアップからの復元用) */
export function replaceFollows(list: FollowEntry[]) {
  const seen = new Set<string>()
  const unique = list.filter((f) => {
    if (!f || typeof f.service !== "string" || typeof f.id !== "string" || !f.service || !f.id) return false
    const key = `${f.service}:${f.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  save(unique)
}

/** pawchive とローカルのフォローを同期する。
 * 初回は既存ローカル項目をアカウントへ移行し、その後サーバーの一覧をローカルへ反映する。 */
export function syncFollowsWithAccount(): Promise<number> {
  if (syncInFlight) return syncInFlight
  const { sessionKey } = getSettings()
  if (!sessionKey) return Promise.resolve(0)

  syncInFlight = (async () => {
    const remote = await api.accountFavorites("artist")
    // 既存ローカルデータの移行は初回だけ。以降はアカウント側を正として反映し、
    // 別端末で解除されたフォローを古いローカルデータから復活させない。
    if (storage().get(MIGRATED_KEY) !== "1") {
      const remoteKeys = new Set(remote.filter((f) => f.service && f.id).map((f) => `${f.service}:${f.id}`))
      for (const f of loadFollows()) {
        if (!remoteKeys.has(`${f.service}:${f.id}`)) {
          await api.favCreatorAdd(f.service, f.id)
        }
      }
    }

    const latest = await api.accountFavorites("artist")
    const synced = latest
      .filter((f) => !!f.service && !!f.id)
      .map((f) => ({ service: f.service!, id: f.id, name: f.name || f.id }))
    replaceFollows(synced)
    storage().set(MIGRATED_KEY, "1")
    return synced.length
  })()

  return syncInFlight.finally(() => { syncInFlight = null })
}

/** ログイン中はサーバー更新成功後にローカルへ反映し、片側だけの更新を防ぐ。 */
export async function addFollow(f: FollowEntry): Promise<void> {
  if (getSettings().sessionKey && !isFollowed(f.service, f.id)) {
    await api.favCreatorAdd(f.service, f.id)
  }
  follow(f)
}

export async function removeFollow(service: string, id: string): Promise<void> {
  if (getSettings().sessionKey && isFollowed(service, id)) {
    await api.favCreatorRemove(service, id)
  }
  unfollow(service, id)
}

export function toggleFollow(f: FollowEntry): boolean {
  if (isFollowed(f.service, f.id)) {
    unfollow(f.service, f.id)
    return false
  }
  follow(f)
  return true
}
