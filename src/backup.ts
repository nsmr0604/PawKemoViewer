// フォロー・既読・設定のローカルバックアップ
// (EhViewer「お気に入りリストをバックアップ / データをエクスポート・インポート」相当)
//
// - 書き出し: Rust (export_file) で %APPDATA%/backup/ に JSON 保存 +
//   クリップボードにもコピー (ファイルが見つからないときの貼り付け用)
// - 読み込み: クリップボード or 貼り付けテキストから JSON を復元
//
// 注意: セッションキーは復元完結性のため含める (端末ローカルの JSON のみ)。
// ログや notes には絶対に出力しないこと。

import { getSettings, updateSettings, type Settings } from "./api"
import { loadFollows, replaceFollows, type FollowEntry } from "./follows"
import { replaceSeen, getAllSeen, type SeenEntry } from "./db"
import { getPlatformRuntime } from "./platform/runtime"

export const BACKUP_TYPE = "pawkemoviewer-backup"
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
export async function buildBackup(): Promise<string> {
  const data: BackupData = {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    follows: loadFollows(),
    seen: await getAllSeen(),
  }
  return JSON.stringify(data, null, 2)
}

/** バックアップをファイルに書き出し (Rust 側で %APPDATA%/backup/) */
export async function exportBackup(): Promise<import("./platform/contracts").FileExportResult> {
  const files = getPlatformRuntime().services.files
  if (!files) throw new Error("File export service unavailable")
  return files.exportText("pawkemoviewer-backup.json", await buildBackup())
}

/** バックアップ JSON を検証してパースする */
export function parseBackup(text: string): BackupData {
  if (typeof text !== "string" || text.length > 5 * 1024 * 1024) throw new Error("バックアップファイルが大きすぎます")
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    throw new Error("JSON として解釈できません")
  }
  const b = j as Partial<BackupData>
  if (!b || b.type !== BACKUP_TYPE) {
    throw new Error("PawKemoViewer のバックアップファイルではありません")
  }
  const version = typeof b.version === "number" ? b.version : 1
  if (!Number.isInteger(version) || version < 1 || version > BACKUP_VERSION) {
    throw new Error("未対応のバックアップバージョンです")
  }
  if (b.follows && !Array.isArray(b.follows)) throw new Error("フォロー情報の形式が不正です")
  if (Array.isArray(b.follows) && b.follows.length > 100000) throw new Error("フォロー情報が多すぎます")
  if (b.seen && !Array.isArray(b.seen)) throw new Error("既読情報の形式が不正です")
  if (Array.isArray(b.seen) && b.seen.length > 100000) throw new Error("既読情報が多すぎます")
  if (b.settings && (typeof b.settings !== "object" || Array.isArray(b.settings))) throw new Error("設定情報の形式が不正です")
  return {
    type: BACKUP_TYPE,
    version,
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
  const followsByKey = new Map<string, FollowEntry>()
  for (const f of b.follows) {
    if (!f || (f.service !== "fanbox" && f.service !== "patreon") || typeof f.id !== "string" || !f.id.trim() || f.id.length > 256) continue
    const entry: FollowEntry = { service: f.service, id: f.id.trim(), name: typeof f.name === "string" && f.name.trim() ? f.name.trim().slice(0, 512) : f.id.trim() }
    followsByKey.set(`${entry.service}:${entry.id}`, entry)
  }
  const follows = [...followsByKey.values()]
  // 既読状態の置換を先に完了させる。IndexedDB が失敗した場合はフォローを
  // 変更せず、復元途中の不整合を最小限にする。

  // 既読状態はバックアップ内容で一括置換し、途中失敗で部分復元しない
  const seenByKey = new Map<string, SeenEntry>()
  for (const s of b.seen) {
    if (!s || typeof s.key !== "string" || !/^(fanbox|patreon):[^:]+$/.test(s.key)) continue
    const [service, id] = s.key.split(":")
    if (!id || id.length > 256) continue
    const key = `${service}:${id}`
    seenByKey.set(key, {
      key,
      lastSeenPostId: typeof s.lastSeenPostId === "string" ? s.lastSeenPostId.slice(0, 256) : "",
      checkedAt: typeof s.checkedAt === "number" && Number.isFinite(s.checkedAt) && s.checkedAt >= 0 ? s.checkedAt : Date.now(),
      ...(s.newest && typeof s.newest === "object" && typeof s.newest.id === "string" && s.newest.id.length > 0 && s.newest.id.length <= 256 ? {
        newest: {
          id: s.newest.id,
          ...(typeof s.newest.title === "string" ? { title: s.newest.title.slice(0, 1024) } : {}),
          ...(typeof s.newest.published === "string" ? { published: s.newest.published.slice(0, 128) } : {}),
        },
      } : {}),
    })
  }
  const seenEntries: SeenEntry[] = [...seenByKey.values()]
  await replaceSeen(seenEntries)
  const seen = seenEntries.length
  // IndexedDB の復元が成功した後でフォローを更新する。
  replaceFollows(follows)

  // 設定 (sessionKey も含めて復元。ただし空文字は無視して既存を維持)
  const cur = getSettings()
  const patch: Partial<Settings> = {}
  const validators: Partial<Record<keyof Settings, (value: unknown) => boolean>> = {
    sessionKey: (v) => typeof v === "string" && v.length <= 8192,
    theme: (v) => v === "dark" || v === "light",
    layoutMode: (v) => v === "auto" || v === "desktop" || v === "mobile",
    noImageMode: (v) => typeof v === "boolean",
    postViewMode: (v) => v === "grid" || v === "list",
    timeoutSecs: (v) => typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 300,
    proxyImages: (v) => typeof v === "boolean",
    postFileListMode: (v) => typeof v === "boolean",
    excludeFanboxCover: (v) => typeof v === "boolean",
    excludeAiPosts: (v) => typeof v === "boolean",
    developerToolsEnabled: (v) => typeof v === "boolean",
    locale: (v) => typeof v === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(v),
  }
  for (const [k, v] of Object.entries(b.settings || {})) {
    if (v === undefined || v === null || (k === "sessionKey" && !v)) continue
    const validator = validators[k as keyof Settings]
    if (validator?.(v)) (patch as Record<string, unknown>)[k] = v
  }
  updateSettings(patch)

  return { follows: follows.length, seen, settings: Object.keys(patch).length > 0 }
}
