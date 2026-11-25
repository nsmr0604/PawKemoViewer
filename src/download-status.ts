/** 一括保存の進捗を、どの画面からでも見られるようにする小さなストア */

export type DownloadPhase = "idle" | "running" | "done" | "error"

export interface DownloadStatus {
  phase: DownloadPhase
  done: number
  total: number
  saved: number
  failed: number
  message: string
  updatedAt: number
}

const initial: DownloadStatus = {
  phase: "idle",
  done: 0,
  total: 0,
  saved: 0,
  failed: 0,
  message: "",
  updatedAt: 0,
}

let status: DownloadStatus = initial
const listeners = new Set<() => void>()

export function getDownloadStatus(): DownloadStatus {
  return status
}

export function subscribeDownloadStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function update(patch: Partial<DownloadStatus>) {
  status = { ...status, ...patch, updatedAt: Date.now() }
  for (const listener of [...listeners]) listener()
}

/** 保存を開始した */
export function startDownload(total: number) {
  update({ phase: "running", done: 0, total, saved: 0, failed: 0, message: "" })
}

/** 進捗 (Rust の download-progress イベント) */
export function reportDownloadProgress(done: number, total: number) {
  if (status.phase !== "running") return
  update({ done, total })
}

/** 保存が終わった (中止を含む) */
export function finishDownload(options: {
  saved: number
  failed: number
  message: string
  cancelled?: boolean
}) {
  const { saved, failed, message, cancelled } = options
  update({
    phase: cancelled || failed === 0 ? "done" : "error",
    saved,
    failed,
    message,
    done: status.total,
  })
}

/** 保存を開始できなかった */
export function failDownload(message: string) {
  update({ phase: "error", message })
}

/** 表示を初期状態に戻す */
export function resetDownloadStatus() {
  update({ ...initial, updatedAt: Date.now() })
}
