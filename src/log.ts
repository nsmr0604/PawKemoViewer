// ---------------------------------------------------------------------------
// アプリ内ログ (リングバッファ)
//
// 参考: JHenTai (起動ごとの構造化ログ) / EhViewer (自己診断・ログダンプ)。
// 製品版は基本情報、デバッグ版は詳細レスポンスも記録し、初回ログイン POST
// 失敗などの切り分けに使う。設定 → 診断 から閲覧・書き出しできる。
// ---------------------------------------------------------------------------

import { DEBUG_DIAG } from "./buildFlags"

export interface LogEntry {
  ts: number
  level: "info" | "warn" | "error"
  msg: string
}

const MAX_ENTRIES = 400
const MAX_MSG_LEN = 2000

const entries: LogEntry[] = []

if (DEBUG_DIAG) {
  push("info", "debug 診断フラグ有効 (VITE_DEBUG_DIAG=1・ビルド時注入)")
}

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
  // Lite はエラーのみ保持する。info / warn は Full 専用。
  if (!DEBUG_DIAG && level !== "error") return
  if (msg.length > MAX_MSG_LEN) msg = msg.slice(0, MAX_MSG_LEN) + "…"
  const entry: LogEntry = { ts: Date.now(), level, msg }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  // 詳細ファイルログはFull 開発診断を含むデバッグビルドだけでロードする。
  if (DEBUG_DIAG) {
    void import("./debug").then(({ debugAppendLog }) => debugAppendLog(formatEntry(entry)))
  }
}

/** 1 エントリをテキスト化 (ファイルログ・書き出し共通の書式) */
function formatEntry(e: LogEntry): string {
  const d = new Date(e.ts)
  const t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
  return `[${t}] [${e.level}] ${e.msg}`
}

/** API リクエスト失敗の記録 (source chain)。
 *  Full 開発診断を含むデバッグビルドでは詳細情報も記録する */
export function logApiFailure(path: string, method: string, message: string) {
  if (DEBUG_DIAG) {
    push("error", `API失敗 ${method} ${path} (詳細下記)`)
    void import("./debug-log").then(({ splitDebugLog }) => {
      for (const part of splitDebugLog(message)) push("error", part)
    })
    return
  }

  // Lite は API の宛先とレスポンス本文だけを保持する。
  const body = message.match(/BODY=([\s\S]*)/)?.[1]
  const destination = `https://pawchive.pw/api/v1/${path.replace(/^\//, "")}`
  push("error", body !== undefined ? `API_ERROR destination=${destination} body=${body}` : `API_ERROR destination=${destination}`)
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
  return entries.map(formatEntry).join("\n")
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
