// ---------------------------------------------------------------------------
// アプリ内ログ (リングバッファ)
//
// 参考: JHenTai (起動ごとの構造化ログ) / EhViewer (自己診断・ログダンプ)。
// API 失敗 (source chain: URL/ステータス/本文抜粋) も残し、初回ログイン POST
// 失敗などの切り分けに使う。設定 → 診断 から閲覧・書き出しできる。
// ---------------------------------------------------------------------------

export interface LogEntry {
  ts: number
  level: "info" | "warn" | "error"
  msg: string
}

const MAX_ENTRIES = 400
const MAX_MSG_LEN = 2000

const entries: LogEntry[] = []

export function logInfo(msg: string) {
  push("info", msg)
}

export function logWarn(msg: string) {
  push("warn", msg)
}

export function logError(msg: string) {
  push("error", msg)
}

function push(level: LogEntry["level"], msg: string) {
  if (msg.length > MAX_MSG_LEN) msg = msg.slice(0, MAX_MSG_LEN) + "…"
  entries.push({ ts: Date.now(), level, msg })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
}

/** API リクエスト失敗の記録 (source chain) */
export function logApiFailure(path: string, method: string, message: string) {
  push("error", `API失敗 ${method} ${path} → ${message}`)
}

/** 古い順の全エントリ */
export function getLogEntries(): LogEntry[] {
  return [...entries]
}

export function clearLog() {
  entries.length = 0
}

/** ログをテキスト化 (書き出し・表示用) */
export function formatLog(): string {
  return entries
    .map((e) => {
      const d = new Date(e.ts)
      const t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes(),
      ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
      return `[${t}] [${e.level}] ${e.msg}`
    })
    .join("\n")
}

// グローバルエラーの自動キャプチャ
if (typeof window !== "undefined") {
  window.addEventListener("error", (ev) => {
    push("error", `uncaught: ${ev.message}${ev.filename ? ` (${ev.filename}:${ev.lineno})` : ""}`)
  })
  window.addEventListener("unhandledrejection", (ev) => {
    const r = (ev as PromiseRejectionEvent).reason
    push("error", `unhandled rejection: ${r instanceof Error ? r.message : String(r)}`)
  })
}
