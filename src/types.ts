// Pawchive API の型定義 (https://pawchive.pw/api/schema より + 実測)

export type Service = "patreon" | "fanbox"

export interface PawFile {
  name: string
  path: string
  server?: string
  /** 実測: 動画など大容量ファイルは署名付き一時 URL で配信される */
  deferred?: boolean
  temp_url?: string
  temp_download_url?: string
  temp_expires?: string
}

export interface PawEmbed {
  [key: string]: unknown
}

export interface PawPost {
  id: string
  user: string
  service: string
  title: string
  content: string
  embed: PawEmbed
  shared_file: boolean
  added: string
  published: string
  edited: string
  file: PawFile
  attachments: PawFile[]
  next?: string | null
  prev?: string | null
}

export interface PawRevision extends PawPost {
  revision_id: number
}

export interface PawCreator {
  favorited?: number
  id: string
  indexed: number | string
  name: string
  /** URL slug (fanbox: tateha 等) */
  public_id?: string
  service: string
  updated: number | string
}

export interface PawTag {
  tag: string
  post_count: number
}

export interface PawAnnouncement {
  service: string
  user_id: string
  hash: string
  content: string
  added: string
}

export interface PawComment {
  id: string
  parent_id: string | null
  commenter: string
  /** 実測: 一覧 API は表示名を commenter_name で返す */
  commenter_name?: string
  content: string
  published: string
  revisions: { id: number; content: string; added: string }[]
}

export interface HashLookupResult {
  id: number
  hash: string
  mime: string
  ext: string
  size: number
  added: string
  posts: {
    file_id: number
    id: string
    user: string
    service: string
    title: string
    substring: string
    published: string
    file: PawFile
    attachments: PawFile[]
  }[]
  discord_posts: unknown[]
}

export interface AccountFavorite {
  faved_seq?: number
  id: string
  indexed?: string
  last_imported?: string
  name?: string
  service?: string
  updated?: string
}
