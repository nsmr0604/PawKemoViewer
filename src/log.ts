// ---------------------------------------------------------------------------
// アプリ内ログ (リングバッファ)
//
// 参考: JHenTai (起動ごとの構造化ログ) / EhViewer (自己診断・ログダンプ)。
// API 失敗 (source chain: URL/ステータス/本文抜粋) も残し、初回ログイン POST
// 失敗などの切り分けに使う。設定 → 診断 から閲覧・書き出しできる。
// ---------------------------------------------------------------------------

import { DEBUG_DIAG, debugAppendLog } from "./debug"

export interface LogEntry {
  ts: number
  level: "info" | "warn" | "error"
  msg: string
}

const MAX_ENTRIES = 400
const MAX_MSG_LEN = 2000
/** 分割記録 (logLong) の 1 エントリあたりの文字数 */
const CHUNK_LEN = 1800

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
  if (msg.length > MAX_MSG_LEN) msg = msg.slice(0, MAX_MSG_LEN) + "…"
  const entry: LogEntry = { ts: Date.now(), level, msg }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  // PC 向けデバッグ: ログ行をファイル (app_data/logs/debug-app.log) へ常時追記する。
  // DEBUG_DIAG 定数はリリースビルドで false に畳まれ、呼び出しごと分離される
  debugAppendLog(formatEntry(entry))
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

/** 長文ログの分割記録 (デバッグ診断用)。
 *  backup JSON 全文や長いエラーレスポンスを失わずに
 *  リングバッファへ入れるため MAX_MSG_LEN ごとに分割する */
export function logLong(level: LogEntry["level"], msg: string) {
  if (msg.length <= CHUNK_LEN) {
    push(level, msg)
    return
  }
  const chunks = Math.ceil(msg.length / CHUNK_LEN)
  for (let i = 0; i < chunks; i++) {
    push(
      level,
      `[part ${i + 1}/${chunks}] ${msg.slice(i * CHUNK_LEN, (i + 1) * CHUNK_LEN)}`,
    )
  }
}

/** API リクエスト失敗の記録 (source chain)。
 *  DEBUG_DIAG ビルドでは本文/URL 全文を失わずに記録する */
export function logApiFailure(path: string, method: string, message: string) {
  if (DEBUG_DIAG) {
    push("error", `API失敗 ${method} ${path} (詳細下記)`)
    logLong("error", message)
  } else {
    push("error", `API失敗 ${method} ${path} → ${message}`)
  }
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
