// ローカルフォロー (お気に入りクリエイターの購読) 管理
// sessionKey があれば pawchive アカウント側のお気に入りにも同期 (ベストエフォート)

const KEY = "pawchive-follows"

export interface FollowEntry {
  service: string
  id: string
  name: string
}

export function loadFollows(): FollowEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return []
}

function save(list: FollowEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
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
  save(
    list.filter(
      (f) => f && typeof f.service === "string" && typeof f.id === "string",
    ),
  )
}

export function toggleFollow(f: FollowEntry): boolean {
  if (isFollowed(f.service, f.id)) {
    unfollow(f.service, f.id)
    return false
  }
  follow(f)
  return true
}
