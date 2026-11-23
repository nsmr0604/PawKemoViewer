// ---------------------------------------------------------------------------
// お気に入り投稿の共有状態 (web の ☆ Favorite と同じアカウント基準)
//
// アカウントのお気に入り投稿 ID をキャッシュし、一覧カードの
// 「お気に入りマーク (★)」表示に使う。フォロー (クリエイター) は
// follows.ts が同期済みなので、ここは投稿側のみを扱う。
// ---------------------------------------------------------------------------

import { api, getSettings } from "./api"

export const FAVORITE_POSTS_CHANGED_EVENT = "pawkemo-favposts-changed"
const TTL_MS = 60_000

let favoritePostKeys: Set<string> | null = null
let fetchedAt = 0
let inFlight: Promise<void> | null = null

function key(service: string, id: string): string {
  return `${service}:${id}`
}

/** 投稿がアカウントのお気に入りか (未取得時は false) */
export function isFavoritePost(service: string, id: string): boolean {
  return favoritePostKeys?.has(key(service, id)) ?? false
}

/** ☆ ボタン操作結果を共有状態へ反映する (即座に全カードへ通知) */
export function setFavoritePost(service: string, id: string, on: boolean): void {
  if (!favoritePostKeys) favoritePostKeys = new Set()
  if (on) favoritePostKeys.add(key(service, id))
  else favoritePostKeys.delete(key(service, id))
  notify()
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FAVORITE_POSTS_CHANGED_EVENT))
}

/** アカウントのお気に入り投稿 ID を取得してキャッシュする (TTL 60 秒・失敗は無視)。
 *  セッションが無い場合は何もしない */
export function loadFavoritePosts(force = false): void {
  if (!getSettings().sessionKey) return
  if (inFlight) return
  if (!force && favoritePostKeys && Date.now() - fetchedAt < TTL_MS) return
  inFlight = (async () => {
    try {
      const list = await api.accountFavorites("post")
      favoritePostKeys = new Set(
        list.filter((p) => p.service && p.id).map((p) => key(p.service!, p.id!)),
      )
      fetchedAt = Date.now()
      notify()
    } catch {
      /* 401 等は無視 (マークが出ないだけ・UI は壊さない) */
    }
  })().finally(() => {
    inFlight = null
  })
}
