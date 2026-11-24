import { useEffect, useRef, useState } from "react"
import { fileUrl, getSettings, thumbUrl } from "../api"
import { t } from "../i18n"
import { logError } from "../log"
import { getPlatformRuntime } from "../platform/runtime"
import { cachedPostThumbnail, readPostThumbnail } from "../post-thumbnail-cache"
import type { PawFile } from "../types"

export function PostThumbnail({ file, className }: { file: PawFile | undefined; className?: string }) {
  if (!file?.path)
    return <div className={`thumb thumb-fallback ${className || ""}`}>🖼️</div>
  const cacheOnly = getSettings().noImageMode
  return <ThumbnailImage key={`${file.path}:${cacheOnly}`} file={file} className={className} cacheOnly={cacheOnly} />
}

function ThumbnailImage({ file, className, cacheOnly }: { file: PawFile; className?: string; cacheOnly: boolean }) {
  const placeholder = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState(cacheOnly || getPlatformRuntime().descriptor.isNative ? "loading" : "thumb")
  const [cached, setCached] = useState("")
  const thumb = thumbUrl(file)
  const full = fileUrl(file)
  const classes = `thumb ${className || ""}`

  useEffect(() => {
    const element = placeholder.current
    if (!element) return
    let disposed = false
    let objectUrl = ""
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const width = element.parentElement?.clientWidth || 200
      const pixels = width * (window.devicePixelRatio || 1)
      const size = Math.min(512, Math.max(1, Math.ceil(pixels)))
      const request = cacheOnly ? readPostThumbnail(file.path, size) : cachedPostThumbnail(file.path, size)
      request.then((image) => {
        if (disposed) return
        if (!image) {
          setStage("failed")
          return
        }
        objectUrl = URL.createObjectURL(image)
        setCached(objectUrl)
        setStage("cached")
      }).catch(() => {
        if (!disposed) setStage(cacheOnly ? "failed" : "thumb")
      })
    }, { rootMargin: "160px" })
    observer.observe(element)
    return () => {
      disposed = true
      observer.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.path, cacheOnly])

  if (stage === "loading" || stage === "failed")
    return <div ref={stage === "loading" ? placeholder : undefined} className={`${classes} ${cacheOnly ? "thumb-noimage" : "thumb-fallback"}`}>
      🖼️{cacheOnly && ` (${t("common.dataSaving")})`}
    </div>

  return (
    <img
      className={classes}
      loading="lazy"
      decoding="async"
      src={stage === "cached" ? cached : stage === "thumb" ? thumb : full}
      alt={file.name || ""}
      onError={() => {
        if (stage === "full") logError(`サムネイル取得失敗 file=${file.path} thumb=${thumb}`)
        setStage(!cacheOnly && stage === "cached" ? "thumb" : !cacheOnly && stage === "thumb" && full ? "full" : "failed")
      }}
    />
  )
}
