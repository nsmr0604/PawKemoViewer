import { useCallback, useEffect, useState } from "react"
import { isFollowed, addFollow, removeFollow, loadFollows } from "../follows"
import { getCreatorRow } from "../db"
import { t } from "../i18n"
import { getPlatformRuntime } from "../platform/runtime"

export function FollowButton({ service, id }: { service: string; id: string }) {
  const [followed, setFollowed] = useState(() => isFollowed(service, id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const update = () => setFollowed(isFollowed(service, id))
    window.addEventListener("pawkemo-follows-changed", update)
    return () => window.removeEventListener("pawkemo-follows-changed", update)
  }, [service, id])

  // キャッシュ済みクリエイター名を補完 (フォローリスト表示用)
  useEffect(() => {
    let alive = true
    getCreatorRow(`${service}:${id}`).then((row) => {
      if (!alive || !row) return
      const list = loadFollows()
      const f = list.find((x) => x.service === service && x.id === id)
      if (f && f.name !== row.name && row.name) {
        f.name = row.name
        const storage = getPlatformRuntime().services.storage
        storage?.set("pawkemo-follows", JSON.stringify(list))
      }
    })
    return () => { alive = false }
  }, [service, id])

  const onToggle = useCallback(async () => {
    setBusy(true)
    setError("")
    try {
      let name = id
      const row = await getCreatorRow(`${service}:${id}`)
      if (row?.name) name = row.name
      if (isFollowed(service, id)) {
        await removeFollow(service, id)
        setFollowed(false)
      } else {
        await addFollow({ service, id, name })
        setFollowed(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [service, id])

  return (
    <span>
      <button
        className={`btn ${followed ? "btn-primary" : ""}`}
        disabled={busy}
        onClick={onToggle}
        title={error || (followed ? t("follow.unfollow") : t("follow.follow"))}
      >
        {busy ? t("follow.syncing") : followed ? t("follow.following") : t("follow.follow")}
      </button>
      {error && <span className="creator-sub">{error}</span>}
    </span>
  )
}

/** フォロー一覧の現在の数 */
export function followsCount() {
  return loadFollows().length
}
