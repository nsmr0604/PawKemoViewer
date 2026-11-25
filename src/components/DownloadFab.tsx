import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { t as tr } from "../i18n"
import { cancelImageDownload } from "../post-download"
import {
  getDownloadStatus,
  resetDownloadStatus,
  subscribeDownloadStatus,
} from "../download-status"

const IDLE_RESET_MS = 20_000

/** 常時表示する保存ボタン (右下)。実行中は件数を表示する。 */
export function DownloadFab() {
  const status = useSyncExternalStore(
    subscribeDownloadStatus,
    getDownloadStatus,
    getDownloadStatus,
  )
  const [open, setOpen] = useState(false)

  // 完了・失敗の表示はしばらく残してから消す
  useEffect(() => {
    if (status.phase !== "done" && status.phase !== "error") return
    const updatedAt = status.updatedAt
    const timer = setTimeout(() => {
      if (getDownloadStatus().updatedAt === updatedAt) resetDownloadStatus()
    }, IDLE_RESET_MS)
    return () => clearTimeout(timer)
  }, [status.phase, status.updatedAt])

  const running = status.phase === "running"
  const title = running
    ? tr("download.fabRunning", { done: status.done, total: status.total || "…" })
    : status.phase === "error"
      ? tr("download.fabError", { failed: status.failed })
      : status.phase === "done"
        ? tr("download.fabDone", { saved: status.saved })
        : tr("download.fabTitle")

  return createPortal(
    <div className="download-fab-root">
      {open && (
        <div className="download-fab-panel" role="status">
          <p className="download-fab-heading">{title}</p>
          {running && (
            <p className="small">{tr("download.fabRunningHint")}</p>
          )}
          {status.message && <p className="small download-fab-message">{status.message}</p>}
          {status.phase === "idle" && !status.message && (
            <p className="small">{tr("download.fabIdle")}</p>
          )}
          <div className="download-fab-actions">
            {running && (
              <button className="btn btn-sm" onClick={() => void cancelImageDownload()}>
                {tr("post.downloadCancel")}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              {tr("common.close")}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className={`download-fab ${status.phase}`}
        aria-label={title}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {running ? (
          <span className="download-fab-count">
            {status.done}
            <small>/{status.total || "?"}</small>
          </span>
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M4 21h16" />
          </svg>
        )}
        {status.phase === "done" && <span className="download-fab-badge ok">✓</span>}
        {status.phase === "error" && <span className="download-fab-badge err">{status.failed}</span>}
      </button>
    </div>,
    document.body,
  )
}
