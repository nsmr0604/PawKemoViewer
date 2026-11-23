import { useEffect, useState } from "react"
import { getCreatorIcon } from "../icons"

/** クリエイターのアイコンを表示する。取得・キャッシュは src/icons.ts
 *  (メモリ → IndexedDB → Rust ディスクキャッシュ)。
 *  アイコンが無いクリエイターは先頭文字のフォールバック。
 *  `big` はクリエイターページヘッダー用の大きいサイズ */
export function CreatorAvatar({
  service,
  id,
  name,
  className = "",
}: {
  service: string
  id: string
  name?: string
  className?: string
}) {
  const [icon, setIcon] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getCreatorIcon(service, id).then((url) => {
      if (alive) setIcon(url)
    })
    return () => {
      alive = false
    }
  }, [service, id])
  const letter = (name || id || "?").slice(0, 1).toUpperCase()
  if (icon) {
    return <img className={`creator-avatar ${className}`} src={icon} alt={name || id} loading="lazy" decoding="async" />
  }
  return <div className={`creator-avatar ${className}`}>{letter}</div>
}
