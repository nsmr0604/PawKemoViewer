import type { CreatorRow } from "../db"

/** Wire fields consumed from GET /creators. Older records can omit timestamps. */
export interface CreatorIndexDto {
  service: string
  id: string
  name: string
  public_id?: string
  favorited?: number
  updated?: number | string
  indexed?: number | string
}

/** API の日時値 (Unix 秒/ミリ秒または ISO 文字列) を比較用数値へ変換 */
function toTimestamp(value: number | string | undefined): number {
  if (value === undefined || value === "") return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

/** API レスポンス → 索引行 (slug / 人気度 / 更新日を保持) */
function toRow(c: CreatorIndexDto): CreatorRow {
  const slug = (c.public_id || "").toLowerCase()
  return {
    key: `${c.service}:${c.id}`,
    id: c.id,
    service: c.service,
    name: c.name,
    nameLower: (c.name || "").toLowerCase(),
    ...(slug ? { publicId: c.public_id, publicIdLower: slug } : {}),
    ...(c.favorited !== undefined ? { favorited: Number(c.favorited) || 0 } : {}),
    ...(c.updated !== undefined ? { updated: toTimestamp(c.updated) } : {}),
    ...(c.indexed !== undefined ? { indexed: toTimestamp(c.indexed) } : {}),
  }
}

export function toCreatorIndexRows(creators: CreatorIndexDto[]): CreatorRow[] {
  return creators.map(toRow)
}
