import { useState } from "react"
import { t } from "../i18n"
import { privacyUrl, termsUrl } from "../legal"
import { BrowserLink } from "./BrowserLink"

/**
 * 初回起動時の 18 歳以上確認。
 * 端末内の設定に保存し、バックアップからの復元では引き継がない。
 */
export function AgeGate({ onAccept }: { onAccept: () => void }) {
  const [declined, setDeclined] = useState(false)

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className="age-gate-card">
        <h1 id="age-gate-title">{t("age.title")}</h1>
        <p>{t("age.body")}</p>
        <p className="small">{t("legal.unofficial")}</p>
        <div className="age-gate-links">
          <BrowserLink href={termsUrl()}>{t("legal.terms")}</BrowserLink>
          <BrowserLink href={privacyUrl()}>{t("legal.privacy")}</BrowserLink>
        </div>
        {declined && (
          <p className="age-gate-declined" role="alert">
            {t("age.declined")}
          </p>
        )}
        <div className="settings-actions">
          <button className="btn btn-primary" type="button" onClick={onAccept}>
            {t("age.accept")}
          </button>
          <button className="btn" type="button" onClick={() => setDeclined(true)}>
            {t("age.decline")}
          </button>
        </div>
      </div>
    </div>
  )
}
