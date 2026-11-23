import { invoke } from "@tauri-apps/api/core"

/** Full 開発診断専用のログファイル操作。製品版には関連 Tauri コマンドを含めない。 */
export function debugAppendLog(line: string): void {
  invoke("debug_append_log", { text: line }).catch(() => {
    /* ファイルログ失敗は無視 (リングバッファと UI 表示は生きている) */
  })
}

/** ログフォルダ (app_data/logs) を OS のファイラで開く (PC 向け) */
export async function debugOpenLogFolder(): Promise<string> {
  return invoke<string>("debug_open_log_folder")
}

