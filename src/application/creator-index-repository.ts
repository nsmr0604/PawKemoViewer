export interface CreatorRow {
  key: string // "service:id"
  id: string
  service: string
  name: string
  nameLower: string
  /** URL slug (fanbox: tateha 等)。索引 v1 には存在しない (再構築で付与) */
  publicId?: string
  publicIdLower?: string
  /** お気に入り数 (人気度順) */
  favorited?: number
  /** 最終更新日時 (API の updated) */
  updated?: number
  /** インデックス日時 */
  indexed?: number
}

export interface CreatorIndexRepository {
  count(): Promise<number>
  isCurrent(): Promise<boolean>
  search(query: string, limit: number): Promise<{ rows: CreatorRow[]; service?: string; postId?: string }>
  legacyRows(): Promise<CreatorRow[]>
  fetchRows(): Promise<CreatorRow[]>
  save(rows: CreatorRow[]): Promise<void>
  resetIndex(): void
  clearApiCache(): void
}
