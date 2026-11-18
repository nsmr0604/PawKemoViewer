// フォロー・既読・設定のローカルバックアップ
// (EhViewer「お気に入りリストをバックアップ / データをエクスポート・インポート」相当)
//
// - 書き出し: Rust (export_file) で %APPDATA%/backup/ に JSON 保存 +
//   クリップボードにもコピー (ファイルが見つからないときの貼り付け用)
// - 読み込み: クリップボード or 貼り付けテキストから JSON を復元
//
// 注意: セッションキーは復元完結性のため含める (端末ローカルの JSON のみ)。
// ログや notes には絶対に出力しないこと。

import { invoke } from "@tauri-apps/api/core"
import { getSettings, updateSettings, type Settings } from "./api"
import { loadFollows, replaceFollows, type FollowEntry } from "./follows"
import { setSeen, type SeenEntry } from "./db"

export const BACKUP_TYPE = "pawchive-backup"
const BACKUP_VERSION = 1

export interface BackupData {
  type: string
  version: number
  exportedAt: string
  settings: Settings
  follows: FollowEntry[]
  seen: SeenEntry[]
}

/** 現在の状態をバックアップ JSON 文字列にする */
export function buildBackup(): string {
  const data: BackupData = {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    follows: loadFollows(),
    seen: [],
  }
  return JSON.stringify(data, null, 2)
}

/** バックアップをファイルに書き出し (Rust 側で %APPDATA%/backup/) */
export async function exportBackup(): Promise<string> {
  const path = await invoke<string>("export_file", {
    fileName: "pawchive-backup.json",
    text: buildBackup(),
  })
  return path
}

/** バックアップ JSON を検証してパースする */
export function parseBackup(text: string): BackupData {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    throw new Error("JSON として解釈できません")
  }
  const b = j as Partial<BackupData>
  if (!b || b.type !== BACKUP_TYPE) {
    throw new Error("PawKemoViewer (旧 Pawchive Viewer) のバックアップファイルではありません")
  }
  return {
    type: BACKUP_TYPE,
    version: typeof b.version === "number" ? b.version : 1,
    exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
    settings: (b.settings || {}) as Settings,
    follows: Array.isArray(b.follows) ? (b.follows as FollowEntry[]) : [],
    seen: Array.isArray(b.seen) ? (b.seen as SeenEntry[]) : [],
  }
}

/** バックアップを適用 (follows / seen / settings を上書き)。
 *  成功すると適用件数を返す */
export async function applyBackup(text: string): Promise<{
  follows: number
  seen: number
  settings: boolean
}> {
  const b = parseBackup(text)

  // フォロー (先に妥当性フィルタ)
  const follows = b.follows.filter(
    (f) => f && typeof f.service === "string" && typeof f.id === "string",
  )
  replaceFollows(follows)

  // 既読状態
  let seen = 0
  for (const s of b.seen) {
    if (!s || typeof s.key !== "string") continue
    await setSeen(
      s.key,
      typeof s.lastSeenPostId === "string" ? s.lastSeenPostId : "",
      s.newest,
    )
    seen++
  }

  // 設定 (sessionKey も含めて復元。ただし空文字は無視して既存を維持)
  const cur = getSettings()
  const patch: Partial<Settings> = {}
  for (const [k, v] of Object.entries(b.settings || {})) {
    if (v === undefined || v === null) continue
    if (k === "sessionKey" && !(v as string)) continue
    if (k in cur) (patch as Record<string, unknown>)[k] = v
  }
  updateSettings(patch)

  return { follows: follows.length, seen, settings: Object.keys(patch).length > 0 }
}
