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
  } else if (segs[0] === "post" && segs.length >= 4) {
    path = "post"
    params.service = segs[1]
    params.creator = segs[2]
    params.id = segs[3]
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
