import { invoke } from "@tauri-apps/api/core"

/** 開発項目がユーザー操作で有効になった場合に使うログファイル操作。
 * Tauri側コマンドは製品版にも登録され、設定で開発項目を表示した場合に利用する。 */
export function debugAppendLog(line: string): void {
  invoke("debug_append_log", { text: line }).catch(() => {
    /* ファイルログ失敗は無視 (リングバッファと UI 表示は生きている) */
  })
}

/** ログフォルダ (app_data/logs) を OS のファイラで開く (PC 向け) */
export async function debugOpenLogFolder(): Promise<string> {
  return invoke<string>("debug_open_log_folder")
}

