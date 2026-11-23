import { useEffect, useState } from "react"
import { creatorBannerUrl } from "../api"
import { getApplication } from "../application/composition"
import { formatDate } from "../format-date"
import { t } from "../i18n"
import { logError } from "../log"
import type { PawCreator } from "../types"
import { CreatorAvatar } from "./CreatorAvatar"
import { Spinner } from "./Feedback"

export function CreatorHeader({ service, id }: { service: string; id: string }) {
  const [profile, setProfile] = useState<PawCreator | null>(null)
  const [error, setError] = useState<unknown>(null)
  // バナーは存在しない場合 204 が返るので、読み込み失敗時はフォールバック表示
  // (アイコンは CreatorAvatar がキャッシュ付きで処理)
  const [bannerOk, setBannerOk] = useState(true)
  useEffect(() => {
    let alive = true
    setProfile(null)
    setBannerOk(true)
    getApplication().loadCreatorProfile(service, id)
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [service, id])
  if (error)
    return (
      <div className="creator-head error-box">
        <p>{t("creators.profileError")}</p>
      </div>
    )
  if (!profile) return <Spinner label={t("creators.profileLoading")} />
  return (
    <div className="creator-head creator-head-col">
      {bannerOk && (
        <img
          className="creator-banner"
          src={creatorBannerUrl(service, id)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            logError(`クリエイターバナー取得失敗 service=${service} id=${id} url=${creatorBannerUrl(service, id)}`)
            setBannerOk(false)
          }}
        />
      )}
      <div className="creator-head-row">
        {/* アイコンはキャッシュ (icons.ts + Rust ディスクキャッシュ) から表示 */}
        <CreatorAvatar service={service} id={id} name={profile.name} className="big" />
        <div>
          <h2>{profile.name}</h2>
          <div className="creator-sub">
            {service} · {id} · {t("creators.lastUpdated")} {formatDate(String(profile.updated))}
          </div>
        </div>
      </div>
    </div>
  )
}
