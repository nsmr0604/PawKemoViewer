// 簡易ハッシュルータ
import { useEffect, useState, useCallback } from "react"

export interface Route {
  path: string
  params: Record<string, string>
  query: URLSearchParams
}

export function parseHash(): Route {
  const h = location.hash.replace(/^#/, "") || "/"
  const [pathPart, queryPart] = h.split("?")
  const query = new URLSearchParams(queryPart || "")
  const segs = pathPart.split("/").filter(Boolean)
  const params: Record<string, string> = {}
  let path: string
  if (segs[0] === "creator" && segs.length >= 3) {
    path = "creator"
    params.service = segs[1]
    params.id = segs[2]
  } else if (segs[0] === "post") {
    // 投稿URLは /post/{service}/{creatorId}/{postId} の4要素を厳密に要求する。
    // 不完全なURLを PostPage に渡すと /undefined/user/undefined/post/... を生成する。
    const [service, creatorId, postId] = segs.slice(1)
    const validService = service === "fanbox" || service === "patreon"
    const validIds = [creatorId, postId].every(
      (value) => !!value && value !== "undefined" && value !== "null",
    )
    if (segs.length === 4 && validService && validIds) {
      path = "post"
      params.service = service
      params.creator = creatorId
      params.id = postId
    } else {
      path = "invalid-post"
    }
  } else {
    path = segs[0] || "home"
  }
  // query は route キーに含めない (path のみ)
  return { path, params, query }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return route
}

export function navigate(to: string, replace = false) {
  const url = `#${to}`
  if (replace) location.replace(url)
  else location.hash = to
}

export function useNavigate() {
  return useCallback(navigate, [])
}
