// 検索履歴 (localStorage)。JHenTai / EhViewer の検索履歴チップ相当。
// 投稿検索 (Home) とクリエイター検索 (Creators) で共用する。

const KEY = "pawkemo-search-history"
const MAX = 20

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

/** 履歴に追加 (重複は先頭へ移動、最大 MAX 件) */
export function addSearchHistory(q: string) {
  const t = q.trim()
  if (!t) return
  const list = getSearchHistory().filter((x) => x !== t)
  list.unshift(t)
  if (list.length > MAX) list.length = MAX
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function clearSearchHistory() {
  localStorage.removeItem(KEY)
}
