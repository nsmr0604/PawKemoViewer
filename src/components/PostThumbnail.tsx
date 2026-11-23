import { useEffect, useState } from "react"
import { fileUrl, getSettings, thumbUrl } from "../api"
import { t } from "../i18n"
import { logError } from "../log"
import type { PawFile } from "../types"

export function PostThumbnail({ file, className }: { file: PawFile | undefined; className?: string }) {
  // 0=thumb, 1=full, 2=giveup
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  const noImage = getSettings().noImageMode

  useEffect(() => setStage(0), [file?.path])
  if (!file?.path || stage === 2)
    return <div className={`thumb thumb-fallback ${className || ""}`}>🖼️</div>
  if (noImage)
    return <div className={`thumb thumb-noimage ${className || ""}`}>🖼️ ({t("common.dataSaving")})</div>

  const thumb = thumbUrl(file)
  const full = fileUrl(file)
  const src = stage === 0 ? thumb : full

  return (
    <img
      className={`thumb ${className || ""}`}
      loading="lazy"
      decoding="async"
      src={src}
      alt={file.name || ""}
      onError={() => {
        setStage((s) => {
          if (s === 1) logError(`サムネイル取得失敗 file=${file?.path || ""} thumb=${thumb}`)
          return s === 0 ? 1 : 2
        })
      }}
    />
  )
}
