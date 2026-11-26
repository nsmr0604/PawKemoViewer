// 一覧カードの ★ (お気に入り) / フォロー状態を 1 か所で購読する。
// カードごとに window リスナーを登録すると、1 回の更新でカード枚数分の
// ハンドラが走るため、モジュール内でまとめて購読し版番号だけ配る。
import { useMemo, useSyncExternalStore } from "react"
import { isFollowed } from "./follows"
import { FAVORITE_POSTS_CHANGED_EVENT, isFavoritePost, loadFavoritePosts } from "./post-favorites"

const FOLLOWS_CHANGED_EVENT = "pawkemo-follows-changed"

let revision = 0
const listeners = new Set<() => void>()
let started = false

function emit() {
  revision += 1
  for (const listener of listeners) listener()
}

function start() {
  if (started) return
  started = true
  window.addEventListener(FAVORITE_POSTS_CHANGED_EVENT, emit)
  window.addEventListener(FOLLOWS_CHANGED_EVENT, emit)
  // 初回の一覧取得も 1 回だけにする
  loadFavoritePosts()
}

function subscribe(listener: () => void): () => void {
  start()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getRevision(): number {
  return revision
}

export interface PostMarks {
  faved: boolean
  followed: boolean
}

/** カード 1 枚分のマーク。依存する値か版番号が変わったときだけ再計算する。 */
export function usePostMarks(service?: string, userId?: string, postId?: string): PostMarks {
  const current = useSyncExternalStore(subscribe, getRevision, getRevision)
  return useMemo(
    () => ({
      faved: !!(service && postId && isFavoritePost(service, postId)),
      followed: !!(service && userId && isFollowed(service, userId)),
    }),
    [current, service, userId, postId],
  )
}
