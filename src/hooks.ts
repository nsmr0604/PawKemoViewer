import { useEffect, useState, useRef } from "react"
import { getPlatformRuntime } from "./platform/runtime"

/** 値の変更を delay ms 遅延させて反映する (検索入力用) */
export function useDebounced<T>(value: T, delay = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

// ---------------------------------------------------------------------------
// スクロール位置の記憶 (戻るナビゲーション時に復元)
// ---------------------------------------------------------------------------

const SCROLL_KEY = "pawkemo-scroll"

type ScrollMap = Record<string, number>

function readMap(): ScrollMap {
  try {
    return JSON.parse(getPlatformRuntime().services.sessionStorage?.get(SCROLL_KEY) || "{}")
  } catch {
    return {}
  }
}

export function saveScroll(key: string, y: number) {
  const map = readMap()
  map[key] = Math.round(y)
  try {
    getPlatformRuntime().services.sessionStorage?.set(SCROLL_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function loadScroll(key: string): number {
  return readMap()[key] || 0
}

/** リストページでスクロール位置を記録し、データ到達後に復元するフック */
export function useScrollMemory(key: string, ready: boolean) {
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        saveScroll(key, window.scrollY)
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [key])

  useEffect(() => {
    if (!ready || restored) return
    const y = loadScroll(key)
    setRestored(true)
    if (y > 0) {
      // レイアウト確定後に復元
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // フィルタが変わったら前のキーの記憶をリセット (unmount 時は保持して復元に使う)
  const prevKey = useRef<string | null>(null)
  useEffect(() => {
    if (prevKey.current && prevKey.current !== key) {
      const map = readMap()
      delete map[prevKey.current]
      try {
        getPlatformRuntime().services.sessionStorage?.set(SCROLL_KEY, JSON.stringify(map))
      } catch {
        /* ignore */
      }
    }
    prevKey.current = key
  }, [key])
}
