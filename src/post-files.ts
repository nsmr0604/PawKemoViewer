import type { PawFile, PawPost } from "./types"

/** FANBOX の作品カバー画像 (cover.jpeg) か。ファイル名・パス末尾で判定する */
export function isFanboxCoverFile(f: PawFile): boolean {
  const name = String(f.name || "").trim().toLowerCase()
  const pathName = String(f.path || "").split(/[\\/?#]/).pop()?.toLowerCase() || ""
  return name === "cover.jpeg" || pathName === "cover.jpeg"
}

/** 投稿の表示対象ファイル (本体 → 添付の順)。
 *  一覧カードのサムネイル・枚数は cover.jpeg を含めて常に表示する。
 *  cover.jpeg の除外は投稿詳細 (PostPage) 側の設定だけで行う。 */
export function listPostFiles(post: PawPost): PawFile[] {
  return [...(post.file?.path ? [post.file] : []), ...(post.attachments || [])]
}
